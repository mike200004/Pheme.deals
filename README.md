# Pheme

A personal home base for a real estate agent — clients, documents, and an AI
assistant that fills out, files and sends real-estate paperwork. The same
"brain" is driven from the web chat, by text (Twilio) and by phone (Vapi).

## What's here

- **Dashboard** — greeting, one-click new documents, recent docs, clients.
- **Document engine** — a built-in library of 10 branded business forms (listing
  agreement, addenda, deposit receipt, referral/commission paperwork, lead-paint
  disclosure, rental application, …) with embedded AcroForm fields, plus the
  agent's own uploaded PDFs (flat/scanned forms get their blanks detected with
  GPT-4o vision). Filled with pdf-lib and flattened on demand.
- **AI assistant** — an OpenAI function-calling loop (default `gpt-4.1-mini`,
  override with `OPENAI_MODEL`) that can create clients, create/fill documents
  conversationally, file them, and request signatures. The same tool layer
  drives the web chat, SMS (Twilio) and the phone assistant (Vapi).
- **Settings** — your agent profile auto-fills the broker/agency side of every form.

## Tech stack

- Next.js 15 (App Router) + React 19 + TypeScript
- [pdf-lib](https://pdf-lib.js.org) for PDF filling (Node runtime; Vercel-friendly)
- [openai](https://github.com/openai/openai-node) (function calling) for the assistant
- Supabase for auth, data and file storage

## Getting started

```bash
npm ci
cp .env.example .env.local   # Supabase keys are required; OPENAI_API_KEY enables the assistant
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A Supabase project is
required (auth, data and storage all live there) — see **Supabase setup** below.
`.env.example` documents every variable; Stripe, Resend, Twilio and Vapi are
only needed for billing, email, SMS and voice respectively.

## Architecture

```
app/
  page.tsx                      Dashboard
  documents/[id]/               Document editor (form + PDF download)
  assistant/                    AI chat UI
  settings/                     Agent profile
  api/chat/                     OpenAI function-calling loop (the AI brain)
  api/sms/, api/voice/          Twilio SMS + Vapi phone webhooks (same tools)
  api/documents/[id]/pdf/       Generates the filled PDF on demand
  api/share/, api/sign/         Public token-authorized share + e-sign links
  actions.ts                    Server actions (profile/client/document writes)
lib/
  templates/                    Field schemas per form (generated.ts is generated)
  pdf/fill.ts                   pdf-lib fill/flatten + signature certificate
  tools/                        AI tool definitions + handlers (shared seam)
  db.ts                         Data access (Supabase, scoped by account)
  ai.ts                         OpenAI client + system prompt + tool format
templates/*.pdf                 The built-in form library (scripts/generate-templates.mjs)
supabase/migrations/            DB schema, applied in order
tests/                          Unit tests (node:test)
```

The **AI tool layer** (`lib/tools`) is the integration seam: the web chat, the
Twilio SMS webhook and the Vapi voice webhook all call the same tools. The voice
tool list is declared to Vapi separately in `scripts/update-vapi.mjs`;
`scripts/check-tool-sync.mjs` (run by `prebuild`) fails the build if the two
drift.

## Supabase setup

Apply every file in `supabase/migrations/` in numeric order (Supabase MCP
`apply_migration` or `supabase db push`), then set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

## Features

- Agent dashboard + profile
- Document engine: built-in form library + the agent's own uploaded PDFs
- E-signatures: secure signing links with an appended signature certificate
- AI assistant (create/fill/file/send documents) on web, voice, and SMS
- Accounts + auth; team members (assistants) with delegated access and per-actor attribution
- Caller-ID gating: only registered numbers reach the phone/SMS assistant
- Document delivery: email the PDF (`email_document`), or prepare a tap-to-send
  text with a secure link that goes out from the agent's own phone (`send_document`
  — Pheme sends no outbound SMS itself)

## Dev notes

- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — unit tests in `tests/` (Node's built-in runner; needs Node 22.18+
  for native TypeScript type stripping).
- `npm run test:templates` — fills and flattens every built-in template and
  checks each value renders (needs `pdftotext` from poppler); output PDFs land
  in `/tmp/lib-<id>.pdf` for eyeballing.
- CI (`.github/workflows/ci.yml`) runs all of the above plus `npm run build`.
