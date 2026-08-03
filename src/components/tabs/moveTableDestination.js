export function createMoveTableDestination({
    moveMochiBalls,
    moveMachineName,
    moveMachineNum,
    moveStartRot,
    moveYutimeTarget,
    picked,
    S,
    calculateYutimeEV,
    deriveNormalExpectedNetBalls,
    isYutimeTargetingSession,
}) {
    const mochi = Math.max(0, Math.round(Number(moveMochiBalls) || 0));
    const yutimeLowSpins = moveYutimeTarget?.currentLowSpins
        ?? Math.max(0, Math.round(Number(moveStartRot) || 0));
    const dest = {
        machineName: (moveMachineName || "").trim(),
        machineNum: (moveMachineNum || "").trim(),
        startRot: Math.max(0, Math.round(Number(moveStartRot) || 0)),
        ...(picked || {}),
        rentBalls: moveYutimeTarget?.rentBalls ?? picked?.rentBalls,
        exRate: moveYutimeTarget?.exRate ?? picked?.exRate,
        investPace: moveYutimeTarget?.investPace ?? picked?.investPace,
        yutimeSession: moveYutimeTarget?.session || picked?.yutimeSession || null,
        yutimeLowSpins,
    };
    if (moveYutimeTarget?.decision) {
        dest.yutimeDecision = {
            ...moveYutimeTarget.decision,
            machineName: dest.machineName,
            currentLowSpins: yutimeLowSpins,
            spec: dest.yutimeSession,
        };
    }
    if (isYutimeTargetingSession(dest.yutimeSession)) {
        const moveResult = calculateYutimeEV({
            probabilityDenom: dest.synthDenom || S.synthDenom,
            triggerLowSpins: dest.yutimeSession.triggerLowSpins,
            currentLowSpins: dest.yutimeLowSpins,
            start1K: dest.yutimeSession.assumedStart1K || S.border,
            normalExpectedNetBalls: deriveNormalExpectedNetBalls({
                spec1R: dest.spec1R || S.spec1R,
                specAvgRounds: dest.specAvgRounds || S.specAvgRounds,
                specSapo: dest.specSapo ?? S.specSapo,
            }),
            yutimeExpectedNetBalls: dest.yutimeSession.expectedNetBalls,
            rentBalls: dest.rentBalls || dest.yutimeSession?.rentBalls || S.rentBalls,
            exRate: dest.exRate || dest.yutimeSession?.exRate || S.exRate,
            playMode: S.currentMochiBalls > 0 ? "mochi" : S.currentChodama > 0 ? "chodama" : "cash",
        });
        dest.yutimeDecision = dest.yutimeDecision || {
            version: 2,
            createdAt: new Date().toISOString(),
            machineName: dest.machineName,
            currentLowSpins: dest.yutimeLowSpins,
            assumedStart1K: dest.yutimeSession.assumedStart1K || S.border,
            rateSource: "assumed",
            playMode: S.currentMochiBalls > 0 ? "mochi" : S.currentChodama > 0 ? "chodama" : "cash",
            rentBalls: dest.rentBalls || dest.yutimeSession?.rentBalls || S.rentBalls,
            exRate: dest.exRate || dest.yutimeSession?.exRate || S.exRate,
            pachinkoRateLabel: dest.yutimeSession?.pachinkoRateLabel || "",
            pachinkoRateSource: dest.yutimeSession?.pachinkoRateSource || "app",
            spec: dest.yutimeSession,
            result: moveResult,
        };
    }
    return { mochi, dest };
}
