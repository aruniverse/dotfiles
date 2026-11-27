-- Keybindings
--
-- Modifier aliases: cmd/command/super/meta/win, ctrl/control, alt/opt/option, shift
-- Key names: enter, escape, tab, space, backspace, delete, left, right, up, down,
--            home, end, pageup, pagedown, f1-f12
-- Physical keys: ctrl+[KeyA] (W3C KeyboardEvent.code)
-- Sequences: ctrl+b>c

-- ── Tmux-style prefix bindings (Ctrl+B) ───────────────────────────
rex.bind("ctrl+b>c", "client.tab.new")
rex.bind("ctrl+b>n", "client.tab.next")
rex.bind("ctrl+b>p", "client.tab.previous")
rex.bind("ctrl+b>shift+5", "pane.split", { direction = "right" })   -- % on US layout
rex.bind("ctrl+b>shift+'", "pane.split", { direction = "down" })    -- " on US layout
rex.bind("ctrl+b>z", "pane.zoom")
rex.bind("ctrl+b>x", "pane.close")
rex.bind("ctrl+b>q", "client.quit")

-- Send prefix through when doubled
rex.bind("ctrl+b>ctrl+b", "pane.send_key", { key = "ctrl+b" })

-- ── Pane navigation ────────────────────────────────────────────────
rex.bind("cmd+shift+h", "pane.navigate", { direction = "left" })
rex.bind("cmd+shift+j", "pane.navigate", { direction = "down" })
rex.bind("cmd+shift+k", "pane.navigate", { direction = "up" })
rex.bind("cmd+shift+l", "pane.navigate", { direction = "right" })

-- ── Resize mode ───────────────────────────────────────────────────
rex.mode("resize", { exclusive = true })
rex.bind("cmd+r", "client.mode.enter", { name = "resize", once = true })

rex.bind("resize/left",  "pane.resize", { direction = "left" })
rex.bind("resize/right", "pane.resize", { direction = "right" })
rex.bind("resize/up",    "pane.resize", { direction = "up" })
rex.bind("resize/down",  "pane.resize", { direction = "down" })

rex.bind("resize/shift+left",  "pane.resize", { direction = "left",  amount = 15 })
rex.bind("resize/shift+right", "pane.resize", { direction = "right", amount = 15 })
rex.bind("resize/shift+up",    "pane.resize", { direction = "up",    amount = 15 })
rex.bind("resize/shift+down",  "pane.resize", { direction = "down",  amount = 15 })

rex.bind("resize/=",    "pane.balance")
rex.bind("resize/enter", "client.mode.exit")
rex.bind("resize/escape", "client.mode.exit")

-- ── Session management ────────────────────────────────────────────
rex.bind("cmd+shift+s", "session.switch")
rex.bind("cmd+shift+n", "session.new")

-- ── Quick splits ──────────────────────────────────────────────────
rex.bind("cmd+d", "pane.split", { direction = "right" })
rex.bind("shift+cmd+d", "pane.split", { direction = "down" })
