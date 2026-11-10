import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../config/pi/extensions/rex-subagent-popups/index.ts", import.meta.url), "utf8"),
).replace(/^import .*;\n/gm, "").replace("export default function", "globalThis.install = function");

function setup({ hasUI = true, inspectCode = 0, persisted = true,
  env = { REX_SESSION: "session:test", REX_BLOCK: "block:parent" },
  runnerExists = true, windowId = "window:parent",
} = {}) {
  const events = new EventEmitter();
  const handlers = new Map();
  const commands = new Map();
  const calls = [];
  const notices = [];
  const ctx = {
    hasUI,
    sessionManager: {
      getSessionId: () => "parent-pi",
      getSessionFile: () => persisted ? "/tmp/parent-pi.jsonl" : undefined,
    },
    ui: { notify: (message) => notices.push(message) },
  };
  const sandbox = vm.createContext({
    process: { env, execPath: "/test/node" }, Buffer, AbortController,
    existsSync: () => runnerExists,
    createRequire: () => ({ resolve: () => "/test/pi-subagents/bundle/inspectors.js" }),
    homedir: () => "/test/home", dirname, isAbsolute, join,
  });
  vm.runInContext(source, sandbox);
  sandbox.install({
    events: {
      on(name, handler) {
        events.on(name, handler);
        return () => events.off(name, handler);
      },
    },
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    async exec(command, args, options) {
      calls.push({ command, args, options });
      if (args.includes("inspect")) return { code: inspectCode, stdout: JSON.stringify({ block: { window_id: windowId } }), stderr: "not found" };
      return { code: 0, stdout: JSON.stringify({ layer_id: "layer:watch", block_ids: ["block:watch"] }), stderr: "" };
    },
  });
  handlers.get("session_start")({}, ctx);
  const event = {
    id: "run-12345678", asyncDir: "/tmp/subagent-run", sessionRoot: "/tmp/child sessions",
    sessionId: persisted ? "/tmp/parent-pi.jsonl" : "parent-pi", mode: "single", agent: "worker",
  };
  const emit = (data = event) => events.emit("subagent:async-started", data);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { handlers, commands, calls, notices, ctx, event, emit, flush };
}

test("opens a readonly floating inspector in the parent's tab without taking focus", async () => {
  const app = setup();
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 2);
  const call = app.calls[1];
  assert.equal(call.command, "rex");
  assert.equal(call.options.timeout, 5000);
  assert.ok(call.args.includes("session.new_layer"));
  const payload = JSON.parse(call.args.at(-1));
  assert.equal(payload.session_id, "session:test");
  assert.equal(payload.window_id, "window:parent");
  assert.equal(payload.focus, false);
  assert.equal(payload.layout.block.flavor, "com.superlogical.terminal.shell");
  const options = payload.layout.block.options;
  assert.equal(options.shell, "none");
  assert.equal(options.command[0], "/test/node");
  assert.equal(options.command[1], "/test/pi-subagents/inspector-runner.mjs");
  assert.equal(options.command[options.command.indexOf("--run-id") + 1], app.event.id);
  assert.equal(options.command[options.command.indexOf("--allow-stop") + 1], "false");
  assert.equal(options.command[options.command.indexOf("--allow-steer") + 1], "false");
  const roots = options.command[options.command.indexOf("--session-roots") + 1];
  assert.deepEqual(JSON.parse(Buffer.from(roots, "base64").toString()), [app.event.sessionRoot]);
  assert.deepEqual(app.notices, []);
});

test("duplicate start events open only one popup, including concurrent duplicates", async () => {
  const app = setup();
  app.emit(); app.emit();
  await app.flush();
  assert.equal(app.calls.length, 2);
});

test("ephemeral sessions use their UUID when no session file exists", async () => {
  const app = setup({ persisted: false });
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 2);
});

test("events belonging to other parent sessions are ignored", async () => {
  const app = setup();
  app.emit({ ...app.event, sessionId: "another-parent" });
  await app.flush();
  assert.equal(app.calls.length, 0);
});

test("headless sessions and terminals outside Rex never open panes", async () => {
  for (const options of [{ hasUI: false }, { env: {} }, { env: { REX_SESSION: "session:test" } }]) {
    const app = setup(options);
    app.emit();
    await app.flush();
    assert.equal(app.calls.length, 0);
  }
});

test("a workflow container does not create an extra popup before its children", async () => {
  const app = setup();
  app.emit({ ...app.event, mode: "workflow" });
  await app.flush();
  assert.equal(app.calls.length, 0);
});

test("off prevents new popups and on re-enables them", async () => {
  const app = setup();
  await app.commands.get("rex-subagents").handler("off", app.ctx);
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 0);
  await app.commands.get("rex-subagents").handler("on", app.ctx);
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 2);
});

test("status and invalid commands do not change the enabled setting", async () => {
  const app = setup();
  await app.commands.get("rex-subagents").handler("status", app.ctx);
  assert.match(app.notices.at(-1), /popups: on/);
  await app.commands.get("rex-subagents").handler("unknown", app.ctx);
  assert.match(app.notices.at(-1), /Usage:/);
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 2);
});

test("Rex failures warn without throwing or changing child execution", async () => {
  const app = setup({ inspectCode: 3 });
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 1);
  assert.match(app.notices[0], /popup failed/i);
});

test("an invalid parent window never opens a popup in a guessed tab", async () => {
  const app = setup({ windowId: "not-a-window" });
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 1);
  assert.match(app.notices[0], /tab ID/);
});

test("a missing inspector runner warns without launching Rex", async () => {
  const app = setup({ runnerExists: false });
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 0);
  assert.match(app.notices[0], /inspector runner is unavailable/);
});

test("shutdown aborts pending UI work without closing popups or stopping children", async () => {
  const app = setup();
  app.emit();
  app.handlers.get("session_shutdown")();
  await app.flush();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].options.signal.aborted, true);
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 1);
});

test("a new session replaces the subscription rather than accumulating listeners", async () => {
  const app = setup();
  app.handlers.get("session_start")({}, app.ctx);
  app.emit();
  await app.flush();
  assert.equal(app.calls.length, 2);
});

test("malformed start events do not launch anything", async () => {
  const app = setup();
  for (const event of [null, "invalid", {}, { ...app.event, asyncDir: "relative/path" }, { ...app.event, id: 1 }]) app.emit(event);
  await app.flush();
  assert.equal(app.calls.length, 0);
});

test("Rex server selection and paths with spaces stay literal arguments", async () => {
  const server = "unix:///tmp/Rex Server/server.sock";
  const app = setup({ env: { REX_SESSION: "session:test", REX_BLOCK: "block:parent", REX_SERVER: server } });
  const asyncDir = "/tmp/child runs; $(not-a-command)";
  app.emit({ ...app.event, asyncDir });
  await app.flush();
  assert.deepEqual(Array.from(app.calls[0].args.slice(0, 3)), ["--autostart=false", "--server", server]);
  const command = JSON.parse(app.calls[1].args.at(-1)).layout.block.options.command;
  assert.equal(command[command.indexOf("--async-dir") + 1], asyncDir);
});
