-- Custom Actions
-- These appear in the command palette and can be bound to keys or run via CLI:
--   rex do <action_name> [args...]

-- Open a dev layout: editor + shell split + logs window
rex.action{
  name  = "dev_layout",
  title = "Open Dev Layout",
  description = "Opens an editor with a terminal split and a logs window.",
  args  = { file = "string?", ratio = "number?" },
  run   = function(ctx, args)
    local shell = "com.superlogical.terminal.shell"
    local cwd = os.getenv("PWD") or os.getenv("HOME") or "/"
    local file = args.file or "app.log"
    local ratio = args.ratio or 0.65

    -- Main window: editor + shell below
    local w1, err = rex.session.new_window{
      label = "dev",
      layout = rex.layout.vertical(ratio,
        rex.layout.block{
          flavor = shell,
          options = { command = { "nvim", "." } },
        },
        rex.layout.block{ flavor = shell }
      ),
    }
    if err ~= nil then error(err, 0) end

    -- Second window for logs
    local w2, err2 = rex.session.new_window{
      label = "logs",
      layout = rex.layout.block{
        flavor = shell,
        options = { command = { "tail", "-f", file } },
      },
    }
    if err2 ~= nil then error(err2, 0) end

    return { dev_window = w1.window_id, logs_window = w2.window_id }
  end,
}

-- Open a single scratch window
rex.action{
  name  = "scratch",
  title = "Open Scratch Window",
  run   = function(ctx, args)
    local w, err = rex.session.new_window{
      layout = rex.layout.block{
        flavor = "com.superlogical.terminal.shell",
      },
    }
    if err ~= nil then error(err, 0) end
    return { window_id = w.window_id }
  end,
}

-- Pull dotfiles and report status
rex.action{
  name  = "pull_dotfiles",
  title = "Pull Dotfiles",
  run   = function(ctx, args)
    local dotfiles = os.getenv("DOTFILES_ROOT") or os.getenv("HOME") .. "/.dotfiles"
    local r, err = rex.exec(
      { "git", "pull", "--ff-only" },
      { cwd = dotfiles, timeout = 20 }
    )
    if r == nil then error(err, 0) end
    if not r.ok then error(r.stderr, 0) end
    return { output = r.stdout }
  end,
}

-- Focus mode: zoom + hide sidebar
rex.action{
  name  = "focus_mode",
  title = "Focus Mode",
  run   = function(ctx, args)
    rex.client.queue("pane.zoom")
    rex.client.queue("client.sidebar.toggle")
  end,
}
