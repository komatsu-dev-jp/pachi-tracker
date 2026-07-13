import React from "react";
import { C, font, mono } from "../../constants";
import { changeRoundMultiplier } from "./machineRoundOptions";

/**
 * 同じ大当たり内で10Rなどが複数回続いた実結果を入力する共通部品。
 * 機種固有設定が無い場合も1セットずつ増減できる。
 */
export default function RoundMultiplierControl({ rounds, mult, loop, onChange, color = C.purple }) {
  const roundsN = Number(rounds) || 0;
  if (roundsN <= 0) return null;

  const multN = Math.max(1, Number(mult) || 1);
  const loopBase = Math.max(1, Number(loop?.loopBaseMult) || 1);
  const loopActive = Boolean(loop) && multN >= loopBase;
  const step = loopActive ? Math.max(1, Number(loop.incrementMult) || 1) : 1;
  const payout = Number(loop?.incrementPayout) || 0;
  const decrement = () => onChange(changeRoundMultiplier(multN, -1, loop));
  const increment = () => onChange(changeRoundMultiplier(multN, 1, loop));

  return (
    <div style={{ marginTop: 8, padding: "9px 10px", borderRadius: 10, background: "var(--surface-hi)", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: font }}>同じ大当たり内のセット回数</div>
      <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: font }}>
        上乗せが続いた場合は、実際に獲得した回数へ合わせてください
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "54px 1fr 54px", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button className="b" type="button" onClick={decrement} disabled={multN <= 1}
          aria-label={`セット回数を${step}減らす`}
          style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--surface)", color: multN <= 1 ? C.sub : C.text, fontSize: 24, fontWeight: 800 }}>
          −
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ color, fontFamily: mono, fontSize: 21, fontWeight: 800 }}>{roundsN}R×{multN}</div>
          <div style={{ color: C.sub, fontFamily: font, fontSize: 10 }}>合計 {roundsN * multN}R</div>
        </div>
        <button className="b" type="button" onClick={increment}
          aria-label={`セット回数を${step}増やす`}
          style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 20%, var(--surface))`, color, fontSize: 24, fontWeight: 800 }}>
          ＋
        </button>
      </div>
      {loop && (
        <div style={{ marginTop: 7, fontSize: 10, color: loopActive ? color : C.sub, fontFamily: font, lineHeight: 1.45 }}>
          {loopActive
            ? `${loop.label || "上乗せループ"}: ＋1回で${roundsN}R×${step}${payout > 0 ? `（約${payout.toLocaleString()}玉）` : ""}`
            : `${loop.label || "上乗せループ"}は ${roundsN}R×${loopBase} から専用の上乗せ刻みになります`}
        </div>
      )}
    </div>
  );
}
