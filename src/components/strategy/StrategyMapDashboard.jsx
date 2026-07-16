import React, { useMemo, useState } from "react";
import { buildStrategyMap } from "./strategyMapData";
import "./StrategyMapDashboard.css";
import {
  P_EVIDENCE_DEMO_HALL_MAPS,
  P_EVIDENCE_DEMO_MACHINE,
  P_EVIDENCE_DEMO_SCANS,
} from "../evidence/pevidenceDemoData.js";
import YutimeCalculatorSheet from "../yutime/YutimeCalculatorSheet.jsx";

// 戦略マップ画面（見た目優先プロトタイプ）
//
// 目的: ホールに入った瞬間に「どこへ向かうべきか」を5秒以内に判断できる画面。
// 既存UIコンポーネント（Card / Atoms / Select系）は流用せず、本ファイル内で自己完結する。
// 表示データは保存済み差玉からアプリ内P-EVIDENCEエンジンで計算する。

// ---- 配色（index.css の .strategy-map トークン参照。ダーク値 = 従来のモック準拠固定値）----
// テーマ（ライト/ダーク）は CSS 変数側で切り替わるため、この参照は不変。
const P = {
  bg: "var(--sm-bg)",
  card: "var(--sm-card)",
  cardHi: "var(--sm-card-hi)",
  line: "var(--sm-line)",
  lineHi: "var(--sm-line-hi)",
  text: "var(--sm-text)",
  sub: "var(--sm-sub)",
  subHi: "var(--sm-sub-hi)",
  green: "var(--sm-green)",
  yellow: "var(--sm-yellow)",
  red: "var(--sm-red)",
  gray: "var(--sm-gray)",
  cyan: "var(--sm-cyan)",
};
const RADIUS = 24;
const FONT = "var(--font-main)";
const MONO = "var(--font-mono)";
const EMPTY_LIST = [];

const VERDICT = {
  strong: { color: P.green, label: "本命", reco: "着席推奨" },
  watch: { color: P.yellow, label: "様子見", reco: "様子見" },
  weak: { color: P.red, label: "回収", reco: "見送り" },
  nodata: { color: P.gray, label: "不足", reco: "データ不足" },
};

const TABS = [
  { id: "all", label: "全台" },
  { id: "candidates", label: "良台候補" },
];

function fmt(n, d = 0) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function signed(n, d = 0) {
  if (n == null || !isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + fmt(n, d);
}
function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ============================ ヘッダー ============================
function BackIcon() {
  // SVG 属性は var() を解決できないため、継承される CSS の stroke プロパティで指定する
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: P.text }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function Header({ data, updatedAt, onBack, onHelp }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "linear-gradient(180deg, var(--sm-bg) 78%, transparent)",
        padding: "12px 14px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="b"
          onClick={onBack}
          aria-label="戻る"
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 14,
            background: P.card,
            border: `1px solid ${P.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <BackIcon />
        </button>

        <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: P.text, fontFamily: FONT, letterSpacing: 0.3 }}>
            戦略マップ
          </div>
          <div style={{ fontSize: 11, color: P.subHi, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.machineName}
          </div>
          <div style={{ fontSize: 10, color: P.sub, marginTop: 1 }}>
            島全体 {data.total}台
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <button
            className="b"
            onClick={onHelp}
            aria-label="用語ヘルプを開く"
            style={{
              width: 38, height: 38, borderRadius: 12,
              border: `1px solid ${P.lineHi}`, background: P.card,
              color: P.cyan, fontSize: 18, fontWeight: 900, cursor: "pointer",
            }}
          >
            ?
          </button>
          <div style={{ textAlign: "right", minWidth: 56 }}>
            <div style={{ fontSize: 10, color: P.sub }}>更新 {updatedAt}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: P.cyan, marginTop: 3, fontFamily: MONO }}>
              候補 {data.kpi.candidates}台
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const HELP_GROUPS = [
  {
    title: "まず見る数字",
    terms: [
      { name: "予測回転率", simple: "1,000円で、だいたい何回まわりそうかの予想です。", read: "ボーダーより大きいほど有利です。ただし、差玉から計算した予想なので必ず同じ回数になるわけではありません。" },
      { name: "ボーダー", simple: "長く遊んだときに、プラスとマイナスの境目になる回転率です。", read: "予測回転率がボーダーを上回る台を探します。例：ボーダー18、予測20なら、1,000円で約2回多く回る予想です。" },
      { name: "信頼度・確信度", simple: "予想を、どれくらい信用してよいかの目安です。", read: "データが少ないと低く、投入玉や日数が増えると高くなります。高くても未来を保証する数字ではありません。" },
      { name: "良台スコア", simple: "回転率の良さと、データの確かさを1つにまとめた点数です。", read: "高いほど候補ですが、釘変化や明日締め確率が危険な場合は点数を下げます。" },
    ],
  },
  {
    title: "釘の変化を見つける仕組み",
    terms: [
      { name: "EMA（最近重視の平均）", simple: "昔よりも最近の結果を大事にする平均です。", read: "普通の平均は昔の数字も同じ重さですが、EMAは直近の変化へ早く気づけます。" },
      { name: "CUSUM（ズレの貯金）", simple: "小さな上がり下がりを毎日少しずつ貯める仕組みです。", read: "1日だけのブレでは反応しにくく、同じ方向のズレが続くと『開け・締め』を知らせます。" },
      { name: "SPC・釘変化", simple: "いつもの範囲を外れた変化が起きていないか見張ります。", read: "CUSUM、隣台、対面台を合わせて、締め変化・開け変化・ニュートラルを表示します。" },
      { name: "レジーム", simple: "台の『今の状態が始まった日』のことです。", read: "大きな変化を見つけたら、古い状態と新しい状態を分けます。新しい状態のデータを強く使うためです。" },
    ],
  },
  {
    title: "店と場所のクセ",
    terms: [
      { name: "曜日締め率", simple: "その店・機種が、明日と同じ曜日に悪くなった割合です。", read: "同じ曜日が3件未満なら参考不足です。30%なら、過去の約10回中3回で締め方向になったという意味です。" },
      { name: "島平均", simple: "同じ島にある台をまとめた平均回転率です。", read: "自分の台だけでなく、島全体が開いているか、1台だけ良く見えるのかを確認できます。" },
      { name: "隣接台の影響", simple: "近くの台が同じ方向へ動いているかを見ます。", read: "周りの60%以上が締め方向なら締め波及、開け方向なら開け波及として注意を出します。" },
      { name: "対面台の影響", simple: "向かい側の台と一緒に変化しているかを見ます。", read: "ホールマップで向かい合う2島を鏡向きに対応します。実際の配置と違う場合は参考にしないでください。" },
    ],
  },
  {
    title: "明日の予想",
    terms: [
      { name: "マルコフ・明日締め確率", simple: "今日の状態から、明日悪くなる割合を過去から調べた数字です。", read: "難しく言うと『良い→悪い』『悪い→悪い』の変わり方を数えています。60%以上は締め注意、データ不足時は安全側の初期値を使います。" },
      { name: "AIプロファイル", simple: "保存したデータから、曜日・店・機種・島のクセをまとめた表です。", read: "人のように考えるAIではなく、投入玉が多い記録を強くする統計です。少ないデータは控えめに表示します。" },
      { name: "明日の地図", simple: "各台を、据え置き・締め注意・開け波及・様子見に分けた予想です。", read: "回転率、マルコフ、隣、対面を合わせます。翌日の実際の釘を保証するものではありません。" },
    ],
  },
  {
    title: "お金と安全度",
    terms: [
      { name: "勝てる確率", simple: "予測した日当とブレから、プラスで終わる可能性を計算した目安です。", read: "標準偏差が大きい機種ほど、良い台でも短時間では勝率が低く出ます。" },
      { name: "玉単価差", simple: "ボーダー台より、1回転ごとに何円得か損かの差です。", read: "プラスなら有利、マイナスなら不利です。一般的な交換率の玉単価とは少し意味が違うため『差』と表示しています。" },
      { name: "時給・日当", simple: "同じ回転率が続いたときの、1時間・1日あたりの期待金額です。", read: "日当下限〜上限は、回転率の誤差を金額へ直した幅です。実際の勝ち負けの上限ではありません。" },
      { name: "標準偏差・1時間のブレ", simple: "結果が平均からどれくらい大きく揺れやすいかです。", read: "数字が大きい機種ほど、短い時間では運の影響が大きくなります。" },
      { name: "シャープ比", simple: "期待できる利益を、結果のブレで割った安全度です。", read: "同じ時給なら、ブレが小さい台のほうが高くなります。高い順に8時間の優先配分を作ります。" },
    ],
  },
];

function HelpSheet({ onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="P-EVIDENCE用語ヘルプ"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.72)", display: "flex", justifyContent: "center", alignItems: "flex-end" }}
    >
      <div style={{ width: "min(480px, 100%)", maxHeight: "92dvh", overflowY: "auto", background: P.bg, borderRadius: "24px 24px 0 0", border: `1px solid ${P.lineHi}`, boxShadow: "0 -18px 50px rgba(0,0,0,.45)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 16px", background: "rgba(5,10,20,.96)", borderBottom: `1px solid ${P.line}` }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: P.text }}>ことばの意味</div>
            <div style={{ marginTop: 3, fontSize: 10, color: P.subHi }}>むずかしい言葉を、かんたんに説明します</div>
          </div>
          <button
            className="b"
            onClick={onClose}
            aria-label="用語ヘルプを閉じる"
            style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${P.lineHi}`, background: P.card, color: P.text, fontSize: 20, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "4px 14px 28px" }}>
          {HELP_GROUPS.map((group) => (
            <div key={group.title} style={{ marginTop: 17 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: P.cyan, marginBottom: 8 }}>{group.title}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {group.terms.map((term) => (
                  <div key={term.name} style={{ padding: "12px 13px", borderRadius: 15, background: P.card, border: `1px solid ${P.line}` }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: P.text }}>{term.name}</div>
                    <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.65, color: P.subHi }}>{term.simple}</div>
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${P.line}`, fontSize: 10, lineHeight: 1.65, color: P.sub }}>{term.read}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 18, padding: 12, borderRadius: 14, background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.2)", fontSize: 10, lineHeight: 1.7, color: P.subHi }}>
            大切：どの数字も「未来の約束」ではありません。データが少ないときは信頼度を確認し、実際の回り方と合わせて判断してください。
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ タブ ============================
function Tabs({ active, onChange }) {
  return (
    <div style={{ padding: "0 14px" }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          height: 56,
          background: P.card,
          border: `1px solid ${P.line}`,
          borderRadius: 18,
          padding: 5,
        }}
      >
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              className="b"
              onClick={() => onChange(t.id)}
              aria-current={on ? "true" : undefined}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 14,
                background: on ? "linear-gradient(180deg, var(--sm-cyan-hi) 0%, var(--sm-cyan) 100%)" : "transparent",
                color: on ? "var(--sm-on-cyan)" : P.subHi,
                fontSize: 13,
                fontWeight: on ? 900 : 700,
                fontFamily: FONT,
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: on ? "0 4px 14px color-mix(in srgb, var(--sm-cyan) 35%, transparent)" : "none",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================ 本日のTOP5 ============================
function Top5({ rows, selectedId, onSelect }) {
  return (
    <Section title="本日の立ち回りプラン" accent={P.cyan} sub="上から順に確認">
      <div className="strategy-plan-list">
        {rows.map((m) => {
          const v = VERDICT[m.verdict];
          const on = selectedId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className="strategy-plan-row"
              style={{ borderColor: on ? P.cyan : P.line, boxShadow: on ? "0 0 0 2px rgba(6,182,212,.16)" : "none" }}
            >
              <span className="strategy-plan-rank" style={{ color: v.color, borderColor: v.color }}>{m.rank}</span>
              <span className="strategy-plan-verdict" style={{ color: v.color, borderColor: v.color }}>
                {m.isStar ? "★ " : ""}{v.label}
              </span>
              <span className="strategy-plan-machine">台{m.num}</span>
              <span className="strategy-plan-action">
                {m.rank === 1 ? "最優先で確認" : m.verdict === "strong" ? "空いていれば確認" : "状況を見て判断"}
              </span>
              <span className="strategy-plan-chevron" aria-hidden="true">›</span>
              <div className="strategy-plan-sub">
                予測 {fmt(m.rot, 1)}/k ・ {signed(m.evPerHour)}円/h ・ 信頼度 {m.confidence}%
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ============================ KPIサマリー ============================
function Kpi({ kpi }) {
  const items = [
    { label: "推定期待値", value: signed(kpi.evPerHour), unit: "円/h", color: kpi.evPerHour >= 0 ? P.green : P.red },
    { label: "予測回転率", value: fmt(kpi.rot, 1), unit: "/k", color: P.cyan },
    { label: "確信度", value: fmt(kpi.confidence), unit: "%", color: P.yellow },
    { label: "候補台数", value: fmt(kpi.candidates), unit: "台", color: P.green },
  ];
  return (
    <div className="strategy-kpi-grid">
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: P.card,
            border: `1px solid ${P.line}`,
            borderRadius: 16,
            padding: "11px 8px 12px",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 9, color: P.sub, fontWeight: 700, whiteSpace: "nowrap" }}>{it.label}</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: it.color,
              fontFamily: MONO,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: -0.8,
              marginTop: 7,
              whiteSpace: "nowrap",
            }}
          >
            {it.value}
          </div>
          <div style={{ fontSize: 8, color: P.sub, fontWeight: 700, marginTop: 1 }}>{it.unit}</div>
        </div>
      ))}
    </div>
  );
}

// ============================ ホールマップ ============================
function Legend() {
  // heatTone の閾値（diff>=1 緑 / 0〜1 黄 / 未満 赤）と文言を一致させる
  const items = [
    ["ボーダー+1以上", P.green],
    ["ボーダー0〜+1", P.yellow],
    ["ボーダー未満", P.red],
    ["データ不足", P.gray],
  ];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "0 14px 10px" }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: P.subHi }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: color, boxShadow: `0 0 6px ${color}` }} />
          {label}
        </span>
      ))}
    </div>
  );
}

const MAX_MAP_CELLS = 200;

function heatTone(machine) {
  if (!machine) return { color: P.gray, bg: "rgba(100,116,139,.16)", label: "未計測" };
  const diff = Number(machine.rot || 0) - Number(machine.border || 0);
  const color = diff >= 1 ? P.green : diff >= 0 ? P.yellow : P.red;
  return {
    color,
    bg: `color-mix(in srgb, ${color} ${Math.round(28 + Math.min(24, machine.confidence / 5))}%, ${P.card})`,
    label: VERDICT[machine.verdict]?.label || "未計測",
  };
}

function liveBadgeLabel(decision) {
  if (!decision) return "";
  if (decision.action === "collecting") return `${decision.nextCheckpointK || 3}K計測`;
  if (decision.action === "continue_strong") return "強く続行";
  if (decision.action === "continue") return "続行";
  if (decision.action === "stop_candidate") return "撤退候補";
  if (decision.action === "compare") return "他台比較";
  if (decision.action === "stop") return "撤退";
  return "記録中";
}

function HeatMachineCell({ number, machine, dim, selected, opposite, onSelect }) {
  const tone = heatTone(machine);
  const label = machine
    ? `${number}番台 予測回転率${machine.rot} 信頼度${machine.confidence}% ${tone.label}`
    : `${number}番台 未計測`;
  return (
    <button
      type="button"
      className="strategy-heat-cell"
      aria-label={label}
      disabled={!machine}
      onClick={() => machine && onSelect(machine.id)}
      style={{
        background: tone.bg,
        borderColor: selected ? P.cyan : `color-mix(in srgb, ${tone.color} 52%, transparent)`,
        boxShadow: selected
          ? `0 0 0 2px ${P.cyan}, 0 0 14px rgba(6,182,212,.38)`
          : opposite
            ? "0 0 0 2px #a78bfa, 0 0 12px rgba(167,139,250,.35)"
            : (machine?.isStar ? `0 0 12px ${tone.color}66` : "none"),
        opacity: dim ? .28 : 1,
      }}
    >
      {machine?.isStar && <span className="strategy-heat-star">★</span>}
      {opposite && <span className="strategy-opposite-mark">対</span>}
      <span className="strategy-heat-number">{number}</span>
      <span className="strategy-heat-rotation" style={{ color: machine ? "#fff" : P.subHi }}>
        {machine ? fmt(machine.rot, 1) : "—"}
      </span>
      <span className="strategy-heat-unit">{machine ? "回/k" : "未計測"}</span>
      {machine?.liveDecision && (
        <span className={`strategy-live-badge is-${machine.liveDecision.action}`}>
          {liveBadgeLabel(machine.liveDecision)}
        </span>
      )}
    </button>
  );
}

function pairIslands(islands) {
  const pairs = [];
  for (let index = 0; index < islands.length; index += 2) pairs.push(islands.slice(index, index + 2));
  return pairs;
}

function IslandOverview({ islands, activeIslandId, onChangeIsland }) {
  const pairs = pairIslands(islands);
  return (
    <div className="strategy-overview-wrap">
      <div className="strategy-overview-labels"><span>入口側</span><span>奥側</span></div>
      <div className="strategy-island-overview" aria-label="対面島ペアの一覧">
        {pairs.map((pair) => {
          const active = pair.some((island) => island.id === activeIslandId);
          const label = pair.map((island) => island.name).join("・");
          return (
            <button
              type="button"
              key={pair[0].id}
              className={`strategy-overview-island${active ? " is-active" : ""}`}
              onClick={() => onChangeIsland(pair[0].id)}
              aria-pressed={active}
              aria-label={`${label}の対面ペアを表示`}
            >
              <span>{label}</span>
              <small>{pair.length === 2 ? "対面表示" : "単独表示"}</small>
            </button>
          );
        })}
      </div>
      <div className="strategy-overview-aisle">中央通路</div>
    </div>
  );
}

function islandNumbers(island, reverse = false) {
  if (!island) return [];
  const start = Number(island.start) || Number(island.machines[0]?.num) || 0;
  const end = Number(island.end) || Number(island.machines[island.machines.length - 1]?.num) || start;
  const count = Math.max(0, Math.min(MAX_MAP_CELLS, end - start + 1));
  const numbers = Array.from({ length: count }, (_, index) => start + index);
  return reverse ? numbers.reverse() : numbers;
}

function PairIslandRow({ island, reverse, filter, selectedId, oppositeNumber, onSelect }) {
  if (!island) return null;
  const machineByNumber = new Map(island.machines.map((machine) => [String(machine.num), machine]));
  const numbers = islandNumbers(island, reverse);
  const isDim = (machine) => {
    if (!machine) return filter !== "all";
    if (filter === "candidates") return machine.verdict !== "strong";
    return false;
  };
  return (
    <div className="strategy-pair-row">
      <div className="strategy-pair-row-head">
        <div><strong>{island.name}</strong><span>{island.machineName || island.machines[0]?.machineName || "機種未設定"}</span></div>
        <div><b>{island.start}–{island.end}</b><span>{numbers.length}台</span></div>
      </div>
      <div className="strategy-pair-cells" aria-label={`${island.name}のヒートマップ`}>
        {numbers.map((number) => {
          const machine = machineByNumber.get(String(number));
          return (
            <HeatMachineCell
              key={number}
              number={number}
              machine={machine}
              dim={isDim(machine)}
              selected={machine?.id === selectedId}
              opposite={String(number) === String(oppositeNumber)}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

function OppositePairMap({ pair, filter, selectedId, selectedMachine, onSelect }) {
  if (!pair.length) return <div className="strategy-map-empty">島マップ管理で島を登録してください</div>;
  const top = pair[0];
  const bottom = pair[1] || null;
  const topCount = islandNumbers(top).length;
  const bottomCount = islandNumbers(bottom).length;
  const columns = Math.max(topCount, bottomCount, 1);
  const oppositeNumber = selectedMachine?.pevidence?.opposite?.oppositeNum;
  return (
    <div className="strategy-pair-map">
      <div className="strategy-pair-scroll">
        <div className="strategy-pair-canvas" style={{ "--pair-columns": columns, minWidth: columns * 58 - 4 }}>
          <PairIslandRow island={top} reverse={false} filter={filter} selectedId={selectedId} oppositeNumber={oppositeNumber} onSelect={onSelect} />
          <div className="strategy-opposite-aisle"><span>対面通路</span><i>↕ 同じ縦位置が対面</i></div>
          <PairIslandRow island={bottom} reverse filter={filter} selectedId={selectedId} oppositeNumber={oppositeNumber} onSelect={onSelect} />
        </div>
      </div>
      <div className="strategy-map-hint">← 横に動かすと2島が一緒に動きます →</div>
      {pair.some((island) => !island.registeredLayout) && <div className="strategy-layout-note">未登録の島は計測済み台から仮配置しています</div>}
    </div>
  );
}

function HallMap({ data, filter, selectedId, activeIslandId, onChangeIsland, onSelect }) {
  const pairs = pairIslands(data.islands);
  const activePair = pairs.find((pair) => pair.some((island) => island.id === activeIslandId)) || pairs[0] || [];
  const selectedMachine = data.all.find((machine) => machine.id === selectedId) || null;
  return (
    <Section title="対面ヒートマップ" accent={P.cyan} sub="上下で向かい合う台を比較">
      <Legend />
      <div style={{ padding: "0 12px 4px" }}>
        <div
          className="strategy-spatial-map"
        >
          <IslandOverview islands={data.islands} activeIslandId={activeIslandId} onChangeIsland={onChangeIsland} />
          <OppositePairMap pair={activePair} filter={filter} selectedId={selectedId} selectedMachine={selectedMachine} onSelect={onSelect} />
        </div>
      </div>
    </Section>
  );
}

// ============================ 選択台詳細 ============================
function Sparkline({ points, color }) {
  const w = 132;
  const h = 52;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (p - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${h - pad} L${coords[0][0].toFixed(1)} ${h - pad} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

function DetailMetric({ label, value, unit, color, big }) {
  return (
    <div style={{ background: P.bg, border: `1px solid ${P.line}`, borderRadius: 12, padding: "9px 9px 10px", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: P.sub, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 5 }}>
        <span style={{ fontSize: big ? 20 : 15, fontWeight: 900, color, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 9, color: P.sub, fontWeight: 700 }}>{unit}</span>}
      </div>
    </div>
  );
}

function RevenuePoint({ label, value, tone }) {
  return (
    <div className={`strategy-revenue-point is-${tone}`}>
      <span>{label}</span>
      <strong>{signed(value)}</strong>
      <small>円</small>
    </div>
  );
}

function RevenueOutlook({ machine }) {
  return (
    <div className="strategy-revenue-card">
      <div className="strategy-revenue-head">
        <div><strong>収益見込み</strong><span>回転率が予測の範囲で動いた場合</span></div>
        <span className="strategy-revenue-help" title="未来を保証する金額ではありません">予測値</span>
      </div>
      <div className="strategy-revenue-line">
        <div className="strategy-revenue-label"><strong>時給</strong><span>約1時間</span></div>
        <RevenuePoint label="下振れ" value={machine.hourlyLow} tone="low" />
        <RevenuePoint label="期待" value={machine.evPerHour} tone="expected" />
        <RevenuePoint label="上振れ" value={machine.hourlyHigh} tone="high" />
      </div>
      <div className="strategy-revenue-line">
        <div className="strategy-revenue-label"><strong>日当</strong><span>2,200回転</span></div>
        <RevenuePoint label="下振れ" value={machine.dailyLow} tone="low" />
        <RevenuePoint label="期待" value={machine.daily} tone="expected" />
        <RevenuePoint label="上振れ" value={machine.dailyHigh} tone="high" />
      </div>
      <div className="strategy-luck-risk">
        <div className="strategy-luck-title"><strong>運によるブレ</strong><span>大当たりが早い・遅いことで揺れる目安</span></div>
        <div><span>1時間</span><b>±{fmt(Math.abs(machine.hourlyRisk))}円</b></div>
        <div><span>1日</span><b>±{fmt(Math.abs(machine.dailyRisk))}円</b></div>
      </div>
    </div>
  );
}

function SelectedDetail({ machine, islandAvgRot }) {
  if (!machine) return null;
  const v = VERDICT[machine.verdict];
  const diff = Math.round((machine.rot - islandAvgRot(machine.islandId)) * 10) / 10;
  return (
    <Section title="選択台詳細" accent={v.color}>
      <div style={{ padding: "0 14px 4px" }}>
        <div style={{ background: P.card, border: `1px solid color-mix(in srgb, ${v.color} 30%, ${P.line})`, borderRadius: RADIUS, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: P.text, fontFamily: MONO }}>台{machine.num}</span>
              {machine.isStar && <span style={{ color: P.yellow, fontSize: 15, textShadow: `0 0 8px ${P.yellow}` }}>★</span>}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: v.color,
                background: `color-mix(in srgb, ${v.color} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${v.color} 38%, transparent)`,
                borderRadius: 999,
                padding: "5px 12px",
              }}
            >
              {v.reco}
            </span>
          </div>

          <RevenueOutlook machine={machine} />

          <div className="strategy-detail-main">
            <div className="strategy-detail-primary">
              <DetailMetric label="推定回転率" value={fmt(machine.rot, 1)} unit="/k" color={v.color} />
              <DetailMetric label="確信度" value={fmt(machine.confidence)} unit="%" color={P.yellow} />
              <DetailMetric label="島平均との差" value={signed(diff, 1)} unit="/k" color={diff >= 0 ? P.green : P.red} />
              <DetailMetric label="ボーダー" value={fmt(machine.border, 1)} unit="/k" color={P.subHi} />
            </div>
            <div className="strategy-detail-chart">
              <div style={{ fontSize: 9, color: P.sub, fontWeight: 700, marginBottom: 4 }}>過去推定回転率 ・7日</div>
              <div style={{ background: P.bg, border: `1px solid ${P.line}`, borderRadius: 12, padding: "6px 0" }}>
                <Sparkline points={machine.history} color={v.color} />
              </div>
            </div>
          </div>

          <div className="strategy-detail-secondary">
            <DetailMetric label="EMA（最近重視）" value={fmt(machine.ema, 1)} unit="/k" color={P.cyan} />
            <DetailMetric label="明日締め確率" value={fmt(machine.tomorrowTight)} unit="%" color={machine.tomorrowTight >= 60 ? P.red : P.yellow} />
            <DetailMetric label="勝てる確率" value={fmt(machine.winRate)} unit="%" color={machine.winRate >= 50 ? P.green : P.red} />
            <DetailMetric label="玉単価差" value={signed(machine.unitPrice, 2)} unit="円/回" color={machine.unitPrice >= 0 ? P.green : P.red} />
            <DetailMetric label="シャープ比" value={fmt(machine.sharpe, 2)} unit="" color={P.subHi} />
          </div>

          <div style={{ marginTop: 9, padding: "10px 11px", borderRadius: 12, background: P.bg, border: `1px solid ${P.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: machine.nailAlert.includes("締め") ? P.red : machine.nailAlert.includes("開け") ? P.green : P.yellow }}>
              釘変化：{machine.nailAlert}
            </div>
            <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.6, color: P.subHi }}>
              明日の地図：{machine.nextPrediction} ／ {machine.spatialAlert} ／ {machine.oppositeAlert}
            </div>
            {machine.regimeStart && <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.6, color: P.sub }}>今の状態は{machine.regimeStart}から</div>}
          </div>
        </div>
      </div>
    </Section>
  );
}

function LearningSummary({ data, selected }) {
  if (!data.analytics || !selected) return null;
  const overall = data.aiProfile?.overall || {};
  const island = data.islandStats?.find((item) => item.island === data.islands.find((x) => x.id === selected.islandId)?.name);
  return (
    <Section title="店のクセと変化検知" accent={P.yellow} sub="保存した差玉だけで学習">
      <div style={{ padding: "0 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ padding: 12, borderRadius: 16, background: P.card, border: `1px solid ${P.line}` }}>
          <div style={{ fontSize: 9, color: P.sub }}>AIプロファイル（全体）</div>
          <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, color: P.cyan, fontFamily: MONO }}>{fmt(overall.rate, 1)}<span style={{ fontSize: 9, color: P.sub }}>/k</span></div>
          <div style={{ marginTop: 4, fontSize: 9, color: P.subHi }}>{fmt(overall.count)}件を玉数で重み付け</div>
        </div>
        <div style={{ padding: 12, borderRadius: 16, background: P.card, border: `1px solid ${P.line}` }}>
          <div style={{ fontSize: 9, color: P.sub }}>明日の曜日の締め率</div>
          <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, color: selected.weekdayTight >= 30 ? P.red : P.yellow, fontFamily: MONO }}>{fmt(selected.weekdayTight)}<span style={{ fontSize: 9, color: P.sub }}>%</span></div>
          <div style={{ marginTop: 4, fontSize: 9, color: P.subHi }}>明日と同じ曜日 {fmt(selected.weekdaySamples)}件</div>
        </div>
        <div style={{ padding: 12, borderRadius: 16, background: P.card, border: `1px solid ${P.line}`, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 10, color: P.sub }}>島平均</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: P.text, fontFamily: MONO }}>{island ? `${fmt(island.averageRotation, 1)}/k（${island.activeMachines}台）` : "データ不足"}</span>
          </div>
          <div style={{ marginTop: 7, fontSize: 9, lineHeight: 1.6, color: P.sub }}>
            CUSUM（小さなズレの貯金） 開け {fmt(selected.cusumUp, 1)} ／ 締め {fmt(selected.cusumDown, 1)}。対面はホールマップで向かい合う同じ台数の島を自動対応します。
          </div>
        </div>
      </div>
    </Section>
  );
}

function PortfolioPlan({ portfolio }) {
  const rows = portfolio?.plan || [];
  if (!rows.length) return null;
  return (
    <Section title="8時間の優先順位" accent={P.green} sub="利益÷ブレで配分">
      <div style={{ padding: "0 14px", display: "grid", gap: 7 }}>
        {rows.slice(0, 5).map((row) => (
          <div key={`${row.machineName}-${row.number}`} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: 9, padding: "10px 11px", borderRadius: 14, background: P.card, border: `1px solid ${P.line}` }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(34,197,94,.13)", color: P.green, fontSize: 12, fontWeight: 900 }}>{row.rank}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: P.text }}>台{row.number} <span style={{ fontSize: 9, color: P.subHi }}>{row.action}</span></div>
              <div style={{ marginTop: 3, fontSize: 9, color: P.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.machineName}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: P.green, fontFamily: MONO }}>{fmt(row.hours, 1)}時間</div>
              <div style={{ marginTop: 2, fontSize: 9, color: P.sub }}>{signed(row.expectedProfit)}円</div>
            </div>
          </div>
        ))}
        <div style={{ padding: "7px 2px 0", fontSize: 10, color: P.subHi, textAlign: "right" }}>
          合計 {fmt(portfolio.totalHours, 1)}時間 ／ 期待 {signed(portfolio.expectedProfit)}円
        </div>
      </div>
    </Section>
  );
}

// ============================ 共通セクション枠 ============================
function Section({ title, sub, accent, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 14px 8px" }}>
        <span style={{ width: 4, height: 14, borderRadius: 2, background: accent, alignSelf: "center" }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: P.text, letterSpacing: 0.4 }}>{title}</span>
        {sub && <span style={{ fontSize: 10, color: P.sub, marginLeft: "auto" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

// ============================ 本体 ============================
export default function StrategyMapDashboard({ S, onBack }) {
  const playingNum = S?.sessionStarted ? S?.machineNum : null;
  const isDemo = import.meta.env.DEV && new URLSearchParams(window.location.search).get("pevidenceDemo") === "1";
  const savedScans = Array.isArray(S?.deltaScans) ? S.deltaScans : EMPTY_LIST;
  const savedCustomMachines = Array.isArray(S?.customMachines) ? S.customMachines : EMPTY_LIST;
  const deltaScans = useMemo(() => isDemo ? P_EVIDENCE_DEMO_SCANS : savedScans, [isDemo, savedScans]);
  const customMachines = useMemo(
    () => isDemo ? [P_EVIDENCE_DEMO_MACHINE, ...savedCustomMachines] : savedCustomMachines,
    [isDemo, savedCustomMachines],
  );
  const data = useMemo(() => buildStrategyMap({
    playingNum,
    liveDecision: S?.ev?.liveDecision || null,
    scans: deltaScans,
    customMachines,
    hallMaps: isDemo ? P_EVIDENCE_DEMO_HALL_MAPS : S?.hallMaps,
    selectedStoreId: isDemo ? "pe-demo-store" : S?.selectedStoreId,
  }), [playingNum, deltaScans, customMachines, isDemo, S?.hallMaps, S?.selectedStoreId, S?.ev?.liveDecision]);
  const updatedAt = useMemo(() => nowHM(), []);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(data.leadId);
  const [activeIslandId, setActiveIslandId] = useState(() =>
    data.all.find((machine) => machine.id === data.leadId)?.islandId || data.islands[0]?.id || null
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [yutimeOpen, setYutimeOpen] = useState(false);

  const selected = data.all.find((m) => m.id === selectedId) || null;
  const effectiveActiveIslandId = data.islands.some((island) => island.id === activeIslandId)
    ? activeIslandId
    : data.islands[0]?.id || null;

  const selectMachine = (machineId) => {
    setSelectedId(machineId);
    const machine = data.all.find((item) => item.id === machineId);
    if (machine?.islandId) setActiveIslandId(machine.islandId);
  };

  const changeIsland = (islandId) => {
    setActiveIslandId(islandId);
    const index = data.islands.findIndex((item) => item.id === islandId);
    const pairStart = index < 0 ? 0 : Math.floor(index / 2) * 2;
    const machines = data.islands.slice(pairStart, pairStart + 2).flatMap((island) => island.machines);
    const lead = [...machines].sort((a, b) => b.score - a.score)[0] || null;
    setSelectedId(lead?.id || null);
  };

  return (
    <div className="strategy-map" style={{ flex: 1, background: P.bg, color: P.text, fontFamily: FONT, paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
      <Header data={data} updatedAt={updatedAt} onBack={onBack} onHelp={() => setHelpOpen(true)} />
      <div style={{ padding: "4px 14px 0" }}>
        <button
          type="button"
          onClick={() => setYutimeOpen(true)}
          style={{
            width: "100%", minHeight: 48, borderRadius: 14,
            border: "1px solid color-mix(in srgb, var(--sm-cyan) 55%, transparent)",
            background: "color-mix(in srgb, var(--sm-cyan) 12%, var(--sm-card))",
            color: P.text, fontSize: 14, fontWeight: 900, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span aria-hidden="true" style={{ color: P.cyan }}>◎</span>
          遊タイム計算
        </button>
      </div>
      {data.total === 0 && (
        <div style={{ margin: "18px 14px 0", padding: "20px 16px", borderRadius: 18, background: P.card, border: `1px solid ${P.line}`, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: P.text }}>差玉データがありません</div>
          <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.7, color: P.subHi }}>
            ホームの「差玉解析」で、差玉・通常回転数・大当り回数を保存すると予測を表示します
          </div>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <Kpi kpi={data.kpi} />
      </div>
      <div style={{ marginTop: 14 }}>
        <Tabs active={filter} onChange={setFilter} />
      </div>
      <HallMap
        data={data}
        filter={filter}
        selectedId={selectedId}
        activeIslandId={effectiveActiveIslandId}
        onChangeIsland={changeIsland}
        onSelect={selectMachine}
      />
      <SelectedDetail machine={selected} islandAvgRot={data.islandAvgRot} />
      <Top5 rows={data.top5} selectedId={selectedId} onSelect={selectMachine} />
      <LearningSummary data={data} selected={selected} />
      <PortfolioPlan portfolio={data.portfolio} />
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
      {yutimeOpen && (
        <YutimeCalculatorSheet
          S={S}
          initialMachineName={selected?.machineName || ""}
          onClose={() => setYutimeOpen(false)}
        />
      )}
    </div>
  );
}
