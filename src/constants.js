export const C = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  surfaceHi: "var(--surface-hi)",
  border: "var(--border)",
  borderHi: "var(--border-hi)",
  blue: "var(--blue)",
  green: "var(--green)",
  red: "var(--red)",
  yellow: "var(--yellow)",
  teal: "var(--teal)",
  orange: "var(--orange)",
  purple: "var(--purple)",
  text: "var(--text)",
  sub: "var(--sub)",
  subHi: "var(--sub-hi)",
};

export const font = "var(--font-main)";
export const mono = "var(--font-mono)";

export const f = (n, d = 0) => {
  if (n == null || isNaN(n) || !isFinite(n)) return "—";
  return Number(n).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
};

export const sc = n => (!isFinite(n) || n === 0 ? C.sub : n > 0 ? C.green : C.red);

export const sp = (n, d = 0) => isFinite(n) && !isNaN(n) ? (n >= 0 ? "+" : "") + f(n, d) : "—";

export const tsNow = () => new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

// 端末ローカルの "YYYY-MM-DD"。
// toISOString() は UTC 基準のため、日本時間の 0:00〜9:00 に前日の日付を返してしまう。
// 記録日・日次リセット・連続日数などの「今日」判定は必ずこちらを使う。
export const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
