import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Info, Sparkles, X } from "lucide-react";

function DetailRow({ row }) {
  return (
    <div className="border-b border-[var(--border)] py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold leading-snug text-[var(--text)]">{row.label}</div>
          {row.meta && <div className="mt-1 text-[10px] leading-relaxed text-[var(--sub)]">{row.meta}</div>}
        </div>
        <div
          className={
            "shrink-0 text-right text-[13px] font-black leading-snug "
            + (row.tone === "positive" ? "text-[var(--green)]" : row.tone === "negative" ? "text-[var(--orange)]" : "text-[var(--text)]")
          }
        >
          {row.value}
        </div>
      </div>
      {row.description && (
        <p className="mt-2 rounded-xl bg-[var(--surface-hi)] px-3 py-2 text-[11px] leading-relaxed text-[var(--sub-hi)]">
          {row.description}
        </p>
      )}
      {typeof row.progress === "number" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hi)]">
          <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }} />
        </div>
      )}
      {row.details?.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {row.details.map((detail, index) => (
            <div key={`${detail.label}-${index}`} className="min-w-0 rounded-xl bg-[var(--surface-hi)] px-2.5 py-2">
              <div className="truncate text-[9px] text-[var(--sub)]">{detail.label}</div>
              <div className="mt-0.5 truncate text-[10px] font-bold text-[var(--sub-hi)]">{detail.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StoreMetricDetailSheet({ panel, onClose, onAction }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!panel) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => previouslyFocused?.focus?.({ preventScroll: true }));
    };
  }, [panel, onClose]);

  if (!panel) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/65 px-0 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-detail-sheet-title"
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[28px] border border-b-0 border-[var(--border-hi)] bg-[var(--bg)] shadow-2xl"
      >
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 pb-3 pt-2">
          <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--border-hi)]" />
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-black tracking-[0.14em] text-[var(--blue)]">DETAIL</div>
              <h2 id="store-detail-sheet-title" className="mt-1 text-[17px] font-black leading-tight text-[var(--text)]">{panel.title}</h2>
              {panel.subtitle && <p className="mt-1 text-[11px] leading-relaxed text-[var(--sub)]">{panel.subtitle}</p>}
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="詳細を閉じる"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-hi)] text-[var(--sub-hi)] active:opacity-60"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {panel.demo && (
            <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-[var(--orange)]/40 bg-[var(--orange)]/10 px-3 py-2.5">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-[var(--orange)]" />
              <div>
                <div className="text-[11px] font-black text-[var(--orange)]">表示例・実データではありません</div>
                <div className="mt-0.5 text-[10px] leading-relaxed text-[var(--sub-hi)]">完成後の見え方を確認するためのサンプルです。保存や集計には使われません。</div>
              </div>
            </div>
          )}

          {panel.hero && (
            <div className="mb-3 rounded-[20px] border border-[var(--blue)]/30 bg-[var(--blue)]/10 p-4">
              <div className="text-[10px] font-bold text-[var(--blue)]">{panel.hero.label}</div>
              <div className="mt-1 break-words text-[23px] font-black leading-tight tracking-tight text-[var(--text)]">{panel.hero.value}</div>
              {panel.hero.sub && <div className="mt-1 text-[11px] text-[var(--sub-hi)]">{panel.hero.sub}</div>}
            </div>
          )}

          <div className="space-y-3">
            {panel.sections?.map((section, index) => (
              <section key={`${section.title}-${index}`} className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--card-shadow)]">
                <h3 className="flex items-center gap-2 text-[12px] font-black text-[var(--text)]">
                  <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-[var(--purple)]" />
                  {section.title}
                </h3>
                {section.note && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--surface-hi)] px-3 py-2.5">
                    <Info size={14} className="mt-0.5 shrink-0 text-[var(--blue)]" />
                    <p className="text-[11px] leading-relaxed text-[var(--sub-hi)]">{section.note}</p>
                  </div>
                )}
                {section.rows?.length > 0 && <div className="mt-1">{section.rows.map((row, rowIndex) => <DetailRow key={`${row.label}-${rowIndex}`} row={row} />)}</div>}
              </section>
            ))}
          </div>
        </div>

        {panel.action && (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() => onAction?.(panel.action)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--blue)] px-4 text-[13px] font-black text-[#03121f] active:opacity-80"
            >
              {panel.actionLabel}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
