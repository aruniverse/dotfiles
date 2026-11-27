import contextlib
import importlib.machinery
import importlib.util
import io
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader("vorssaint_settings", str(ROOT / "bin/vorssaint-settings"))
spec = importlib.util.spec_from_loader(loader.name, loader)
settings = importlib.util.module_from_spec(spec)
loader.exec_module(settings)


class VorssaintSettingsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="vorssaint-settings-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.config = self.root / "settings.plist"
        shutil.copy2(settings.CONFIG, self.config)
        self.app = self.root / "Vorssaint.app"
        self.app.mkdir()
        for name, value in [("CONFIG", self.config), ("APP", self.app)]:
            patcher = patch.object(settings, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_portable_config_has_exactly_the_reviewed_setting_allowlist(self):
        data = settings.load_settings()
        self.assertEqual(set(data), settings.BOOLEANS | set(settings.STRINGS) | settings.INTEGERS)
        self.assertEqual(len(data), 18)
        self.assertEqual(plistlib.loads(self.config.read_bytes())["settings"], data)

    def test_check_validates_without_running_system_commands(self):
        with patch.object(settings.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
            settings.apply_settings(check=True)
        run.assert_not_called()
        self.assertIn("nothing was changed", output.getvalue())

    def test_apply_refuses_non_macos_without_any_system_commands(self):
        with patch.object(settings.sys, "platform", "linux"), patch.object(settings.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "only be applied on macOS"):
                settings.apply_settings()
        run.assert_not_called()

    def test_missing_app_and_unknown_process_status_fail_closed(self):
        self.app.rmdir()
        with patch.object(settings.sys, "platform", "darwin"), patch.object(settings.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "Install Vorssaint"):
                settings.apply_settings()
            run.assert_not_called()
        self.app.mkdir()
        with patch.object(settings.sys, "platform", "darwin"), patch.object(settings.subprocess, "run", return_value=subprocess.CompletedProcess([], 2)) as run:
            with self.assertRaisesRegex(ValueError, "Could not confirm"):
                settings.apply_settings()
            self.assertEqual(run.call_count, 1)

    def test_running_app_is_not_quit_or_modified(self):
        with patch.object(settings.sys, "platform", "darwin"), patch.object(settings.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            with self.assertRaisesRegex(ValueError, "Quit Vorssaint first"):
                settings.apply_settings()
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0], ["pgrep", "-x", "Vorssaint"])

    def test_applies_only_selected_keys_with_correct_types(self):
        def execute(args, **kwargs):
            return subprocess.CompletedProcess(args, 1 if args[0] == "pgrep" else 0)
        with patch.object(settings.sys, "platform", "darwin"), patch.object(settings.subprocess, "run", side_effect=execute) as run, contextlib.redirect_stdout(io.StringIO()):
            settings.apply_settings()
        commands = [call.args[0] for call in run.call_args_list if call.args[0][0] == "defaults"]
        data = settings.load_settings()
        expected = []
        for key, value in sorted(data.items()):
            flag = "-bool" if type(value) is bool else "-int" if type(value) is int else "-string"
            text = ("true" if value else "false") if type(value) is bool else str(value)
            expected.append(["defaults", "write", "com.vorssaint.utils", key, flag, text])
        self.assertEqual(commands, expected)
        self.assertEqual(len(commands), 18)
        self.assertFalse(any("--import-settings" in command or "killall" in command for command in commands))

    def test_raw_backup_or_private_fields_are_rejected_before_application(self):
        original = plistlib.loads(self.config.read_bytes())
        for key, value in [("textSnippets", ["private content"]), ("audioPriorityOutputUIDs", ["device-id"]), ("keepAwakeSessionEnd", {"active": True})]:
            with self.subTest(key=key):
                data = {**original, "settings": {**original["settings"], key: value}}
                self.config.write_bytes(plistlib.dumps(data))
                with patch.object(settings.subprocess, "run") as run:
                    with self.assertRaisesRegex(ValueError, "Unreviewed"):
                        settings.apply_settings()
                run.assert_not_called()

    def test_free_form_strings_and_unknown_backup_metadata_are_rejected(self):
        original = plistlib.loads(self.config.read_bytes())
        data = {**original, "settings": {**original["settings"], "keepAwakeIconTint": "private@example.invalid"}}
        self.config.write_bytes(plistlib.dumps(data))
        with self.assertRaises(ValueError) as error:
            settings.load_settings()
        self.assertNotIn("private@example", str(error.exception))
        self.config.write_bytes(plistlib.dumps({**original, "hostname": "private-host"}))
        with self.assertRaisesRegex(ValueError, "schema"):
            settings.load_settings()

    def test_failure_stops_further_preference_writes(self):
        written = []
        def execute(args, **kwargs):
            if args[0] == "pgrep":
                return subprocess.CompletedProcess(args, 1)
            written.append(args)
            if len(written) == 3:
                raise subprocess.CalledProcessError(9, args)
            return subprocess.CompletedProcess(args, 0)
        with patch.object(settings.sys, "platform", "darwin"), patch.object(settings.subprocess, "run", side_effect=execute):
            with self.assertRaises(subprocess.CalledProcessError):
                settings.apply_settings()
        self.assertEqual(len(written), 3)

    def test_installer_links_helper_without_applying_or_copying_raw_preferences(self):
        repo = self.root / "checkout with spaces"
        repo.mkdir()
        for directory in ["config", "bin"]:
            shutil.copytree(ROOT / directory, repo / directory)
        shutil.copy2(ROOT / "install.sh", repo / "install.sh")
        home = self.root / "home"
        home.mkdir()
        mock_bin = self.root / "mock-bin"
        mock_bin.mkdir()
        for command in ["defaults", "pgrep", "killall"]:
            file = mock_bin / command
            file.write_text('#!/bin/sh\nprintf "called\\n" >> "$HOME/vorssaint-apply-calls"\nexit 9\n')
            file.chmod(0o755)
        env = {"HOME": str(home), "PATH": str(mock_bin) + ":/usr/bin:/bin:/usr/sbin:/sbin", "SHELL": "/bin/zsh"}
        subprocess.run(["/bin/bash", str(repo / "install.sh")], env=env, cwd=repo, check=True, capture_output=True)
        helper = home / ".local/bin/vorssaint-settings"
        self.assertTrue(helper.is_symlink())
        self.assertTrue(os.access(helper, os.X_OK))
        self.assertFalse((home / "vorssaint-apply-calls").exists())
        self.assertFalse((home / ".config/vorssaint/settings.plist").exists())
        self.assertFalse((home / "Library/Preferences/com.vorssaint.utils.plist").exists())


if __name__ == "__main__":
    unittest.main()
