import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("../config/pi/extensions/rex-pi-restore/index.ts", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "").replace("export default function", "globalThis.install = function");

function setup(t, { mode = "tui", persisted = true, disabled = false, fail = false, rex = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "rex-pi-registration-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const proc = new EventEmitter();
  proc.pid = 424242;
  proc.env = { XDG_STATE_HOME: root, ...(rex ? { REX_SESSION: "session:test", REX_BLOCK: "block:test" } : {}), ...(disabled ? { REX_PI_RESTORE: "0" } : {}) };
  const handlers = {}, calls = [], notices = [];
  const sandbox = vm.createContext({ process: proc, createHash, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, homedir, isAbsolute, join });
  vm.runInContext(source, sandbox);
  sandbox.install({
    on(event, handler) { handlers[event] = handler; },
    async exec(command, args) {
      calls.push({ command, args });
      return { code: fail ? 4 : 0, stdout: '{"instance_id":"server:one","session_id":"session:test","block_id":"block:test"}', stderr: fail ? "unreachable" : "" };
    },
  });
  const ctx = { mode, hasUI: mode === "tui", cwd: root, sessionManager: { getSessionFile: () => persisted ? join(root, "session.jsonl") : undefined }, ui: { notify: message => notices.push(message) } };
  const key = createHash("sha256").update("session:test\0block:test").digest("hex");
  const file = join(root, "rex-pi-restore", key + ".json");
  return { proc, handlers, calls, notices, ctx, root, file };
}

test("registers the exact persisted session and Rex instance with private permissions", async t => {
  const app = setup(t);
  await app.handlers.session_start({}, app.ctx);
  const record = JSON.parse(readFileSync(app.file, "utf8"));
  assert.equal(record.piSessionFile, join(app.root, "session.jsonl"));
  assert.equal(record.piPid, app.proc.pid);
  assert.equal(record.cwd, app.root);
  assert.equal(record.serverInstance, "server:one");
  assert.equal(statSync(app.file).mode & 0o777, 0o600);
  assert.equal(statSync(join(app.root, "rex-pi-restore")).mode & 0o777, 0o700);
  assert.equal(app.calls[0].command, "rex");
  assert.ok(app.calls[0].args.includes("--autostart=false"));
});

test("an intentional Pi exit removes only its own restore marker", async t => {
  const app = setup(t);
  await app.handlers.session_start({}, app.ctx);
  await app.handlers.session_shutdown({ reason: "quit" }, app.ctx);
  assert.equal(existsSync(app.file), false);
  assert.equal(app.proc.listenerCount("SIGHUP"), 0);
});

test("SIGHUP and SIGTERM keep the marker for a server restart", async t => {
  for (const signal of ["SIGHUP", "SIGTERM"]) {
    const app = setup(t);
    await app.handlers.session_start({}, app.ctx);
    app.proc.emit(signal);
    await app.handlers.session_shutdown({ reason: "quit" }, app.ctx);
    assert.equal(existsSync(app.file), true);
    assert.equal(app.proc.listenerCount(signal), 0);
  }
});

test("a signal arriving during shutdown still preserves the marker", async t => {
  const app = setup(t);
  await app.handlers.session_start({}, app.ctx);
  const shutdown = app.handlers.session_shutdown({ reason: "quit" }, app.ctx);
  app.proc.emit("SIGHUP");
  await shutdown;
  assert.equal(existsSync(app.file), true);
});

test("reload retains the marker and replaces rather than duplicates signal listeners", async t => {
  const app = setup(t);
  await app.handlers.session_start({}, app.ctx);
  await app.handlers.session_shutdown({ reason: "reload" }, app.ctx);
  assert.equal(existsSync(app.file), true);
  await app.handlers.session_start({}, app.ctx);
  assert.equal(app.proc.listenerCount("SIGTERM"), 1);
});

test("switching Pi sessions retires the previous session mapping", async t => {
  const app = setup(t);
  await app.handlers.session_start({}, app.ctx);
  await app.handlers.session_shutdown({ reason: "resume" }, app.ctx);
  assert.equal(existsSync(app.file), false);
  app.ctx.sessionManager.getSessionFile = () => join(app.root, "second.jsonl");
  await app.handlers.session_start({}, app.ctx);
  assert.equal(JSON.parse(readFileSync(app.file, "utf8")).piSessionFile, join(app.root, "second.jsonl"));
});

test("shutdown never removes another Pi process's newer mapping", async t => {
  const app = setup(t);
  await app.handlers.session_start({}, app.ctx);
  const newer = { ...JSON.parse(readFileSync(app.file, "utf8")), piPid: 9999 };
  writeFileSync(app.file, JSON.stringify(newer));
  await app.handlers.session_shutdown({ reason: "quit" }, app.ctx);
  assert.equal(JSON.parse(readFileSync(app.file, "utf8")).piPid, 9999);
});

test("headless, disabled, and ephemeral sessions never register or install signal handlers", async t => {
  for (const options of [{ mode: "print" }, { mode: "rpc" }, { disabled: true }, { persisted: false }]) {
    const app = setup(t, options);
    await app.handlers.session_start({}, app.ctx);
    await app.handlers.session_shutdown({ reason: "quit" }, app.ctx);
    assert.equal(existsSync(app.file), false);
    assert.equal(app.calls.length, 0);
    assert.equal(app.proc.listenerCount("SIGTERM"), 0);
  }
});

test("ephemeral and disabled foreground sessions retire stale conversation mappings", async t => {
  for (const options of [{ persisted: false }, { disabled: true }]) {
    const app = setup(t, options);
    mkdirSync(join(app.root, "rex-pi-restore"));
    writeFileSync(app.file, '{"piPid":9999}');
    await app.handlers.session_start({}, app.ctx);
    assert.equal(existsSync(app.file), false);
  }
});

test("outside Rex the extension installs no handlers", t => {
  const app = setup(t, { rex: false });
  assert.equal(Object.keys(app.handlers).length, 0);
});

test("an unavailable Rex server warns without blocking Pi", async t => {
  const app = setup(t, { fail: true });
  await app.handlers.session_start({}, app.ctx);
  assert.equal(existsSync(app.file), false);
  assert.match(app.notices[0], /registration failed: unreachable/);
});
