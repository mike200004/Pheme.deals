import type { Turn } from "@/lib/conversation";

/** Most recent turns forwarded to the model; older context is dropped. */
export const MAX_TURNS = 40;
/** Per-turn character cap — far above any real chat message. */
export const MAX_TURN_CHARS = 8_000;

/**
 * Coerce an untrusted, client-supplied chat history into a safe transcript.
 *
 * The web chat posts its whole history every turn and the server used to pass
 * it to the model verbatim. That let a client:
 *  - smuggle in `system` / `tool` roles (instructions the model treats as
 *    ours, or malformed tool messages that make OpenAI reject the request),
 *  - send non-string content that crashes the request or the prompt build,
 *  - grow the history without bound, so every turn re-bills an ever-larger
 *    prompt against our OpenAI key.
 * Only user/assistant turns with string content survive, each is clipped, and
 * only the most recent MAX_TURNS are kept.
 */
export function sanitizeTranscript(input: unknown): Turn[] {
  if (!Array.isArray(input)) return [];
  const turns: Turn[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const { role, content } = raw as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const text = content.slice(0, MAX_TURN_CHARS);
    if (!text.trim()) continue;
    turns.push({ role, content: text });
  }
  return turns.slice(-MAX_TURNS);
}
