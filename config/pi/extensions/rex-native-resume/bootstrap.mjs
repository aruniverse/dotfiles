import { accessSync, constants, existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { takeProgramResumeToken } from "./program-resume.ts";

export async function runPersona(persona) {
  if (!["work", "personal"].includes(persona)) throw new Error("Unknown Pi persona");
  // Capture before Pi loads: startup extensions and tools must not inherit the terminal secret.
  globalThis[Symbol.for("pi.rex.native-resume")] = { token: takeProgramResumeToken(), program: "pi-" + persona };
  const directory = join(homedir(), persona === "work" ? ".pi/agent" : ".pi/personas/personal");
  if (!existsSync(join(directory, "settings.json"))) throw new Error("Configure the " + persona + " persona first; refusing to use another profile.");
  process.env.PI_CODING_AGENT_DIR = directory;
  process.env.PI_PERSONA = persona;
  delete process.env.PI_CODING_AGENT_SESSION_DIR;
  if (persona === "personal") {
    delete process.env.COPILOT_GITHUB_TOKEN;
    process.env.PI_MCP_CONFIG_MODE = "exclusive";
  } else delete process.env.OPENROUTER_API_KEY;

  let cli;
  for (const folder of (process.env.PATH || "").split(":")) {
    const candidate = join(folder, "pi");
    try { accessSync(candidate, constants.X_OK); cli = realpathSync(candidate); break; } catch { }
  }
  if (!cli) throw new Error("pi is not on PATH");
  // Use Pi's exported SDK entry in-process, keeping this launcher's identity visible to Rex.
  // shortcut: npm Pi's SDK index sits beside its CLI; retire this when native profile flags ship.
  const sdk = join(dirname(cli), "index.js");
  if (!existsSync(sdk)) throw new Error("This bridge requires the npm-installed Pi SDK");
  const { main } = await import(pathToFileURL(sdk));
  if (typeof main !== "function") throw new Error("The installed Pi SDK does not expose its CLI entrypoint");
  process.env.PI_CODING_AGENT = "true";
  process.env.AI_AGENT = "pi";
  await main(process.argv.slice(2));
}
