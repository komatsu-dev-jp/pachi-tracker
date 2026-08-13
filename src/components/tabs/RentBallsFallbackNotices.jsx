import React from "react";
import { C, font } from "../../constants";

export function N() {
  return <div role="alert" style={{ fontSize: 10, color: C.yellow, marginTop: 7, lineHeight: 1.5 }}>
    保存値が範囲外のため4円貸しで仮表示中です。設定から貸玉を手動で訂正してください。
  </div>;
}

export function E() {
  return <div role="alert" style={{ marginBottom: 10, color: C.yellow, fontSize: 11, lineHeight: 1.5 }}>
    保存値が範囲外のため250玉/千円で仮表示中です。店舗設定で訂正してください。
  </div>;
}

export function R({ onConfirm }) {
  return <div role="alert" style={{ padding: 10, marginBottom: 12, borderRadius: 10, background: `${C.yellow}22`, border: `1px solid ${C.yellow}`, color: C.text, fontSize: 12, lineHeight: 1.5 }}>
    <div style={{ marginBottom: 8 }}>保存値が範囲外のため4円貸しで仮表示中です。</div>
    <button type="button" className="b" onClick={onConfirm} style={{ width: "100%", minHeight: 44, borderRadius: 8, border: "none", background: C.blue, color: "#fff", fontWeight: 800, fontFamily: font }}>
      4円貸し（250玉/K）で確定
    </button>
  </div>;
}
