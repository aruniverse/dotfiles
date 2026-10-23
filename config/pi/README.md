# Pi Dotfiles Notes

Pi stores runtime data in hardcoded paths (`~/.pi/agent/`, `~/.agents/`).
This directory keeps **shareable templates** that the installer symlinks into place.

## Files

- `settings.json` — packages, theme, provider, model preferences
- `mcp.json` — MCP server endpoints

## Secrets

Do NOT commit these:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/mcp-auth.json`

Add them to `.gitignore` if you ever copy Pi files into the repo.

## Skills

`rex skill setup` installs the `rex` agent skill to `~/.agents/skills/rex`.
To update agent skills after a Rex upgrade:

```sh
rex skill setup
```

Or run the helper in `bin/rex-setup-skills` after pulling new dotfiles.
