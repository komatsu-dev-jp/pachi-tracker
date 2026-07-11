// 店舗詳細画面（StoreOverviewTab / StoreAnalysisTab / StoreSettingsTab）で共用する
// 表示専用の小さなUIパーツ。ロジック・保存データには一切触れない。

import React from "react";

export function SectionCard({ children, className = "" }) {
  return (
    <div
      className={
        "mb-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--card-shadow)] " +
        className
      }
    >
      {children}
    </div>
  );
}

export function SectionHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-1">
      <h3 className="text-[14px] font-bold text-[var(--text)]">{title}</h3>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="flex min-h-[32px] items-center gap-0.5 rounded-full border border-[var(--border-hi)] bg-[var(--surface-hi)] px-2.5 text-[11px] font-bold text-[var(--sub-hi)] active:opacity-70"
        >
          {action}
        </button>
      )}
    </div>
  );
}

const badgeTones = {
  amber: "border-[var(--orange)]/45 text-[var(--orange)] bg-[var(--orange)]/14",
  green: "border-[var(--green)]/35 text-[var(--green)] bg-[var(--green)]/12",
  blue: "border-[var(--blue)]/35 text-[var(--blue)] bg-[var(--blue)]/12",
  neutral: "border-[var(--border-hi)] text-[var(--sub-hi)] bg-[var(--surface-hi)]",
};

export function Badge({ tone = "neutral", dot, children }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap " +
        (badgeTones[tone] || badgeTones.neutral)
      }
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatTile({ icon, label, value, valueColorClass = "text-[var(--text)]", sub }) {
  return (
    <div className="flex min-h-[76px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-hi)] px-2 py-3 text-center">
      {icon && <span className="text-[var(--sub-hi)]">{icon}</span>}
      <span className={"text-[15px] font-black leading-none " + valueColorClass}>{value}</span>
      <span className="text-[11px] font-semibold leading-none text-[var(--sub)]">{label}</span>
      {sub && <span className="text-[10px] leading-none text-[var(--sub)]">{sub}</span>}
    </div>
  );
}

// 装飾用ミニ棒グラフ（傾向カード用）。将来的にはチェーン履歴・archives 由来の実データに差し替え予定。
export function MiniBarSpark({ values, colorVar = "var(--blue)" }) {
  return (
    <div className="flex h-5 items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: `${Math.max(0.12, v) * 100}%`, background: colorVar, opacity: 0.85 }}
        />
      ))}
    </div>
  );
}

export function WarningCard({ title, body, cta, onCta, Icon }) {
  return (
    <div className="mb-3 rounded-2xl border border-[var(--orange)]/45 bg-[var(--orange)]/10 p-4">
      <div className="flex items-start gap-3">
        {Icon && <Icon size={18} className="mt-0.5 shrink-0 text-[var(--orange)]" />}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-[var(--orange)]">{title}</div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--sub-hi)]">{body}</p>
        </div>
      </div>
      {cta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl border border-[var(--orange)]/45 bg-[var(--orange)]/14 text-[13px] font-bold text-[var(--orange)] active:opacity-70"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
