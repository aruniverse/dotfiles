import { closeSync, existsSync, openSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { takeProgramResumeToken } from "./program-resume.ts";
import { ProgramResumeReporter } from "./program-resume-reporter.ts";

type ResumeState = { token?: string; program: string };
const STATE = Symbol.for("pi.rex.native-resume");
const VALUE_FLAGS = new Set(["--session", "--session-id", "--fork", "--model", "--provider", "--thinking", "--name", "-n"]);
const SWITCH_FLAGS = new Set(["--continue", "-c", "--resume", "-r"]);

// Do not silently drop tool restrictions, custom prompts, or per-run credentials on resume.
export function hasUnsafeLaunchOptions(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--") break;
    if (!argument.startsWith("-")) continue; // Never replay positional task prompts.
    const name = argument.split("=", 1)[0];
    if (VALUE_FLAGS.has(name)) {
      if (!argument.includes("=")) i++;
    } else if (!SWITCH_FLAGS.has(name)) return true;
  }
  return false;
}

export default function (pi: ExtensionAPI) {
  const globals = globalThis as typeof globalThis & { [key: symbol]: ResumeState | undefined };
  const incoming = takeProgramResumeToken();
  const state = globals[STATE] ?? (globals[STATE] = { token: incoming, program: "pi" });
  if (!state.token) state.token = incoming;
  if (!state.token) return;
  let current: ExtensionContext | undefined;
  let interrupted = false;
  let warned = false;
  const unsupported = hasUnsafeLaunchOptions(process.argv.slice(2));
  const configured = process.env.PI_CODING_AGENT_DIR?.replace(/^~(?=\/|$)/, homedir());
  const agentDir = resolve(configured || resolve(homedir(), ".pi/agent"));
  const expected = resolve(homedir(), state.program === "pi-personal" ? ".pi/personas/personal" : ".pi/agent");

  const terminal = {
    write(sequence: string) {
      // Bypass Pi's stdout log routing; protocol bytes belong on the controlling terminal.
      const fd = openSync("/dev/tty", "w");
      try { writeSync(fd, sequence); } finally { closeSync(fd); }
    },
  };
  const reporter = new ProgramResumeReporter(state.token, () => terminal, () => {
    if (!current || current.mode !== "tui" || !process.stdout.isTTY || process.env.REX_PI_RESTORE === "0") return undefined;
    const file = current.sessionManager.getSessionFile();
    if (!file || !isAbsolute(file) || !existsSync(file)) return undefined;
    if (unsupported || agentDir !== expected || !["pi", "pi-work", "pi-personal"].includes(state.program)) {
      if (!warned) {
        current.ui.notify("Native Rex resume skipped: use pi-work/pi-personal for profiles, and avoid unsupported per-run options. No credentials or task prompts are recorded.", "warning");
        warned = true;
      }
      return undefined;
    }
    return { argv: [state.program, "--session", file], cwd: current.cwd };
  });
  function report(again = false) {
    try { again ? reporter.reportAgain() : reporter.report(); }
    catch { current?.ui.notify("Could not report the native Rex resume command; session work is unaffected.", "warning"); }
  }
  const markInterrupted = () => { interrupted = true; };
  const continued = () => report(true);
  function detach() {
    process.off("SIGHUP", markInterrupted);
    process.off("SIGTERM", markInterrupted);
    process.off("SIGCONT", continued);
  }
  pi.on("session_start", (_event, ctx) => {
    detach();
    current = ctx;
    interrupted = false;
    if (ctx.mode !== "tui" || !process.stdout.isTTY) return;
    process.prependListener("SIGHUP", markInterrupted);
    process.prependListener("SIGTERM", markInterrupted);
    process.on("SIGCONT", continued);
    report(true);
  });
  pi.on("message_end", () => report());
  pi.on("agent_start", () => report());
  pi.on("session_shutdown", async event => {
    await Promise.resolve(); // Let all handlers for a terminal-closing signal mark the interruption.
    try {
      if (!interrupted && event.reason !== "reload") reporter.clear();
    } catch { /* The terminal may already be gone. */ }
    detach();
    current = undefined;
  });
  pi.registerCommand("rex-resume", {
    description: "Refresh this session's native Rex resume hint without restarting anything.",
    handler: async (_args, ctx) => { current = ctx; report(true); },
  });
}
