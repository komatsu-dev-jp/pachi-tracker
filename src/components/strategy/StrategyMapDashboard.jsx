import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  applyStrategyPlanEntryContext,
  buildStrategyMap,
  buildStrategyPlanContext,
  pairStrategyIslands,
  resolveStrategyPlanHandoff,
} from "./strategyMapData";
import { localDateStr } from "../../constants";
import { estimateStrategyNonCashRatio } from "../../economics";
import "./StrategyMapDashboard.css";
import {
  P_EVIDENCE_DEMO_HALL_MAPS,
  P_EVIDENCE_DEMO_MACHINE,
  P_EVIDENCE_DEMO_SCANS,
} from "../evidence/pevidenceDemoData.js";
import YutimeCalculatorSheet from "../yutime/YutimeCalculatorSheet.jsx";
import {
  buildWeeklyBacktestTrend,
} from "../evidence/pevidenceBacktest.js";
import { applyCalibrationCandidate } from "../evidence/pevidenceCalibration.js";
import {
  buildIslandActivityCalendar,
  listIslandActivityMonths,
} from "../evidence/islandActivityCalendar.js";
import {
  DECISION_TERMS,
  decisionLabel,
  decisionMeta,
} from "../decision/decisionVocabulary.js";
import {
  findDeltaScanDateTargets,
  updateDeltaScanDate,
} from "../delta/deltaScanDate.js";

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
  strong: { color: P.green, label: decisionLabel("strong"), reco: decisionMeta("strong").candidateAction },
  watch: { color: P.yellow, label: decisionLabel("watch"), reco: decisionMeta("watch").candidateAction },
  weak: { color: P.red, label: decisionLabel("weak"), reco: decisionMeta("weak").candidateAction },
  nodata: { color: P.gray, label: decisionLabel("nodata"), reco: decisionMeta("nodata").candidateAction },
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

function isFiniteValue(value) {
  return value != null && Number.isFinite(Number(value));
}

function nonCashSourceLabel(source) {
  if (source === "exact-machine-table") return "同じ台の実戦履歴";
  if (source === "store") return "店舗の実戦履歴";
  return "履歴なし（現金のみ）";
}

function tightEvidenceText(evidence) {
  if (!evidence || evidence.status === "unavailable") {
    return evidence?.label || "有効データ不足のため算定待ち";
  }
  const transition = `${evidence.transitionLabel || "状態遷移"} ${fmt(evidence.successes)}/${fmt(evidence.total)}件`;
  const basis = evidence.status === "observed"
    ? "実績を使用"
    : `履歴不足（最低${fmt(evidence.minRequired)}件）のため事前値を使用`;
  const extras = [];
  if (evidence.weekday?.total > 0) {
    extras.push(`同曜日 ${fmt(evidence.weekday.successes)}/${fmt(evidence.weekday.total)}件${evidence.weekday.applied ? "を反映" : ""}`);
  }
  if (evidence.openShock?.detected) {
    extras.push(
      evidence.openShock.total > 0
        ? `急に開いた翌日 ${fmt(evidence.openShock.successes)}/${fmt(evidence.openShock.total)}件${evidence.openShock.applied ? "を反映" : ""}`
        : "急に開いた状態（条件別実績を収集中）",
    );
  }
  if (evidence.event?.total > 0) {
    extras.push(`イベント翌日 ${fmt(evidence.event.successes)}/${fmt(evidence.event.total)}件${evidence.event.applied ? "を反映" : ""}`);
  }
  return [transition, basis, ...extras].join(" ／ ");
}

function CashLimitGuide({ guide }) {
  if (!guide || guide.status === "unset") return null;
  const stopped = guide.shouldStop;
  const statusText = guide.status === "over_limit"
    ? `上限を${fmt(guide.overBy)}円超過`
    : guide.status === "limit_reached"
      ? "現金上限に到達"
      : `現金残り ${fmt(guide.remainingCash)}円`;
  const projection = guide.calculationStatus === "ready" && guide.remainingSpins != null
    ? `約${fmt(guide.remainingSpins)}回・${fmt(guide.remainingHours, 1)}時間`
    : "回転数の実測後に残り回転を算定";
  return (
    <div style={{
      margin: "9px 0",
      padding: "10px 11px",
      borderRadius: 12,
      background: stopped
        ? "color-mix(in srgb, var(--sm-red) 8%, var(--sm-bg))"
        : "color-mix(in srgb, var(--sm-yellow) 7%, var(--sm-bg))",
      border: `1px solid color-mix(in srgb, ${stopped ? P.red : P.yellow} 38%, ${P.line})`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: stopped ? P.red : P.yellow }}>
        現金上限ガイド：{statusText}
      </div>
      <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.55, color: P.subHi }}>
        {stopped
          ? "現金追加は停止目安です。"
          : `現金遊技なら残り ${projection}。`}
        {!guide.usesCashNow && " 現在は持ち玉・貯玉遊技のため、現金残額は減りません。"}
      </div>
    </div>
  );
}
function compactDate(value, includeYear = false) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return includeYear
    ? `${Number(match[1])}/${Number(match[2])}/${Number(match[3])}`
    : `${Number(match[2])}/${Number(match[3])}`;
}

function coveragePeriod(coverage) {
  const from = String(coverage?.fromDate || "");
  const to = String(coverage?.toDate || "");
  if (!from || !to) return "";
  if (from === to) return compactDate(from);
  const crossesYear = from.slice(0, 4) !== to.slice(0, 4);
  return `${compactDate(from, crossesYear)}〜${compactDate(to, crossesYear)}`;
}

function nextDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return localDateStr(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
}

const PROFIT_CHANCE_PENDING = {
  "model-unverified": "正式型式の確認待ち",
  "stddev-unverified": "ブレ幅の確認待ち",
  "plan-missing": "予定時間の設定待ち",
  "plan-limit-exceeded": "現金上限との調整待ち",
  "rotation-range-missing": "予測回転率の幅待ち",
  "rotation-range-too-wide": "予測幅の安定待ち",
  "low-confidence": "店舗データ不足",
  "data-missing": "店舗データ待ち",
  "stale-scan": "前日または本日の解析待ち",
};

function profitChanceText(machine) {
  if (machine?.profitChanceStatus === "ready" && machine.profitChanceLow != null && machine.profitChanceHigh != null) {
    return `${fmt(machine.profitChanceLow)}〜${fmt(machine.profitChanceHigh)}%`;
  }
  return PROFIT_CHANCE_PENDING[machine?.profitChanceStatus] || "算定待ち";
}

function profitChanceCenterText(machine) {
  return machine?.profitChanceStatus === "ready" && machine.winRate != null
    ? `基準予測${fmt(machine.winRate)}%`
    : null;
}

function payoutSummary(machine) {
  if (machine?.initialAvgPayout != null) return { label: "初回平均", value: `${fmt(machine.initialAvgPayout)}玉` };
  if (machine?.avgPayoutPerHit != null) return { label: "1回平均", value: `${fmt(machine.avgPayoutPerHit)}玉` };
  return { label: "平均出玉", value: "確認待ち" };
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

function Header({ data, onBack, onHelp }) {
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
            <div style={{ fontSize: 10, color: P.sub }}>
              {data.freshness?.sourceDate ? `解析 ${data.freshness.sourceDate}` : "解析日なし"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, color: P.cyan, marginTop: 3, fontFamily: MONO }}>
              候補 {data.kpi.candidates}台
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanHandoffBanner({ plan, match, storeName, hasData }) {
  if (!plan?.targets?.length) return null;
  const [, month, day] = String(plan.dateKey || "").split("-");
  const period = plan.source === "daily" && month && day
    ? `${Number(month)}/${Number(day)}の日次プラン`
    : `${Number(String(plan.monthKey || "").split("-")[1]) || "今"}月の月間プラン`;
  const backupNames = plan.backups.map((target) => target.name).filter(Boolean);
  const needsReview = !plan.canPrioritize;
  const minimumEv = Math.max(0, Number(plan.minExpectedValuePerHour) || 0);
  const matchText = needsReview
    ? "店舗や条件の変更後に候補の再確認が必要なため、戦略順位にはまだ反映していません"
    : !hasData
    ? "予定店舗の差玉データは未取得です"
    : match?.matched < match?.total
      ? `期待値${minimumEv.toLocaleString("ja-JP")}円/h以上を満たす候補は${match.matched}/${match.total}機種です`
      : `候補は期待値${minimumEv.toLocaleString("ja-JP")}円/h以上を満たしています`;

  return (
    <section
      aria-label="稼働プランの引き継ぎ"
      style={{
        margin: "4px 14px 0",
        padding: "12px 14px",
        borderRadius: 16,
        border: "1px solid color-mix(in srgb, var(--sm-cyan) 48%, var(--sm-line))",
        background: "linear-gradient(135deg, color-mix(in srgb, var(--sm-cyan) 14%, var(--sm-card)), var(--sm-card))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: P.cyan, fontSize: 11, fontWeight: 900 }}>{period}を反映</span>
        {storeName && <span style={{ marginLeft: "auto", color: P.subHi, fontSize: 10 }}>{storeName}</span>}
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        {plan.primary && <strong style={{ color: P.text, fontSize: 14 }}>第一候補 {plan.primary.name}</strong>}
        {backupNames.length > 0 && <span style={{ color: P.subHi, fontSize: 11 }}>予備 {backupNames.join("・")}</span>}
      </div>
      {(plan.requiredSessionEv != null || plan.requiredUnitPrice != null) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
          {plan.requiredSessionEv != null && <span style={{ padding: "4px 7px", borderRadius: 999, color: P.green, background: "color-mix(in srgb, var(--sm-green) 12%, transparent)", fontSize: 10, fontWeight: 800 }}>次回必要 {signed(plan.requiredSessionEv)}円</span>}
          {plan.requiredUnitPrice != null && <span style={{ padding: "4px 7px", borderRadius: 999, color: P.cyan, background: "color-mix(in srgb, var(--sm-cyan) 12%, transparent)", fontSize: 10, fontWeight: 800 }}>必要玉単価差 {signed(plan.requiredUnitPrice, 2)}円/回</span>}
        </div>
      )}
      <div style={{ marginTop: 6, color: P.sub, fontSize: 10, lineHeight: 1.5 }}>
        {matchText}。{needsReview ? "ホームの月間プランで第一候補・予備を選び直してください。" : "判定が弱ければ予備、すべて弱ければ見送ります。"}
      </div>
    </section>
  );
}

const HELP_GROUPS = [
  {
    title: "まず見る数字",
    terms: [
      { name: "予測回転率", simple: "1,000円で、だいたい何回まわりそうかの予想です。", read: "ボーダーより大きいほど有利です。ただし、差玉から計算した予想なので必ず同じ回数になるわけではありません。" },
      { name: "ボーダー", simple: "長く遊んだときに、プラスとマイナスの境目になる回転率です。", read: "予測回転率がボーダーを上回る台を探します。例：ボーダー18、予測20なら、1,000円で約2回多く回る予想です。" },
      { name: `翌日${DECISION_TERMS.confidence}`, simple: "明日も予想どおりになりそうかの目安です。", read: "データ量だけでなく、一晩で釘が変わる日次変動も差し引きます。玉数を増やしても100%には近づきません。" },
      { name: "判断用下限（80%目標）", simple: "予測が下振れした場合を見込んだ、着席判断用の回転率です。", read: "同じ予測を100回したとき、実際の回転率がこの下限以上になる回数を約80回に合わせます。翌日実績が100件未満は統計の標準値を使い、100件から過去実績で校正します。" },
      { name: "座る基準超え確率", simple: "翌日の回転率が、実質ボーダー＋0.5回を超える見込みです。", read: "平均予測と翌日の予測幅から計算します。50%だけでは候補にせず、判断用下限まで基準を超えた台を候補にします。" },
      { name: "良台スコア", simple: "回転率の良さと、データの確かさを1つにまとめた点数です。", read: "表示の強さを表す補助指標です。実際の候補判定と順位は、判断用下限と座る基準の差を優先します。" },
      { name: "収支プラス見込み", simple: "予定時間の終了時に、収支が0円を超える確率の概算幅です。", read: "本日の予定時間、予測回転率の上下幅、交換率、検証済みの機種ブレから正規近似で計算します。勝利を保証せず、短時間や荒い機種ほど誤差が大きくなります。" },
      { name: "勝てる確率（旧称）", simple: "現在の『収支プラス見込み』と同じ項目です。", read: "別の確率ではありません。画面と説明の呼び方を『収支プラス見込み』へ統一しています。" },
      { name: "初当たり1回以上", simple: "予定回転数の中で、初当たりを1回以上引く理論上の確率です。", read: "大当たり確率と予定回転数だけで計算します。初当たりを引いても最終収支がプラスとは限らないため、収支プラス見込みとは別の数字です。" },
    ],
  },
  {
    title: "釘の変化を見つける仕組み",
    terms: [
      { name: "EMA（最近重視の平均）", simple: "昔よりも最近の結果を大事にする平均です。", read: "普通の平均は昔の数字も同じ重さですが、EMAは直近の変化へ早く気づけます。" },
      { name: "CUSUM（ズレの貯金）", simple: "小さな上がり下がりを毎日少しずつ貯める仕組みです。", read: "1日だけのブレでは反応しにくく、同じ方向のズレが続くと『開け・締め』を知らせます。" },
      { name: "CUSUM中心の釘変化監視", simple: "いつもの範囲を外れた変化が起きていないか見張ります。", read: "CUSUMを中心に、確認済みの隣台・対面台を合わせて締め変化・開け変化・ニュートラルを表示します。" },
      { name: "レジーム", simple: "台の『今の状態が始まった日』のことです。", read: "大きな変化を見つけたら、古い状態と新しい状態を分けます。新しい状態のデータを強く使うためです。" },
    ],
  },
  {
    title: "店と場所のクセ",
    terms: [
      { name: "曜日締め率", simple: "その店・機種が、明日と同じ曜日に悪くなった割合です。", read: "同じ曜日が3件未満なら参考不足です。30%なら、過去の約10回中3回で締め方向になったという意味です。" },
      { name: "島平均", simple: "同じ島にある台をまとめた平均回転率です。", read: "自分の台だけでなく、島全体が開いているか、1台だけ良く見えるのかを確認できます。" },
      { name: "隣接台の影響", simple: "近くの台が同じ方向へ動いているかを見ます。", read: "周りの60%以上が締め方向なら締め波及、開け方向なら開け波及として注意を出します。" },
      { name: "対面台の影響", simple: "向かい側の台と一緒に変化しているかを見ます。", read: "ホールマップで対面に設定した2島だけを、指定した向きで対応します。未設定の島は対面スコアへ含めません。" },
    ],
  },
  {
    title: "解析翌日の予想",
    terms: [
      { name: "マルコフ・翌日締め確率", simple: "解析日の状態から、翌日悪くなる割合を過去から調べた数字です。", read: "難しく言うと『良い→悪い』『悪い→悪い』の変わり方を数えています。60%以上は締め注意、データ不足時は安全側の初期値を使います。" },
      { name: "AIプロファイル", simple: "保存した差玉から、曜日・店・機種・島のクセをまとめた統計です。", read: "人のように考えるAIではありません。直近90日・最大300件の範囲で、投入玉が多い記録を強くします。" },
      { name: "翌日の地図", simple: "各台を、据え置き・締め注意・開け波及・様子見に分けた予想です。", read: "回転率、マルコフ、隣、対面を合わせます。翌日の実際の釘を保証するものではありません。" },
    ],
  },
  {
    title: "お金と安全度",
    terms: [
      { name: "玉単価差", simple: "ボーダー台より、1回転ごとに何円得か損かの差です。", read: "プラスなら有利、マイナスなら不利です。一般的な交換率の玉単価とは少し意味が違うため『差』と表示しています。" },
      { name: "時給・予定収支", simple: "同じ回転率が続いたときの、1時間・設定した予定時間の期待金額です。", read: "下限〜上限は回転率の誤差を金額へ直した幅です。実際の勝ち負けの上限ではありません。" },
      { name: "標準偏差・1時間のブレ", simple: "結果が平均からどれくらい大きく揺れやすいかです。", read: "数字が大きい機種ほど、短い時間では運の影響が大きくなります。" },
      { name: "シャープ比", simple: "期待できる利益を、結果のブレで割った安全度です。", read: "同じ時給なら、ブレが小さい台のほうが高くなります。当日の予定時間を高い順に配分します。" },
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

// ============================ A 選択台の今日の見込み ============================
function SelectedOutcomeSection({ machine, islandAvgRot, plan, onStartRecord, sessionStarted }) {
  if (!machine) return null;
  const v = VERDICT[machine.verdict];
  return (
    <Section title="選択台の今日の見込み" accent={v.color} sub="選んだ1台を詳しく確認">
      <div className="strategy-a-shell">
        {plan && (
          <div className={`strategy-plan-context ${plan.hasSavedPlan ? "is-saved" : ""}`}>
            <span><strong>{plan.sourceLabel}</strong><b>{plan.styleLabel}</b></span>
            <span>{plan.isSkip ? "本日は稼働しない設定" : `${fmt(plan.plannedHours, 1)}時間・約${fmt(plan.sessionSpins)}回転`}</span>
            <span>現金上限 {plan.cashLimit > 0 ? `${fmt(plan.cashLimit)}円` : "未設定"}</span>
            <span>貸玉 {fmt(plan.rentBalls)}玉/千円・交換 {fmt(plan.exRate)}玉/千円</span>
            <span>持ち玉・貯玉見込み {fmt(plan.nonCashRatio * 100)}%</span>
            <em>
              換金前提：{nonCashSourceLabel(plan.nonCashRatioSource)}
              {plan.nonCashSampleK > 0 ? `（${fmt(plan.nonCashSampleK, 1)}K分）` : ""}
              。1玉{fmt(plan.ballValueYen, 2)}円で計算。
              <br />
              {plan.cashLimit > 0
                ? "現金上限を超える下振れ予測は、金額を算定待ちにします"
                : "現金上限を設定すると、上限を超える下振れ予測を表示しません"}
            </em>
          </div>
        )}
        <SelectedDetailCard machine={machine} islandAvgRot={islandAvgRot} plan={plan} />
        <button
          type="button"
          onClick={() => onStartRecord?.(machine)}
          style={{
            width: "100%",
            minHeight: 54,
            marginTop: 10,
            borderRadius: 16,
            border: "none",
            background: sessionStarted
              ? "color-mix(in srgb, var(--sm-cyan) 16%, var(--sm-card))"
              : "linear-gradient(135deg,var(--sm-cyan),#38bdf8)",
            color: sessionStarted ? P.cyan : "#03131f",
            fontSize: 14,
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: sessionStarted ? "none" : "0 10px 26px color-mix(in srgb, var(--sm-cyan) 26%, transparent)",
          }}
        >
          {sessionStarted ? "記録中の台へ戻る" : `台${machine.num}で実践を開始`}
        </button>
        {!sessionStarted && (
          <div style={{ marginTop: 6, textAlign: "center", color: P.sub, fontSize: 9 }}>
            店舗・機種・台番号を記録開始へ引き継ぎます
          </div>
        )}
      </div>
    </Section>
  );
}

function FreshnessBanner({ freshness, sourceSummary }) {
  if (!freshness || freshness.status === "fresh") return null;
  if (freshness.status === "prepared") {
    return (
      <div style={{
        margin: "10px 14px 0", padding: "11px 12px", borderRadius: 14,
        border: "1px solid color-mix(in srgb, var(--sm-cyan) 42%, var(--sm-line))",
        background: "color-mix(in srgb, var(--sm-cyan) 8%, var(--sm-card))",
        color: P.subHi, fontSize: 11, lineHeight: 1.6,
      }}>
        <strong style={{ display: "block", color: P.cyan, marginBottom: 3 }}>
          前日リサーチ：{freshness.sourceDate}の解析を本日用に表示
        </strong>
        有力・着席目安・収支見込みを確認できます。実戦前は店内状況と試し打ちの回転率も確認してください。
        {sourceSummary?.length > 0 && <span style={{ display: "block", marginTop: 3 }}>使用データ：{sourceSummary.join("＋")}</span>}
      </div>
    );
  }
  const future = freshness.status === "future";
  return (
    <div style={{
      margin: "10px 14px 0", padding: "11px 12px", borderRadius: 14,
      border: "1px solid color-mix(in srgb, var(--sm-yellow) 42%, var(--sm-line))",
      background: "color-mix(in srgb, var(--sm-yellow) 8%, var(--sm-card))",
      color: P.subHi, fontSize: 11, lineHeight: 1.6,
    }}>
      <strong style={{ display: "block", color: P.yellow, marginBottom: 3 }}>
        {future ? "解析日を確認してください" : `過去参考：${freshness.label}`}
      </strong>
      有力・着席推奨・今日の収支・翌日予測は停止しています。前日または本日の差玉解析を保存すると再開します。
      {sourceSummary?.length > 0 && <span style={{ display: "block", marginTop: 3 }}>使用データ：{sourceSummary.join("＋")}</span>}
    </div>
  );
}

// ============================ KPIサマリー ============================
function Kpi({ kpi }) {
  const items = [
    { label: "推定期待値", value: signed(kpi.evPerHour), unit: "円/h", color: kpi.evPerHour >= 0 ? P.green : P.red },
    { label: "予測回転率", value: fmt(kpi.rot, 1), unit: "/k", color: P.cyan },
    { label: `翌日${DECISION_TERMS.confidence}`, value: fmt(kpi.confidence), unit: "%", color: P.yellow },
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
  if (machine.recommendationStatus === "reference") {
    return {
      color: P.gray,
      bg: "rgba(100,116,139,.16)",
      label: "過去参考",
    };
  }
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
  const divergence = machine?.strategyDivergence?.status === "below-lower-bound";
  const label = machine
    ? `${number}番台 予測回転率${machine.rot} 翌日信頼度${machine.confidence}% ${tone.label}${divergence ? " 見切り検討" : ""}`
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
      {(machine?.liveDecision || divergence) && (
        <span className={`strategy-live-badge ${divergence ? "is-divergence" : `is-${machine.liveDecision.action}`}`}>
          {divergence ? "見切り検討" : liveBadgeLabel(machine.liveDecision)}
        </span>
      )}
    </button>
  );
}

function IslandOverview({ islands, activeIslandId, onChangeIsland }) {
  const pairs = pairStrategyIslands(islands);
  return (
    <div className="strategy-overview-wrap">
      <div className="strategy-overview-labels"><span>入口側</span><span>奥側</span></div>
      <div className="strategy-island-overview" aria-label="島表示の一覧">
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
              aria-label={`${label}を${pair.length === 2 ? "対面" : "単独"}表示`}
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
  const isPaired = Boolean(bottom && pair.confirmed);
  return (
    <div className="strategy-pair-map">
      <div className="strategy-pair-scroll">
        <div className="strategy-pair-canvas" style={{ "--pair-columns": columns, minWidth: columns * 58 - 4 }}>
          <PairIslandRow island={top} reverse={false} filter={filter} selectedId={selectedId} oppositeNumber={oppositeNumber} onSelect={onSelect} />
          {isPaired && (
            <>
              <div className="strategy-opposite-aisle"><span>対面通路</span><i>↕ 同じ縦位置が対面</i></div>
              <PairIslandRow
                island={bottom}
                reverse={top.facingReversed !== false}
                filter={filter}
                selectedId={selectedId}
                oppositeNumber={oppositeNumber}
                onSelect={onSelect}
              />
            </>
          )}
        </div>
      </div>
      {isPaired
        ? <div className="strategy-map-hint">← 横に動かすと2島が一緒に動きます →</div>
        : <div className="strategy-layout-note">対面未設定のため、この島だけを単独表示しています</div>}
      {pair.some((island) => !island.registeredLayout) && <div className="strategy-layout-note">未登録の島は計測済み台から仮配置しています</div>}
    </div>
  );
}

function HallMap({ data, filter, selectedId, activeIslandId, onChangeIsland, onSelect }) {
  const pairs = pairStrategyIslands(data.islands);
  const activePair = pairs.find((pair) => pair.some((island) => island.id === activeIslandId)) || pairs[0] || [];
  const selectedMachine = data.all.find((machine) => machine.id === selectedId) || null;
  return (
    <Section title="対面ヒートマップ" accent={P.cyan} sub="設定済みの2島だけを比較・未設定は単独表示">
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
  const ready = isFiniteValue(value);
  return (
    <div className={`strategy-revenue-point is-${tone}${ready ? "" : " is-pending"}`}>
      <span>{label}</span>
      <strong>{ready ? signed(value) : "算定待ち"}</strong>
      <small>{ready ? "円" : "データ不足"}</small>
    </div>
  );
}

function RevenueOutlook({ machine, plan }) {
  const coverage = machine.dataCoverage || {};
  const period = coveragePeriod(coverage);
  const coverageDetails = [
    period,
    coverage.inputBalls > 0 ? `推定投入 ${fmt(coverage.inputBalls)}玉` : "",
  ].filter(Boolean).join(" ／ ");
  const lowerBoundPending = machine.revenueRangeStatus === "lower-bound-missing";
  const lowerBoundPendingText = {
    "non-positive": "悪い側の予測が「1,000円あたり0回」まで広がっているためです。データが増えると更新されます。",
    "invalid-estimate": "悪い側の予測を安定して計算できないためです。データが増えると更新されます。",
    "low-confidence": "回転率を金額へ換算できるだけの確度に達していないためです。データが増えると更新されます。",
    unstable: "悪い側の回転率が中心予測と収支ゼロの目安の両方に対して半分以下まで広がり、少しの差で金額が急増するためです。データが増えると更新されます。",
    "over-budget": "設定した現金上限を超えて打ち続ける前提になるためです。予定を守れる範囲では金額を確定できません。",
  }[machine.revenueRangeReason] || "悪い側の予測幅が大きく、金額へ安定して換算できないためです。";
  return (
    <div className="strategy-revenue-card">
      <div className="strategy-revenue-head">
        <div><strong>収益見込み</strong><span>回転率が予測の範囲で動いた場合</span></div>
        <span className="strategy-revenue-help" title="未来を保証する金額ではありません">予測値</span>
      </div>
      <div className="strategy-revenue-coverage">
        <div>
          <strong>有効データ {coverage.effectiveDays > 0 ? `${fmt(coverage.effectiveDays)}日` : "算定待ち"}</strong>
          {coverage.recentRegimeOnly && <em>直近状態のみ</em>}
        </div>
        <span>{coverageDetails || "計算に使える記録を収集中"}</span>
      </div>
      <div className="strategy-revenue-line">
        <div className="strategy-revenue-label"><strong>時給</strong><span>約1時間</span></div>
        <RevenuePoint label="下振れ" value={machine.hourlyLow} tone="low" />
        <RevenuePoint label="期待" value={machine.evPerHour} tone="expected" />
        <RevenuePoint label="上振れ" value={machine.hourlyHigh} tone="high" />
      </div>
      <div className="strategy-revenue-line">
        <div className="strategy-revenue-label"><strong>予定収支</strong><span>{fmt(plan?.sessionSpins ?? machine.plannedSpins)}回転</span></div>
        <RevenuePoint label="下振れ" value={machine.dailyLow} tone="low" />
        <RevenuePoint label="期待" value={machine.daily} tone="expected" />
        <RevenuePoint label="上振れ" value={machine.dailyHigh} tone="high" />
      </div>
      {lowerBoundPending && (
        <div className="strategy-revenue-pending-note">
          <strong>下振れは算定待ち</strong>
          <span>{lowerBoundPendingText}</span>
        </div>
      )}
      <div className="strategy-luck-risk">
        <div className="strategy-luck-title">
          <strong>運によるブレ</strong>
          <span>
            {machine.stdDevVerified && machine.stdDev != null
              ? `2,200回転基準の検証済み標準偏差 ${fmt(machine.stdDev)}玉を使用`
              : "検証済み標準偏差の確認待ち"}
          </span>
        </div>
        <div><span>1時間</span><b>{machine.hourlyRisk == null ? "算定待ち" : `±${fmt(Math.abs(machine.hourlyRisk))}円`}</b></div>
        <div><span>予定全体</span><b>{machine.dailyRisk == null ? "算定待ち" : `±${fmt(Math.abs(machine.dailyRisk))}円`}</b></div>
      </div>
    </div>
  );
}

function OutcomeOverview({ machine, plan }) {
  const chanceReady = machine.profitChanceStatus === "ready";
  const payout = payoutSummary(machine);
  const hitRate = machine.atLeastOneHitRate == null ? null : Math.round(machine.atLeastOneHitRate * 100);
  return (
    <div className={`strategy-outcome-card ${chanceReady ? "is-ready" : "is-pending"}`}>
      <div className="strategy-outcome-hero">
        <span><small>予定終了時の</small><strong>収支プラス見込み</strong></span>
        <b>{profitChanceText(machine)}</b>
        <em>{chanceReady ? `${profitChanceCenterText(machine)}・${fmt(plan?.plannedHours, 1)}時間の固定時間モデル・概算` : "不足データが揃うまで数値を表示しません"}</em>
      </div>
      <div className="strategy-outcome-specs">
        <span><small>通常時初当たり</small><b>{machine.jackpotLabel || "—"}</b></span>
        <span><small>{payout.label}</small><b>{payout.value}</b></span>
        <span><small>RUSH平均</small><b>{machine.rushAvgPayout == null ? "—" : `${fmt(machine.rushAvgPayout)}玉`}</b></span>
        <span><small>突入 / 継続</small><b>{machine.rushEntryRate == null ? "—" : `${fmt(machine.rushEntryRate, 1)}% / ${machine.rushContinueRate == null ? "—" : `${fmt(machine.rushContinueRate, 1)}%`}`}</b></span>
      </div>
      <div className="strategy-outcome-hit">
        <span>予定{fmt(plan?.sessionSpins ?? machine.plannedSpins)}回転で初当たり1回以上</span>
        <b>{hitRate == null ? "算定待ち" : `約${fmt(hitRate)}%`}</b>
      </div>
      <p>初当たり確率と収支プラス見込みは別の指標です。後者は正規近似による概算で、短時間・荒い機種ほど誤差が大きくなります。</p>
    </div>
  );
}

function SelectedDetailCard({ machine, islandAvgRot, plan }) {
  if (!machine) return null;
  const v = VERDICT[machine.verdict];
  const diff = Math.round((machine.rot - islandAvgRot(machine.islandId)) * 10) / 10;
  const seatThreshold = Math.ceil(
    Number(machine.seatThreshold ?? (Number(machine.border || 0) + 0.5)) * 10,
  ) / 10;
  const decisionTargetPct = Math.round(Number(machine.decisionLowerTargetCoverage || 0.8) * 100);
  const recommendation = plan?.isSkip
    ? "本日見送り"
    : machine.recommendationStatus === "reference" ? "過去参考"
      : machine.seatDecisionStatus === "candidate" ? "安全側で候補"
        : machine.seatDecisionStatus === "trial" ? "試し打ちで確認"
          : machine.seatDecisionStatus === "skip" ? "見送り寄り" : "算定待ち";
  const recommendationColor = plan?.isSkip || machine.recommendationStatus === "reference"
    ? P.yellow
    : machine.seatDecisionStatus === "candidate" ? P.green
      : machine.seatDecisionStatus === "skip" ? P.red : P.yellow;
  return (
    <div className="strategy-selected-detail-card" style={{ background: P.card, border: `1px solid color-mix(in srgb, ${v.color} 30%, ${P.line})`, borderRadius: RADIUS, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: P.text, fontFamily: MONO }}>台{machine.num}</span>
              {machine.isStar && <span style={{ color: P.yellow, fontSize: 15, textShadow: `0 0 8px ${P.yellow}` }}>★</span>}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: recommendationColor,
                background: `color-mix(in srgb, ${recommendationColor} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${recommendationColor} 38%, transparent)`,
                borderRadius: 999,
                padding: "5px 12px",
              }}
            >
              {recommendation}
            </span>
          </div>

          <OutcomeOverview machine={machine} plan={plan} />
          <RevenueOutlook machine={machine} plan={plan} />

          {plan?.isSkip ? (
            <div className="strategy-a-decision is-skip">
              <div><span>本日の判断</span><b>立ち回りプランが「見送り」に設定されています</b></div>
            </div>
          ) : machine.recommendationStatus === "reference" ? (
            <div className="strategy-a-decision is-skip">
              <div><span>本日の判断</span><b>前日または本日の解析がないため、着席判断を停止しています</b></div>
            </div>
          ) : machine.seatDecisionStatus === "skip" ? (
            <div className="strategy-a-decision is-skip">
              <div><span>本日の判断</span><b>{machine.nailAlert.includes("締め") ? "締め傾向を検知したため見送り寄り" : `判断用下限が座る基準 ${fmt(seatThreshold, 1)}/k 未満`}</b></div>
            </div>
          ) : (
            <div className="strategy-a-decision">
              <div><span>本日の判断</span><b>{machine.seatDecisionStatus === "candidate" ? "判断用下限でも基準超え" : "試し打ちで基準超えを確認"}</b></div>
              <i aria-hidden="true">→</i>
              <div><span>座る目安</span><b>1,000円あたり{fmt(seatThreshold, 1)}回以上</b></div>
            </div>
          )}

          {machine.strategyDivergence?.status === "below-lower-bound" && (
            <div
              role="status"
              style={{
                marginBottom: 10,
                padding: "10px 12px",
                borderRadius: 13,
                background: "rgba(194,65,12,.13)",
                border: "1px solid rgba(249,115,22,.48)",
                color: P.yellow,
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1.65,
              }}
            >
              見切り検討：実測 {fmt(machine.strategyDivergence.actualPer250, 1)}回/250玉が、実戦値を混ぜる前の予測下限
              {" "}{fmt(machine.strategyDivergence.predictedLowPer250, 1)}回/250玉を
              {" "}{fmt(machine.strategyDivergence.shortfall, 1)}回下回っています。自動停止ではなく、追加投資前に見直すための補助表示です。
            </div>
          )}

          <CashLimitGuide guide={machine.cashLimitGuide} />

          <div className="strategy-detail-main">
            <div className="strategy-detail-primary">
              <DetailMetric label="推定回転率" value={fmt(machine.rot, 1)} unit="/k" color={v.color} />
              <DetailMetric label={`翌日${DECISION_TERMS.confidence}`} value={fmt(machine.confidence)} unit="%" color={P.yellow} />
              <DetailMetric label="島平均との差" value={signed(diff, 1)} unit="/k" color={diff >= 0 ? P.green : P.red} />
              <DetailMetric label="等価ボーダー" value={fmt(machine.equivalentBorder, 1)} unit="/k" color={P.subHi} />
              <DetailMetric label="実質ボーダー" value={fmt(machine.border, 1)} unit="/k" color={P.cyan} />
            </div>
            <div className="strategy-detail-chart">
              <div style={{ fontSize: 9, color: P.sub, fontWeight: 700, marginBottom: 4 }}>
                過去推定回転率 ・ {machine.historyDayCount > 0 ? `有効${fmt(machine.historyDayCount)}日` : "データ待ち"}
              </div>
              <div style={{ background: P.bg, border: `1px solid ${P.line}`, borderRadius: 12, padding: "6px 0" }}>
                <Sparkline points={machine.history} color={v.color} />
              </div>
            </div>
          </div>

          <div className="strategy-detail-secondary">
            <DetailMetric label={`判断用下限（${decisionTargetPct}%目標）`} value={fmt(machine.decisionLowerRotation ?? machine.lcbRotation, 1)} unit="/k" color={machine.selectionMargin >= 0 ? P.green : P.red} />
            <DetailMetric
              label="座る基準超え"
              value={isFiniteValue(machine.seatThresholdProbability) ? fmt(machine.seatThresholdProbability * 100) : "算定待ち"}
              unit={isFiniteValue(machine.seatThresholdProbability) ? "%" : ""}
              color={machine.seatThresholdProbability >= 0.5 ? P.green : P.red}
            />
            <DetailMetric label="良台スコア" value={fmt(machine.goodMachineScore, 1)} unit="点" color={v.color} />
            <DetailMetric label="EMA（最近重視）" value={fmt(machine.ema, 1)} unit="/k" color={P.cyan} />
            <DetailMetric
              label={machine.recommendationStatus === "reference" ? "締め確率" : `${machine.predictionDayLabel}締め確率`}
              value={machine.recommendationStatus === "reference" || !isFiniteValue(machine.tomorrowTight) ? "算定待ち" : fmt(machine.tomorrowTight)}
              unit={machine.recommendationStatus === "reference" || !isFiniteValue(machine.tomorrowTight) ? "" : "%"}
              color={isFiniteValue(machine.tomorrowTight) && machine.tomorrowTight >= 60 ? P.red : P.yellow}
            />
            <DetailMetric label="玉単価差" value={machine.unitPriceAvailable ? signed(machine.unitPrice, 2) : "—"} unit={machine.unitPriceAvailable ? "円/回" : ""} color={machine.unitPriceAvailable && machine.unitPrice < 0 ? P.red : P.green} />
            <DetailMetric label="シャープ比" value={fmt(machine.sharpe, 2)} unit="" color={P.subHi} />
          </div>
          <div style={{ marginTop: 7, fontSize: 9, color: P.sub }}>
            予測データ：{(machine.evidenceSources || []).map((source) => source === "delta" ? "差玉" : source === "archive" ? "完了実戦" : "現在実戦").join("＋") || "機種基準"}
            {machine.rotationEstimate?.inputBalls > 0 ? ` ／ 推定投入 ${fmt(machine.rotationEstimate.inputBalls)}玉` : ""}
            {machine.processNoiseSd != null ? ` ／ 日次変動 ±${fmt(machine.processNoiseSd, 2)}/k（1σ）` : ""}
            {` ／ 下限校正 ${fmt(machine.decisionCalibrationSampleCount || 0)}/${fmt(machine.decisionCalibrationMinRequired || 100)}件`}
            {machine.decisionCalibrationStatus === "calibrated" ? "（実績校正済み）" : "（暫定値）"}
          </div>
          {(machine.biasRotationAdjustment || machine.payoutCorrection) && (
            <div style={{ marginTop: 4, fontSize: 9, color: P.subHi, lineHeight: 1.5 }}>
              {machine.biasRotationAdjustment
                ? `推奨上位の過去偏りを ${signed(machine.biasRotationAdjustment, 2)}/k 補正`
                : ""}
              {machine.biasRotationAdjustment && machine.payoutCorrection ? " ／ " : ""}
              {machine.payoutCorrection
                ? `実戦実測${fmt(machine.payoutCorrection.n)}件で平均出玉を店舗補正`
                : ""}
            </div>
          )}
          <div style={{ marginTop: 5, fontSize: 9, color: P.subHi, lineHeight: 1.55 }}>
            締め確率の根拠：{tightEvidenceText(machine.tightEvidence)}
          </div>

          <div style={{ marginTop: 9, padding: "10px 11px", borderRadius: 12, background: P.bg, border: `1px solid ${P.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: machine.nailAlert.includes("締め") ? P.red : machine.nailAlert.includes("開け") ? P.green : P.yellow }}>
              釘変化：{machine.nailAlert}
            </div>
            <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.6, color: P.subHi }}>
              {machine.predictionDayLabel}の地図：{machine.nextPrediction} ／ {machine.spatialAlert} ／ {machine.oppositeAlert}
            </div>
            {machine.regimeStart && <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.6, color: P.sub }}>今の状態は{machine.regimeStart}から</div>}
          </div>
    </div>
  );
}

function TrendLine({ values, color, includeZero = false, ariaLabel }) {
  const width = 210;
  const height = 44;
  const pad = 4;
  const finiteValues = values.map(Number).filter(Number.isFinite);
  if (!finiteValues.length) return null;
  const min = Math.min(...finiteValues, ...(includeZero ? [0] : []));
  const max = Math.max(...finiteValues, ...(includeZero ? [0] : []));
  const span = max - min || 1;
  const points = finiteValues.map((value, index) => {
    const x = finiteValues.length === 1
      ? width / 2
      : pad + index * ((width - pad * 2) / (finiteValues.length - 1));
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const path = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const zeroY = includeZero && min <= 0 && max >= 0
    ? pad + (1 - (0 - min) / span) * (height - pad * 2)
    : null;
  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 44, display: "block" }}>
      {zeroY != null && <line x1={pad} x2={width - pad} y1={zeroY} y2={zeroY} stroke={P.lineHi} strokeDasharray="3 3" />}
      <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], index) => <circle key={`${x}-${index}`} cx={x} cy={y} r="2.4" fill={color} />)}
    </svg>
  );
}

function BacktestTrendPanel({ pairs, selected }) {
  const [scope, setScope] = useState("all");
  const scopedPairs = useMemo(() => (Array.isArray(pairs) ? pairs : []).filter((pair) => {
    if (scope === "machine") return String(pair.machineName) === String(selected?.machineName);
    if (scope === "table") {
      return String(pair.machineName) === String(selected?.machineName)
        && String(pair.num) === String(selected?.num);
    }
    return true;
  }), [pairs, scope, selected?.machineName, selected?.num]);
  const trend = useMemo(
    () => buildWeeklyBacktestTrend(scopedPairs, { maxWeeks: 12 }),
    [scopedPairs],
  );
  const latest = trend.at(-1) || null;
  const calibrations = trend.flatMap((week) => week.calibrationEvents || []);
  return (
    <div style={{ marginTop: 8, padding: 11, borderRadius: 14, background: P.bg, border: `1px solid ${P.line}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, color: P.text }}>バックテスト週次推移</div>
          <div style={{ marginTop: 2, fontSize: 8, color: P.sub }}>承認日以降は、その日に有効だった係数で再現</div>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {[["all", "全体"], ["machine", "機種"], ["table", `台${selected?.num ?? ""}`]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              aria-pressed={scope === id}
              style={{
                minHeight: 32,
                borderRadius: 9,
                padding: "0 8px",
                border: `1px solid ${scope === id ? P.cyan : P.line}`,
                background: scope === id ? "color-mix(in srgb, var(--sm-cyan) 12%, var(--sm-card))" : P.card,
                color: scope === id ? P.cyan : P.subHi,
                fontSize: 8,
                fontWeight: 800,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {trend.length === 0 ? (
        <div style={{ padding: "14px 0 4px", color: P.sub, fontSize: 9 }}>連続日の予測と実績が揃うと、週ごとの変化を表示します。</div>
      ) : (
        <>
          <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>
            {[
              { label: "MAE", values: trend.map((week) => week.mae), value: `${fmt(latest.mae, 2)}/k`, color: P.cyan, zero: true },
              { label: "偏り", values: trend.map((week) => week.bias), value: `${signed(latest.bias, 2)}/k`, color: P.yellow, zero: true },
              { label: "95%範囲内", values: trend.map((week) => week.coverage95 * 100), value: `${fmt(latest.coverage95 * 100)}%`, color: P.green, zero: false },
              { label: "判断下限以上", values: trend.map((week) => week.decisionLowerCoverage * 100), value: `${fmt(latest.decisionLowerCoverage * 100)}%`, color: P.cyan, zero: false },
            ].map((metric) => (
              <div key={metric.label} style={{ minWidth: 0, padding: 7, borderRadius: 10, background: P.card, border: `1px solid ${P.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 3, fontSize: 8 }}>
                  <span style={{ color: P.sub }}>{metric.label}</span>
                  <b style={{ color: metric.color, fontFamily: MONO }}>{metric.value}</b>
                </div>
                <TrendLine values={metric.values} color={metric.color} includeZero={metric.zero} ariaLabel={`${metric.label}の週次推移`} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 8, color: P.sub, fontSize: 8 }}>
            <span>{trend[0].weekStart.slice(5)}週</span>
            <span>最新週 {fmt(latest.n)}件</span>
            <span>{latest.weekStart.slice(5)}週</span>
          </div>
          <div style={{ marginTop: 5, color: P.subHi, fontSize: 8, lineHeight: 1.5 }}>
            下限誤差 {fmt(latest.decisionLowerPinballLoss, 3)} ／
            誤着席 {latest.falseSitRate == null ? "—" : `${fmt(latest.falseSitRate * 100)}%`} ／
            見逃し {latest.falseSkipRate == null ? "—" : `${fmt(latest.falseSkipRate * 100)}%`}
          </div>
          {calibrations.length > 0 && (
            <div style={{ marginTop: 7, color: P.cyan, fontSize: 8, lineHeight: 1.5 }}>
              校正反映：{calibrations.map((event) => `${event.effectiveFrom} ${fmt(event.previousPriorBalls)}→${fmt(event.appliedPriorBalls)}玉`).join(" ／ ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const ACTIVITY_TONES = {
  "inactive-high": { color: P.red, label: "未稼働60%以上" },
  "inactive-partial": { color: P.yellow, label: "一部未稼働" },
  active: { color: P.green, label: "通常稼働" },
  invalid: { color: P.gray, label: "読取除外" },
  "no-data": { color: P.lineHi, label: "データなし" },
};

function IslandActivityHistoryPanel({
  history,
  selected,
  scans = EMPTY_LIST,
  onChangeScanDate,
  requestConfirmation,
}) {
  const islandHistory = useMemo(() => (Array.isArray(history) ? history : [])
    .filter((entry) => entry.key === selected?.activityHistoryKey), [history, selected?.activityHistoryKey]);
  const months = useMemo(() => listIslandActivityMonths(islandHistory), [islandHistory]);
  const [requestedMonth, setRequestedMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [dateNotice, setDateNotice] = useState("");
  const month = months.includes(requestedMonth)
    ? requestedMonth
    : months.at(-1) || "";
  const selectMonth = (nextMonth) => {
    setRequestedMonth(nextMonth);
    setSelectedDate("");
    setEditingDate(false);
    setDateError("");
    setDateNotice("");
  };
  const calendar = useMemo(
    () => buildIslandActivityCalendar(islandHistory, { month }),
    [islandHistory, month],
  );
  const monthIndex = months.indexOf(calendar.month);
  const selectedEntry = islandHistory.find((entry) => entry.date === selectedDate)
    || [...islandHistory].reverse().find((entry) => entry.date.startsWith(`${calendar.month}-`))
    || null;
  const targetScans = useMemo(() => {
    if (!selectedEntry) return [];
    return findDeltaScanDateTargets(scans, {
      date: selectedEntry.date,
      storeKey: selectedEntry.store,
      island: selectedEntry.island,
    }).filter((scan) => scan?.id !== null && scan?.id !== undefined);
  }, [scans, selectedEntry]);
  const beginDateEdit = () => {
    if (!selectedEntry || !targetScans.length || !onChangeScanDate) return;
    setDraftDate(selectedEntry.date);
    setDateError("");
    setDateNotice("");
    setEditingDate(true);
  };
  const submitDateEdit = async () => {
    if (!selectedEntry || !targetScans.length || !onChangeScanDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftDate)) {
      setDateError("正しい日付を選んでください。");
      return;
    }
    if (draftDate === selectedEntry.date) {
      setDateError("変更前と同じ日付です。");
      return;
    }
    const mergesWithExistingDay = islandHistory.some((entry) => entry.date === draftDate);
    const mergeWarning = mergesWithExistingDay
      ? "\n変更先にはすでにデータがあります。同じ日のデータとしてまとめて表示されます。"
      : "";
    const message = `${selectedEntry.date} を ${draftDate} に変更します。\n`
      + `対象の差玉解析 ${targetScans.length}件の日付を変更します。${mergeWarning}`;
    if (typeof requestConfirmation !== "function") {
      setDateError("確認画面を開けませんでした。画面を開き直してもう一度お試しください。");
      return;
    }
    const confirmed = await requestConfirmation({
      title: "差玉解析日を変更しますか？",
      message,
      confirmLabel: "日付を変更",
    });
    if (!confirmed) return;

    const result = onChangeScanDate({
      scanIds: targetScans.map((scan) => scan.id),
      fromDate: selectedEntry.date,
      toDate: draftDate,
    });
    if (!result?.ok) {
      setDateError(result?.reason === "same-date"
        ? "変更前と同じ日付です。"
        : "日付を変更できませんでした。もう一度お試しください。");
      return;
    }

    setRequestedMonth(draftDate.slice(0, 7));
    setSelectedDate(draftDate);
    setEditingDate(false);
    setDateError("");
    setDateNotice(`${result.fromDate} から ${result.toDate} へ変更しました。`);
  };
  if (!islandHistory.length) {
    return <div style={{ marginTop: 7, color: P.sub, fontSize: 8 }}>島活動の履歴はまだありません。</div>;
  }
  return (
    <div style={{ marginTop: 8, padding: 11, borderRadius: 14, background: P.bg, border: `1px solid ${P.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, color: P.text }}>島活動シグナル履歴</div>
          <div style={{ marginTop: 2, fontSize: 8, color: P.sub }}>保存済み差玉から日別に再集計</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <button type="button" aria-label="前の月" disabled={monthIndex <= 0} onClick={() => selectMonth(months[monthIndex - 1])} style={{ minWidth: 36, minHeight: 36, borderRadius: 9, border: `1px solid ${P.line}`, background: P.card, color: P.text, opacity: monthIndex <= 0 ? .35 : 1 }}>‹</button>
          <strong style={{ minWidth: 72, textAlign: "center", fontSize: 10, color: P.text }}>{calendar.label}</strong>
          <button type="button" aria-label="次の月" disabled={monthIndex < 0 || monthIndex >= months.length - 1} onClick={() => selectMonth(months[monthIndex + 1])} style={{ minWidth: 36, minHeight: 36, borderRadius: 9, border: `1px solid ${P.line}`, background: P.card, color: P.text, opacity: monthIndex < 0 || monthIndex >= months.length - 1 ? .35 : 1 }}>›</button>
        </div>
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {calendar.weekdays.map((weekday) => <span key={weekday} style={{ textAlign: "center", color: P.sub, fontSize: 8 }}>{weekday}</span>)}
        {calendar.cells.map((cell, index) => {
          if (!cell) return <span key={`blank-${index}`} />;
          const tone = ACTIVITY_TONES[cell.status] || ACTIVITY_TONES["no-data"];
          const active = selectedEntry?.date === cell.date;
          return (
            <button
              key={cell.date}
              type="button"
              disabled={!cell.entry}
              onClick={() => {
                if (!cell.entry) return;
                setSelectedDate(cell.date);
                setEditingDate(false);
                setDateError("");
                setDateNotice("");
              }}
              aria-label={`${cell.date} ${tone.label}`}
              style={{
                minWidth: 0,
                minHeight: 38,
                borderRadius: 9,
                border: `1px solid ${active ? P.cyan : `color-mix(in srgb, ${tone.color} 50%, ${P.line})`}`,
                background: cell.entry ? `color-mix(in srgb, ${tone.color} 16%, ${P.card})` : P.card,
                color: cell.entry ? P.text : P.sub,
                fontSize: 9,
                fontWeight: active ? 900 : 700,
                opacity: cell.entry ? 1 : .45,
              }}
            >
              {cell.day}
              <span aria-hidden="true" style={{ display: "block", width: 5, height: 5, borderRadius: "50%", background: tone.color, margin: "3px auto 0" }} />
            </button>
          );
        })}
      </div>
      {selectedEntry && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: P.card, border: `1px solid ${P.line}`, color: P.subHi, fontSize: 8, lineHeight: 1.55 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ color: ACTIVITY_TONES[selectedEntry.signalCode]?.color || P.text }}>{selectedEntry.date}・{selectedEntry.activitySignal}</strong>
            {onChangeScanDate && targetScans.length > 0 && (
              <button
                type="button"
                onClick={beginDateEdit}
                aria-label={`${selectedEntry.date}の日付を修正`}
                style={{
                  minHeight: 34,
                  flexShrink: 0,
                  padding: "0 10px",
                  borderRadius: 9,
                  border: `1px solid ${P.cyan}`,
                  background: "color-mix(in srgb, var(--sm-cyan) 11%, var(--sm-card))",
                  color: P.cyan,
                  fontSize: 8,
                  fontWeight: 900,
                }}
              >
                日付を修正
              </button>
            )}
          </div>
          <span style={{ display: "block", marginTop: 3 }}>
            読取{fmt(selectedEntry.scannedMachines)}台 ／ 稼働{fmt(selectedEntry.activeMachines)}台 ／ 未稼働{fmt(selectedEntry.inactiveMachines)}台（{fmt(selectedEntry.inactiveRate * 100)}%） ／ 除外{fmt(selectedEntry.invalidMachines)}台
          </span>
          {editingDate && (
            <div
              role="group"
              aria-label="差玉解析日を修正"
              style={{
                marginTop: 8,
                padding: 9,
                borderRadius: 10,
                border: `1px solid ${P.line}`,
                background: P.bg,
              }}
            >
              <label style={{ display: "block", color: P.text, fontSize: 9, fontWeight: 800 }}>
                正しい解析日
                <input
                  type="date"
                  value={draftDate}
                  onChange={(event) => {
                    setDraftDate(event.target.value);
                    setDateError("");
                  }}
                  aria-invalid={Boolean(dateError)}
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: 40,
                    boxSizing: "border-box",
                    marginTop: 5,
                    padding: "0 9px",
                    borderRadius: 9,
                    border: `1px solid ${dateError ? P.red : P.lineHi}`,
                    background: P.card,
                    color: P.text,
                    colorScheme: "dark",
                    fontFamily: MONO,
                    fontSize: 11,
                  }}
                />
              </label>
              <div style={{ marginTop: 5, color: P.sub, fontSize: 8 }}>
                この日に保存した対象データ{targetScans.length}件をまとめて変更します。
              </div>
              {dateError && <div role="alert" style={{ marginTop: 5, color: P.red, fontSize: 8 }}>{dateError}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDate(false);
                    setDateError("");
                  }}
                  style={{
                    minHeight: 38,
                    borderRadius: 9,
                    border: `1px solid ${P.line}`,
                    background: P.card,
                    color: P.subHi,
                    fontSize: 9,
                    fontWeight: 800,
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={submitDateEdit}
                  style={{
                    minHeight: 38,
                    borderRadius: 9,
                    border: `1px solid ${P.cyan}`,
                    background: P.cyan,
                    color: P.bg,
                    fontSize: 9,
                    fontWeight: 900,
                  }}
                >
                  変更を保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {dateNotice && (
        <div role="status" style={{ marginTop: 7, color: P.green, fontSize: 8, fontWeight: 800 }}>
          {dateNotice}
        </div>
      )}
      <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: "4px 9px" }}>
        {Object.entries(ACTIVITY_TONES).map(([key, tone]) => (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: P.sub, fontSize: 7 }}>
            <i style={{ width: 6, height: 6, borderRadius: "50%", background: tone.color }} />{tone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LearningSummary({
  data,
  selected,
  scans,
  onChangeScanDate,
  requestConfirmation,
  onApproveCalibration,
  calibrationNotice,
}) {
  if (!data.analytics || !selected) return null;
  const overall = data.aiProfile?.overall || {};
  const island = data.islandStats?.find((item) => item.key === selected.activityHistoryKey)
    || data.islandStats?.find((item) => item.island === data.islands.find((x) => x.id === selected.islandId)?.name);
  const backtest = data.analytics?.backtest || null;
  const decisionLowerCalibration = backtest?.decisionLowerCalibration || null;
  const selectedBacktest = backtest?.byKeyList?.find((item) =>
    String(item.machineName) === String(selected.machineName)
    && String(item.num) === String(selected.num)
  ) || null;
  const calibration = backtest?.calibrationCandidates?.find((item) =>
    String(item.machineName) === String(selected.machineName)
  ) || null;
  const selectionBacktest = backtest?.selection || null;
  const biasCorrection = selectionBacktest?.biasCorrection || null;
  const processProfile = data.analytics?.processNoise?.byProfile?.[
    `${String(selected.storeId ?? selected.storeName ?? "").trim()}___${selected.machineName}`
  ] || data.analytics?.processNoise?.global || null;
  const payoutCorrection = (data.payoutCorrections || []).find((item) => (
    String(item.store) === String(selected.storeId ?? selected.storeName ?? "")
    && String(item.machineName) === String(selected.machineName)
  )) || null;
  const profileCounts = (data.aiProfile?.profiles || []).reduce((acc, profile) => {
    acc[profile.type] = (acc[profile.type] || 0) + 1;
    return acc;
  }, {});
  return (
    <Section title="店のクセと変化検知" accent={P.yellow} sub="保存した差玉だけで学習">
      <div style={{ padding: "0 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ padding: 12, borderRadius: 16, background: P.card, border: `1px solid ${P.line}` }}>
          <div style={{ fontSize: 9, color: P.sub }}>AIプロファイル（全体）</div>
          <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, color: P.cyan, fontFamily: MONO }}>{fmt(overall.rate, 1)}<span style={{ fontSize: 9, color: P.sub }}>/k</span></div>
          <div style={{ marginTop: 4, fontSize: 9, color: P.subHi }}>{fmt(overall.count)}件を玉数で重み付け</div>
          <div style={{ marginTop: 3, fontSize: 8, color: P.sub }}>
            曜日{profileCounts.weekday || 0}・店{profileCounts.store || 0}・機種{profileCounts.machine || 0}・島{profileCounts.island || 0}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 16, background: P.card, border: `1px solid ${P.line}` }}>
          <div style={{ fontSize: 9, color: P.sub }}>{data.actionable ? `${selected.predictionDayLabel}の曜日の締め率` : "曜日の締め率"}</div>
          <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, color: data.actionable && selected.weekdayTight >= 30 ? P.red : P.yellow, fontFamily: MONO }}>
            {data.actionable ? <>{fmt(selected.weekdayTight)}<span style={{ fontSize: 9, color: P.sub }}>%</span></> : "算定待ち"}
          </div>
          <div style={{ marginTop: 4, fontSize: 9, color: P.subHi }}>
            {data.actionable ? `${selected.predictionDayLabel}と同じ曜日 ${fmt(selected.weekdaySamples)}件` : "前日または本日の解析後に更新"}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 16, background: P.card, border: `1px solid ${P.line}`, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 10, color: P.sub }}>島平均</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: P.text, fontFamily: MONO }}>{island ? `${fmt(island.averageRotation, 1)}/k（${island.activeMachines}台）` : "データ不足"}</span>
          </div>
          <div style={{ marginTop: 7, fontSize: 9, lineHeight: 1.6, color: P.sub }}>
            CUSUM（小さなズレの貯金） 開け {fmt(selected.cusumUp, 1)} ／ 締め {fmt(selected.cusumDown, 1)}。対面はホールマップで明示設定した島だけを対応します。
          </div>
          {island && (
            <div style={{ marginTop: 5, fontSize: 9, lineHeight: 1.6, color: island.inactiveMachines > 0 ? P.yellow : P.subHi }}>
              読取 {fmt(island.scannedMachines)}台 ／ 稼働 {fmt(island.activeMachines)}台 ／ 未稼働 {fmt(island.inactiveMachines)}台
              {island.invalidMachines > 0 ? ` ／ 除外 ${fmt(island.invalidMachines)}台` : ""}
              {island.activitySignal ? `。${island.activitySignal}` : ""}
            </div>
          )}
          <IslandActivityHistoryPanel
            key={selected.activityHistoryKey}
            history={data.islandActivityHistory}
            selected={selected}
            scans={scans}
            onChangeScanDate={onChangeScanDate}
            requestConfirmation={requestConfirmation}
          />
        </div>
        <div style={{ padding: 12, borderRadius: 16, background: P.card, border: `1px solid ${P.line}`, gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 10, color: P.sub }}>翌日予測の答え合わせ</div>
          <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: P.subHi }}>全体</div>
              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 900, color: P.cyan, fontFamily: MONO }}>
                {backtest?.overall?.n > 0 ? `平均ズレ ${fmt(backtest.overall.mae, 2)}/k` : "検証待ち"}
              </div>
              {backtest?.overall?.n > 0 && (
                <div style={{ marginTop: 3, fontSize: 8, color: P.sub }}>
                  {fmt(backtest.overall.n)}件・偏り {signed(backtest.overall.bias, 2)}/k・95%範囲内 {fmt(backtest.overall.coverage95 * 100)}%
                  ・判断下限以上 {fmt(backtest.overall.decisionLowerCoverage * 100)}%
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 9, color: P.subHi }}>台{selected.num}</div>
              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 900, color: P.yellow, fontFamily: MONO }}>
                {selectedBacktest?.n > 0 ? `平均ズレ ${fmt(selectedBacktest.mae, 2)}/k` : "検証待ち"}
              </div>
              {selectedBacktest?.n > 0 && (
                <div style={{ marginTop: 3, fontSize: 8, color: P.sub }}>
                  {fmt(selectedBacktest.n)}件・偏り {signed(selectedBacktest.bias, 2)}/k・95%範囲内 {fmt(selectedBacktest.coverage95 * 100)}%
                  ・判断下限以上 {fmt(selectedBacktest.decisionLowerCoverage * 100)}%
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 7, fontSize: 8, color: P.sub, lineHeight: 1.5 }}>
            平均ズレは、前日に予測した回転率と翌日の実績が平均で何回/Kずれたかです。判断下限以上は80%が目標で、偏りがプラスなら高めの予測です。
          </div>
          <div style={{ marginTop: 7, padding: 9, borderRadius: 11, background: P.bg, border: `1px solid ${P.line}`, fontSize: 8, color: P.subHi, lineHeight: 1.6 }}>
            <strong style={{ display: "block", color: P.text, fontSize: 9 }}>精度向上の学習状況</strong>
            <span style={{ display: "block", marginTop: 3 }}>
              日次変動：{processProfile
                ? `±${fmt(processProfile.sd, 2)}/k（${fmt(processProfile.n)}件・${processProfile.source === "default" ? "安全側の初期値" : "実績学習"}）`
                : "初期値で計算"}
            </span>
            <span style={{ display: "block" }}>
              判断用下限：{decisionLowerCalibration
                ? decisionLowerCalibration.status === "calibrated"
                  ? `${fmt(decisionLowerCalibration.sampleCount)}件で実績校正済み（実測 ${fmt(decisionLowerCalibration.observedCoverage * 100)}%）`
                  : `${fmt(decisionLowerCalibration.sampleCount)}/${fmt(decisionLowerCalibration.minRequired)}件・暫定値（あと${fmt(decisionLowerCalibration.remainingSamples)}件）`
                : "暫定値で計算"}
            </span>
            <span style={{ display: "block" }}>
              推奨上位5台：{selectionBacktest?.recommendedTop5?.n > 0
                ? `${fmt(selectionBacktest.recommendedTop5.n)}件・平均ズレ ${fmt(selectionBacktest.recommendedTop5.mae, 2)}/k`
                : "答え合わせ待ち"}
              {biasCorrection
                ? ` ／ 偏り補正 ${biasCorrection.status === "active"
                    ? `${signed(biasCorrection.appliedRotationAdjustment, 2)}/kを自動反映`
                    : biasCorrection.status === "shadow-validation"
                      ? "過去データで効果確認中"
                      : `あと${fmt(Math.max(0, biasCorrection.minRequired - biasCorrection.sampleCount))}件`}`
                : ""}
            </span>
            <span style={{ display: "block" }}>
              店舗別の平均出玉：{payoutCorrection
                ? payoutCorrection.eligible
                  ? `${fmt(payoutCorrection.n)}件から×${fmt(payoutCorrection.appliedFactor, 3)}を反映`
                  : `${fmt(payoutCorrection.n)}件／${fmt(payoutCorrection.minRequired)}件（学習中）`
                : "同日ペアを収集中"}
            </span>
          </div>
          {calibration && (
            <div style={{ marginTop: 7, padding: 9, borderRadius: 11, background: P.bg, border: `1px solid ${calibration.eligible ? P.cyan : P.line}`, fontSize: 8, color: calibration.eligible ? P.cyan : P.subHi, lineHeight: 1.55 }}>
              {calibration.eligible && calibration.recommendedPriorBalls != null ? (
                <>
                  <strong style={{ display: "block", fontSize: 9 }}>
                    学習係数の校正候補：{fmt(calibration.currentPriorBalls)}玉 → {fmt(calibration.recommendedPriorBalls)}玉
                  </strong>
                  <span style={{ display: "block", marginTop: 3 }}>
                    選択店舗の{fmt(calibration.n)}件から算出し、この機種の全店舗予測へ反映します。自動では変更しません。
                  </span>
                  {onApproveCalibration && (
                    <button
                      type="button"
                      onClick={() => onApproveCalibration(calibration)}
                      style={{
                        width: "100%",
                        minHeight: 44,
                        marginTop: 7,
                        borderRadius: 11,
                        border: "1px solid color-mix(in srgb, var(--sm-cyan) 60%, transparent)",
                        background: "color-mix(in srgb, var(--sm-cyan) 16%, var(--sm-card))",
                        color: P.cyan,
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    >
                      この校正候補を承認して反映
                    </button>
                  )}
                </>
              ) : calibration.reason === "awaiting-new-samples" ? (
                `校正は承認済みです。再校正まで新しい実績があと${fmt(calibration.remainingSamples)}件必要です。`
              ) : calibration.reason === "missing-current-prior" ? (
                "学習係数の校正待ち：現在の係数を確認できません。"
              ) : calibration.reason === "ambiguous-machine" ? (
                "型式を一意に確認できないため、校正は反映しません。"
              ) : calibration.reason === "no-change" ? (
                "現在の学習係数が候補と一致しています。"
              ) : (
                `学習係数の校正まであと${fmt(Math.max(0, Number(calibration.minRequired || 20) - Number(calibration.n || 0)))}件です。`
              )}
              {calibrationNotice?.machineName === selected.machineName && (
                <strong style={{ display: "block", marginTop: 6, color: calibrationNotice.ok ? P.green : P.red }}>
                  {calibrationNotice.message}
                </strong>
              )}
            </div>
          )}
          <BacktestTrendPanel pairs={backtest?.pairs || EMPTY_LIST} selected={selected} />
        </div>
      </div>
    </Section>
  );
}

function PortfolioPlan({ portfolio, plan }) {
  const rows = portfolio?.plan || [];
  if (!rows.length) return null;
  return (
    <Section title="予定時間の優先配分" accent={P.green} sub="期待値÷ブレで配分">
      <div style={{ padding: "0 14px", display: "grid", gap: 7 }}>
        {rows.map((row) => (
          <div key={`${row.machineName}-${row.number}`} className="strategy-plan-row">
            <span className="strategy-plan-rank">{row.rank}</span>
            <span className="strategy-plan-machine">台{row.number}</span>
            <span className="strategy-plan-sub">{row.machineName}</span>
            <span className="strategy-plan-metrics">
              <span className="is-ready"><b>{fmt(row.hours, 1)}</b><small>時間</small></span>
              <span><b>{signed(row.expectedProfit)}</b><small>円</small></span>
            </span>
          </div>
        ))}
        <div style={{ color: P.subHi, fontSize: 10, textAlign: "right" }}>
          設定 {fmt(plan?.plannedHours, 1)}時間 ／ 配分 {fmt(portfolio.totalHours, 1)}時間 ／ 期待 {signed(portfolio.expectedProfit)}円
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
export default function StrategyMapDashboard({ S, onBack, onStartRecord }) {
  const rootRef = useRef(null);
  const [entryPlanContext] = useState(() => S?.strategyPlanContext || null);
  const clearStrategyPlanContext = S?.setStrategyPlanContext;
  const playingNum = S?.sessionStarted ? S?.machineNum : null;
  const isDemo = import.meta.env.DEV && new URLSearchParams(window.location.search).get("pevidenceDemo") === "1";
  const savedStores = Array.isArray(S?.stores) ? S.stores : EMPTY_LIST;
  const selectedStoreId = S?.selectedStoreId;
  const exchangeRateRaw = S?.exRate;
  const ballValueRaw = S?.ballVal;
  const savedDailyResearchPlans = S?.dailyResearchPlans;
  const savedMonthlyPlayPlans = S?.monthlyPlayPlans;
  const rotationsPerHour = S?.rotPerHour;
  const savedHallMaps = S?.hallMaps;
  const liveDecision = S?.ev?.liveDecision || null;
  const savedArchives = Array.isArray(S?.archives) ? S.archives : EMPTY_LIST;
  const savedScans = Array.isArray(S?.deltaScans) ? S.deltaScans : EMPTY_LIST;
  const savedCustomMachines = Array.isArray(S?.customMachines) ? S.customMachines : EMPTY_LIST;
  const sessionStarted = Boolean(S?.sessionStarted);
  const liveSession = useMemo(() => sessionStarted ? {
    storeId: selectedStoreId,
    storeName: S?.storeName || "",
    machineName: S?.machineName || "",
    machineNum: S?.machineNum,
    date: S?.sessionStartDate || localDateStr(new Date()),
    ev: S?.ev || {},
    playMode: S?.playMode || "cash",
    settings: { rentBalls: S?.rentBalls, exRate: S?.exRate },
    cashSpentToday: S?.dailyCashSpent,
  } : null, [sessionStarted, selectedStoreId, S?.storeName, S?.machineName, S?.machineNum, S?.sessionStartDate, S?.ev, S?.playMode, S?.rentBalls, S?.exRate, S?.dailyCashSpent]);
  const deltaScans = useMemo(() => isDemo ? P_EVIDENCE_DEMO_SCANS : savedScans, [isDemo, savedScans]);
  const customMachines = useMemo(
    () => isDemo ? [P_EVIDENCE_DEMO_MACHINE, ...savedCustomMachines] : savedCustomMachines,
    [isDemo, savedCustomMachines],
  );
  const availableStoreIds = useMemo(() => savedStores
    .filter((store) => store && typeof store === "object")
    .map((store) => store.id), [savedStores]);
  const planHandoff = useMemo(() => (
    isDemo || entryPlanContext?.source !== "home-plan"
      ? null
      : (() => {
        const resolved = resolveStrategyPlanHandoff({
          monthlyPlayPlans: savedMonthlyPlayPlans,
          dailyResearchPlans: savedDailyResearchPlans,
          targetDate: entryPlanContext.date,
          availableStoreIds,
        });
        if (!resolved) return null;
        return applyStrategyPlanEntryContext(resolved, entryPlanContext);
      })()
  ), [isDemo, entryPlanContext, savedMonthlyPlayPlans, savedDailyResearchPlans, availableStoreIds]);
  const strategyStoreId = isDemo
    ? "pe-demo-store"
    : planHandoff?.defaultStoreId ?? selectedStoreId;
  const strategyPlan = useMemo(() => {
    const date = entryPlanContext?.date || localDateStr(new Date());
    const selectedStore = savedStores.find((store) => String(store?.id) === String(strategyStoreId)) || null;
    const rentBalls = Number(selectedStore?.rentBalls ?? S?.rentBalls);
    const exchangeRate = Number(selectedStore?.exRate ?? exchangeRateRaw);
    const fallbackBallValue = Number(ballValueRaw);
    const ballValueYen = exchangeRate > 0 ? 1000 / exchangeRate : (fallbackBallValue > 0 ? fallbackBallValue : 4);
    const nonCashEstimate = isDemo
      ? { nonCashRatio: 0, source: "cash-only", sampleK: 0 }
      : estimateStrategyNonCashRatio(savedArchives, {
          storeId: strategyStoreId,
          storeName: selectedStore?.name || S?.storeName || "",
        });
    return buildStrategyPlanContext({
      date,
      dailyResearchPlans: savedDailyResearchPlans,
      monthlyPlayPlans: savedMonthlyPlayPlans,
      spinsPerHour: rotationsPerHour,
      defaultHours: isDemo ? 3 : 6,
      defaultCashLimit: 0,
      ballValueYen: isDemo ? 4 : ballValueYen,
      rentBalls: isDemo ? 250 : rentBalls,
      exRate: isDemo ? 250 : exchangeRate,
      nonCashRatio: nonCashEstimate.nonCashRatio,
      nonCashRatioSource: nonCashEstimate.source,
      nonCashSampleK: nonCashEstimate.sampleK,
    });
  }, [
    entryPlanContext,
    savedStores,
    strategyStoreId,
    S?.rentBalls,
    S?.storeName,
    exchangeRateRaw,
    ballValueRaw,
    savedDailyResearchPlans,
    savedMonthlyPlayPlans,
    rotationsPerHour,
    isDemo,
    savedArchives,
  ]);
  const latestDemoDate = isDemo
    ? [...deltaScans].map((scan) => String(scan?.date || "")).sort().at(-1) || ""
    : "";
  const targetDate = isDemo ? nextDateKey(latestDemoDate) || strategyPlan.date : strategyPlan.date;
  const data = useMemo(() => buildStrategyMap({
    playingNum,
    liveDecision,
    scans: deltaScans,
    customMachines,
    hallMaps: isDemo ? P_EVIDENCE_DEMO_HALL_MAPS : savedHallMaps,
    selectedStoreId: strategyStoreId,
    planHandoff,
    plan: strategyPlan,
    targetDate,
    stores: savedStores,
    archives: isDemo ? EMPTY_LIST : savedArchives,
    liveSession: isDemo ? null : liveSession,
  }), [playingNum, liveDecision, deltaScans, customMachines, isDemo, savedHallMaps, strategyStoreId, planHandoff, strategyPlan, targetDate, savedStores, savedArchives, liveSession]);
  const plannedStore = savedStores.find((item) => (
    item && typeof item === "object" && planHandoff?.defaultStoreId != null
      && String(item.id) === String(planHandoff.defaultStoreId)
  ));
  const plannedStoreName = plannedStore?.name || "";
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(data.leadId);
  const [activeIslandId, setActiveIslandId] = useState(() =>
    data.all.find((machine) => machine.id === data.leadId)?.islandId || data.islands[0]?.id || null
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [yutimeOpen, setYutimeOpen] = useState(false);
  const [calibrationNotice, setCalibrationNotice] = useState(null);
  const calibrationApprovalRef = useRef("");

  useEffect(() => {
    calibrationApprovalRef.current = "";
  }, [savedCustomMachines]);

  useEffect(() => {
    clearStrategyPlanContext?.(null);
  }, [clearStrategyPlanContext]);

  useEffect(() => {
    rootRef.current?.closest("main")?.scrollTo({ top: 0, left: 0 });
  }, []);

  const selected = data.all.find((m) => m.id === selectedId) || null;
  const handleStartSelected = (machine) => {
    const start = onStartRecord || S?.startRecordFromSelection;
    start?.({
      storeId: machine?.storeId ?? strategyStoreId ?? null,
      storeName: machine?.storeName || savedStores.find((store) => String(store?.id) === String(strategyStoreId))?.name || "",
      machineName: machine?.machineName || "",
      machineNum: machine?.num ?? "",
      plannedStart1K: machine?.rot,
    });
  };
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
    const visiblePair = pairStrategyIslands(data.islands)
      .find((pair) => pair.some((island) => island.id === islandId));
    const machines = (visiblePair || []).flatMap((island) => island.machines);
    const lead = [...machines].sort((a, b) => b.score - a.score)[0] || null;
    setSelectedId(lead?.id || null);
  };

  const approveCalibration = (candidate) => {
    const approvalKey = `${candidate?.machineRecordName || candidate?.machineName}:${candidate?.evidenceThroughDate}:${candidate?.recommendedPriorBalls}`;
    if (isDemo || typeof S?.setCustomMachines !== "function" || calibrationApprovalRef.current === approvalKey) return;
    calibrationApprovalRef.current = approvalKey;
    const result = applyCalibrationCandidate(savedCustomMachines, candidate, {
      approvedAt: new Date().toISOString(),
    });
    if (!result.ok) {
      calibrationApprovalRef.current = "";
      setCalibrationNotice({
        ok: false,
        machineName: candidate?.machineName,
        message: result.reason === "stale-candidate"
          ? "別の変更が先に反映されています。最新の候補を確認してください。"
          : "校正値を反映できませんでした。候補を再確認してください。",
      });
      return;
    }
    // 関数形式で最新の保存値へ適用し、同時に行われた別機種の編集を失わない。
    S.setCustomMachines((currentMachines) => {
      const latestResult = applyCalibrationCandidate(currentMachines, candidate, {
        approvedAt: result.historyEntry.approvedAt,
      });
      return latestResult.ok ? latestResult.customMachines : currentMachines;
    });
    setCalibrationNotice({
      ok: true,
      machineName: candidate.machineName,
      message: `${fmt(result.historyEntry.previousPriorBalls)}玉 → ${fmt(result.historyEntry.appliedPriorBalls)}玉を承認しました。${result.historyEntry.effectiveFrom}から予測へ反映します。`,
    });
  };

  const changeScanDate = ({ scanIds, fromDate, toDate }) => {
    if (isDemo || typeof S?.setDeltaScans !== "function") {
      return { ok: false, reason: "unavailable", scans: savedScans, updatedCount: 0 };
    }
    const result = updateDeltaScanDate(savedScans, {
      scanIds,
      fromDate,
      toDate,
    });
    if (result.ok) S.setDeltaScans(result.scans);
    return result;
  };

  return (
    <div ref={rootRef} className="strategy-map" style={{ flex: 1, background: P.bg, color: P.text, fontFamily: FONT, paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
      <Header data={data} onBack={onBack} onHelp={() => setHelpOpen(true)} />
      <PlanHandoffBanner
        plan={planHandoff}
        match={data.planMatch}
        storeName={plannedStoreName}
        hasData={data.total > 0}
      />
      <FreshnessBanner freshness={data.freshness} sourceSummary={data.sourceSummary} />
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
      <SelectedOutcomeSection
        machine={selected}
        islandAvgRot={data.islandAvgRot}
        plan={data.plan}
        onStartRecord={handleStartSelected}
        sessionStarted={sessionStarted}
      />
      <LearningSummary
        data={data}
        selected={selected}
        scans={deltaScans}
        onChangeScanDate={isDemo ? null : changeScanDate}
        requestConfirmation={S?.requestConfirmation}
        onApproveCalibration={isDemo ? null : approveCalibration}
        calibrationNotice={calibrationNotice}
      />
      <PortfolioPlan portfolio={data.portfolio} plan={data.plan} />
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
