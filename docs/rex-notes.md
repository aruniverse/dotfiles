# Rex Quick Reference

## Config
- File: `$XDG_CONFIG_HOME/rex/init.lua` (or `~/.config/rex/init.lua`)
- Override: set `REX_CONFIG` env var
- Reload: `rex config reload`
- Check:  `rex config check`
- Debug:  `rex keymap`

## CLI
```sh
rex ls                         # list sessions
rex session inspect            # current session details
rex block inspect              # current block details
rex new <name> -- nvim         # create session
rex split -- htop              # split pane
rex capture -b logs --trim     # read terminal output
rex do <action> [args...]      # run custom action
rex events                     # watch events
```

## Agent Skill
```sh
rex skill setup                # install/update for claude, codex, pi
rex skill status               # show what's installed
rex skill remove               # remove all
```

## Layout Scripts (Lua)
```sh
rex do ~/.config/rex/init.lua --action dev_layout file=app.log
```
