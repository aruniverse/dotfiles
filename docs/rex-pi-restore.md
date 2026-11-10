# Restore Pi after a Rex server restart

The Pi extension records which saved conversation belongs to each Rex pane. A Bash/Zsh prompt hook reopens that conversation after Rex restores the pane following a server restart. It uses exact session and pane IDs, not tab titles.

## Install and activate

The integration requires Python 3, Pi, and the `rex` CLI on `PATH`, plus a Rex server that preserves session and pane IDs across restarts. It targets local macOS and Linux terminals.

1. Run `./install.sh`. It copies the extension if missing, links the restore helper if missing, and adds the shell hook without replacing existing configuration.
2. Restart your shell to load the hook. The installer configures Zsh's `.zshrc` and both Bash's selected login profile and `.bashrc`.
3. Run `/reload` in each existing Pi tab you want registered. New interactive Pi sessions register themselves automatically.

From the shell in a registered pane, inspect the decision without launching anything:

```sh
rex-restore-pi --check
```

If installation reports `Kept`, merge the corresponding file manually. Pi extensions are copied templates, not writable links into this repo.

## Restore behavior

On the first interactive prompt of a restored pane, the helper resumes the saved conversation only when:

- The Rex server instance has changed.
- The connected server confirms the recorded Rex session and pane IDs.
- The previous Pi process is no longer alive.
- The exact Pi session file and its working directory still exist.

The helper runs `pi --session <exact-session-file>` with no prompt. The hook itself does not replay user messages, tool calls, or interrupted turns. It does not infer a conversation from its title or create a replacement session when restoration fails.

Existing extension startup behavior is unchanged. In particular, `pi-subagents` defaults `subagents.autoResume` to `true`, which can independently recover interrupted workflows when their parent reopens. Set that existing preference to `false` if you want manual workflow recovery.

Deliberately quitting Pi removes its registration. SIGHUP/SIGTERM interruption retains it; SIGKILL also leaves the saved record intact. Reloading Pi preserves the record, and switching conversations updates it. Ephemeral or opted-out foreground sessions retire older mappings rather than resurrecting an unrelated conversation. A per-pane lock prevents concurrent restore attempts.

The hook runs once per interactive shell. It skips batch shells and non-terminal input/output. Missing dependencies, malformed records, unavailable sessions, and live old Pi processes leave a usable shell instead of starting another conversation. If the old Pi process is still alive at the first prompt, run `rex-restore-pi` manually after it exits. Other shells and panes that bypass these startup files are not configured.

## Private state

Records live in `${XDG_STATE_HOME:-$HOME/.local/state}/rex-pi-restore/`, outside the checkout. The extension creates directories with mode 0700 and records with mode 0600. A record contains only the Rex session/pane IDs, server instance, Pi session path, Pi process ID, and working directory. Prompts, credentials, and transcripts are not copied.

Do not commit these records, their lock files, or Pi session files.

## Disable

Export `REX_PI_RESTORE=0` before the hook's source line in your shell startup file, then reload Pi in existing sessions. This disables registration and automatic restore without changing other extension preferences.

## Implementation and tests

- Extension: `config/pi/extensions/rex-pi-restore/index.ts`
- Helper: `bin/rex-restore-pi`
- Shell hook: `config/shell/rex-pi-restore.sh`

The normal test suite covers registration, shutdown signals, exact-session restoration, duplicate suppression, private record validation, and Bash/Zsh prompt-hook preservation:

```sh
python3 -B -m unittest discover -s tests -v
node --test tests/*.test.mjs
```

An optional end-to-end test requires installed Rex, Pi, Node.js, and Zsh:

```sh
python3 -B tests/integration_rex_pi_restore.py
```

It starts and restarts a separate temporary Rex server with isolated Pi configuration. It checks that the exact conversation resumes in the same pane with zero user/model turns, and that deliberately quitting Pi clears its registration. It never restarts the production Rex server.
