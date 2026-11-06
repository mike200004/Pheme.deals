// Rebuild each turn so client-supplied system roles/tool calls never reach the model.
export function parseChatTranscript(body: unknown): { role: "user" | "assistant"; content: string }[] | null {
  if (!body || typeof body !== "object" || !("messages" in body)) return null;
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) return null;
  let total = 0;
  const result: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" || message.content.length > 8000) return null;
    total += message.content.length;
    if (total > 32000) return null;
    result.push({ role: message.role, content: message.content });
  }
  if (result[result.length - 1].role !== "user") return null;
  return result;
}
