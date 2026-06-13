import React, { useMemo, useState } from "react";
import { C, f, sp, font, mono } from "../../constants";
import { Card } from "../Atoms";
import {
  getGoodMachineCandidates,
  normalizeMachineRows,
  summarizeIsland,
} from "./selectSelectors";
import { getStoreIslands, setStoreIslands } from "./hallMapSelectors";
import HallMapEditor from "./HallMapEditor";
import DeltaAnalyzer from "../delta/DeltaAnalyzer";
import DeltaMapView from "../delta/DeltaMapView";

const FILTERS = [
  { id: "all", label: "全台" },
  { id: "candidates", label: "良台候補" },
  { id: "playing", label: "実戦中のみ" },
];

const VERDICT_META = {
  strong:  { label: "本命", color: C.green },
  good:    { label: "候補", color: C.teal },
  watch:   { label: "様子見", color: C.yellow },
  avoid:   { label: "低優先", color: C.red },
  unknown: { label: "不足", color: C.sub },
};

function Header({ title, summary, updatedAt }) {
  return (
    <div style={{ flexShrink: 0, padding: "10px 14px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: font }}>
            台選び
          </div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title} ・ 島全体 {summary.total}台
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: C.sub }}>更新 {updatedAt}</div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 800, marginTop: 4 }}>
            候補 {summary.candidates}台
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterTabs({ active, onChange }) {
  return (
    <div style={{
      display: "flex", gap: 4,
      background: C.surfaceHi, borderRadius: 12, padding: 3,
      border: `1px solid ${C.border}`,
      margin: "0 14px 12px",
    }}>
      {FILTERS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            className="b"
            onClick={() => onChange(t.id)}
            style={{
              flex: 1,
              minHeight: 40,
              background: isActive ? C.surface : "transparent",
              border: "none",
              borderRadius: 9,
              color: isActive ? C.blue : C.sub,
              fontSize: 12,
              fontWeight: isActive ? 800 : 700,
              fontFamily: font,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function machineColor(machine) {
  const meta = VERDICT_META[machine.verdict] || VERDICT_META.unknown;
  const opacity = Math.max(0.18, Math.min(0.72, machine.confidence / 110));
  if (machine.verdict === "unknown") {
    return {
      bg: C.surfaceHi,
      border: C.border,
      color: C.sub,
    };
  }
  return {
    bg: `color-mix(in srgb, ${meta.color} ${Math.round(opacity * 100)}%, var(--surface))`,
    border: `color-mix(in srgb, ${meta.color} 58%, transparent)`,
    color: meta.color,
  };
}

function matchesFilter(machine, filter) {
  if (filter === "candidates") return machine.verdict === "strong" || machine.verdict === "good";
  if (filter === "playing") return machine.isPlaying;
  return true;
}

function groupByIsland(machines) {
  const groups = [[], [], []];
  machines.forEach((machine, index) => {
    groups[Math.min(2, Math.floor(index / 14))].push(machine);
  });
  return groups;
}

function HallMap({ machines, activeFilter, selectedId, onSelect }) {
  const groups = groupByIsland(machines);
  const hasMatch = machines.some((m) => matchesFilter(m, activeFilter));

  return (
    <Card style={{
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--blue) 8%, var(--surface)) 0%, var(--surface) 100%)",
      borderColor: "color-mix(in srgb, var(--blue) 24%, var(--border))",
    }}>
      <div style={{ padding: "12px 14px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 900, letterSpacing: 0.2 }}>
              ホールマップ
            </div>
            <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>
              P-EVIDENCE 連携データ
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.sub, flexShrink: 0 }}>
            色で強さを把握
          </div>
        </div>
        <Legend />
        {!hasMatch && (
          <div style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(248,113,113,0.10)",
            border: "1px solid rgba(248,113,113,0.24)",
            color: C.red,
            fontSize: 11,
            fontWeight: 700,
          }}>
            この条件に合う台はありません。全台表示で配置を確認できます。
          </div>
        )}
      </div>

      <div style={{
        position: "relative",
        margin: "0 12px 12px",
        minHeight: 330,
        borderRadius: 14,
        overflow: "hidden",
        background:
          "linear-gradient(90deg, color-mix(in srgb, var(--blue) 8%, transparent) 1px, transparent 1px), linear-gradient(0deg, color-mix(in srgb, var(--blue) 8%, transparent) 1px, transparent 1px), radial-gradient(circle at 50% 12%, color-mix(in srgb, var(--blue) 14%, transparent), transparent 36%), var(--surface-alt)",
        backgroundSize: "22px 22px, 22px 22px, auto, auto",
        border: "1px solid var(--border-hi)",
        boxShadow: "inset 0 0 28px rgba(0,0,0,0.55)",
      }}>
        <FloorLine top={14} left={16} width={94} />
        <FloorLine top={14} right={16} width={94} />
        <FloorLine bottom={14} left={28} width={72} />
        <FloorLine bottom={14} right={28} width={72} />
        <div style={{
          position: "absolute",
          inset: 12,
          border: "1px solid var(--border-hi)",
          borderRadius: 10,
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute",
          left: 17,
          top: 54,
          bottom: 50,
          width: 2,
          background: "linear-gradient(180deg, transparent, color-mix(in srgb, var(--blue) 38%, transparent), transparent)",
        }} />
        <div style={{
          position: "absolute",
          right: 17,
          top: 54,
          bottom: 50,
          width: 2,
          background: "linear-gradient(180deg, transparent, color-mix(in srgb, var(--blue) 38%, transparent), transparent)",
        }} />

        <div style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
          padding: "30px 14px 24px",
          minHeight: 330,
        }}>
          {groups.map((group, index) => (
            <Island
              key={index}
              label={`${index + 1}島`}
              machines={group}
              activeFilter={activeFilter}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function FloorLine({ top, bottom, left, right, width }) {
  return (
    <div style={{
      position: "absolute",
      top,
      bottom,
      left,
      right,
      width,
      height: 8,
      borderTop: "1px solid color-mix(in srgb, var(--blue) 35%, transparent)",
      borderBottom: "1px solid color-mix(in srgb, var(--blue) 22%, transparent)",
      opacity: 0.8,
    }} />
  );
}

function Island({ label, machines, activeFilter, selectedId, onSelect }) {
  return (
    <div style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: C.sub, fontWeight: 800, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 94,
        padding: "8px 7px",
        borderRadius: 11,
        background: "color-mix(in srgb, var(--surface-alt) 90%, transparent)",
        border: "1px solid color-mix(in srgb, var(--blue) 24%, var(--border-hi))",
        boxShadow: "0 10px 24px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(255,255,255,0.03)",
      }}>
        <div style={{
          position: "absolute",
          top: 9,
          bottom: 9,
          left: "50%",
          width: 2,
          transform: "translateX(-50%)",
          borderRadius: 2,
          background: "color-mix(in srgb, var(--blue) 22%, transparent)",
        }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {machines.map((machine) => (
            <MachineCabinet
              key={machine.id}
              machine={machine}
              activeFilter={activeFilter}
              selected={selectedId === machine.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MachineCabinet({ machine, activeFilter, selected, onSelect }) {
  const col = machineColor(machine);
  const visible = matchesFilter(machine, activeFilter);
  const meta = VERDICT_META[machine.verdict] || VERDICT_META.unknown;
  return (
    <button
      className="b"
      onClick={() => onSelect(machine.id)}
      aria-label={`${machine.machineNumber}番台 ${meta.label} 信頼度${machine.confidence}%`}
      style={{
        position: "relative",
        minHeight: 30,
        borderRadius: 6,
        border: selected ? `2px solid ${C.blue}` : `1px solid ${col.border}`,
        background: visible ? col.bg : "color-mix(in srgb, var(--surface-hi) 70%, transparent)",
        color: visible ? C.text : C.sub,
        opacity: visible ? 1 : 0.38,
        padding: "3px 2px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 900,
        fontFamily: mono,
        boxShadow: selected
          ? `0 0 0 2px color-mix(in srgb, ${C.blue} 26%, transparent), 0 0 16px color-mix(in srgb, ${col.color} 40%, transparent)`
          : "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {machine.machineNumber}
      {(machine.verdict === "strong" || selected) && (
        <span style={{
          position: "absolute",
          right: -5,
          top: -7,
          color: machine.verdict === "strong" ? "var(--yellow)" : C.blue,
          fontSize: 13,
          lineHeight: 1,
          textShadow: "0 0 8px rgba(0,0,0,0.75)",
        }}>
          ★
        </span>
      )}
    </button>
  );
}

function Legend() {
  const items = [
    ["本命", C.green],
    ["候補", C.teal],
    ["様子見", C.yellow],
    ["回収", C.red],
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      {items.map(([label, color]) => (
        <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.sub }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block", boxShadow: `0 0 8px ${color}` }} />
          {label}
        </div>
      ))}
    </div>
  );
}

function SelectedPanel({ machine, onStart }) {
  if (!machine) return null;
  const meta = VERDICT_META[machine.verdict] || VERDICT_META.unknown;
  return (
    <Card style={{ borderColor: `color-mix(in srgb, ${meta.color} 34%, var(--border))` }}>
      <div style={{ padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: mono, lineHeight: 1 }}>
              {machine.machineNumber}番台
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {machine.machineName}
            </div>
          </div>
          <div style={{
            flexShrink: 0,
            padding: "5px 10px",
            borderRadius: 999,
            color: meta.color,
            background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
            border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
            fontSize: 11,
            fontWeight: 900,
          }}>
            {meta.label}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
          <MiniMetric label="EV/K" value={sp(machine.evPerK)} unit="円" color={machine.evPerK >= 0 ? C.green : C.red} />
          <MiniMetric label="ボーダー差" value={sp(machine.borderDiff, 1)} unit="" color={machine.borderDiff >= 0 ? C.green : C.red} />
          <MiniMetric label="信頼度" value={f(machine.confidence)} unit="%" color={meta.color} />
        </div>

        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, marginBottom: 12 }}>
          根拠: {machine.lastSignal} / 試行 {f(machine.sampleRot)}回転
        </div>

        <button
          className="b"
          onClick={() => onStart(machine)}
          style={{
            width: "100%",
            minHeight: 52,
            borderRadius: 12,
            border: "none",
            background: C.blue,
            color: "#fff",
            fontSize: 15,
            fontWeight: 900,
            fontFamily: font,
          }}
        >
          この台で実戦開始
        </button>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value, unit, color }) {
  return (
    <div style={{
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "10px 8px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>{unit}</span>}
      </div>
    </div>
  );
}

function CandidateList({ rows, selectedId, onSelect }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <div style={{ padding: "12px 14px 4px" }}>
        <div style={{ fontSize: 12, color: C.sub, fontWeight: 800, letterSpacing: 0.4 }}>
          良台候補 TOP5
        </div>
      </div>
      {rows.map((m) => {
        const active = selectedId === m.id;
        const meta = VERDICT_META[m.verdict] || VERDICT_META.unknown;
        return (
          <button
            key={m.id}
            className="b"
            onClick={() => onSelect(m.id)}
            style={{
              width: "100%",
              minHeight: 58,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: "none",
              borderTop: `1px solid ${C.border}`,
              background: active ? "color-mix(in srgb, var(--blue) 10%, transparent)" : "transparent",
              color: C.text,
              textAlign: "left",
            }}
          >
            <div style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
              border: `1px solid color-mix(in srgb, ${meta.color} 38%, transparent)`,
              color: meta.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: mono,
              flexShrink: 0,
            }}>
              {m.rank}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                {m.machineNumber}番台
              </div>
              <div style={{ fontSize: 10, color: C.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.machineName}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: m.evPerK >= 0 ? C.green : C.red, fontFamily: mono }}>
                {sp(m.evPerK)}
                <span style={{ fontSize: 10, color: C.sub, marginLeft: 2, fontFamily: font }}>円/K</span>
              </div>
              <div style={{ fontSize: 10, color: meta.color, marginTop: 2, fontWeight: 800 }}>
                信頼度 {m.confidence}%
              </div>
            </div>
          </button>
        );
      })}
    </Card>
  );
}

function EmptyState() {
  return (
    <Card style={{ padding: "28px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 14, color: C.text, fontWeight: 800, marginBottom: 8 }}>
        台選びデータは未連携です
      </div>
      <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
        P-EVIDENCE 連携後に、ホールマップと良台候補をここへ表示します。
        <br />
        現在は未連携のため、台データを表示していません。
      </div>
    </Card>
  );
}

function DeltaEntryCard({ onOpen, onOpenMap }) {
  return (
    <Card>
      <div style={{ padding: "14px" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>
          差玉解析
        </div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>
          出玉グラフの画像から各台の差玉をランク判定
        </div>
        <button
          className="b"
          onClick={onOpen}
          style={{
            width: "100%",
            minHeight: 48,
            borderRadius: 12,
            border: "none",
            background: C.blue,
            color: "#fff",
            fontSize: 15,
            fontWeight: 900,
            fontFamily: font,
          }}
        >
          差玉解析を開く
        </button>
        <button
          className="b"
          onClick={onOpenMap}
          style={{
            width: "100%",
            minHeight: 48,
            borderRadius: 12,
            marginTop: 10,
            border: `1px solid ${C.borderHi}`,
            background: C.surfaceHi,
            color: C.text,
            fontSize: 14,
            fontWeight: 800,
            fontFamily: font,
          }}
        >
          保存した解析をマップで見る
        </button>
      </div>
    </Card>
  );
}

function timeLabel(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function SelectDashboard({ S, onStart }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [showDelta, setShowDelta] = useState(false);
  const [showDeltaMap, setShowDeltaMap] = useState(false);
  const [refreshTick] = useState(0);
  const updatedAt = useMemo(() => {
    void refreshTick;
    return timeLabel(new Date());
  }, [refreshTick]);
  const machines = useMemo(() => [], []);
  const normalized = useMemo(() => normalizeMachineRows(machines), [machines]);
  const summary = useMemo(() => summarizeIsland(normalized), [normalized]);
  const top = useMemo(() => getGoodMachineCandidates(normalized, 5), [normalized]);
  const [selectedId, setSelectedId] = useState(() => (summary.best?.id || normalized[0]?.id || null));
  const selected = normalized.find((m) => m.id === selectedId) || top[0] || normalized[0] || null;
  const title = selected?.machineName || S?.machineName || "島全体";

  // ユーザー編集式ホールマップ（島配置）。
  // 編集対象店舗: 選択中の店舗 → 無ければ登録済みの先頭店舗。
  // データは App.jsx の pt_hallMaps（hallMaps / setHallMaps）に一元保存する。
  const storesList = S?.stores;
  const selectedStoreId = S?.selectedStoreId;
  const hallMaps = S?.hallMaps;
  const setHallMaps = S?.setHallMaps;
  const activeStore = useMemo(() => {
    const list = Array.isArray(storesList) ? storesList : [];
    const sel = list.find((st) => st && typeof st === "object" && st.id === selectedStoreId);
    if (sel) return sel;
    return list.find((st) => st && typeof st === "object") || null;
  }, [storesList, selectedStoreId]);
  const storeId = activeStore?.id ?? null;
  const islands = useMemo(
    () => getStoreIslands(hallMaps, storeId),
    [hallMaps, storeId]
  );
  const handleChangeIslands = (nextIslands) => {
    if (storeId == null || typeof setHallMaps !== "function") return;
    setHallMaps((prev) => setStoreIslands(prev, storeId, nextIslands));
  };
  // マップ編集の対象店舗を切り替える（既存の selectedStoreId を更新するだけ）。
  const handleChangeStore = (nextStoreId) => {
    if (typeof S?.setSelectedStoreId !== "function") return;
    S.setSelectedStoreId(nextStoreId);
  };

  // 差玉解析スキャンの保存（pt_deltaScans へ追加。同一 id は置換）。
  // 読み取り（マップで見る）用に配列を解決する（配列でなければ空扱い）。
  const deltaScans = Array.isArray(S?.deltaScans) ? S.deltaScans : [];
  const setDeltaScans = S?.setDeltaScans;
  const handleSaveScan = (scan) => {
    if (typeof setDeltaScans !== "function") return;
    setDeltaScans((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const without = list.filter((s) => s && s.id !== scan.id);
      return [...without, scan];
    });
  };

  if (showDelta) {
    return (
      <DeltaAnalyzer
        store={activeStore}
        islands={islands}
        onClose={() => setShowDelta(false)}
        onSaveScan={handleSaveScan}
        aiApiKey={typeof S?.aiApiKey === "string" ? S.aiApiKey : ""}
        onChangeAiApiKey={S?.setAiApiKey}
      />
    );
  }

  if (showDeltaMap) {
    return (
      <DeltaMapView
        store={activeStore}
        islands={islands}
        scans={deltaScans}
        onClose={() => setShowDeltaMap(false)}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Header title={title} summary={summary} updatedAt={updatedAt} />
      <FilterTabs active={activeFilter} onChange={setActiveFilter} />

      <div style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "0 14px calc(20px + env(safe-area-inset-bottom))",
      }}>
        {normalized.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <HallMap machines={normalized} activeFilter={activeFilter} selectedId={selectedId} onSelect={setSelectedId} />
            <SelectedPanel machine={selected} onStart={onStart} />
            <CandidateList rows={top} selectedId={selectedId} onSelect={setSelectedId} />
          </>
        )}
        <HallMapEditor
          storeId={storeId}
          storeName={activeStore?.name || ""}
          stores={storesList}
          onChangeStore={handleChangeStore}
          islands={islands}
          onChangeIslands={handleChangeIslands}
        />
        <DeltaEntryCard onOpen={() => setShowDelta(true)} onOpenMap={() => setShowDeltaMap(true)} />
      </div>
    </div>
  );
}
