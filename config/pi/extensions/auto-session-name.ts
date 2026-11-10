/**
 * Auto-names pi sessions after the first completed agent turn.
 *
 * After the first prompt finishes, sends only the first user message (≤500 chars)
 * to the current model and asks for a 3–5 word title. Detected PR/issue refs
 * (#123, PR-42, issue #7) are prepended when the AI omits them.
 *
 * - Silent: no notifications, no UI changes
 * - One-shot: only runs once per unnamed session
 * - Respects /name and --name: if a name is already set it does nothing
 * - Override at any time with /name <new title>
 */

import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ContentBlock = { type?: string; text?: string };
type SessionEntry = {
  type: string;
  message?: { role?: string; content?: unknown };
};

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as ContentBlock[])
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join(" ")
    .trim();
}

/**
 * Pull the first PR / issue reference out of a string.
 * Matches: #123  PR-42  PR #42  PR#42  issue #7  issue-7  GH-99
 */
function extractRef(text: string): string | null {
  const patterns = [
    /\bPR[-\s#]*(\d+)\b/i,
    /\bissues?[-\s#]*(\d+)\b/i,
    /\bGH-(\d+)\b/i,
    /(?<![/\w])#(\d+)\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return `#${m[1]}`;
  }
  return null;
}

const SYSTEM_PROMPT = `You generate ultra-short session titles for a coding agent session.

Rules:
- 3 to 5 words, no quotes, no trailing punctuation
- Start with an imperative verb or a noun phrase
- Avoid filler: "help with", "question about", "assist with"
- If the prompt references a PR or issue number, begin with "#N" followed by 2–3 words
- Examples: "Refactor auth module", "Fix dark mode flash", "Add CSV export", "#342 Fix memory leak"

Respond with ONLY the title — no explanation, no punctuation at the end.`;

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Track whether this session has already been (auto-)named so we only fire once.
  let named = false;

  // When a session loads, check whether it already has a name.
  pi.on("session_start", (_event, _ctx) => {
    named = !!pi.getSessionName();
  });

  pi.on("agent_end", async (_event, ctx) => {
    // Skip if already named or no model is active.
    if (named || pi.getSessionName() || !ctx.model) return;

    // Find the first user message in the session.
    const branch = ctx.sessionManager.getBranch() as SessionEntry[];
    let firstUserText = "";
    for (const entry of branch) {
      if (entry.type === "message" && entry.message?.role === "user") {
        firstUserText = extractText(entry.message.content);
        if (firstUserText) break;
      }
    }
    if (!firstUserText.trim()) return;

    // Truncate to keep the title call cheap.
    const prompt = firstUserText.slice(0, 500);

    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (!auth.ok || !auth.apiKey) return;

      const response = await complete(
        ctx.model,
        {
          systemPrompt: SYSTEM_PROMPT,
          messages: [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `Generate a session title for this prompt:\n\n${prompt}`,
                },
              ],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          maxTokens: 24,
        },
      );

      // Extract plain text from the response.
      const raw = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim()
        .replace(/^["'`]|["'`]$/g, "")  // strip surrounding quotes/backticks
        .replace(/[.!?]$/, "");          // strip trailing punctuation

      if (!raw) return;

      // Prepend the issue/PR ref if the AI omitted it.
      const ref = extractRef(prompt);
      const title = ref && !raw.includes(ref) ? `${ref} ${raw}` : raw;

      pi.setSessionName(title);
      named = true;
    } catch {
      // Silently fail — a session title is a nice-to-have, not critical.
    }
  });
}
