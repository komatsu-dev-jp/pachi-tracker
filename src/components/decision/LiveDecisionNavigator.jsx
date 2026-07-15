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

export function LiveDecisionNavigator({ decision }) {
  const [open, setOpen] = useState(false);
  if (!decision) return null;
  const tone = ACTION_CLASS[decision.action] || "neutral";
  const probability = Math.round((decision.decisionProbability || 0) * 100);
  return (
    <section className={`live-decision is-${tone}`} aria-label="実戦中の見切りナビ">
      <div className="live-decision-head">
        <div>
          <span className="live-decision-kicker">見切りナビ</span>
          <h2>{decision.actionLabel}</h2>
        </div>
        <span className="live-decision-prob">目標達成 {probability}%</span>
      </div>

      <div className="live-decision-progress" aria-label="3K、5K、10K、20Kの判断地点">
        {LIVE_CHECKPOINTS_K.map((checkpoint) => {
          const reached = decision.totalK >= checkpoint;
          const next = decision.nextCheckpointK === checkpoint;
          return <span key={checkpoint} className={`${reached ? "is-reached" : ""} ${next ? "is-next" : ""}`}>{checkpoint}K</span>;
        })}
      </div>

      <div className="live-decision-now">
        <strong>{format1(decision.totalK)}K</strong>
        <span>{liveDecisionCheckpointText(decision)}</span>
      </div>
      <p className="live-decision-reason">{decision.reason}</p>

      <div className="live-decision-metrics">
        <div><span>実測</span><strong>{format1(decision.observedRotation)}</strong><small>回/K</small></div>
        <div><span>目標</span><strong>{format1(decision.targetRotation)}</strong><small>回/K</small></div>
        <div><span>使用量</span><strong>{Math.round(decision.totalK * decision.rentBalls)}</strong><small>玉相当</small></div>
      </div>

      <button type="button" className="live-decision-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "計算の説明を閉じる" : "判断の根拠をやさしく見る"}
      </button>
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
