// 差玉解析「マップで見る」：フルスクリーンUI
//
// 保存済みの差玉解析スキャン（pt_deltaScans・読み取りのみ）を、店舗のホールマップ（島）に
// 重ねて表示する。島カード内に台マス目を並べ、各マスに台番号＋ランクを色付きで表示する。
// 日付を切り替えられる。マスをタップで台の詳細（差玉・回転数）を表示する。
// logic.js・rotRows とは無関係の独立データ。保存構造は読み取りのみ（変更しない）。
//
// props: { store, islands, scans, onClose }

import React, { useMemo, useState } from "react";
import { C, f, sp, font, mono } from "../../constants";
import { Card } from "../Atoms";
import { getRankTone } from "./deltaEngine";
import { TopBar } from "./DeltaAnalyzer";
import {
  listScanDates,
  buildScanIndex,
  buildIslandOverlay,
  coverageOf,
} from "./deltaMapSelectors";

const TAP = 44; // 最小タップ領域

// "YYYY-MM-DD" → "M/D" 表示。形式外はそのまま返す。
function toSlash(date) {
  if (typeof date !== "string") return "";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  return `${Number(m[2])}/${Number(m[3])}`;
}

const scrollAreaStyle = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  padding: "4px 14px 8px",
};

// ── 凡例の定義（getRankTone とトーンを一致させる） ──
const LEGEND = [
  { key: "S", sample: "S", label: "爆発" },
  { key: "A", sample: "A", label: "好調" },
  { key: "B", sample: "B", label: "やや好調" },
  { key: "C", sample: "C", label: "普通" },
  { key: "D", sample: "D", label: "不調" },
  { key: "E", sample: "E", label: "不振" },
  { key: "F", sample: "F↓", label: "大負け" },
];

// ── 空状態カード ──
function EmptyCard({ text }) {
  return (
    <Card style={{ padding: "28px 18px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: C.subHi, lineHeight: 1.8, fontWeight: 600 }}>
        {text}
      </div>
    </Card>
  );
}

// ── 台マス（1台分） ──
function MapCell({ cell, selected, onSelect }) {
  const tone = cell.row ? getRankTone(cell.row.rank) : null;
  const hasData = !!cell.row;
  return (
    <button
      className="b"
      onClick={() => onSelect(cell)}
      aria-label={hasData ? `台${cell.num} ランク${cell.row.rank}` : `台${cell.num} データなし`}
      style={{
        minHeight: TAP + 8,
        borderRadius: 10,
        padding: "5px 2px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        background: hasData ? tone.bg : C.surfaceHi,
        border: selected
          ? `2px solid ${C.blue}`
          : hasData
            ? `1px solid color-mix(in srgb, ${tone.color} 45%, transparent)`
            : `1px solid ${C.border}`,
      }}
    >
      <span style={{
        fontSize: 14, fontWeight: 900, fontFamily: mono,
        color: hasData ? C.text : C.sub, lineHeight: 1,
      }}>
        {cell.short}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 800, lineHeight: 1,
        color: hasData ? tone.color : C.sub,
        fontFamily: hasData ? mono : font,
      }}>
        {hasData ? cell.row.rank : "—"}
      </span>
    </button>
  );
}

// ── 選択中セルの詳細パネル ──
function DetailPanel({ cell, machineName, onClose }) {
  const row = cell.row;
  const hasTai = row && row.normalSpins != null && row.totalStarts != null;
  const tone = row ? getRankTone(row.rank) : null;
  return (
    <div style={{
      marginTop: 10,
      background: C.surface,
      border: `1px solid ${row ? `color-mix(in srgb, ${tone.color} 40%, ${C.border})` : C.border}`,
      borderRadius: 14,
      padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>台{cell.num}</div>
          {row ? (
            <>
              <div style={{
                fontSize: 22, fontWeight: 900, fontFamily: mono, marginTop: 4,
                color: row.val >= 0 ? C.green : C.red,
              }}>
                差玉 {sp(row.val)}玉
              </div>
              <div style={{ fontSize: 13, color: C.subHi, fontWeight: 700, marginTop: 4 }}>
                ランク <span style={{ color: tone.color, fontFamily: mono, fontWeight: 900 }}>{row.rank}</span>
                {(row.machineName || machineName) && (
                  <span style={{ color: C.sub, marginLeft: 8, fontWeight: 600 }}>
                    {row.machineName || machineName}
                  </span>
                )}
              </div>
              {hasTai && (
                <div style={{ fontSize: 12, color: C.subHi, fontFamily: mono, marginTop: 6 }}>
                  回転数 {f(row.normalSpins)} / 当り {f(row.totalStarts)}回
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.sub, marginTop: 6, fontWeight: 600 }}>
              この台の解析データはありません
            </div>
          )}
        </div>
        <button
          className="b"
          onClick={onClose}
          aria-label="詳細を閉じる"
          style={{
            minWidth: TAP, minHeight: TAP, borderRadius: 10, flexShrink: 0,
            border: `1px solid ${C.border}`, background: C.surfaceHi,
            color: C.sub, fontSize: 18, fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── 島カード ──
function IslandCard({ island, scanIndex, selectedNum, onSelect, onCloseDetail, fallbackMachineName }) {
  const cells = useMemo(() => buildIslandOverlay(island, scanIndex), [island, scanIndex]);
  const selectedCell = useMemo(
    () => cells.find((c) => c.num === selectedNum) || null,
    [cells, selectedNum]
  );

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ padding: "14px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 12 }}>
          {island.name}{island.machineName ? ` ${island.machineName}` : ""}
        </div>
        {cells.length === 0 ? (
          <div style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
            台番号範囲が未設定です
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))",
            gap: 8,
          }}>
            {cells.map((cell) => (
              <MapCell
                key={cell.num}
                cell={cell}
                selected={selectedNum === cell.num}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
        {selectedCell && (
          <DetailPanel
            cell={selectedCell}
            machineName={island.machineName || fallbackMachineName || ""}
            onClose={onCloseDetail}
          />
        )}
      </div>
    </Card>
  );
}

// ── 凡例カード ──
function LegendCard() {
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ padding: "14px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 12 }}>
          ランクの見方
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 10,
        }}>
          {LEGEND.map((item) => {
            const tone = getRankTone(item.key);
            return (
              <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  minWidth: 30, height: 30, borderRadius: 8, padding: "0 4px",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: tone.bg,
                  border: `1px solid color-mix(in srgb, ${tone.color} 45%, transparent)`,
                  color: tone.color, fontSize: 13, fontWeight: 900, fontFamily: mono,
                }}>
                  {item.sample}
                </span>
                <span style={{ fontSize: 13, color: C.subHi, fontWeight: 700 }}>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ════════════ ルート ════════════
export default function DeltaMapView({ store, islands, scans, onClose }) {
  const storeId = store?.id ?? null;
  const islandList = useMemo(() => (Array.isArray(islands) ? islands : []), [islands]);
  const scanList = useMemo(() => (Array.isArray(scans) ? scans : []), [scans]);

  const dates = useMemo(() => listScanDates(scanList, storeId), [scanList, storeId]);
  const [activeDate, setActiveDate] = useState(() => dates[0] || null);
  // 日付一覧が変わって選択中が消えた場合は先頭にフォールバック。
  const currentDate = activeDate && dates.includes(activeDate) ? activeDate : (dates[0] || null);

  const [selectedNum, setSelectedNum] = useState(null);

  const scanIndex = useMemo(
    () => (currentDate ? buildScanIndex(scanList, storeId, currentDate) : new Map()),
    [scanList, storeId, currentDate]
  );

  const coverage = useMemo(() => coverageOf(islandList, scanIndex), [islandList, scanIndex]);

  // 表示中スキャンの代表機種名（詳細パネルのフォールバック表示用）。
  const machineName = useMemo(() => {
    for (const row of scanIndex.values()) {
      if (row && row.machineName) return row.machineName;
    }
    return "";
  }, [scanIndex]);

  const pickDate = (date) => {
    setActiveDate(date);
    setSelectedNum(null);
  };
  const selectCell = (cell) => {
    setSelectedNum((prev) => (prev === cell.num ? null : cell.num));
  };

  const noScans = dates.length === 0;
  const noIslands = islandList.length === 0;
  const showCoverage = !noScans && !noIslands;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C.bg, display: "flex", flexDirection: "column", color: C.text, fontFamily: font }}>
      <TopBar
        title="マップで見る"
        onBack={onClose}
        right={currentDate ? (
          <div style={{
            minHeight: TAP, display: "flex", alignItems: "center", padding: "0 14px",
            borderRadius: 12, border: `1px solid ${C.border}`, background: C.surfaceHi,
            color: C.subHi, fontSize: 14, fontWeight: 800, fontFamily: mono,
          }}>
            {toSlash(currentDate)}
          </div>
        ) : null}
      />
      <div style={scrollAreaStyle}>
        <div style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: 8, margin: "2px 2px 12px",
        }}>
          <div style={{ fontSize: 13, color: C.sub, fontWeight: 600, minWidth: 0 }}>
            保存した解析結果をホールマップに重ねて表示
          </div>
          {showCoverage && (
            <div style={{
              fontSize: 12, color: C.subHi, fontFamily: mono, fontWeight: 700,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
              データあり {coverage.hit}/{coverage.total}台
            </div>
          )}
        </div>

        {/* 日付切替（2件以上で操作可・1件は表示のみ） */}
        {dates.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {dates.map((date) => {
              const on = date === currentDate;
              const only = dates.length < 2;
              return (
                <button
                  key={date}
                  className="b"
                  onClick={only ? undefined : () => pickDate(date)}
                  disabled={only}
                  style={{
                    minHeight: TAP, padding: "0 16px", borderRadius: 12,
                    border: on ? "none" : `1px solid ${C.border}`,
                    background: on ? C.blue : C.surface,
                    color: on ? "#fff" : C.sub,
                    fontSize: 14, fontWeight: 800, fontFamily: mono,
                  }}
                >
                  {toSlash(date)}
                </button>
              );
            })}
          </div>
        )}

        {noScans ? (
          <EmptyCard text="保存した解析結果がありません。差玉解析を実行して保存するとここに表示されます" />
        ) : noIslands ? (
          <EmptyCard text="ホールマップが未登録です。台選びのマップ編集から島を登録してください" />
        ) : (
          <>
            {islandList.map((island) => (
              <IslandCard
                key={island.id}
                island={island}
                scanIndex={scanIndex}
                selectedNum={selectedNum}
                onSelect={selectCell}
                onCloseDetail={() => setSelectedNum(null)}
                fallbackMachineName={machineName}
              />
            ))}

            <LegendCard />

            <div style={{ fontSize: 12, color: C.sub, textAlign: "center", padding: "0 8px 8px", fontWeight: 600 }}>
              タップで台の詳細を表示（差玉・回転数）
            </div>
          </>
        )}
      </div>
    </div>
  );
}
