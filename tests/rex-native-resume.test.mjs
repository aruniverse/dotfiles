import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { formatProgramResume, formatProgramResumeClear, takeProgramResumeToken } from "../config/pi/extensions/rex-native-resume/program-resume.ts";
import { ProgramResumeReporter } from "../config/pi/extensions/rex-native-resume/program-resume-reporter.ts";

const folder = fileURLToPath(new URL("../config/pi/extensions/rex-native-resume/", import.meta.url));
const source = stripTypeScriptTypes(readFileSync(join(folder, "index.ts"), "utf8"))
  .replace(/^import .*;\n/gm, "").replace("export function hasUnsafeLaunchOptions", "function hasUnsafeLaunchOptions")
  .replace("export default function", "globalThis.install = function");
const token = "dummy-token-replace-me";

function setup(t, { mode = "tui", options = [], program = "pi", personal = false, filePresent = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pi-native-resume-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "session.jsonl");
  if (filePresent) writeFileSync(file, '{"type":"session"}\n');
  const process = new EventEmitter();
  process.env = { OSC7577_TOKEN: token, ...(personal ? { PI_CODING_AGENT_DIR: join(root, ".pi/personas/personal") } : {}) };
  process.stdout = { isTTY: true };
  process.argv = ["node", "pi", ...options];
  const writes = [], notices = [], handlers = {};
  const sandbox = vm.createContext({
    process, ProgramResumeReporter, existsSync, isAbsolute, resolve, homedir: () => root,
    openSync: () => 99, closeSync: () => {}, writeSync: (_fd, text) => writes.push(text),
    takeProgramResumeToken: () => { const value = process.env.OSC7577_TOKEN; delete process.env.OSC7577_TOKEN; return value; },
  });
  sandbox[Symbol.for("pi.rex.native-resume")] = { token, program };
  vm.runInContext(source, sandbox);
  sandbox.install({ on(name, handler) { handlers[name] = handler; }, registerCommand() {} });
  const ctx = { mode, cwd: root, sessionManager: { getSessionFile: () => file }, ui: { notify: text => notices.push(text) } };
  return { root, file, process, writes, notices, handlers, ctx, sandbox };
}

function decode(sequence) {
  const body = sequence.slice("\x1b]7577;".length, -2);
  const macIndex = body.lastIndexOf(":mac=");
  assert.equal(body.slice(macIndex + 5), createHash("sha256").update(body.slice(0, macIndex) + ":" + token).digest("hex"));
  const fields = Object.fromEntries(body.split(":").map(pair => pair.split(/=(.*)/s).slice(0, 2)));
  return fields.argv ? fields.argv.split(",").map(value => Buffer.from(value, "base64").toString()) : fields;
}

test("upstream formatter matches the specification's SHA-256 examples", () => {
  const sender = { token, pid: 74877, time: 1795543200 };
  assert.equal(formatProgramResume({ argv: ["lazygit"], cwd: "/home/user/src/project" }, sender), "\x1b]7577;pid=74877:time=1795543200:argv=bGF6eWdpdA==:cwd=L2hvbWUvdXNlci9zcmMvcHJvamVjdA==:mac=35cb909805c380336efd3689a125acc774a9dec8422a1d21492ebec06ca758e1\x1b\\");
  assert.equal(formatProgramResumeClear(sender), "\x1b]7577;pid=74877:time=1795543200:clear=1:mac=c30603369f98fef581a4098be889175b0c74f0641e49f8b25f4326cb38f97c93\x1b\\");
});

test("upstream formatter rejects unreportable text, paths, and oversized commands", () => {
  const sender = { token, pid: 1, time: 1 };
  for (const command of [{ argv: [] }, { argv: ["./pi"] }, { argv: ["pi", "bad\narg"] }, { argv: ["pi", "\ud800"] }, { argv: ["pi"], cwd: "relative" }, { argv: Array(65).fill("pi") }, { argv: ["pi", "x".repeat(4096)] }]) {
    assert.equal(formatProgramResume(command, sender), undefined);
  }
});

test("token is removed from the environment", () => {
  const env = { OSC7577_TOKEN: token };
  assert.equal(takeProgramResumeToken(env), token);
  assert.equal(env.OSC7577_TOKEN, undefined);
});

test("upstream reporter deduplicates and can refresh or clear", () => {
  let command = { argv: ["pi", "--session", "/private/session.jsonl"] };
  const writes = [];
  const reporter = new ProgramResumeReporter(token, () => ({ write: text => writes.push(text) }), () => command);
  reporter.report(); reporter.report();
  assert.equal(writes.length, 1);
  reporter.reportAgain(); assert.equal(writes.length, 2);
  command = undefined; reporter.report();
  assert.equal(decode(writes.at(-1)).clear, "1");
});

test("bridge reports the exact file without credentials or positional prompts", t => {
  const app = setup(t, { options: ["--model", "example", "a task that must not replay"] });
  app.handlers.session_start({}, app.ctx);
  assert.deepEqual(decode(app.writes[0]), ["pi", "--session", app.file]);
  assert.equal(app.process.env.OSC7577_TOKEN, undefined);
});

test("first persisted message reports a newly created session", t => {
  const app = setup(t, { filePresent: false });
  app.handlers.session_start({}, app.ctx);
  assert.equal(app.writes.length, 0);
  writeFileSync(app.file, '{"type":"session"}\n');
  app.handlers.message_end({}, app.ctx);
  assert.equal(app.writes.length, 1);
});

test("normal quit clears, but terminal-closing signals retain the record", async t => {
  for (const signal of [undefined, "SIGHUP", "SIGTERM"]) {
    const app = setup(t);
    app.handlers.session_start({}, app.ctx);
    if (signal) app.process.emit(signal);
    await app.handlers.session_shutdown({ reason: "quit" });
    assert.equal(app.writes.length, signal ? 1 : 2);
    assert.equal(app.process.listenerCount("SIGTERM"), 0);
  }
});

test("reload retains the report and fg refreshes it", async t => {
  const app = setup(t);
  app.handlers.session_start({}, app.ctx);
  app.process.emit("SIGCONT"); assert.equal(app.writes.length, 2);
  await app.handlers.session_shutdown({ reason: "reload" });
  assert.equal(app.writes.length, 2);
});

test("headless sessions do not advertise", t => {
  const app = setup(t, { mode: "rpc" });
  app.handlers.session_start({}, app.ctx);
  assert.equal(app.writes.length, 0);
  assert.equal(app.process.env.OSC7577_TOKEN, undefined);
});

test("per-run credentials or tool restrictions cannot be silently dropped", t => {
  for (const options of [["--api-key", "private-key"], ["--no-tools"], ["--system-prompt", "private-prompt"]]) {
    const app = setup(t, { options });
    app.handlers.session_start({}, app.ctx);
    assert.equal(app.writes.length, 0);
    assert.equal(app.notices.length, 1);
    assert.equal(app.process.env.OSC7577_TOKEN, undefined);
  }
});

test("personal contexts require the fixed personal entrypoint", t => {
  const unsafe = setup(t, { personal: true });
  unsafe.handlers.session_start({}, unsafe.ctx);
  assert.equal(unsafe.writes.length, 0);
  const safe = setup(t, { personal: true, program: "pi-personal" });
  safe.handlers.session_start({}, safe.ctx);
  assert.deepEqual(decode(safe.writes[0]), ["pi-personal", "--session", safe.file]);
});
