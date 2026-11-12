import { test, before } from "node:test";
import assert from "node:assert/strict";

before(() => {
  process.env.SHARE_SECRET = "test-secret-not-used-anywhere-real";
});

const load = () => import("../lib/share.ts");

test("share tokens round-trip to the document id", async () => {
  const { makeShareToken, verifyShareToken } = await load();
  const id = "3f1c2b9e-1111-4a2b-9c3d-abcdefabcdef";
  assert.equal(verifyShareToken(makeShareToken(id)), id);
});

test("sign tokens round-trip to the request id", async () => {
  const { makeSignToken, verifySignToken } = await load();
  const id = "req-123";
  assert.equal(verifySignToken(makeSignToken(id)), id);
});

test("share and sign tokens are not interchangeable", async () => {
  const { makeShareToken, makeSignToken, verifyShareToken, verifySignToken } = await load();
  assert.equal(verifySignToken(makeShareToken("doc-1")), null);
  assert.equal(verifyShareToken(makeSignToken("doc-1")), null);
});

test("tampered or malformed tokens are rejected", async () => {
  const { makeShareToken, verifyShareToken } = await load();
  const raw = Buffer.from(makeShareToken("doc-1"), "base64url").toString();
  const forged = Buffer.from(raw.replace("doc-1", "doc-2")).toString("base64url");
  assert.equal(verifyShareToken(forged), null);
  assert.equal(verifyShareToken(""), null);
  assert.equal(verifyShareToken("not-a-token"), null);
  assert.equal(verifyShareToken(Buffer.from("doc-1.").toString("base64url")), null);
});

test("tokens are bound to the signing secret", async () => {
  const { makeShareToken, verifyShareToken } = await load();
  const token = makeShareToken("doc-1");
  process.env.SHARE_SECRET = "a-different-secret";
  try {
    assert.equal(verifyShareToken(token), null);
  } finally {
    process.env.SHARE_SECRET = "test-secret-not-used-anywhere-real";
  }
});
