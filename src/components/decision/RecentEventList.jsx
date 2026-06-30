import { useMemo, useState } from "react";
import { C, font, mono } from "../../constants";

const MAX_ITEMS = 5;

// アイコンSVG（タイムライン丸印用）
function HitIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function MoveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="17" y2="12" />
      <polyline points="13 8 17 12 13 16" />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function EndIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
function StartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="10 8 16 12 10 16" fill="currentColor" stroke="none" />
    </svg>
  );
}

const EVENT_STYLES = {
  hit:        { color: "var(--orange)", label: "初当たり",   icon: <HitIcon /> },
  chainStart: { color: "var(--orange)", label: "初当たり",   icon: <HitIcon /> },
  chainAdd:   { color: "var(--yellow)", label: "連チャン追加", icon: <HitIcon /> },
  chainEnd:   { color: "var(--red)",    label: "実戦終了",     icon: <EndIcon /> },
  singleEnd:  { color: "var(--blue)",   label: "単発終了",     icon: <EndIcon /> },
  rotStart:   { color: "var(--blue)",   label: "スタート",     icon: <StartIcon /> },
  rotInput:   { color: "var(--sub)",    label: "回転入力",     icon: <MoveIcon /> },
  afterJp:    { color: "var(--teal)",   label: "大当たり後",   icon: <StartIcon /> },
  move:       { color: "var(--blue)",   label: "台移動",       icon: <MoveIcon /> },
  note:       { color: "var(--purple)", label: "メモ",         icon: <NoteIcon /> },
  other:      { color: "var(--sub)",    label: "",             icon: <MoveIcon /> },
};

// 回転入力イベント（"1K決定" / "500円決定" / "持ち玉NN玉消費" / "貯玉NN玉消費"）の判定
function isRotInputType(type) {
  if (!type) return false;
  return /決定$/.test(type) || /消費$/.test(type);
}

function sesTypeToStyle(type) {
  if (!type) return EVENT_STYLES.other;
  if (type === "初当たり" || type === "初当たり記録") return EVENT_STYLES.chainStart;
  if (type === "連チャン追加") return EVENT_STYLES.chainAdd;
  if (type === "連チャン終了") return EVENT_STYLES.chainEnd;
  if (type === "単発終了") return EVENT_STYLES.singleEnd;
  if (type === "スタート") return EVENT_STYLES.rotStart;
  if (type === "大当たり後スタート") return EVENT_STYLES.afterJp;
  if (type === "台移動") return EVENT_STYLES.move;
  if (type === "実戦終了") return { ...EVENT_STYLES.chainEnd, label: "実戦終了" };
  if (type === "一時保存") return { ...EVENT_STYLES.note, color: "var(--yellow)", label: "一時保存" };
  if (type.startsWith("メモ")) return { ...EVENT_STYLES.note, label: type };
  if (type.startsWith("継続判断")) return { ...EVENT_STYLES.afterJp, label: type };
  if (isRotInputType(type)) return EVENT_STYLES.rotInput;
  return { ...EVENT_STYLES.other, label: type };
}

function hitLabel(hit, chain) {
  const rounds = hit.rounds || hit.rawRounds || 0;
  const mult = hit.mult && hit.mult > 1 ? `×${hit.mult}` : "";
  const ht = chain?.hitType ? `${chain.hitType} ` : "";
  if (rounds > 0) return `${ht}${rounds}R${mult}`.trim();
  return ht.trim() || "大当たり";
}

export function RecentEventList({ jpLog = [], sesLog = [], anchorId }) {
  const [expanded, setExpanded] = useState(false);

  const allEvents = useMemo(() => {
    const list = [];
    // 登録（保存）順を保持する連番。time が同一分（HH:MM精度）で並んだ際の
    // タイブレークに使い、新しい登録ほど上に来るようにする。
    let seq = 0;

    (jpLog || []).forEach((chain) => {
      (chain.hits || []).forEach((hit) => {
        list.push({
          seq: seq++,
          kind: "hit",
          time: hit.time || chain.time || "",
          style: EVENT_STYLES.hit,
          label: chain?.hitType === "単発" ? "初当たり" : (hit.hitNumber > 1 ? "連チャン追加" : "初当たり"),
          sub: hitLabel(hit, chain),
          rot: chain.rotAtHit ?? null,
          chips: [
            chain.rotAtHit != null ? { label: "総回転", val: `${chain.rotAtHit.toLocaleString("ja-JP")}回` } : null,
            hit.rounds ? { label: "大当り", val: `${hit.rounds}R` } : null,
          ].filter(Boolean),
        });
      });
    });

    (sesLog || []).forEach((e) => {
      if (!e || !e.type) return;
      if (e.type === "data" || e.type === "data記録") return;
      if (e.type === "初当たり" || e.type === "初当たり記録") return;
      const style = sesTypeToStyle(e.type);
      const isRotInput = isRotInputType(e.type);
      const sub = [];
      const chips = [];
      if (isRotInput) {
        // 回転入力イベント: e.rot は今回入力分の増分（thisRot）
        if (e.rot != null) {
          sub.push(`+${e.rot}回転`);
          chips.push({ label: "今回", val: `+${e.rot.toLocaleString("ja-JP")}回` });
        }
        if (e.cash != null && e.cash > 0) {
          chips.push({ label: "投資", val: `${e.cash.toLocaleString("ja-JP")}円` });
        } else if (e.mode === "mochi") {
          chips.push({ label: "持ち玉", val: "消費" });
        } else if (e.mode === "chodama") {
          chips.push({ label: "貯玉", val: "消費" });
        }
      } else {
        // 通常イベント: e.rot は累積回転数
        if (e.rot != null) sub.push(`${e.rot}回転`);
        if (e.rot != null) chips.push({ label: "総回転", val: `${e.rot.toLocaleString("ja-JP")}回` });
        if (e.cash != null && e.cash > 0) chips.push({ label: "投資", val: `${e.cash.toLocaleString("ja-JP")}円` });
      }
      list.push({
        seq: seq++,
        kind: "ses",
        time: e.time || "",
        style,
        label: style.label || e.type,
        sub: sub.join("・"),
        chips,
      });
    });

    // 時刻の新しい順。同一時刻（同一分）の場合は登録順の新しい方（seqが大きい方）を上に。
    list.sort((a, b) => {
      if (a.time !== b.time) return a.time < b.time ? 1 : -1;
      return b.seq - a.seq;
    });
    return list;
  }, [jpLog, sesLog]);

  const events = expanded ? allEvents : allEvents.slice(0, MAX_ITEMS);
  const hasMore = allEvents.length > MAX_ITEMS;

  return (
    <div id={anchorId} className="timeline-card" style={{ fontFamily: font }}>
      <div className="timeline-head">
        <span className="timeline-head__title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          直近の行動ログ
        </span>
        {hasMore && (
          <button
            className="b timeline-head__link"
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "折りたたむ ›" : `すべて見る（${allEvents.length}件） ›`}
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div style={{ fontSize: 11, color: C.sub, padding: "10px 4px", textAlign: "center" }}>
          イベントはまだありません
        </div>
      ) : (
        events.map((e, i) => (
          <div key={i} className="timeline-row">
            <span className="timeline-row__time" style={{ fontFamily: mono }}>
              {e.time || "--:--"}
            </span>
            <span
              className="timeline-row__icon"
              style={{ "--ti-color": e.style.color }}
              aria-hidden="true"
            >
              {e.style.icon}
            </span>
            <span className="timeline-row__main">
              <span className="timeline-row__label">{e.label}</span>
              {e.sub && <span className="timeline-row__sub">{e.sub}</span>}
            </span>
            <span className="timeline-row__chips">
              {(e.chips && e.chips.length > 0)
                ? e.chips.slice(0, 2).map((c, k) => (
                    <span key={k} className="timeline-chip">
                      {c.label} <strong>{c.val}</strong>
                    </span>
                  ))
                : null}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
