import React, { useMemo, useId, useState } from "react";
import { font } from "../../constants";
import { BADGES } from "../hunter/badges";
import { aggregateByDay, getEvAmount } from "../analysis/analysisSelectors";

// =====================================================
// 「EV運用OS」風 ホームダッシュボード
// 見た目優先プロトタイプ（CLAUDE.md 規定）
// - logic.js / 計算式 / 保存データ構造には一切触れていない
// - 既存 S.hunterRank / S.archives / S.notificationLog の値を読むだけ
// =====================================================

// 固定パレット（ダーク前提）
const P = {
    bgGrad: "linear-gradient(180deg, #08111A 0%, #020713 100%)",
    card: "#0F1A2B",
    cardAlt: "#0A1320",
    cardSub: "#0B1424",
    border: "#1F2937",
    borderHi: "#26334A",
    blue: "#00A6FF",
    cyan: "#7DD3FC",
    green: "#22C55E",
    yellow: "#F59E0B",
    red: "#EF4444",
    purple: "#8B5CF6",
    text: "#E5E7EB",
    textHi: "#F8FAFC",
    sub: "#94A3B8",
    subDim: "#64748B",
    glowBlue: "0 0 24px color-mix(in srgb, #00A6FF 18%, transparent)",
};

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
const labelStyle = (size = 12, color = P.sub) => ({
    fontSize: size,
    fontWeight: 600,
    color,
    fontFamily: font,
    letterSpacing: 0.2,
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
const IconTarget = ({ size = 56, color = P.blue, opacity = 0.18 }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity }}>
        <circle cx="32" cy="32" r="22" />
        <circle cx="32" cy="32" r="14" />
        <circle cx="32" cy="32" r="6" fill={color} />
        <path d="M44 20 L52 12 M52 12 L52 18 M52 12 L46 12" />
    </svg>
);
const IconArrowUp = () => (
    <svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke={P.blue} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }}>
        <path d="M14 42 L30 26 L40 36 L52 18" />
        <path d="M52 18 L52 28" />
        <path d="M52 18 L42 18" />
    </svg>
);
const IconRefresh = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={P.green} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 14.5-7.1L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-14.5 7.1L3 16" />
        <path d="M3 21v-5h5" />
    </svg>
);
const IconArrowDown = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={P.red} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 9 L12 17 L19 9" />
    </svg>
);
const IconFire = ({ color = P.yellow }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22c4.418 0 8-3.582 8-8 0-1.892-1.5-4-3-5.5-1 2-2 2.5-3 2-1-1 1-3 0-5-1-2-4-3-4-3s.5 3-1 4-3 2-3 6c0 4.418 3.582 8 8 8 z" />
        <path d="M12 22c2 0 4-1.79 4-4 0-1.5-1-2.5-2-3-0.5 1-1 1-1.5 0.5-0.5-0.5 0-1.5-0.5-2.5 0 0-2 1-2 3 0 1.5 1 3 2 3z" fill={color} fillOpacity="0.35" />
    </svg>
);
const IconChevron = ({ color = P.subDim }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);
const IconPencil = ({ color = P.sub, size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
);
const IconSparkle = ({ color = "#FBBF24", size = 14 }) => (
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

// ===== ヘッダー =====
function Header({ onBell, hasUnread }) {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 4px 18px",
        }}>
            <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: P.textHi, fontFamily: font, lineHeight: 1.2, letterSpacing: -0.3 }}>
                    おかえりなさい！
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: P.sub, fontFamily: font, marginTop: 4 }}>
                    今日もナイスハンティング！
                </div>
            </div>
            <button
                type="button"
                onClick={onBell}
                aria-label="通知"
                style={{
                    position: "relative",
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "color-mix(in srgb, #0F1A2B 86%, transparent)",
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
                        boxShadow: "0 0 8px #00A6FF",
                        border: `1.5px solid ${P.card}`,
                    }} />
                )}
            </button>
        </div>
    );
}

// ===== 目標カード（左右共通） =====
function TargetCard({ label, subtitle, ev, target, onEdit, editAriaLabel }) {
    const safeTarget = Math.max(0, Math.floor(Number(target) || 0));
    const safeEv = Math.floor(Number(ev) || 0);
    const rawRate = safeTarget > 0 ? (safeEv / safeTarget) * 100 : 0;
    const rate = safeTarget > 0 ? Math.max(0, Math.min(100, Math.round(rawRate))) : 0;
    const achieved = safeTarget > 0 && safeEv >= safeTarget;
    const remain = Math.max(0, safeTarget - safeEv);
    const barFill = achieved
        ? "linear-gradient(90deg, #F59E0B, #FBBF24)"
        : `linear-gradient(90deg, ${P.blue}, ${P.cyan})`;
    const barGlow = achieved
        ? "0 0 10px rgba(251,191,36,0.5)"
        : "0 0 8px rgba(0,166,255,0.4)";

    return (
        <div style={{
            ...cardBase,
            position: "relative",
            overflow: "hidden",
            border: achieved ? `1px solid color-mix(in srgb, #FBBF24 50%, ${P.border})` : `1px solid ${P.border}`,
            boxShadow: achieved ? "0 0 16px color-mix(in srgb, #FBBF24 16%, transparent)" : "none",
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={labelStyle(11.5, achieved ? "#FBBF24" : P.cyan)}>
                    {achieved ? "目標達成！" : label}
                </span>
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label={editAriaLabel}
                    style={{
                        width: 28,
                        height: 28,
                        minHeight: 28,
                        borderRadius: 8,
                        background: "color-mix(in srgb, #00A6FF 12%, transparent)",
                        border: `1px solid ${P.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                    }}
                >
                    <IconPencil color={P.cyan} size={13} />
                </button>
            </div>
            {subtitle && (
                <div style={{ fontSize: 10, color: P.subDim, fontFamily: font, marginBottom: 2 }}>
                    {subtitle}
                </div>
            )}
            <div style={{ ...numStyle(22, achieved ? "#FBBF24" : P.textHi), marginTop: 4 }}>
                {fmtSigned(safeEv)}<span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2 }}>円</span>
            </div>
            <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#16243A", marginTop: 10, overflow: "hidden" }}>
                <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${rate}%`,
                    background: barFill,
                    borderRadius: 999,
                    boxShadow: barGlow,
                    transition: "width 0.6s ease",
                }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 4 }}>
                {achieved ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: "#FBBF24", fontFamily: font }}>
                        <IconSparkle color="#FBBF24" size={12} />
                        達成済み
                    </span>
                ) : (
                    <span style={{ fontSize: 10.5, color: P.sub, fontFamily: font }}>
                        あと <span style={{ color: P.textHi, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(remain)}</span>円
                    </span>
                )}
                <span style={{ fontSize: 10.5, color: achieved ? "#FBBF24" : P.cyan, fontWeight: 700, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                    {rate}%
                </span>
            </div>
            <div style={{ fontSize: 10, color: P.subDim, fontFamily: font, marginTop: 4 }}>
                目標 {fmt(safeTarget)}円
            </div>
        </div>
    );
}

// ===== 目標・月間サマリーカード =====
//   左: 本日の稼働目標（月間目標の残額 ÷ 残り日数で自動逆算）
//   右: 今月の期待値目標（pt_monthlyEvTarget と当月 archives 累計 EV を連動）
function GoalAndMonthlyCard({ dailyEv, dailyTarget, monthlyEv, monthlyTarget, onEditMonthlyTarget }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, ...sectionGap }}>
            <TargetCard
                label="本日の稼働目標"
                subtitle="月間目標から逆算"
                ev={dailyEv}
                target={dailyTarget}
                onEdit={onEditMonthlyTarget}
                editAriaLabel="月間目標を編集"
            />
            <TargetCard
                label="今月の期待値目標"
                ev={monthlyEv}
                target={monthlyTarget}
                onEdit={onEditMonthlyTarget}
                editAriaLabel="月間目標を編集"
            />
        </div>
    );
}

// ===== 月間目標 編集ボトムシート =====
// 親側で open 中だけ条件マウントしているため、open するたびに新規 mount され
// 初期値は props.current を素直に反映できる（エフェクト内 setState は不要）
function MonthlyTargetEditor({ current, onClose, onSave }) {
    const [value, setValue] = useState(() => String(Math.max(0, Math.floor(Number(current) || 0))));

    const PRESETS = [
        { label: "5万", value: 50000 },
        { label: "10万", value: 100000 },
        { label: "20万", value: 200000 },
        { label: "30万", value: 300000 },
        { label: "50万", value: 500000 },
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
                    background: "#0F1A2B",
                    borderTop: `1px solid ${P.borderHi}`,
                    borderRadius: "20px 20px 0 0",
                    padding: "18px 16px calc(20px + env(safe-area-inset-bottom))",
                    color: P.text,
                    fontFamily: font,
                    boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
                }}
            >
                {/* ハンドル */}
                <div style={{ width: 36, height: 4, borderRadius: 2, background: P.border, margin: "0 auto 14px" }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: P.textHi, marginBottom: 6 }}>
                    月間期待値目標を設定
                </div>
                <div style={{ fontSize: 11.5, color: P.sub, marginBottom: 16 }}>
                    今月のセッション累計期待値の目標額（円）を設定します
                </div>

                {/* 数値入力 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <input
                        type="number"
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="100000"
                        style={{
                            flex: 1,
                            minHeight: 48,
                            padding: "10px 14px",
                            background: "#0B1424",
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

                {/* プリセット */}
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
                                        ? "color-mix(in srgb, #00A6FF 22%, transparent)"
                                        : "#0B1424",
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

                {/* アクション */}
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
                            color: "#03101F",
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

// ===== ハンターランクカード =====
function HunterRankCard({ rank, streakDays, sessionsCount, totalNetYen }) {
    const level = Math.max(1, Math.floor(Number(rank?.level) || 1));
    const currentXp = Math.max(0, Math.floor(Number(rank?.currentXp) || 0));
    const nextRequired = Math.max(1, Math.floor(Number(rank?.nextRequired) || 1));
    const totalXp = Math.max(0, Math.floor(Number(rank?.totalXp) || 0));
    const rate = Math.min(100, Math.round((currentXp / nextRequired) * 100));
    const remain = Math.max(0, nextRequired - currentXp);
    return (
        <div style={{
            ...cardBase,
            background: "linear-gradient(180deg, #0F1A2B 0%, #0A1320 100%)",
            border: `1px solid ${P.borderHi}`,
            boxShadow: P.glowBlue,
            ...sectionGap,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* ランクバッジ */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                    <IconShield size={64} />
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        pointerEvents: "none",
                    }}>
                        <div style={{ fontSize: 9, color: P.text, fontWeight: 700, fontFamily: font, lineHeight: 1, marginTop: -4 }}>LV</div>
                        <div style={{ fontSize: 22, color: "#FBBF24", fontWeight: 900, fontFamily: font, lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>{level}</div>
                        <div style={{ fontSize: 8, color: "#FBBF24", marginTop: 2 }}>★</div>
                    </div>
                </div>
                {/* 中央：ランク情報 + バー */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: P.textHi, fontFamily: font }}>ハンターランク</div>
                            <div style={{ fontSize: 11, color: P.sub, fontFamily: font, marginTop: 2 }}>通算 {fmt(totalXp)} EXP</div>
                        </div>
                        <IconChevron color={P.subDim} />
                    </div>
                    <div style={{ position: "relative", height: 6, borderRadius: 999, background: "#16243A", marginTop: 10, overflow: "hidden" }}>
                        <div style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${rate}%`,
                            background: `linear-gradient(90deg, ${P.blue}, ${P.cyan})`,
                            borderRadius: 999,
                        }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                        <span style={{ fontSize: 10.5, color: P.sub, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                            {fmt(currentXp)} / {fmt(nextRequired)}
                        </span>
                        <span style={{ fontSize: 10.5, color: P.sub, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                            次のLvまで {fmt(remain)} EXP
                        </span>
                    </div>
                </div>
            </div>

            {/* 下段ステータス 3カラム */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginTop: 14,
                paddingTop: 14,
                borderTop: `1px solid ${P.border}`,
            }}>
                <MiniStat icon={<span style={{ color: "#FB923C", fontSize: 14 }}>🔥</span>} label="連続稼働日数" value={`${streakDays}日`} />
                <MiniStat icon={<span style={{ color: P.blue, fontSize: 14 }}>◎</span>} label="総セッション数" value={`${sessionsCount}回`} />
                <MiniStat icon={<span style={{ color: P.green, fontSize: 14 }}>¥</span>} label="総収支" value={`${fmtSigned(totalNetYen)}円`} valColor={totalNetYen >= 0 ? P.green : P.red} />
            </div>
        </div>
    );
}
function MiniStat({ icon, label, value, valColor = P.textHi }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {icon}
                <span style={{ fontSize: 10.5, color: P.sub, fontFamily: font, fontWeight: 600 }}>{label}</span>
            </div>
            <div style={{
                fontSize: 14,
                fontWeight: 800,
                color: valColor,
                fontFamily: font,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: -0.3,
            }}>{value}</div>
        </div>
    );
}

// ===== 本日のサマリー（左大カード + 右小2カード） =====
function TodaySummary({ todayEv, todayActual, todayRotRate }) {
    // 桁が大きくなっても崩れないよう、|金額| に応じてフォントを段階的に縮小
    const absActual = Math.abs(todayActual);
    const actualFs = absActual >= 1000000 ? 16 : absActual >= 100000 ? 18 : 20;
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, ...sectionGap }}>
            {/* 左：本日のサマリー */}
            <div style={{ ...cardBase, position: "relative", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: P.textHi, fontFamily: font }}>本日のサマリー</span>
                    <IconInfo />
                </div>
                <div style={{ fontSize: 11, color: P.sub, fontFamily: font }}>本日の期待値</div>
                <div style={{ ...numStyle(34, P.blue), marginTop: 4, position: "relative", zIndex: 1 }}>
                    {fmtSigned(todayEv)}
                    <span style={{ fontSize: 16, fontWeight: 800, marginLeft: 2 }}>円</span>
                </div>
                {/* 薄いブルー発光ライン */}
                <div style={{
                    height: 2,
                    width: "70%",
                    marginTop: 10,
                    background: `linear-gradient(90deg, ${P.blue}, transparent)`,
                    borderRadius: 2,
                    boxShadow: "0 0 12px rgba(0,166,255,0.4)",
                }} />
                {/* 装飾矢印 */}
                <div style={{ position: "absolute", right: 8, top: 22 }}>
                    <IconArrowUp />
                </div>
            </div>

            {/* 右：実収支 + 回転率 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ ...cardBase, padding: 12, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: P.sub, fontFamily: font }}>実収支</span>
                        <IconArrowDown />
                    </div>
                    <div style={{
                        ...numStyle(actualFs, todayActual >= 0 ? P.green : P.red),
                        marginTop: 4,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                    }}>
                        {fmtSigned(todayActual)}<span style={{ fontSize: 12, fontWeight: 800, marginLeft: 1 }}>円</span>
                    </div>
                </div>
                <div style={{ ...cardBase, padding: 12, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: P.sub, fontFamily: font }}>回転率</span>
                        <IconRefresh />
                    </div>
                    <div style={{ ...numStyle(20, P.textHi), marginTop: 4 }}>
                        {todayRotRate}<span style={{ fontSize: 11, fontWeight: 700, color: P.sub, marginLeft: 2 }}>/K</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ===== 今月の期待値推移グラフ =====
const CHART_TABS = [
    { id: "ev", label: "期待値" },
    { id: "actual", label: "実収支" },
    { id: "compare", label: "比較" },
];

// 値の配列から見やすい min/max/ticks を導出（最低 4 段階、ゼロ線を含む）
function buildYScale(values) {
    if (values.length === 0) return { minY: -10000, maxY: 10000, ticks: [10000, 5000, 0, -10000] };
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(0, ...values);
    // ステップは 5K / 10K / 25K / 50K / 100K のいずれか
    const span = Math.max(1, rawMax - rawMin);
    const candidateSteps = [1000, 2000, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
    const step = candidateSteps.find((s) => span / s <= 5) || 1000000;
    const minY = Math.floor(rawMin / step) * step;
    const maxY = Math.ceil(rawMax / step) * step;
    const ticks = [];
    for (let v = maxY; v >= minY; v -= step) ticks.push(v);
    return { minY, maxY, ticks };
}

function ChartTabBar({ tab, onTabChange }) {
    return (
        <div style={{
            display: "flex",
            background: "#0B1424",
            border: `1px solid ${P.border}`,
            borderRadius: 999,
            padding: 3,
            gap: 2,
        }}>
            {CHART_TABS.map((t) => {
                const active = tab === t.id;
                return (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => onTabChange(t.id)}
                        style={{
                            minHeight: 28,
                            padding: "5px 12px",
                            borderRadius: 999,
                            border: active ? `1px solid ${P.blue}` : "1px solid transparent",
                            background: active
                                ? "color-mix(in srgb, #00A6FF 16%, transparent)"
                                : "transparent",
                            color: active ? P.blue : P.sub,
                            fontSize: 11.5,
                            fontWeight: active ? 700 : 600,
                            fontFamily: font,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            boxShadow: active ? "0 0 8px rgba(0,166,255,0.25)" : "none",
                        }}
                    >
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}

function MonthlyEvChart({ data, tab, onTabChange, hasData }) {
    const headerTitle = tab === "actual" ? "今月の実収支推移" : tab === "compare" ? "期待値 vs 実収支" : "今月の期待値推移";

    // 空データ時：プレースホルダーを表示してタブだけ操作可能に
    if (!hasData || !data || data.length === 0) {
        return (
            <div style={{ ...cardBase, ...sectionGap }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: P.textHi, fontFamily: font }}>{headerTitle}</span>
                    <ChartTabBar tab={tab} onTabChange={onTabChange} />
                </div>
                <div style={{
                    height: 160,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    color: P.sub,
                    fontSize: 12,
                    fontFamily: font,
                    background: "#0B1424",
                    border: `1px dashed ${P.border}`,
                    borderRadius: 10,
                }}>
                    <div style={{ fontWeight: 600 }}>今月の記録がまだありません</div>
                    <div style={{ fontSize: 10.5, color: P.subDim }}>セッションを記録するとグラフが表示されます</div>
                </div>
            </div>
        );
    }

    // SVG 座標系
    const W = 320;
    const H = 130;
    const padL = 36;
    const padR = 12;
    const padT = 10;
    const padB = 22;
    const xs = (i) => data.length === 1
        ? padL + (W - padL - padR) / 2
        : padL + (i / (data.length - 1)) * (W - padL - padR);

    // 現在タブで使う値配列（compare 時は両方含む）
    const valuesForScale = tab === "compare"
        ? data.flatMap((d) => [d.ev, d.actual])
        : data.map((d) => (tab === "actual" ? d.actual : d.ev));
    const { minY, maxY, ticks: yTicks } = buildYScale(valuesForScale);
    const ys = (v) => padT + (1 - (v - minY) / Math.max(1, maxY - minY)) * (H - padT - padB);

    const pickValue = (d, series) => (series === "actual" ? d.actual : d.ev);
    const buildPath = (series) => data
        .map((d, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(1)} ${ys(pickValue(d, series)).toFixed(1)}`)
        .join(" ");
    const buildArea = (series) => {
        const line = buildPath(series);
        if (data.length === 0) return "";
        return `${line} L ${xs(data.length - 1).toFixed(1)} ${ys(minY).toFixed(1)} L ${xs(0).toFixed(1)} ${ys(minY).toFixed(1)} Z`;
    };

    const mainSeries = tab === "actual" ? "actual" : "ev";
    const mainColor = tab === "actual" ? P.green : P.blue;
    const linePath = buildPath(mainSeries);
    const areaPath = buildArea(mainSeries);
    const lastIdx = data.length - 1;
    const lastX = xs(lastIdx);
    const lastY = ys(pickValue(data[lastIdx], mainSeries));
    const lastV = pickValue(data[lastIdx], mainSeries);

    // 比較タブ用のセカンダリ線（実収支を緑で重ねる）
    const secondaryPath = tab === "compare" ? buildPath("actual") : null;

    // X軸ラベル: データ点数に応じて 5 個程度
    const xTickIndices = (() => {
        const n = data.length;
        if (n <= 1) return [0];
        const want = Math.min(5, n);
        const set = new Set();
        for (let i = 0; i < want; i++) {
            set.add(Math.round((i / (want - 1)) * (n - 1)));
        }
        return Array.from(set).sort((a, b) => a - b);
    })();

    const lastDotGlow = tab === "actual" ? "rgba(34,197,94,0.4)" : "rgba(0,166,255,0.4)";
    const areaGradId = tab === "actual" ? "actualArea" : "evArea";
    const areaGradColor = tab === "actual" ? "#22C55E" : "#00A6FF";

    return (
        <div style={{ ...cardBase, ...sectionGap }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: P.textHi, fontFamily: font }}>{headerTitle}</span>
                <ChartTabBar tab={tab} onTabChange={onTabChange} />
            </div>

            {/* グラフ本体 */}
            <div style={{ position: "relative" }}>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="160" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={areaGradColor} stopOpacity="0.32" />
                            <stop offset="100%" stopColor={areaGradColor} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {/* Y軸グリッド */}
                    {yTicks.map((v) => (
                        <g key={v}>
                            <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)}
                                stroke={v === 0 ? "#26334A" : "#16243A"}
                                strokeDasharray={v === 0 ? "0" : "2 4"}
                                strokeWidth="1" />
                            <text x={padL - 6} y={ys(v) + 3}
                                fontSize="9" fill={P.subDim} textAnchor="end" fontFamily="system-ui">
                                {v >= 0 ? `+${Math.round(v / 1000)}K` : `${Math.round(v / 1000)}K`}
                            </text>
                        </g>
                    ))}
                    {/* エリア（メイン系列） */}
                    {data.length > 1 && <path d={areaPath} fill={`url(#${areaGradId})`} />}
                    {/* 比較タブ：実収支をセカンダリ線として重ねる */}
                    {secondaryPath && (
                        <path d={secondaryPath} fill="none" stroke="#22C55E" strokeWidth="1.6"
                            strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {/* メインライン */}
                    <path d={linePath} fill="none" stroke={mainColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {/* 最終点 */}
                    <circle cx={lastX} cy={lastY} r="3.5" fill={mainColor} />
                    <circle cx={lastX} cy={lastY} r="6" fill="none" stroke={mainColor} strokeOpacity="0.4" strokeWidth="1" />
                    {/* X軸ラベル */}
                    {xTickIndices.map((idx) => (
                        <text key={idx}
                            x={xs(idx)}
                            y={H - 6}
                            fontSize="9" fill={P.subDim} textAnchor="middle" fontFamily="system-ui">
                            {data[idx].day}日
                        </text>
                    ))}
                </svg>
                {/* 最終点バッジ */}
                <div style={{
                    position: "absolute",
                    top: 0,
                    right: 8,
                    background: tab === "actual"
                        ? "color-mix(in srgb, #22C55E 22%, transparent)"
                        : "color-mix(in srgb, #00A6FF 22%, transparent)",
                    border: `1px solid ${mainColor}`,
                    borderRadius: 8,
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 800,
                    color: tab === "actual" ? "#86EFAC" : P.cyan,
                    fontFamily: font,
                    fontVariantNumeric: "tabular-nums",
                    boxShadow: `0 0 12px ${lastDotGlow}`,
                }}>
                    {fmtSigned(lastV)}円
                </div>
                {/* 比較タブ用の凡例 */}
                {tab === "compare" && (
                    <div style={{
                        display: "flex",
                        gap: 12,
                        marginTop: 4,
                        fontSize: 10,
                        color: P.sub,
                        fontFamily: font,
                    }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 12, height: 2, background: P.blue, display: "inline-block" }} />
                            期待値
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                                width: 12, height: 2, background: P.green, display: "inline-block",
                                backgroundImage: "linear-gradient(90deg, #22C55E 50%, transparent 50%)",
                                backgroundSize: "6px 2px",
                            }} />
                            実収支
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ===== 最近の分析（3カード横スクロール対応） =====
function AnalysisCardsRow({ cards, onSeeAll }) {
    if (!cards || cards.length === 0) return null;
    return (
        <div style={sectionGap}>
            <SectionHeader title="最近の分析" action="すべて見る" onAction={onSeeAll} />
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 10,
            }}>
                {cards.map((c) => (
                    <AnalysisCard key={c.id} {...c} />
                ))}
            </div>
        </div>
    );
}
function AnalysisCard({ accent, accentSoft, icon, label, title, amount, sub, btnLabel }) {
    return (
        <div style={{
            ...cardBase,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            border: `1px solid ${accent}`,
            background: `linear-gradient(180deg, ${accentSoft} 0%, #0A1320 100%)`,
            minHeight: 138,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {icon}
                <span style={{ fontSize: 10.5, fontWeight: 700, color: accent, fontFamily: font, lineHeight: 1.2 }}>
                    {label}
                </span>
            </div>
            <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: P.textHi,
                fontFamily: font,
                lineHeight: 1.25,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
            }}>
                {title}
            </div>
            <div style={{
                ...numStyle(17, accent, 800),
                fontVariantNumeric: "tabular-nums",
            }}>
                {amount}
            </div>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "auto",
                gap: 4,
            }}>
                <span style={{ fontSize: 10, color: P.sub, fontFamily: font, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {sub}
                </span>
                <button
                    type="button"
                    style={{
                        background: `color-mix(in srgb, ${accent} 18%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${accent} 36%, transparent)`,
                        color: accent,
                        fontSize: 9.5,
                        fontWeight: 700,
                        fontFamily: font,
                        borderRadius: 6,
                        padding: "3px 8px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                    }}
                >
                    {btnLabel}
                    <span style={{ fontSize: 8 }}>›</span>
                </button>
            </div>
        </div>
    );
}

// ===== 実績・バッジ（横スクロール） =====
function BadgesRow({ badges, onSeeAll }) {
    return (
        <div style={sectionGap}>
            <SectionHeader title="実績・バッジ" action="すべて見る" onAction={onSeeAll} />
            <div
                style={{
                    display: "flex",
                    gap: 10,
                    overflowX: "auto",
                    overflowY: "hidden",
                    paddingBottom: 4,
                    margin: "0 -16px",
                    padding: "0 16px 6px",
                    scrollbarWidth: "none",
                    WebkitOverflowScrolling: "touch",
                    maskImage: "linear-gradient(90deg, black 96%, transparent)",
                    WebkitMaskImage: "linear-gradient(90deg, black 96%, transparent)",
                }}
                className="hide-scrollbar"
            >
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
            flex: "0 0 auto",
            width: 92,
            background: P.cardAlt,
            border: `1px solid ${P.border}`,
            borderRadius: 14,
            padding: "12px 8px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            opacity: unlocked ? 1 : 0.45,
            filter: unlocked ? "none" : "grayscale(50%)",
        }}>
            <BadgeIcon color={color} glyph={glyph} unlocked={unlocked} />
            <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: P.textHi,
                fontFamily: font,
                textAlign: "center",
                marginTop: 2,
            }}>
                {label}
            </div>
            <div style={{
                fontSize: 9,
                color: P.sub,
                fontFamily: font,
                textAlign: "center",
                lineHeight: 1.2,
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
function BadgeIcon({ color = "#FBBF24", glyph = "★", unlocked = true }) {
    const reactId = useId();
    const id = `bg-${reactId.replace(/[:]/g, "")}`;
    return (
        <svg width="56" height="56" viewBox="0 0 64 64">
            <defs>
                <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor={color} stopOpacity="0.55" />
                    <stop offset="55%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill={`url(#${id})`} />
            <circle cx="32" cy="32" r="20" fill={`color-mix(in srgb, ${color} 18%, #0A1320)`}
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

// ===== 直近の記録 1件 =====
function RecentRecord({ record, onSeeAll }) {
    if (!record) {
        return (
            <div style={sectionGap}>
                <SectionHeader title="直近の記録" action="すべて見る" onAction={onSeeAll} />
                <div style={{ ...cardBase, color: P.sub, fontSize: 12, textAlign: "center", padding: 20 }}>
                    記録がまだありません
                </div>
            </div>
        );
    }
    return (
        <div style={sectionGap}>
            <SectionHeader title="直近の記録" action="すべて見る" onAction={onSeeAll} />
            <div style={{
                ...cardBase,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 12,
            }}>
                {/* 機種画像枠 */}
                <div style={{
                    flex: "0 0 auto",
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #1E3A8A, #6D28D9)",
                    border: `1px solid ${P.borderHi}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: font,
                    letterSpacing: 1,
                }}>
                    {record.thumb}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: P.textHi,
                        fontFamily: font,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}>
                        {record.machineName}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 10.5, color: P.sub, fontFamily: font }}>
                            {record.timeLabel}
                        </span>
                        {record.exp != null && (
                            <span style={{
                                fontSize: 9,
                                fontWeight: 800,
                                color: P.yellow,
                                background: "color-mix(in srgb, #F59E0B 18%, transparent)",
                                border: `1px solid color-mix(in srgb, #F59E0B 32%, transparent)`,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontFamily: font,
                            }}>
                                EXP +{record.exp}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ fontSize: 9.5, color: P.sub, fontFamily: font }}>期待値</span>
                        <span style={{
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: record.ev >= 0 ? P.blue : P.red,
                            fontFamily: font,
                            fontVariantNumeric: "tabular-nums",
                        }}>
                            {fmtSigned(record.ev)}円
                        </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ fontSize: 9.5, color: P.sub, fontFamily: font }}>収支</span>
                        <span style={{
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: record.actual >= 0 ? P.green : P.red,
                            fontFamily: font,
                            fontVariantNumeric: "tabular-nums",
                        }}>
                            {fmtSigned(record.actual)}円
                        </span>
                    </div>
                </div>
                <IconChevron color={P.subDim} />
            </div>
        </div>
    );
}

// =====================================================
// メインコンポーネント
// =====================================================
export default function HomeDashboard({ S }) {
    // 通知未読フラグ（実データ）
    const hasUnread = useMemo(() => {
        const list = S?.notificationLog || [];
        return Array.isArray(list) && list.some((n) => !n?.read);
    }, [S?.notificationLog]);

    // 総セッション数：archives.length
    const sessionsCount = (S?.archives || []).length;

    // 総収支：archives の investYen/recoveryYen + stats.totalNetGainYen から算出
    // 簡易: recoveryYen - investYen を合算（ない archive は 0）
    const totalNetYen = useMemo(() => {
        const arc = S?.archives || [];
        return arc.reduce((acc, a) => acc + (Number(a?.recoveryYen) || 0) - (Number(a?.investYen) || 0), 0);
    }, [S?.archives]);

    // 直近の記録（latest archive）
    const latestRecord = useMemo(() => {
        const arc = S?.archives || [];
        if (arc.length === 0) {
            return null;
        }
        const last = arc[arc.length - 1];
        const ev = Number(last?.stats?.netGain) || 0;
        const actual = (Number(last?.recoveryYen) || 0) - (Number(last?.investYen) || 0);
        return {
            machineName: last.machineName || "(機種未設定)",
            timeLabel: `${last.date || ""} ${last.time || ""}`,
            exp: null,
            ev,
            actual,
            thumb: (last.machineName || "?").slice(0, 4),
        };
    }, [S?.archives]);

    // 月間 EV 推移グラフのデータ（実データ）
    //   - 今月の archives を日別集計し、ev / actual の累積系列を当日まで構築
    //   - 期待値: stats.workAmount の累積
    //   - 実収支: (recoveryYen - investYen) の累積（投資 or 回収のある archive のみ）
    //   - 今月の archive が 1 件も無い場合は hasData=false で「記録なし」プレースホルダー
    const { chartData, hasChartData } = useMemo(() => {
        const archives = S?.archives || [];
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const currentMonth = `${yyyy}-${mm}`;
        const today = now.getDate();

        const daily = aggregateByDay(archives, currentMonth);
        if (daily.length === 0) {
            return { chartData: [], hasChartData: false };
        }

        const byDay = {};
        for (const d of daily) {
            const day = Number(d.date.slice(-2));
            if (Number.isFinite(day)) byDay[day] = d;
        }

        const points = [];
        let cumEv = 0;
        let cumActual = 0;
        for (let day = 1; day <= today; day++) {
            const d = byDay[day];
            if (d) {
                cumEv += Number(d.evAmount) || 0;
                if (d.hasActual) cumActual += Number(d.actualPL) || 0;
            }
            points.push({ day, ev: cumEv, actual: cumActual });
        }
        return { chartData: points, hasChartData: true };
    }, [S?.archives]);

    const [chartTab, setChartTab] = React.useState("ev");

    // 月間目標カード用：当月の累積期待値（chartData の末尾要素 = 当月累計）
    const monthlyEvTotal = useMemo(() => {
        if (!hasChartData || chartData.length === 0) return 0;
        return Number(chartData[chartData.length - 1]?.ev) || 0;
    }, [chartData, hasChartData]);

    // 当日の累積期待値（archives から今日分を合算）
    const todayEv = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return (S?.archives || [])
            .filter((a) => a.date === today)
            .reduce((acc, a) => acc + getEvAmount(a), 0);
    }, [S?.archives]);

    // 月間目標値（永続化された設定値）。未保存時は 100,000 円のデフォルト
    const monthlyTarget = Math.max(0, Math.floor(Number(S?.monthlyEvTarget) || 0));

    // 本日の目標値 = 月間残額 ÷ 残り日数（今日含む）から逆算
    const dailyTarget = useMemo(() => {
        const today = new Date();
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const remainingDays = lastDay - today.getDate() + 1;
        const remainingEv = Math.max(0, monthlyTarget - monthlyEvTotal);
        return remainingDays > 0 ? Math.ceil(remainingEv / remainingDays) : 0;
    }, [monthlyTarget, monthlyEvTotal]);

    const [targetEditorOpen, setTargetEditorOpen] = useState(false);
    const handleSaveTarget = (v) => {
        if (typeof S?.setMonthlyEvTarget === "function") {
            S.setMonthlyEvTarget(Math.max(0, Math.floor(Number(v) || 0)));
        }
    };

    const analysisCards = [];

    // バッジ：実 unlockedBadges を元に、BADGES 定義から表示。未獲得も一覧に含める
    const homeBadges = useMemo(() => {
        const unlockedSet = new Set(S?.hunterRank?.unlockedBadges || []);
        // 代表的な6種類（順序固定）
        const displayIds = ["first_jp", "streak_7", "lv25", "rot_10k", "streak_30", "jp_100"];
        const labelMap = {
            first_jp: { glyph: "★", short: "初撃破", sub: "初めての大当たり" },
            streak_7: { glyph: "🔥", short: "7日連続", sub: "7日連続稼働" },
            lv25: { glyph: "♦", short: "一流ハンター", sub: "ハンターランクLv25" },
            rot_10k: { glyph: "◉", short: "1万回転", sub: "通算 10,000 回転" },
            streak_30: { glyph: "✪", short: "月皆勤", sub: "30日連続稼働" },
            jp_100: { glyph: "★", short: "百撃必殺", sub: "通算 100 回撃破" },
        };
        return displayIds.map((id) => {
            const def = BADGES.find((b) => b.id === id);
            const m = labelMap[id] || {};
            return {
                id,
                label: m.short || def?.label || id,
                sub: m.sub || def?.description || "",
                color: def?.color || "#FBBF24",
                glyph: m.glyph || def?.icon || "★",
                unlocked: unlockedSet.has(id),
            };
        });
    }, [S?.hunterRank?.unlockedBadges]);

    // ナビ系
    const goAnalysis = () => S?.setTab?.("calendar");

    return (
        <div style={{
            minHeight: "100%",
            background: P.bgGrad,
            padding: "0 16px 48px",
            fontFamily: font,
            color: P.text,
        }}>
            <Header onBell={() => S?.openNotificationPanel?.()} hasUnread={hasUnread} />

            {/* 2. 目標・月間サマリー */}
            <GoalAndMonthlyCard
                dailyEv={todayEv}
                dailyTarget={dailyTarget}
                monthlyEv={monthlyEvTotal}
                monthlyTarget={monthlyTarget}
                onEditMonthlyTarget={() => setTargetEditorOpen(true)}
            />

            {/* 月間目標 編集ボトムシート（開いている間だけマウント） */}
            {targetEditorOpen && (
                <MonthlyTargetEditor
                    current={monthlyTarget}
                    onClose={() => setTargetEditorOpen(false)}
                    onSave={handleSaveTarget}
                />
            )}

            {/* 3. ハンターランクカード */}
            <HunterRankCard
                rank={S?.hunterRank}
                streakDays={Math.max(0, Math.floor(Number(S?.hunterCounters?.streakDays) || 0)) || 7}
                sessionsCount={sessionsCount || 48}
                totalNetYen={totalNetYen || 52300}
            />

            {/* 4. 本日のサマリー */}
            <TodaySummary
                todayEv={8420}
                todayActual={-12500}
                todayRotRate={"18.4"}
            />

            {/* 5. 今月の期待値推移 */}
            <MonthlyEvChart data={chartData} tab={chartTab} onTabChange={setChartTab} hasData={hasChartData} />

            {/* 6. 最近の分析 */}
            <AnalysisCardsRow cards={analysisCards} onSeeAll={goAnalysis} />

            {/* 7. 実績・バッジ */}
            <BadgesRow badges={homeBadges} onSeeAll={goAnalysis} />

            {/* 8. 直近の記録 */}
            <RecentRecord record={latestRecord} onSeeAll={goAnalysis} />

            {/* スクロールバー非表示用の inline style 補助 */}
            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
}
