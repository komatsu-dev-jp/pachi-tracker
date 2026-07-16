// 店舗詳細画面（StoreOverviewTab / StoreAnalysisTab / StoreSettingsTab）で共用する
// 表示専用の小さなUIパーツ。ロジック・保存データには一切触れない。

import React from "react";
import { ChevronRight } from "lucide-react";

export function SectionCard({ children, className = "" }) {
  return (
    <div
      className={
        "mb-3 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--card-shadow)] " +
        className
      }
    >
      {children}
    </div>
  );
}

export function SectionHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
      <h3 className="flex min-w-0 items-center gap-2 text-[14px] font-black text-[var(--text)]">
        <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-[var(--purple)]" />
        <span>{title}</span>
      </h3>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex min-h-[40px] shrink-0 items-center gap-0.5 rounded-full border border-[var(--border-hi)] bg-[var(--surface-hi)] px-3 text-[11px] font-bold text-[var(--sub-hi)] active:opacity-70"
        >
          {action}
        </button>
      )}
      {action && !onAction && (
        <span className="flex min-h-[32px] max-w-[62%] shrink-0 items-center gap-0.5 rounded-full border border-[var(--border-hi)] bg-[var(--surface-hi)] px-2.5 text-[10px] font-bold leading-tight text-[var(--sub-hi)]">
          {action}
        </span>
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

export function StatTile({ icon, label, value, valueColorClass = "text-[var(--text)]", sub, onClick, detailLabel }) {
  const Root = onClick ? "button" : "div";
  return (
    <Root
      {...(onClick ? { type: "button", onClick, "aria-haspopup": "dialog", "aria-label": detailLabel || `${label}の詳細を表示` } : {})}
      className={
        "relative flex min-h-[94px] min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-hi)] p-3.5 text-left "
        + (onClick ? "transition-colors active:border-[var(--blue)] active:bg-[var(--blue)]/10" : "")
      }
    >
      <span className="flex w-full items-center gap-1.5 text-[11px] font-bold text-[var(--sub)]">
        {icon && <span className="text-[var(--sub-hi)]">{icon}</span>}
        <span className="min-w-0 truncate">{label}</span>
        {onClick && <ChevronRight size={13} className="ml-auto shrink-0 text-[var(--sub)]" />}
      </span>
      <span className={"mt-auto break-words text-[17px] font-black leading-tight " + valueColorClass}>{value}</span>
      {sub && <span className="mt-1 text-[10px] leading-none text-[var(--sub)]">{sub}</span>}
    </Root>
  );
}

export function TabIntro({ eyebrow, title, description }) {
  return (
    <div className="mb-4 px-1">
      <div className="text-[10px] font-black tracking-[0.14em] text-[var(--blue)]">{eyebrow}</div>
      <h2 className="mt-1 text-[18px] font-black tracking-tight text-[var(--text)]">{title}</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--sub)]">{description}</p>
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
  const Root = onCta ? "button" : "div";
  return (
    <Root
      {...(onCta ? { type: "button", onClick: onCta, "aria-haspopup": "dialog", "aria-label": `${title}の詳細を表示` } : {})}
      className="mb-3 w-full rounded-[20px] border border-[var(--orange)]/45 bg-[var(--orange)]/10 p-4 text-left shadow-[var(--card-shadow)] transition-colors active:bg-[var(--orange)]/15"
    >
      <div className="flex items-start gap-3">
        {Icon && <Icon size={18} className="mt-0.5 shrink-0 text-[var(--orange)]" />}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-[var(--orange)]">{title}</div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--sub-hi)]">{body}</p>
        </div>
      </div>
      {cta && (
        <span className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl border border-[var(--orange)]/45 bg-[var(--orange)]/14 text-[13px] font-bold text-[var(--orange)]">
          {cta}
        </span>
      )}
    </Root>
  );
}
