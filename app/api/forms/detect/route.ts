import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/auth";
import { openai } from "@/lib/ai";
import { rateLimit } from "@/lib/ratelimit";
import type { FormTemplateField } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PageInput {
  image: string; // data:image/png;base64,...
  width: number; // PDF points
  height: number;
}

const SYSTEM = `You are looking at page images of a blank real-estate form (it has no fillable fields, so a person fills the blanks by hand or typewriter). Find every blank a person would fill in: names, addresses, prices, dates, percentages, phone/email, checkboxes, and signature/initial lines.

Return STRICT JSON: {"fields":[{"label": "...", "page": 0, "x": 0.0, "y": 0.0, "w": 0.0}]}
- page: 0-based page index matching the order of images given.
- x, y: normalized [0..1] coordinates (origin TOP-LEFT) of where the FILLED text should START — i.e. on the blank line, just after the printed label.
- w: normalized available width for the value (to the end of the blank).
- label: a short human label for the blank (e.g. "Buyer name", "Purchase price", "Closing date").
Only include real fillable blanks. Don't invent fields. Order them top-to-bottom.`;

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,/;
const MAX_IMAGE_CHARS = 8_000_000; // per page; a 2x JPEG render is far below

function validPage(p: unknown): p is PageInput {
  if (!p || typeof p !== "object") return false;
  const { image, width, height } = p as Record<string, unknown>;
  return (
    typeof image === "string" &&
    IMAGE_DATA_URL.test(image) &&
    image.length <= MAX_IMAGE_CHARS &&
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

/** A model-supplied normalized coordinate clamped to [0, 1], or null if unusable. */
function unit(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, v));
}

function slug(s: string, i: number): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return base ? `${base}_${i}` : `field_${i}`;
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (account.status !== "active") return NextResponse.json({ error: "Account pending approval" }, { status: 403 });

  // Each call is a multi-image GPT-4o vision request — the most expensive
  // thing the app does. Cap per-account bursts like /api/chat does.
  if (!rateLimit(`detect:${account.accountId}`, 10, 10 * 60_000)) {
    return NextResponse.json(
      { error: "Too many form uploads at once — wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let body: { pages?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rawPages = Array.isArray(body?.pages) ? body.pages.slice(0, 6) : [];
  if (!rawPages.length) return NextResponse.json({ error: "No pages" }, { status: 400 });
  // Only inline page images: an arbitrary URL here would have OpenAI fetch
  // whatever the client names, and a NaN/zero page size poisons every
  // coordinate computed below.
  if (!rawPages.every(validPage)) {
    return NextResponse.json({ error: "Invalid page data" }, { status: 400 });
  }
  const pages: PageInput[] = rawPages;

  const content: { type: "text" | "image_url"; text?: string; image_url?: { url: string } }[] = [
    { type: "text", text: `This form has ${pages.length} page(s), in order.` },
    ...pages.map((p) => ({ type: "image_url" as const, image_url: { url: p.image } })),
  ];

  let parsed: { fields?: unknown };
  try {
    const res = await openai().chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        // @ts-expect-error vision content array
        { role: "user", content },
      ],
    });
    parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Detection failed" },
      { status: 502 },
    );
  }

  // The model's JSON is untrusted too: a missing or non-numeric coordinate
  // used to become NaN and reach the editor (and the saved template) as a
  // null placement, and a non-string label crashed slug(). Fields without a
  // usable position are dropped; the user can still add them by hand.
  const rawFields = Array.isArray(parsed?.fields) ? parsed.fields : [];
  const fields: FormTemplateField[] = [];
  for (const f of rawFields) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    const x = unit(r.x);
    const y = unit(r.y);
    if (x === null || y === null) continue; // no usable location — don't guess one
    const i = fields.length;
    const p = Number(r.page);
    const page = Number.isInteger(p) && p >= 0 && p < pages.length ? p : 0;
    const { width: W, height: H } = pages[page];
    const size = 10;
    const xPt = Math.max(2, Math.min(x, 0.98) * W);
    // y is the top of the text location (top-left origin); convert to a PDF
    // baseline (bottom-left origin) sitting just below that line.
    const yPt = Math.max(2, H - y * H - size);
    const maxWidth = Math.max(40, Math.min(unit(r.w) || 0.3, 1 - x) * W);
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 120) : "";
    fields.push({
      key: slug(label, i),
      label: label || `Field ${i + 1}`,
      type: "text",
      placement: { page, x: Math.round(xPt), y: Math.round(yPt), size, maxWidth: Math.round(maxWidth) },
    });
  }

  return NextResponse.json({ fields });
}
