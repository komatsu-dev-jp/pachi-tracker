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
import { attachMachineNumbersToSlots, combineMachineNumberPages } from "./machineNumberOcr";
import {
  parseTaiDataText,
  buildOcrPrompt,
  assignNumbers,
  mergeTaiData,
  validateNumberAssignment,
  validateReviewedNumberAssignment,
  validateDeltaRows,
  isResolvedDeltaRow,
  isDeltaValueWithinConstraint,
  updateDeltaReview,
  islandToNumbers,
  buildSegmentsNumbers,
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
  const reports = [];
  const numberPages = [];
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
      const rawResults = Array.isArray(r.results) ? r.results : [];
      const numberOcr = rawResults.length
        ? attachMachineNumbersToSlots(id.data, img.width, img.height, rawResults)
        : { accepted: false, reasonCodes: ["empty-page"], numbers: [], slots: rawResults };
      const imageResults = numberOcr.slots.map((slot, panelIndex) => ({
        ...slot,
        source: {
          ...(slot?.source || {}),
          imageIndex: i,
          imageName: images[i].name || `画像${i + 1}`,
          panelIndex,
          row: slot?.row,
          column: slot?.column,
          imageWidth: img.width,
          imageHeight: img.height,
        },
      }));
      numberPages.push({ ...numberOcr, slots: imageResults });
      reports.push({
        imageIndex: i,
        name: images[i].name || `画像${i + 1}`,
        total: imageResults.length,
        readable: imageResults.filter((slot) => Number.isFinite(slot?.val) && slot?.status !== "failed").length,
        review: imageResults.filter((slot) => slot?.status === "review").length,
        missing: imageResults.filter((slot) => !Number.isFinite(slot?.val) || slot?.status === "failed").length,
        machineNumberOcrAccepted: numberOcr.accepted,
        machineNumberOcrAcceptedCount: numberOcr.recognizedCount || 0,
        machineNumbers: numberOcr.accepted ? numberOcr.numbers : [],
        machineNumberCandidates: numberOcr.candidates || [],
        machineNumberOcrReasons: numberOcr.reasonCodes || [],
        error: r.error || null,
      });
    } catch (error) {
      numberPages.push({ accepted: false, status: "failed", reasonCodes: ["image-error"], slots: [] });
      reports.push({
        imageIndex: i,
        name: images[i].name || `画像${i + 1}`,
        total: 0,
        readable: 0,
        review: 0,
        missing: 0,
        machineNumberOcrAccepted: false,
        machineNumberOcrAcceptedCount: 0,
        machineNumbers: [],
        machineNumberCandidates: [],
        machineNumberOcrReasons: ["image-error"],
        error: error instanceof Error ? error.message : "画像読み込み失敗",
      });
    }
  }
  const combinedNumbers = combineMachineNumberPages(numberPages);
  return {
    slots: combinedNumbers.slots,
    reports,
    numberOcr: combinedNumbers,
  };
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
        next[idx] = {
          dataUrl: e.target.result,
          name: file.name,
          id: `${file.name}:${file.size}:${file.lastModified}`,
        };
        loaded += 1;
        if (loaded === arr.length) {
          setImages((p) => {
            const known = new Set(p.map((item) => item.id || item.dataUrl));
            const additions = next.filter(Boolean).filter((item) => {
              const key = item.id || item.dataUrl;
              if (known.has(key)) return false;
              known.add(key);
              return true;
            });
            return [...p, ...additions];
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (i) => {
    setNoResult(false);
    setImages((p) => p.filter((_, j) => j !== i));
  };

  const moveImage = (from, to) => {
    if (to < 0 || to >= images.length || from === to) return;
    setNoResult(false);
    setImages((current) => {
      const nextImages = [...current];
      const [picked] = nextImages.splice(from, 1);
      nextImages.splice(to, 0, picked);
      return nextImages;
    });
  };

  const start = async () => {
    if (!images.length || busy) return;
    setBusy(true);
    setNoResult(false);
    setProgress({ i: 0, n: images.length });
    const analysis = await analyzeImages(images, (i, n) => setProgress({ i, n }));
    setBusy(false);
    if (!analysis.slots.length) {
      setNoResult(true);
      return;
    }
    onAnalyze(analysis);
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
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: "4px 2px 2px" }}>追加済みの画像</div>
            <div style={{ fontSize: 11, color: C.yellow, lineHeight: 1.5, margin: "0 2px 8px", fontWeight: 700 }}>
              台番号は画像内の表示から自動照合します。読めない画像は撮り直しになります
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {images.map((img, i) => (
                <div key={img.id || `${img.name}-${i}`} style={{ position: "relative", width: 96 }}>
                  <div style={{ position: "absolute", top: 5, left: 5, zIndex: 1, minWidth: 24, height: 24, borderRadius: 12, background: C.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>
                    {i + 1}
                  </div>
                  <img src={img.dataUrl} alt="" style={{ width: 96, height: 84, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}` }} />
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
                  <div title={img.name} style={{ fontSize: 10, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>
                    {img.name}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                    <button
                      className="b"
                      aria-label="この画像を前へ移動"
                      disabled={i === 0}
                      onClick={() => moveImage(i, i - 1)}
                      style={{ flex: 1, minWidth: TAP, minHeight: TAP, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: i === 0 ? C.sub : C.text, fontSize: 17 }}
                    >
                      ←
                    </button>
                    <button
                      className="b"
                      aria-label="この画像を後ろへ移動"
                      disabled={i === images.length - 1}
                      onClick={() => moveImage(i, i + 1)}
                      style={{ flex: 1, minWidth: TAP, minHeight: TAP, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: i === images.length - 1 ? C.sub : C.text, fontSize: 17 }}
                    >
                      →
                    </button>
                  </div>
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

function formatNumberRanges(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);
  if (!nums.length) return "未設定";
  const ranges = [];
  let start = nums[0];
  let previous = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const current = nums[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}〜${previous}`);
    start = current;
    previous = current;
  }
  return ranges.join(" ／ ");
}

// ════════════ 台番号割り当て ════════════
function NumbersStep({ slots, reports, numberOcr, islands, onConfirm, onBack }) {
  const slotCount = slots.length;
  const [pickedIslandId, setPickedIslandId] = useState(null);
  const [segments, setSegments] = useState([{ start: "", count: String(slotCount) }]);
  const [orderConfirmed, setOrderConfirmed] = useState(false);

  const pickedIsland = useMemo(
    () => (islands || []).find((isl) => isl.id === pickedIslandId) || null,
    [islands, pickedIslandId]
  );

  // 確定する台番号配列。島選択中は島番号、未選択時は手動区間。
  const manualNumbers = useMemo(() => {
    if (pickedIsland) return islandToNumbers(pickedIsland);
    return buildSegmentsNumbers(segments);
  }, [pickedIsland, segments]);
  const numbers = numberOcr?.accepted ? numberOcr.numbers : manualNumbers;

  const numberValidation = useMemo(
    () => validateNumberAssignment(slots, numbers),
    [slots, numbers]
  );
  const readableCount = slots.filter((slot) => Number.isFinite(slot?.val) && slot?.status !== "failed").length;
  const reviewCount = slots.filter((slot) => slot?.status === "review").length;
  const missingCount = slots.filter((slot) => !Number.isFinite(slot?.val) || slot?.status === "failed").length;
  const reportErrorCount = (Array.isArray(reports) ? reports : [])
    .filter((report) => report?.error || !Number(report?.total)).length;
  const recognizedNumberCount = numberOcr?.recognizedCount
    ?? slots.filter((slot) => slot?.machineNumberOcr?.accepted).length;
  const reviewedNumberAssignment = useMemo(
    () => validateReviewedNumberAssignment(slots, numbers),
    [slots, numbers],
  );
  const trustedOcrMismatches = reviewedNumberAssignment.mismatches;
  const duplicateOcrNumbers = numberOcr?.duplicateNumbers
    || numberOcr?.duplicateMachineNumbers
    || [];
  const hasOcrConflict = duplicateOcrNumbers.length > 0;

  const sourceAssignments = useMemo(() => {
    const list = Array.isArray(reports) ? reports : [];
    return list.map((report, index) => {
      const cursor = list
        .slice(0, index)
        .reduce((sum, item) => sum + (Number(item?.total) || 0), 0);
      const count = Number(report?.total) || 0;
      const assigned = report.machineNumberOcrAccepted
        ? report.machineNumbers
        : numbers.slice(cursor, cursor + count);
      return { ...report, assigned };
    });
  }, [reports, numbers]);

  const updateSeg = (idx, field, val) => {
    setPickedIslandId(null);
    setOrderConfirmed(false);
    setSegments((p) => { const n = [...p]; n[idx] = { ...n[idx], [field]: val }; return n; });
  };
  const addSeg = () => {
    setPickedIslandId(null);
    setOrderConfirmed(false);
    const used = segments.reduce((s, seg) => s + (parseInt(seg.count, 10) || 0), 0);
    const rem = slotCount - used;
    setSegments((p) => [...p, { start: "", count: rem > 0 ? String(rem) : "" }]);
  };
  const removeSeg = (idx) => {
    if (segments.length <= 1) return;
    setOrderConfirmed(false);
    setSegments((p) => p.filter((_, i) => i !== idx));
  };

  const valid = numberValidation.valid
    && (numberOcr?.accepted || orderConfirmed)
    && trustedOcrMismatches.length === 0
    && reportErrorCount === 0
    && !hasOcrConflict;

  return (
    <>
      <TopBar title="台番号の設定" onBack={onBack} />
      <div style={scrollAreaStyle}>
        <div style={{ fontSize: 14, color: C.subHi, margin: "4px 2px 12px", fontWeight: 600 }}>
          {numberOcr?.accepted
            ? `画像内の台番号を${slotCount}台すべて自動照合しました`
            : `検出された${slotCount}台に台番号を割り当てます`}
        </div>

        {numberOcr?.accepted && (
          <div style={{ background: "color-mix(in srgb, var(--green) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--green) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.green, fontWeight: 900, marginBottom: 4 }}>
              台番号OCR {numberOcr.numbers.length}/{slotCount}台 読み取り完了
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.6 }}>
              各グラフ直上の番号を直接読み、重複がないことを確認しました。画像の選択順には依存しません。
            </div>
          </div>
        )}

        {numberOcr && !numberOcr.accepted && (
          <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--yellow) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.yellow, fontWeight: 900, marginBottom: 4 }}>
              台番号OCRは一部のみ成功（{recognizedNumberCount}/{slotCount}台）
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.65, fontWeight: 700 }}>
              小さい文字を無理に推測しません。下の島または区間で番号を割り当て、画像ごとの範囲を確認してください。
              OCRで確実に読めた番号と1台でも矛盾する場合は確定できません。
            </div>
          </div>
        )}

        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: mono, fontWeight: 900, marginBottom: missingCount || reviewCount ? 8 : 0 }}>
              <span style={{ color: C.text }}>検出 {slotCount}台</span>
              <span style={{ color: C.green }}>読取 {readableCount}台</span>
              {missingCount > 0 && <span style={{ color: C.red }}>折れ線なし {missingCount}台</span>}
              {reviewCount > 0 && <span style={{ color: C.yellow }}>要確認 {reviewCount}台</span>}
            </div>
            {missingCount > 0 && (
              <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6, fontWeight: 700 }}>
                折れ線が画像に描かれていない台は0玉にしません。未読取のまま保持し、全台がそろうまで保存を止めます。
              </div>
            )}
          </div>
        </Card>

        {!numberOcr?.accepted && <>
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
                        {isl.start}〜{isl.end}（{cnt}台）
                      </div>
                    </div>
                    <button
                      className="b"
                      onClick={() => {
                        setPickedIslandId(picked ? null : isl.id);
                        setOrderConfirmed(false);
                      }}
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
                    <div style={{ fontSize: 11, color: C.red, marginTop: 6, fontWeight: 700 }}>
                      検出{slotCount}台に対し{cnt}台です。件数が一致しないため確定できません
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

        </>}

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

        {!numberValidation.valid && numbers.length > 0 && (
          <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6, fontWeight: 700, margin: "0 4px 12px" }}>
            {numberValidation.numberCount !== numberValidation.slotCount && `台番号は検出数と同じ${slotCount}台分が必要です。`}
            {numberValidation.invalidNumberIndices.length > 0 && " 台番号は数字だけで入力してください。"}
            {numberValidation.duplicateNumbers.length > 0 && ` 重複番号: ${numberValidation.duplicateNumbers.join(", ")}`}
          </div>
        )}

        {sourceAssignments.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "12px 14px 6px", fontSize: 14, fontWeight: 800, color: C.text }}>
              画像と台番号の対応
            </div>
            {sourceAssignments.map((report, index) => (
              <div key={`${report.imageIndex}-${report.name}`} style={{ padding: "8px 14px", borderTop: index ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: C.blue, fontFamily: mono, fontWeight: 900 }}>{index + 1}</span>
                  <span title={report.name} style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {report.name}
                  </span>
                  <span style={{ fontSize: 11, color: report.total ? C.subHi : C.yellow, fontFamily: mono }}>
                    {report.total ? `${report.total}台` : "グラフなし"}
                  </span>
                </div>
                {report.total > 0 && (
                  <div style={{ fontSize: 12, color: C.subHi, fontFamily: mono, marginTop: 4 }}>
                    台番号 {formatNumberRanges(report.assigned)} ・ グラフ {report.readable}/{report.total}
                    {!report.machineNumberOcrAccepted && ` ・ 番号OCR ${report.machineNumberOcrAcceptedCount || 0}/${report.total}`}
                  </div>
                )}
              </div>
            ))}
            <div style={{ padding: "8px 14px 12px", fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
              {numberOcr
                ? numberOcr.accepted
                  ? "各画像に表示された台番号で照合済みです。"
                  : "手動で割り当てた範囲を画像ごとに表示しています。番号が飛ぶ位置も確認してください。"
                : "順番が違う場合は、戻って画像の「←」「→」で並べ替えてください。"}
            </div>
          </Card>
        )}

        {reportErrorCount > 0 && (
          <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6, fontWeight: 700, margin: "0 4px 12px" }}>
            グラフを読めなかった画像が{reportErrorCount}枚あります。画像を戻って削除するか、グラフが表示された画像へ差し替えてください。
          </div>
        )}

        {hasOcrConflict && (
          <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6, fontWeight: 700, margin: "0 4px 12px" }}>
            同じ台番号を複数の画像で検出しました（{duplicateOcrNumbers.join(", ")}）。重複画像を外すまで確定できません。
          </div>
        )}

        {trustedOcrMismatches.length > 0 && (
          <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6, fontWeight: 700, margin: "0 4px 12px" }}>
            OCRで確実に読めた番号と手動設定が{trustedOcrMismatches.length}台で一致しません。
            {trustedOcrMismatches.slice(0, 4).map((item) => ` ${item.index + 1}台目: ${item.actual || "空欄"}→${item.expected}`).join("、")}
          </div>
        )}

        {!numberOcr?.accepted && <button
          className="b"
          type="button"
          onClick={() => setOrderConfirmed((current) => !current)}
          style={{
            width: "100%", minHeight: TAP, borderRadius: 12, marginBottom: 12,
            border: `1px solid ${orderConfirmed ? C.blue : C.borderHi}`,
            background: orderConfirmed ? "color-mix(in srgb, var(--blue) 12%, transparent)" : C.surface,
            color: orderConfirmed ? C.blue : C.text,
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            textAlign: "left", fontSize: 13, fontWeight: 800,
          }}
        >
          <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${orderConfirmed ? C.blue : C.borderHi}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {orderConfirmed ? "✓" : ""}
          </span>
          各画像のグラフと台番号の対応を1台ずつ確認しました
        </button>}
      </div>
      <BottomCta
        label="この台番号で確定"
        onClick={() => onConfirm(numbers, {
          manualVerified: !numberOcr?.accepted && orderConfirmed,
          trustedOcrMismatches,
        })}
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
function hasResolvedDelta(row) {
  return isResolvedDeltaRow(row);
}

function reviewReasonText(row) {
  const reasons = Array.isArray(row?.reasonCodes) ? row.reasonCodes : [];
  if (reasons.includes("endpoint-clipped-top")) {
    return "終点がグラフ上限で切れています。表示値よりプラス側へ大きい可能性があります。";
  }
  if (reasons.includes("endpoint-clipped-bottom")) {
    return "終点がグラフ下限で切れています。表示値よりマイナス側へ大きい可能性があります。";
  }
  if (reasons.includes("short-series")) {
    return "折れ線が短いため、終点位置を元画像と照らし合わせてください。";
  }
  if (reasons.includes("fallback-calibration")) {
    return "この枠だけ目盛りを十分に読めず、同じ画像の目盛りを参照しています。";
  }
  return "候補差玉と折れ線の終点を元画像で確認してください。";
}

function constraintText(row) {
  const constraint = row?.valueConstraint;
  if (!constraint || !Number.isFinite(Number(constraint.value))) return "";
  if (constraint.kind === "lower-bound") return `${sp(Number(constraint.value))}玉以上の入力が必要です`;
  if (constraint.kind === "upper-bound") return `${sp(Number(constraint.value))}玉以下の入力が必要です`;
  return "";
}

function GraphReviewPreview({ row, image }) {
  const bbox = row?.bbox;
  const imageWidth = Number(row?.source?.imageWidth);
  const imageHeight = Number(row?.source?.imageHeight);
  if (!image?.dataUrl || !bbox || ![bbox.x, bbox.y, bbox.width, bbox.height, imageWidth, imageHeight].every(Number.isFinite)) {
    return null;
  }
  const topPadding = Math.min(bbox.y, Math.max(18, Math.round(bbox.height * 0.24)));
  const cropX = Math.max(0, bbox.x);
  const cropY = Math.max(0, bbox.y - topPadding);
  const cropWidth = Math.min(imageWidth - cropX, bbox.width);
  const cropHeight = Math.min(imageHeight - cropY, bbox.height + topPadding);
  if (!(cropWidth > 0) || !(cropHeight > 0)) return null;

  return (
    <div style={{
      position: "relative", width: "100%", maxWidth: 340,
      aspectRatio: `${cropWidth} / ${cropHeight}`,
      overflow: "hidden", borderRadius: 10,
      border: `1px solid ${C.borderHi}`, background: "#fff",
    }}>
      <img
        src={image.dataUrl}
        alt={`台${row.num}の確認用グラフ`}
        style={{
          position: "absolute",
          width: `${(imageWidth / cropWidth) * 100}%`,
          maxWidth: "none",
          left: `${(-cropX / cropWidth) * 100}%`,
          top: `${(-cropY / cropHeight) * 100}%`,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </div>
  );
}

function ReviewValueEditor({ row, onUpdate }) {
  const [draft, setDraft] = useState(String(row?.val ?? ""));
  const normalized = draft.normalize("NFKC").replace(/[−‐‑‒–—―﹣]/g, "-").replace(/[,，\s]/g, "");
  const numericValid = /^[+-]?\d+$/.test(normalized) && Number.isSafeInteger(Number(normalized));
  const parsedValue = numericValid ? Number(normalized) : null;
  const constraintValid = numericValid && isDeltaValueWithinConstraint(row, parsedValue);
  const valid = numericValid && constraintValid;
  const commit = () => {
    if (!valid) return;
    const value = parsedValue;
    if (value !== Number(row?.val)) onUpdate({ value });
  };
  const reviewConfirmed = row?.reviewConfirmed === true
    && isDeltaValueWithinConstraint(row, row?.val);
  const toggleConfirmation = () => {
    if (reviewConfirmed) {
      onUpdate({ confirmed: false });
      return;
    }
    // 入力中の値と確認操作を同時に渡す。無効な下書きのときに、
    // ひとつ前の候補値だけを誤って確認済みにしないための保存ガード。
    if (valid) onUpdate({ value: parsedValue, confirmed: true });
  };
  return (
    <>
      <div style={{ flex: 1, minWidth: 132 }}>
        <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 4 }}>確認後の差玉</div>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={reviewConfirmed}
          aria-label={`台${row?.num}の確認後差玉`}
          aria-invalid={!valid}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          style={{
            width: "100%", minHeight: TAP, boxSizing: "border-box",
            borderRadius: 10, border: `1px solid ${valid ? C.borderHi : C.red}`,
            background: reviewConfirmed ? C.surface : C.surfaceHi,
            color: C.text, fontSize: 18, fontFamily: mono, fontWeight: 900,
            padding: "0 10px", opacity: reviewConfirmed ? 0.72 : 1,
          }}
        />
        {!valid && !reviewConfirmed && (
          <div role="alert" style={{ color: C.red, fontSize: 10, fontWeight: 800, marginTop: 4 }}>
            {numericValid ? constraintText(row) || "許可された範囲で入力してください" : "数字で入力してください"}
          </div>
        )}
      </div>
      <button
        className="b"
        type="button"
        role="checkbox"
        aria-checked={reviewConfirmed}
        disabled={!reviewConfirmed && !valid}
        onClick={toggleConfirmation}
        style={{
          flex: "1 1 170px", minHeight: TAP, borderRadius: 10,
          border: `1px solid ${reviewConfirmed ? C.green : valid ? C.yellow : C.border}`,
          background: reviewConfirmed ? "color-mix(in srgb, var(--green) 13%, transparent)" : "color-mix(in srgb, var(--yellow) 10%, transparent)",
          color: reviewConfirmed ? C.green : valid ? C.yellow : C.sub,
          fontSize: 12, fontWeight: 900, padding: "8px 10px",
          opacity: !reviewConfirmed && !valid ? 0.6 : 1,
        }}
      >
        {reviewConfirmed ? "✓ この値で確認済み" : "この値を目視確認して確定"}
      </button>
    </>
  );
}

function ResultsStep({ rows, images, machineName, onBack, onSave, onOpenImport, onUpdateReview, saved, customMachines }) {
  const [sortBy, setSortBy] = useState("delta");

  const rowValidation = useMemo(() => validateDeltaRows(rows), [rows]);
  const resolvedRows = useMemo(() => rows.filter(hasResolvedDelta), [rows]);
  const active = resolvedRows.filter((r) => r.val !== 0 || r.px > 10 || r.valueSource === "import");
  const avg = active.length ? Math.round(active.reduce((s, r) => s + Number(r.val), 0) / active.length) : 0;
  const plus = active.filter((r) => r.val > 0).length;
  const minus = active.filter((r) => r.val < 0).length;

  const distribution = useMemo(() => {
    const map = new Map();
    resolvedRows.forEach((r) => {
      const name = r.rank;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries()).map(([rank, count]) => ({ rank, count, tone: getRankTone(rank) }));
  }, [resolvedRows]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortBy === "delta") arr.sort((a, b) => {
      const aResolved = hasResolvedDelta(a);
      const bResolved = hasResolvedDelta(b);
      if (aResolved !== bResolved) return aResolved ? -1 : 1;
      return aResolved ? Number(b.val) - Number(a.val) : 0;
    });
    else arr.sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }));
    return arr;
  }, [rows, sortBy]);

  const predictionByNum = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (!hasResolvedDelta(row)) {
        map.set(String(row.num), { hasEstimate: false, reason: row?.status === "review" ? "差玉の確認待ち" : "差玉未読取" });
        continue;
      }
      map.set(String(row.num), buildRowDeltaEvidence(
        { ...row, machineName: row.machineName || machineName || "" },
        customMachines,
        machineDB,
      ));
    }
    return map;
  }, [rows, machineName, customMachines]);
  const predictedCount = Array.from(predictionByNum.values()).filter((item) => item.hasEstimate).length;
  const pendingReviewCount = rowValidation.pendingReviewIndices.length;
  const confirmedReviewCount = rowValidation.confirmedReviewIndices.length;
  const missingDeltaCount = rowValidation.missingIndices.length;
  const saveDisabled = saved || !rowValidation.valid;

  return (
    <>
      <TopBar
        title="解析結果"
        onBack={onBack}
        right={(
          <button
            className="b"
            onClick={saveDisabled ? undefined : onSave}
            disabled={saveDisabled}
            style={{
              minHeight: TAP, minWidth: 64, borderRadius: 12, padding: "0 14px",
              border: saved ? "none" : `1px solid ${rowValidation.valid ? C.blue : C.border}`,
              background: saved ? "color-mix(in srgb, var(--green) 16%, transparent)" : "transparent",
              color: saved ? C.green : rowValidation.valid ? C.blue : C.sub,
              fontSize: 14, fontWeight: 800,
            }}
          >
            {saved
              ? "保存済み ✓"
              : rowValidation.valid
                ? "保存"
                : pendingReviewCount > 0 && missingDeltaCount === 0
                  ? `確認待ち${pendingReviewCount}`
                  : "保存不可"}
          </button>
        )}
      />
      <div style={scrollAreaStyle}>
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
                <div key={d.rank} style={{ width: `${(d.count / Math.max(1, resolvedRows.length)) * 100}%`, background: d.tone.color }} />
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
              読取 {rowValidation.resolvedCount}/{rows.length}台 ・ 予測回転率 {predictedCount}台
              {confirmedReviewCount > 0 && ` ・ 目視確認済み ${confirmedReviewCount}台`}
            </div>
          </div>
        </Card>

        {!rowValidation.valid && (
          <div style={{
            background: pendingReviewCount > 0 && missingDeltaCount === 0
              ? "color-mix(in srgb, var(--yellow) 12%, transparent)"
              : "color-mix(in srgb, var(--red) 12%, transparent)",
            border: `1px solid color-mix(in srgb, ${pendingReviewCount > 0 && missingDeltaCount === 0 ? "var(--yellow)" : "var(--red)"} 38%, transparent)`,
            borderRadius: 14, padding: "12px 14px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 14, color: pendingReviewCount > 0 && missingDeltaCount === 0 ? C.yellow : C.red, fontWeight: 900, marginBottom: 5 }}>
              {pendingReviewCount > 0 && missingDeltaCount === 0
                ? `候補値を目視確認してください（残り${pendingReviewCount}台）`
                : "未解決のため保存できません"}
            </div>
            <div style={{ fontSize: 12, color: pendingReviewCount > 0 && missingDeltaCount === 0 ? C.subHi : C.red, lineHeight: 1.65, fontWeight: 700 }}>
              {pendingReviewCount > 0 && `候補差玉と元グラフを照合し、各カードの「この値で確認済み」をチェックしてください。`}
              {missingDeltaCount > 0 && ` 折れ線を読めない台が${missingDeltaCount}台あります。折れ線が表示された画像へ撮り直してください。`}
              {rowValidation.duplicateNumbers.length > 0 && ` 重複台番号: ${rowValidation.duplicateNumbers.join(", ")}`}
              {rowValidation.blankNumberIndices.length > 0 && " 台番号が空欄の行があります。"}
            </div>
          </div>
        )}

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
          const resolved = hasResolvedDelta(r);
          const isReview = r.status === "review";
          const reviewConfirmed = isReview && resolved && r.reviewConfirmed === true;
          const tone = resolved
            ? getRankTone(r.rank)
            : { color: isReview ? C.yellow : C.red, bg: isReview ? "color-mix(in srgb, var(--yellow) 14%, transparent)" : "color-mix(in srgb, var(--red) 12%, transparent)" };
          const hasTai = r.normalSpins != null && r.totalStarts != null;
          const prediction = predictionByNum.get(String(r.num));
          const predicted = prediction?.evidence;
          const sourceImage = Number.isInteger(r.source?.imageIndex)
            ? images?.[r.source.imageIndex]
            : null;
          const boundWarning = constraintText(r);
          return (
            <div key={`${r.num}-${r.source?.imageIndex ?? "x"}-${r.source?.panelIndex ?? i}`} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: "12px 14px", marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 12, flexShrink: 0,
                  background: tone.bg, border: `1px solid color-mix(in srgb, ${tone.color} 40%, transparent)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: resolved && !reviewConfirmed ? 20 : 11, fontWeight: 900, color: tone.color, fontFamily: mono, textAlign: "center", lineHeight: 1.25 }}>
                    {reviewConfirmed ? "確認済" : resolved ? r.rank : isReview ? "要確認" : "未読取"}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>台{r.num}</div>
                  <div style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.machineName || machineName || "—"}
                  </div>
                  {!resolved && !isReview && (
                    <div style={{ fontSize: 10, color: tone.color, marginTop: 3, fontWeight: 800, lineHeight: 1.45 }}>
                      元画像に折れ線が描画されていません
                      {Number.isInteger(r.source?.imageIndex) ? `（画像${r.source.imageIndex + 1}${Number.isInteger(r.source?.row) ? `・${r.source.row + 1}行目` : ""}）` : ""}
                    </div>
                  )}
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
                <div style={{ fontSize: resolved || isReview ? 21 : 15, fontWeight: 900, fontFamily: mono, color: resolved ? (r.val >= 0 ? C.green : C.red) : tone.color, flexShrink: 0, textAlign: "right" }}>
                  {resolved || isReview ? sp(r.val) : "—"}
                  {isReview && !reviewConfirmed && <div style={{ fontSize: 9, color: C.yellow, marginTop: 2 }}>候補値</div>}
                </div>
              </div>

              {isReview && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <GraphReviewPreview row={r} image={sourceImage} />
                  <div style={{ fontSize: 12, color: reviewConfirmed ? C.green : C.yellow, lineHeight: 1.6, fontWeight: 800, marginTop: 9 }}>
                    {reviewReasonText(r)}
                    {boundWarning && <div style={{ color: C.red }}>{boundWarning}</div>}
                    {Number.isInteger(r.source?.imageIndex) && (
                      <div style={{ color: C.subHi, fontWeight: 700 }}>
                        画像{r.source.imageIndex + 1}{Number.isInteger(r.source?.row) ? `・${r.source.row + 1}行目` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
                    <ReviewValueEditor
                      key={r.num}
                      row={r}
                      onUpdate={(update) => onUpdateReview?.(r.num, update)}
                    />
                  </div>
                </div>
              )}
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
          大当たり・回転数データを一括取り込み
        </button>
      </div>
    </>
  );
}

function parseEditableInteger(value) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[，,]/g, "")
    .trim();
  if (!/^-?\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function preparePdfRows(rows) {
  const valid = [];
  let invalidCount = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const num = parseEditableInteger(row?.num);
    const normalSpins = parseEditableInteger(row?.normalSpins);
    const totalStarts = parseEditableInteger(row?.totalStarts);
    if (num === null || normalSpins === null || totalStarts === null) {
      invalidCount += 1;
      continue;
    }
    const machineName = String(row?.machineName || "").trim();
    valid.push({
      ...row,
      num: String(num),
      machineName,
      island: machineName ? `${machineName}島` : "",
      normalSpins,
      totalStarts,
    });
  }
  return { rows: valid, invalidCount };
}

// ════════════ 台データ取り込み ════════════
function ImportStep({ store, rows: deltaRows, onBack, onMerge, aiApiKey, onChangeAiApiKey }) {
  const prompt = useMemo(
    () => buildOcrPrompt({ dateText: todaySlash(), storeName: store?.name || "" }),
    [store]
  );
  const promptHead = useMemo(() => prompt.split("\n").slice(0, 2).join("\n"), [prompt]);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");

  const pdfFileRef = useRef(null);
  const [pdfRows, setPdfRows] = useState([]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfSummary, setPdfSummary] = useState(null);
  const [pdfFilter, setPdfFilter] = useState("");
  const [showAllPdfRows, setShowAllPdfRows] = useState(false);

  const hasKey = typeof aiApiKey === "string" && aiApiKey.trim() !== "";
  const aiFileRef = useRef(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiOk, setAiOk] = useState(false);
  const [aiFileCount, setAiFileCount] = useState(0);
  // APIキー未設定時の導線展開、または設定済み時の変更フォーム表示。
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  // サイトセブンPDFは文字情報を持つため、外部APIへ送らずブラウザ内で読み取る。
  const handleLocalPdfFiles = async (files) => {
    const supported = Array.from(files || []).filter((file) =>
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );
    if (!supported.length || pdfBusy) return;

    setPdfBusy(true);
    setPdfError("");
    setPdfSummary(null);
    setPdfFilter("");
    setShowAllPdfRows(false);
    try {
      // PDF.jsはこの操作をした時だけ読み込み、通常画面の起動を重くしない。
      const { readSiteSevenPdf } = await import("./siteSevenPdfReader.js");
      const results = [];
      for (const file of supported) {
        const parsedPdf = await readSiteSevenPdf(file, {
          dateText: todaySlash(),
          storeName: store?.name || "",
        });
        results.push(parsedPdf);
      }

      const byNumber = new Map();
      let skippedCount = 0;
      let duplicateCount = 0;
      for (const result of results) {
        skippedCount += result.skipped.length;
        duplicateCount += result.duplicates.length;
        for (const row of result.rows) byNumber.set(String(row.num), row);
      }
      const nextRows = Array.from(byNumber.values());
      setPdfRows(nextRows);
      setPdfSummary({
        fileCount: supported.length,
        rowCount: nextRows.length,
        skippedCount,
        duplicateCount,
      });
    } catch (error) {
      setPdfRows([]);
      setPdfError(error instanceof Error ? error.message : "PDFの読み取りに失敗しました");
    } finally {
      setPdfBusy(false);
    }
  };

  const changePdfRow = (index, field, value) => {
    setPdfRows((current) => current.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    ));
  };

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
  const preparedPdf = useMemo(() => preparePdfRows(pdfRows), [pdfRows]);
  // PDFを基本にし、手動貼り付けまたはAI出力が同じ台番号にあれば後者を優先する。
  const importRows = useMemo(() => {
    const byNumber = new Map();
    for (const row of preparedPdf.rows) byNumber.set(String(row.num), row);
    for (const row of parsed.rows) byNumber.set(String(row.num), row);
    return Array.from(byNumber.values());
  }, [preparedPdf.rows, parsed.rows]);
  const recognized = importRows.length;
  const deltaNumberSet = useMemo(
    () => new Set((Array.isArray(deltaRows) ? deltaRows : []).map((row) => String(row.num))),
    [deltaRows]
  );
  const pdfMatchedCount = useMemo(
    () => preparedPdf.rows.filter((row) => deltaNumberSet.has(String(row.num))).length,
    [preparedPdf.rows, deltaNumberSet]
  );
  const pdfReviewEntries = useMemo(() => {
    const query = pdfFilter.trim().toLowerCase();
    const entries = pdfRows.map((row, index) => ({ row, index }));
    const matchingDelta = entries.filter(({ row }) => deltaNumberSet.has(String(row.num)));
    const base = matchingDelta.length ? matchingDelta : entries;
    if (query) {
      return entries.filter(({ row }) =>
        String(row.num).toLowerCase().includes(query) ||
        String(row.machineName || "").toLowerCase().includes(query)
      );
    }
    return showAllPdfRows ? base : base.slice(0, 12);
  }, [pdfRows, pdfFilter, showAllPdfRows, deltaNumberSet]);

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

        {/* サイトセブンPDFの端末内読み取り。個人版の主経路でAPIは不要。 */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                  サイトセブンPDFを読み取る
                </div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
                  PDFから台番号・機種名・通常中スタート・大当り回数を取得し、前画面の差玉と照合します
                </div>
              </div>
              <span style={{
                flexShrink: 0, borderRadius: 999, padding: "5px 8px",
                background: "color-mix(in srgb, var(--green) 14%, transparent)",
                border: `1px solid color-mix(in srgb, var(--green) 35%, transparent)`,
                color: C.green, fontSize: 10, fontWeight: 900,
              }}>
                API不要
              </span>
            </div>

            <div style={{
              marginTop: 10, padding: "9px 11px", borderRadius: 10,
              background: C.surfaceHi, border: `1px solid ${C.border}`,
              color: C.subHi, fontSize: 11, lineHeight: 1.6,
            }}>
              選んだPDFは外部へ送信せず、この端末の中だけで処理します。差玉画像は先に解析しておけば、最後のボタン1回で統合できます。
            </div>

            <input
              ref={pdfFileRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              style={{ display: "none" }}
              onChange={(e) => { handleLocalPdfFiles(e.target.files); e.target.value = ""; }}
            />
            <button
              className="b"
              onClick={pdfBusy ? undefined : () => pdfFileRef.current?.click()}
              disabled={pdfBusy}
              style={{
                width: "100%", minHeight: CTA, borderRadius: 12, marginTop: 12,
                border: "none", background: pdfBusy ? C.surfaceHi : C.blue,
                color: pdfBusy ? C.sub : "#fff", fontSize: 15, fontWeight: 900,
              }}
            >
              {pdfBusy ? "PDFを端末内で読み取り中…" : "大当たりPDFを選ぶ"}
            </button>

            {pdfSummary && (
              <div style={{
                background: "color-mix(in srgb, var(--green) 14%, transparent)",
                border: `1px solid color-mix(in srgb, var(--green) 35%, transparent)`,
                borderRadius: 10, padding: "10px 12px", marginTop: 10,
                fontSize: 13, color: C.green, fontWeight: 800, lineHeight: 1.6,
              }}>
                ✓ {pdfSummary.fileCount}ファイルから{pdfSummary.rowCount}台を読み取り
                {deltaNumberSet.size > 0 && `／差玉と${pdfMatchedCount}台一致`}
                {(pdfSummary.skippedCount > 0 || pdfSummary.duplicateCount > 0) && (
                  <div style={{ color: C.yellow, fontSize: 11, marginTop: 4 }}>
                    要確認：未認識{pdfSummary.skippedCount}行・重複{pdfSummary.duplicateCount}台
                  </div>
                )}
              </div>
            )}
            {pdfError && (
              <div style={{
                background: "color-mix(in srgb, var(--red) 12%, transparent)",
                border: `1px solid color-mix(in srgb, var(--red) 35%, transparent)`,
                borderRadius: 10, padding: "10px 12px", marginTop: 10,
                fontSize: 12, color: C.red, fontWeight: 700, lineHeight: 1.6,
              }}>
                ⚠ {pdfError}
              </div>
            )}
          </div>
        </Card>

        {/* PDF読み取り結果の修正。検索または全台表示で100台規模にも対応する。 */}
        {pdfRows.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.text }}>読み取り結果を確認・修正</div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                    間違いがあれば数字や機種名を直接直せます
                  </div>
                </div>
                <span style={{ color: C.green, fontSize: 12, fontWeight: 900 }}>{preparedPdf.rows.length}台</span>
              </div>

              <input
                value={pdfFilter}
                onChange={(e) => setPdfFilter(e.target.value)}
                placeholder="台番号・機種名で検索"
                style={{
                  width: "100%", minHeight: TAP, boxSizing: "border-box", marginTop: 10,
                  borderRadius: 10, border: `1px solid ${C.border}`,
                  background: C.surfaceHi, color: C.text, padding: "0 12px", fontSize: 13,
                }}
              />

              <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
                {pdfReviewEntries.map(({ row, index }) => (
                  <div key={`${index}-${row.num}`} style={{
                    padding: 10, borderRadius: 11, background: C.surfaceHi,
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: "grid", gridTemplateColumns: "82px minmax(0, 1fr)", gap: 8 }}>
                      <label style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>
                        台番号
                        <input
                          inputMode="numeric"
                          value={row.num}
                          onChange={(e) => changePdfRow(index, "num", e.target.value)}
                          style={{
                            width: "100%", height: 38, boxSizing: "border-box", marginTop: 3,
                            borderRadius: 8, border: `1px solid ${C.borderHi}`,
                            background: C.bg, color: C.text, padding: "0 8px", fontFamily: mono, fontWeight: 900,
                          }}
                        />
                      </label>
                      <label style={{ fontSize: 10, color: C.sub, fontWeight: 700, minWidth: 0 }}>
                        機種名
                        <input
                          value={row.machineName || ""}
                          onChange={(e) => changePdfRow(index, "machineName", e.target.value)}
                          style={{
                            width: "100%", height: 38, boxSizing: "border-box", marginTop: 3,
                            borderRadius: 8, border: `1px solid ${C.borderHi}`,
                            background: C.bg, color: C.text, padding: "0 8px", fontSize: 12,
                          }}
                        />
                      </label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <label style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>
                        通常中スタート
                        <input
                          inputMode="numeric"
                          value={row.normalSpins}
                          onChange={(e) => changePdfRow(index, "normalSpins", e.target.value)}
                          style={{
                            width: "100%", height: 38, boxSizing: "border-box", marginTop: 3,
                            borderRadius: 8, border: `1px solid ${C.borderHi}`,
                            background: C.bg, color: C.text, padding: "0 8px", fontFamily: mono, fontWeight: 800,
                          }}
                        />
                      </label>
                      <label style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>
                        大当り回数
                        <input
                          inputMode="numeric"
                          value={row.totalStarts}
                          onChange={(e) => changePdfRow(index, "totalStarts", e.target.value)}
                          style={{
                            width: "100%", height: 38, boxSizing: "border-box", marginTop: 3,
                            borderRadius: 8, border: `1px solid ${C.borderHi}`,
                            background: C.bg, color: C.text, padding: "0 8px", fontFamily: mono, fontWeight: 800,
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {!pdfFilter && (pdfMatchedCount || pdfRows.length) > 12 && (
                <button
                  className="b"
                  onClick={() => setShowAllPdfRows((current) => !current)}
                  style={{
                    width: "100%", minHeight: TAP, marginTop: 10, borderRadius: 10,
                    border: `1px solid ${C.border}`, background: "transparent",
                    color: C.subHi, fontSize: 12, fontWeight: 800,
                  }}
                >
                  {showAllPdfRows ? "先頭12台だけ表示" : `全${pdfMatchedCount || pdfRows.length}台を表示`}
                </button>
              )}
              {preparedPdf.invalidCount > 0 && (
                <div style={{ color: C.red, fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                  ⚠ 数字が空欄の{preparedPdf.invalidCount}台は統合されません
                </div>
              )}
            </div>
          </Card>
        )}

        <div style={{ fontSize: 11, color: C.sub, fontWeight: 800, margin: "18px 2px 8px" }}>
          PDFで読めない場合だけ使う補助機能
        </div>

        {/* AI読み取りカード（任意の補助経路） */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            {hasKey ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                  AI補助読み取り（任意）
                </div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                  画像だけの資料や通常と異なるPDFを読む時だけ使います。サイトセブンPDFには不要です
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
                  AI補助を使う（任意・APIキーが必要）
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

        {/* 手動補助ステップ1 */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <StepBadge n="1" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>外部AI用プロンプトをコピー</div>
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

        {/* 手動補助ステップ2 */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <StepBadge n="2" />
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>外部AIの出力を貼り付け</div>
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
              {importRows.slice(0, 3).map((r, i) => (
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
        label="PDFと差玉を台番号で統合する"
        onClick={() => onMerge(importRows)}
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
  const [slots, setSlots] = useState([]); // ピクセル解析の生スロット
  const [analysisReports, setAnalysisReports] = useState([]);
  const [analysisNumberOcr, setAnalysisNumberOcr] = useState(null);
  const [rows, setRows] = useState([]);   // 台番号割り当て後の結果行
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");

  // 結果の機種名: 取り込み済み行があればそれを優先表示
  const machineName = useMemo(() => {
    const withName = rows.find((r) => r.machineName);
    return withName?.machineName || "";
  }, [rows]);

  const handleAnalyzed = (analysis) => {
    const results = Array.isArray(analysis) ? analysis : (analysis?.slots || []);
    setSlots(results);
    setAnalysisReports(Array.isArray(analysis?.reports) ? analysis.reports : []);
    setAnalysisNumberOcr(analysis?.numberOcr || null);
    if (results.length > 0) setStep("numbers");
    // 0台のときは upload に留まる（やり直し可能）
  };

  const handleConfirmNumbers = (numbers, options = {}) => {
    const validation = validateNumberAssignment(slots, numbers);
    const reviewedNumberAssignment = validateReviewedNumberAssignment(slots, numbers);
    const hasImageError = analysisReports.some((report) => report?.error || !Number(report?.total));
    const hasOcrConflict = (
      analysisNumberOcr?.duplicateNumbers
      || analysisNumberOcr?.duplicateMachineNumbers
      || []
    ).length > 0;
    const ocrOrderMismatch = analysisNumberOcr?.accepted && slots.some((slot, index) => (
      String(slot?.machineNumber || "") !== String(numbers[index] || "")
    ));
    const numberSourceAccepted = analysisNumberOcr?.accepted
      || (options.manualVerified === true && reviewedNumberAssignment.mismatchIndices.length === 0);
    if (!numberSourceAccepted || !validation.valid || hasImageError || hasOcrConflict || ocrOrderMismatch) {
      setToast("検出台数と台番号を1台ずつ一致させてください");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setRows(assignNumbers(slots, numbers).map((row) => ({
      ...row,
      machineNumberSource: analysisNumberOcr?.accepted ? "ocr" : "manual-verified",
      machineNumberVerified: true,
    })));
    setSaved(false);
    setStep("results");
  };

  const handleSave = () => {
    const validation = validateDeltaRows(rows);
    if (!validation.valid) {
      setToast(`未読取または要確認が${validation.unresolvedCount}台あるため保存できません`);
      setTimeout(() => setToast(""), 3000);
      return;
    }
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

  const handleUpdateReview = (machineNumber, update = {}) => {
    setRows((current) => current.map((row) => (
      String(row?.num) === String(machineNumber)
        ? updateDeltaReview(row, {
          ...update,
          reviewedAt: update.confirmed === true ? new Date().toISOString() : undefined,
        })
        : row
    )));
    setSaved(false);
  };

  const handleMerge = (taiRows) => {
    const {
      rows: merged,
      matched,
      duplicateNumbers,
      invalidDeltaNumbers,
      conflictNumbers,
      unverifiedDeltaNumbers,
    } = mergeTaiData(rows, taiRows);
    setRows(merged);
    setSaved(false);
    setStep("results");
    const remaining = validateDeltaRows(merged).unresolvedCount;
    const warnings = [
      duplicateNumbers.length ? `重複 ${duplicateNumbers.length}台` : "",
      invalidDeltaNumbers.length ? `異常値 ${invalidDeltaNumbers.length}台` : "",
      conflictNumbers.length ? `グラフ値と不一致 ${conflictNumbers.length}台` : "",
      unverifiedDeltaNumbers.length ? `差玉は未確定 ${unverifiedDeltaNumbers.length}台` : "",
    ].filter(Boolean).join("・");
    setToast(`${matched}台に統合しました${remaining ? `（未解決 ${remaining}台${warnings ? `・${warnings}` : ""}）` : ""}`);
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
          setImages={(updater) => {
            setImages(updater);
            setSlots([]);
            setAnalysisReports([]);
            setAnalysisNumberOcr(null);
            setRows([]);
            setSaved(false);
          }}
          onAnalyze={handleAnalyzed}
          onClose={onClose}
        />
      )}
      {step === "numbers" && (
        <NumbersStep
          slots={slots}
          reports={analysisReports}
          numberOcr={analysisNumberOcr}
          islands={islands}
          onConfirm={handleConfirmNumbers}
          onBack={() => setStep("upload")}
        />
      )}
      {step === "results" && (
        <ResultsStep
          rows={rows}
          images={images}
          machineName={machineName}
          onBack={() => setStep("numbers")}
          onSave={handleSave}
          onOpenImport={() => setStep("import")}
          onUpdateReview={handleUpdateReview}
          saved={saved}
          customMachines={customMachines}
        />
      )}
      {step === "import" && (
        <ImportStep
          store={store}
          rows={rows}
          onBack={() => setStep("results")}
          onMerge={handleMerge}
          aiApiKey={aiApiKey}
          onChangeAiApiKey={onChangeAiApiKey}
        />
      )}
    </div>
  );
}
