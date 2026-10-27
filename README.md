# dotfiles

Personal configuration for macOS and Linux. Configs contain portable preferences, not a snapshot of a machine's home directory.

## Install

Install Git and GitHub CLI first (`brew install gh` on a Mac with Homebrew). Clone anywhere, then run the installer:

```sh
gh repo clone aruniverse/dotfiles ~/repos/aruniverse/dotfiles
cd ~/repos/aruniverse/dotfiles
./install.sh
```

The installer creates missing shell startup files and appends source lines. It preserves all existing config files and symlinks, including dangling symlinks. It does not download dependencies, install plugins, or change credentials.

GitHub CLI, Pi, Herdr, Zed, and VS Code templates are copied only when missing. These apps can save private settings, so their writable config files are not linked back into this repository. Rex, Git, Vim, the global Git ignore file, and bin helpers are symlinked only when the destination is missing.

Restart your login shell after installation. Bash and Zsh are supported. For other shells, configure them manually; the shell scripts here require Bash or Zsh.

## Dependencies

Install Homebrew separately if needed. The Brewfile is a curated subset of this Mac's tools, not a full application inventory:

```sh
brew bundle --file=Brewfile
```

This includes NVM, not Node itself. After restarting your shell:

```sh
nvm install --lts
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Install Rex separately. Optional integrations:

- Install Oh My Zsh through its official instructions. These configs use `agnoster`, `git`, and `fzf` when available.
- Install the external completion plugin with `git clone https://github.com/Aloxaf/fzf-tab.git "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/fzf-tab"`.
- Select the installed Fira Code Nerd Font in your terminal for the prompt's symbols.
- For Vim plugins, run `git clone https://github.com/VundleVim/Vundle.vim.git ~/.vim/bundle/Vundle.vim` if missing, then `vim +PluginInstall +qall`.
- Install the selected VS Code extensions with:

  ```sh
  while IFS= read -r extension; do
    code --install-extension "$extension"
  done < config/vscode/extensions.txt
  ```

## Managed config

| Tool | Repository files | Destination |
|---|---|---|
| Shell | `config/shell/` | Sourced from Bash/Zsh startup files |
| Rex | `config/rex/` | `$XDG_CONFIG_HOME/rex/` |
| Pi | `config/pi/` | `~/.pi/agent/` |
| Git | `config/git/gitconfig`, `config/git/ignore` | `~/.gitconfig`, `~/.gitignore_global` |
| GitHub CLI | `config/gh/config.yml` | `$GH_CONFIG_DIR/config.yml`, or `$XDG_CONFIG_HOME/gh/config.yml` |
| Vim | `config/vim/vimrc` | `~/.vimrc` |
| Herdr | `config/herdr/config.toml` | `$XDG_CONFIG_HOME/herdr/config.toml` |
| Zed | `config/zed/settings.json` | `$XDG_CONFIG_HOME/zed/settings.json` |
| VS Code | `config/vscode/` | macOS: `~/Library/Application Support/Code/User/settings.json`; Linux: `$XDG_CONFIG_HOME/Code/User/settings.json` |
| Helpers | `bin/` | `~/.local/bin/` |

`XDG_CONFIG_HOME` defaults to `~/.config`. VS Code Insiders and other editor variants are not managed.

GitHub CLI config includes this machine's HTTPS preference and `gh co` alias. Its `hosts.yml` authentication file is never copied or linked, and the installer does not log in. The Brewfile includes Obsidian and Bitwarden, but not vaults, sync settings, account state, or credentials.

The editor templates include fonts, formatters, themes, and editing preferences. They exclude database connections, absolute runtime paths, terminal environment values, workspace trust lists, and agent permission/auto-approval settings. Herdr logs, plugin state, sessions, and its generated Pi integration are not copied.

See [Pi setup](config/pi/README.md) and [Rex commands](docs/rex-notes.md).

## Keep local settings private

Existing configs stay active. Merge the repository defaults manually where the installer reports `Kept`; a backup does not count as preserving an active configuration.

To adopt the shared Git config while keeping your current identity, credential helpers, and other machine settings, first review your existing config. If `~/.gitconfig.local` does not already exist, move the old `~/.gitconfig` there and rerun the installer. The shared config includes `~/.gitconfig.local` last, so local values win. Do not overwrite an existing local file or move an existing managed symlink there.

Keep employer-specific identities and hosts, credential-manager paths, application PATH entries, API keys, and environment values in local files outside this repo. Never copy auth files, `.npmrc`, SSH keys, MCP auth headers, shell histories, editor connection profiles, or session databases. `.gitignore` is a guardrail, not a substitute for reviewing a diff.

## Update

```sh
cd ~/repos/aruniverse/dotfiles
git pull --ff-only
./install.sh
```

Symlinked defaults update with the repo. Copied templates and existing configs are not overwritten; merge changes manually. Pi package changes require reconciliation as described in its setup notes.

## Check changes

```sh
python3 -B -m unittest discover -s tests -v
node --test tests/auto-session-name.test.mjs
rex config check "$PWD/config/rex/init.lua"
git diff --check
```

The Python tests use isolated homes inside this checkout and require Python 3.11 or newer. Rex, Zsh, and GitHub CLI checks are skipped when their binaries are unavailable. The extension test requires Node.js 22.19 or newer and mocks model calls; no credentials or network requests are needed.
