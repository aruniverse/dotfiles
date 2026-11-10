import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Started = {
  id?: string;
  asyncDir?: string;
  sessionRoot?: string;
  sessionId?: string;
  mode?: string;
  agent?: string;
};

// Use the existing inspector, not a second Pi or a session attach.
// shortcut: This resolver follows pi-subagents' package layout; update it if the CLI entrypoint moves.
function inspectorRunner(): string {
  const require = createRequire(join(homedir(), ".pi/agent/npm/package.json"));
  const entry = require.resolve("pi-subagents/inspectors");
  const runner = join(dirname(dirname(entry)), "inspector-runner.mjs");
  if (!existsSync(runner)) throw new Error("The installed pi-subagents inspector runner is unavailable.");
  return runner;
}

export default function (pi: ExtensionAPI) {
  const { REX_SESSION: session, REX_BLOCK: block, REX_SERVER: server } = process.env;
  const seen = new Set<string>();
  let enabled = true;
  let unsubscribe: (() => void) | undefined;
  let controller: AbortController | undefined;

  function detach() {
    unsubscribe?.();
    unsubscribe = undefined;
    controller?.abort();
  }

  async function rex(args: string[], signal: AbortSignal) {
    const result = await pi.exec("rex", ["--autostart=false", ...(server ? ["--server", server] : []), ...args], { signal, timeout: 5000 });
    if (result.code !== 0 || result.killed) throw new Error(result.stderr.trim() || "Rex request failed or timed out; inspect Rex before retrying.");
    return JSON.parse(result.stdout);
  }

  async function open(event: Started, signal: AbortSignal, offset: number) {
    const runner = inspectorRunner();
    const parent = await rex(["block", "inspect", "-s", session!, block!, "--json"], signal);
    if (signal.aborted || !enabled) return;
    const window = parent.block?.window_id;
    if (typeof window !== "string" || !window.startsWith("window:")) throw new Error("Rex did not return this pane's tab ID.");
    const roots = typeof event.sessionRoot === "string" && isAbsolute(event.sessionRoot) ? [event.sessionRoot] : [];
    const label = `Subagent: ${typeof event.agent === "string" ? event.agent : "worker"} · ${event.id!.slice(-8)}`.replace(/\p{C}/gu, "").slice(0, 128);
    await rex(["api", "call", "-s", session!, "session.new_layer", JSON.stringify({
      session_id: session,
      window_id: window,
      bounds: [0.08 + offset, 0.10 + offset, 0.80, 0.72],
      focus: false,
      layout: { block: {
        flavor: "com.superlogical.terminal.shell",
        label,
        options: {
          shell: "none",
          command: [process.execPath, runner, "--async-dir", event.asyncDir!, "--run-id", event.id!,
            "--allow-steer", "false", "--allow-stop", "false",
            "--session-roots", Buffer.from(JSON.stringify(roots)).toString("base64")],
        },
      } },
    })], signal);
  }

  pi.on("session_start", (_event, ctx) => {
    detach();
    if (!ctx.hasUI || !session || !block) return;
    controller = new AbortController();
    const signal = controller.signal;
    // pi-subagents identifies persisted parents by session-file path, not their UUID.
    const parentId = ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();
    unsubscribe = pi.events.on("subagent:async-started", (data) => {
      if (!enabled || signal.aborted || !data || typeof data !== "object") return;
      const event = data as Started;
      if (event.sessionId !== parentId || event.mode === "workflow") return;
      if (typeof event.id !== "string" || !event.id || typeof event.asyncDir !== "string" || !isAbsolute(event.asyncDir)) return;
      const key = `${parentId}:${event.id}`;
      if (seen.has(key)) return;
      // Reserve before awaiting: duplicate start events must not create duplicate panes.
      seen.add(key);
      void open(event, signal, ((seen.size - 1) % 4) * 0.025).catch((error: unknown) => {
        if (!signal.aborted) ctx.ui.notify(`Rex subagent popup failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
      });
    });
  });

  pi.on("session_shutdown", detach);
  pi.registerCommand("rex-subagents", {
    description: "Automatic Rex subagent popups: on, off, or status (default: on; resets on reload).",
    handler: async (args, ctx) => {
      const action = args.trim();
      if (action === "on") enabled = true;
      else if (action === "off") enabled = false;
      else if (action && action !== "status") {
        ctx.ui.notify("Usage: /rex-subagents [on|off|status]", "warning");
        return;
      }
      ctx.ui.notify(`Rex subagent popups: ${enabled ? "on" : "off"}${!session || !block ? " (requires a Rex terminal)" : ""}. Existing popups and child runs are unchanged.`, "info");
    },
  });
}
