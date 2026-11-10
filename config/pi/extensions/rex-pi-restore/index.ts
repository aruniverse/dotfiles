import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const { REX_SESSION: rexSession, REX_BLOCK: rexBlock, REX_SERVER: rexServer } = process.env;
  if (!rexSession || !rexBlock) return;
  const stateRoot = process.env.XDG_STATE_HOME || join(homedir(), ".local/state");
  const key = createHash("sha256").update(`${rexSession}\0${rexBlock}`).digest("hex");
  const directory = join(stateRoot, "rex-pi-restore");
  const file = join(directory, `${key}.json`);
  let pending = Promise.resolve();
  let interrupted = false;
  let listening = false;
  const markInterrupted = () => { interrupted = true; };

  function listen() {
    if (listening) return;
    interrupted = false;
    process.prependListener("SIGHUP", markInterrupted);
    process.prependListener("SIGTERM", markInterrupted);
    listening = true;
  }

  function unlisten() {
    process.off("SIGHUP", markInterrupted);
    process.off("SIGTERM", markInterrupted);
    listening = false;
  }

  function register(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;
    const piSessionFile = ctx.sessionManager.getSessionFile();
    const cwd = ctx.cwd;
    if (!piSessionFile || process.env.REX_PI_RESTORE === "0") {
      // An ephemeral or opted-out foreground session must not resurrect an older conversation.
      try { unlinkSync(file); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") ctx.ui.notify("Could not retire the previous Rex Pi restore marker.", "warning");
      }
      return;
    }
    listen();
    pending = pending.then(async () => {
      if (!isAbsolute(stateRoot) || !isAbsolute(piSessionFile)) throw new Error("Restore state and Pi session paths must be absolute.");
      const args = ["--autostart=false", ...(rexServer ? ["--server", rexServer] : []), "whoami", "--json"];
      const result = await pi.exec("rex", args, { timeout: 5000 });
      if (result.code !== 0 || result.killed) throw new Error(result.stderr.trim() || "Could not query the Rex server.");
      const identity = JSON.parse(result.stdout);
      if (typeof identity.instance_id !== "string" || !identity.instance_id) throw new Error("Rex did not return its server instance ID.");
      if (identity.session_id !== rexSession || identity.block_id !== rexBlock) throw new Error("The connected Rex server did not confirm this pane.");
      const record = {
        version: 1, rexSession, rexBlock,
        serverInstance: identity.instance_id,
        piSessionFile, piPid: process.pid, cwd,
      };
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
        renameSync(temporary, file);
      } finally {
        try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    }).catch((error: unknown) => {
      ctx.ui.notify(`Rex Pi restore registration failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
    });
    return pending;
  }

  pi.on("session_start", (_event, ctx) => register(ctx));
  pi.on("session_shutdown", async (event, ctx) => {
    if (!listening) return;
    await pending;
    // Let every signal handler run before distinguishing an interruption from a normal exit.
    await Promise.resolve();
    try {
      if (event.reason !== "reload" && !interrupted) {
        const record = JSON.parse(readFileSync(file, "utf8"));
        if (record.piPid === process.pid) unlinkSync(file);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && ctx.hasUI) {
        ctx.ui.notify(`Rex Pi restore cleanup failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
      }
    } finally {
      unlisten();
    }
  });
}
