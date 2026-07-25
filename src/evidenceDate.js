export function normalizeEvidenceDate(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, day));
  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day
  ) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function evidenceDayNumber(value) {
  const date = normalizeEvidenceDate(value);
  if (!date) return NaN;
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}
