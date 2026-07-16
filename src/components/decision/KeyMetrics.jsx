import { useState } from "react";
import { C, font, mono, f, sp } from "../../constants";

const METRIC_HELP = {
  trueBorder: {
    title: "真のボーダーとは？",
    simple: "この回転率より上なら、長く打ったときにプラスを期待できる境目です。",
    caution: "交換率や持ち玉の使い方を含めた数字なので、雑誌のボーダーと少し違う場合があります。",
  },
  goodMachineScore: {
    title: "良台スコアとは？",
    simple: "回りやすさと、データの確かさを1つにまとめた点数です。高いほど良い台の候補です。",
    caution: "点数だけで決めず、信頼度と予測回転率も一緒に見ます。",
  },
  confidence: {
    title: "信頼度とは？",
    simple: "今の予測を、どれくらい信じてよいかの目安です。記録が増えるほど上がります。",
    caution: "当たる確率ではありません。5%なら、まだ記録が少なく判断が早いという意味です。",
  },
  predictedRotation: {
    title: "予測回転率とは？",
    simple: "今までの記録から予想した、1,000円あたりの回転数です。",
    caution: "実測値をそのまま使わず、少ない記録で早合点しないように補正しています。",
  },
};

function HelpButton({ metricKey, onOpen }) {
  const item = METRIC_HELP[metricKey];
  return (
    <button
      className="metric-help-button b"
      type="button"
      aria-label={`${item.title}の説明`}
      onClick={() => onOpen(metricKey)}
    >
      ?
    </button>
  );
}

function EvidenceMetric({ label, value, unit, accent, metricKey, onHelp }) {
  return (
    <div className="evidence-metric" style={{ "--metric-accent": accent, fontFamily: font }}>
      <div className="evidence-metric__label">
        <span>{label}</span>
        <HelpButton metricKey={metricKey} onOpen={onHelp} />
      </div>
      <div className="evidence-metric__value" style={{ fontFamily: mono }}>
        {value}<small>{unit}</small>
      </div>
    </div>
  );
}

function BalanceMetric({ label, value, unit, tone = "neutral", helpKey, onHelp }) {
  return (
    <div className={`balance-metric is-${tone}`} style={{ fontFamily: font }}>
      <div className="balance-metric__label">
        <span>{label}</span>
        {helpKey && <HelpButton metricKey={helpKey} onOpen={onHelp} />}
      </div>
      <strong style={{ fontFamily: mono }}>{value}<small>{unit}</small></strong>
    </div>
  );
}

const positive = (value) => Math.max(0, Number(value) || 0);
const shownYen = (value) => positive(value) > 0 ? f(Math.round(value)) : "—";

export function KeyMetrics({ ev, currentBalls, currentMochiBalls, currentChodama }) {
  const [helpKey, setHelpKey] = useState(null);
  const evidence = ev.evidence;
  const expectedPerK = ev.effectiveEV1K ?? ev.ev1KCorrected ?? ev.ev1K ?? 0;
  const borderDiff = ev.effectiveBDiff ?? ev.bDiffCorrected ?? ev.bDiff ?? 0;
  const hasObservedRotation = positive(ev.effectiveStart1K ?? ev.start1KCorrected ?? ev.start1K) > 0;
  const rentBalls = positive(ev.rentBalls) || 250;
  const cashInvest = positive(ev.cashCostYen ?? ev.rawInvest);
  const mochiUsed = positive(ev.mochiKCount) * rentBalls;
  const chodamaUsed = positive(ev.chodamaKCount) * rentBalls;
  const usedBalls = mochiUsed + chodamaUsed;
  const usedBallsLabel = mochiUsed > 0 && chodamaUsed > 0
    ? "使った持ち玉等"
    : chodamaUsed > 0 ? "使った貯玉" : "使った持ち玉";
  const heldCost = positive(ev.mochiCostYen) + positive(ev.chodamaCostYen);
  const grossInvest = cashInvest + heldCost;
  const trayCredit = positive(ev.economicTrayCreditYen ?? ev.trayBallsYen);
  const effectiveInvest = positive(ev.economicCostYen ?? ev.correctedInvestYen ?? grossInvest);
  const mochiBalance = positive(currentMochiBalls ?? currentBalls);
  const chodamaBalance = positive(currentChodama);
  const help = helpKey ? METRIC_HELP[helpKey] : null;

  return (
    <section className="key-metrics-v3" style={{ fontFamily: font }}>
      {evidence && (
        <>
          <div className="metrics-section-head">
            <b>台の見込み</b>
            <span>「？」で意味を見る</span>
          </div>
          <div className="evidence-metrics-grid">
            <EvidenceMetric
              label="真のボーダー"
              value={evidence.trueBorder > 0 ? f(evidence.trueBorder, 1) : "—"}
              unit="回/K"
              accent={C.blue}
              metricKey="trueBorder"
              onHelp={setHelpKey}
            />
            <EvidenceMetric
              label="良台スコア"
              value={evidence.hasEstimate ? f(evidence.goodMachineScore, 1) : "—"}
              unit="pt"
              accent={evidence.goodMachineScore >= 30 ? C.green : C.yellow}
              metricKey="goodMachineScore"
              onHelp={setHelpKey}
            />
            <EvidenceMetric
              label="信頼度"
              value={evidence.hasEstimate ? f(evidence.confidence * 100, 1) : "—"}
              unit="%"
              accent={C.purple}
              metricKey="confidence"
              onHelp={setHelpKey}
            />
            <EvidenceMetric
              label="予測回転率"
              value={evidence.hasEstimate ? f(evidence.predictedRotation, 1) : "—"}
              unit="回/K"
              accent={C.teal}
              metricKey="predictedRotation"
              onHelp={setHelpKey}
            />
          </div>
          {!evidence.hasEstimate && <p className="evidence-estimate-note">まだ記録が少ないため、予測は暫定です</p>}
        </>
      )}

      <div className="metrics-section-head">
        <b>投資の内訳</b>
        <span>玉は交換価値で円換算</span>
      </div>
      <div className="investment-breakdown">
        <div className="investment-flow">
          <div><span>現金投資</span><strong>{shownYen(cashInvest)}<small>円</small></strong></div>
          <i>＋</i>
          <div className="is-held"><span>{usedBallsLabel}</span><strong>{usedBalls > 0 ? f(Math.round(usedBalls)) : "—"}<small>玉</small></strong></div>
          <i>＝</i>
          <div className="is-total"><span>総投資</span><strong>{shownYen(grossInvest)}<small>円</small></strong></div>
        </div>
        <div className="investment-effective">
          <span>上皿補正 {trayCredit > 0 ? `−${f(Math.round(trayCredit))}円` : "—"}</span>
          <b>実質投資 <strong>{shownYen(effectiveInvest)}<small>円</small></strong></b>
        </div>
      </div>

      <div className="metrics-section-head">
        <b>現在と期待</b>
        <span>残高・収益予測</span>
      </div>
      <div className="balance-metrics-grid">
        <BalanceMetric label="持ち玉" value={mochiBalance > 0 ? f(Math.round(mochiBalance)) : "—"} unit="玉" tone="mochi" />
        <BalanceMetric label="貯玉" value={chodamaBalance > 0 ? f(Math.round(chodamaBalance)) : "—"} unit="玉" tone="chodama" />
        <BalanceMetric label="期待値/1K" value={expectedPerK !== 0 ? sp(expectedPerK, 0) : "—"} unit="円" tone="expected" />
        <BalanceMetric label="ボーダー差" value={hasObservedRotation && borderDiff !== 0 ? sp(borderDiff, 1) : "—"} unit="回/K" tone="expected" />
      </div>

      {help && (
        <div className="metric-help-backdrop" role="presentation" onClick={() => setHelpKey(null)}>
          <div className="metric-help-sheet" role="dialog" aria-modal="true" aria-labelledby="metric-help-title" onClick={(event) => event.stopPropagation()}>
            <div className="metric-help-sheet__head">
              <b id="metric-help-title">{help.title}</b>
              <button className="b" type="button" onClick={() => setHelpKey(null)}>閉じる</button>
            </div>
            <p>{help.simple}</p>
            <small>{help.caution}</small>
          </div>
        </div>
      )}
    </section>
  );
}
