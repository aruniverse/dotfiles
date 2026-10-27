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
- Sessions, caches, and generated runtime state.
- MCP auth headers, private endpoints, environment values, and provider overrides containing secrets.

`mcp.json` contains only the public Rex community endpoint. Merge it manually when you already have an MCP configuration; do not replace or export your live file wholesale.
