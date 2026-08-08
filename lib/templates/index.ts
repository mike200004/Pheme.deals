import type { DocType } from "@/lib/types";
import type { AgentProfile } from "@/lib/types";
import type { TemplateDef } from "./types";
import { generatedTemplates } from "./generated";

/** Display order of the library's category groups. */
export const templateCategories = [
  "Listings & transactions",
  "Brokerage & office",
  "Leasing & compliance",
] as const;

export const templateList: TemplateDef[] = [...generatedTemplates];

export const templates: Record<DocType, TemplateDef> = Object.fromEntries(
  templateList.map((t) => [t.id, t]),
) as Record<DocType, TemplateDef>;

/**
 * Look up a built-in template. Returns undefined for unknown/retired types
 * (e.g. a legacy document row whose template has been removed) — callers must
 * handle the missing case rather than assume a template always exists.
 */
export function getTemplate(type: string): TemplateDef | undefined {
  return templates[type as DocType];
}

export function isDocType(type: string): type is DocType {
  return type in templates;
}

/** Human label for a document type, with a safe fallback for retired types. */
export function docTypeLabel(type: string): string {
  return templates[type as DocType]?.shortName ?? "Retired form";
}

/** Fields the user/AI must supply (excludes profile-sourced auto fields). */
export function userFields(type: DocType) {
  return templates[type]?.fields.filter((f) => !f.source) ?? [];
}

/**
 * Required fields that are still empty.
 *
 * Built on ALL fields, not `userFields` — a field that is both required and
 * profile-sourced (independent_contractor.brokerageFirm) could never be
 * reported missing, so an ICA was filed and sent for signature with one of its
 * two named parties blank whenever the agent hadn't set a brokerage name.
 * Pass `profile` so those fields are checked against what will actually print.
 *
 * A lone dash is the "intentionally blank" sentinel the assistant writes for
 * skipped OPTIONAL lines; it must never satisfy a REQUIRED field like list
 * price or commission.
 */
const BLANK_SENTINEL = /^(-|—|–|n\/a|none)$/i;

export function missingRequired(
  type: DocType,
  values: Record<string, string>,
  profile?: AgentProfile | null,
): string[] {
  return (templates[type]?.fields ?? [])
    .filter((f) => {
      if (!f.required) return false;
      const raw = f.source ? profile?.[f.source] ?? "" : values[f.key] ?? "";
      const v = String(raw).trim();
      return !v || BLANK_SENTINEL.test(v);
    })
    .map((f) => f.key);
}

export type { TemplateDef, FieldDef, FieldType, Placement } from "./types";
