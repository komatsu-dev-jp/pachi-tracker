export function parseCsvRows(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsvRow(values) {
  return (Array.isArray(values) ? values : []).map(escapeCsvCell).join(",");
}

// 収支記録をCSVで往復しても同じ記録を識別できる、端末に依存しないID。
// crypto.randomUUID が使えない古いブラウザでも、時刻と乱数で衝突しにくい値を作る。
export function createArchiveRecordId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getArchiveRecordId(archive) {
  const recordId = String(archive?.recordId ?? "").trim();
  if (recordId) return recordId;
  if (archive?.id == null) return "";
  return String(archive.id).trim();
}

// 新しいCSV・現在のアプリ内記録は固有IDで比較する。
// IDが無い非常に古い記録だけ、従来どおり内容を比較する。
export function archiveIdentityKey(archive) {
  const recordId = getArchiveRecordId(archive);
  return recordId ? `record:${recordId}` : `legacy:${legacyArchiveContentKey(archive)}`;
}

// 「記録ID」列が存在しない旧CSVの後方互換用。
export function legacyArchiveContentKey(archive) {
  return [
    archive?.gameType === "slot" ? "slot" : "pachinko",
    archive?.date || "",
    archive?.storeName || "",
    archive?.machineNum || "",
    archive?.machineName || "",
    Number(archive?.investYen) || 0,
    Number(archive?.recoveryYen) || 0,
  ].join("|");
}
