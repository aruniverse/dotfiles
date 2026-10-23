# dotfiles

> Personal configuration files, portable across macOS and Linux.

## One-liner install

```sh
git clone https://github.com/aruniverse/dotfiles.git ~/.dotfiles \
  && cd ~/.dotfiles \
  && ./install.sh
```

## What's managed

| Tool | Config location | Notes |
|------|-------------------|-------|
| **Rex** | `$XDG_CONFIG_HOME/rex/init.lua` | `REX_CONFIG` points here so edits in this repo apply immediately after `rex config reload` |
| **Pi** | `~/.pi/agent/` | Templates symlinked in for packages, theme, and MCP servers. Auth files are excluded |
| **Shell** | Sourced from `~/.zshrc` or `~/.bashrc` | Sets `REX_CONFIG`, `XDG_CONFIG_HOME`, `PATH` tweaks, aliases |
| **Git** | `~/.gitconfig` | Aliases and defaults |
| **Vim** | `~/.vimrc` + `~/.vim/` | Vundle and plugins |

## Structure

```
.
├── config/
│   ├── rex/          # init.lua + modules (keys, actions, hosts)
│   ├── pi/           # settings.json + mcp.json templates + README
│   ├── shell/        # env.sh — source from shell rc
│   ├── git/          # gitconfig
│   └── vim/          # vimrc
├── bin/              # Helper scripts (rex-setup-skills)
├── docs/             # Tool-specific notes
├── install.sh        # Idempotent installer
└── README.md
```

## Updating after pull

```sh
cd ~/.dotfiles && git pull && ./install.sh
```

`install.sh` only overwrites symlinks; it won't clobber local edits.
