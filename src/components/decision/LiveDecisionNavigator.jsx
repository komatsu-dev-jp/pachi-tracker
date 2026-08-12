import React, { useState } from "react";
import { LIVE_CHECKPOINTS_K, liveDecisionCheckpointText } from "./liveRotationDecision";
import "./LiveDecisionNavigator.css";

const ACTION_CLASS = {
  no_data: "neutral",
  collecting: "blue",
  stop_candidate: "orange",
  compare: "yellow",
  stop: "red",
  continue: "green",
  continue_strong: "green",
};

const format1 = (value) => Number(value || 0).toFixed(1);

// 判断カードの理由行アイコン。色だけに頼らず形でも状態が分かるようにする。
function ReasonIcon({ tone }) {
  const common = {
    viewBox: "0 0 24 24", width: 16, height: 16, fill: "none",
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (tone === "green") return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  if (tone === "red") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></svg>;
  if (tone === "orange" || tone === "yellow") return <svg {...common}><path d="M12 3.5 22 20H2Z" /><path d="M12 10v4M12 17h.01" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
}

export function LiveDecisionNavigator({ decision }) {
  const [open, setOpen] = useState(false);
  if (!decision) return null;
  const tone = ACTION_CLASS[decision.action] || "neutral";
  const probability = Math.round((decision.decisionProbability || 0) * 100);
  return (
    <section className={`live-decision is-${tone}`} aria-label="実戦中の見切りナビ">
      <div className="live-decision-head">
        <div className="live-decision-head-copy">
          <span className="live-decision-kicker">現在の判断 ・ 見切りナビ</span>
          <h2 className={String(decision.actionLabel || "").length >= 6 ? "is-long" : ""}>{decision.actionLabel}</h2>
          <p className="live-decision-now">
            <strong>{format1(decision.totalK)}K</strong>
            <span>{liveDecisionCheckpointText(decision)}</span>
          </p>
        </div>
        <div
          className="live-decision-conf"
          style={{ "--live-conf": `${probability}%` }}
          role="img"
          aria-label={`目標達成 ${probability}パーセント`}
        >
          <span>{probability}%</span>
          <small>目標達成</small>
        </div>
      </div>

      <div className="live-decision-progress" aria-label="3K、5K、10K、20Kの判断地点">
        {LIVE_CHECKPOINTS_K.map((checkpoint) => {
          const reached = decision.totalK >= checkpoint;
          const next = decision.nextCheckpointK === checkpoint;
          return <span key={checkpoint} className={`${reached ? "is-reached" : ""} ${next ? "is-next" : ""}`}>{checkpoint}K</span>;
        })}
      </div>

      <div className="live-decision-reason">
        <ReasonIcon tone={tone} />
        <p>{decision.reason}</p>
        <button type="button" className="live-decision-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? "閉じる" : "根拠 ›"}
        </button>
      </div>

      <div className="live-decision-metrics">
        <div><span>実測</span><strong>{format1(decision.observedRotation)}</strong><small>回/K</small></div>
        <div><span>目標</span><strong>{format1(decision.targetRotation)}</strong><small>回/K</small></div>
        <div><span>使用量</span><strong>{Math.round(decision.totalK * decision.rentBalls)}</strong><small>玉相当</small></div>
      </div>

      {open && (
        <div className="live-decision-detail">
          <dl>
            <div><dt>真のボーダー</dt><dd>{format1(decision.trueBorder)}回/K</dd></div>
            <div><dt>安全のための余裕</dt><dd>+{format1(decision.targetMargin)}回/K</dd></div>
            <div><dt>予想される範囲</dt><dd>{decision.totalK > 0 ? `${format1(decision.low90)}～${format1(decision.high90)}回/K` : "未計測"}</dd></div>
            <div><dt>過去データの重さ</dt><dd>{format1(decision.priorEquivalentK)}K相当（最大3K）</dd></div>
            <div><dt>回転率のムラ</dt><dd>{decision.totalK > 0 ? `${format1(decision.standardDeviationPerK)}回/K・${decision.standardDeviationSource === "machine" ? "機種入力値" : "安全側の自動値"}` : "記録開始後に計算"}</dd></div>
          </dl>
          <p><b>ベイズ</b>（少ないデータで早合点しない計算のこと）は、判断が迷う範囲だけ過去データを参考にします。</p>
          <p><b>10K</b>は本当の回転率が完全に分かる地点ではなく、お金を使いすぎないための判断期限です。</p>
        </div>
      )}
    </section>
  );
}
