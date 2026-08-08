"use client";

import { useEffect, useRef, useState } from "react";

interface UiMessage {
  role: "user" | "assistant";
  text: string;
}

// Plain text transcript turns exchanged with /api/chat.
type ApiMessage = { role: "user" | "assistant"; content: string };

export default function Chat() {
  const [ui, setUi] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiMessages = useRef<ApiMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [ui, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setUi((m) => [...m, { role: "user", text }]);
    apiMessages.current = [...apiMessages.current, { role: "user", content: text }];
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages.current }),
      });
      // A gateway/timeout can return a non-JSON body; don't let res.json() throw
      // us into the generic "Network error" path before we read res.ok.
      const data = await res.json().catch(() => ({} as { error?: string; messages?: ApiMessage[]; reply?: string }));
      if (!res.ok) {
        // Only invite a resend when the request certainly did NOT run tools.
        // A 500/504 can arrive AFTER documents were created and emails sent,
        // and "your message wasn't sent" made agents resend — mailing the
        // client a second copy of the same contract.
        const safeToResend = [400, 401, 403, 429, 503].includes(res.status);
        if (safeToResend) {
          apiMessages.current = apiMessages.current.slice(0, -1);
          setInput(text);
          setError(data.error || "That didn't go through — try again.");
        } else {
          setError(
            data.error ||
              "I lost the connection partway through. Check your dashboard before resending — part of that may already have gone out.",
          );
        }
      } else {
        apiMessages.current = data.messages;
        setUi((m) => [...m, { role: "assistant", text: data.reply || "(no response)" }]);
      }
    } catch {
      // A transport failure can still leave server-side work done.
      setError(
        "I lost the connection. Check your dashboard before resending — part of that may already have gone out.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        className="card"
        aria-live="polite"
        aria-busy={busy}
        style={{ minHeight: 320, maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}
      >
        {ui.length === 0 && (
          <p className="muted">Start the conversation below.</p>
        )}
        {ui.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background: m.role === "user" ? "var(--brand-tint)" : "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 8,
              padding: "10px 14px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {m.text}
          </div>
        ))}
        {busy && <div className="muted" style={{ alignSelf: "flex-start" }}>Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {error && <p style={{ color: "var(--danger)", marginTop: 10 }}>{error}</p>}

      <div className="btnRow" style={{ marginTop: 16 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          aria-label="Message the assistant"
          placeholder="Ask the assistant…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <button className="btn btnPrimary" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
