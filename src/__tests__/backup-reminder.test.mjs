import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_REMINDER_DAYS, getBackupReminder } from "../backupReminder.js";

const DAY = 24 * 60 * 60 * 1000;

test("記録が無い端末ではバックアップを催促しない", () => {
  assert.equal(getBackupReminder("", { hasUserData: false }).due, false);
});

test("記録があり未バックアップなら案内する", () => {
  const result = getBackupReminder("", { hasUserData: true });
  assert.equal(result.due, true);
  assert.equal(result.neverBackedUp, true);
});

test(`${BACKUP_REMINDER_DAYS}日未満は案内せず、到達後に案内する`, () => {
  const now = Date.UTC(2026, 6, 25);
  assert.equal(getBackupReminder(new Date(now - (BACKUP_REMINDER_DAYS - 1) * DAY).toISOString(), { now }).due, false);
  const due = getBackupReminder(new Date(now - BACKUP_REMINDER_DAYS * DAY).toISOString(), { now });
  assert.equal(due.due, true);
  assert.equal(due.daysSince, BACKUP_REMINDER_DAYS);
});
