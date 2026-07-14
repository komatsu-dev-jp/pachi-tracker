import React, { useMemo, useState } from "react";
import { deriveSpecForMachine, searchMachines } from "../../machineDB";
import {
  calculateYutimeEV,
  createYutimeSessionFromMachine,
  deriveNormalExpectedNetBalls,
} from "./yutimeCalculator";

const fieldStyle = {
  width: "100%",
  minHeight: 44,
  boxSizing: "border-box",
  borderRadius: 11,
  border: "1px solid var(--sm-line-hi)",
  background: "var(--sm-card)",
  color: "var(--sm-text)",
  padding: "10px 12px",
  fontSize: 16,
};

const numberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const fmtYen = (value) => value == null
  ? "—"
  : `${value >= 0 ? "+" : ""}${Math.round(value).toLocaleString("ja-JP")}円`;

function Result({ result, mode }) {
  if (!result?.valid) {
    const payoutMissing = result?.missing?.includes("yutimeExpectedNetBalls");
    return (
      <div style={{ padding: 13, borderRadius: 13, border: "1px solid var(--sm-line)", background: "var(--sm-card)", color: "var(--sm-sub-hi)", fontSize: 12, lineHeight: 1.6 }}>
        {payoutMissing
          ? "期待出玉の入力が必要です。遊タイム中のスルーと電サポ増減を含む平均純増玉を入力してください。"
          : "確率・発動回転数・現在カウント・1K回転率を入力すると計算できます。"}
      </div>
    );
  }
  const values = [
    ["期待値", fmtYen(result.selectedEV)],
    ["残り回転", `${result.remainingSpins.toLocaleString()}回`],
    ["到達率", `${(result.reachProbability * 100).toFixed(1)}%`],
    ["平均投資", `${Math.round(result.selectedInvestment).toLocaleString()}円`],
  ];
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${result.selectedEV >= 0 ? "var(--sm-green)" : "var(--sm-red)"}`, background: "var(--sm-card)", overflow: "hidden" }}>
      <div style={{ padding: "11px 12px", fontSize: 13, fontWeight: 900, color: result.selectedEV >= 0 ? "var(--sm-green)" : "var(--sm-red)" }}>
        {mode === "cash" ? "現金" : mode === "chodama" ? "貯玉" : "持ち玉"}の計算結果
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--sm-line)" }}>
        {values.map(([label, value]) => (
          <div key={label} style={{ padding: 10, borderRight: "1px solid var(--sm-line)", borderBottom: "1px solid var(--sm-line)" }}>
            <div style={{ fontSize: 9, color: "var(--sm-sub)" }}>{label}</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 900, color: "var(--sm-text)", fontFamily: "var(--font-mono)" }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 11, color: "var(--sm-sub-hi)", fontSize: 10, lineHeight: 1.6 }}>
        期待値0円以上の開始：{result.selectedBreakEvenLowSpins ?? "—"}回<br />
        現金 {fmtYen(result.cashEV)} / 持ち玉・貯玉 {fmtYen(result.heldEV)}
      </div>
    </div>
  );
}

export default function YutimeCalculatorSheet({ S, initialMachineName = "", onClose }) {
  const machines = useMemo(() => searchMachines("", S?.customMachines), [S?.customMachines]);
  const initialMachine = useMemo(
    () => searchMachines(initialMachineName, S?.customMachines).find((m) => m.name === initialMachineName)
      || searchMachines(initialMachineName, S?.customMachines)[0]
      || null,
    [initialMachineName, S?.customMachines],
  );
  const initialSession = createYutimeSessionFromMachine(initialMachine, { assumedStart1K: initialMachine?.border1K || S?.border });
  const [machineName, setMachineName] = useState(initialMachine?.name || initialMachineName || "");
  const [selectedMachine, setSelectedMachine] = useState(initialMachine);
  const [currentLowSpins, setCurrentLowSpins] = useState("0");
  const [start1K, setStart1K] = useState(String(initialSession?.assumedStart1K || S?.border || ""));
  const [triggerLowSpins, setTriggerLowSpins] = useState(String(initialSession?.triggerLowSpins || ""));
  const [durationSpins, setDurationSpins] = useState(String(initialSession?.durationSpins || ""));
  const [expectedNetBalls, setExpectedNetBalls] = useState(initialSession?.expectedNetBalls == null ? "" : String(initialSession.expectedNetBalls));
  const [sourceUrl, setSourceUrl] = useState(initialSession?.sourceUrl || "");
  const [source, setSource] = useState(initialSession?.source || "manual");
  const [playMode, setPlayMode] = useState(S?.playMode || "cash");

  const applyMachineName = (value) => {
    setMachineName(value);
    const exact = machines.find((machine) => machine.name === value);
    if (!exact) {
      setSelectedMachine(null);
      setSource("manual");
      return;
    }
    setSelectedMachine(exact);
    const session = createYutimeSessionFromMachine(exact, { assumedStart1K: exact.border1K || S?.border });
    setTriggerLowSpins(session ? String(session.triggerLowSpins) : "");
    setDurationSpins(session ? String(session.durationSpins || "") : "");
    setExpectedNetBalls(session?.expectedNetBalls == null ? "" : String(session.expectedNetBalls));
    setStart1K(String(session?.assumedStart1K || exact.border1K || S?.border || ""));
    setSourceUrl(session?.sourceUrl || "");
    setSource(session?.source || "manual");
  };

  const machineSpec = selectedMachine ? deriveSpecForMachine(selectedMachine) : {
    spec1R: S?.spec1R,
    specAvgRounds: S?.specAvgRounds,
    specSapo: S?.specSapo,
  };
  const result = calculateYutimeEV({
    probabilityDenom: selectedMachine?.synthProb || S?.synthDenom,
    triggerLowSpins: numberOrNull(triggerLowSpins),
    currentLowSpins: numberOrNull(currentLowSpins),
    start1K: numberOrNull(start1K),
    normalExpectedNetBalls: deriveNormalExpectedNetBalls(machineSpec),
    yutimeExpectedNetBalls: numberOrNull(expectedNetBalls),
    rentBalls: S?.rentBalls,
    exRate: S?.exRate,
    playMode,
  });

  const saveForSession = () => {
    const trigger = numberOrNull(triggerLowSpins);
    if (!(trigger > 0)) return;
    S?.setYutimeSession?.({
      machineName: machineName.trim(),
      triggerLowSpins: Math.round(trigger),
      durationSpins: Math.max(0, Math.round(numberOrNull(durationSpins) || 0)),
      expectedNetBalls: numberOrNull(expectedNetBalls),
      assumedStart1K: Math.max(0, numberOrNull(start1K) || 0),
      sourceUrl,
      verifiedAt: selectedMachine?.yutime?.verifiedAt || "",
      source: selectedMachine?.yutime ? source : "manual",
    });
    S?.setYutimeDecision?.(null);
    onClose();
  };

  const label = (text) => <div style={{ marginBottom: 5, fontSize: 10, fontWeight: 800, color: "var(--sm-sub-hi)" }}>{text}</div>;
  return (
    <div role="dialog" aria-modal="true" aria-label="遊タイム期待値計算" style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.72)" }}>
      <div style={{ width: "min(480px, 100%)", maxHeight: "92dvh", overflowY: "auto", borderRadius: "24px 24px 0 0", background: "var(--sm-bg)", border: "1px solid var(--sm-line-hi)", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", background: "var(--sm-bg)", borderBottom: "1px solid var(--sm-line)" }}>
          <div><div style={{ fontSize: 17, fontWeight: 900, color: "var(--sm-text)" }}>遊タイム期待値計算</div><div style={{ fontSize: 10, color: "var(--sm-sub)", marginTop: 3 }}>途中の通常当たりと到達率を含めます</div></div>
          <button type="button" aria-label="閉じる" onClick={onClose} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid var(--sm-line-hi)", background: "var(--sm-card)", color: "var(--sm-text)", fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          <div>{label("機種")}<input aria-label="遊タイム機種" list="yutime-machine-list" value={machineName} onChange={(e) => applyMachineName(e.target.value)} placeholder="機種名を入力" style={fieldStyle} /><datalist id="yutime-machine-list">{machines.map((machine) => <option key={machine.id || machine.name} value={machine.name} />)}</datalist></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>{label("現在の低確率カウント")}<input aria-label="現在カウント" type="number" min="0" inputMode="numeric" value={currentLowSpins} onChange={(e) => setCurrentLowSpins(e.target.value)} style={fieldStyle} /></div>
            <div>{label("想定1K回転率")}<input aria-label="1K回転率" type="number" min="0" step="0.1" inputMode="decimal" value={start1K} onChange={(e) => setStart1K(e.target.value)} style={fieldStyle} /></div>
          </div>
          <div>{label("遊技方法")}<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>{[["cash", "現金"], ["mochi", "持ち玉"], ["chodama", "貯玉"]].map(([id, text]) => <button key={id} type="button" onClick={() => setPlayMode(id)} style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${playMode === id ? "var(--sm-cyan)" : "var(--sm-line)"}`, background: playMode === id ? "color-mix(in srgb, var(--sm-cyan) 18%, var(--sm-card))" : "var(--sm-card)", color: "var(--sm-text)", fontWeight: 800 }}>{text}</button>)}</div></div>
          <div style={{ padding: 12, borderRadius: 13, border: "1px solid var(--sm-line)", background: "var(--sm-card-hi)" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "var(--sm-cyan)", marginBottom: 9 }}>遊タイム条件（手動修正できます）</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><div>{label("発動回転数")}<input aria-label="発動回転数" type="number" min="0" value={triggerLowSpins} onChange={(e) => { setTriggerLowSpins(e.target.value); setSource("manual"); }} style={fieldStyle} /></div><div>{label("遊タイム回数")}<input aria-label="遊タイム回数" type="number" min="0" value={durationSpins} onChange={(e) => { setDurationSpins(e.target.value); setSource("manual"); }} style={fieldStyle} /></div></div>
            <div style={{ marginTop: 10 }}>{label("スルー込み平均純増玉")}<input aria-label="遊タイム平均純増玉" type="number" min="0" value={expectedNetBalls} onChange={(e) => { setExpectedNetBalls(e.target.value); setSource("manual"); }} placeholder="入力が必要" style={fieldStyle} /></div>
            <div style={{ marginTop: 8, fontSize: 10, color: "var(--sm-sub)", lineHeight: 1.5 }}>{selectedMachine?.yutime ? `機種データ：${source === "manual" ? "手動修正" : "自動"}` : "機種データ：手動"}{sourceUrl && <><br />根拠URLあり</>}</div>
          </div>
          <Result result={result} mode={playMode} />
          <button type="button" onClick={saveForSession} style={{ minHeight: 48, border: "none", borderRadius: 13, background: "linear-gradient(180deg, var(--sm-cyan-hi), var(--sm-cyan))", color: "var(--sm-on-cyan)", fontSize: 14, fontWeight: 900 }}>この条件を実戦設定に使う</button>
        </div>
      </div>
    </div>
  );
}
