export const SECRET_BACKUP_KEYS = Object.freeze([
  "pt_appPin",
  "pt_appLock",
  "pt_aiApiKey",
]);

const SECRET_KEY_SET = new Set(SECRET_BACKUP_KEYS);

export function isSecretBackupKey(key) {
  return SECRET_KEY_SET.has(String(key || ""));
}

export function sanitizeBackupKv(rows) {
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => row && typeof row.key === "string" && !isSecretBackupKey(row.key)
  );
}

export function sanitizeLegacyBackupObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input).filter(
    ([key]) => key.startsWith("pt_") && !isSecretBackupKey(key)
  );
}
