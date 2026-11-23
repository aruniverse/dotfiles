# Portable Vorssaint preferences

`config/vorssaint/settings.plist` contains a reviewed subset of a fresh native export from Vorssaint 3.4.4. It keeps 18 portable keep-awake and menu-bar preferences, not the app's full 841-setting backup.

## Install and apply

Vorssaint is included in the macOS section of the Brewfile. Install it with `brew bundle --file=Brewfile`, then run `./install.sh` to link the helper into `~/.local/bin`.

Inspect the selected values without changing anything:

```sh
vorssaint-settings --check
```

To apply them on another Mac:

1. Quit Vorssaint yourself. The helper refuses to run while the app is open; it never quits or restarts it for you.
2. Run `vorssaint-settings`.
3. Launch Vorssaint when ready. Configure permissions, launch-at-login, and any closed-lid support separately on that Mac.

From the checkout, the same commands are available as `./bin/vorssaint-settings`.

The helper writes only the selected keys in the current user's `com.vorssaint.utils` preferences. It preserves unrelated preferences and does not use the app's full-import command. Installation only links the helper; it does not apply app settings or create an automatically loaded managed file.

The copy retains `keepAwakeAutoStart: true` from the source Mac. Applying it allows the existing keep-awake rules to start when you later open Vorssaint. No running timer, active-session object, or sleep assertion is copied.

## Included values

| Setting | Value |
|---|---|
| `defaultDurationMinutes` | `0` (retained as exported) |
| `featureAvailable.keepAwake` | `true` |
| `keepAwakeActiveIcon` | `vorssaint` |
| `keepAwakeAllowDisplaySleep` | `true` |
| `keepAwakeAutoStart` | `true` |
| `keepAwakeConnectedToPower` | `true` |
| `keepAwakeExternalDisplay` | `true` |
| `keepAwakeIconTint` | `orange` |
| `keepAwakeSwitchUsesUntil` | `false` |
| `menuBarCPU` | `true` |
| `menuBarDiskActivity` | `false` |
| `menuBarDiskUsage` | `false` |
| `menuBarGPU` | `true` |
| `menuBarHideIconWithMetrics` | `false` |
| `menuBarMemory` | `true` |
| `menuBarMetricAppearance` | `values` |
| `menuBarMetricSpacing` | `compact` |
| `menuBarNetwork` | `false` |

## Privacy and refresh

The file contains only booleans, one integer, four fixed UI enum strings, and native backup-version metadata. The helper rejects unreviewed keys, binary objects, free-form strings, and invalid value types before making changes.

Clipboard history, text snippets, saved application state, shelf contents, file paths, device names/identifiers, app-volume mappings, permissions, and login-item state are excluded. Do not copy `~/Library/Application Support/com.vorssaint.utils` or the entire preferences plist into this repo.

When your app preferences change, export to a private location first:

```sh
umask 077
review_dir=$(mktemp -d)
/Applications/Vorssaint.app/Contents/MacOS/Vorssaint --export-settings "$review_dir/raw-export.plist"
```

Review the export and refresh only the allowlisted settings. Never replace the checked-in file with the full export: native backups can include snippets and other private data. New values or keys need review and corresponding validator/test updates. App versions can change preference keys; this snapshot records its source version rather than claiming compatibility with every future release.

See the [official Vorssaint settings guidance](https://github.com/vorssaint/vorssaint-utils/blob/main/docs/TROUBLESHOOTING.md#keeping-settings-in-your-dotfiles).
