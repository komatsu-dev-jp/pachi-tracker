import test from "node:test";
import assert from "node:assert/strict";
import { hashPin, isHashedPin, migrateLegacyPin, verifyPin } from "../pinSecurity.js";

test("PINは平文を含まないPBKDF2ハッシュで保存し照合できる", async () => {
  const stored = await hashPin("1234");
  assert.equal(isHashedPin(stored), true);
  assert.equal(stored.includes("1234"), false);
  assert.equal(await verifyPin("1234", stored), true);
  assert.equal(await verifyPin("4321", stored), false);
});

test("旧版の平文PINは照合後にハッシュへ移行できる", async () => {
  assert.equal(await verifyPin("2468", "2468"), true);
  const migrated = await migrateLegacyPin("2468");
  assert.equal(isHashedPin(migrated), true);
  assert.equal(await verifyPin("2468", migrated), true);
});
