# Pi on Rex native session restore

This integration uses Rex's [Program Resume Protocol (OSC 7577)](https://www.superlogical.com/rex/docs/build/program-resume) instead of a shell-prompt hook or a private Pi-to-pane registry.

The protocol formatter and reporter are adapted from [earendil-works/pi#12557](https://github.com/earendil-works/pi/pull/12557), commit `6044f278`. Their upstream MIT license is included with the extension. The PR is merged, but the inspected installed Pi and published 1.6.1 package do not contain it yet; this extension is a backport, not a patch to the global npm package.

## Setup

1. Install a Rex version with OSC 7577 and resume trust rules. The integration was tested with 0.1.0-preview.25.
2. Run `./install.sh`. It installs the Pi extension, persona entrypoints and `config/rex/pi_resume.lua` without replacing existing local files.
3. If your existing Rex `init.lua` was kept, add `require("pi_resume")` to it, then run `rex config check` and `rex config reload`. This reloads configuration, not the server.
4. Run `/reload` in existing Pi sessions before the next server restart. New sessions load the bridge automatically. `/rex-resume` refreshes the native hint without restarting anything.

Rex must opt in: the Lua rules trust only Pi session files in the relevant private profile directories and known safe launch options. Claude/Codex/OpenCode rules are left unchanged. Older Rex versions can still load the other config modules, but do not gain Pi native resume.

## Work and personal

- Plain `pi` supports the default work directory, `~/.pi/agent`.
- `pi-work` uses that same work configuration.
- `pi-personal` uses `~/.pi/personas/personal`.

The persona entrypoints run Pi's public SDK CLI entry in the same Node process. Rex can validate their executable identity, and the command itself selects the profile when it runs in a fresh shell. They remove the other persona's LLM environment credential and do not copy authentication. A missing profile fails rather than using another profile.

The existing personal profile must be configured first; the launcher does not invent its model, credentials, or settings. Use `pi-persona sync` if you have the local persona manager. The manager and its private configuration are separate from this backport.

A manual, per-run `PI_CODING_AGENT_DIR` cannot be preserved by the upstream protocol command: no environment variables are saved. Use the named persona entrypoints instead. Unknown profile locations are not automatically resumed by this bridge.

## Behavior and safety

The extension signs an exact session-file command and working directory using Rex's per-pane token. The token is consumed and removed from the environment, never printed or saved. Persona launchers consume it before Pi starts loading tools/extensions. Only interactive TTY sessions report.

The extension reports on startup, session switches, the first persisted message, and `fg`. A deliberate quit clears the native record; SIGHUP/SIGTERM retain it. Empty/ephemeral sessions clear an older record. No prompts, API keys, private system-prompt strings, or tool commands are placed in the resume command. Oversized or invalid protocol commands are cleared rather than leaving stale commands in place.

Known safe session/model selectors are replaced by the current saved conversation state. Launches with unhandled options, such as per-run API keys, custom prompt text, or tool restrictions, do not advertise a resume record; restrictions are never silently dropped. Configure persistent defaults in the profile if you need them restored.

Rex owns command storage, process lifetime checks, duplicate handling and restarting. The bridge does not write an extra registry, poll for server changes, restart the server, or replay a user turn. Existing Pi extension recovery settings, including `subagents.autoResume`, remain in effect.

To inspect a terminal's record:

```sh
rex block call -b "$REX_BLOCK" program_resume_records
```

Look for `trusted: true` and `chosen: true`. A record can contain private command arguments; do not export the full output unnecessarily. The trust module also accepts the merged upstream reporter's canonical session-ID commands for when that implementation is released.

## Removing the former custom implementation

The former `rex-restore-pi` Python helper, `rex-pi-restore` extension, and `config/shell/rex-pi-restore.sh` hook are no longer installed. When updating an older installation, back them up, remove only those known files and their shell source lines, and reload Pi. Do not replace whole `.zshrc` or `.bashrc` files.

Old marker files under `~/.local/state/rex-pi-restore` are not used by the native bridge. Keep them privately for rollback until native records have been verified; they are not Pi conversation files. The actual saved Pi sessions and credentials stay in place.

## Checks

```sh
node --test tests/*.test.mjs
python3 -B -m unittest discover -s tests -v
rex config check "$PWD/config/rex/init.lua"
python3 -B tests/integration_rex_native_resume.py
```

The optional integration check runs a separate temporary Rex server, verifies trusted/chosen records for plain Pi, work and personal, restarts only that server, and verifies exact conversation recovery with zero model/user turns. It also checks that intentional quits remove the records. The production server is never restarted.
