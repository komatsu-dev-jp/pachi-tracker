import { localDateStr } from "./constants.js";
import { createBackup } from "./persistence.js";

export const LAST_BACKUP_KEY = "pt_lastBackupAt";

export function buildBackupFilename(date = new Date()) {
  return `pachi-tracker-backup-${localDateStr(date)}.json`;
}

export function downloadJsonFile(
  data,
  filename,
  {
    documentRef = globalThis.document,
    urlApi = globalThis.URL,
    revokeDelayMs = 1000,
  } = {},
) {
  if (!documentRef?.body || typeof documentRef.createElement !== "function") {
    throw new Error("バックアップを書き出せる画面環境ではありません");
  }
  if (!urlApi?.createObjectURL || !urlApi?.revokeObjectURL) {
    throw new Error("このブラウザはファイル書き出しに対応していません");
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => urlApi.revokeObjectURL(url), revokeDelayMs);
}

export async function exportFullBackup(options = {}) {
  const backup = await createBackup();
  const completedAt = new Date().toISOString();
  const filename = buildBackupFilename(new Date(completedAt));
  downloadJsonFile(backup, filename, options);
  return { backup, completedAt, filename };
}
