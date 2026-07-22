// 差玉解析：フルスクリーンUI
//
// 出玉推移グラフ画像をピクセル解析（deltaEngine.runAnalysis）して各台の差玉ランクを判定し、
// サイトセブン表とグラフを同時に端末内解析し、台番号を主証拠として1対1照合する。
// 信頼できる最高出玉が両側にある場合だけ、台番号を補う証拠として使用する。
// 読み切れない資料だけホールマップ／手動設定や任意のAI補助へ回す。
// 画像解析は端末内で完結（外部送信なし）。logic.js・rotRows とは無関係の独立データ。
//
// ステップ: upload（共同解析）→ numbers（照合確認）→ results（results から import へ往復）
// props: { store, islands, onClose, onSaveScan }

import React, { useEffect, useMemo, useRef, useState } from "react";
import { C, f, sp, font, mono, localDateStr } from "../../constants";
import { Card } from "../Atoms";
import { runAnalysis, getRankTone } from "./deltaEngine";
import { attachMachineNumbersToSlots, combineMachineNumberPages } from "./machineNumberOcr";
import { attachGraphPanelMetadata } from "./graphPanelMetadataOcr";
import { matchSiteSevenGraphPanels } from "./siteSevenJointMatcher";
import { resolveMatchedSiteSevenRows } from "./siteSevenJointResolution";
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
import {
  applySiteSevenMachineNameToRows,
  classifySiteSevenFile,
  applySiteSevenFieldEdit,
  mergeSiteSevenParsedResults,
  parseSiteSevenEditableInteger,
  prepareSiteSevenImportedRows,
  removeSiteSevenImportedRow,
  readSiteSevenCsv,
  setSiteSevenRowsReviewConfirmation,
} from "./siteSevenDataInput";
import { buildSiteSevenStructuredRows } from "./siteSevenStructuredRows";
import { buildStoreScopeExpectedNumbers } from "./siteSevenExpectedNumbers";
import {
  buildStoreMachineNumberRelation,
  compareConfirmedMachineNumbers,
} from "./storeMachineNumberRelation";
import { buildRowDeltaEvidence } from "./deltaEvidence";
import {
  attachClippedDeltaRanges,
  formatDeltaRange,
  isBoundedDeltaRow,
} from "./deltaBounded";
import { buildClippedDeltaSuggestion } from "./clippedDeltaSuggestion";
import {
  buildPartialMachineNumberAssignment,
  canAutoAcceptSiteSevenReports,
  createImageSelectionSnapshot,
  seedPartialMachineNumberInputs,
  shouldAcceptImageAnalysis,
  summarizeSiteSevenReviewState,
  trustedMachineNumberForSlot,
} from "./deltaWorkflowState";
import { machineDB } from "../../machineDB";
import MachinePickerSheet from "../machines/MachinePickerSheet";
import {
  overlayManualMachineSelections,
  propagateManualMachineSelections,
  relateRowsToStoreLayout,
} from "./storeLayoutRowRelation";

const TAP = 44; // 最小タップ領域
const CTA = 48; // 下部固定CTA高さ
const BULK_MACHINE_PICKER_INDEX = -1;
const ANALYSIS_ENGINE_VERSION = String(import.meta.env.VITE_BUILD_SHA || "dev").slice(0, 7);

function todayStr() {
  return localDateStr();
}
function todaySlash() {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function dateToSlash(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  return match ? `${match[1]}/${Number(match[2])}/${Number(match[3])}` : todaySlash();
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

async function analyzeImages(images, onProgress, {
  dateText = "",
  storeName = "",
  expectedNumbers = [],
  expectCompleteTable = false,
} = {}) {
  const reports = [];
  const numberPages = [];
  const siteSevenResults = [];
  const siteSevenReports = [];
  // 表の行順補正に使うのは、独立した店舗・島の管理番号だけに限定する。
  // グラフOCRを正解として注入すると、同じ誤読同士が一致する循環になる。
  const tableExpectation = {
    numbers: Array.isArray(expectedNumbers) ? expectedNumbers : [],
    source: Array.isArray(expectedNumbers) && expectedNumbers.length
      ? "store-scope"
      : "raw-ocr",
  };
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i + 1, images.length);
    const selectedFile = images[i]?.file;
    const selectedKind = images[i]?.kind || classifySiteSevenFile(selectedFile) || "image";
    if (selectedKind === "pdf" || selectedKind === "csv") {
      try {
        const parsed = selectedKind === "pdf"
          ? await import("./siteSevenPdfReader.js").then(({ readSiteSevenPdf }) => (
            readSiteSevenPdf(selectedFile, { dateText, storeName })
          ))
          : await readSiteSevenCsv(selectedFile, { dateText, storeName });
        const tableSourceIndex = siteSevenResults.length;
        const tableSourceId = images[i].id || `${images[i].name || selectedKind}:${i}`;
        const normalized = {
          ...parsed,
          rows: buildSiteSevenStructuredRows(parsed, {
            importKind: selectedKind,
            sourceIndex: tableSourceIndex,
            sourceId: tableSourceId,
          }),
        };
        const skippedCount = normalized.skipped?.length || 0;
        const duplicateCount = normalized.duplicates?.length || 0;
        siteSevenResults.push({ result: normalized, kind: selectedKind });
        siteSevenReports.push({
          imageIndex: i,
          name: images[i].name || `${selectedKind.toUpperCase()} ${i + 1}`,
          kind: selectedKind,
          rowCount: normalized.rows?.length || 0,
          reviewCount: normalized.rows?.filter((row) => row.reviewRequired && !row.reviewConfirmed).length || 0,
          skippedCount,
          duplicateCount,
          autoAcceptable: normalized.autoAcceptable !== false
            && skippedCount === 0
            && duplicateCount === 0,
          degradedImage: false,
          extractionMode: normalized.extractionMode || null,
          error: null,
        });
      } catch (error) {
        siteSevenReports.push({
          imageIndex: i,
          name: images[i].name || `${selectedKind.toUpperCase()} ${i + 1}`,
          kind: selectedKind,
          rowCount: 0,
          reviewCount: 0,
          skippedCount: 0,
          duplicateCount: 0,
          autoAcceptable: false,
          degradedImage: false,
          error: error instanceof Error ? error.message : `${selectedKind.toUpperCase()}の読み取りに失敗しました`,
        });
      }
      continue;
    }
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

      // 同じ選択欄へサイトセブンの表写真も入れられるよう、罫線構造で先に分類する。
      // 表とグラフのOCR自体は独立させ、誤読同士を正解扱いしない。
      const tableOcr = await import("./siteSevenImageOcr.js");
      let tableStructure = null;
      try {
        tableStructure = tableOcr.inspectSiteSevenTableStructure(id);
      } catch {
        tableStructure = null;
      }
      if (tableStructure) {
        try {
          // すでにデコードしたImageDataをworkerへ渡し、同じ写真を二重に
          // デコードしたり全ファイル分のRGBAを保持したりしない。
          const parsedTable = await tableOcr.readSiteSevenImageData(id, {
            dateText,
            storeName,
            fileName: images[i].name || `画像${i + 1}`,
            expectedNumbers: tableExpectation.numbers,
            allowRawMachineNumbers: tableExpectation.numbers.length === 0,
          });
          const tableSourceIndex = siteSevenResults.length;
          const tableSourceId = images[i].id || `${images[i].name || "table"}:${i}`;
          const annotatedTable = {
            ...parsedTable,
            rows: (parsedTable.rows || []).map((row, rowIndex) => ({
              ...row,
              sourceIndex: tableSourceIndex,
              rowIndex: Number.isInteger(row.sourceLine) ? row.sourceLine - 1 : rowIndex,
              rowId: `${tableSourceId}:${Number.isInteger(row.sourceLine) ? row.sourceLine : rowIndex + 1}`,
            })),
          };
          const fieldReviewCount = parsedTable.skipped?.length || 0;
          const duplicateCount = parsedTable.duplicates?.length || 0;
          siteSevenResults.push({ result: annotatedTable, kind: "image" });
          siteSevenReports.push({
            imageIndex: i,
            name: images[i].name || `画像${i + 1}`,
            kind: "image",
            rowCount: parsedTable.rows?.length || 0,
            reviewCount: parsedTable.rows?.filter((row) => row.reviewRequired && !row.reviewConfirmed).length || 0,
            skippedCount: 0,
            fieldReviewCount,
            duplicateCount,
            machineNumberMode: parsedTable.machineNumberMode,
            expectedNumberSource: tableExpectation.source,
            machineNumberAccuracy: parsedTable.machineNumberAccuracy,
            autoAcceptable: parsedTable.degradedImage !== true
              && duplicateCount === 0,
            degradedImage: parsedTable.degradedImage === true,
            error: null,
          });
        } catch (error) {
          siteSevenReports.push({
            imageIndex: i,
            name: images[i].name || `画像${i + 1}`,
            kind: "image",
            rowCount: 0,
            reviewCount: 0,
            skippedCount: 0,
            duplicateCount: 0,
            expectedNumberSource: tableExpectation.source,
            autoAcceptable: false,
            degradedImage: false,
            error: error instanceof Error ? error.message : "台データ画像の読み取りに失敗しました",
          });
        }
        continue;
      }

      const r = runAnalysis(id.data, img.width, img.height);
      const rawResults = Array.isArray(r.results) ? r.results : [];
      const metadataResults = rawResults.length
        ? attachGraphPanelMetadata(id.data, img.width, img.height, rawResults)
        : rawResults;
      const numberOcr = metadataResults.length
        ? attachMachineNumbersToSlots(id.data, img.width, img.height, metadataResults)
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
  const mergeExpectedNumbers = expectCompleteTable
    ? tableExpectation.numbers
    : combinedNumbers.accepted
      ? combinedNumbers.numbers
      : [];
  const siteSeven = siteSevenResults.length
    ? mergeSiteSevenParsedResults(siteSevenResults, { expectedNumbers: mergeExpectedNumbers })
    : { rows: [], recognizedCount: 0, reviewCount: 0, duplicateCount: 0, missingNumbers: [] };
  // 別資料で値が完全一致した同じ台は1件へ畳む。値の競合・元資料内の重複は
  // reviewRequiredのまま残し、matcher側では固定点として使わない。
  const relationSiteSevenRows = siteSeven.rows || [];
  const jointGraphPanels = combinedNumbers.slots.map((slot, graphIndex) => ({
    ...slot,
    panelId: `${slot?.source?.imageIndex ?? "x"}:${slot?.source?.panelIndex ?? graphIndex}`,
    observedNumCandidate: slot?.machineNumberCandidate ?? slot?.machineNumberOcr?.candidate ?? null,
    machineNumberAccepted: slot?.machineNumberOcr?.accepted === true,
    pageIndex: slot?.source?.imageIndex ?? 0,
    rowIndex: slot?.source?.row ?? slot?.row ?? graphIndex,
    colIndex: slot?.source?.column ?? slot?.column ?? 0,
  }));
  const jointMatch = jointGraphPanels.length && relationSiteSevenRows.length
    ? matchSiteSevenGraphPanels(jointGraphPanels, relationSiteSevenRows)
    : null;
  const jointNumberByGraphIndex = new Map(
    (jointMatch?.matches || []).map((match) => [match.graphIndex, match]),
  );
  const jointNumbers = jointGraphPanels.map((_, graphIndex) => (
    jointNumberByGraphIndex.get(graphIndex)?.resolvedNum || ""
  ));
  const jointAccepted = Boolean(jointMatch)
    && jointMatch.summary?.matchedCount === jointGraphPanels.length
    && jointMatch.summary?.unmatchedGraphCount === 0
    && jointMatch.summary?.unmatchedRowCount === 0
    && (jointMatch.reviewReasons?.length || 0) === 0
    && canAutoAcceptSiteSevenReports(siteSevenReports)
    && jointNumbers.every(Boolean)
    && new Set(jointNumbers).size === jointNumbers.length;
  const resolvedSlots = combinedNumbers.slots.map((slot, graphIndex) => {
    const match = jointNumberByGraphIndex.get(graphIndex);
    if (!match) return slot;
    return {
      ...slot,
      // matcherが1対1で確定した固定点は、全体が未完でもそのslotに保持する。
      // 後続画面ではこの値を編集不可にし、未解決slotだけ利用者に確認してもらう。
      machineNumber: match.resolvedNum,
      jointMatch: {
        rowId: match.rowId,
        resolvedNum: match.resolvedNum,
        matchedBy: match.matchedBy,
        maxPayout: match.maxPayout,
        accepted: true,
      },
    };
  });
  const resolvedNumberOcr = jointAccepted
    ? {
      ...combinedNumbers,
      accepted: true,
      status: "ok",
      source: "joint-site-seven",
      reasonCodes: [],
      slots: resolvedSlots,
      candidates: jointNumbers,
      numbers: jointNumbers,
      recognizedCount: jointNumbers.length,
      unresolvedIndices: [],
      duplicateNumbers: [],
      duplicateMachineNumbers: [],
    }
    : jointMatch
      ? {
        ...combinedNumbers,
        accepted: false,
        status: "review",
        source: "joint-partial",
        reasonCodes: [...new Set([
          ...(combinedNumbers.reasonCodes || []),
          "joint-match-incomplete",
        ])],
        slots: resolvedSlots,
        numbers: jointNumbers,
        recognizedCount: Math.max(
          combinedNumbers.recognizedCount || 0,
          jointMatch.summary?.matchedCount || 0,
        ),
      }
      : combinedNumbers;
  const resolvedSiteSevenRows = resolveMatchedSiteSevenRows(
    relationSiteSevenRows,
    jointMatch?.matches || [],
  );
  return {
    slots: resolvedSlots,
    reports,
    numberOcr: resolvedNumberOcr,
    jointMatch,
    siteSevenRows: resolvedSiteSevenRows,
    siteSevenSummary: {
      fileCount: siteSevenResults.length,
      rowCount: siteSeven.recognizedCount || 0,
      reviewCount: resolvedSiteSevenRows.filter((row) => row.reviewRequired && !row.reviewConfirmed).length,
      skippedCount: resolvedSiteSevenRows.filter((row) => row.reviewRequired && !row.reviewConfirmed).length,
      duplicateCount: siteSeven.duplicateCount || 0,
      missingCount: siteSeven.missingNumbers?.length || 0,
      pdfCount: siteSevenResults.filter((entry) => entry.kind === "pdf").length,
      csvCount: siteSevenResults.filter((entry) => entry.kind === "csv").length,
      imageCount: siteSevenResults.filter((entry) => entry.kind === "image").length,
      degradedImageCount: siteSevenReports.filter((report) => report.degradedImage).length,
      failedFileCount: siteSevenReports.filter((report) => report.error).length,
      unsafeFileCount: siteSevenReports.filter((report) => (
        !report.error && report.autoAcceptable === false
      )).length,
      reports: siteSevenReports,
    },
  };
}

// ── 共通ヘッダー（戻る44px） ──
// DeltaMapView でも再利用するため export する（UI様式の単一化のみ・ロジック不変）。
export function TopBar({ title, onBack, right, backDisabled = false }) {
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
        disabled={backDisabled}
        aria-label="戻る"
        style={{
          minWidth: TAP, minHeight: TAP, borderRadius: 12,
          border: "none", background: "transparent",
          color: C.text, fontSize: 22, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: backDisabled ? 0.4 : 1,
          cursor: backDisabled ? "not-allowed" : "pointer",
        }}
      >
        ←
      </button>
      <div style={{ flex: 1, minWidth: 0, fontFamily: font }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>{title}</div>
        <div
          data-testid="analysis-engine-version"
          style={{ color: C.sub, fontSize: 9, fontFamily: mono, fontWeight: 700, marginTop: 1 }}
        >
          解析エンジン {ANALYSIS_ENGINE_VERSION}
        </div>
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
function UploadStep({
  store,
  islands,
  islandScopeId,
  onChangeIslandScope,
  images,
  setImages,
  analysisDate,
  setAnalysisDate,
  onAnalyze,
  onClose,
}) {
  const fileRef = useRef(null);
  const analysisRequestIdRef = useRef(0);
  const imagesRef = useRef(images);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const fileLoadRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [progress, setProgress] = useState({ i: 0, n: 0 });
  const [noResult, setNoResult] = useState(false);
  const expectedTableNumbers = useMemo(
    () => buildStoreScopeExpectedNumbers(islands, islandScopeId),
    [islands, islandScopeId],
  );

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      analysisRequestIdRef.current += 1;
    };
  }, []);

  const interactionLocked = busy || loadingFiles;

  const handleFiles = (files) => {
    if (busyRef.current || fileLoadRef.current) return;
    const arr = Array.from(files || [])
      .map((file) => ({ file, kind: classifySiteSevenFile(file) }))
      .filter((entry) => entry.kind);
    if (!arr.length) return;
    fileLoadRef.current = true;
    setLoadingFiles(true);
    setNoResult(false);
    let loaded = 0;
    const next = [];
    const finishFile = () => {
      loaded += 1;
      if (loaded !== arr.length || !mountedRef.current) return;
      fileLoadRef.current = false;
      setLoadingFiles(false);
      analysisRequestIdRef.current += 1;
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
    };
    arr.forEach(({ file, kind }, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        next[idx] = {
          dataUrl: e.target.result,
          name: file.name,
          id: `${file.name}:${file.size}:${file.lastModified}`,
          file,
          kind,
        };
        finishFile();
      };
      reader.onerror = finishFile;
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (i) => {
    if (busyRef.current || fileLoadRef.current) return;
    analysisRequestIdRef.current += 1;
    setNoResult(false);
    setImages((p) => p.filter((_, j) => j !== i));
  };

  const moveImage = (from, to) => {
    if (busyRef.current || fileLoadRef.current) return;
    if (to < 0 || to >= images.length || from === to) return;
    analysisRequestIdRef.current += 1;
    setNoResult(false);
    setImages((current) => {
      const nextImages = [...current];
      const [picked] = nextImages.splice(from, 1);
      nextImages.splice(to, 0, picked);
      return nextImages;
    });
  };

  const start = async () => {
    if (!images.length || busyRef.current || fileLoadRef.current) return;
    const requestId = ++analysisRequestIdRef.current;
    const analysisImages = [...images];
    const selectionSnapshot = createImageSelectionSnapshot(analysisImages);
    busyRef.current = true;
    setBusy(true);
    setNoResult(false);
    setProgress({ i: 0, n: analysisImages.length });
    let analysis;
    try {
      analysis = await analyzeImages(analysisImages, (i, n) => {
        if (requestId === analysisRequestIdRef.current && mountedRef.current) {
          setProgress({ i, n });
        }
      }, {
        dateText: dateToSlash(analysisDate),
        storeName: store?.name || "",
        expectedNumbers: expectedTableNumbers,
        // 特定の島を選んだ時だけ、一覧の全台が資料にある前提で不足行を補う。
        // 「店舗全体」は一部の島だけを撮った資料も許容する。
        expectCompleteTable: islandScopeId !== "all",
      });
    } catch {
      if (requestId === analysisRequestIdRef.current && mountedRef.current) {
        busyRef.current = false;
        setBusy(false);
        setNoResult(true);
      }
      return;
    }
    if (!mountedRef.current || requestId !== analysisRequestIdRef.current) return;
    busyRef.current = false;
    setBusy(false);
    if (!shouldAcceptImageAnalysis({
      requestId,
      activeRequestId: analysisRequestIdRef.current,
      selectionSnapshot,
      currentImages: imagesRef.current,
    })) return;
    if (!analysis.slots.length) {
      setNoResult(true);
      return;
    }
    onAnalyze(analysis);
  };

  return (
    <>
      <TopBar title="差玉解析" onBack={onClose} backDisabled={interactionLocked} />
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
          <label style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px 12px",
            borderTop: `1px solid ${C.border}`, color: C.subHi, fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ flex: 1 }}>解析するデータの日付</span>
            <input
              type="date"
              aria-label="解析するデータの日付"
              value={analysisDate}
              disabled={interactionLocked}
              onChange={(event) => setAnalysisDate?.(event.target.value || todayStr())}
              style={{
                minHeight: 38, borderRadius: 9, border: `1px solid ${C.borderHi}`,
                background: C.surfaceHi, color: C.text, padding: "0 9px", fontFamily: mono,
              }}
            />
          </label>
        </Card>

        <Card data-testid="delta-island-scope" style={{ marginBottom: 12 }}>
          <div style={{ padding: "12px 14px 9px" }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>解析する島</div>
            <div style={{ color: C.subHi, fontSize: 11, lineHeight: 1.55, marginTop: 3 }}>
              台番号を店舗管理の島と照合し、登録済みの機種名を自動入力します。
            </div>
          </div>
          {Array.isArray(islands) && islands.length > 0 ? (
            <div role="radiogroup" aria-label="解析する島" style={{ padding: "0 10px 10px", display: "grid", gap: 7 }}>
              <button
                className="b"
                type="button"
                role="radio"
                aria-checked={islandScopeId === "all"}
                disabled={interactionLocked}
                onClick={() => onChangeIslandScope?.("all")}
                style={{
                  width: "100%", minHeight: TAP, borderRadius: 11, padding: "9px 11px",
                  border: islandScopeId === "all" ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                  background: islandScopeId === "all" ? "color-mix(in srgb, var(--blue) 12%, transparent)" : C.surfaceHi,
                  color: C.text, textAlign: "left", fontFamily: font, opacity: interactionLocked ? 0.55 : 1,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900 }}>
                  {islandScopeId === "all" && <span style={{ color: C.blue, marginRight: 5 }}>✓</span>}
                  店舗全体（台番号から自動判定）
                </div>
                <div style={{ color: C.sub, fontSize: 10, marginTop: 2 }}>
                  複数の島を一緒に撮影した場合はこちら
                </div>
              </button>
              {islands.map((island, index) => {
                const islandId = String(island?.id ?? `island-${index}`);
                const selected = islandScopeId === islandId;
                const numbers = islandToNumbers(island);
                return (
                  <button
                    key={islandId}
                    className="b"
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={interactionLocked}
                    onClick={() => onChangeIslandScope?.(islandId)}
                    style={{
                      width: "100%", minHeight: TAP, borderRadius: 11, padding: "9px 11px",
                      border: selected ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                      background: selected ? "color-mix(in srgb, var(--blue) 12%, transparent)" : C.surfaceHi,
                      color: C.text, textAlign: "left", fontFamily: font, opacity: interactionLocked ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selected && <span style={{ color: C.blue, marginRight: 5 }}>✓</span>}
                        {island?.name || `島${index + 1}`}
                      </div>
                      <div style={{ color: C.sub, fontSize: 10, fontFamily: mono }}>{numbers.length}台</div>
                    </div>
                    <div style={{ color: island?.machineName ? C.green : C.yellow, fontSize: 10, marginTop: 3, fontWeight: 700 }}>
                      {island?.machineName || "機種未登録（解析後に選択できます）"}
                    </div>
                    <div style={{ color: C.sub, fontSize: 9, marginTop: 2, fontFamily: mono }}>
                      台番号 {formatNumberRanges(numbers)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "0 14px 13px", color: C.yellow, fontSize: 11, lineHeight: 1.6, fontWeight: 700 }}>
              この店舗には島がまだ登録されていません。解析は続けられ、機種名は結果画面で選択できます。
            </div>
          )}
        </Card>

        {/* アップロードゾーン */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,application/pdf,.csv,.tsv,text/csv,text/tab-separated-values"
          multiple
          disabled={interactionLocked}
          style={{ display: "none" }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <div
          role="button"
          aria-disabled={interactionLocked}
          onClick={interactionLocked ? undefined : () => fileRef.current?.click()}
          style={{
            border: `2px dashed ${C.borderHi}`,
            borderRadius: 16,
            padding: "36px 20px",
            textAlign: "center",
            cursor: interactionLocked ? "not-allowed" : "pointer",
            opacity: interactionLocked ? 0.55 : 1,
            background: C.surface,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 40, color: C.blue, lineHeight: 1, marginBottom: 12 }}>▣</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 6 }}>
            グラフと台データ表をまとめて追加
          </div>
          <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
            出玉推移グラフ＋サイトセブンの表写真・PDF・CSV<br />（複数ファイルを一度に選択できます）
          </div>
          <div style={{ fontSize: 11, color: C.subHi, lineHeight: 1.55, marginTop: 10 }}>
            文字を選択できるPDF・CSVは写真より正確です。画像だけのPDFは、元の写真も一緒に選んでください。
          </div>
        </div>

        {/* 追加済みサムネイル */}
        {images.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: "4px 2px 2px" }}>追加済みの画像</div>
            <div style={{ fontSize: 11, color: C.yellow, lineHeight: 1.5, margin: "0 2px 8px", fontWeight: 700 }}>
              台番号を主に照合し、信頼できる最高出玉を使える場合だけ補助証拠にします
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {images.map((img, i) => (
                <div key={img.id || `${img.name}-${i}`} style={{ position: "relative", width: 96 }}>
                  <div style={{ position: "absolute", top: 5, left: 5, zIndex: 1, minWidth: 24, height: 24, borderRadius: 12, background: C.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>
                    {i + 1}
                  </div>
                  {img.kind === "image" ? (
                    <img src={img.dataUrl} alt="" style={{ width: 96, height: 84, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}` }} />
                  ) : (
                    <div style={{
                      width: 96, height: 84, boxSizing: "border-box", borderRadius: 12,
                      border: `1px solid ${C.border}`, background: C.surfaceHi,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      color: img.kind === "pdf" ? C.red : C.green, fontWeight: 900, fontFamily: mono,
                    }}>
                      <div style={{ fontSize: 22 }}>{img.kind === "pdf" ? "PDF" : "CSV"}</div>
                      <div style={{ fontSize: 9, color: C.sub, marginTop: 3 }}>台データ</div>
                    </div>
                  )}
                  <button
                    className="b"
                    aria-label="この画像を削除"
                    disabled={interactionLocked}
                    onClick={interactionLocked ? undefined : () => removeImage(i)}
                    style={{
                      position: "absolute", top: -8, right: -8,
                      minWidth: TAP, minHeight: TAP, borderRadius: "50%",
                      border: "none", background: "transparent",
                      color: C.red, fontSize: 20, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: interactionLocked ? 0.4 : 1,
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
                      disabled={interactionLocked || i === 0}
                      onClick={() => moveImage(i, i - 1)}
                      style={{ flex: 1, minWidth: TAP, minHeight: TAP, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: interactionLocked || i === 0 ? C.sub : C.text, fontSize: 17 }}
                    >
                      ←
                    </button>
                    <button
                      className="b"
                      aria-label="この画像を後ろへ移動"
                      disabled={interactionLocked || i === images.length - 1}
                      onClick={() => moveImage(i, i + 1)}
                      style={{ flex: 1, minWidth: TAP, minHeight: TAP, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: interactionLocked || i === images.length - 1 ? C.sub : C.text, fontSize: 17 }}
                    >
                      →
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="b"
                aria-label="画像を追加"
                disabled={interactionLocked}
                onClick={interactionLocked ? undefined : () => fileRef.current?.click()}
                style={{
                  width: 84, height: 84, borderRadius: 12,
                  border: `1px dashed ${C.borderHi}`, background: "transparent",
                  color: C.sub, fontSize: 28, fontWeight: 300,
                  opacity: interactionLocked ? 0.4 : 1,
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
              グラフを検出できませんでした。出玉推移グラフを含む画像を選んでください
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
            写真・PDF・CSVはこの端末内でのみ解析されます<br />
            <span style={{ color: C.sub }}>外部への送信は行いません</span><br />
            <span style={{ color: C.sub, fontFamily: mono }}>
              解析エンジン {ANALYSIS_ENGINE_VERSION}
            </span>
          </div>
        </div>
      </div>
      <BottomCta
        label={busy
          ? `解析中… ${progress.i}/${progress.n}`
          : loadingFiles ? "ファイルを準備中…" : `解析する（${images.length}件）`}
        onClick={start}
        disabled={!images.length || interactionLocked}
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
function NumbersStep({
  slots,
  reports,
  numberOcr,
  jointMatch,
  siteSevenSummary,
  initialNumbers,
  islands,
  onConfirm,
  onBack,
}) {
  const slotCount = slots.length;
  const jointOnlyNumbers = Boolean(jointMatch);
  const storeRelation = useMemo(() => buildStoreMachineNumberRelation({
    islands,
    slots,
    jointOnly: jointOnlyNumbers,
  }), [islands, slots, jointOnlyNumbers]);
  const storeSuggestion = storeRelation.suggestion;
  const [pickedIslandId, setPickedIslandId] = useState(() => (
    storeSuggestion.available ? storeSuggestion.candidateId : null
  ));
  const [segments, setSegments] = useState([{ start: "", count: String(slotCount) }]);
  const [partialManualNumbers, setPartialManualNumbers] = useState(() => ({
    ...(storeSuggestion.suggestedManualNumbersByIndex || {}),
    ...seedPartialMachineNumberInputs(slots, initialNumbers, { jointOnly: jointOnlyNumbers }),
  }));
  const [orderConfirmed, setOrderConfirmed] = useState(false);

  const pickedIsland = useMemo(
    () => (islands || []).find((isl, index) => (
      String(isl?.id ?? `island-${index}`) === String(pickedIslandId)
    )) || null,
    [islands, pickedIslandId]
  );

  // 確定する台番号配列。島選択中は島番号、未選択時は手動区間。
  const manualNumbers = useMemo(() => {
    if (pickedIsland) return islandToNumbers(pickedIsland);
    return buildSegmentsNumbers(segments);
  }, [pickedIsland, segments]);
  const fixedNumbers = useMemo(
    () => slots.map((slot) => trustedMachineNumberForSlot(slot, {
      jointOnly: jointOnlyNumbers,
    })),
    [slots, jointOnlyNumbers],
  );
  const fixedNumberCount = fixedNumbers.filter(Boolean).length;
  const hasFixedNumberAssignments = !numberOcr?.accepted && fixedNumberCount > 0;
  const unresolvedNumberIndices = useMemo(
    () => fixedNumbers.reduce((indices, value, index) => {
      if (!value) indices.push(index);
      return indices;
    }, []),
    [fixedNumbers],
  );
  const selectedStoreCandidate = useMemo(() => {
    const compatible = Array.isArray(storeRelation.compatibleCandidates)
      ? storeRelation.compatibleCandidates
      : [];
    const picked = compatible.find((candidate) => (
      String(candidate.candidateId) === String(pickedIslandId)
    ));
    if (picked) return picked;
    if (!storeSuggestion.available) return null;
    return compatible.find((candidate) => (
      String(candidate.candidateId) === String(storeSuggestion.candidateId)
    )) || null;
  }, [pickedIslandId, storeRelation.compatibleCandidates, storeSuggestion]);
  const numbers = numberOcr?.accepted
      ? numberOcr.numbers
      : hasFixedNumberAssignments
      ? buildPartialMachineNumberAssignment(slots, partialManualNumbers, {
        jointOnly: jointOnlyNumbers,
      })
      : manualNumbers;
  const storeCandidateNumbers = selectedStoreCandidate?.numbers || [];
  const storeNumberComparison = (
    storeCandidateNumbers.length
      ? compareConfirmedMachineNumbers(numbers, storeCandidateNumbers)
      : null
  );
  const storeSuggestedCount = selectedStoreCandidate
    ? selectedStoreCandidate.numbers.reduce((count, _number, index) => (
      count + (fixedNumbers[index] ? 0 : 1)
    ), 0)
    : 0;
  const storeRelationExact = storeNumberComparison?.exact === true;

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
    () => validateReviewedNumberAssignment(slots, numbers, { jointOnly: jointOnlyNumbers }),
    [slots, numbers, jointOnlyNumbers],
  );
  const trustedOcrMismatches = reviewedNumberAssignment.mismatches;
  const duplicateOcrNumbers = numberOcr?.duplicateNumbers
    || numberOcr?.duplicateMachineNumbers
    || [];
  const hasOcrConflict = !jointOnlyNumbers && duplicateOcrNumbers.length > 0;

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
  const updatePartialNumber = (slotIndex, value) => {
    setOrderConfirmed(false);
    setPartialManualNumbers((current) => ({ ...current, [slotIndex]: value }));
  };
  const applyCompatibleStoreCandidate = (candidate) => {
    if (!candidate || !Array.isArray(candidate.numbers)) return;
    setPickedIslandId(candidate.candidateId);
    setOrderConfirmed(false);
    setPartialManualNumbers((current) => {
      const next = { ...current };
      candidate.numbers.forEach((number, index) => {
        // 共同照合／OCRで固定済みの位置には一切書き込まない。
        if (!fixedNumbers[index]) next[index] = String(number);
      });
      return next;
    });
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
          {numberOcr?.source === "joint-site-seven"
            ? `グラフと表を突き合わせ、${slotCount}台を1台ずつ自動照合しました`
            : numberOcr?.source === "joint-partial"
              ? `共同照合で${fixedNumberCount}台を固定し、未確認の${unresolvedNumberIndices.length}台だけ入力します`
            : numberOcr?.accepted
              ? `画像内の台番号を${slotCount}台すべて自動照合しました`
            : `検出された${slotCount}台に台番号を割り当てます`}
        </div>

        {numberOcr?.accepted && (
          <div style={{ background: "color-mix(in srgb, var(--green) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--green) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.green, fontWeight: 900, marginBottom: 4 }}>
              {numberOcr?.source === "joint-site-seven"
                ? `共同照合 ${numberOcr.numbers.length}/${slotCount}台 一致`
                : `台番号OCR ${numberOcr.numbers.length}/${slotCount}台 読み取り完了`}
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.6 }}>
              {numberOcr?.source === "joint-site-seven"
                ? "台番号を1対1で確認しました。信頼できる最高出玉を使える場合だけ補助証拠にし、1行欠けても後続をずらしません。"
                : "各グラフ直上の番号を直接読み、重複がないことを確認しました。画像の選択順には依存しません。"}
            </div>
          </div>
        )}

        {jointMatch && !numberOcr?.accepted && (
          <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--yellow) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.yellow, fontWeight: 900, marginBottom: 4 }}>
              共同照合 {jointMatch.summary?.matchedCount || 0}/{slotCount}台・残りは要確認
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.65, fontWeight: 700 }}>
              読めない台だけを確認対象に残しました。確定済みの台を詰めて後続へ割り当てることはありません。
              {jointMatch.reviewReasons?.[0]?.message && (
                <div style={{ color: C.yellow, marginTop: 4 }}>
                  {jointMatch.reviewReasons[0].message}
                </div>
              )}
            </div>
          </div>
        )}

        {numberOcr && !numberOcr.accepted && numberOcr.source !== "joint-partial" && (
          <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--yellow) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.yellow, fontWeight: 900, marginBottom: 4 }}>
              台番号OCRは一部のみ成功（{recognizedNumberCount}/{slotCount}台）
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.65, fontWeight: 700 }}>
              小さい文字を無理に推測しません。
              {hasFixedNumberAssignments
                ? " 確実に読めた番号は固定し、未確認の台だけ入力してください。"
                : " 下の島または区間で番号を割り当て、画像ごとの範囲を確認してください。"}
              OCRで確実に読めた番号と1台でも矛盾する場合は確定できません。
            </div>
          </div>
        )}

        {siteSevenSummary?.failedFileCount > 0 && (
          <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--yellow) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.yellow, fontWeight: 900, marginBottom: 4 }}>
              台データを読めないファイルが{siteSevenSummary.failedFileCount}件あります
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.65, fontWeight: 700 }}>
              {siteSevenSummary.reports?.find((report) => report.error)?.error
                || "表全体と台番号が見える元画像へ差し替えてください。"}
            </div>
          </div>
        )}

        {siteSevenSummary?.unsafeFileCount > 0 && (
          <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--yellow) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.yellow, fontWeight: 900, marginBottom: 4 }}>
              資料に目視確認が必要なファイルが{siteSevenSummary.unsafeFileCount}件あります
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.65, fontWeight: 700 }}>
              列欠け・読み飛ばし・重複の可能性があるため自動確定しません。共同照合した番号は候補として保持し、元資料を確認してから確定してください。
            </div>
          </div>
        )}

        {siteSevenSummary?.rowCount > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 900 }}>
                台データ資料 {siteSevenSummary.rowCount}台を関係付け
              </div>
              <div style={{ fontSize: 11, color: C.subHi, lineHeight: 1.6, marginTop: 4 }}>
                写真 {siteSevenSummary.imageCount || 0}件・PDF {siteSevenSummary.pdfCount || 0}件・CSV {siteSevenSummary.csvCount || 0}件
                を、台番号と最高出玉でグラフへ照合しています。
              </div>
              {(siteSevenSummary.reports || []).filter((report) => !report.error).map((report) => (
                <div key={`${report.imageIndex}-${report.name}`} style={{
                  display: "flex", gap: 8, alignItems: "baseline", marginTop: 7,
                  fontSize: 11, color: C.subHi, fontFamily: mono,
                }}>
                  <span style={{ color: report.kind === "pdf" ? C.red : report.kind === "csv" ? C.green : C.blue, fontWeight: 900 }}>
                    {String(report.kind || "image").toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{report.name}</span>
                  <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{report.rowCount}台</span>
                  {report.autoAcceptable === false && (
                    <span style={{ color: C.yellow, whiteSpace: "nowrap", fontWeight: 900 }}>要確認</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card style={{ marginBottom: 12 }}>
          <div data-testid="store-machine-relation-status" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: (
              storeRelationExact && (!storeSuggestedCount || orderConfirmed)
                ? C.green
                : selectedStoreCandidate
                  ? C.yellow
                  : C.subHi
            ) }}>
              {!Array.isArray(islands) || islands.length === 0
                ? "店舗管理リスト：未登録"
                : selectedStoreCandidate && storeSuggestedCount > 0 && !orderConfirmed
                  ? `店舗管理リストで${storeSuggestedCount}台を補助入力・確認待ち`
                  : storeRelationExact
                    ? `店舗管理リストとも${storeNumberComparison.matchedNumbers.length}/${slotCount}台一致`
                    : storeRelation.compatibleCandidates.length > 1
                      ? `店舗管理リストの候補が${storeRelation.compatibleCandidates.length}件あります`
                      : storeRelation.candidates.length > 0
                        ? "店舗管理リストと台番号の位置が一致しません"
                        : "店舗管理リスト：利用できる台範囲がありません"}
            </div>
            <div style={{ fontSize: 11, color: C.subHi, lineHeight: 1.65, marginTop: 4, fontWeight: 650 }}>
              {selectedStoreCandidate && (
                <div>
                  使用候補：{selectedStoreCandidate.candidateLabel || selectedStoreCandidate.candidateName}
                  {fixedNumberCount > 0 ? "（固定済み番号と位置照合）" : "（台数だけで選択・要確認）"}
                </div>
              )}
              <div>
                店舗管理リストは「台選び → 店舗レイアウト」で登録します。次の画面ではなく、この台番号画面で照合に使います。
              </div>
              {storeNumberComparison && !storeRelationExact && (
                <div style={{ color: C.yellow, marginTop: 3 }}>
                  位置違い {storeNumberComparison.indexMismatches.length}台
                  {storeNumberComparison.missingNumbers.length > 0 && `・不足 ${storeNumberComparison.missingNumbers.length}台`}
                  {storeNumberComparison.extraNumbers.length > 0 && `・余分 ${storeNumberComparison.extraNumbers.length}台`}
                </div>
              )}
            </div>
            {hasFixedNumberAssignments && storeRelation.compatibleCandidates.length > 1 && (
              <div data-testid="store-compatible-candidates" style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <div style={{ fontSize: 11, color: C.yellow, fontWeight: 800 }}>
                  固定済み番号と矛盾しない候補が複数あります。元画像を見て1件選んでください。
                </div>
                {storeRelation.compatibleCandidates.map((candidate) => {
                  const selected = String(selectedStoreCandidate?.candidateId) === String(candidate.candidateId);
                  return (
                    <button
                      key={candidate.candidateId}
                      className="b"
                      type="button"
                      data-testid={`store-compatible-candidate-${candidate.candidateId}`}
                      onClick={() => applyCompatibleStoreCandidate(candidate)}
                      style={{
                        width: "100%", minHeight: TAP, borderRadius: 10, padding: "9px 11px",
                        border: `1px solid ${selected ? C.blue : C.borderHi}`,
                        background: selected
                          ? "color-mix(in srgb, var(--blue) 12%, transparent)"
                          : C.surfaceHi,
                        color: selected ? C.blue : C.text,
                        display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 900 }}>
                          {candidate.candidateLabel || candidate.candidateName}
                        </span>
                        <span style={{ display: "block", fontSize: 11, color: C.subHi, fontFamily: mono, marginTop: 2 }}>
                          {formatNumberRanges(candidate.numbers)}（{candidate.numberCount}台）
                        </span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>
                        {selected ? "選択中" : "この候補を使う"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

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

        {hasFixedNumberAssignments && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>
                固定済み {fixedNumberCount}台・確認が必要 {unresolvedNumberIndices.length}台
              </div>
              <div style={{ fontSize: 11, color: C.subHi, lineHeight: 1.6, marginTop: 4 }}>
                共同照合または番号OCRで確定した台番号は変更できません。空欄の台だけ元画像を見て入力してください。
              </div>
              {unresolvedNumberIndices.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
                  {unresolvedNumberIndices.map((slotIndex) => {
                    const slot = slots[slotIndex];
                    const imageLabel = Number.isInteger(slot?.source?.imageIndex)
                      ? `画像${slot.source.imageIndex + 1}`
                      : "画像不明";
                    const rowLabel = Number.isInteger(slot?.source?.row)
                      ? `・${slot.source.row + 1}行目`
                      : "";
                    return (
                      <SegInput
                        key={slotIndex}
                        label={`${slotIndex + 1}台目（${imageLabel}${rowLabel}）`}
                        value={partialManualNumbers[slotIndex] || ""}
                        onChange={(value) => updatePartialNumber(slotIndex, value)}
                        ph="台番号"
                      />
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: C.green, fontSize: 12, fontWeight: 800, marginTop: 10 }}>
                  グラフ側の台番号はすべて固定済みです。下の対応だけ目視確認してください。
                </div>
              )}
            </div>
          </Card>
        )}

        {!numberOcr?.accepted && !hasFixedNumberAssignments && <>
        {/* ホールマップから選ぶ */}
        {islands && islands.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "12px 14px 4px", fontSize: 14, fontWeight: 800, color: C.text }}>
              登録済みのホールマップから選ぶ
            </div>
            {islands.map((isl, islandIndex) => {
              const cnt = islandToNumbers(isl).length;
              const islandCandidateId = String(isl?.id ?? `island-${islandIndex}`);
              const picked = String(pickedIslandId) === islandCandidateId;
              const mismatch = cnt !== slotCount;
              return (
                <div key={islandCandidateId} style={{ padding: "8px 12px" }}>
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
                        setPickedIslandId(picked ? null : islandCandidateId);
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
          <div style={{ fontSize: 13, color: C.subHi, fontFamily: mono, lineHeight: 1.7, padding: "0 4px 8px" }}>
            {numbers.map((n, i) => (
              <span
                key={i}
                title={hasFixedNumberAssignments && fixedNumbers[i] ? "共同照合または番号OCRで固定済み" : undefined}
                style={{
                  display: "inline-block",
                  whiteSpace: "nowrap",
                  color: hasFixedNumberAssignments && fixedNumbers[i] ? C.green : n ? C.subHi : C.red,
                  fontWeight: hasFixedNumberAssignments && fixedNumbers[i] ? 900 : 700,
                }}
              >
                {i > 0 && numbers[i] !== String(parseInt(numbers[i - 1], 10) + 1)
                  ? <span style={{ color: C.blue, fontWeight: 800 }}> | </span>
                  : i > 0 ? ", " : ""}
                {n || "未入力"}{hasFixedNumberAssignments && fixedNumbers[i] ? " 🔒" : ""}
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
                  ? numberOcr?.source === "joint-site-seven"
                    ? "表の台番号を主に照合し、信頼できる最高出玉がある台だけ補助証拠にしています。"
                    : "各画像に表示された台番号で照合済みです。"
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
          {hasFixedNumberAssignments
            ? "固定済み番号と入力した番号が、各画像のグラフに対応することを確認しました"
            : "各画像のグラフと台番号の対応を1台ずつ確認しました"}
        </button>}
      </div>
      <BottomCta
        label="この台番号で確定"
        onClick={() => onConfirm(numbers, {
          manualVerified: !numberOcr?.accepted && orderConfirmed,
          storeMapVerified: !numberOcr?.accepted && orderConfirmed && storeRelationExact,
          storeCandidateNumbers,
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
  if (reasons.includes("boundary-uncertain")) {
    return "終点がグラフ上限・下限のすぐ近くです。境界を越えたとは断定せず、元画像での確認が必要です。";
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
  const bounded = isBoundedDeltaRow(row);
  const [draft, setDraft] = useState(bounded ? "" : String(row?.val ?? ""));
  const normalized = draft.normalize("NFKC").replace(/[−‐‑‒–—―﹣]/g, "-").replace(/[,，\s]/g, "");
  const numericValid = /^[+-]?\d+$/.test(normalized) && Number.isSafeInteger(Number(normalized));
  const parsedValue = numericValid ? Number(normalized) : null;
  const constraintValid = numericValid && isDeltaValueWithinConstraint(row, parsedValue);
  const valid = numericValid && constraintValid;
  const emptyBoundedDraft = bounded && !draft.trim();
  const showInputError = !valid && !emptyBoundedDraft;
  const canRestoreBounded = !bounded
    && row?.deltaRange
    && row?.rawGraphCandidate
    && ["manual-review", "manual-review-candidate"].includes(row?.valueSource);
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
        <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, marginBottom: 4 }}>
          {bounded ? "正確な差玉が分かる場合のみ入力（任意）" : "確認後の差玉"}
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={reviewConfirmed}
          aria-label={`台${row?.num}の確認後差玉`}
          aria-invalid={showInputError}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          style={{
            width: "100%", minHeight: TAP, boxSizing: "border-box",
            borderRadius: 10,
            border: `1px solid ${showInputError ? C.red : emptyBoundedDraft ? C.green : C.borderHi}`,
            background: reviewConfirmed ? C.surface : C.surfaceHi,
            color: C.text, fontSize: 18, fontFamily: mono, fontWeight: 900,
            padding: "0 10px", opacity: reviewConfirmed ? 0.72 : 1,
          }}
        />
        {!valid && !reviewConfirmed && (!bounded || draft.trim()) && (
          <div role="alert" style={{ color: C.red, fontSize: 10, fontWeight: 800, marginTop: 4 }}>
            {numericValid ? constraintText(row) || "許可された範囲で入力してください" : "数字で入力してください"}
          </div>
        )}
      </div>
      {bounded && !draft.trim() ? (
        <div style={{
          flex: "1 1 170px", minHeight: TAP, borderRadius: 10,
          border: `1px solid color-mix(in srgb, var(--green) 30%, transparent)`,
          background: "color-mix(in srgb, var(--green) 8%, transparent)",
          color: C.green, fontSize: 11, fontWeight: 800, padding: "8px 10px",
          display: "flex", alignItems: "center",
        }}>
          入力しなければ上限・下限到達の記録として保存されます
        </div>
      ) : (
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
      )}
      {canRestoreBounded && (
        <button
          className="b"
          type="button"
          onClick={() => {
            setDraft("");
            onUpdate({ restoreBounded: true });
          }}
          style={{
            flex: "1 1 170px", minHeight: TAP, borderRadius: 10,
            border: `1px solid ${C.border}`, background: C.surfaceHi,
            color: C.subHi, fontSize: 11, fontWeight: 800, padding: "8px 10px",
          }}
        >
          正確値を取り消して境界到達記録に戻す
        </button>
      )}
    </>
  );
}

function ClippedEvidenceCard({ row, suggestion }) {
  const range = row?.deltaRange;
  if (!isBoundedDeltaRow(row) || !range) return null;
  return (
    <div style={{
      marginTop: 10, padding: "11px 12px", borderRadius: 11,
      border: `1px solid color-mix(in srgb, var(--green) 36%, transparent)`,
      background: "color-mix(in srgb, var(--green) 9%, transparent)",
    }}>
      <div style={{ color: C.green, fontSize: 13, fontWeight: 900 }}>
        グラフから上限・下限到達を記録
      </div>
      <div style={{ color: C.text, fontFamily: mono, fontSize: 20, fontWeight: 900, marginTop: 4 }}>
        {formatDeltaRange(range, sp)}
      </div>
      <div style={{ color: C.subHi, fontSize: 10, lineHeight: 1.6, marginTop: 5, fontWeight: 700 }}>
        折れ線から分かる境界だけを保存します。正確な一点値として平均や予測には使いません。
      </div>
      {suggestion && (
        <div style={{
          marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>大当り・回転数・機種からの参考推定</div>
            <div style={{ color: C.yellow, fontFamily: mono, fontSize: 18, fontWeight: 900, marginTop: 2 }}>
              約 {sp(suggestion.value)}玉
            </div>
            <div style={{ color: C.sub, fontSize: 9, lineHeight: 1.5, marginTop: 2 }}>
              {suggestion.confidence === "medium"
                ? `精度: 中（同日0当たり${suggestion.basis?.peerNumbers?.length || 0}台で回転率を補正）`
                : "精度: 低（機種ボーダーを仮定）"}
              <br />推定値のため自動確定・平均・予測には使用しません
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsStep({
  rows,
  images,
  machineName,
  onBack,
  onSave,
  onOpenImport,
  onUpdateReview,
  onUpdateMachineName,
  saved,
  customMachines,
  siteSevenSummary,
  autoImportedCount = 0,
}) {
  const [sortBy, setSortBy] = useState("delta");
  const [machinePickerNumber, setMachinePickerNumber] = useState(null);

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
        map.set(String(row.num), {
          hasEstimate: false,
          reason: isBoundedDeltaRow(row)
            ? "差玉は境界到達記録（予測から除外）"
            : row?.status === "review" ? "差玉の確認待ち" : "差玉未読取",
        });
        continue;
      }
      map.set(String(row.num), buildRowDeltaEvidence(
        { ...row, machineName: row.machineName || "" },
        customMachines,
        machineDB,
      ));
    }
    return map;
  }, [rows, customMachines]);
  const clippedSuggestionByNum = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const suggestion = buildClippedDeltaSuggestion(row, rows, customMachines, machineDB);
      if (suggestion) map.set(String(row.num), suggestion);
    }
    return map;
  }, [rows, customMachines]);
  const machineNames = useMemo(() => (
    [...new Set(rows.map((row) => String(row?.machineName || "").trim()).filter(Boolean))]
  ), [rows]);
  const layoutState = useMemo(() => rows.reduce((state, row) => {
    const status = row?.storeLayoutRelation?.status;
    if (status === "matched") state.matched += 1;
    if (status === "manual-override") state.manual += 1;
    if (status === "island-only") state.machineMissing += 1;
    if (status === "machine-conflict") state.conflicts += 1;
    if (status === "ambiguous") state.ambiguous += 1;
    if (status === "unmapped") state.unmapped += 1;
    return state;
  }, { matched: 0, manual: 0, machineMissing: 0, conflicts: 0, ambiguous: 0, unmapped: 0 }), [rows]);
  const predictedCount = Array.from(predictionByNum.values()).filter((item) => item.hasEstimate).length;
  const pendingReviewCount = rowValidation.pendingReviewIndices.length;
  const confirmedReviewCount = rowValidation.confirmedReviewIndices.length;
  const boundedCount = rowValidation.boundedCount || 0;
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
                {machineName || (machineNames.length > 1 ? "複数機種" : "解析結果")} ・ {rows.length}台
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
              確定 {rowValidation.exactCount ?? rowValidation.resolvedCount}/{rows.length}台
              {boundedCount > 0 && ` ・ 境界到達 ${boundedCount}台`}
              {` ・ 予測回転率 ${predictedCount}台`}
              {confirmedReviewCount > 0 && ` ・ 目視確認済み ${confirmedReviewCount}台`}
            </div>
          </div>
        </Card>

        {(layoutState.matched > 0 || layoutState.manual > 0 || layoutState.machineMissing > 0 || layoutState.conflicts > 0
          || layoutState.ambiguous > 0 || layoutState.unmapped > 0) && (
          <div style={{
            borderRadius: 13, padding: "11px 13px", marginBottom: 12,
            border: `1px solid ${layoutState.conflicts || layoutState.ambiguous ? C.yellow : C.border}`,
            background: layoutState.conflicts || layoutState.ambiguous
              ? "color-mix(in srgb, var(--yellow) 10%, transparent)"
              : C.surface,
          }}>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>店舗管理との連携</div>
            <div style={{ color: C.subHi, fontSize: 11, lineHeight: 1.6, marginTop: 3, fontWeight: 700 }}>
              島・機種一致 {layoutState.matched}台
              {layoutState.manual > 0 && ` ・ 手動補正 ${layoutState.manual}台`}
              {layoutState.machineMissing > 0 && ` ・ 島の機種未登録 ${layoutState.machineMissing}台`}
              {layoutState.conflicts > 0 && ` ・ 機種名の相違 ${layoutState.conflicts}台`}
              {layoutState.ambiguous > 0 && ` ・ 島範囲の重複 ${layoutState.ambiguous}台`}
              {layoutState.unmapped > 0 && ` ・ 選択範囲外 ${layoutState.unmapped}台`}
            </div>
            {(layoutState.machineMissing > 0 || layoutState.conflicts > 0 || layoutState.ambiguous > 0) && (
              <div style={{ color: C.yellow, fontSize: 10, lineHeight: 1.55, marginTop: 3, fontWeight: 800 }}>
                機種名を押すと、記録ページと同じ機種マスターから補正できます。
              </div>
            )}
          </div>
        )}

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

        {boundedCount > 0 && (
          <div style={{
            background: "color-mix(in srgb, var(--green) 9%, transparent)",
            border: `1px solid color-mix(in srgb, var(--green) 32%, transparent)`,
            borderRadius: 14, padding: "11px 13px", marginBottom: 12,
            color: C.subHi, fontSize: 11, lineHeight: 1.65, fontWeight: 700,
          }}>
            <div style={{ color: C.green, fontSize: 13, fontWeight: 900, marginBottom: 3 }}>
              上限・下限で切れた{boundedCount}台は境界到達のまま保存できます
            </div>
            正確な一点値を作らないため、チェックは不要です。平均差玉と予測回転率からは除外し、正確な値が分かっている場合だけ任意で上書きできます。
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
          const bounded = isBoundedDeltaRow(r);
          const isReview = r.status === "review" || bounded;
          const reviewConfirmed = isReview && resolved && r.reviewConfirmed === true;
          const tone = resolved
            ? getRankTone(r.rank)
            : { color: isReview ? C.yellow : C.red, bg: isReview ? "color-mix(in srgb, var(--yellow) 14%, transparent)" : "color-mix(in srgb, var(--red) 12%, transparent)" };
          const hasTai = r.normalSpins != null && r.totalStarts != null;
          const hasMaxPayout = Number.isFinite(Number(r.maxPayout));
          const maxPayoutRejected = r.maxPayoutAccepted === false
            || (r.maxPayoutAccepted == null && r.fieldAccepted?.maxPayout === false);
          const prediction = predictionByNum.get(String(r.num));
          const predicted = prediction?.evidence;
          const sourceImage = Number.isInteger(r.source?.imageIndex)
            ? images?.[r.source.imageIndex]
            : null;
          const boundWarning = constraintText(r);
          const clippedSuggestion = clippedSuggestionByNum.get(String(r.num));
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
                    {reviewConfirmed ? "確認済" : resolved ? r.rank : bounded ? "境界" : isReview ? "要確認" : "未読取"}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>台{r.num}</div>
                  <button
                    type="button"
                    className="b"
                    aria-label={`台${r.num}の機種名を選択`}
                    onClick={() => setMachinePickerNumber(String(r.num))}
                    style={{
                      minHeight: TAP, maxWidth: "100%", padding: "3px 0", border: "none",
                      background: "transparent", color: r.machineName ? C.blue : C.yellow,
                      display: "flex", alignItems: "center", gap: 5, textAlign: "left", fontFamily: font,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.machineName || "機種を選ぶ"}
                    </span>
                    <span aria-hidden="true" style={{ flexShrink: 0 }}>›</span>
                  </button>
                  {r.island && (
                    <div style={{ color: C.sub, fontSize: 10, marginTop: -5, marginBottom: 3 }}>
                      {r.island}
                      {r?.storeLayoutRelation?.machineNameApplied && <span style={{ color: C.green }}> ・ 店舗管理から自動入力</span>}
                    </div>
                  )}
                  {r?.storeLayoutRelation?.status === "machine-conflict" && (
                    <div style={{ color: C.yellow, fontSize: 10, lineHeight: 1.45, fontWeight: 800, marginBottom: 3 }}>
                      資料と店舗管理の機種名が異なります。機種名を押して確認してください
                    </div>
                  )}
                  {r?.storeLayoutRelation?.status === "ambiguous" && (
                    <div style={{ color: C.yellow, fontSize: 10, lineHeight: 1.45, fontWeight: 800, marginBottom: 3 }}>
                      同じ台番号が複数の島に登録されています
                    </div>
                  )}
                  {!resolved && !isReview && (
                    <div style={{ fontSize: 10, color: tone.color, marginTop: 3, fontWeight: 800, lineHeight: 1.45 }}>
                      元画像に折れ線が描画されていません
                      {Number.isInteger(r.source?.imageIndex) ? `（画像${r.source.imageIndex + 1}${Number.isInteger(r.source?.row) ? `・${r.source.row + 1}行目` : ""}）` : ""}
                    </div>
                  )}
                  {hasTai && (
                    <div style={{ fontSize: 11, color: C.subHi, fontFamily: mono, marginTop: 2 }}>
                      回転数 {f(r.normalSpins)} / 当り {f(r.totalStarts)}回
                      {hasMaxPayout && (
                        maxPayoutRejected
                          ? <span style={{ color: C.yellow }}> / 最高出玉 要確認</span>
                          : ` / 最高出玉 ${f(Number(r.maxPayout))}玉`
                      )}
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
                <div style={{ fontSize: resolved || isReview ? (bounded ? 13 : 21) : 15, fontWeight: 900, fontFamily: mono, color: resolved ? (r.val >= 0 ? C.green : C.red) : tone.color, flexShrink: 0, textAlign: "right", maxWidth: bounded ? 150 : "none" }}>
                  {bounded ? formatDeltaRange(r.deltaRange, sp) : resolved || isReview ? sp(r.val) : "—"}
                  {isReview && !reviewConfirmed && !bounded && <div style={{ fontSize: 9, color: C.yellow, marginTop: 2 }}>候補値</div>}
                </div>
              </div>

              {isReview && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <GraphReviewPreview row={r} image={sourceImage} />
                  <div style={{ fontSize: 12, color: reviewConfirmed ? C.green : C.yellow, lineHeight: 1.6, fontWeight: 800, marginTop: 9 }}>
                    {reviewReasonText(r)}
                    {boundWarning && !bounded && <div style={{ color: C.red }}>{boundWarning}</div>}
                    {Number.isInteger(r.source?.imageIndex) && (
                      <div style={{ color: C.subHi, fontWeight: 700 }}>
                        画像{r.source.imageIndex + 1}{Number.isInteger(r.source?.row) ? `・${r.source.row + 1}行目` : ""}
                      </div>
                    )}
                  </div>
                  <ClippedEvidenceCard
                    row={r}
                    suggestion={clippedSuggestion}
                  />
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
                    <ReviewValueEditor
                      key={`${r.num}-${bounded ? "bounded" : reviewConfirmed ? "confirmed" : "review"}`}
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
        {siteSevenSummary?.rowCount > 0 && (
          <div style={{
            borderRadius: 12,
            border: `1px solid color-mix(in srgb, var(--green) 35%, transparent)`,
            background: "color-mix(in srgb, var(--green) 10%, transparent)",
            color: C.green,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.6,
            padding: "10px 12px",
            marginTop: 4,
            marginBottom: 8,
          }}>
            ✓ 一緒に選んだ表から{siteSevenSummary.rowCount}台を読取
            {autoImportedCount > 0 && `・${autoImportedCount}台の回転数と大当り回数を自動統合`}
            {siteSevenSummary.reviewCount > 0 && (
              <div style={{ color: C.yellow }}>
                数字の目視確認が必要な台が{siteSevenSummary.reviewCount}台あります
              </div>
            )}
            {siteSevenSummary.unsafeFileCount > 0 && (
              <div style={{ color: C.yellow }}>
                列欠け・読み飛ばし・重複の可能性がある資料{siteSevenSummary.unsafeFileCount}件は、元資料との確認が必要です
              </div>
            )}
          </div>
        )}

        {siteSevenSummary?.failedFileCount > 0 && (
          <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: `1px solid color-mix(in srgb, var(--yellow) 38%, transparent)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.yellow, fontWeight: 900, marginBottom: 4 }}>
              台データ表を読めない画像が{siteSevenSummary.failedFileCount}枚あります
            </div>
            <div style={{ fontSize: 12, color: C.subHi, lineHeight: 1.65, fontWeight: 700 }}>
              {siteSevenSummary.reports?.find((report) => report.error)?.error
                || "表全体と台番号が見える元画像へ差し替えてください。"}
            </div>
          </div>
        )}
        <button
          className="b"
          onClick={onOpenImport}
          style={{
            width: "100%", minHeight: TAP + 4, borderRadius: 14,
            border: `1px solid ${C.borderHi}`, background: C.surfaceHi,
            color: C.text, fontSize: 14, fontWeight: 800, marginTop: 4, marginBottom: 12,
          }}
        >
          {siteSevenSummary?.rowCount > 0 ? "台データを確認・追加" : "大当たり・回転数データを一括取り込み"}
        </button>
      </div>
      <MachinePickerSheet
        open={machinePickerNumber !== null}
        title={machinePickerNumber ? `台${machinePickerNumber}の機種を選択` : "機種を選択"}
        customMachines={customMachines}
        onClose={() => setMachinePickerNumber(null)}
        onSelect={(picked) => {
          const pickedName = typeof picked === "string" ? picked : picked?.name;
          if (machinePickerNumber !== null && pickedName) {
            onUpdateMachineName?.(machinePickerNumber, pickedName);
          }
          setMachinePickerNumber(null);
        }}
      />
    </>
  );
}

function applyStoreLayoutRelations(rows, islands, scope = "all") {
  const list = Array.isArray(rows) ? rows : [];
  if (!Array.isArray(islands) || islands.length === 0) {
    return { rows: list, summary: null };
  }
  return relateRowsToStoreLayout(list, { islands, scope });
}

function canConfirmSiteSevenRow(row, rowIndex, rows, expectedNumberSet) {
  const values = [row?.num, row?.normalSpins, row?.totalStarts]
    .map((value) => parseSiteSevenEditableInteger(value));
  if (values.some((value) => value === null || value < 0) || values[0] <= 0) return false;
  const num = String(values[0]);
  if (expectedNumberSet.size > 0 && !expectedNumberSet.has(num)) return false;
  return (Array.isArray(rows) ? rows : []).every((other, otherIndex) => (
    otherIndex === rowIndex || String(parseSiteSevenEditableInteger(other?.num)) !== num
  ));
}

function suggestedMachineNumberStatus(row, rowIndex, rows, expectedNumberSet) {
  const suggested = parseSiteSevenEditableInteger(row?.machineNumberSuggested);
  if (suggested === null || suggested <= 0) {
    return { canApply: false, num: "", reason: "台番号候補を確認できません" };
  }
  const num = String(suggested);
  if (expectedNumberSet.size > 0 && !expectedNumberSet.has(num)) {
    return {
      canApply: false,
      num,
      reason: "差玉側の台番号一覧にない候補です。先にグラフ側の台番号を確認してください",
    };
  }
  const alreadyUsed = (Array.isArray(rows) ? rows : []).some((other, otherIndex) => (
    otherIndex !== rowIndex && String(parseSiteSevenEditableInteger(other?.num)) === num
  ));
  if (alreadyUsed) {
    return { canApply: false, num, reason: `台${num}は別の行ですでに使用されています` };
  }
  return { canApply: true, num, reason: "" };
}

// ════════════ 台データ取り込み ════════════
function ImportStep({
  store,
  analysisDate,
  rows: deltaRows,
  islands,
  islandScopeId,
  customMachines,
  onBack,
  onMerge,
  aiApiKey,
  onChangeAiApiKey,
  initialDataRows = [],
  initialDataSummary = null,
}) {
  const prompt = useMemo(
    () => buildOcrPrompt({ dateText: dateToSlash(analysisDate), storeName: store?.name || "" }),
    [analysisDate, store]
  );
  const promptHead = useMemo(() => prompt.split("\n").slice(0, 2).join("\n"), [prompt]);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");

  const dataFileRef = useRef(null);
  const dataRequestIdRef = useRef(0);
  const [dataRows, setDataRows] = useState(() => (
    applyStoreLayoutRelations(
      overlayManualMachineSelections(initialDataRows, deltaRows),
      islands,
      islandScopeId,
    ).rows
  ));
  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState("");
  const [dataSummary, setDataSummary] = useState(() => initialDataSummary);
  const [dataFilter, setDataFilter] = useState("");
  const [showAllDataRows, setShowAllDataRows] = useState(false);
  const [machinePickerRowIndex, setMachinePickerRowIndex] = useState(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const bulkReviewCheckboxRef = useRef(null);
  const storeScopeExpectedNumbers = useMemo(
    () => buildStoreScopeExpectedNumbers(islands, islandScopeId),
    [islands, islandScopeId]
  );

  const hasKey = typeof aiApiKey === "string" && aiApiKey.trim() !== "";
  const aiFileRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiOk, setAiOk] = useState(false);
  const [aiFileCount, setAiFileCount] = useState(0);
  // APIキー未設定時の導線展開、または設定済み時の変更フォーム表示。
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  // PDF・CSV・写真をすべて端末内で解析する。写真にも外部APIは使わない。
  const handleSiteSevenFiles = async (files) => {
    const selected = Array.from(files || []);
    const classified = selected
      .map((file) => ({ file, kind: classifySiteSevenFile(file) }))
      .filter((entry) => entry.kind);
    if (!classified.length || dataBusy || aiBusy) {
      if (selected.length) setDataError("PDF・JPEG/PNG/WebP画像・CSVのいずれかを選んでください");
      return;
    }

    const pdfFiles = classified.filter(({ kind }) => kind === "pdf").map(({ file }) => file);
    const csvFiles = classified.filter(({ kind }) => kind === "csv").map(({ file }) => file);
    const imageFiles = classified.filter(({ kind }) => kind === "image").map(({ file }) => file);
    const requestId = ++dataRequestIdRef.current;
    aiRequestIdRef.current += 1;

    setDataBusy(true);
    setAiBusy(false);
    setDataRows([]);
    setDataError("");
    setDataSummary(null);
    setDataFilter("");
    setShowAllDataRows(false);
    setMachinePickerRowIndex(null);
    setBulkMessage("");
    setText("");
    try {
      const results = [];
      const failedFiles = [];
      const rememberFailure = (file, error) => {
        failedFiles.push({
          name: file?.name || "名称不明のファイル",
          message: error instanceof Error ? error.message : "読み取りに失敗しました",
        });
      };

      if (pdfFiles.length) {
        // PDF.jsはこの操作をした時だけ読み込み、通常画面の起動を重くしない。
        const { readSiteSevenPdf } = await import("./siteSevenPdfReader.js");
        for (const file of pdfFiles) {
          try {
            const parsedPdf = await readSiteSevenPdf(file, {
              dateText: dateToSlash(analysisDate),
              storeName: store?.name || "",
            });
            results.push({ result: parsedPdf, kind: "pdf" });
          } catch (error) {
            rememberFailure(file, error);
          }
        }
      }

      if (csvFiles.length) {
        for (const file of csvFiles) {
          try {
            const parsedCsv = await readSiteSevenCsv(file, {
              dateText: dateToSlash(analysisDate),
              storeName: store?.name || "",
            });
            results.push({ result: parsedCsv, kind: "csv" });
          } catch (error) {
            rememberFailure(file, error);
          }
        }
      }

      let degradedImageCount = 0;
      if (imageFiles.length) {
        // 数字字体テンプレートを含むため、写真を選んだ時だけOCRコードを読み込む。
        const { readSiteSevenImage } = await import("./siteSevenImageOcr.js");
        for (const file of imageFiles) {
          try {
            const parsedImage = await readSiteSevenImage(file, {
              dateText: dateToSlash(analysisDate),
              storeName: store?.name || "",
              // 表の台番号認識には、グラフOCRではなく店舗・島の登録番号だけを使う。
              // グラフの誤読を表へ循環させて「一致」に見せないための独立照合。
              expectedNumbers: storeScopeExpectedNumbers,
              allowRawMachineNumbers: storeScopeExpectedNumbers.length === 0,
            });
            if (parsedImage.degradedImage) degradedImageCount += 1;
            results.push({ result: parsedImage, kind: "image" });
          } catch (error) {
            rememberFailure(file, error);
          }
        }
      }

      const expectedNumbers = (Array.isArray(deltaRows) ? deltaRows : []).map((row) => row?.num);
      if (!results.length) {
        const failureDetail = failedFiles[0]
          ? `（${failedFiles[0].name}：${failedFiles[0].message}）`
          : "";
        throw new Error(`選んだファイルを1件も読み取れませんでした${failureDetail}`);
      }
      const mergedResults = mergeSiteSevenParsedResults(results, { expectedNumbers });
      const nextRows = mergedResults.rows;
      if (!nextRows.length) {
        const failureDetail = failedFiles[0]
          ? `（${failedFiles[0].name}：${failedFiles[0].message}）`
          : "";
        throw new Error(`選んだファイルから台データを確認できませんでした${failureDetail}`);
      }
      if (requestId !== dataRequestIdRef.current) return;
      setDataRows(applyStoreLayoutRelations(
        overlayManualMachineSelections(nextRows, deltaRows),
        islands,
        islandScopeId,
      ).rows);
      setDataSummary({
        fileCount: results.length,
        rowCount: mergedResults.recognizedCount,
        skippedCount: mergedResults.reviewCount,
        duplicateCount: mergedResults.duplicateCount,
        missingCount: mergedResults.missingNumbers.length,
        pdfCount: results.filter((entry) => entry.kind === "pdf").length,
        csvCount: results.filter((entry) => entry.kind === "csv").length,
        imageCount: results.filter((entry) => entry.kind === "image").length,
        degradedImageCount,
        failedFileCount: failedFiles.length,
      });
      if (failedFiles.length) {
        setDataError(`読み取れないファイルが${failedFiles.length}件ありました。成功したファイルの結果は残しています。${failedFiles.map((item) => `${item.name}：${item.message}`).join("／")}`);
      }
    } catch (error) {
      if (requestId !== dataRequestIdRef.current) return;
      setDataRows([]);
      setDataError(error instanceof Error ? error.message : "台データの読み取りに失敗しました");
    } finally {
      if (requestId === dataRequestIdRef.current) setDataBusy(false);
    }
  };

  const changeDataRow = (index, field, value) => {
    setDataRows((current) => {
      const next = current.map((row, rowIndex) => (
        rowIndex === index
          ? applySiteSevenFieldEdit(row, field, value)
          : row
      ));
      return field === "num"
        ? applyStoreLayoutRelations(next, islands, islandScopeId).rows
        : next;
    });
  };
  const applySuggestedMachineNumber = (index) => {
    setDataRows((current) => {
      const target = current[index];
      const suggestion = suggestedMachineNumberStatus(
        target,
        index,
        current,
        deltaNumberSet,
      );
      if (!suggestion.canApply) return current;
      const next = current.map((row, rowIndex) => (
        rowIndex === index
          ? {
            ...row,
            num: suggestion.num,
            reviewConfirmed: false,
            machineNumberResolutionSource: "manual-suggestion-applied",
          }
          : row
      ));
      return applyStoreLayoutRelations(next, islands, islandScopeId).rows;
    });
  };
  const pickDataRowMachine = (index, machine) => {
    const pickedName = typeof machine === "string" ? machine.trim() : String(machine?.name || "").trim();
    if (!pickedName) return;
    setDataRows((current) => {
      const target = current[index];
      const targetIslandId = target?.islandId == null ? "" : String(target.islandId);
      return current.map((row, rowIndex) => {
        const sameTarget = rowIndex === index;
        const sameIsland = targetIslandId && String(row?.islandId ?? "") === targetIslandId;
        if (!sameTarget && !sameIsland) return row;
        return {
          ...row,
          machineName: pickedName,
          machineNameSource: "manual",
          storeLayoutRelation: row?.storeLayoutRelation
            ? {
              ...row.storeLayoutRelation,
              status: "manual-override",
              manuallySelected: true,
              machineNameApplied: false,
            }
            : row?.storeLayoutRelation,
        };
      });
    });
  };
  const pickAllDataRowMachines = (machine) => {
    const pickedName = typeof machine === "string" ? machine.trim() : String(machine?.name || "").trim();
    if (!pickedName) return;
    setDataRows((current) => applySiteSevenMachineNameToRows(current, pickedName));
    setBulkMessage(`「${pickedName}」を全${dataRows.length}台に反映しました`);
  };
  const confirmDataRow = (index, checked) => {
    setDataRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const canConfirm = canConfirmSiteSevenRow(row, rowIndex, current, deltaNumberSet);
      const confirmed = checked && canConfirm;
      const editedFields = Array.isArray(row?.editedFields) ? row.editedFields : [];
      return {
        ...row,
        reviewConfirmed: confirmed,
        fieldAccepted: confirmed
          ? editedFields.reduce(
            (accepted, field) => ({ ...accepted, [field]: true }),
            { ...(row?.fieldAccepted || {}) },
          )
          : row?.fieldAccepted,
      };
    }));
  };
  const removeDataRow = (index) => {
    const target = dataRows[index];
    if (!target || target.sourceType === "missing-placeholder") return;
    const parsedNumber = parseSiteSevenEditableInteger(target.num);
    const rowLabel = parsedNumber !== null && parsedNumber > 0
      ? `台${parsedNumber}`
      : `画像内${target.sourceLine || index + 1}行目`;
    if (!window.confirm(
      `${rowLabel}の読み取り行を削除しますか？\n\n平均行や実在しない行の場合だけ削除してください。元の写真・PDF・CSVは削除されません。`,
    )) return;

    const removed = removeSiteSevenImportedRow(dataRows, index, dataSummary, {
      expectedNumbers: [...deltaNumberSet],
    });
    if (!removed.removedRow) return;
    setDataRows(removed.rows);
    setDataSummary(removed.summary);
    setMachinePickerRowIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  };

  // 差玉画像と大当たり情報（画像/PDF）をまとめて読み込み、1回のAI処理へ渡す。
  const handleAiFiles = async (files) => {
    const supported = Array.from(files || []).filter((file) =>
      file.type.startsWith("image/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );
    if (!supported.length || aiBusy || dataBusy) return;
    const requestId = ++aiRequestIdRef.current;
    setAiError("");
    setAiOk(false);
    setAiFileCount(supported.length);
    setAiBusy(true);
    dataRequestIdRef.current += 1;
    setDataBusy(false);
    setDataRows([]);
    setDataSummary(null);
    setDataError("");
    setText("");
    try {
      const attachments = await Promise.all(supported.map((file) => fileToAttachment(file)));
      const result = await readTaiDataAttachments({ apiKey: aiApiKey, attachments, prompt });
      if (requestId !== aiRequestIdRef.current) return;
      if (result.ok) {
        setText(result.text);
        setAiOk(true);
        setTimeout(() => setAiOk(false), 4000);
      } else {
        setAiError(result.message || "読み取りに失敗しました");
      }
    } catch {
      if (requestId !== aiRequestIdRef.current) return;
      setAiError("画像またはPDFの読み込みに失敗しました");
    } finally {
      if (requestId === aiRequestIdRef.current) setAiBusy(false);
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
  const expectedDataNumbers = useMemo(
    () => (Array.isArray(deltaRows) ? deltaRows : []).map((row) => row?.num),
    [deltaRows]
  );
  const preparedData = useMemo(() => prepareSiteSevenImportedRows(dataRows, {
    expectedNumbers: expectedDataNumbers,
  }), [dataRows, expectedDataNumbers]);
  const preparedText = useMemo(() => prepareSiteSevenImportedRows(parsed.rows, {
    expectedNumbers: expectedDataNumbers,
  }), [parsed.rows, expectedDataNumbers]);
  const dataIssueIndices = useMemo(() => {
    const duplicateNumbers = new Set(preparedData.duplicateNumbers || []);
    const unexpectedNumbers = new Set(preparedData.unexpectedNumbers || []);
    const issues = new Set();
    dataRows.forEach((row, index) => {
      const num = parseSiteSevenEditableInteger(row?.num);
      const normalSpins = parseSiteSevenEditableInteger(row?.normalSpins);
      const totalStarts = parseSiteSevenEditableInteger(row?.totalStarts);
      const normalizedNum = num === null ? "" : String(num);
      const invalid = num === null || num <= 0 || normalSpins === null || normalSpins < 0
        || totalStarts === null || totalStarts < 0;
      if ((row?.reviewRequired && !row?.reviewConfirmed)
        || invalid
        || duplicateNumbers.has(normalizedNum)
        || unexpectedNumbers.has(normalizedNum)) {
        issues.add(index);
      }
    });
    return issues;
  }, [dataRows, preparedData]);
  // 手動・外部AIの値より、画面で確認した端末内ファイルの値を優先する。
  const importRows = useMemo(() => {
    const byNumber = new Map();
    for (const row of preparedText.rows) byNumber.set(String(row.num), row);
    for (const row of preparedData.rows) byNumber.set(String(row.num), row);
    return Array.from(byNumber.values());
  }, [preparedData.rows, preparedText.rows]);
  const recognized = importRows.length;
  const deltaNumberSet = useMemo(
    () => new Set((Array.isArray(deltaRows) ? deltaRows : []).map((row) => String(row.num))),
    [deltaRows]
  );
  const bulkConfirmableIndices = useMemo(() => dataRows.flatMap((row, index) => (
    row?.reviewRequired === true
      && canConfirmSiteSevenRow(row, index, dataRows, deltaNumberSet)
      ? [index]
      : []
  )), [dataRows, deltaNumberSet]);
  const bulkConfirmedCount = bulkConfirmableIndices.filter(
    (index) => dataRows[index]?.reviewConfirmed === true,
  ).length;
  const allBulkReviewConfirmed = bulkConfirmableIndices.length > 0
    && bulkConfirmedCount === bulkConfirmableIndices.length;
  const someBulkReviewConfirmed = bulkConfirmedCount > 0 && !allBulkReviewConfirmed;
  useEffect(() => {
    if (bulkReviewCheckboxRef.current) {
      bulkReviewCheckboxRef.current.indeterminate = someBulkReviewConfirmed;
    }
  }, [someBulkReviewConfirmed]);
  const confirmAllDataRows = (checked) => {
    const targetIndices = checked
      ? bulkConfirmableIndices
      : dataRows.flatMap((row, index) => (
        row?.reviewRequired === true && row?.reviewConfirmed === true ? [index] : []
      ));
    if (!targetIndices.length) return;
    setDataRows((current) => setSiteSevenRowsReviewConfirmation(current, checked, targetIndices));
    setBulkMessage(checked
      ? `確認可能な${targetIndices.length}台を目視確認済みにしました`
      : `${targetIndices.length}台の目視確認済みを解除しました`);
  };
  const dataMatchedCount = useMemo(
    () => new Set(dataRows
      .filter((row) => row.sourceType !== "missing-placeholder"
        && deltaNumberSet.has(String(row.num)))
      .map((row) => String(row.num))).size,
    [dataRows, deltaNumberSet]
  );
  const dataReviewEntries = useMemo(() => {
    const query = dataFilter.trim().toLowerCase();
    const entries = dataRows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftPending = left.row.reviewRequired && !left.row.reviewConfirmed ? 0 : 1;
        const rightPending = right.row.reviewRequired && !right.row.reviewConfirmed ? 0 : 1;
        if (leftPending !== rightPending) return leftPending - rightPending;
        const leftMatched = deltaNumberSet.has(String(left.row.num)) ? 1 : 0;
        const rightMatched = deltaNumberSet.has(String(right.row.num)) ? 1 : 0;
        return leftMatched - rightMatched || left.index - right.index;
      });
    if (query) {
      return entries.filter(({ row }) =>
        String(row.num).toLowerCase().includes(query) ||
        String(row.machineNumberSuggested || "").toLowerCase().includes(query) ||
        String(row.machineName || "").toLowerCase().includes(query)
      );
    }
    if (showAllDataRows) return entries;
    // 普段は確認が必要な行だけを見せる。正常な数十台を毎回スクロール・確認させない。
    return entries.filter(({ index }) => dataIssueIndices.has(index)).slice(0, 12);
  }, [dataRows, dataFilter, showAllDataRows, deltaNumberSet, dataIssueIndices]);
  const deferredImportCount = dataIssueIndices.size
    + preparedText.invalidCount
    + preparedText.reviewPendingCount
    + preparedText.duplicateCount
    + preparedText.unexpectedCount
    + parsed.skipped.length;
  const dataSourceSummary = dataSummary
    ? [
        dataSummary.pdfCount > 0 ? `PDF ${dataSummary.pdfCount}` : "",
        dataSummary.imageCount > 0 ? `写真 ${dataSummary.imageCount}` : "",
        dataSummary.csvCount > 0 ? `CSV ${dataSummary.csvCount}` : "",
      ].filter(Boolean).join("・")
    : "";

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

        {/* サイトセブン台データの主経路。PDF・CSV・写真をすべて端末内で読む。 */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                  サイトセブンの台データを読み取る
                </div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 1.6 }}>
                  PDF・写真・CSVから台番号・通常中スタート・大当り回数を取得し、前画面の差玉と照合します
                </div>
              </div>
              <span style={{
                flexShrink: 0, borderRadius: 999, padding: "5px 8px",
                background: "color-mix(in srgb, var(--green) 14%, transparent)",
                border: `1px solid color-mix(in srgb, var(--green) 35%, transparent)`,
                color: C.green, fontSize: 10, fontWeight: 900,
              }}>
                すべてAPI不要・無料
              </span>
            </div>

            <div style={{
              marginTop: 10, padding: "9px 11px", borderRadius: 10,
              background: C.surfaceHi, border: `1px solid ${C.border}`,
              color: C.subHi, fontSize: 11, lineHeight: 1.6,
            }}>
              PDF・写真・CSVは外部へ送信せず、この端末の中だけで処理します。APIキーや追加料金は必要ありません。
            </div>

            <input
              ref={dataFileRef}
              type="file"
              accept="application/pdf,.pdf,image/*,.jpg,.jpeg,.png,.webp,text/csv,text/tab-separated-values,application/vnd.ms-excel,.csv,.tsv"
              multiple
              style={{ display: "none" }}
              onChange={(e) => { handleSiteSevenFiles(e.target.files); e.target.value = ""; }}
            />
            <button
              className="b"
              onClick={dataBusy || aiBusy ? undefined : () => dataFileRef.current?.click()}
              disabled={dataBusy || aiBusy}
              style={{
                width: "100%", minHeight: CTA, borderRadius: 12, marginTop: 12,
                border: "none", background: dataBusy || aiBusy ? C.surfaceHi : C.blue,
                color: dataBusy || aiBusy ? C.sub : "#fff", fontSize: 15, fontWeight: 900,
              }}
            >
              {dataBusy ? "台データを読み取り中…" : aiBusy ? "外部AIの完了を待っています…" : "PDF・写真・CSVを選ぶ"}
            </button>

            {dataSummary && (
              <div style={{
                background: "color-mix(in srgb, var(--green) 14%, transparent)",
                border: `1px solid color-mix(in srgb, var(--green) 35%, transparent)`,
                borderRadius: 10, padding: "10px 12px", marginTop: 10,
                fontSize: 13, color: C.green, fontWeight: 800, lineHeight: 1.6,
              }}>
                ✓ {dataSummary.fileCount}ファイル（{dataSourceSummary}）から{dataSummary.rowCount}台を読み取り
                {deltaNumberSet.size > 0 && `／差玉と${dataMatchedCount}台一致`}
                {(dataSummary.skippedCount > 0 || dataSummary.duplicateCount > 0) && (
                  <div style={{ color: C.yellow, fontSize: 11, marginTop: 4 }}>
                    要確認：目視確認が必要な台{dataSummary.skippedCount}台・重複{dataSummary.duplicateCount}台
                  </div>
                )}
                {dataSummary.degradedImageCount > 0 && (
                  <div style={{ color: C.yellow, fontSize: 11, marginTop: 4 }}>
                    圧縮または低解像度を検出しました。可能なら加工前の元画像を選んでください
                  </div>
                )}
                {dataSummary.missingCount > 0 && (
                  <div style={{ color: C.yellow, fontSize: 11, marginTop: 4 }}>
                    資料で確認できなかった{dataSummary.missingCount}台は、元資料を見て入力・確認してください
                  </div>
                )}
              </div>
            )}
            {dataError && (
              <div style={{
                background: "color-mix(in srgb, var(--red) 12%, transparent)",
                border: `1px solid color-mix(in srgb, var(--red) 35%, transparent)`,
                borderRadius: 10, padding: "10px 12px", marginTop: 10,
                fontSize: 12, color: C.red, fontWeight: 700, lineHeight: 1.6,
              }}>
                ⚠ {dataError}
              </div>
            )}
          </div>
        </Card>

        {/* 読み取り結果の修正。検索または全台表示で100台規模にも対応する。 */}
        {dataRows.length > 0 && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.text }}>読み取り結果を確認・修正</div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                    数字や機種名を修正し、平均・実在しない行は削除できます
                  </div>
                </div>
                <span style={{ color: C.green, fontSize: 12, fontWeight: 900 }}>{preparedData.rows.length}台</span>
              </div>

              <div style={{
                marginTop: 10, padding: 10, borderRadius: 11,
                background: "color-mix(in srgb, var(--blue) 8%, transparent)",
                border: `1px solid color-mix(in srgb, var(--blue) 28%, transparent)`,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  color: C.text, fontSize: 12, fontWeight: 900,
                }}>
                  <span>一括設定</span>
                  <span style={{ color: C.sub, fontSize: 10 }}>全{dataRows.length}台</span>
                </div>
                <label style={{
                  display: "flex", alignItems: "center", gap: 9, minHeight: TAP,
                  marginTop: 6, cursor: bulkConfirmableIndices.length ? "pointer" : "default",
                  color: bulkConfirmableIndices.length ? C.text : C.sub,
                }}>
                  <input
                    ref={bulkReviewCheckboxRef}
                    type="checkbox"
                    aria-label="確認可能な台をすべて目視確認済みにする"
                    checked={allBulkReviewConfirmed}
                    disabled={bulkConfirmableIndices.length === 0}
                    onChange={(event) => confirmAllDataRows(event.target.checked)}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 900 }}>
                      目視確認済みを一括チェック
                    </span>
                    <span style={{ display: "block", marginTop: 2, fontSize: 9, color: C.sub, lineHeight: 1.45 }}>
                      {bulkConfirmableIndices.length > 0
                        ? `数字がそろった要確認${bulkConfirmableIndices.length}台が対象です`
                        : "一括確認できる要確認台はありません"}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  className="b"
                  aria-label={`機種名を全${dataRows.length}台に反映`}
                  onClick={() => setMachinePickerRowIndex(BULK_MACHINE_PICKER_INDEX)}
                  style={{
                    width: "100%", minHeight: TAP, borderRadius: 9,
                    border: `1px solid ${C.blue}`, background: "transparent", color: C.blue,
                    padding: "0 11px", fontSize: 12, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  }}
                >
                  <span>機種名を全台に反映</span>
                  <span aria-hidden="true">機種を選ぶ ›</span>
                </button>
                {bulkMessage && (
                  <div style={{ marginTop: 7, color: C.green, fontSize: 10, fontWeight: 800, lineHeight: 1.5 }}>
                    ✓ {bulkMessage}
                  </div>
                )}
              </div>

              <input
                value={dataFilter}
                onChange={(e) => setDataFilter(e.target.value)}
                placeholder="台番号・機種名で検索"
                style={{
                  width: "100%", minHeight: TAP, boxSizing: "border-box", marginTop: 10,
                  borderRadius: 10, border: `1px solid ${C.border}`,
                  background: C.surfaceHi, color: C.text, padding: "0 12px", fontSize: 13,
                }}
              />

              <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
                {dataReviewEntries.map(({ row, index }) => (
                  <div key={index} style={{
                    padding: 10, borderRadius: 11, background: C.surfaceHi,
                    border: `1px solid ${row.reviewRequired && !row.reviewConfirmed ? C.yellow : C.border}`,
                  }}>
                    {(row.sourceFile || row.sourceLine || Number.isFinite(row.ocrConfidence)) && (
                      <div style={{ fontSize: 10, color: C.sub, marginBottom: 7, lineHeight: 1.5 }}>
                        {row.sourceFile || "選択した資料"}
                        {row.sourceLine ? `・画像内${row.sourceLine}行目` : ""}
                        {Number.isFinite(row.ocrConfidence)
                          ? `・読取信頼度${Math.round(row.ocrConfidence * 100)}%`
                          : ""}
                      </div>
                    )}
                    {row.reviewRequired && (
                      <div style={{
                        marginBottom: 9, padding: "8px 9px", borderRadius: 8,
                        background: "color-mix(in srgb, var(--yellow) 10%, transparent)",
                        color: row.reviewConfirmed ? C.green : C.yellow,
                        fontSize: 11, lineHeight: 1.55, fontWeight: 800,
                      }}>
                        <div>{row.reviewReason || "写真の数字を目視確認してください"}</div>
                        <label style={{
                          display: "flex", alignItems: "center", gap: 8, marginTop: 6,
                          minHeight: 32, cursor: "pointer",
                        }}>
                          <input
                            type="checkbox"
                            checked={Boolean(row.reviewConfirmed)}
                            disabled={!canConfirmSiteSevenRow(row, index, dataRows, deltaNumberSet)}
                            onChange={(e) => confirmDataRow(index, e.target.checked)}
                          />
                          この台の数字を目視確認済みにする
                        </label>
                      </div>
                    )}
                    {parseSiteSevenEditableInteger(row.machineNumberSuggested) > 0
                      && String(parseSiteSevenEditableInteger(row.machineNumberSuggested))
                        !== String(parseSiteSevenEditableInteger(row.num)) && (
                      <div style={{
                        marginBottom: 9, padding: "8px 9px", borderRadius: 8,
                        background: "color-mix(in srgb, var(--blue) 11%, transparent)",
                        border: `1px solid color-mix(in srgb, var(--blue) 32%, transparent)`,
                        color: C.subHi, fontSize: 11, lineHeight: 1.55,
                      }}>
                        <div>
                          店舗の台番号順からの候補: <strong style={{ color: C.text }}>台{row.machineNumberSuggested}</strong>
                        </div>
                        {parseSiteSevenEditableInteger(row.machineNumberObserved) > 0 && (
                          <div style={{ marginTop: 3 }}>
                            写真で読んだ候補: <strong style={{ color: C.text }}>台{row.machineNumberObserved}</strong>
                          </div>
                        )}
                        {!row.num ? (
                          <>
                            <button
                              type="button"
                              className="b"
                              disabled={!suggestedMachineNumberStatus(
                                row,
                                index,
                                dataRows,
                                deltaNumberSet,
                              ).canApply}
                              onClick={() => applySuggestedMachineNumber(index)}
                              style={{
                                width: "100%", minHeight: 38, marginTop: 7, borderRadius: 8,
                                border: `1px solid ${suggestedMachineNumberStatus(
                                  row,
                                  index,
                                  dataRows,
                                  deltaNumberSet,
                                ).canApply ? C.blue : C.border}`,
                                background: "transparent",
                                color: suggestedMachineNumberStatus(
                                  row,
                                  index,
                                  dataRows,
                                  deltaNumberSet,
                                ).canApply ? C.blue : C.sub,
                                fontSize: 11, fontWeight: 900,
                              }}
                            >
                              店舗候補を台番号欄へ入れる（確認はまだ完了しません）
                            </button>
                            {!suggestedMachineNumberStatus(
                              row,
                              index,
                              dataRows,
                              deltaNumberSet,
                            ).canApply && (
                              <div style={{ color: C.yellow, marginTop: 5, fontWeight: 800 }}>
                                {suggestedMachineNumberStatus(
                                  row,
                                  index,
                                  dataRows,
                                  deltaNumberSet,
                                ).reason}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ color: C.yellow, marginTop: 5, fontWeight: 800 }}>
                            入力中の台番号と候補が一致しないため、自動変更していません。元資料を見て正しい番号を選んでください。
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "82px minmax(0, 1fr)", gap: 8 }}>
                      <label style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>
                        台番号
                        <input
                          inputMode="numeric"
                          value={row.num}
                          onChange={(e) => changeDataRow(index, "num", e.target.value)}
                          style={{
                            width: "100%", height: 38, boxSizing: "border-box", marginTop: 3,
                            borderRadius: 8, border: `1px solid ${C.borderHi}`,
                            background: C.bg, color: C.text, padding: "0 8px", fontFamily: mono, fontWeight: 900,
                          }}
                        />
                      </label>
                      <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, minWidth: 0 }}>
                        機種名
                        <button
                          type="button"
                          className="b"
                          aria-label={`台${row.num}の機種名を選択`}
                          onClick={() => setMachinePickerRowIndex(index)}
                          style={{
                            width: "100%", minHeight: TAP, boxSizing: "border-box", marginTop: 3,
                            borderRadius: 8, border: `1px solid ${row.machineName ? C.borderHi : C.yellow}`,
                            background: C.bg, color: row.machineName ? C.text : C.yellow, padding: "0 8px",
                            fontSize: 12, fontWeight: 800, textAlign: "left", fontFamily: font,
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5,
                          }}
                        >
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.machineName || "機種を選ぶ"}
                          </span>
                          <span aria-hidden="true">›</span>
                        </button>
                        {row.island && (
                          <div style={{ color: C.sub, fontSize: 9, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.island}
                            {row?.storeLayoutRelation?.machineNameApplied && <span style={{ color: C.green }}>・自動</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <label style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>
                        通常中スタート
                        <input
                          inputMode="numeric"
                          value={row.normalSpins}
                          onChange={(e) => changeDataRow(index, "normalSpins", e.target.value)}
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
                          onChange={(e) => changeDataRow(index, "totalStarts", e.target.value)}
                          style={{
                            width: "100%", height: 38, boxSizing: "border-box", marginTop: 3,
                            borderRadius: 8, border: `1px solid ${C.borderHi}`,
                            background: C.bg, color: C.text, padding: "0 8px", fontFamily: mono, fontWeight: 800,
                          }}
                        />
                      </label>
                    </div>
                    {row.sourceType !== "missing-placeholder" && (
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}`,
                      }}>
                        <span style={{ color: C.sub, fontSize: 10, lineHeight: 1.5 }}>
                          平均・実在しない行のみ
                        </span>
                        <button
                          type="button"
                          className="b"
                          aria-label={`台${row.num || "番号不明"}の読み取り行を削除`}
                          onClick={() => removeDataRow(index)}
                          style={{
                            minWidth: 112, minHeight: TAP, borderRadius: 9, padding: "0 12px",
                            border: `1px solid color-mix(in srgb, var(--red) 45%, transparent)`,
                            background: "transparent", color: C.red, fontSize: 11, fontWeight: 900,
                          }}
                        >
                          この行を削除
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!dataReviewEntries.length && !showAllDataRows
                && !dataFilter.trim()
                && preparedData.invalidCount === 0
                && preparedData.reviewPendingCount === 0
                && preparedData.duplicateCount === 0
                && preparedData.unexpectedCount === 0 && (
                <div style={{
                  marginTop: 10, padding: "10px 12px", borderRadius: 10,
                  background: "color-mix(in srgb, var(--green) 9%, transparent)",
                  border: `1px solid color-mix(in srgb, var(--green) 28%, transparent)`,
                  color: C.green, fontSize: 12, fontWeight: 800,
                }}>
                  ✓ 確認が必要な台はありません（確認不要 {preparedData.rows.length}台）
                </div>
              )}

              {!dataFilter && dataRows.length > 12 && (
                <button
                  className="b"
                  onClick={() => setShowAllDataRows((current) => !current)}
                  style={{
                    width: "100%", minHeight: TAP, marginTop: 10, borderRadius: 10,
                    border: `1px solid ${C.border}`, background: "transparent",
                    color: C.subHi, fontSize: 12, fontWeight: 800,
                  }}
                >
                  {showAllDataRows ? "要確認の台だけ表示" : `確認不要を含む全${dataRows.length}台を表示`}
                </button>
              )}
              {preparedData.invalidCount > 0 && (
                <div style={{ color: C.red, fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                  ⚠ 数字が空欄の{preparedData.invalidCount}台は統合されません
                </div>
              )}
              {preparedData.reviewPendingCount > 0 && (
                <div style={{ color: C.yellow, fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                  ⚠ 要確認の{preparedData.reviewPendingCount}台は、確認済みにするまで統合されません
                </div>
              )}
              {preparedData.duplicateCount > 0 && (
                <div style={{ color: C.red, fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                  ⚠ 台番号が重複しています（{preparedData.duplicateNumbers.join("・")}）。正しい台番号へ直してください
                </div>
              )}
              {preparedData.unexpectedCount > 0 && (
                <div style={{ color: C.red, fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                  ⚠ 差玉側にない台番号があります（{preparedData.unexpectedNumbers.join("・")}）。台番号を確認してください
                </div>
              )}
              {deferredImportCount > 0 && recognized > 0 && (
                <div style={{ color: C.subHi, fontSize: 10, fontWeight: 700, lineHeight: 1.6, marginTop: 8 }}>
                  保留した行は今回の統合・保存には入りません。必要な場合は、元資料を直してもう一度取り込めます。
                </div>
              )}
            </div>
          </Card>
        )}

        <div style={{ fontSize: 11, color: C.sub, fontWeight: 800, margin: "18px 2px 8px" }}>
          有料の外部AI補助（通常は使いません）
        </div>

        {/* AI読み取りカード（任意の補助経路） */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: "14px" }}>
            {hasKey ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                  外部AI補助読み取り（任意・有料）
                </div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                  差玉資料と大当たり資料をまとめて再解析する場合に使います
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
                  onClick={aiBusy || dataBusy ? undefined : () => aiFileRef.current?.click()}
                  disabled={aiBusy || dataBusy}
                  style={{
                    width: "100%", minHeight: CTA, borderRadius: 12, marginTop: 12,
                    border: "none",
                    background: aiBusy || dataBusy ? C.surfaceHi : C.blue,
                    color: aiBusy || dataBusy ? C.sub : "#fff",
                    fontSize: 15, fontWeight: 900,
                  }}
                >
                  {aiBusy ? `読み取り中…（${aiFileCount}ファイル）` : dataBusy ? "無料読取の完了を待っています…" : "差玉＋大当たり資料をまとめて選ぶ"}
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
                  有料の外部AI補助を使う（任意・APIキーが必要）
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
                日付：{dateToSlash(analysisDate)}{"　"}店舗名：{store?.name || "未選択"}
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
        label={dataBusy
          ? "台データを読み取り中…"
          : aiBusy
            ? "外部AIで読み取り中…"
          : deferredImportCount > 0 && recognized > 0
            ? `安全な${recognized}台だけ先に統合（${deferredImportCount}台保留）`
          : deferredImportCount > 0
            ? `要確認${deferredImportCount}台（安全に統合できる台なし）`
          : "台データと差玉を台番号で統合する"}
        onClick={() => onMerge(importRows, { dataRows, dataSummary })}
        disabled={recognized === 0
          || dataBusy
          || aiBusy
        }
      />
      <MachinePickerSheet
        open={machinePickerRowIndex !== null}
        title={machinePickerRowIndex === BULK_MACHINE_PICKER_INDEX
          ? `全${dataRows.length}台に反映する機種を選択`
          : machinePickerRowIndex !== null && dataRows[machinePickerRowIndex]
          ? `台${dataRows[machinePickerRowIndex].num}の機種を選択`
          : "機種を選択"}
        customMachines={customMachines}
        onClose={() => setMachinePickerRowIndex(null)}
        onSelect={(picked) => {
          if (machinePickerRowIndex === BULK_MACHINE_PICKER_INDEX) pickAllDataRowMachines(picked);
          else if (machinePickerRowIndex !== null) pickDataRowMachine(machinePickerRowIndex, picked);
          setMachinePickerRowIndex(null);
        }}
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
  const [analysisDate, setAnalysisDate] = useState(todayStr);
  const [islandScopeId, setIslandScopeId] = useState(() => {
    const list = Array.isArray(islands) ? islands : [];
    return list.length === 1 ? String(list[0]?.id ?? "island-0") : "all";
  });
  const [images, setImages] = useState([]);
  const [slots, setSlots] = useState([]); // ピクセル解析の生スロット
  const [analysisReports, setAnalysisReports] = useState([]);
  const [analysisNumberOcr, setAnalysisNumberOcr] = useState(null);
  const [analysisJointMatch, setAnalysisJointMatch] = useState(null);
  const [analysisSiteSevenRows, setAnalysisSiteSevenRows] = useState([]);
  const [analysisSiteSevenSummary, setAnalysisSiteSevenSummary] = useState(null);
  const [autoImportedCount, setAutoImportedCount] = useState(0);
  const [confirmedMachineNumbers, setConfirmedMachineNumbers] = useState([]);
  const [rows, setRows] = useState([]);   // 台番号割り当て後の結果行
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");

  const activeIslandScopeId = islandScopeId === "all"
    || (Array.isArray(islands) ? islands : []).some((island, index) => (
      String(island?.id ?? `island-${index}`) === islandScopeId
    ))
    ? islandScopeId
    : "all";

  const scopedIslands = useMemo(() => {
    const list = Array.isArray(islands) ? islands : [];
    if (activeIslandScopeId === "all") return list;
    return list.filter((island, index) => (
      String(island?.id ?? `island-${index}`) === activeIslandScopeId
    ));
  }, [islands, activeIslandScopeId]);

  // 複数島を解析した時に、最初の1台の機種名を全台へ流用しない。
  // スキャン全体の機種名は「全行が同じ機種」の時だけ設定する。
  const machineName = useMemo(() => {
    if (!rows.length) return "";
    const names = rows.map((row) => String(row?.machineName || "").trim());
    if (names.some((name) => !name)) return "";
    const unique = new Set(names);
    return unique.size === 1 ? names[0] : "";
  }, [rows]);

  const handleAnalyzed = (analysis) => {
    const results = Array.isArray(analysis) ? analysis : (analysis?.slots || []);
    setSlots(results);
    setAnalysisReports(Array.isArray(analysis?.reports) ? analysis.reports : []);
    setAnalysisNumberOcr(analysis?.numberOcr || null);
    setAnalysisJointMatch(analysis?.jointMatch || null);
    const siteSevenRows = Array.isArray(analysis?.siteSevenRows) ? analysis.siteSevenRows : [];
    setAnalysisSiteSevenRows(applyStoreLayoutRelations(siteSevenRows, islands, activeIslandScopeId).rows);
    setAnalysisSiteSevenSummary(analysis?.siteSevenSummary || null);
    setConfirmedMachineNumbers([]);
    if (results.length > 0) setStep("numbers");
    // 0台のときは upload に留まる（やり直し可能）
  };

  const handleConfirmNumbers = (numbers, options = {}) => {
    const validation = validateNumberAssignment(slots, numbers);
    const reviewedNumberAssignment = validateReviewedNumberAssignment(slots, numbers, {
      jointOnly: Boolean(analysisJointMatch),
    });
    const hasImageError = analysisReports.some((report) => report?.error || !Number(report?.total));
    const hasOcrConflict = !analysisJointMatch && (
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
    const assignedRows = assignNumbers(slots, numbers).map((row, index) => {
      const slot = slots[index];
      const machineNumberSource = slot?.jointMatch?.accepted === true
        ? "joint-site-seven"
        : analysisJointMatch
          ? "manual-verified"
        : slot?.machineNumberOcr?.accepted === true
          ? "ocr"
          : options.storeMapVerified === true
            && String(options.storeCandidateNumbers?.[index] || "") === String(numbers[index] || "")
            ? "store-map-verified"
          : "manual-verified";
      return {
        ...row,
        machineNumberSource,
        machineNumberVerified: true,
      };
    });
    const preparedSiteSeven = prepareSiteSevenImportedRows(analysisSiteSevenRows, {
      expectedNumbers: numbers,
    });
    const autoMerged = preparedSiteSeven.rows.length
      ? mergeTaiData(assignedRows, preparedSiteSeven.rows)
      : { rows: assignedRows, matched: 0 };
    const related = applyStoreLayoutRelations(autoMerged.rows, islands, activeIslandScopeId);
    setRows(attachClippedDeltaRanges(related.rows));
    setAutoImportedCount(autoMerged.matched || 0);
    setConfirmedMachineNumbers(numbers.map((number) => String(number ?? "")));
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
      date: analysisDate || todayStr(),
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

  const handleUpdateMachineName = (machineNumber, nextMachineName) => {
    const pickedName = String(nextMachineName || "").trim();
    if (!pickedName) return;
    const target = rows.find((row) => String(row?.num) === String(machineNumber));
    const targetIslandId = target?.islandId == null ? "" : String(target.islandId);
    const targetIslandName = String(target?.island || "");
    const appliedCount = rows.filter((row) => (
      String(row?.num) === String(machineNumber)
      || (targetIslandId && String(row?.islandId ?? "") === targetIslandId)
    )).length;
    setRows((current) => {
      return current.map((row) => {
        const sameTarget = String(row?.num) === String(machineNumber);
        const sameIsland = targetIslandId && String(row?.islandId ?? "") === targetIslandId;
        if (!sameTarget && !sameIsland) return row;
        return {
          ...row,
          machineName: pickedName,
          machineNameSource: "manual",
          storeLayoutRelation: row?.storeLayoutRelation
            ? {
              ...row.storeLayoutRelation,
              status: "manual-override",
              manuallySelected: true,
              machineNameApplied: false,
            }
            : row?.storeLayoutRelation,
        };
      });
    });
    setSaved(false);
    setToast(targetIslandName && appliedCount > 1
      ? `${targetIslandName}の${appliedCount}台へ「${pickedName}」を設定しました`
      : `台${machineNumber}へ「${pickedName}」を設定しました`);
    setTimeout(() => setToast(""), 3000);
  };

  const handleMerge = (taiRows, importState = {}) => {
    const {
      rows: merged,
      matched,
      duplicateNumbers,
      invalidDeltaNumbers,
      conflictNumbers,
      unverifiedDeltaNumbers,
    } = mergeTaiData(rows, taiRows);
    const related = applyStoreLayoutRelations(merged, islands, activeIslandScopeId);
    const rowsWithManualSelections = attachClippedDeltaRanges(
      propagateManualMachineSelections(related.rows, taiRows),
    );
    setRows(rowsWithManualSelections);
    const reviewedSourceRows = Array.isArray(importState?.dataRows)
      ? importState.dataRows
      : [];
    if (reviewedSourceRows.length) {
      setAnalysisSiteSevenRows(reviewedSourceRows);
      setAnalysisSiteSevenSummary((current) => summarizeSiteSevenReviewState(
        importState.dataSummary || current,
        reviewedSourceRows,
      ));
    }
    setAutoImportedCount(matched || 0);
    setSaved(false);
    setStep("results");
    const remaining = validateDeltaRows(rowsWithManualSelections).unresolvedCount;
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
          islands={islands}
          islandScopeId={activeIslandScopeId}
          onChangeIslandScope={setIslandScopeId}
          images={images}
          analysisDate={analysisDate}
          setAnalysisDate={setAnalysisDate}
          setImages={(updater) => {
            setImages(updater);
            setSlots([]);
            setAnalysisReports([]);
            setAnalysisNumberOcr(null);
            setAnalysisJointMatch(null);
            setAnalysisSiteSevenRows([]);
            setAnalysisSiteSevenSummary(null);
            setAutoImportedCount(0);
            setConfirmedMachineNumbers([]);
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
          jointMatch={analysisJointMatch}
          siteSevenSummary={analysisSiteSevenSummary}
          initialNumbers={confirmedMachineNumbers}
          islands={scopedIslands}
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
          onUpdateMachineName={handleUpdateMachineName}
          saved={saved}
          customMachines={customMachines}
          siteSevenSummary={analysisSiteSevenSummary}
          autoImportedCount={autoImportedCount}
        />
      )}
      {step === "import" && (
        <ImportStep
          store={store}
          analysisDate={analysisDate}
          rows={rows}
          onBack={() => setStep("results")}
          onMerge={handleMerge}
          aiApiKey={aiApiKey}
          onChangeAiApiKey={onChangeAiApiKey}
          initialDataRows={analysisSiteSevenRows}
          initialDataSummary={analysisSiteSevenSummary}
          islands={islands}
          islandScopeId={activeIslandScopeId}
          customMachines={customMachines}
        />
      )}
    </div>
  );
}
