import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dotfiles-test-", dir=ROOT / ".git")
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.repo = self.base / "checkout with spaces"
        self.repo.mkdir()
        for name in ("config", "bin"):
            shutil.copytree(ROOT / name, self.repo / name)
        shutil.copy2(ROOT / "install.sh", self.repo / "install.sh")
        self.home = self.base / "home"
        self.home.mkdir()
        self.env = {
            "HOME": str(self.home),
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            "SHELL": "/bin/zsh",
            "XDG_CONFIG_HOME": str(self.home / "custom-config"),
            "HOMEBREW_PREFIX": str(self.home / "brew"),
        }

    def install(self):
        return subprocess.run(
            ["/bin/bash", str(self.repo / "install.sh")],
            env=self.env, cwd=self.repo, check=True, capture_output=True, text=True,
        )

    def test_fresh_install_and_repeat(self):
        self.install()
        rc = self.home / ".zshrc"
        before = rc.read_text()
        self.install()
        self.assertEqual(rc.read_text(), before)
        self.assertIn("env.sh", before)
        self.assertIn("zshrc.zsh", before)
        self.assertIn("profile.sh", (self.home / ".zprofile").read_text())
        self.assertIn("env.sh", (self.home / ".zprofile").read_text())
        for name in ("settings.json", "mcp.json", "extensions/auto-session-name.ts"):
            installed = self.home / ".pi/agent" / name
            self.assertTrue(installed.is_file())
            self.assertFalse(installed.is_symlink())
        self.assertTrue((self.home / "custom-config/rex/init.lua").is_symlink())
        self.assertTrue((self.home / ".local/bin/rex-setup-skills").is_symlink())
        self.assertTrue((self.home / ".gitignore_global").is_symlink())
        git_env = {**self.env, "GIT_CONFIG_NOSYSTEM": "1"}
        result = subprocess.check_output(
            ["git", "config", "--global", "--get", "filter.lfs.process"],
            env=git_env, text=True,
        )
        self.assertEqual(result.strip(), "git-lfs filter-process")

    def test_existing_files_and_foreign_links_are_untouched(self):
        targets = [
            ".gitconfig", ".gitignore_global", ".vimrc", ".pi/agent/settings.json",
            ".pi/agent/mcp.json", ".pi/agent/extensions/auto-session-name.ts",
            "custom-config/herdr/config.toml", "custom-config/zed/settings.json",
        ]
        for name in targets:
            p = self.home / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("local configuration, do not replace\n")
        code_user = ("Library/Application Support/Code/User" if os.uname().sysname == "Darwin"
                     else "custom-config/Code/User")
        targets.append(f"{code_user}/settings.json")
        code = self.home / targets[-1]
        code.parent.mkdir(parents=True)
        code.write_text("local configuration, do not replace\n")
        rex = self.home / "custom-config/rex/init.lua"
        rex.parent.mkdir(parents=True)
        rex.symlink_to(self.home / "missing-local-config.lua")
        self.install()
        for name in targets:
            self.assertEqual((self.home / name).read_text(), "local configuration, do not replace\n")
        self.assertEqual(os.readlink(rex), str(self.home / "missing-local-config.lua"))

    def test_local_git_overrides_win(self):
        (self.home / ".gitconfig.local").write_text(
            "[core]\n editor = local-editor\n[credential]\n helper = local-helper\n"
        )
        self.install()
        for key, value in (("core.editor", "local-editor"), ("credential.helper", "local-helper")):
            output = subprocess.check_output(["git", "config", "--global", "--includes", "--get", key],
                                             env=self.env, text=True)
            self.assertEqual(output.strip(), value)

    def test_bash_login_files_are_created_without_shadowing_existing_profile(self):
        self.env["SHELL"] = "/bin/bash"
        profile = self.home / ".profile"
        profile.write_text("# existing login configuration\n")
        self.install()
        self.assertFalse((self.home / ".bash_profile").exists())
        self.assertIn("env.sh", profile.read_text())
        self.assertIn("env.sh", (self.home / ".bashrc").read_text())
        self.assertTrue(profile.read_text().startswith("# existing login configuration\n"))
        profile.unlink()
        self.install()
        self.assertIn("env.sh", (self.home / ".bash_profile").read_text())

    def test_shell_root_is_exported_from_arbitrary_clone_and_path_is_idempotent(self):
        for shell in ("/bin/bash", shutil.which("zsh")):
            if not shell:
                continue
            with self.subTest(shell=shell):
                self.install()
                script = '''
. "$1"
. "$1"
/bin/sh -c 'printf "%s\\n" "$DOTFILES_ROOT"; printf "%s\\n" "$PATH"'
'''
                result = subprocess.check_output(
                    [shell, "-c", script, "test", str(self.repo / "config/shell/env.sh")],
                    env=self.env, text=True,
                ).splitlines()
                self.assertEqual(result[0], str(self.repo))
                self.assertEqual(result[1].split(":").count(str(self.home / ".local/bin")), 1)

    def test_linux_editor_location(self):
        mock_bin = self.base / "mock-bin"
        mock_bin.mkdir()
        uname = mock_bin / "uname"
        uname.write_text("#!/bin/sh\nprintf 'Linux\\n'\n")
        uname.chmod(0o755)
        self.env["PATH"] = str(mock_bin) + ":" + self.env["PATH"]
        self.install()
        self.assertTrue((self.home / "custom-config/Code/User/settings.json").is_file())
        self.assertFalse((self.home / "Library/Application Support/Code/User").exists())

    @unittest.skipUnless(shutil.which("zsh"), "Zsh is not installed")
    def test_zsh_optional_integrations_load_once(self):
        omz = self.home / ".oh-my-zsh"
        (omz / "custom/plugins/fzf-tab").mkdir(parents=True)
        (omz / "custom/plugins/fzf-tab/fzf-tab.plugin.zsh").touch()
        (omz / "oh-my-zsh.sh").write_text(
            "typeset -g omz_calls=$(( ${omz_calls:-0} + 1 ))\nomz() { :; }\n"
        )
        (self.home / ".iterm2_shell_integration.zsh").write_text(
            "typeset -g iterm_calls=$(( ${iterm_calls:-0} + 1 ))\n"
            "ITERM_SHELL_INTEGRATION_INSTALLED=Yes\n"
        )
        mock_bin = self.home / "mock-bin"
        mock_bin.mkdir()
        fzf = mock_bin / "fzf"
        fzf.write_text("#!/bin/sh\nexit 0\n")
        fzf.chmod(0o755)
        self.env["PATH"] = str(mock_bin) + ":" + self.env["PATH"]
        output = subprocess.check_output(
            [shutil.which("zsh"), "-c", '. "$1"; . "$1"; '
             'printf "%s\\n" "$ZSH_THEME" "$omz_calls" "$iterm_calls" "${plugins[*]}"',
             "test", str(self.repo / "config/shell/zshrc.zsh")],
            env=self.env, text=True,
        ).splitlines()
        self.assertEqual(output, ["agnoster", "1", "1", "git fzf fzf-tab"])

    def test_helper_is_executable_from_local_bin(self):
        self.install()
        mock_bin = self.home / "mock-bin"
        mock_bin.mkdir()
        rex = mock_bin / "rex"
        rex.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOME/rex-calls"\n')
        rex.chmod(0o755)
        subprocess.run([str(self.home / ".local/bin/rex-setup-skills")], check=True,
                       env={**self.env, "PATH": str(mock_bin) + ":" + self.env["PATH"]},
                       capture_output=True)
        self.assertEqual((self.home / "rex-calls").read_text().splitlines(),
                         ["skill setup", "skill status"])

    @unittest.skipUnless(shutil.which("rex"), "Rex is not installed")
    def test_rex_config_loads_and_pull_never_guesses_a_directory(self):
        rex = shutil.which("rex")
        subprocess.run([rex, "--autostart=false", "config", "check",
                        str(self.repo / "config/rex/init.lua")],
                       env=self.env, check=True, capture_output=True)
        wrapper = self.base / "check-action.lua"
        wrapper.write_text('''
local module = os.getenv("TEST_ACTIONS_FILE")
local actions, captured = {}, {}
rex = {
  action = function(action) actions[action.name] = action end,
  exec = function(command, options)
    captured.cwd = options.cwd
    captured.ff_only = command[3] == "--ff-only"
    return {ok = true, stdout = "ok"}, nil
  end,
}
dofile(module)
local ok, result = pcall(actions.pull_dotfiles.run, nil, {})
local root = os.getenv("DOTFILES_ROOT")
if root == nil then
  assert(not ok and tostring(result):find("DOTFILES_ROOT"))
  assert(next(captured) == nil)
else
  assert(ok and captured.cwd == root and captured.ff_only)
end
''')
        for root in (None, str(self.repo)):
            env = {**self.env, "TEST_ACTIONS_FILE": str(self.repo / "config/rex/actions.lua")}
            if root:
                env["DOTFILES_ROOT"] = root
            subprocess.run([rex, "--autostart=false", "config", "check", str(wrapper)],
                           env=env, check=True, capture_output=True)


class ConfigTests(unittest.TestCase):
    def test_json_and_toml_are_valid_and_contain_no_private_fields(self):
        forbidden = {"password", "token", "apiKey", "api_key", "headers", "env",
                     "httpProxy", "mssql.connections", "snyk.trustedFolders",
                     "chat.permissions.default", "chat.tools.terminal.autoApprove"}

        def check(value):
            if isinstance(value, dict):
                self.assertFalse(forbidden.intersection(value))
                for key, child in value.items():
                    self.assertFalse(key.startswith("terminal.integrated.env."))
                    check(child)
            elif isinstance(value, list):
                for child in value:
                    check(child)
            elif isinstance(value, str):
                self.assertNotIn("/Users/", value)

        for p in (ROOT / "config").rglob("*.json"):
            check(json.loads(p.read_text()))
        with (ROOT / "config/herdr/config.toml").open("rb") as stream:
            check(tomllib.load(stream))

    def test_auth_environment_and_local_files_are_ignored(self):
        for name in ("config/pi/auth.json", "config/pi/mcp-auth.json",
                     "config/editor/auth.json", ".env", ".env.local",
                     "config/git/.gitconfig.local", "private.key"):
            result = subprocess.run(["git", "check-ignore", "--no-index", name],
                                    cwd=ROOT, capture_output=True)
            self.assertEqual(result.returncode, 0, name)


if __name__ == "__main__":
    unittest.main()
