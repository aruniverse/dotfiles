import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import extension from "../config/pi/extensions/saved-handoff/index.ts";

function harness({ tokens = 210_000, gap = 31, choice, cancelled = false } = {}) {
	const entries = [{ type: "message", id: "last", timestamp: new Date(Date.now() - gap * 60_000).toISOString(), message: { role: "assistant", stopReason: "stop" } }];
	const notices = [], sent = [], summaries = [], newEntries = [];
	let options, editor, selections = 0, completeFails = false;
	let events = {}, command;
	const pi = {
		on: (name, handler) => { events[name] = handler; },
		appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
		sendUserMessage: (text, options) => sent.push({ text, options }),
		registerCommand: (name, def) => { command = { name, ...def }; },
	};
	const context = {
		mode: "tui", model: { id: "test" }, getContextUsage: () => ({ tokens }), isIdle: () => true,
		sessionManager: {
			getSessionId: () => "old-id", getSessionFile: () => "/private/old.jsonl", getBranch: () => entries, getEntries: () => entries,
			buildSessionContext: () => ({ messages: [
				{ role: "user", content: "Prepare next step" },
				{ role: "assistant", content: [{ type: "text", text: "A confirmed decision. " + "x".repeat(1_000_000) }] },
				...Array.from({ length: 11 }, () => ({ role: "assistant", content: [{ type: "toolCall", name: "read" }] })),
				{ role: "toolResult", content: [{ type: "text", text: "DO NOT COPY THIS FULL LOG" }] },
			] }),
		},
		modelRegistry: { complete: async (_model, prompt, opts) => {
			summaries.push({ prompt, opts });
			if (completeFails) throw new Error("unavailable");
			return { stopReason: "stop", content: [{ type: "text", text: "Verified targeted tests." }], usage: { cost: { total: .012 } } };
		} },
		ui: {
			select: async (title, choices) => { selections++; options = { title, choices }; return choice; },
			setEditorText: (text) => { editor = text; },
			notify: (text) => notices.push(text),
		},
		newSession: async (o) => {
			assert.equal(o.parentSession, "/private/old.jsonl");
			if (cancelled) return { cancelled };
			await o.setup({ appendCustomMessageEntry: (...args) => newEntries.push(args) });
			await o.withSession({ ui: context.ui });
			return { cancelled };
		},
	};
	const draft = "Continue this particular task.\nKeep the exact draft.";
	extension(pi);
	return {
		entries, sent, summaries, newEntries, draft, context, notices,
		get editor() { return editor; }, get options() { return options; }, get selections() { return selections; },
		settle: (aborted = false) => events.agent_settled({ aborted }, context),
		input: (override) => events.input({ text: draft, source: "interactive", ...override }, context),
		failCompletion: () => { completeFails = true; },
		reload: () => { events = {}; extension(pi); },
		startFresh: () => command.handler("", context), shutdown: () => events.session_shutdown(),
	};
}

const flush = () => delay(5);

test("takes one bounded checkpoint at 150k, records its estimate and does not repeat on reload", async () => {
	const s = harness({ tokens: 150_000 });
	s.settle(); s.settle(); await flush(); s.reload(); s.settle(); await flush();
	assert.equal(s.summaries.length, 1);
	const [{ prompt, opts }] = s.summaries;
	assert.ok(prompt.messages[0].content.length < 2_000);
	assert.doesNotMatch(prompt.messages[0].content, /FULL LOG/);
	assert.match(prompt.messages[0].content, /confirmed decision/);
	assert.equal(opts.cacheRetention, "none");
	assert.equal(opts.maxTokens, 450);
	assert.deepEqual(s.entries.at(-1).data, { sessionId: "old-id", anchor: "last", summary: "Verified targeted tests.", estimatedUsd: .012 });
});

test("skips small and aborted runs and does not repeatedly retry a failed summary", async () => {
	const small = harness({ tokens: 149_999 }); small.settle();
	const big = harness(); big.settle(true); assert.equal(big.summaries.length, 0);
	big.failCompletion(); big.settle(); await flush(); big.reload(); big.settle();
	assert.equal(small.summaries.length, 0); assert.equal(big.summaries.length, 1);
	assert.equal(big.entries.at(-1).customType, "saved-handoff-attempt");
});

test("ignores quick switches, small sessions, commands, automation, queued prompts and images", async () => {
	const warm = harness({ gap: 29 }); await warm.input(); assert.equal(warm.selections, 0);
	const small = harness({ tokens: 199_999 }); await small.input(); assert.equal(small.selections, 0);
	const s = harness();
	for (const override of [{ text: "/reload" }, { source: "extension" }, { streamingBehavior: "steer" }, { images: [{ type: "image" }] }]) await s.input(override);
	assert.equal(s.selections, 0); assert.deepEqual(s.sent, []);
});

test("continue passes through unchanged; dismiss restores the draft without sending", async () => {
	const s = harness({ choice: "Continue here" }); assert.equal(await s.input(), undefined); assert.equal(s.selections, 1);
	const dismissed = harness(); assert.deepEqual(await dismissed.input(), { action: "handled" });
	assert.equal(dismissed.editor, dismissed.draft); assert.deepEqual(dismissed.sent, []);
});

test("fresh carries only the saved note and draft; the original entries are unchanged", async () => {
	const s = harness({ choice: "Start fresh (keep draft)" });
	s.entries.unshift({ type: "message", id: "older-turn" });
	s.entries.push({ type: "custom", customType: "saved-handoff", data: { sessionId: "old-id", anchor: "older-turn", summary: "Keep the agreed route." } });
	const before = structuredClone(s.entries);
	assert.deepEqual(await s.input(), { action: "handled" });
	assert.match(s.options.title, /older checkpoint/);
	await flush();
	assert.deepEqual(s.sent, [{ text: "/resume-with-handoff", options: { expandPromptTemplates: true } }]);
	await s.startFresh();
	assert.deepEqual(s.entries, before);
	assert.equal(s.editor, s.draft);
	assert.equal(s.newEntries.length, 1);
	assert.match(s.newEntries[0][1], /old-id.*\n[\s\S]*Keep the agreed route/);
});

test("a cancelled fresh start restores the draft, and missing handoffs use a pointer only", async () => {
	const cancelled = harness({ choice: "Start fresh (keep draft)", cancelled: true });
	await cancelled.input(); await flush(); await cancelled.startFresh();
	assert.equal(cancelled.editor, cancelled.draft); assert.equal(cancelled.newEntries.length, 0);
	const s = harness({ choice: "Start fresh (keep draft)" }); await s.input(); await flush(); await s.startFresh();
	assert.equal(s.editor, s.draft); assert.match(s.newEntries[0][1], /^Earlier Pi session: old-id.*$/);
});
