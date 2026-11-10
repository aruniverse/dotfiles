# Pi setup

Pi defaults to `~/.pi/agent/`; `PI_CODING_AGENT_DIR` can override that location. The dotfiles installer targets the default location and copies missing templates. It never replaces existing settings or MCP config, and it never links writable Pi files into this repo.

## Preferences and packages

`settings.json` captures this machine's package selection, dark theme, GitHub Copilot provider, and high thinking level. The default model is an account-dependent preference, not a bundled model. Choose an available model with `/model` if needed.

Both FFF packages are present on this machine: `@ff-labs/pi-fff` supplies search tools; `pi-fff` also supplies file resolution and autocomplete. The Plannotator entry disables its bundled skills because this machine installs those separately. Built-in MCP is explicitly disabled to match the use of `pi-mcp-adapter`.

After merging settings, reconcile packages:

```sh
pi update --extensions
```

Start Pi and use `/login` to authenticate. No credentials or enabled-model/account inventories are included.

`extensions/auto-session-name.ts` is the custom extension from this machine. It makes an additional request to the active model with up to 500 characters of the first user message to name an unnamed session. It uses Pi's runtime authentication; no keys are stored in the extension. Omit it if you do not want that request or cost.

## Rex tab names

`extensions/rex-tab-name.ts` keeps the tab containing Pi named after the active Pi session. It syncs on startup, `/reload`, `/resume`, `/new`, `/name`, and automatic session naming. Unnamed sessions use `Pi`.

The extension requires a Pi version with the `session_info_changed` event and the `rex` CLI on `PATH`. It only runs in interactive Pi sessions with both `REX_SESSION` and `REX_BLOCK` set. It does not rename the Rex workspace or change focus. Failures produce a warning without interrupting Pi.

After installing, run `/reload`, then `/name My task` to check the tab name. If multiple Pi instances share a split tab, the last session to sync sets that tab's name.

## Rex subagent popups

`extensions/rex-subagent-popups/index.ts` opens a floating, read-only inspector when a new `pi-subagents` background run starts. The inspector appears in the tab containing the parent Pi session without taking focus. It shows progress, tool activity, and results, and stays open after completion. Closing it does not stop or steer the child.

The extension requires the `rex` CLI on `PATH`, Rex's `session.new_layer` API, and `pi-subagents` installed in the default `~/.pi/agent/npm/` package directory. It uses that package's standalone `inspector-runner.mjs`; if the package moves this entrypoint, update the resolver. A missing dependency or failed Rex request produces a warning without interrupting the child.

After installation, run `/reload`. Popups are enabled by default. Use `/rex-subagents off`, `/rex-subagents on`, or `/rex-subagents status` to control them until the next reload. These commands do not close existing popups or change child execution.

Only Pi sessions with a UI and both `REX_SESSION` and `REX_BLOCK` set open popups. Synchronous children and separate workflow engines are unchanged. Workflow containers do not open an extra popup; their background children use the same start-event integration. Grouped background runs share an inspector.

## Restore Pi after a Rex restart

`extensions/rex-pi-restore/index.ts`, `bin/rex-restore-pi`, and the Bash/Zsh prompt hook restore a saved Pi conversation in its original Rex pane after the server restarts. They use exact IDs and the session file path, not the tab name. Run `/reload` in existing Pi tabs after installation to register them.

The helper requires Python 3 and launches `pi --session <exact-session-file>` without a prompt. It skips restoration while the previous Pi process is alive, and deliberately quitting Pi clears its registration. Existing extension recovery settings, including `pi-subagents` workflow auto-resume, are unchanged.

See [Rex/Pi session restore](../../docs/rex-pi-restore.md) for activation, private state, disabling, and the isolated restart test.

## Skills and integrations

Skills from packages above are installed with those packages. See [Restore public skills](../../docs/skills.md) for the separately installed collections already used on this machine and the commands to reinstall them. Review and select the skills you need; this repo does not vendor their content, private skills, or machine-specific lockfiles.

```sh
rex skill setup
rex skill status
```

The `rex-setup-skills` helper runs those commands after a Rex upgrade. Use Herdr's integration setup to regenerate its managed Pi extension rather than copying the generated file.

## Private files

Keep these outside Git:

- `auth.json`, `mcp-auth.json`, model/account stores, and trust state.
- Sessions, caches, generated runtime state, and Rex/Pi restore records or locks.
- MCP auth headers, private endpoints, environment values, and provider overrides containing secrets.

`mcp.json` contains only the public Rex community endpoint. Merge it manually when you already have an MCP configuration; do not replace or export your live file wholesale.
