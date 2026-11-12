import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../lib/phone.ts";

test("normalizes common US formats to E.164", () => {
  assert.equal(normalizePhone("(203) 555-0142"), "+12035550142");
  assert.equal(normalizePhone("203.555.0142"), "+12035550142");
  assert.equal(normalizePhone("1-203-555-0142"), "+12035550142");
  assert.equal(normalizePhone("+1 203 555 0142"), "+12035550142");
});

test("rejects empty and wrong-length input", () => {
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone(null), "");
  assert.equal(normalizePhone(undefined), "");
  assert.equal(normalizePhone("12"), "");
  assert.equal(normalizePhone("555-0142"), "");
  assert.equal(normalizePhone("22035550142"), ""); // 11 digits without leading 1
  assert.equal(normalizePhone("+44 20 7946 0958"), "");
});

test("rejects area codes and exchanges starting with 0 or 1", () => {
  assert.equal(normalizePhone("0035550142"), "");
  assert.equal(normalizePhone("1035550142"), "");
  assert.equal(normalizePhone("2030550142"), "");
  assert.equal(normalizePhone("2031550142"), "");
});
