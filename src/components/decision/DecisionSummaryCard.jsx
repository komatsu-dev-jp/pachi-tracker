// 記録モード iOS リデザイン（docs/design-review/pachi-ios-redesign.html）の
// 「判断に使う数字」「判断の理由」セクション。
//
// 表示専用コンポーネント。計算は一切行わず、既に算出済みの ev（calcPreciseEV の戻り値）と
// evDecision（純粋関数）の結果を読むだけ。logic.js / evDecision.js は変更していない。
import { font, mono, f, sp } from "../../constants";
import { evDecision } from "./evDecision";

// KeyMetrics と同じ参照順（上皿補正後 → 補正前）で値を取り出す。
// ここで新しい計算を挟まないこと（値の意味が変わるため）。
const pickRotation = (ev) => ev.effectiveStart1K ?? ev.start1KCorrected ?? ev.start1K ?? 0;
const pickBorderDiff = (ev) => ev.effectiveBDiff ?? ev.bDiffCorrected ?? ev.bDiff ?? 0;
const pickEvPerK = (ev) => ev.effectiveEV1K ?? ev.ev1KCorrected ?? ev.ev1K ?? 0;
const pickCashInvest = (ev) => Math.max(0, Number(ev.cashCostYen ?? ev.rawInvest) || 0);

const toneClass = (value) => (value > 0 ? "is-positive" : value < 0 ? "is-negative" : "");

function Metric({ label, value, unit, tone = "" }) {
  return (
    <div className="rec-ios-metric">
      <div className="rec-ios-metric__label">{label}</div>
      <div className={`rec-ios-metric__value ${tone}`.trim()} style={{ fontFamily: mono }}>
        {value}
        {value !== "—" && unit ? <small>{unit}</small> : null}
      </div>
    </div>
  );
}

// evDecision の根拠テキスト「EV/K +320円（基準 +100超え）」を
// 見出し（結論）と補足（内訳）の2段に割る。文言そのものは変更しない。
function splitReason(text) {
  const raw = String(text || "");
  const open = raw.indexOf("（");
  if (open < 0) return { head: raw, detail: "" };
  return {
    head: raw.slice(0, open).trim(),
    detail: raw.slice(open + 1).replace(/）\s*$/, "").trim(),
  };
}

export function DecisionSummaryCard({ ev }) {
  const safeEv = ev || {};
  const decision = evDecision(safeEv);
  const rotation = pickRotation(safeEv);
  const borderDiff = pickBorderDiff(safeEv);
  const evPerK = pickEvPerK(safeEv);
  const cashInvest = pickCashInvest(safeEv);
  const hasRotation = rotation > 0;

  return (
    <section className="rec-ios-decision" style={{ fontFamily: font }}>
      <div className="rec-ios-group">
        <span>判断に使う数字</span>
        <span>上皿補正ずみ</span>
      </div>
      <div className="rec-ios-metrics" aria-label="判断に使う数字">
        <Metric
          label="実測回転率"
          value={hasRotation ? f(rotation, 1) : "—"}
          unit="回/K"
          tone={hasRotation ? "is-accent" : ""}
        />
        <Metric
          label="ボーダー差"
          value={hasRotation ? sp(borderDiff, 1) : "—"}
          unit="回/K"
          tone={hasRotation ? toneClass(borderDiff) : ""}
        />
        <Metric
          label="期待値 / 1K"
          value={hasRotation ? sp(evPerK, 0) : "—"}
          unit="円"
          tone={hasRotation ? toneClass(evPerK) : ""}
        />
        <Metric
          label="現金投資"
          value={cashInvest > 0 ? f(cashInvest) : "—"}
          unit="円"
        />
      </div>

      <div className="rec-ios-group">
        <span>判断の理由</span>
        <span>{decision.reasons.length}件</span>
      </div>
      <div className="rec-ios-reasons" aria-label="判断の理由">
        {decision.reasons.map((reason, index) => {
          const { head, detail } = splitReason(reason.text);
          return (
            <div className="rec-ios-reason" key={`${head}-${index}`}>
              <div className={`rec-ios-reason__icon${reason.ok ? "" : " is-info"}`} aria-hidden="true">
                {reason.ok ? "✓" : "!"}
              </div>
              <div className="rec-ios-reason__copy">
                <strong>{head}</strong>
                {detail ? <span>{detail}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
