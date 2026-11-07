import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, isValidPhone, phoneToInternalEmail } from "../lib/phone.ts";

test("normalizes Uzbek phone numbers", () => {
  assert.equal(normalizePhone("+998 90 123-45-67"), "+998901234567");
  assert.equal(normalizePhone("901234567"), "+998901234567");
  assert.equal(normalizePhone("998901234567999"), "+998901234567");
});

test("accepts only complete +998 numbers", () => {
  assert.equal(isValidPhone("+998901234567"), true);
  assert.equal(isValidPhone("+99890123456"), false);
  assert.equal(isValidPhone("+7901234567"), false);
});

test("maps a phone to a stable internal login, never storing the password locally", () => {
  assert.equal(phoneToInternalEmail("+998901234567"), "user_998901234567@inhayat.uz");
});
