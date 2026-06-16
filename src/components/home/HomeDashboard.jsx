import React, { useMemo, useId, useState } from "react";
import { font } from "../../constants";
import { BADGES } from "../hunter/badges";
import { aggregateByDay, getEvAmount, getActualPL, machineRanking } from "../analysis/analysisSelectors";
import { evDecision } from "../decision/evDecision";
import { buildStrategyMap } from "../strategy/strategyMapData";

// =====================================================
// ホーム画面（モックアップ全面刷新版）
// 添付モックアップの 8 セクション構成を上から順に実装:
//   ① ヘッダー（ロゴ + 通知ベル + 時間帯あいさつ）
//   ② 本日のサマリーカード（期待値 / 実収支 / 前日比 / 信頼度 / スパークライン / 詳細）
//   ③ 次のアクション（記録開始 / 台選び / 分析を見る）
//   ④ 今月の進捗カード（期待値累計 / 目標 / 達成率 / あと◯◯円 / バー）
//   ⑤ 今日のおすすめカード（機種 / 期待値 / 台選びへ）
//   ⑥ ハンターランクカード（レベル / EXPバー / 連続日数 / セッション数）
//   ⑦ 実績・バッジ（5枚 + すべて見る）
//   ⑧ 直近の記録（3件 + すべて見る）
//
// 設計上の約束:
// - logic.js / 計算式 / 保存データ構造には一切触れていない
// - 表示値はすべて既存 state（S.archives / S.ev / S.hunterRank /
//   S.hunterCounters / S.notificationLog / S.monthlyEvTarget）由来の実データ
// - ダミー値・モック値は使用しない（記録が無ければ空状態を表示）
// =====================================================

// ロゴ・タイトルの起動演出（フェードイン＋スケールアップ）を
// 同一セッション内で1回だけ再生するためのフラグ。
// localStorage（永続データ）には保存せず、タブを閉じるまで有効な
// sessionStorage を使用する（保存データ構造には影響しない）。
const LOGO_INTRO_KEY = "pt_home_logo_intro_played";
function shouldPlayLogoIntro() {
    try {
        if (sessionStorage.getItem(LOGO_INTRO_KEY)) return false;
        sessionStorage.setItem(LOGO_INTRO_KEY, "1");
        return true;
    } catch {
        // sessionStorage が使えない環境では演出なしにフォールバック
        return false;
    }
}

// パレットはテーマ変数（CSS カスタムプロパティ）に連動させる。
// ライト/ダークの切り替えは index.css の :root / [data-theme] が担う。
const P = {
    bgGrad: "var(--bg)",
    card: "var(--surface)",
    cardAlt: "var(--surface-alt)",
    cardSub: "var(--surface-hi)",
    border: "var(--border)",
    borderHi: "var(--border-hi)",
    blue: "var(--blue)",
    cyan: "var(--teal)",
    green: "var(--green)",
    yellow: "var(--yellow)",
    red: "var(--red)",
    purple: "var(--purple)",
    text: "var(--text)",
    textHi: "var(--text)",
    sub: "var(--sub-hi)",
    subDim: "var(--sub)",
    glowBlue: "0 0 24px color-mix(in srgb, var(--blue) 18%, transparent)",
};

// 機種アイコンの色（機種名から決定的に算出）
const THUMB_COLORS = [
    ["#1D4ED8", "#3B82F6"],
    ["#B91C1C", "#EF4444"],
    ["#C2410C", "#F97316"],
    ["#15803D", "#22C55E"],
    ["#6D28D9", "#A78BFA"],
    ["#0E7490", "#22D3EE"],
];
function thumbColor(name) {
    const s = String(name || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return THUMB_COLORS[h % THUMB_COLORS.length];
}

// 数値整形
const fmt = (n) => {
    if (n == null || !isFinite(n) || isNaN(n)) return "—";
    return Math.round(Number(n)).toLocaleString("ja-JP");
};
const fmtSigned = (n) => {
    if (n == null || !isFinite(n) || isNaN(n)) return "—";
    const v = Math.round(Number(n));
    return (v >= 0 ? "+" : "") + v.toLocaleString("ja-JP");
};
// 回転率など小数1桁表示
const fmt1 = (n) => {
    if (n == null || !isFinite(n) || isNaN(n)) return "—";
    return Number(n).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

// ===== 共通スタイル =====
const sectionGap = { marginBottom: 16 };
const cardBase = {
    background: P.card,
    border: `1px solid ${P.border}`,
    borderRadius: 16,
    padding: 16,
    boxSizing: "border-box",
};
const numStyle = (size = 32, color = P.textHi, weight = 800) => ({
    fontSize: size,
    fontWeight: weight,
    color,
    fontFamily: font,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: -0.5,
    lineHeight: 1.05,
});

// ===== アイコン群 =====
const IconBell = ({ color = P.text }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
);
const IconInfo = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={P.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
);
const IconArrowUp = ({ color = P.green, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
    </svg>
);
const IconArrowDown = ({ color = P.red, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14" />
        <path d="M5 12l7 7 7-7" />
    </svg>
);
const IconChevron = ({ color = P.subDim, size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);
const IconPencil = ({ color = P.sub, size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
);
const IconSparkle = ({ color = "var(--yellow)", size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z" fill={color} fillOpacity="0.85" />
    </svg>
);
const IconShield = ({ color = P.purple, size = 36 }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <defs>
            <linearGradient id="shieldG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A78BFA" />
                <stop offset="100%" stopColor="#6D28D9" />
            </linearGradient>
        </defs>
        <path d="M32 4 L56 14 V32 C56 46 44 56 32 60 C20 56 8 46 8 32 V14 Z"
            fill="url(#shieldG)" stroke={color} strokeWidth="1.3" />
        <path d="M32 4 L56 14 V32 C56 46 44 56 32 60 V4Z" fill="rgba(0,0,0,0.18)" />
    </svg>
);
// アクションボタン用アイコン
const IconPlus = ({ color = P.blue, size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);
const IconTargetSm = ({ color = P.blue, size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.8" fill={color} />
    </svg>
);
const IconChart = ({ color = P.blue, size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="20" x2="6" y2="12" />
        <line x1="12" y1="20" x2="12" y2="6" />
        <line x1="18" y1="20" x2="18" y2="14" />
    </svg>
);

// ===== セクション見出し =====
function SectionHeader({ title, action, onAction }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: P.text, fontFamily: font, letterSpacing: 0.3 }}>
                {title}
            </div>
            {action && (
                <button
                    type="button"
                    onClick={onAction}
                    style={{
                        background: "transparent",
                        border: "none",
                        color: P.sub,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: font,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 4px",
                        minHeight: 36,
                        cursor: "pointer",
                    }}
                >
                    {action}
                    <IconChevron />
                </button>
            )}
        </div>
    );
}

// ===== ① ヘッダー =====
// playIntro: true の場合のみ、ロゴのフェードイン＋スケールアップ演出（1.6秒）を再生する。
// アニメーションは表示のみで、ボタン等の操作は常に有効（pointer-events を変更しない）。
function Logo({ playIntro }) {
    return (
        <div
            className={playIntro ? "home-logo-intro" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
            <div style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${P.blue}, #2563EB)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 12px rgba(0,166,255,0.4)",
            }}>
                <span style={{ color: "#fff", fontSize: 18, fontWeight: 900, fontFamily: font, lineHeight: 1 }}>P</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: P.textHi, fontFamily: font, letterSpacing: -0.2 }}>
                P-Tracker
            </span>
        </div>
    );
}
function Header({ onBell, hasUnread, greeting, playLogoIntro }) {
    return (
        <div style={{ padding: "18px 4px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Logo playIntro={playLogoIntro} />
                <button
                    type="button"
                    onClick={onBell}
                    aria-label="通知"
                    style={{
                        position: "relative",
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "color-mix(in srgb, var(--surface) 86%, transparent)",
                        border: `1px solid ${P.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                >
                    <IconBell />
                    {hasUnread && (
                        <span style={{
                            position: "absolute",
                            top: 9,
                            right: 11,
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: P.blue,
                            boxShadow: "0 0 8px var(--blue)",
                            border: `1.5px solid ${P.card}`,
                        }} />
                    )}
                </button>
            </div>
            <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: P.textHi, fontFamily: font, lineHeight: 1.2, letterSpacing: -0.3 }}>
                    {greeting.title}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: P.sub, fontFamily: font, marginTop: 4 }}>
                    {greeting.sub}
                </div>
            </div>
        </div>
    );
}

// ===== 空値表示（「—」の横線） =====
const Dash = ({ color }) => (
    <div style={{ marginTop: 8, width: 36, height: 4, borderRadius: 2, background: color, opacity: 0.9 }} />
);
// クリップボード（記録なし案内用）
const IconClipboard = ({ color = P.sub, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="3" width="8" height="4" rx="1" />
        <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </svg>
);

// ===== ② 本日のサマリーカード =====
// hasData=false（今日まだ記録がない）のとき「—」と案内文を表示する空状態に切り替える。
function TodaySummaryCard({ hasData, todayEv, todayActual, hasActual, dayDiff, confidencePct, hasConfidence, onDetail }) {
    const evColor = todayEv >= 0 ? P.green : P.red;
    const actualColor = todayActual >= 0 ? P.green : P.red;
    const absEv = Math.abs(todayEv);
    const evFs = absEv >= 1000000 ? 26 : absEv >= 100000 ? 30 : 36;
    const confPct = Math.max(0, Math.min(100, Math.round(confidencePct || 0)));
    const showConf = hasData && hasConfidence;
    return (
        <div style={{ ...cardBase, ...sectionGap, position: "relative", overflow: "hidden" }}>
            {/* タイトル行 + 詳細を見る（右上） */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: P.textHi, fontFamily: font }}>本日のサマリー</span>
                    <IconInfo />
                </div>
                <button
                    type="button"
                    onClick={onDetail}
                    style={{
                        background: "transparent",
                        border: "none",
                        color: P.cyan,
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: font,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        padding: "6px 2px",
                        minHeight: 36,
                        cursor: "pointer",
                    }}
                >
                    詳細を見る
                    <IconChevron color={P.cyan} size={14} />
                </button>
            </div>

            {/* 期待値（左） / 実収支（右）の2カラム */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 12, borderRight: `1px solid ${P.border}` }}>
                    <div style={{ fontSize: 11.5, color: P.sub, fontFamily: font }}>期待値</div>
                    {hasData ? (
                        <>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                                <span style={numStyle(evFs, evColor)}>{fmtSigned(todayEv)}</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: evColor }}>円</span>
                                {todayEv >= 0
                                    ? <IconArrowUp color={evColor} size={16} />
                                    : <IconArrowDown color={evColor} size={16} />}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                                <span style={{ fontSize: 10.5, color: P.subDim, fontFamily: font }}>前日比</span>
                                <span style={{
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: dayDiff >= 0 ? P.green : P.red,
                                    fontFamily: font,
                                    fontVariantNumeric: "tabular-nums",
                                }}>
                                    {fmtSigned(dayDiff)}円
                                </span>
                            </div>
                        </>
                    ) : (
                        <Dash color={P.blue} />
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: P.sub, fontFamily: font }}>実収支</div>
                    {hasData && hasActual ? (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                            <span style={numStyle(evFs * 0.82, actualColor)}>{fmtSigned(todayActual)}</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: actualColor }}>円</span>
                        </div>
                    ) : (
                        <Dash color={P.red} />
                    )}
                </div>
            </div>

            {/* 信頼度バー */}
            <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: P.sub, fontFamily: font, fontWeight: 600 }}>本日の信頼度</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: showConf ? P.blue : P.subDim, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                        {showConf ? `${confPct}%` : "—"}
                    </span>
                </div>
                <div style={{ position: "relative", height: 7, borderRadius: 999, background: "var(--surface-alt)", overflow: "hidden" }}>
                    <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${showConf ? confPct : 0}%`,
                        background: `linear-gradient(90deg, ${P.blue}, ${P.cyan})`,
                        borderRadius: 999,
                        boxShadow: "0 0 8px rgba(0,166,255,0.4)",
                        transition: "width 0.5s ease",
                    }} />
                </div>
            </div>

            {/* データなし時の案内文 */}
            {!hasData && (
                <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ marginTop: 1, flexShrink: 0 }}><IconClipboard /></span>
                    <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: P.text, fontFamily: font }}>今日はまだ記録がありません</div>
                        <div style={{ fontSize: 10.5, color: P.sub, fontFamily: font, marginTop: 2 }}>記録を開始すると表示されます</div>
                    </div>
                </div>
            )}

            <div style={{ fontSize: 9.5, color: P.subDim, fontFamily: font, marginTop: 12 }}>
                回転率・稼働時間は詳細で確認できます
            </div>
        </div>
    );
}

// ===== ③ 次のアクション =====
function ActionButtons({ onRecord, onSelect, onAnalysis }) {
    const items = [
        { label: "記録開始", icon: <IconPlus />, onClick: onRecord },
        { label: "台選び", icon: <IconTargetSm />, onClick: onSelect },
        { label: "分析を見る", icon: <IconChart />, onClick: onAnalysis },
    ];
    return (
        <div style={sectionGap}>
            <div style={{ fontSize: 15, fontWeight: 700, color: P.text, fontFamily: font, letterSpacing: 0.3, marginBottom: 10 }}>
                次のアクション
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {items.map((it) => (
                    <button
                        key={it.label}
                        type="button"
                        onClick={it.onClick}
                        style={{
                            ...cardBase,
                            padding: "14px 6px",
                            minHeight: 88,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            cursor: "pointer",
                        }}
                    >
                        <span style={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            background: "color-mix(in srgb, var(--blue) 14%, transparent)",
                            border: `1px solid color-mix(in srgb, var(--blue) 30%, ${P.border})`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}>
                            {it.icon}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: P.textHi, fontFamily: font }}>
                            {it.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ===== ④ 今月の進捗カード =====
function MonthProgressCard({ ev, target, onEdit }) {
    const safeTarget = Math.max(0, Math.floor(Number(target) || 0));
    const safeEv = Math.floor(Number(ev) || 0);
    const rawRate = safeTarget > 0 ? (safeEv / safeTarget) * 100 : 0;
    const rate = safeTarget > 0 ? Math.max(0, Math.min(100, Math.round(rawRate))) : 0;
    const achieved = safeTarget > 0 && safeEv >= safeTarget;
    const remain = Math.max(0, safeTarget - safeEv);
    const barFill = achieved
        ? "linear-gradient(90deg, var(--orange), var(--yellow))"
        : `linear-gradient(90deg, ${P.blue}, ${P.cyan})`;
    return (
        <div style={{
            ...cardBase,
            ...sectionGap,
            border: achieved ? `1px solid color-mix(in srgb, var(--yellow) 50%, ${P.border})` : `1px solid ${P.border}`,
            boxShadow: achieved ? "0 0 16px color-mix(in srgb, var(--yellow) 16%, transparent)" : "none",
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: P.textHi, fontFamily: font }}>今月の進捗</span>
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label="月間目標を編集"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        minHeight: 32,
                        padding: "4px 8px",
                        borderRadius: 8,
                        background: "color-mix(in srgb, var(--blue) 12%, transparent)",
                        border: `1px solid ${P.border}`,
                        color: P.cyan,
                        fontSize: 10.5,
                        fontWeight: 700,
                        fontFamily: font,
                        cursor: "pointer",
                    }}
                >
                    <IconPencil color={P.cyan} size={12} />
                    目標 {fmt(safeTarget)}円
                </button>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                <div>
                    <div style={{ fontSize: 11, color: P.sub, fontFamily: font }}>期待値累計</div>
                    <div style={{ ...numStyle(28, achieved ? "var(--yellow)" : P.blue), marginTop: 2 }}>
                        {fmtSigned(safeEv)}<span style={{ fontSize: 14, fontWeight: 800, marginLeft: 2 }}>円</span>
                    </div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10.5, color: P.sub, fontFamily: font }}>達成率</div>
                    <div style={{ ...numStyle(20, achieved ? "var(--yellow)" : P.cyan), marginTop: 2 }}>{rate}%</div>
                </div>
            </div>

            <div style={{ position: "relative", height: 8, borderRadius: 999, background: "var(--surface-alt)", marginTop: 12, overflow: "hidden" }}>
                <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${rate}%`,
                    background: barFill,
                    borderRadius: 999,
                    boxShadow: achieved ? "0 0 10px rgba(251,191,36,0.5)" : "0 0 8px rgba(0,166,255,0.4)",
                    transition: "width 0.6s ease",
                }} />
            </div>

            <div style={{ marginTop: 8 }}>
                {achieved ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 800, color: "var(--yellow)", fontFamily: font }}>
                        <IconSparkle color="var(--yellow)" size={12} />
                        今月の目標を達成しました！
                    </span>
                ) : safeTarget > 0 ? (
                    <span style={{ fontSize: 11, color: P.sub, fontFamily: font }}>
                        あと <span style={{ color: P.textHi, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(remain)}</span>円
                    </span>
                ) : (
                    <span style={{ fontSize: 11, color: P.subDim, fontFamily: font }}>
                        目標を設定すると達成率が表示されます
                    </span>
                )}
            </div>
        </div>
    );
}

// ===== ⑤ 今日のおすすめカード =====
// データソース: ユーザー自身の archives から machineRanking で実績上位の機種を提示。
// （P-EVIDENCE の島データは現状ホームへ未連携。連携時はここを置き換える想定）
function RecommendCard({ rec, onSelect }) {
    if (!rec) {
        return (
            <div style={sectionGap}>
                <SectionHeader title="今日のおすすめ" />
                <div style={{ ...cardBase, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: P.textHi, fontFamily: font }}>記録がまだありません</div>
                        <div style={{ fontSize: 10.5, color: P.sub, fontFamily: font, marginTop: 3 }}>
                            台選びから狙い台を探しましょう
                        </div>
                    </div>
                    <SelectButton onClick={onSelect} />
                </div>
            </div>
        );
    }
    const [c1, c2] = thumbColor(rec.machineName);
    return (
        <div style={sectionGap}>
            <SectionHeader title="今日のおすすめ" />
            <div style={{
                ...cardBase,
                display: "flex",
                alignItems: "center",
                gap: 12,
                border: `1px solid ${P.borderHi}`,
                background: "linear-gradient(180deg, var(--surface-hi) 0%, var(--surface) 100%)",
            }}>
                <div style={{
                    flex: "0 0 auto",
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${c1}, ${c2})`,
                    border: `1px solid ${P.borderHi}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 22,
                    fontWeight: 900,
                    fontFamily: font,
                }}>
                    {String(rec.machineName || "?").slice(0, 1)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: P.textHi,
                        fontFamily: font,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}>
                        {rec.machineName}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
                        <div>
                            <span style={{ fontSize: 9.5, color: P.sub, fontFamily: font }}>期待値累計</span>
                            <div style={{ fontSize: 14, fontWeight: 800, color: rec.evAmount >= 0 ? P.green : P.red, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                                {fmtSigned(rec.evAmount)}円
                            </div>
                        </div>
                        <div>
                            <span style={{ fontSize: 9.5, color: P.sub, fontFamily: font }}>実績</span>
                            <div style={{ fontSize: 14, fontWeight: 800, color: P.textHi, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                                {fmt(rec.sessions)}回
                            </div>
                        </div>
                    </div>
                </div>
                <SelectButton onClick={onSelect} />
            </div>
        </div>
    );
}
function SelectButton({ onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                flex: "0 0 auto",
                minHeight: 44,
                padding: "0 14px",
                borderRadius: 12,
                background: "color-mix(in srgb, var(--blue) 14%, transparent)",
                border: `1px solid color-mix(in srgb, var(--blue) 36%, ${P.border})`,
                color: P.cyan,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: font,
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                whiteSpace: "nowrap",
            }}
        >
            台選びへ
            <IconChevron color={P.cyan} size={14} />
        </button>
    );
}

// ===== 月間目標 編集ボトムシート =====
// 親側で open 中だけ条件マウントしているため、open するたびに新規 mount され
// 初期値は props.current を素直に反映できる（エフェクト内 setState は不要）
function MonthlyTargetEditor({ current, onClose, onSave }) {
    const [value, setValue] = useState(() => String(Math.max(0, Math.floor(Number(current) || 0))));

    const PRESETS = [
        { label: "3万", value: 30000 },
        { label: "5万", value: 50000 },
        { label: "10万", value: 100000 },
        { label: "20万", value: 200000 },
        { label: "30万", value: 300000 },
    ];

    const parsed = Math.max(0, Math.floor(Number(value) || 0));
    const canSave = parsed >= 0;

    const handleSave = () => {
        if (!canSave) return;
        onSave(parsed);
        onClose();
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                zIndex: 9000,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%",
                    maxWidth: 480,
                    background: "var(--surface)",
                    borderTop: `1px solid ${P.borderHi}`,
                    borderRadius: "20px 20px 0 0",
                    padding: "18px 16px calc(20px + env(safe-area-inset-bottom))",
                    color: P.text,
                    fontFamily: font,
                    boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
                }}
            >
                <div style={{ width: 36, height: 4, borderRadius: 2, background: P.border, margin: "0 auto 14px" }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: P.textHi, marginBottom: 6 }}>
                    月間期待値目標を設定
                </div>
                <div style={{ fontSize: 11.5, color: P.sub, marginBottom: 16 }}>
                    今月のセッション累計期待値の目標額（円）を設定します
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <input
                        type="number"
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="30000"
                        style={{
                            flex: 1,
                            minHeight: 48,
                            padding: "10px 14px",
                            background: "var(--surface-hi)",
                            border: `1px solid ${P.borderHi}`,
                            borderRadius: 12,
                            color: P.textHi,
                            fontSize: 22,
                            fontWeight: 800,
                            fontFamily: font,
                            fontVariantNumeric: "tabular-nums",
                            outline: "none",
                            textAlign: "right",
                            letterSpacing: -0.3,
                        }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 700, color: P.sub }}>円</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 18 }}>
                    {PRESETS.map((p) => {
                        const active = parsed === p.value;
                        return (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => setValue(String(p.value))}
                                style={{
                                    minHeight: 44,
                                    padding: "8px 4px",
                                    borderRadius: 10,
                                    border: active ? `1px solid ${P.blue}` : `1px solid ${P.border}`,
                                    background: active
                                        ? "color-mix(in srgb, var(--blue) 22%, transparent)"
                                        : "var(--surface-hi)",
                                    color: active ? P.cyan : P.text,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    fontFamily: font,
                                    cursor: "pointer",
                                }}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            flex: 1,
                            minHeight: 48,
                            borderRadius: 12,
                            background: "transparent",
                            border: `1px solid ${P.border}`,
                            color: P.sub,
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: font,
                            cursor: "pointer",
                        }}
                    >
                        キャンセル
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canSave}
                        style={{
                            flex: 1.4,
                            minHeight: 48,
                            borderRadius: 12,
                            background: `linear-gradient(135deg, ${P.blue}, ${P.cyan})`,
                            border: "none",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 800,
                            fontFamily: font,
                            cursor: canSave ? "pointer" : "not-allowed",
                            opacity: canSave ? 1 : 0.5,
                            boxShadow: "0 0 14px rgba(0,166,255,0.35)",
                        }}
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
}

// ===== ⑥ ハンターランクカード（コンパクト・横1行） =====
function HunterRankCard({ rank, streakDays, sessionsCount, onOpen }) {
    const level = Math.max(1, Math.floor(Number(rank?.level) || 1));
    const currentXp = Math.max(0, Math.floor(Number(rank?.currentXp) || 0));
    const nextRequired = Math.max(1, Math.floor(Number(rank?.nextRequired) || 1));
    const totalXp = Math.max(0, Math.floor(Number(rank?.totalXp) || 0));
    const rate = Math.min(100, Math.round((currentXp / nextRequired) * 100));
    return (
        <div style={sectionGap}>
            <div style={{ fontSize: 15, fontWeight: 700, color: P.text, fontFamily: font, letterSpacing: 0.3, marginBottom: 10 }}>
                ハンターランク
            </div>
            <div
                onClick={onOpen}
                style={{
                    ...cardBase,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "linear-gradient(180deg, var(--surface) 0%, var(--surface) 100%)",
                    border: `1px solid ${P.borderHi}`,
                    boxShadow: P.glowBlue,
                    cursor: onOpen ? "pointer" : "default",
                }}>
                {/* LVシールド */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                    <IconShield size={54} />
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        pointerEvents: "none",
                    }}>
                        <div style={{ fontSize: 8, color: P.text, fontWeight: 700, fontFamily: font, lineHeight: 1, marginTop: -2 }}>LV</div>
                        <div style={{ fontSize: 19, color: "var(--yellow)", fontWeight: 900, fontFamily: font, lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>{level}</div>
                    </div>
                </div>

                {/* EXP + バー */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: P.textHi, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(totalXp)} <span style={{ fontSize: 11, fontWeight: 700, color: P.sub }}>EXP</span>
                    </div>
                    <div style={{ position: "relative", height: 6, borderRadius: 999, background: "var(--surface-alt)", marginTop: 6, overflow: "hidden" }}>
                        <div style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${rate}%`,
                            background: `linear-gradient(90deg, ${P.blue}, ${P.cyan})`,
                            borderRadius: 999,
                        }} />
                    </div>
                    <div style={{ fontSize: 10, color: P.sub, fontFamily: font, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(currentXp)} / {fmt(nextRequired)}
                    </div>
                </div>

                {/* 連続日数 / セッション数 / chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <RankStat glyph={<span style={{ fontSize: 15 }}>🔥</span>} value={`連続${streakDays}日`} />
                    <RankStat glyph={<span style={{ color: P.blue, fontSize: 15 }}>◎</span>} value={`${sessionsCount}回`} />
                    <IconChevron color={P.subDim} />
                </div>
            </div>
        </div>
    );
}
function RankStat({ glyph, value }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {glyph}
            <span style={{ fontSize: 11, fontWeight: 800, color: P.textHi, fontFamily: font, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {value}
            </span>
        </div>
    );
}

// ===== ⑦ 実績・バッジ =====
function BadgesRow({ badges, onSeeAll }) {
    return (
        <div style={sectionGap}>
            <SectionHeader title="実績・バッジ" action="すべて見る" onAction={onSeeAll} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {badges.map((b) => (
                    <BadgeCard key={b.id} {...b} />
                ))}
            </div>
        </div>
    );
}
function BadgeCard({ label, sub, color, unlocked, glyph }) {
    return (
        <div style={{
            background: P.cardAlt,
            border: `1px solid ${P.border}`,
            borderRadius: 14,
            padding: "10px 4px 8px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            opacity: unlocked ? 1 : 0.42,
            filter: unlocked ? "none" : "grayscale(50%)",
        }}>
            <BadgeIcon color={color} glyph={glyph} unlocked={unlocked} />
            <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: P.textHi,
                fontFamily: font,
                textAlign: "center",
                marginTop: 1,
                lineHeight: 1.15,
            }}>
                {label}
            </div>
            <div style={{
                fontSize: 8.5,
                color: P.sub,
                fontFamily: font,
                textAlign: "center",
                lineHeight: 1.15,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
            }}>
                {sub}
            </div>
        </div>
    );
}
function BadgeIcon({ color = "var(--yellow)", glyph = "★", unlocked = true }) {
    const reactId = useId();
    const id = `bg-${reactId.replace(/[:]/g, "")}`;
    return (
        <svg width="44" height="44" viewBox="0 0 64 64">
            <defs>
                <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor={color} stopOpacity="0.55" />
                    <stop offset="55%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill={`url(#${id})`} />
            <circle cx="32" cy="32" r="20" fill={`color-mix(in srgb, ${color} 18%, var(--surface))`}
                stroke={color} strokeWidth="1.5" strokeOpacity={unlocked ? 0.9 : 0.4} />
            <text x="32" y="40"
                fontSize="22"
                fontWeight="900"
                fontFamily="system-ui"
                fill={color}
                textAnchor="middle">
                {glyph}
            </text>
        </svg>
    );
}

// ===== ⑧ 直近の記録（3件） =====
function RecentRecords({ records, onSeeAll }) {
    return (
        <div style={sectionGap}>
            <SectionHeader title="直近の記録" action="すべて見る" onAction={onSeeAll} />
            {records.length === 0 ? (
                <div style={{ ...cardBase, color: P.sub, fontSize: 12, textAlign: "center", padding: 20 }}>
                    記録がまだありません
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {records.map((r) => (
                        <RecentRow key={r.id} record={r} onClick={onSeeAll} />
                    ))}
                </div>
            )}
        </div>
    );
}
function RecentRow({ record, onClick }) {
    const [c1, c2] = thumbColor(record.machineName);
    return (
        <div
            onClick={onClick}
            style={{
                ...cardBase,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 12,
                cursor: "pointer",
            }}>
            <div style={{
                flex: "0 0 auto",
                width: 46,
                height: 46,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
                border: `1px solid ${P.borderHi}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 18,
                fontWeight: 900,
                fontFamily: font,
            }}>
                {String(record.machineName || "?").slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: P.textHi,
                    fontFamily: font,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}>
                    {record.machineName}
                </div>
                <div style={{ fontSize: 10.5, color: P.sub, fontFamily: font, marginTop: 4 }}>
                    {record.metaLabel}
                </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: record.amountColor,
                    fontFamily: font,
                    fontVariantNumeric: "tabular-nums",
                }}>
                    {fmtSigned(record.amount)}円
                </span>
                <IconChevron color={P.subDim} />
            </div>
        </div>
    );
}

// ===== 戦略マップ：今日の狙い（サマリー4指標 + 本日のTOP3 + 戦略マップ導線） =====
// 表示データは strategyMapData.buildStrategyMap（仮データ・将来 P-EVIDENCE / 差玉解析連携予定）。
// タップで台選びタブ（＝戦略マップ画面）へ遷移する。
const VERDICT_COLOR = {
    strong: "var(--green)",
    watch: "var(--yellow)",
    weak: "var(--red)",
    nodata: "var(--sub)",
};
function StrategyTodayCard({ data, onOpen }) {
    const kpi = data.kpi;
    const top3 = (data.top5 || []).slice(0, 3);
    const metrics = [
        { label: "推定期待値", value: fmtSigned(kpi.evPerHour), unit: "円/h", color: kpi.evPerHour >= 0 ? P.green : P.red },
        { label: "予測回転率", value: fmt1(kpi.rot), unit: "/k", color: P.cyan },
        { label: "候補台数", value: fmt(kpi.candidates), unit: "台", color: P.green },
        { label: "確信度", value: fmt(kpi.confidence), unit: "%", color: P.yellow },
    ];
    return (
        <div style={sectionGap}>
            <SectionHeader title="今日の狙い" action="戦略マップへ" onAction={onOpen} />
            <div style={{ ...cardBase, padding: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {metrics.map((m) => (
                        <div key={m.label} style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 9.5, color: P.sub, fontWeight: 700, whiteSpace: "nowrap" }}>{m.label}</div>
                            <div style={{ ...numStyle(16, m.color), marginTop: 5, whiteSpace: "nowrap" }}>{m.value}</div>
                            <div style={{ fontSize: 8.5, color: P.subDim, fontWeight: 700, marginTop: 1 }}>{m.unit}</div>
                        </div>
                    ))}
                </div>

                <div style={{ fontSize: 11.5, color: P.sub, fontWeight: 700, margin: "16px 0 8px" }}>本日のTOP3</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {top3.map((m) => {
                        const vc = VERDICT_COLOR[m.verdict] || P.sub;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={onOpen}
                                style={{
                                    textAlign: "left",
                                    minWidth: 0,
                                    background: P.cardAlt,
                                    border: `1px solid ${P.border}`,
                                    borderRadius: 12,
                                    padding: "10px 10px 11px",
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: P.cyan }}>{m.rank}位</span>
                                    {m.isStar && <span style={{ color: P.yellow, fontSize: 12 }}>★</span>}
                                </div>
                                <div style={{ ...numStyle(20, P.textHi), marginTop: 4 }}>{m.num}</div>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 6 }}>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: vc, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>{fmt1(m.rot)}</span>
                                    <span style={{ fontSize: 9, color: P.subDim }}>/k</span>
                                </div>
                                <div style={{ fontSize: 10, color: P.sub, marginTop: 3 }}>
                                    確信度 <span style={{ color: vc, fontWeight: 800 }}>{m.confidence}%</span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={onOpen}
                    style={{
                        width: "100%",
                        minHeight: 48,
                        marginTop: 14,
                        borderRadius: 12,
                        border: "none",
                        background: `linear-gradient(135deg, ${P.blue}, ${P.cyan})`,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: font,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        cursor: "pointer",
                        boxShadow: "0 0 14px rgba(0,166,255,0.32)",
                    }}
                >
                    戦略マップを開く
                    <IconChevron color="#fff" size={16} />
                </button>
            </div>
        </div>
    );
}

// ===== 差玉解析ステータス（独立タブにせず、ホームから起動） =====
function DeltaStatusCard({ status, onAnalyze, onViewMap }) {
    const dotColor = status.hasScans ? P.green : P.subDim;
    return (
        <div style={sectionGap}>
            <SectionHeader title="差玉解析" />
            <div style={cardBase}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: P.sub, fontWeight: 700 }}>最終解析</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: P.textHi, fontFamily: font, marginTop: 5, whiteSpace: "nowrap" }}>{status.lastLabel}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: P.sub, fontWeight: 700 }}>解析済み台数</div>
                        <div style={{ ...numStyle(18, P.cyan), marginTop: 3 }}>
                            {fmt(status.machineCount)}<span style={{ fontSize: 11, fontWeight: 700, color: P.subDim, marginLeft: 2 }}>台</span>
                        </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: P.sub, fontWeight: 700 }}>状態</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                            <span style={{ fontSize: 12, fontWeight: 800, color: P.textHi }}>{status.stateLabel}</span>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onAnalyze}
                    style={{
                        width: "100%",
                        minHeight: 48,
                        borderRadius: 12,
                        border: "none",
                        background: P.blue,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: font,
                        cursor: "pointer",
                    }}
                >
                    解析する
                </button>
                {status.hasScans && (
                    <button
                        type="button"
                        onClick={onViewMap}
                        style={{
                            width: "100%",
                            minHeight: 44,
                            marginTop: 10,
                            borderRadius: 12,
                            border: `1px solid ${P.borderHi}`,
                            background: P.cardSub,
                            color: P.text,
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: font,
                            cursor: "pointer",
                        }}
                    >
                        保存した解析をマップで見る
                    </button>
                )}
            </div>
        </div>
    );
}

// =====================================================
// メインコンポーネント
// =====================================================
export default function HomeDashboard({ S }) {
    // ホーム画面タイトルロゴの起動演出：同一セッション内で最初の1回だけ再生する。
    // useState の遅延初期化により、マウント時に1回だけ判定・フラグ更新を行う。
    const [playLogoIntro] = useState(() => shouldPlayLogoIntro());

    // S からの読み取り値はローカルに展開しておく（React Compiler が useMemo の
    // 依存を正しく推論できるよう、フック内では S.xxx を直接参照しない）
    const archivesRaw = S?.archives;
    const sessionStarted = S?.sessionStarted;
    const liveEv = S?.ev;
    const investYen = S?.investYen;
    const recoveryYen = S?.recoveryYen;
    const rotRowsRaw = S?.rotRows;
    const archives = useMemo(() => archivesRaw || [], [archivesRaw]);

    // 時間帯あいさつ
    const greeting = useMemo(() => {
        const h = new Date().getHours();
        if (h < 5) return { title: "おつかれさまです！", sub: "深夜まで、ナイスハンティング！" };
        if (h < 11) return { title: "おはようございます！", sub: "今日もナイスハンティング！" };
        if (h < 17) return { title: "こんにちは！", sub: "今日もナイスハンティング！" };
        if (h < 22) return { title: "おかえりなさい！", sub: "今日もナイスハンティング！" };
        return { title: "おつかれさまです！", sub: "ラストスパート、いきましょう！" };
    }, []);

    // 通知未読フラグ（実データ）
    const hasUnread = useMemo(() => {
        const list = S?.notificationLog || [];
        return Array.isArray(list) && list.some((n) => !n?.read);
    }, [S?.notificationLog]);

    // 日付キー
    const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const yesterdayStr = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }, []);

    // 本日データの有無：稼働中セッションの rotRows に type:"data" 行があるか、
    // または今日の archives が存在すれば「データあり」とする（モック1枚目=なし / 2枚目=あり）
    const hasTodayData = useMemo(() => {
        const liveHasData = (rotRowsRaw || []).some((r) => r?.type === "data");
        const archivedToday = archives.some((a) => a?.date === todayStr);
        return liveHasData || archivedToday;
    }, [rotRowsRaw, archives, todayStr]);

    // ② 本日のサマリー（今日の archives 集計 + 稼働中セッションの live 値を加味）
    const today = useMemo(() => {
        const arc = archives.filter((a) => a?.date === todayStr);
        let ev = arc.reduce((s, a) => s + getEvAmount(a), 0);
        let actual = 0;
        let hasActual = false;
        for (const a of arc) {
            const pl = getActualPL(a);
            if (pl != null) { actual += pl; hasActual = true; }
        }
        // 稼働中セッションは未アーカイブのため、二重計上にならない
        if (sessionStarted && liveEv) {
            ev += Number(liveEv.workAmount) || 0;
            const inv = Number(investYen) || 0;
            const rec = Number(recoveryYen) || 0;
            if (inv > 0 || rec > 0) { actual += rec - inv; hasActual = true; }
        }
        return { ev, actual, hasActual };
    }, [archives, todayStr, sessionStarted, liveEv, investYen, recoveryYen]);

    // 前日比（期待値ベース）：今日 EV − 昨日 EV
    const dayDiff = useMemo(() => {
        const yEv = archives.filter((a) => a?.date === yesterdayStr).reduce((s, a) => s + getEvAmount(a), 0);
        return today.ev - yEv;
    }, [archives, yesterdayStr, today.ev]);

    // 信頼度：稼働中セッションの判定結果から算出（0..1 → %）
    const { confidencePct, hasConfidence } = useMemo(() => {
        if (sessionStarted && liveEv) {
            const d = evDecision(liveEv);
            const c = Number(d?.confidence);
            if (isFinite(c)) return { confidencePct: c * 100, hasConfidence: true };
        }
        return { confidencePct: 0, hasConfidence: false };
    }, [sessionStarted, liveEv]);

    // 今月の累積 EV（④ 今月の進捗用）
    const monthlyEvTotal = useMemo(() => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const currentMonth = `${yyyy}-${mm}`;
        const daily = aggregateByDay(archives, currentMonth);
        return daily.reduce((sum, d) => sum + (Number(d.evAmount) || 0), 0);
    }, [archives]);

    // ④ 月間目標（永続化された設定値）
    const monthlyTarget = Math.max(0, Math.floor(Number(S?.monthlyEvTarget) || 0));
    const [targetEditorOpen, setTargetEditorOpen] = useState(false);
    const handleSaveTarget = (v) => {
        if (typeof S?.setMonthlyEvTarget === "function") {
            S.setMonthlyEvTarget(Math.max(0, Math.floor(Number(v) || 0)));
        }
    };

    // ⑤ 今日のおすすめ：実績上位の機種（machineRanking）
    const recommend = useMemo(() => {
        const top = machineRanking(archives, { limit: 1 })[0];
        if (!top) return null;
        return {
            machineName: top.machineName,
            evAmount: Math.round(Number(top.evAmount) || 0),
            sessions: Number(top.sessions) || 0,
        };
    }, [archives]);

    // ⑥ ハンターランク（実データ・ダミーfallback なし）
    const streakDays = Math.max(0, Math.floor(Number(S?.hunterCounters?.streakDays) || 0));
    const sessionsCount = archives.length;

    // ⑦ バッジ：モックアップの 5 種を実 unlock 状態で表示
    const homeBadges = useMemo(() => {
        const unlockedSet = new Set(S?.hunterRank?.unlockedBadges || []);
        const displayIds = ["first_jp", "streak_7", "lv25", "rot_10k", "sessions_10"];
        const labelMap = {
            first_jp: { glyph: "★", short: "初撃破", sub: "初めての大当たり" },
            streak_7: { glyph: "🔥", short: "7日連続", sub: "7日連続稼働" },
            lv25: { glyph: "♦", short: "一流ハンター", sub: "ランクLv25" },
            rot_10k: { glyph: "◉", short: "1万回転", sub: "通算1万回転" },
            sessions_10: { glyph: "＋", short: "+回到達", sub: "通算10回到達" },
        };
        return displayIds.map((id) => {
            const def = BADGES.find((b) => b.id === id);
            const m = labelMap[id] || {};
            return {
                id,
                label: m.short || def?.label || id,
                sub: m.sub || def?.description || "",
                color: def?.color || "var(--yellow)",
                glyph: m.glyph || def?.icon || "★",
                unlocked: unlockedSet.has(id),
            };
        });
    }, [S?.hunterRank?.unlockedBadges]);

    // ⑧ 直近の記録（最新 3 件）
    const recentRecords = useMemo(() => {
        const arc = archives.slice(-3).reverse();
        return arc.map((a) => {
            const netRot = Math.max(0, Math.floor(Number(a?.stats?.netRot) || 0));
            const rph = Number(a?.settings?.rotPerHour) || 0;
            const hours = rph > 0 ? netRot / rph : 0;
            // 時刻ラベル: 今日は時刻、昨日は「前日」、それ以外は M/D
            let timeLabel;
            if (a?.date === todayStr) timeLabel = a?.time || "本日";
            else if (a?.date === yesterdayStr) timeLabel = "前日";
            else if (typeof a?.date === "string" && a.date.length >= 10) {
                timeLabel = `${Number(a.date.slice(5, 7))}/${Number(a.date.slice(8, 10))}`;
            } else timeLabel = "";
            const metaParts = [timeLabel];
            if (hours > 0) metaParts.push(`${hours.toFixed(1)}時間`);
            if (netRot > 0) metaParts.push(`${fmt(netRot)}G`);
            // 金額: 実収支があれば収支、なければ期待値
            const pl = getActualPL(a);
            const hasActual = pl != null;
            const amount = hasActual ? pl : getEvAmount(a);
            const amountColor = hasActual
                ? (amount >= 0 ? P.green : P.red)
                : (amount >= 0 ? P.blue : P.red);
            return {
                id: a?.id ?? `${a?.date}-${a?.time}-${a?.machineName}`,
                machineName: a?.machineName || "(機種未設定)",
                metaLabel: metaParts.filter(Boolean).join(" ・ "),
                amount,
                amountColor,
            };
        });
    }, [archives, todayStr, yesterdayStr]);

    // 戦略マップ サマリー・TOP3（仮データ・将来 P-EVIDENCE / 差玉解析連携予定）
    const playingNum = S?.sessionStarted ? (Number(S?.machineNum) || null) : null;
    const strategyData = useMemo(() => buildStrategyMap({ playingNum }), [playingNum]);

    // 差玉解析ステータス（保存済みスキャン pt_deltaScans から導出）
    const deltaScansRaw = S?.deltaScans;
    const deltaStatus = useMemo(() => {
        const scans = Array.isArray(deltaScansRaw) ? deltaScansRaw : [];
        if (scans.length === 0) {
            return { hasScans: false, lastLabel: "—", machineCount: 0, stateLabel: "未解析" };
        }
        const sorted = [...scans].sort((a, b) =>
            String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""))
        );
        const last = sorted[0];
        const machineCount = scans.reduce((s, sc) => s + (Array.isArray(sc?.rows) ? sc.rows.length : 0), 0);
        // 日時ラベル: 今日は時刻、それ以外は M/D
        let lastLabel = "—";
        const created = String(last?.createdAt || "");
        const day = String(last?.date || created.slice(0, 10));
        if (day === todayStr) {
            lastLabel = created.length >= 16
                ? `本日 ${new Date(created).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                : "本日";
        } else if (day.length >= 10) {
            lastLabel = `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
        }
        return { hasScans: true, lastLabel, machineCount, stateLabel: "解析済み" };
    }, [deltaScansRaw, todayStr]);

    // ナビゲーション（S.setTab は未知の値を currentMode へパススルーする）
    const goRecord = () => S?.setTab?.("rot");
    const goSelect = () => S?.setTab?.("select");
    const goAnalysis = () => S?.setTab?.("calendar");
    // 台選びタブ＝戦略マップ画面 / 差玉解析・保存解析マップ
    const goStrategy = () => S?.setTab?.("select");
    const goDelta = () => S?.setTab?.("delta");
    const goDeltaMap = () => S?.setTab?.("deltaMap");

    return (
        <div style={{
            minHeight: "100%",
            background: P.bgGrad,
            padding: "0 16px 48px",
            fontFamily: font,
            color: P.text,
        }}>
            {/* ① ヘッダー */}
            <Header onBell={() => S?.openNotificationPanel?.()} hasUnread={hasUnread} greeting={greeting} playLogoIntro={playLogoIntro} />

            {/* ② 本日のサマリー */}
            <TodaySummaryCard
                hasData={hasTodayData}
                todayEv={today.ev}
                todayActual={today.actual}
                hasActual={today.hasActual}
                dayDiff={dayDiff}
                confidencePct={confidencePct}
                hasConfidence={hasConfidence}
                onDetail={goAnalysis}
            />

            {/* 今日の狙い（戦略マップ サマリー + 本日のTOP3 + 戦略マップ導線） */}
            <StrategyTodayCard data={strategyData} onOpen={goStrategy} />

            {/* 差玉解析ステータス（独立タブにせず、ここから起動） */}
            <DeltaStatusCard status={deltaStatus} onAnalyze={goDelta} onViewMap={goDeltaMap} />

            {/* ③ 次のアクション */}
            <ActionButtons onRecord={goRecord} onSelect={goSelect} onAnalysis={goAnalysis} />

            {/* ④ 今月の進捗 */}
            <MonthProgressCard
                ev={monthlyEvTotal}
                target={monthlyTarget}
                onEdit={() => setTargetEditorOpen(true)}
            />
            {targetEditorOpen && (
                <MonthlyTargetEditor
                    current={monthlyTarget}
                    onClose={() => setTargetEditorOpen(false)}
                    onSave={handleSaveTarget}
                />
            )}

            {/* ⑤ 今日のおすすめ */}
            <RecommendCard rec={recommend} onSelect={goSelect} />

            {/* ⑥ ハンターランク */}
            <HunterRankCard
                rank={S?.hunterRank}
                streakDays={streakDays}
                sessionsCount={sessionsCount}
            />

            {/* ⑦ 実績・バッジ */}
            <BadgesRow badges={homeBadges} onSeeAll={goAnalysis} />

            {/* ⑧ 直近の記録 */}
            <RecentRecords records={recentRecords} onSeeAll={goAnalysis} />
        </div>
    );
}
