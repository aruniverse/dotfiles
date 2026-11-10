import errno
import os
from pathlib import Path
import pty
import shutil
import subprocess
import tempfile
import unittest

HOOK = Path(__file__).resolve().parents[1] / "config/shell/rex-pi-restore.sh"


class ShellTests(unittest.TestCase):
    def run_shell(self, shell, command, disabled=False, interactive=True):
        with tempfile.TemporaryDirectory(prefix="rex-pi-shell-test-") as temporary:
            home = Path(temporary)
            helper = home / ".local/bin/rex-restore-pi"
            helper.parent.mkdir(parents=True)
            helper.write_text('#!/bin/sh\nprintf "called\\n" >> "$HOME/calls"\n')
            helper.chmod(0o755)
            env = {**os.environ, "HOME": temporary, "REX_SESSION": "session:test", "REX_BLOCK": "block:test"}
            if disabled:
                env["REX_PI_RESTORE"] = "0"
            else:
                env.pop("REX_PI_RESTORE", None)
            master, slave = pty.openpty()
            args = [shell, "-fic" if shell.endswith("zsh") and interactive else "-ic" if interactive else "-c", command, "test", str(HOOK)]
            process = subprocess.Popen(args, env=env, stdin=slave, stdout=slave, stderr=slave)
            os.close(slave)
            chunks = []
            try:
                while True:
                    try:
                        chunk = os.read(master, 8192)
                    except OSError as error:
                        if error.errno == errno.EIO:
                            break
                        raise
                    if not chunk:
                        break
                    chunks.append(chunk)
                process.wait(timeout=10)
            finally:
                os.close(master)
                if process.poll() is None:
                    process.kill()
                    process.wait()
            output = b"".join(chunks).decode(errors="replace")
            calls = (home / "calls").read_text().splitlines() if (home / "calls").exists() else []
            self.assertEqual(process.returncode, 0, output)
            return calls, output

    @unittest.skipUnless(shutil.which("zsh"), "Zsh is unavailable")
    def test_zsh_preserves_prompt_hooks_and_restores_only_once(self):
        calls, output = self.run_shell(shutil.which("zsh"), '''
precmd_functions=(existing_hook)
. "$1"
. "$1"
print -r -- "hooks:${precmd_functions[*]}"
_rex_pi_restore_once
_rex_pi_restore_once
''')
        self.assertEqual(calls, ["called"])
        self.assertIn("hooks:existing_hook _rex_pi_restore_once", output)

    def test_bash_preserves_string_and_array_prompt_commands(self):
        for declaration, assertion in [
            ("PROMPT_COMMAND='echo previous'", '[[ "$PROMPT_COMMAND" == "echo previous; _rex_pi_restore_once" ]]'),
            ("PROMPT_COMMAND=('echo previous')", '[[ "${PROMPT_COMMAND[0]}" == "echo previous" && "${PROMPT_COMMAND[1]}" == "_rex_pi_restore_once" ]]'),
        ]:
            with self.subTest(declaration=declaration):
                calls, _ = self.run_shell("/bin/bash", declaration + '\n. "$1"\n. "$1"\n' + assertion + ' || exit 1\n_rex_pi_restore_once\n_rex_pi_restore_once\n')
                self.assertEqual(calls, ["called"])

    def test_disabled_and_noninteractive_shells_install_no_hook(self):
        for disabled, interactive in [(True, True), (False, False)]:
            calls, _ = self.run_shell("/bin/bash", '. "$1"\n! declare -F _rex_pi_restore_once\n', disabled=disabled, interactive=interactive)
            self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
