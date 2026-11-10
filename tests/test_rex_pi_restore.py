import contextlib
import fcntl
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HELPER = Path(__file__).resolve().parents[1] / "bin/rex-restore-pi"
loader = importlib.machinery.SourceFileLoader("rex_restore_pi", str(HELPER))
spec = importlib.util.spec_from_loader(loader.name, loader)
restore = importlib.util.module_from_spec(spec)
loader.exec_module(restore)


class TtyOutput(io.StringIO):
    def isatty(self):
        return True


class RestoreTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="rex-pi-restore-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.env = {"HOME": str(self.root), "XDG_STATE_HOME": str(self.root / "state"),
                    "REX_SESSION": "session:test", "REX_BLOCK": "block:test",
                    "REX_SERVER": "unix:///tmp/test rex.sock"}
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, self.env, clear=True).start()
        patch.object(restore.sys.stdin, "isatty", return_value=True).start()
        self.which = patch.object(restore.shutil, "which", side_effect=lambda name: "/fake/" + name).start()
        self.run = patch.object(restore.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, '{"instance_id":"new-server","session_id":"session:test","block_id":"block:test"}', "")).start()
        self.call = patch.object(restore.subprocess, "call", return_value=0).start()
        self.alive = patch.object(restore, "alive", return_value=False).start()
        self.session = self.root / "Pi sessions; literal $name.jsonl"
        self.session.write_text('{"type":"session","id":"test"}\n')
        self.record = {"version": 1, "rexSession": "session:test", "rexBlock": "block:test",
                       "serverInstance": "old-server", "piPid": 424242,
                       "piSessionFile": str(self.session), "cwd": str(self.root)}
        self.path = restore.marker_path()
        self.path.parent.mkdir(parents=True, mode=0o700)
        self.write()

    def write(self):
        self.path.write_text(json.dumps(self.record))
        self.path.chmod(0o600)

    def invoke(self, **kwargs):
        with contextlib.redirect_stdout(TtyOutput()) as output:
            result = restore.restore(**kwargs)
        return result, output.getvalue()

    def test_restores_exact_session_at_idle_only_after_server_changed(self):
        result, output = self.invoke()
        self.assertEqual(result, 0)
        self.assertIn("Resuming", output)
        self.call.assert_called_once_with(["/fake/pi", "--session", str(self.session)], cwd=str(self.root))
        args = self.run.call_args.args[0]
        self.assertEqual(args, ["/fake/rex", "--autostart=false", "--server", self.env["REX_SERVER"], "whoami", "--json"])
        self.assertNotIn("--continue", self.call.call_args.args[0])

    def test_same_server_never_relaunches_pi(self):
        self.run.return_value.stdout = '{"instance_id":"old-server","session_id":"session:test","block_id":"block:test"}'
        self.invoke()
        self.call.assert_not_called()

    def test_live_original_process_prevents_a_duplicate(self):
        self.alive.return_value = True
        self.invoke()
        self.call.assert_not_called()

    def test_check_is_readonly_and_does_not_launch(self):
        _, output = self.invoke(check=True)
        self.assertIn(str(self.session), output)
        self.assertIn("would be resumed", output)
        self.call.assert_not_called()
        self.assertFalse(Path(str(self.path) + ".lock").exists())

    def test_disabled_noninteractive_and_unregistered_panes_are_noops(self):
        os.environ["REX_PI_RESTORE"] = "0"
        self.invoke()
        del os.environ["REX_PI_RESTORE"]
        with patch.object(restore.sys.stdin, "isatty", return_value=False):
            self.invoke()
        self.path.unlink()
        self.invoke()
        self.run.assert_not_called()
        self.call.assert_not_called()

    def test_missing_rex_context_is_a_noop(self):
        del os.environ["REX_BLOCK"]
        self.invoke()
        self.run.assert_not_called()

    def test_wrong_pane_and_unknown_schema_are_rejected(self):
        for field, value in [("rexBlock", "block:other"), ("version", 2), ("piPid", -1), ("piPid", True)]:
            with self.subTest(field=field, value=value):
                original = self.record[field]
                self.record[field] = value
                self.write()
                with self.assertRaises(ValueError):
                    self.invoke()
                self.record[field] = original
        self.call.assert_not_called()

    def test_missing_session_or_working_directory_never_creates_a_new_session(self):
        self.session.unlink()
        with self.assertRaisesRegex(ValueError, "no longer available"):
            self.invoke()
        self.call.assert_not_called()

    def test_non_session_file_is_rejected(self):
        self.session.write_text('{"type":"message"}\n')
        with self.assertRaisesRegex(ValueError, "not a Pi session"):
            self.invoke()
        self.call.assert_not_called()

    def test_shared_writable_or_symlinked_records_are_rejected(self):
        self.path.chmod(0o666)
        with self.assertRaisesRegex(ValueError, "not writable"):
            self.invoke()
        self.path.unlink()
        target = self.root / "foreign.json"
        target.write_text(json.dumps(self.record))
        self.path.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "symlinked"):
            self.invoke()
        self.call.assert_not_called()

    def test_concurrent_hook_cannot_acquire_the_same_pane_lock(self):
        with open(str(self.path) + ".lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.invoke()
        self.call.assert_not_called()

    def test_marker_replaced_during_startup_does_not_resume_a_stale_session(self):
        changed = {**self.record, "piPid": 9999}
        with patch.object(restore, "read_marker", side_effect=[self.record, changed]):
            self.invoke()
        self.call.assert_not_called()

    def test_missing_or_unreachable_rex_does_not_fall_back_to_another_server(self):
        self.which.side_effect = lambda name: None
        with self.assertRaisesRegex(ValueError, "rex is not on PATH"):
            self.invoke()
        self.which.side_effect = lambda name: "/fake/" + name
        self.run.side_effect = subprocess.CalledProcessError(4, "rex")
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke()
        self.call.assert_not_called()

    def test_a_server_that_does_not_own_this_pane_is_rejected(self):
        self.run.return_value.stdout = '{"instance_id":"another-server"}'
        with self.assertRaisesRegex(ValueError, "did not confirm this pane"):
            self.invoke()
        self.call.assert_not_called()

    def test_missing_server_identity_is_not_treated_as_a_restart(self):
        for response, error in [('{}', 'instance ID'), ('[]', 'invalid server identity')]:
            self.run.return_value.stdout = response
            with self.assertRaisesRegex(ValueError, error):
                self.invoke()
        self.call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
