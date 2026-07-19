// 差玉解析：フルスクリーンUI
//
// 出玉推移グラフ画像をピクセル解析（deltaEngine.runAnalysis）して各台の差玉ランクを判定し、
// 台番号をホールマップ／手動設定で割り当て、AI文字起こし（外部）との往復で台データを統合する。
// 画像解析は端末内で完結（外部送信なし）。logic.js・rotRows とは無関係の独立データ。
//
// ステップ: upload → numbers → results（results から import へ往復）
// props: { store, islands, onClose, onSaveScan }

import React, { useMemo, useRef, useState } from "react";
import { C, f, sp, font, mono, localDateStr } from "../../constants";
import { Card } from "../Atoms";
import { runAnalysis, getRankTone } from "./deltaEngine";
import {
  parseTaiDataText,
  buildOcrPrompt,
  assignNumbers,
  mergeTaiData,
  islandToNumbers,
  buildSegmentsNumbers,
  filterGraphSlots,
  makeScan,
} from "./deltaSelectors";
import { readTaiDataAttachments } from "./aiReader";
import { buildRowDeltaEvidence } from "./deltaEvidence";
import { machineDB } from "../../machineDB";

const TAP = 44; // 最小タップ領域
const CTA = 48; // 下部固定CTA高さ

function todayStr() {
  return localDateStr();
}
function todaySlash() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 画像 dataUrl → canvas → getImageData → runAnalysis（OCRは移植しない）。
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像読み込み失敗"));
    img.src = src;
  });
}

function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve({
      dataUrl: event.target.result,
      mediaType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : ""),
      name: file.name,
    });
    reader.onerror = () => reject(new Error("ファイル読み込み失敗"));
    reader.readAsDataURL(file);
  });
}

async function analyzeImages(images, onProgress) {
  const allResults = [];
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i + 1, images.length);
    try {
      const img = await loadImage(images[i].dataUrl);
      // 解析タイミングは移植元と同じく描画後に走らせる
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, img.width, img.height);
      const r = runAnalysis(id.data, img.width, img.height);
      if (!r.error) allResults.push(...r.results);
    } catch {
      // 読み込み失敗画像はスキップ（解析対象から外す）
    }
  }
  return allResults;
}

// ── 共通ヘッダー（戻る44px） ──
// DeltaMapView でも再利用するため export する（UI様式の単一化のみ・ロジック不変）。
export function TopBar({ title, onBack, right }) {
  return (
    <div style={{
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px",
    }}>
      <button
        className="b"
        onClick={onBack}
        aria-label="戻る"
        style={{
          minWidth: TAP, minHeight: TAP, borderRadius: 12,
          border: "none", background: "transparent",
          color: C.text, fontSize: 22, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ←
      </button>
      <div style={{ flex: 1, fontSize: 19, fontWeight: 800, color: C.text, fontFamily: font }}>
        {title}
      </div>
      {right}
    </div>
  );
}

// ── 下部固定CTA ──
function BottomCta({ label, onClick, disabled }) {
  return (
    <div style={{
      flexShrink: 0,
      padding: "10px 14px calc(12px + env(safe-area-inset-bottom))",
      background: `linear-gradient(180deg, transparent, ${C.bg} 30%)`,
    }}>
      <button
        className="b"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          width: "100%",
          minHeight: CTA,
          borderRadius: 14,
          border: "none",
          background: disabled ? C.surfaceHi : C.blue,
          color: disabled ? C.sub : "#fff",
          fontSize: 16,
          fontWeight: 900,
          fontFamily: font,
        }}
      >
        {label}
      </button>
    </div>
  );
}

const scrollAreaStyle = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  padding: "4px 14px 8px",
};

// ════════════ アップロード ════════════
function UploadStep({ store, images, setImages, onAnalyze, onClose }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ i: 0, n: 0 });
  const [noResult, setNoResult] = useState(false);

  const handleFiles = (files) => {
    const arr = Array.from(files || []).filter((fl) => fl.type.startsWith("image/"));
    if (!arr.length) return;
    setNoResult(false);
    let loaded = 0;
    const next = [];
    arr.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        next[idx] = { dataUrl: e.target.result, name: file.name };
        loaded += 1;
        if (loaded === arr.length) setImages((p) => [...p, ...next.filter(Boolean)]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (i) => {
    setNoResult(false);
    setImages((p) => p.filter((_, j) => j !== i));
  };

  const start = async () => {
    if (!images.length || busy) return;
    setBusy(true);
    setNoResult(false);
    setProgress({ i: 0, n: images.length });
    const results = await analyzeImages(images, (i, n) => setProgress({ i, n }));
    setBusy(false);
    // グラフ画素の無い誤検出だけだった場合も「検出できず」として扱う
    if (!results.length || !onAnalyze(results)) {
      setNoResult(true);
    }
  };

  return (
    <>
      <TopBar title="差玉解析" onBack={onClose} />
      <div style={scrollAreaStyle}>
        {/* 選択中店舗チップ */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
            <span style={{ fontSize: 18, color: C.blue }}>◎</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>選択中の店舗</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {store?.name || "未選択"}
              </div>
            </div>
          </div>
        </Card>

        {/* アップロードゾーン */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${C.borderHi}`,
            borderRadius: 16,
            padding: "36px 20px",
            textAlign: "center",
            cursor: "pointer",
            background: C.surface,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 40, color: C.blue, lineHeight: 1, marginBottom: 12 }}>▣</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 6 }}>
            出玉推移グラフの画像を追加
          </div>
          <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
            データカウンターのグラフ画面を撮影<br />（複数枚OK）
          </div>
        </div>

        {/* 追加済みサムネイル */}
        {images.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: "4px 2px 8px" }}>追加済みの画像</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={img.dataUrl} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}` }} />
                  <button
                    className="b"
                    aria-label="この画像を削除"
                    onClick={() => removeImage(i)}
                    style={{
                      position: "absolute", top: -8, right: -8,
                      minWidth: TAP, minHeight: TAP, borderRadius: "50%",
                      border: "none", background: "transparent",
                      color: C.red, fontSize: 20, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <span style={{ background: C.surface, borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.borderHi}`, fontSize: 13 }}>×</span>
                  </button>
                </div>
              ))}
              <button
                className="b"
                aria-label="画像を追加"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: 84, height: 84, borderRadius: 12,
                  border: `1px dashed ${C.borderHi}`, background: "transparent",
                  color: C.sub, fontSize: 28, fontWeight: 300,
                }}
              >
                +
              </button>
            </div>
          </>
        )}

        {/* 解析0台時のフィードバック */}
        {noResult && (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            background: "color-mix(in srgb, var(--red) 12%, transparent)",
            border: `1px solid color-mix(in srgb, var(--red) 35%, transparent)`,
            borderRadius: 12, padding: "12px 14px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 16, color: C.red }}>⚠</span>
            <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6, fontWeight: 700 }}>
              グラフを検出できませんでした。出玉推移グラフの画像か確認してください
            </div>
          </div>
        )}

        {/* 端末内解析の注記 */}
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start",
          background: C.surfaceHi, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "12px 14px",
        }}>
          <span style={{ fontSize: 16, color: C.sub }}>🔒</span>
          <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.6 }}>
            画像はこの端末内でのみ解析されます<br />
            <span style={{ color: C.sub }}>外部への送信は行いません</span>
          </div>
        </div>
      </div>
      <BottomCta
        label={busy ? `解析中… ${progress.i}/${progress.n}` : `解析する（${images.length}枚）`}
        onClick={start}
        disabled={!images.length || busy}
      />
    </>
  );
}

// ════════════ 台番号割り当て ════════════
function NumbersStep({ slotCount, skipped, islands, onConfirm, onBack }) {
  const [pickedIslandId, setPickedIslandId] = useState(null);
  const [segments, setSegments] = useState([{ start: "", count: String(slotCount) }]);

  const pickedIsland = useMemo(
    () => (islands || []).find((isl) => isl.id === pickedIslandId) || null,
    [islands, pickedIslandId]
  );

  // 確定する台番号配列。島選択中は島番号、未選択時は手動区間。
  const numbers = useMemo(() => {
    if (pickedIsland) return islandToNumbers(pickedIsland).slice(0, slotCount);
    return buildSegmentsNumbers(segments);
  }, [pickedIsland, segments, slotCount]);

  const updateSeg = (idx, field, val) => {
    setPickedIslandId(null);
    setSegments((p) => { const n = [...p]; n[idx] = { ...n[idx], [field]: val }; return n; });
  };
  const addSeg = () => {
    setPickedIslandId(null);
    const used = segments.reduce((s, seg) => s + (parseInt(seg.count, 10) || 0), 0);
    const rem = slotCount - used;
    setSegments((p) => [...p, { start: "", count: rem > 0 ? String(rem) : "" }]);
  };
  const removeSeg = (idx) => {
    if (segments.length <= 1) return;
    setSegments((p) => p.filter((_, i) => i !== idx));
  };

  // 島選択時は検出台数と異なってもよい（少ない方に合わせる）。手動設定時は従来どおり一致が必須。
  const valid = pickedIsland ? numbers.length > 0 : numbers.length === slotCount;

  return (
    <>
      <TopBar title="台番号の設定" onBack={onBack} />
      <div style={scrollAreaStyle}>
        <div style={{ fontSize: 14, color: C.subHi, margin: "4px 2px 12px", fontWeight: 600 }}>
          検出された{slotCount}台に台番号を割り当てます
        </div>
        {skipped > 0 && (
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            background: "color-mix(in srgb, var(--yellow) 10%, transparent)",
            border: `1px solid color-mix(in srgb, var(--yellow) 30%, transparent)`,
            borderRadius: 12, padding: "10px 12px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 14, color: C.yellow }}>ℹ</span>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.6 }}>
              グラフの無い検出<b style={{ color: C.yellow }}>{skipped}件</b>（画面の黒帯・空きマスなど）を除外しました。台番号のズレを防ぐための処理です。
            </div>
          </div>
        )}

        {/* ホールマップから選ぶ */}
        {islands && islands.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "12px 14px 4px", fontSize: 14, fontWeight: 800, color: C.text }}>
              登録済みのホールマップから選ぶ
            </div>
            {islands.map((isl) => {
              const cnt = islandToNumbers(isl).length;
              const picked = pickedIslandId === isl.id;
              const mismatch = cnt !== slotCount;
              return (
                <div key={isl.id} style={{ padding: "8px 12px" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    border: picked ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                    background: picked ? "color-mix(in srgb, var(--blue) 12%, transparent)" : C.surfaceHi,
                    borderRadius: 12, padding: "10px 12px",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                        {picked && <span style={{ color: C.blue, marginRight: 4 }}>✓</span>}
                        {isl.name}{isl.machineName ? ` ${isl.machineName}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: C.sub, fontFamily: mono, marginTop: 2 }}>
                        {isl.start}〜{isl.end}（{cnt}台{isl.ranges ? "・飛び番" : ""}）
                      </div>
                    </div>
                    <button
                      className="b"
                      onClick={() => setPickedIslandId(picked ? null : isl.id)}
                      style={{
                        minHeight: TAP, minWidth: 64, borderRadius: 10, padding: "0 14px",
                        border: picked ? "none" : `1px solid ${C.blue}`,
                        background: picked ? C.blue : "transparent",
                        color: picked ? "#fff" : C.blue,
                        fontSize: 13, fontWeight: 800,
                      }}
                    >
                      {picked ? "選択中" : "使う"}
                    </button>
                  </div>
                  {picked && mismatch && (
                    <div style={{ fontSize: 11, color: C.yellow, marginTop: 6, fontWeight: 700 }}>
                      検出{slotCount}台に対し{cnt}台分（少ない方に合わせます）
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ height: 6 }} />
          </Card>
        )}

        {/* または */}
        {islands && islands.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 6px 12px" }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 12, color: C.sub }}>または</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
        )}

        {/* 手動設定 */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "12px 14px 4px", fontSize: 14, fontWeight: 800, color: C.text }}>
            手動で設定
          </div>
          {segments.map((seg, i) => (
            <div key={i} style={{ padding: "8px 14px" }}>
              {segments.length > 1 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <button
                    className="b"
                    aria-label="この区間を削除"
                    onClick={() => removeSeg(i)}
                    style={{ minHeight: TAP, minWidth: TAP, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.red, fontSize: 13, fontWeight: 700 }}
                  >
                    区間削除
                  </button>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <SegInput label="開始番号" value={seg.start} onChange={(v) => updateSeg(i, "start", v)} ph="例: 901" />
                <SegInput label="連番台数" value={seg.count} onChange={(v) => updateSeg(i, "count", v)} ph="台数" />
              </div>
            </div>
          ))}
          <div style={{ padding: "4px 14px 14px" }}>
            <button
              className="b"
              onClick={addSeg}
              style={{
                width: "100%", minHeight: TAP, borderRadius: 12,
                border: `1px dashed ${C.borderHi}`, background: "transparent",
                color: C.subHi, fontSize: 13, fontWeight: 700,
              }}
            >
              ＋ 番号が飛ぶ区間を追加
            </button>
          </div>
        </Card>

        {/* プレビュー */}
        {numbers.length > 0 && (
          <div style={{ fontSize: 13, color: C.subHi, fontFamily: mono, lineHeight: 1.7, padding: "0 4px 8px", wordBreak: "break-all" }}>
            {numbers.map((n, i) => (
              <span key={i}>
                {i > 0 && numbers[i] !== String(parseInt(numbers[i - 1], 10) + 1)
                  ? <span style={{ color: C.blue, fontWeight: 800 }}> | </span>
                  : i > 0 ? ", " : ""}
                {n}
              </span>
            ))}
            <span style={{ color: C.sub }}>（{numbers.length}台）</span>
          </div>
        )}
      </div>
      <BottomCta
        label="この台番号で確定"
        onClick={() => onConfirm(numbers)}
        disabled={!valid}
      />
    </>
  );
}

function SegInput({ label, value, onChange, ph }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        placeholder={ph}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => { e.target.style.borderColor = C.blue; }}
        onBlur={(e) => { e.target.style.borderColor = C.borderHi; }}
        style={{
          width: "100%", minHeight: TAP, boxSizing: "border-box",
          background: C.surface, border: `1px solid ${C.borderHi}`,
          borderRadius: 12, color: C.text, fontFamily: mono,
          fontSize: 22, fontWeight: 800, textAlign: "center",
          padding: "8px 10px", outline: "none",
        }}
      />
    </div>
  );
}

// ════════════ 解析結果 ════════════
function ResultsStep({ rows, machineName, skipped, onBack, onSave, onOpenImport, saved, customMachines }) {
  const [sortBy, setSortBy] = useState("delta");

  // 割り当て確認用: 先頭・末尾の台番号（データサイトの先頭・末尾グラフと突き合わせる）
  const numRange = useMemo(() => {
    const nums = rows.map((r) => parseInt(r.num, 10)).filter(Number.isFinite);
    if (!nums.length) return null;
    return { first: Math.min(...nums), last: Math.max(...nums) };
  }, [rows]);

  const active = rows.filter((r) => r.val !== 0 || r.px > 10);
  const avg = active.length ? Math.round(active.reduce((s, r) => s + r.val, 0) / active.length) : 0;
  const plus = active.filter((r) => r.val > 0).length;
  const minus = active.filter((r) => r.val < 0).length;

  const distribution = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const name = r.rank;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries()).map(([rank, count]) => ({ rank, count, tone: getRankTone(rank) }));
  }, [rows]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortBy === "delta") arr.sort((a, b) => b.val - a.val);
    else arr.sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }));
    return arr;
  }, [rows, sortBy]);

  const predictionByNum = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      map.set(String(row.num), buildRowDeltaEvidence(
        { ...row, machineName: row.machineName || machineName || "" },
        customMachines,
        machineDB,
      ));
    }
    return map;
  }, [rows, machineName, customMachines]);
  const predictedCount = Array.from(predictionByNum.values()).filter((item) => item.hasEstimate).length;

  return (
    <>
      <TopBar
        title="解析結果"
        onBack={onBack}
        right={(
          <button
            className="b"
            onClick={saved ? undefined : onSave}
            disabled={saved}
            style={{
              minHeight: TAP, minWidth: 64, borderRadius: 12, padding: "0 14px",
              border: saved ? "none" : `1px solid ${C.blue}`,
              background: saved ? "color-mix(in srgb, var(--green) 16%, transparent)" : "transparent",
              color: saved ? C.green : C.blue,
              fontSize: 14, fontWeight: 800,
            }}
          >
            {saved ? "保存済み ✓" : "保存"}
          </button>
        )}
      />
      <div style={scrollAreaStyle}>
        {/* 割り当て確認の警告（誤検出を除外した場合のみ表示） */}
        {skipped > 0 && numRange && (
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            background: "color-mix(in srgb, var(--yellow) 10%, transparent)",
            border: `1px solid color-mix(in srgb, var(--yellow) 30%, transparent)`,
            borderRadius: 12, padding: "10px 12px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 14, color: C.yellow }}>⚠</span>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.6 }}>
              グラフの無い検出{skipped}件を除外して割り当てました。台番号順に並べ替え、
              先頭<b style={{ color: C.yellow, fontFamily: mono }}>{numRange.first}</b>・
              末尾<b style={{ color: C.yellow, fontFamily: mono }}>{numRange.last}</b>の差玉が
              実際のグラフと一致しているか確認してください。
            </div>
          </div>
        )}

        {/* サマリーカード */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
                {machineName || "解析結果"} ・ {rows.length}台
              </div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                <span style={{ color: C.green }}>勝{plus}</span> <span style={{ color: C.red }}>負{minus}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>平均</div>
            <div style={{ fontSize: 30, fontWeight: 900, fontFamily: mono, color: avg >= 0 ? C.green : C.red, lineHeight: 1.1, marginBottom: 12 }}>
              {sp(avg)}玉
            </div>
            {/* ランク分布の横帯バー */}
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
              {distribution.map((d) => (
                <div key={d.rank} style={{ width: `${(d.count / Math.max(1, rows.length)) * 100}%`, background: d.tone.color }} />
              ))}
            </div>
            {/* ランク×件数チップ */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {distribution.map((d) => (
                <div key={d.rank} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: d.tone.bg, border: `1px solid color-mix(in srgb, ${d.tone.color} 35%, transparent)`,
                  borderRadius: 8, padding: "4px 9px",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: d.tone.color, fontFamily: mono }}>{d.rank}</span>
                  <span style={{ fontSize: 11, color: C.sub }}>×{d.count}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: predictedCount > 0 ? C.green : C.sub, fontWeight: 700, marginTop: 10 }}>
              予測回転率を計算済み {predictedCount}/{rows.length}台
            </div>
          </div>
        </Card>

        {/* 並び替えトグル */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["delta", "差玉順"], ["number", "台番号順"]].map(([id, label]) => {
            const on = sortBy === id;
            return (
              <button
                key={id}
                className="b"
                onClick={() => setSortBy(id)}
                style={{
                  flex: 1, minHeight: TAP, borderRadius: 12,
                  border: on ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
                  background: on ? "color-mix(in srgb, var(--blue) 12%, transparent)" : C.surface,
                  color: on ? C.blue : C.sub,
                  fontSize: 14, fontWeight: 800,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 結果カードリスト */}
        {sorted.map((r, i) => {
          const tone = getRankTone(r.rank);
          const hasTai = r.normalSpins != null && r.totalStarts != null;
          const prediction = predictionByNum.get(String(r.num));
          const predicted = prediction?.evidence;
          return (
            <div key={`${r.num}-${i}`} style={{
              display: "flex", alignItems: "center", gap: 12,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: "12px 14px", marginBottom: 10,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, flexShrink: 0,
                background: tone.bg, border: `1px solid color-mix(in srgb, ${tone.color} 40%, transparent)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: tone.color, fontFamily: mono }}>{r.rank}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>台{r.num}</div>
                <div style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.machineName || machineName || "—"}
                </div>
                {hasTai && (
                  <div style={{ fontSize: 11, color: C.subHi, fontFamily: mono, marginTop: 2 }}>
                    回転数 {f(r.normalSpins)} / 当り {f(r.totalStarts)}回
                  </div>
                )}
                {predicted?.hasEstimate ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0 6px", fontSize: 11, color: C.green, fontFamily: mono, marginTop: 4, fontWeight: 800, lineHeight: 1.5 }}>
                    <span style={{ whiteSpace: "nowrap" }}>予測 {predicted.predictedRotation.toFixed(1)}回/K</span>
                    <span style={{ color: C.subHi, whiteSpace: "nowrap" }}>
                      差 {predicted.borderDifference >= 0 ? "+" : ""}{predicted.borderDifference.toFixed(1)} / 信頼度 {Math.round(predicted.confidence * 100)}%
                    </span>
                  </div>
                ) : hasTai ? (
                  <div style={{ fontSize: 10, color: C.yellow, marginTop: 4, fontWeight: 700 }}>
                    予測回転率: {prediction?.reason || "計算データ不足"}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: mono, color: r.val >= 0 ? C.green : C.red, flexShrink: 0 }}>
                {sp(r.val)}
              </div>
            </div>
          );
        })}

        {/* 台データ取り込み導線 */}
        <button
          className="b"
          onClick={onOpenImport}
          style={{
            width: "100%", minHeight: TAP + 4, borderRadius: 14,
            border: `1px solid ${C.borderHi}`, background: C.surfaceHi,
            color: C.text, fontSize: 14, fontWeight: 800, marginTop: 4, marginBottom: 12,
          }}
        >
          差玉・大当たりデータを一括取り込み
        </button>
      </div>
    </>
  );
}

// ════════════ 台データ取り込み ════════════
function ImportStep({ store, onBack, onMerge, aiApiKey, onChangeAiApiKey }) {
  const prompt = useMemo(
    () => buildOcrPrompt({ dateText: todaySlash(), storeName: store?.name || "" }),
    [store]
  );
  const promptHead = useMemo(() => prompt.split("\n").slice(0, 2).join("\n"), [prompt]);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");

  const hasKey = typeof aiApiKey === "string" && aiApiKey.trim() !== "";
  const aiFileRef = useRef(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiOk, setAiOk] = useState(false);
  const [aiFileCount, setAiFileCount] = useState(0);
  // APIキー未設定時の導線展開、または設定済み時の変更フォーム表示。
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  // 差玉画像と大当たり情報（画像/PDF）をまとめて読み込み、1回のAI処理へ渡す。
  const handleAiFiles = async (files) => {
    const supported = Array.from(files || []).filter((file) =>
      file.type.startsWith("image/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );
    if (!supported.length || aiBusy) return;
    setAiError("");
    setAiOk(false);
    setAiFileCount(supported.length);
    setAiBusy(true);
    try {
      const attachments = await Promise.all(supported.map((file) => fileToAttachment(file)));
      const result = await readTaiDataAttachments({ apiKey: aiApiKey, attachments, prompt });
      setAiBusy(false);
      if (result.ok) {
        setText(result.text);
        setAiOk(true);
        setTimeout(() => setAiOk(false), 4000);
      } else {
        setAiError(result.message || "読み取りに失敗しました");
      }
    } catch {
      setAiBusy(false);
      setAiError("画像またはPDFの読み込みに失敗しました");
    }
  };

  const saveKey = () => {
    if (typeof onChangeAiApiKey === "function") onChangeAiApiKey(keyInput.trim());
    setKeyInput("");
    setShowKeyForm(false);
  };
  const deleteKey = () => {
    // 「変更」の隣にあり誤タップで即消えると再設定の手間が大きいため確認を挟む。
    if (!window.confirm("APIキーを削除しますか？")) return;
    if (typeof onChangeAiApiKey === "function") onChangeAiApiKey("");
    setShowKeyForm(false);
  };
  // 設定済みキーのマスク表示（先頭7文字＋伏せ字）。
  const maskedKey = hasKey ? `${aiApiKey.trim().slice(0, 7)}••••` : "";

  const parsed = useMemo(() => parseTaiDataText(text), [text]);
  const recognized = parsed.rows.length;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード非対応環境では何もしない
    }
  };

  // スキップ理由を件数付きでまとめる
  const skipNote = useMemo(() => {
    if (!parsed.skipped.length) return null;
    const reasons = Array.from(new Set(parsed.skipped.map((s) => s.reason))).join("・");
    return `${parsed.skipped.length}行スキップ（${reasons}）`;
  }, [parsed.skipped]);

  return (
    <>
      <TopBar title="台データ取り込み" onBack={onBack} />
      <div style={scrollAreaStyle}>
        <div style={{ fontSize: 14, color: C.subHi, margin: "4px 2px 12px", fontWeight: 600 }}>
          差玉データと大当たり情報を台番号でまとめ、予測回転率まで計算します
        </div>

        {/* AI読み取りカード（APIキー設定者向け・ワンタップ自動化） */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            {hasKey ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                  AIでワンタップ読み取り
                </div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                  差玉画像と大当たり画像/PDFを同時に選ぶと、台番号ごとに一括統合します
                </div>
                <input
                  ref={aiFileRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => { handleAiFiles(e.target.files); e.target.value = ""; }}
                />
                <button
                  className="b"
                  onClick={aiBusy ? undefined : () => aiFileRef.current?.click()}
                  disabled={aiBusy}
                  style={{
                    width: "100%", minHeight: CTA, borderRadius: 12, marginTop: 12,
                    border: "none",
                    background: aiBusy ? C.surfaceHi : C.blue,
                    color: aiBusy ? C.sub : "#fff",
                    fontSize: 15, fontWeight: 900,
                  }}
                >
                  {aiBusy ? `読み取り中…（${aiFileCount}ファイル）` : "差玉＋大当たり資料をまとめて選ぶ"}
                </button>

                {aiOk && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "color-mix(in srgb, var(--green) 14%, transparent)",
                    border: `1px solid color-mix(in srgb, var(--green) 35%, transparent)`,
                    borderRadius: 10, padding: "10px 12px", marginTop: 10,
                    fontSize: 13, color: C.green, fontWeight: 800,
                  }}>
                    ✓ {aiFileCount}ファイルを読み取りました。内容を確認して統合してください
                  </div>
                )}
                {aiError && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    background: "color-mix(in srgb, var(--red) 12%, transparent)",
                    border: `1px solid color-mix(in srgb, var(--red) 35%, transparent)`,
                    borderRadius: 10, padding: "10px 12px", marginTop: 10,
                    fontSize: 13, color: C.red, fontWeight: 700, lineHeight: 1.6,
                  }}>
                    <span>⚠</span><span>{aiError}</span>
                  </div>
                )}

                {/* 送信先の注意書き（端末内解析と混同させない） */}
                <div style={{
                  background: "color-mix(in srgb, var(--yellow) 10%, transparent)",
                  border: `1px solid color-mix(in srgb, var(--yellow) 30%, transparent)`,
                  borderRadius: 10, padding: "10px 12px", marginTop: 10,
                  fontSize: 11, color: C.yellow, fontWeight: 700, lineHeight: 1.6,
                }}>
                  選んだ画像・PDFはAnthropic APIに送信されます（APIキーの利用料金が発生します）
                </div>

                {/* キー設定の変更/削除 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.sub, fontFamily: mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    APIキー {maskedKey}
                  </div>
                  <button
                    className="b"
                    onClick={() => { setShowKeyForm((v) => !v); setKeyInput(""); }}
                    style={{
                      minHeight: TAP, minWidth: 64, borderRadius: 10, padding: "0 12px",
                      border: `1px solid ${C.border}`, background: C.surfaceHi,
                      color: C.subHi, fontSize: 13, fontWeight: 800,
                    }}
                  >
                    変更
                  </button>
                  <button
                    className="b"
                    onClick={deleteKey}
                    style={{
                      minHeight: TAP, minWidth: 64, borderRadius: 10, padding: "0 12px",
                      border: `1px solid color-mix(in srgb, var(--red) 40%, transparent)`,
                      background: "transparent", color: C.red, fontSize: 13, fontWeight: 800,
                    }}
                  >
                    削除
                  </button>
                </div>
                {showKeyForm && (
                  <ApiKeyForm
                    value={keyInput}
                    onChange={setKeyInput}
                    onSave={saveKey}
                  />
                )}
              </>
            ) : (
              <>
                <button
                  className="b"
                  onClick={() => setShowKeyForm((v) => !v)}
                  style={{
                    width: "100%", minHeight: TAP, borderRadius: 12,
                    border: `1px dashed ${C.borderHi}`, background: "transparent",
                    color: C.subHi, fontSize: 14, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  <span style={{ color: C.blue }}>✦</span>
                  AIワンタップ読み取りを使う（APIキー設定）
                </button>
                {showKeyForm && (
                  <ApiKeyForm
                    value={keyInput}
                    onChange={setKeyInput}
                    onSave={saveKey}
                  />
                )}
              </>
            )}
          </div>
        </Card>

        {/* ステップ1 */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <StepBadge n="1" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>読み取りプロンプトをコピー</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>日付と店舗名は自動で埋め込み済み</div>
              </div>
            </div>
            <div style={{
              background: C.surfaceHi, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "12px 14px", marginBottom: 10,
            }}>
              <div style={{ fontSize: 13, color: C.subHi, fontFamily: mono, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                日付：{todaySlash()}{"　"}店舗名：{store?.name || "未選択"}
                {"\n"}
                <span style={{ color: C.sub }}>{promptHead.split("\n")[0]} …</span>
              </div>
            </div>
            <button
              className="b"
              onClick={copyPrompt}
              style={{
                width: "100%", minHeight: TAP, borderRadius: 12,
                border: `1px solid ${copied ? C.green : C.blue}`,
                background: copied ? "color-mix(in srgb, var(--green) 14%, transparent)" : "color-mix(in srgb, var(--blue) 10%, transparent)",
                color: copied ? C.green : C.blue,
                fontSize: 14, fontWeight: 800,
              }}
            >
              {copied ? "コピーしました ✓" : "プロンプトをコピー"}
            </button>
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center", marginTop: 10 }}>
              ChatGPT・Claude等に差玉資料と大当たり資料を一緒に添付
            </div>
          </div>
        </Card>

        {/* ステップ2 */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <StepBadge n="2" />
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>AIの出力を貼り付け</div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"2026/6/12\t店名\t島名\t機種名\t816\t-4500\t1239\t12"}
              style={{
                width: "100%", minHeight: 140, boxSizing: "border-box",
                background: C.surfaceHi, border: `1px solid ${C.border}`,
                borderRadius: 12, color: C.text, fontFamily: mono,
                fontSize: 13, padding: 12, resize: "vertical", outline: "none",
              }}
            />
          </div>
        </Card>

        {/* 認識プレビュー */}
        {recognized > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "14px" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.green, marginBottom: 10 }}>
                ✓ {recognized}台分を認識しました
              </div>
              <div style={{ display: "flex", fontSize: 11, color: C.sub, fontWeight: 700, padding: "0 2px 6px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ flex: 1 }}>台番号</span>
                <span style={{ flex: 1, textAlign: "right" }}>差玉</span>
                <span style={{ flex: 1, textAlign: "right" }}>回転数</span>
                <span style={{ flex: 1, textAlign: "right" }}>当り</span>
              </div>
              {parsed.rows.slice(0, 3).map((r, i) => (
                <div key={i} style={{ display: "flex", fontSize: 15, fontWeight: 800, color: C.text, fontFamily: mono, padding: "7px 2px" }}>
                  <span style={{ flex: 1 }}>{r.num}</span>
                  <span style={{ flex: 1, textAlign: "right", color: r.val == null ? C.sub : r.val >= 0 ? C.green : C.red }}>
                    {r.val == null ? "既存" : sp(r.val)}
                  </span>
                  <span style={{ flex: 1, textAlign: "right" }}>{f(r.normalSpins)}</span>
                  <span style={{ flex: 1, textAlign: "right" }}>{f(r.totalStarts)}</span>
                </div>
              ))}
              {recognized > 3 && (
                <div style={{ fontSize: 12, color: C.sub, padding: "4px 2px" }}>…他{recognized - 3}台</div>
              )}
              {skipNote && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "color-mix(in srgb, var(--yellow) 12%, transparent)",
                  border: `1px solid color-mix(in srgb, var(--yellow) 35%, transparent)`,
                  borderRadius: 10, padding: "10px 12px", marginTop: 10,
                  fontSize: 12, color: C.yellow, fontWeight: 700,
                }}>
                  ⚠ {skipNote}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
      <BottomCta
        label="差玉・大当たりを一度に統合する"
        onClick={() => onMerge(parsed.rows)}
        disabled={recognized === 0}
      />
    </>
  );
}

// ── APIキー設定フォーム（展開式・この端末のみ保存） ──
function ApiKeyForm({ value, onChange, onSave }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 6, fontWeight: 700 }}>APIキー</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          value={value}
          placeholder="sk-ant-…"
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => { e.target.style.borderColor = C.blue; }}
          onBlur={(e) => { e.target.style.borderColor = C.borderHi; }}
          style={{
            flex: 1, minWidth: 0, minHeight: TAP, boxSizing: "border-box",
            background: C.surfaceHi, border: `1px solid ${C.borderHi}`,
            borderRadius: 12, color: C.text, fontFamily: mono,
            fontSize: 14, padding: "8px 12px", outline: "none",
          }}
        />
        <button
          className="b"
          onClick={() => onSave()}
          disabled={value.trim() === ""}
          style={{
            minHeight: TAP, minWidth: 72, borderRadius: 12, padding: "0 16px",
            border: "none",
            background: value.trim() === "" ? C.surfaceHi : C.blue,
            color: value.trim() === "" ? C.sub : "#fff",
            fontSize: 14, fontWeight: 900,
          }}
        >
          保存
        </button>
      </div>
      <div style={{ fontSize: 11, color: C.sub, marginTop: 8, lineHeight: 1.6, fontWeight: 600 }}>
        APIキーはこの端末内（localStorage）にのみ保存されます。共有端末では設定しないでください
      </div>
    </div>
  );
}

function StepBadge({ n }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      border: `1px solid ${C.blue}`, color: C.blue,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 15, fontWeight: 900, fontFamily: mono,
    }}>
      {n}
    </div>
  );
}

// ════════════ ルート ════════════
export default function DeltaAnalyzer({ store, islands, onClose, onSaveScan, aiApiKey, onChangeAiApiKey, customMachines }) {
  const [step, setStep] = useState("upload");
  const [images, setImages] = useState([]);
  const [slots, setSlots] = useState([]); // グラフ画素のある解析スロット（誤検出は除外済み）
  const [skipped, setSkipped] = useState(0); // 除外した「グラフ無し」誤検出の件数
  const [rows, setRows] = useState([]);   // 台番号割り当て後の結果行
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");

  // 結果の機種名: 取り込み済み行があればそれを優先表示
  const machineName = useMemo(() => {
    const withName = rows.find((r) => r.machineName);
    return withName?.machineName || "";
  }, [rows]);

  const handleAnalyzed = (results) => {
    // 黒帯・空きマス由来の「グラフ無し」誤検出を除外してから割り当てへ進む
    //（除外しないと以降の台番号が全てズレる）。
    const { slots: graphSlots, skipped: skippedCount } = filterGraphSlots(results);
    setSlots(graphSlots);
    setSkipped(skippedCount);
    if (graphSlots.length > 0) {
      setStep("numbers");
      return true;
    }
    return false; // 0台のときは upload に留まる（やり直し可能）
  };

  const handleConfirmNumbers = (numbers) => {
    // 島の台数が検出台数より少ない場合は、スロットを先頭から numbers.length 件に切り詰めて割り当てる。
    const useSlots = numbers.length < slots.length ? slots.slice(0, numbers.length) : slots;
    setRows(assignNumbers(useSlots, numbers));
    setSaved(false);
    setStep("results");
  };

  const handleSave = () => {
    const scan = makeScan({
      storeId: store?.id ?? null,
      storeName: store?.name || "",
      date: todayStr(),
      machineName,
      rows,
    });
    onSaveScan?.(scan);
    setSaved(true);
  };

  const handleMerge = (taiRows) => {
    const { rows: merged, matched } = mergeTaiData(rows, taiRows);
    setRows(merged);
    setSaved(false);
    setStep("results");
    setToast(`${matched}台に統合しました`);
    setTimeout(() => setToast(""), 3000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 110, background: C.bg, display: "flex", flexDirection: "column", color: C.text, fontFamily: font }}>
      {toast && (
        <div style={{
          position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 60px)", left: "50%", transform: "translateX(-50%)",
          zIndex: 70, background: C.green, color: "#fff",
          padding: "10px 18px", borderRadius: 999, fontSize: 14, fontWeight: 800,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {toast}
        </div>
      )}

      {step === "upload" && (
        <UploadStep
          store={store}
          images={images}
          setImages={setImages}
          onAnalyze={handleAnalyzed}
          onClose={onClose}
        />
      )}
      {step === "numbers" && (
        <NumbersStep
          slotCount={slots.length}
          skipped={skipped}
          islands={islands}
          onConfirm={handleConfirmNumbers}
          onBack={() => setStep("upload")}
        />
      )}
      {step === "results" && (
        <ResultsStep
          rows={rows}
          machineName={machineName}
          skipped={skipped}
          onBack={() => setStep("numbers")}
          onSave={handleSave}
          onOpenImport={() => setStep("import")}
          saved={saved}
          customMachines={customMachines}
        />
      )}
      {step === "import" && (
        <ImportStep
          store={store}
          onBack={() => setStep("results")}
          onMerge={handleMerge}
          aiApiKey={aiApiKey}
          onChangeAiApiKey={onChangeAiApiKey}
        />
      )}
    </div>
  );
}
