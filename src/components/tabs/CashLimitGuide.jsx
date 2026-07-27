/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef } from "react";
import { C, f, localDateStr } from "../../constants";
import {
    buildCashLimitPreAlert,
    projectCashLimit,
    rotationPer250FromStart1K,
} from "../../sessionProjection";
import { buildStrategyPlanContext } from "../strategy/strategyMapData";
import { makeNotification, NOTIF_CASH_LIMIT_WARNING } from "../../notifications";
import { triggerHaptic } from "../../haptics";

export function useLiveCashLimitGuide(S, ev) {
    const cashAlertSentRef = useRef(new Set());
    const strategyPlan = useMemo(() => buildStrategyPlanContext({
        date: localDateStr(new Date()),
        dailyResearchPlans: S.dailyResearchPlans,
        monthlyPlayPlans: S.monthlyPlayPlans,
        spinsPerHour: S.rotPerHour,
        defaultHours: 6,
        defaultCashLimit: 0,
        ballValueYen: Number(S.exRate) > 0 ? 1000 / Number(S.exRate) : Number(S.ballVal) || 4,
        rentBalls: S.rentBalls,
        exRate: S.exRate,
    }), [
        S.dailyResearchPlans,
        S.monthlyPlayPlans,
        S.rotPerHour,
        S.exRate,
        S.ballVal,
        S.rentBalls,
    ]);
    const guide = useMemo(() => {
        // start1Kは1,000円あたり、projectCashLimitは250玉あたりの回転数を使う。
        // 低貸しでも物理玉数へ直してから渡し、交換価値補正済みの値は混ぜない。
        const start1KPerMoney = Number(ev.start1K) > 0 ? Number(ev.start1K) : 0;
        const rentBallsPer1K = Number(strategyPlan.rentBalls) > 0 ? Number(strategyPlan.rentBalls) : 250;
        return projectCashLimit({
            cashLimit: strategyPlan.cashLimit,
            rawInvest: Number(S.dailyCashSpent) >= 0 ? Number(S.dailyCashSpent) : ev.rawInvest,
            rotationPer250: rotationPer250FromStart1K(start1KPerMoney, rentBallsPer1K),
            rentBalls: strategyPlan.rentBalls,
            spinsPerHour: strategyPlan.spinsPerHour,
            playMode: S.playMode,
        });
    }, [
        strategyPlan.cashLimit,
        strategyPlan.rentBalls,
        strategyPlan.spinsPerHour,
        ev.rawInvest,
        ev.start1K,
        S.dailyCashSpent,
        S.playMode,
    ]);
    const preAlert = useMemo(
        () => buildCashLimitPreAlert(guide, { warningMinutes: 30 }),
        [guide],
    );
    const sessionStarted = S.sessionStarted;
    const alertEnabled = S.notificationPrefs?.cashLimit !== false;
    const notificationLog = S.notificationLog;
    const pushNotification = S.pushNotification;
    const hapticEnabled = S.hapticFeedback;

    useEffect(() => {
        if (!sessionStarted || !preAlert.shouldAlert || !alertEnabled) return;
        const alertKey = `cash-limit:${strategyPlan.date}:${guide.cashLimit}`;
        const alreadyRecorded = (Array.isArray(notificationLog) ? notificationLog : [])
            .some((item) => item?.type === NOTIF_CASH_LIMIT_WARNING && item?.payload?.dedupeKey === alertKey);
        if (alreadyRecorded || cashAlertSentRef.current.has(alertKey)) return;
        cashAlertSentRef.current.add(alertKey);
        const roundedMinutes = Math.max(1, Math.ceil(preAlert.remainingMinutes || 0));
        const limitReached = preAlert.kind === "limit_reached";
        pushNotification?.(makeNotification(NOTIF_CASH_LIMIT_WARNING, {
            title: limitReached ? "現金上限に到達しました" : "現金上限まで30分以内です",
            body: limitReached
                ? "現金の追加投資を止める目安です。次の投資前に続行を確認してください。"
                : `現金残り約${Math.round(guide.remainingCash || 0).toLocaleString("ja-JP")}円・約${roundedMinutes}分です。次の投資前に続行を確認してください。`,
            payload: {
                dedupeKey: alertKey,
                date: strategyPlan.date,
                cashLimit: guide.cashLimit,
                remainingCash: guide.remainingCash,
                remainingMinutes: preAlert.remainingMinutes,
            },
        }));
        if (hapticEnabled) triggerHaptic(80);
    }, [
        sessionStarted,
        alertEnabled,
        notificationLog,
        pushNotification,
        hapticEnabled,
        preAlert,
        guide.cashLimit,
        guide.remainingCash,
        strategyPlan.date,
    ]);

    return { guide, preAlert };
}

export default function CashLimitGuide({ guide, preAlert }) {
    if (!guide || guide.status === "unset") return null;
    return (
        <section
            aria-label="現金上限ガイド"
            style={{
                padding: "11px 13px",
                borderRadius: 14,
                border: `1px solid ${guide.shouldStop ? C.red : C.yellow}`,
                background: guide.shouldStop
                    ? "color-mix(in srgb, var(--red) 8%, var(--surface))"
                    : "color-mix(in srgb, var(--yellow) 7%, var(--surface))",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <strong style={{ color: guide.shouldStop ? C.red : C.yellow, fontSize: 12 }}>
                    現金上限ガイド
                </strong>
                {preAlert?.kind === "approaching" && (
                    <span style={{ color: C.orange, fontSize: 9, fontWeight: 900 }}>
                        残り30分以内
                    </span>
                )}
                <span style={{ color: C.sub, fontSize: 9 }}>
                    上限 {f(guide.cashLimit)}円
                </span>
            </div>
            <div style={{ marginTop: 5, color: C.text, fontSize: 13, fontWeight: 900 }}>
                {guide.status === "over_limit"
                    ? `上限を${f(guide.overBy)}円超過`
                    : guide.status === "limit_reached"
                        ? "現金上限に到達"
                        : `現金残り ${f(guide.remainingCash)}円`}
            </div>
            <div style={{ marginTop: 4, color: C.subHi, fontSize: 10, lineHeight: 1.5 }}>
                {guide.shouldStop
                    ? "現金追加は停止目安です。"
                    : guide.calculationStatus === "ready"
                        ? `現金遊技なら残り約${f(guide.remainingSpins)}回・${f(guide.remainingHours, 1)}時間です。`
                        : "回転率の実測後に、残り回転数と時間を表示します。"}
                {!guide.usesCashNow && " 現在は持ち玉・貯玉遊技のため、現金残額は減りません。"}
            </div>
        </section>
    );
}
