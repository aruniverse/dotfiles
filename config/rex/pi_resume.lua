-- Pi reports authenticated OSC 7577 commands; these rules allow only private session files.
-- Older Rex releases should still load the rest of the user's configuration.
if not rex.set or not rex.match or not rex.match.under then return end
-- No per-run tool restrictions, inline prompts, or credentials are silently dropped.
local flags = {
  ["--session"] = { "drop", values = 1 },
  ["--session-id"] = { "drop", values = 1 },
  ["--fork"] = { "drop", values = 1 },
  ["--model"] = { "drop", values = 1 },
  ["--provider"] = { "drop", values = 1 },
  ["--thinking"] = { "drop", values = 1 },
  ["--name"] = { "drop", values = 1 },
  ["-n"] = { "drop", values = 1 },
  ["--continue"] = "drop",
  ["-c"] = "drop",
  ["--resume"] = "drop",
  ["-r"] = "drop",
}
for name, directory in pairs({
  pi = "~/.pi/agent/sessions",
  ["pi-work"] = "~/.pi/agent/sessions",
  ["pi-personal"] = "~/.pi/personas/personal/sessions",
}) do
  rex.set("resume.trust." .. name, {
    command = { name, "--session", rex.match.under(directory) },
    flags = flags,
  })
end

-- Also trust the merged upstream reporter's canonical session-ID commands.
rex.set("resume.trust.pi-session-id", {
  command = { "pi", "--session", rex.match.uuid },
  flags = flags,
})
local scopedFlags = {}
for name, value in pairs(flags) do scopedFlags[name] = value end
scopedFlags["--session-dir"] = { "drop", values = 1 }
rex.set("resume.trust.pi-scoped-session-id", {
  command = { "pi", "--session-dir", rex.match.under("~/.pi/agent/sessions"), "--session", rex.match.uuid },
  flags = scopedFlags,
})
