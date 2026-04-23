import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/services/auth/hash.js";

test("hashPassword produces scrypt-v1 format", async () => {
  const h = await hashPassword("x");
  assert.ok(h.startsWith("scrypt-v1$"));
  assert.equal(h.split("$").length, 6);
});

test("verifyPassword: correct password", async () => {
  const h = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter2", h), true);
});

test("verifyPassword: wrong password", async () => {
  const h = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter3", h), false);
});

test("verifyPassword: malformed hash", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(await verifyPassword("x", "scrypt-v1$bad"), false);
});

test("two hashes of same password differ (unique salt)", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b);
});
