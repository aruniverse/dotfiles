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

## Dotfiles action

The shell setup exports `DOTFILES_ROOT` from the location of the sourced file, so clones outside the usual paths work too. `pull_dotfiles` requires that value in the Rex server's environment and uses `git pull --ff-only`.

After loading the shell environment, launch or restart Rex from that shell. A server launched by the desktop environment may not inherit shell variables; in that case use `git pull --ff-only` from the repo directly. The action reports a missing root rather than guessing a path or pulling the wrong repository. Reloading Lua config alone does not update the server's inherited environment.

## Layout Scripts (Lua)
```sh
rex do ~/.config/rex/init.lua --action dev_layout file=app.log
```
