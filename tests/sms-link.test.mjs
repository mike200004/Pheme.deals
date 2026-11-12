import { test } from "node:test";
import assert from "node:assert/strict";
import { smsHref, documentTextMessage, signatureTextMessage } from "../lib/sms-link.ts";

test("smsHref emits the body in both iOS and Android forms", () => {
  const href = smsHref("+12035550142", "hi there & bye");
  assert.equal(href, "sms:+12035550142?body=hi%20there%20%26%20bye&body=hi%20there%20%26%20bye");
});

test("smsHref coerces bare US numbers to E.164", () => {
  assert.ok(smsHref("(203) 555-0142", "x").startsWith("sms:+12035550142?"));
  assert.ok(smsHref("1 203 555 0142", "x").startsWith("sms:+12035550142?"));
});

test("smsHref tolerates a missing number", () => {
  assert.equal(smsHref(null, "x"), "sms:?body=x&body=x");
});

test("message builders address the recipient only when named", () => {
  assert.equal(documentTextMessage("Lease", "https://l"), "here is your Lease: https://l");
  assert.equal(documentTextMessage("Lease", "https://l", "  Ann "), "Ann, here is your Lease: https://l");
  assert.equal(
    signatureTextMessage("Lease", "https://l"),
    'You\'ve been asked to sign "Lease". Review & sign: https://l',
  );
  assert.equal(
    signatureTextMessage("Lease", "https://l", "Bob"),
    'Bob, you\'ve been asked to sign "Lease". Review & sign: https://l',
  );
});
