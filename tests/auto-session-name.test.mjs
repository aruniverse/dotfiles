import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

// Run the real extension with a fake provider, never an authenticated model.
const source = stripTypeScriptTypes(
  readFileSync(new URL("../config/pi/extensions/auto-session-name.ts", import.meta.url), "utf8"),
).replace('import { complete } from "@earendil-works/pi-ai/compat";', "")
  .replace("export default function", "globalThis.install = function");

function setup({ name = "", fail = false } = {}) {
  const handlers = {};
  let calls = 0;
  const context = vm.createContext({
    complete: async () => {
      calls++;
      if (fail) throw new Error("provider unavailable");
      return { content: [{ type: "text", text: '"Fix configuration."' }] };
    },
  });
  vm.runInContext(source, context);
  context.install({
    on: (event, handler) => { handlers[event] = handler; },
    getSessionName: () => name,
    setSessionName: (value) => { name = value; },
  });
  const ctx = {
    model: {},
    modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test" }) },
    sessionManager: {
      getBranch: () => [{
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "Review PR #3" }] },
      }],
    },
  };
  handlers.session_start({}, ctx);
  return { handlers, ctx, name: () => name, calls: () => calls };
}

test("names once, strips punctuation, and preserves the PR reference", async () => {
  const app = setup();
  await app.handlers.agent_end({}, app.ctx);
  assert.equal(app.name(), "#3 Fix configuration");
  await app.handlers.agent_end({}, app.ctx);
  assert.equal(app.calls(), 1);
});

test("does not replace a manually named session", async () => {
  const app = setup({ name: "Manual title" });
  await app.handlers.agent_end({}, app.ctx);
  assert.equal(app.name(), "Manual title");
  assert.equal(app.calls(), 0);
});

test("missing model or credentials makes no provider request", async () => {
  const app = setup();
  await app.handlers.agent_end({}, { ...app.ctx, model: undefined });
  app.ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: false });
  await app.handlers.agent_end({}, app.ctx);
  assert.equal(app.calls(), 0);
  assert.equal(app.name(), "");
});

test("provider failure does not break the session", async () => {
  const app = setup({ fail: true });
  await app.handlers.agent_end({}, app.ctx);
  assert.equal(app.name(), "");
});
