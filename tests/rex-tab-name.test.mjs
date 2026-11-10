import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../config/pi/extensions/rex-tab-name.ts", import.meta.url), "utf8"),
).replace("export default function", "globalThis.install = function");

const success = { code: 0, stdout: "", stderr: "", killed: false };
const pane = { ...success, stdout: JSON.stringify({ block: { window_id: "window:own" } }) };

function setup({ name = "Current task", env = { REX_SESSION: "session:own", REX_BLOCK: "block:own" }, exec } = {}) {
  const handlers = {};
  const calls = [];
  const warnings = [];
  const context = vm.createContext({ process: { env } });
  vm.runInContext(source, context);
  context.install({
    on: (event, handler) => { handlers[event] = handler; },
    getSessionName: () => name,
    exec: async (command, args, options) => {
      assert.equal(command, "rex");
      assert.equal(options.timeout, 5000);
      calls.push(Array.from(args));
      return exec ? exec(args) : args.includes("inspect") ? pane : success;
    },
  });
  const ctx = { mode: "tui", hasUI: true, ui: { notify: (message, level) => warnings.push({ message, level }) } };
  return { handlers, calls, warnings, ctx };
}

const inspectArgs = ["--autostart=false", "block", "inspect", "-s", "session:own", "block:own", "--json"];
const renameArgs = (name) => ["--autostart=false", "window", "rename", "-s", "session:own", "--", "window:own", name];

test("syncs the current name on startup, reload, resume, new, and fork", async () => {
  for (const reason of ["startup", "reload", "resume", "new", "fork"]) {
    const app = setup();
    await app.handlers.session_start({ reason }, app.ctx);
    assert.deepEqual(app.calls, [inspectArgs, renameArgs("Current task")]);
    assert.deepEqual(app.warnings, []);
  }
});

test("manual and automatic name changes preserve the exact title as one argument", async () => {
  const app = setup();
  const title = '--name "My task"; $(touch /tmp/not-executed)';
  await app.handlers.session_info_changed({ name: title }, app.ctx);
  assert.deepEqual(app.calls, [inspectArgs, renameArgs(title)]);
});

test("unnamed and cleared sessions reset the tab name to Pi", async () => {
  const app = setup({ name: "" });
  await app.handlers.session_start({}, app.ctx);
  await app.handlers.session_info_changed({ name: undefined }, app.ctx);
  assert.deepEqual(app.calls, [inspectArgs, renameArgs("Pi"), inspectArgs, renameArgs("Pi")]);
});

test("does nothing outside Rex or in noninteractive Pi", async () => {
  for (const env of [{}, { REX_SESSION: "session:own" }, { REX_BLOCK: "block:own" }]) {
    const app = setup({ env });
    await app.handlers.session_start({}, app.ctx);
    await app.handlers.session_info_changed({ name: "Ignore" }, app.ctx);
    assert.deepEqual(app.calls, []);
  }
  for (const mode of ["rpc", "json", "print"]) {
    const app = setup();
    const ctx = { ...app.ctx, mode };
    await app.handlers.session_start({}, ctx);
    await app.handlers.session_info_changed({ name: "Ignore" }, ctx);
    assert.deepEqual(app.calls, []);
  }
});

test("failed inspection never guesses a tab and later updates still work", async () => {
  for (const failure of [
    { ...success, code: 1, stderr: "pane unavailable" },
    { ...success, killed: true },
    { ...success, stdout: "not JSON" },
    { ...success, stdout: JSON.stringify({ block: {} }) },
    { ...success, stdout: JSON.stringify({ block: { window_id: 1 } }) },
    { ...success, stdout: JSON.stringify({ block: { window_id: "" } }) },
    { ...success, stdout: JSON.stringify({ block: { window_id: "focused" } }) },
    new Error("rex executable missing"),
  ]) {
    let fail = true;
    const app = setup({ exec: async (args) => {
      if (fail) {
        if (failure instanceof Error) throw failure;
        return failure;
      }
      return args.includes("inspect") ? pane : success;
    } });
    await app.handlers.session_start({}, app.ctx);
    assert.deepEqual(app.calls, [inspectArgs]);
    assert.equal(app.warnings.length, 1);
    assert.equal(app.warnings[0].level, "warning");
    assert.match(app.warnings[0].message, /Rex tab rename failed:/);
    fail = false;
    await app.handlers.session_info_changed({ name: "Recovered" }, app.ctx);
    assert.deepEqual(app.calls.slice(1), [inspectArgs, renameArgs("Recovered")]);
  }
});

test("reports rename failures without rejecting the Pi event", async () => {
  const app = setup({ exec: async (args) => args.includes("inspect") ? pane : { ...success, code: 1, stderr: "window closed" } });
  await app.handlers.session_start({}, app.ctx);
  assert.equal(app.warnings.length, 1);
  assert.match(app.warnings[0].message, /window closed/);
});

test("serializes overlapping updates so the latest name wins", async () => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const app = setup({ exec: async (args) => {
    if (args.includes("inspect")) {
      await wait;
      return pane;
    }
    return success;
  } });
  const first = app.handlers.session_info_changed({ name: "First" }, app.ctx);
  const second = app.handlers.session_info_changed({ name: "Second" }, app.ctx);
  await Promise.resolve();
  assert.deepEqual(app.calls, [inspectArgs]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(app.calls, [inspectArgs, renameArgs("First"), inspectArgs, renameArgs("Second")]);
});
