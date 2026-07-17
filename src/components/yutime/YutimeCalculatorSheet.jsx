import React, { useMemo, useState } from "react";
import { deriveSpecForMachine, getYutimeSelectionMachines } from "../../machineDB";
import { MACHINE_SORT_OPTIONS, filterMachines, sortMachines } from "../../machineSort";
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

const MACHINE_TYPE_FILTERS = [
  { id: "all", label: "全て" },
  { id: "スマパチ", label: "スマパチ" },
  { id: "ハイミドル", label: "ハイミドル" },
  { id: "ミドル", label: "ミドル" },
  { id: "ライトミドル", label: "ライトミドル" },
  { id: "甘デジ", label: "甘デジ" },
];

const MACHINE_TYPE_COLORS = {
  "スマパチ": "#f7971e",
  "ハイミドル": "#ef473a",
  "ミドル": "#2f6fed",
  "ライトミドル": "#20e3b2",
  "甘デジ": "#16a34a",
};

function MachineIcon({ machine }) {
  return (
    <div style={{
      width: 44,
      height: 44,
      flexShrink: 0,
      borderRadius: 10,
      background: MACHINE_TYPE_COLORS[machine?.type] || "var(--sm-sub)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontSize: 13,
      fontWeight: 800,
    }}>
      {(machine?.type || "機種").slice(0, 2)}
    </div>
  );
}

function MachinePicker({ machines, onBack, onSelect, onUseUnregistered }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [yutimeFilter, setYutimeFilter] = useState("equipped");
  const [sort, setSort] = useState("default");
  const filteredMachines = useMemo(() => {
    const queryResults = query.trim()
      ? machines.filter((machine) => {
        const needle = query.trim().normalize("NFKC").toLowerCase();
        return [machine?.name, machine?.modelName, machine?.maker, machine?.type, ...(machine?.aliases || [])]
          .some((value) => String(value || "").normalize("NFKC").toLowerCase().includes(needle));
      })
      : machines;
    const statusResults = yutimeFilter === "all"
      ? queryResults
      : queryResults.filter((machine) => machine.yutimeAudit?.status === yutimeFilter);
    return sortMachines(filterMachines(statusResults, { type: typeFilter }), sort);
  }, [machines, query, sort, typeFilter, yutimeFilter]);

  return (
    <div className="yutime-sheet" role="dialog" aria-modal="true" aria-label="遊タイム機種を選択" style={{ position: "fixed", inset: 0, zIndex: 1101, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden", overscrollBehavior: "none", background: "rgba(0,0,0,.72)", touchAction: "none" }}>
      <div style={{ width: "min(480px, 100%)", height: "min(780px, calc(100svh - 48px))", maxHeight: "calc(100% - 48px)", display: "flex", flexDirection: "column", contain: "layout paint", borderRadius: "24px 24px 0 0", background: "var(--sm-bg)", border: "1px solid var(--sm-line-hi)", overflow: "hidden", touchAction: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px" }}>
          <button type="button" onClick={onBack} style={{ minHeight: 44, border: "none", borderRadius: 999, padding: "8px 14px", background: "var(--sm-card-hi)", color: "var(--sm-text)", fontSize: 13, fontWeight: 700 }}>戻る</button>
          <div style={{ fontSize: 15, fontWeight: 900, color: "var(--sm-text)" }}>機種を選択</div>
          <div style={{ minWidth: 56, padding: "6px 10px", borderRadius: 999, background: "var(--sm-card-hi)", color: "var(--sm-sub)", fontSize: 11, fontWeight: 700, textAlign: "center" }}>{filteredMachines.length}機種</div>
        </div>

        <div aria-label="遊タイム搭載状態の絞り込み" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 10px" }}>
          {[["equipped", "搭載機のみ"], ["all", "98機種を含む全て"]].map(([id, text]) => {
            const active = yutimeFilter === id;
            return <button key={id} type="button" onClick={() => setYutimeFilter(id)} style={{ minHeight: 42, border: `1px solid ${active ? "var(--sm-cyan)" : "var(--sm-line)"}`, borderRadius: 10, background: active ? "color-mix(in srgb, var(--sm-cyan) 18%, var(--sm-card))" : "var(--sm-card)", color: "var(--sm-text)", fontSize: 12, fontWeight: 800 }}>{text}</button>;
          })}
        </div>

        <div aria-label="機種タイプ絞り込み" style={{ display: "flex", gap: 8, overflowX: "auto", overscrollBehaviorX: "contain", padding: "4px 16px 12px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}>
          {MACHINE_TYPE_FILTERS.map((filter) => {
            const active = typeFilter === filter.id;
            return (
              <button key={filter.id} type="button" onClick={() => setTypeFilter(filter.id)} style={{ minHeight: 44, flexShrink: 0, border: "none", borderRadius: 999, padding: "8px 16px", background: active ? "var(--sm-cyan)" : "var(--sm-card-hi)", color: active ? "var(--sm-on-cyan)" : "var(--sm-text)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                {filter.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 12px" }}>
          <label htmlFor="yutime-machine-sort" style={{ flexShrink: 0, color: "var(--sm-sub)", fontSize: 12, fontWeight: 700 }}>並び替え</label>
          <select id="yutime-machine-sort" value={sort} onChange={(event) => setSort(event.target.value)} style={{ ...fieldStyle, minHeight: 44, padding: "8px 36px 8px 12px", fontSize: 13, fontWeight: 700 }}>
            {MACHINE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: "auto", overscrollBehaviorY: "contain", minHeight: 0, paddingBottom: 12, scrollbarGutter: "stable", WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
          {filteredMachines.map((machine, index) => (
            <button key={machine.id || `${machine.name}-${index}`} type="button" onClick={() => onSelect(machine)} style={{ width: "100%", minHeight: 72, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: "none", borderBottom: "1px solid var(--sm-line)", background: "transparent", color: "var(--sm-text)", textAlign: "left" }}>
              <MachineIcon machine={machine} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", color: "var(--sm-text)", fontSize: 15, fontWeight: 800, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{machine.name}</div>
                <div style={{ marginTop: 2, color: "var(--sm-sub)", fontSize: 12 }}>{machine.maker || "メーカー未設定"}{machine.prob || machine.synthProb ? `  ${machine.prob || `1/${machine.synthProb}`}` : ""}</div>
                {machine.yutimeAudit?.status === "equipped" && (
                  <div style={{ marginTop: 3, color: "var(--sm-cyan)", fontSize: 10, fontWeight: 800 }}>
                    低確率{machine.yutime.triggerLowSpins}回転 → {machine.yutime.durationLabel || `時短${machine.yutime.durationSpins}回`}
                    {machine.releaseStatus === "scheduled" ? "（導入予定）" : ""}
                  </div>
                )}
                {machine.yutimeAudit?.status === "not-equipped" && <div style={{ marginTop: 3, color: "var(--sm-sub)", fontSize: 10, fontWeight: 700 }}>遊タイム非搭載・確認済み</div>}
                {machine.yutimeAudit?.status === "not-applicable" && <div style={{ marginTop: 3, color: "var(--sm-sub)", fontSize: 10, fontWeight: 700 }}>遊タイム対象外</div>}
                {(!machine.yutimeAudit || machine.yutimeAudit.status === "unverified") && <div style={{ marginTop: 3, color: "var(--sm-yellow)", fontSize: 10, fontWeight: 700 }}>搭載有無を未確認</div>}
              </div>
              <span aria-hidden="true" style={{ color: "var(--sm-sub)", fontSize: 18 }}>›</span>
            </button>
          ))}
          {filteredMachines.length === 0 && <div style={{ padding: "32px 20px 16px", color: "var(--sm-sub)", fontSize: 13, textAlign: "center" }}>該当する機種がありません</div>}
          {query.trim() && (
            <button type="button" onClick={() => onUseUnregistered(query.trim())} style={{ width: "calc(100% - 32px)", minHeight: 52, margin: "8px 16px 12px", border: "1px dashed var(--sm-line-hi)", borderRadius: 12, background: "var(--sm-card-hi)", color: "var(--sm-text)", fontSize: 14, fontWeight: 800 }}>
              <span style={{ marginRight: 7, color: "var(--sm-cyan)", fontSize: 18 }}>＋</span>「{query.trim()}」を未登録のまま使う
            </button>
          )}
        </div>

        <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--sm-line)", background: "var(--sm-bg)" }}>
          <div style={{ position: "relative" }}>
            <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: 14, color: "var(--sm-sub)", transform: "translateY(-50%)" }}>⌕</span>
            <input aria-label="機種名・メーカーで検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="機種名・メーカーで検索" style={{ ...fieldStyle, paddingLeft: 40 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Result({ result, mode }) {
  if (!result?.valid) {
    const payoutMissing = result?.missing?.includes("yutimeExpectedNetBalls");
    return (
      <div style={{ padding: 13, borderRadius: 13, border: "1px solid var(--sm-line)", background: "var(--sm-card)", color: "var(--sm-sub-hi)", fontSize: 12, lineHeight: 1.6 }}>
        {payoutMissing
          ? "遊タイム突入後の平均獲得玉が未確認です。機種情報を確認して入力してください。"
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
        <div style={{ marginBottom: 7, padding: "9px 10px", borderRadius: 10, background: "color-mix(in srgb, var(--sm-yellow) 10%, var(--sm-card))", border: "1px solid color-mix(in srgb, var(--sm-yellow) 32%, transparent)" }}>
          <span style={{ color: "var(--sm-sub-hi)" }}>当たらず遊タイムまで回す必要資金：</span>
          <strong style={{ color: "var(--sm-yellow)", fontSize: 13 }}>{fmtYen(result.selectedArrivalInvestment).replace("+", "")}</strong>
        </div>
        {result.budgetCanReach != null && (
          <div style={{ marginBottom: 7, color: result.budgetCanReach ? "var(--sm-green)" : "var(--sm-red)", fontSize: 11, fontWeight: 800 }}>
            {result.budgetCanReach
              ? `予算内で到達可能（残り約${Math.floor(result.budgetSurplusYen).toLocaleString()}円）`
              : `予算では${result.budgetCoveredSpins.toLocaleString()}回転まで・あと約${Math.ceil(result.budgetShortfallYen).toLocaleString()}円必要`}
          </div>
        )}
        期待値0円以上の開始：{result.selectedBreakEvenLowSpins ?? "—"}回<br />
        現金 {fmtYen(result.cashEV)} / 持ち玉・貯玉 {fmtYen(result.heldEV)}<br />
        到達必要資金：現金 {Math.ceil(result.arrivalInvestmentCash).toLocaleString()}円 / 持ち玉・貯玉 {Math.ceil(result.arrivalInvestmentHeld).toLocaleString()}円
      </div>
    </div>
  );
}

export default function YutimeCalculatorSheet({
  S,
  initialMachineName = "",
  initialSession: suppliedInitialSession = null,
  initialCurrentLowSpins = 0,
  initialStart1K = null,
  onClose,
}) {
  const machines = useMemo(() => getYutimeSelectionMachines(S?.customMachines), [S?.customMachines]);
  const initialMachine = useMemo(
    () => machines.find((machine) => machine.name === initialMachineName)
      || machines.find((machine) => (
        initialMachineName
        && [machine.name, machine.modelName, ...(machine.aliases || [])]
          .some((value) => String(value || "").normalize("NFKC").toLowerCase().includes(initialMachineName.normalize("NFKC").toLowerCase()))
      ))
      || null,
    [initialMachineName, machines],
  );
  const machineInitialSession = createYutimeSessionFromMachine(initialMachine, { assumedStart1K: initialMachine?.border1K || S?.border });
  const initialSession = suppliedInitialSession || machineInitialSession;
  const [machineName, setMachineName] = useState(initialMachine?.name || initialMachineName || "");
  const [selectedMachine, setSelectedMachine] = useState(initialMachine);
  const [currentLowSpins, setCurrentLowSpins] = useState(String(Math.max(0, Number(initialCurrentLowSpins) || 0)));
  const [start1K, setStart1K] = useState(String(initialStart1K || initialSession?.assumedStart1K || S?.border || ""));
  const [triggerLowSpins, setTriggerLowSpins] = useState(String(initialSession?.triggerLowSpins || ""));
  const [durationSpins, setDurationSpins] = useState(String(initialSession?.durationSpins || ""));
  const [expectedNetBalls, setExpectedNetBalls] = useState(initialSession?.expectedNetBalls == null ? "" : String(initialSession.expectedNetBalls));
  const [sourceUrl, setSourceUrl] = useState(initialSession?.sourceUrl || "");
  const [source, setSource] = useState(initialSession?.source || "manual");
  const [playMode, setPlayMode] = useState(S?.playMode || "cash");
  const [budgetYen, setBudgetYen] = useState("");
  const [helpOpen, setHelpOpen] = useState(true);
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);

  const applyMachine = (machine) => {
    setMachineName(machine.name);
    setSelectedMachine(machine);
    const session = createYutimeSessionFromMachine(machine, { assumedStart1K: machine.border1K || S?.border });
    setTriggerLowSpins(session ? String(session.triggerLowSpins) : "");
    setDurationSpins(session ? String(session.durationSpins || "") : "");
    setExpectedNetBalls(session?.expectedNetBalls == null ? "" : String(session.expectedNetBalls));
    setStart1K(String(session?.assumedStart1K || machine.border1K || S?.border || ""));
    setSourceUrl(session?.sourceUrl || "");
    setSource(session?.source || "manual");
    setMachinePickerOpen(false);
  };

  const applyUnregisteredMachine = (name) => {
    setMachineName(name);
    setSelectedMachine(null);
    setTriggerLowSpins("");
    setDurationSpins("");
    setExpectedNetBalls("");
    setSourceUrl("");
    setSource("manual");
    setMachinePickerOpen(false);
  };

  const machineSpec = selectedMachine ? deriveSpecForMachine(selectedMachine) : {
    spec1R: S?.spec1R,
    specAvgRounds: S?.specAvgRounds,
    specSapo: S?.specSapo,
  };
  const result = calculateYutimeEV({
    // 選択機種の確率が未登録なら、現在遊技中の別機種の確率を誤用しない。
    probabilityDenom: selectedMachine ? selectedMachine.synthProb : S?.synthDenom,
    triggerLowSpins: numberOrNull(triggerLowSpins),
    currentLowSpins: numberOrNull(currentLowSpins),
    start1K: numberOrNull(start1K),
    normalExpectedNetBalls: deriveNormalExpectedNetBalls(machineSpec),
    yutimeExpectedNetBalls: numberOrNull(expectedNetBalls),
    rentBalls: S?.rentBalls,
    exRate: S?.exRate,
    playMode,
    budgetYen: numberOrNull(budgetYen),
  });
  const currentSession = S?.activeYutimeSession || S?.yutimeSession;
  const isCurrentTarget = Boolean(
    currentSession?.targetingEnabled === true
    && (!currentSession.machineName || !machineName.trim() || currentSession.machineName === machineName.trim())
  );

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
      durationLabel: selectedMachine?.yutime?.durationLabel || "",
      benefit: selectedMachine?.yutime?.benefit || "",
      source: selectedMachine?.yutime ? source : "manual",
      targetingEnabled: true,
    });
    S?.setYutimeDecision?.(null);
    // 台選びから開始した場合も、保存後は回転入力の記録ページへ直接移動する。
    // 記録内で詳細データなどを開いていた場合に備え、サブタブも「記録」へ戻す。
    S?.setSessionSubTab?.("rot");
    onClose();
    S?.setTab?.("rot");
  };

  const stopTargeting = () => {
    if (!currentSession) return;
    S?.setYutimeSession?.({ ...currentSession, targetingEnabled: false });
    S?.setYutimeDecision?.(null);
    onClose();
  };

  const label = (text) => <div style={{ marginBottom: 5, fontSize: 10, fontWeight: 800, color: "var(--sm-sub-hi)" }}>{text}</div>;
  const hasVerifiedTrigger = Boolean(selectedMachine?.yutime?.triggerLowSpins);
  const hasVerifiedExpectedBalls = selectedMachine?.yutime?.expectedNetBalls != null;
  const auditStatus = selectedMachine?.yutimeAudit?.status;
  const machineStatus = !machineName.trim()
    ? { text: "機種を選択してください", color: "var(--sm-sub)" }
    : !selectedMachine
      ? { text: "未登録機種：手動入力", color: "var(--sm-yellow)" }
      : auditStatus === "not-equipped"
        ? { text: "遊タイム非搭載・確認済み", color: "var(--sm-sub)" }
        : auditStatus === "not-applicable"
          ? { text: "遊タイム対象外", color: "var(--sm-sub)" }
      : !hasVerifiedTrigger
        ? { text: "遊タイム情報：未確認", color: "var(--sm-yellow)" }
        : source === "manual"
          ? { text: "機種情報を手動修正", color: "var(--sm-yellow)" }
          : hasVerifiedExpectedBalls
            ? { text: "機種情報から自動入力済み", color: "var(--sm-green)" }
            : { text: "発動条件のみ自動入力・平均獲得玉は未確認", color: "var(--sm-yellow)" };

  if (machinePickerOpen) {
    return (
      <MachinePicker
        machines={machines}
        onBack={() => setMachinePickerOpen(false)}
        onSelect={applyMachine}
        onUseUnregistered={applyUnregisteredMachine}
      />
    );
  }

  return (
    <div className="yutime-sheet" role="dialog" aria-modal="true" aria-label="遊タイム期待値計算" style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden", overscrollBehavior: "none", background: "rgba(0,0,0,.72)", touchAction: "none" }}>
      <div style={{ width: "min(480px, 100%)", height: "min(780px, calc(100svh - 48px))", maxHeight: "calc(100% - 48px)", display: "flex", flexDirection: "column", contain: "layout paint", overflow: "hidden", borderRadius: "24px 24px 0 0", background: "var(--sm-bg)", border: "1px solid var(--sm-line-hi)", touchAction: "auto" }}>
        <div style={{ zIndex: 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", background: "var(--sm-bg)", borderBottom: "1px solid var(--sm-line)" }}>
          <div><div style={{ fontSize: 17, fontWeight: 900, color: "var(--sm-text)" }}>遊タイム期待値計算</div><div style={{ fontSize: 10, color: "var(--sm-sub)", marginTop: 3 }}>途中の通常当たりと到達率を含めます</div></div>
          <button type="button" aria-label="閉じる" onClick={onClose} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid var(--sm-line-hi)", background: "var(--sm-card)", color: "var(--sm-text)", fontSize: 20 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehaviorY: "contain", scrollbarGutter: "stable", WebkitOverflowScrolling: "touch", touchAction: "pan-y", padding: "14px 14px calc(18px + env(safe-area-inset-bottom))", display: "grid", alignContent: "start", gap: 12 }}>
          <section style={{ border: "1px solid color-mix(in srgb, var(--sm-cyan) 35%, var(--sm-line))", borderRadius: 14, background: "color-mix(in srgb, var(--sm-cyan) 7%, var(--sm-card))", overflow: "hidden" }}>
            <button type="button" onClick={() => setHelpOpen((open) => !open)} aria-expanded={helpOpen} style={{ width: "100%", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "none", background: "transparent", color: "var(--sm-text)", fontSize: 13, fontWeight: 900, textAlign: "left" }}>
              <span>はじめに：遊タイム計算の使い方</span><span aria-hidden="true" style={{ color: "var(--sm-cyan)" }}>{helpOpen ? "−" : "＋"}</span>
            </button>
            {helpOpen && (
              <div style={{ display: "grid", gap: 9, padding: "0 12px 12px", color: "var(--sm-sub-hi)", fontSize: 11, lineHeight: 1.6 }}>
                {[
                  ["1", "機種を選ぶ", "登録済み情報があれば、発動回転数などを自動入力します。"],
                  ["2", "現在カウントと回転率を確認", "データカウンターの低確率回転数と、想定1K回転率を入力します。"],
                  ["3", "計算結果を確認して開始", "開始後だけ、記録画面に遊タイムカードが表示されます。"],
                ].map(([number, title, description]) => (
                  <div key={number} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 8 }}>
                    <span style={{ width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 999, background: "var(--sm-cyan)", color: "var(--sm-on-cyan)", fontSize: 11, fontWeight: 900 }}>{number}</span>
                    <div><strong style={{ color: "var(--sm-text)" }}>{title}</strong><br />{description}</div>
                  </div>
                ))}
                <div style={{ padding: "9px 10px", borderRadius: 10, background: "var(--sm-card)", border: "1px solid var(--sm-line)" }}>未調査の機種は推測せず「未確認」と表示します。機種情報へ遊タイム条件を登録すると、次回から自動入力されます。</div>
              </div>
            )}
          </section>

          <div>
            {label("機種")}
            <button type="button" aria-label="遊タイム機種を選択" onClick={() => setMachinePickerOpen(true)} style={{ width: "100%", minHeight: 72, display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--sm-line-hi)", borderRadius: 13, background: "var(--sm-card)", color: "var(--sm-text)", textAlign: "left" }}>
              {selectedMachine ? <MachineIcon machine={selectedMachine} /> : <div style={{ width: 44, height: 44, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--sm-card-hi)", color: "var(--sm-cyan)", fontSize: 22, fontWeight: 700 }}>⌕</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", color: "var(--sm-text)", fontSize: 14, fontWeight: 900, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{machineName || "機種を選ぶ"}</div>
                {selectedMachine && <div style={{ marginTop: 2, overflow: "hidden", color: "var(--sm-sub)", fontSize: 10, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedMachine.maker || "メーカー未設定"}{selectedMachine.prob || selectedMachine.synthProb ? `  ${selectedMachine.prob || `1/${selectedMachine.synthProb}`}` : ""}</div>}
                <div style={{ marginTop: 4, color: machineStatus.color, fontSize: 10, fontWeight: 800 }}>{machineStatus.text}</div>
              </div>
              <span style={{ color: "var(--sm-cyan)", fontSize: 11, fontWeight: 800 }}>検索・変更</span>
            </button>
            {selectedMachine?.yutimeAudit?.status === "equipped" && (
              <div style={{ marginTop: 8, padding: "10px 11px", border: "1px solid color-mix(in srgb, var(--sm-cyan) 32%, var(--sm-line))", borderRadius: 11, background: "color-mix(in srgb, var(--sm-cyan) 7%, var(--sm-card))", color: "var(--sm-sub-hi)", fontSize: 10, lineHeight: 1.6 }}>
                <div><strong style={{ color: "var(--sm-text)" }}>正式型式：</strong>{selectedMachine.modelName || "未登録"}</div>
                <div><strong style={{ color: "var(--sm-text)" }}>発動条件：</strong>低確率{selectedMachine.yutime.triggerLowSpins}回転消化</div>
                <div><strong style={{ color: "var(--sm-text)" }}>恩恵：</strong>{selectedMachine.yutime.durationLabel || `時短${selectedMachine.yutime.durationSpins}回転`}{selectedMachine.yutime.benefit ? `（${selectedMachine.yutime.benefit}）` : ""}</div>
                <div><strong style={{ color: "var(--sm-text)" }}>確認日：</strong>{selectedMachine.yutime.verifiedAt || "未登録"}{selectedMachine.releaseStatus === "scheduled" ? "・導入予定機" : ""}</div>
                {selectedMachine.yutime.sourceUrl && <a href={selectedMachine.yutime.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--sm-cyan)", fontWeight: 800 }}>根拠ページを確認</a>}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>{label("現在の低確率カウント")}<input aria-label="現在カウント" type="number" min="0" inputMode="numeric" value={currentLowSpins} onChange={(e) => setCurrentLowSpins(e.target.value)} style={fieldStyle} /></div>
            <div>{label("想定1K回転率")}<input aria-label="1K回転率" type="number" min="0" step="0.1" inputMode="decimal" value={start1K} onChange={(e) => setStart1K(e.target.value)} style={fieldStyle} /></div>
          </div>
          <div>{label("遊技方法")}<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>{[["cash", "現金"], ["mochi", "持ち玉"], ["chodama", "貯玉"]].map(([id, text]) => <button key={id} type="button" onClick={() => setPlayMode(id)} style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${playMode === id ? "var(--sm-cyan)" : "var(--sm-line)"}`, background: playMode === id ? "color-mix(in srgb, var(--sm-cyan) 18%, var(--sm-card))" : "var(--sm-card)", color: "var(--sm-text)", fontWeight: 800 }}>{text}</button>)}</div></div>
          <div>{label("使える予算（任意）")}<input aria-label="使える予算" type="number" min="0" step="1000" inputMode="numeric" value={budgetYen} onChange={(e) => setBudgetYen(e.target.value)} placeholder="例：10000" style={fieldStyle} /><div style={{ marginTop: 5, fontSize: 9, color: "var(--sm-sub)" }}>入力すると、予算で回せる回転数と不足額を逆算します。</div></div>
          <div style={{ padding: 12, borderRadius: 13, border: "1px solid var(--sm-line)", background: "var(--sm-card-hi)" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "var(--sm-cyan)", marginBottom: 4 }}>遊タイム条件</div>
            <div style={{ marginBottom: 9, color: machineStatus.color, fontSize: 10, fontWeight: 800 }}>{machineStatus.text}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><div>{label("発動回転数")}<input aria-label="発動回転数" type="number" min="0" value={triggerLowSpins} onChange={(e) => { setTriggerLowSpins(e.target.value); setSource("manual"); }} style={fieldStyle} /></div><div>{label("遊タイム回数")}<input aria-label="遊タイム回数" type="number" min="0" value={durationSpins} onChange={(e) => { setDurationSpins(e.target.value); setSource("manual"); }} placeholder={selectedMachine?.yutime?.durationLabel || "回数"} style={fieldStyle} /></div></div>
            <div style={{ marginTop: 10 }}>{label("遊タイム突入後の平均獲得玉（スルー込み）")}<input aria-label="遊タイム突入後の平均獲得玉" type="number" min="0" value={expectedNetBalls} onChange={(e) => { setExpectedNetBalls(e.target.value); setSource("manual"); }} placeholder={hasVerifiedExpectedBalls ? "自動入力" : "機種情報の確認が必要"} style={fieldStyle} /></div>
            <div style={{ marginTop: 7, padding: "9px 10px", borderRadius: 10, background: "var(--sm-card)", border: "1px solid var(--sm-line)", color: "var(--sm-sub-hi)", fontSize: 10, lineHeight: 1.6 }}>
              <strong style={{ color: "var(--sm-text)" }}>平均大当たり出玉そのものではありません。</strong><br />遊タイム突入後に得られる玉数を、当たり・連チャン・遊タイムスルー・電サポ中の増減まで含めて平均した値です。
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "var(--sm-sub)", lineHeight: 1.5 }}>各項目は確認後に手動修正できます。{sourceUrl && <><br /><a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--sm-cyan)" }}>登録済みの根拠を確認</a></>}</div>
          </div>
          <Result result={result} mode={playMode} />
          <button type="button" onClick={saveForSession} style={{ minHeight: 48, border: "none", borderRadius: 13, background: "linear-gradient(180deg, var(--sm-cyan-hi), var(--sm-cyan))", color: "var(--sm-on-cyan)", fontSize: 14, fontWeight: 900 }}>この条件で遊タイム狙いを開始</button>
          {isCurrentTarget && (
            <button type="button" onClick={stopTargeting} style={{ minHeight: 44, borderRadius: 13, border: "1px solid var(--sm-line-hi)", background: "var(--sm-card)", color: "var(--sm-sub-hi)", fontSize: 12, fontWeight: 800 }}>遊タイム狙いを解除</button>
          )}
        </div>
      </div>
    </div>
  );
}
