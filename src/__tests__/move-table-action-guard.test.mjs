import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMoveTableActionGuard } from "../components/tabs/moveTableActionGuard.js";
import { createMoveTableDestination } from "../components/tabs/moveTableDestination.js";

test("move-table guard accepts only the first claim until released", () => {
    const guard = createMoveTableActionGuard();
    assert.equal(guard.claim(), true);
    assert.equal(guard.claim(), false);
    guard.release();
    assert.equal(guard.claim(), true);
});

test("move-table guard fails closed without a release", () => {
    const guard = createMoveTableActionGuard();
    assert.equal(guard.claim(), true);
    assert.equal(guard.claim(), false);
});

test("move-table destination preserves blank, zero, negative, and decimal input normalization without yutime", () => {
    const S = { currentMochiBalls: 0, currentChodama: 0 };
    const dependencies = {
        calculateYutimeEV: () => { throw new Error("must not calculate without a yutime session"); },
        deriveNormalExpectedNetBalls: () => { throw new Error("must not derive without a yutime session"); },
        isYutimeTargetingSession: () => false,
    };
    assert.deepEqual(createMoveTableDestination({
        moveMochiBalls: "", moveMachineName: "  ", moveMachineNum: "", moveStartRot: "-1.5", moveYutimeTarget: null, picked: null, S, ...dependencies,
    }), {
        mochi: 0,
        dest: { machineName: "", machineNum: "", startRot: 0, rentBalls: undefined, exRate: undefined, investPace: undefined, yutimeSession: null, yutimeLowSpins: 0 },
    });
    assert.equal(createMoveTableDestination({
        moveMochiBalls: "12.6", moveMachineName: " 台 ", moveMachineNum: " 7 ", moveStartRot: "0", moveYutimeTarget: null, picked: null, S, ...dependencies,
    }).mochi, 13);
});

test("move-table destination preserves yutime payload priority, calculations, and decisions", () => {
    const calculateArgs = [];
    const deriveArgs = [];
    const S = { synthDenom: 777, border: 18, spec1R: 1500, specAvgRounds: 7, specSapo: 40, rentBalls: 4, exRate: 3.5, currentMochiBalls: 10, currentChodama: 0 };
    const session = { targetingEnabled: true, triggerLowSpins: 100, expectedNetBalls: 1200, assumedStart1K: 20, pachinkoRateLabel: "4円", pachinkoRateSource: "machine" };
    const picked = { synthDenom: 888, spec1R: 1600, specAvgRounds: 8, specSapo: 60, rentBalls: 1, exRate: 1, investPace: 10, yutimeSession: { targetingEnabled: false } };
    const moveYutimeTarget = { currentLowSpins: 350, rentBalls: 2, exRate: 2.5, investPace: 16, session, decision: { version: 7, machineName: "old", currentLowSpins: 1, spec: { old: true }, untouched: "kept" } };
    const dependencies = {
        calculateYutimeEV: (args) => { calculateArgs.push(args); return { valid: true, selectedEV: 500 }; },
        deriveNormalExpectedNetBalls: (args) => { deriveArgs.push(args); return 900; },
        isYutimeTargetingSession: (value) => value?.targetingEnabled === true,
    };
    const { mochi, dest } = createMoveTableDestination({
        moveMochiBalls: "12.6", moveMachineName: " 新台 ", moveMachineNum: " 7 ", moveStartRot: "50", moveYutimeTarget, picked, S, ...dependencies,
    });

    assert.equal(mochi, 13);
    assert.equal(dest.machineName, "新台");
    assert.equal(dest.machineNum, "7");
    assert.equal(dest.startRot, 50);
    assert.equal(dest.yutimeLowSpins, 350);
    assert.equal(dest.yutimeSession, session);
    assert.equal(dest.rentBalls, 2);
    assert.equal(dest.exRate, 2.5);
    assert.equal(dest.investPace, 16);
    assert.deepEqual(deriveArgs, [{ spec1R: 1600, specAvgRounds: 8, specSapo: 60 }]);
    assert.deepEqual(calculateArgs, [{ probabilityDenom: 888, triggerLowSpins: 100, currentLowSpins: 350, start1K: 20, normalExpectedNetBalls: 900, yutimeExpectedNetBalls: 1200, rentBalls: 2, exRate: 2.5, playMode: "mochi" }]);
    assert.deepEqual(dest.yutimeDecision, { ...moveYutimeTarget.decision, machineName: "新台", currentLowSpins: 350, spec: session });

    const automatic = createMoveTableDestination({
        moveMochiBalls: "0", moveMachineName: "新台", moveMachineNum: "7", moveStartRot: "50", moveYutimeTarget: { currentLowSpins: 350, session }, picked, S: { ...S, currentMochiBalls: 0, currentChodama: 5 }, ...dependencies,
    }).dest.yutimeDecision;
    assert.equal(typeof automatic.createdAt, "string");
    assert.deepEqual({ ...automatic, createdAt: undefined }, { version: 2, createdAt: undefined, machineName: "新台", currentLowSpins: 350, assumedStart1K: 20, rateSource: "assumed", playMode: "chodama", rentBalls: 1, exRate: 1, pachinkoRateLabel: "4円", pachinkoRateSource: "machine", spec: session, result: { valid: true, selectedEV: 500 } });
});

test("RotTab wires the entry and confirmation actions through the guard", async () => {
    const source = await readFile(new URL("../components/tabs/RotTab.jsx", import.meta.url), "utf8");
    const confirmSource = source.slice(source.indexOf("const handleMoveConfirm = async"), source.indexOf("useEffect(() =>", source.indexOf("const handleMoveConfirm = async")));

    assert.match(source, /import \{ createMoveTableActionGuard \} from "\.\/moveTableActionGuard"/);
    assert.match(source, /import \{ createMoveTableDestination \} from "\.\/moveTableDestination"/);
    assert.match(source, /const moveEntryGuardRef = useRef\(createMoveTableActionGuard\(\)\)/);
    assert.match(source, /const moveSubmitGuardRef = useRef\(createMoveTableActionGuard\(\)\)/);
    assert.match(source, /if \(!moveEntryGuardRef\.current\.claim\(\)\) return;/);
    assert.match(confirmSource, /if \(!moveSubmitGuardRef\.current\.claim\(\)\) return;/);
    assert.match(confirmSource, /moveTableDestination = createMoveTableDestination\(/);
    assert.ok(confirmSource.indexOf("moveSubmitGuardRef.current.claim()") < confirmSource.indexOf("S.handleMoveTable(moveTableDestination.mochi, moveTableDestination.dest)"));
    assert.match(confirmSource, /setTimeout\(resolve, 0\)/);
    assert.match(source, /disabled=\{moveEntryProcessing\}/);
    assert.match(source, /確認中…/);
    assert.match(source, /入力途中の記録を確認しています/);
    assert.match(source, /移動中…/);
    assert.match(source, /label=\{moveSubmitState === "needsAttention" \? "閉じる" : "キャンセル"\}/);
    assert.match(source, /disabled=\{moveSubmitState === "processing"\}/);
    assert.match(source, /disabled=\{moveSubmitState !== "idle"\}/);
    assert.match(source, /role="alert"/);
});
