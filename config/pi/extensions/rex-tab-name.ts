import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const { REX_SESSION: session, REX_BLOCK: block } = process.env;
  let pending = Promise.resolve();

  async function rex(args: string[]): Promise<string> {
    const result = await pi.exec("rex", ["--autostart=false", ...args], { timeout: 5000 });
    if (result.code !== 0 || result.killed) {
      throw new Error(result.stderr.trim() || "Rex command failed or timed out");
    }
    return result.stdout;
  }

  function syncTab(name: string | undefined, ctx: ExtensionContext) {
    if (ctx.mode !== "tui" || !session || !block) return;

    // Serialize updates so a slower rename cannot overwrite a newer name.
    pending = pending.then(async () => {
      const pane = JSON.parse(await rex(["block", "inspect", "-s", session, block, "--json"]));
      const windowId = pane.block?.window_id;
      if (typeof windowId !== "string" || !windowId.startsWith("window:")) {
        throw new Error("Rex did not return this pane's tab ID");
      }
      await rex(["window", "rename", "-s", session, "--", windowId, name || "Pi"]);
    }).catch((error: unknown) => {
      if (ctx.hasUI) ctx.ui.notify(`Rex tab rename failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
    });
    return pending;
  }

  pi.on("session_start", (_event, ctx) => syncTab(pi.getSessionName(), ctx));
  pi.on("session_info_changed", (event, ctx) => syncTab(event.name, ctx));
}
