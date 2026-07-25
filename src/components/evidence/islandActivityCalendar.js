import { normalizeEvidenceDate } from "../../evidenceDate.js";

const WEEKDAYS = Object.freeze(["月", "火", "水", "木", "金", "土", "日"]);

function validMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2000 && month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : "";
}

export function listIslandActivityMonths(history = []) {
  return [...new Set((Array.isArray(history) ? history : [])
    .map((item) => normalizeEvidenceDate(item?.date).slice(0, 7))
    .filter(validMonth))]
    .sort();
}

export function buildIslandActivityCalendar(history = [], { month = "" } = {}) {
  const entries = (Array.isArray(history) ? history : [])
    .map((item) => ({ ...item, date: normalizeEvidenceDate(item?.date) }))
    .filter((item) => item.date);
  const availableMonths = listIslandActivityMonths(entries);
  const selectedMonth = validMonth(month) || availableMonths.at(-1) || "";
  if (!selectedMonth) {
    return {
      month: "",
      label: "",
      weekdays: WEEKDAYS,
      availableMonths,
      cells: [],
      hasData: false,
    };
  }

  const [year, monthNumber] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const leadingBlanks = (firstWeekday + 6) % 7;
  const byDate = new Map(entries.map((item) => [item.date, item]));
  const cells = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
    const entry = byDate.get(date) || null;
    cells.push({
      date,
      day,
      status: entry?.signalCode || "no-data",
      entry,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return {
    month: selectedMonth,
    label: `${year}年${monthNumber}月`,
    weekdays: WEEKDAYS,
    availableMonths,
    cells,
    hasData: entries.some((item) => item.date.startsWith(`${selectedMonth}-`)),
  };
}
