import crypto from "crypto";

// Links are purpose-bound, expiring bearer credentials. Legacy non-expiring
// tokens are deliberately invalid after this release; generate replacement links.
const MAX_AGE_SECONDS = { share: 24 * 60 * 60, sign: 7 * 24 * 60 * 60 };
type Purpose = keyof typeof MAX_AGE_SECONDS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const value = process.env.SHARE_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error("A dedicated SHARE_SECRET of at least 32 bytes is required.");
  }
  return value;
}

function mac(payload: string): Buffer {
  return crypto.createHmac("sha256", secret()).update(payload).digest();
}

function makeToken(purpose: Purpose, id: string): string {
  if (!UUID.test(id)) throw new Error("Invalid document or signature request ID.");
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS[purpose];
  const payload = `v2.${purpose}.${id}.${expires}`;
  return `${Buffer.from(payload).toString("base64url")}.${mac(payload).toString("base64url")}`;
}

function verifyToken(purpose: Purpose, token: string): string | null {
  try {
    if (token.length > 256) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
    const payload = Buffer.from(parts[0], "base64url").toString("utf8");
    if (Buffer.from(payload).toString("base64url") !== parts[0]) return null;
    const fields = payload.split(".");
    if (fields.length !== 4 || fields[0] !== "v2" || fields[1] !== purpose || !UUID.test(fields[2])) return null;
    const expires = Number(fields[3]);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expires) || expires <= now || expires > now + MAX_AGE_SECONDS[purpose]) return null;
    const provided = Buffer.from(parts[1], "base64url");
    const expected = mac(payload);
    if (provided.toString("base64url") !== parts[1] || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
    return fields[2];
  } catch {
    return null;
  }
}

export const makeShareToken = (id: string): string => makeToken("share", id);
export const makeSignToken = (id: string): string => makeToken("sign", id);
export const verifyShareToken = (token: string): string | null => verifyToken("share", token);
export const verifySignToken = (token: string): string | null => verifyToken("sign", token);
