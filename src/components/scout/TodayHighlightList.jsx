import React from "react";
import { C, font } from "../../constants";

// 「本日の注目ポイント」箇条書きリスト
export default function TodayHighlightList({ items }) {
  if (!items || items.length === 0) {
    return (
      <div
        style={{
          padding: "20px 14px",
          color: C.sub,
          fontSize: 12,
          fontFamily: font,
          textAlign: "center",
        }}
      >
        本日の注目ポイントはありません
      </div>
    );
  }
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: "8px 14px 14px",
      }}
    >
      {items.map((text, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "8px 0",
            borderBottom: i === items.length - 1 ? "none" : `1px solid ${C.border}`,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: C.blue,
              marginTop: 8,
            }}
          />
          <span
            style={{
              flex: 1,
              fontSize: 13,
              color: C.text,
              fontFamily: font,
              lineHeight: 1.55,
            }}
          >
            {text}
          </span>
        </li>
      ))}
    </ul>
  );
}
