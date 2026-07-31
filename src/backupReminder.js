export const BACKUP_REMINDER_DAYS = 14;
export const BACKUP_REMINDER_MS = BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;

export function getBackupReminder(lastBackupAt, {
  now = Date.now(),
  hasUserData = true,
} = {}) {
  if (!hasUserData) {
    return {
      due: false,
      neverBackedUp: false,
      daysSince: 0,
      thresholdDays: BACKUP_REMINDER_DAYS,
    };
  }

  const timestamp = Date.parse(String(lastBackupAt || ""));
  if (!Number.isFinite(timestamp)) {
    return {
      due: true,
      neverBackedUp: true,
      daysSince: null,
      thresholdDays: BACKUP_REMINDER_DAYS,
    };
  }

  const elapsed = Math.max(0, Number(now) - timestamp);
  return {
    due: elapsed >= BACKUP_REMINDER_MS,
    neverBackedUp: false,
    daysSince: Math.floor(elapsed / (24 * 60 * 60 * 1000)),
    thresholdDays: BACKUP_REMINDER_DAYS,
  };
}
