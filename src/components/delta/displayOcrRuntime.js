import { parseDisplayOcrText } from "./displayOcr.js";

// The paths are deliberately same-origin. If the optional language assets are not
// cached yet (for example offline first launch), callers receive an error and must
// keep the review in manual-input mode; Tesseract never falls back to a cloud URL.
const OCR_ASSET_VERSION = "tesseract-v7-data-v2";
const OCR_BASE = `${import.meta.env?.BASE_URL || "/"}ocr/${OCR_ASSET_VERSION}`;

export async function recognizeDisplayImage(file, { signal, onProgress } = {}) {
  const rows = await recognizeDisplayImages([file], { signal, onProgress });
  return rows[0];
}

export async function recognizeDisplayImages(files, { signal, onProgress, createWorkerImpl } = {}) {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const createWorker = createWorkerImpl || (await import("tesseract.js")).createWorker;
  let worker;
  let terminated = false;
  const terminate = async () => {
    if (terminated) return;
    terminated = true;
    await worker?.terminate?.();
  };
  const abort = () => { void terminate(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    worker = await createWorker("jpn+eng", 1, {
      langPath: OCR_BASE,
      workerPath: `${OCR_BASE}/worker.min.mjs`,
      corePath: `${OCR_BASE}/tesseract-core.wasm.js`,
      legacyCore: true,
      legacyLang: true,
      logger: (message) => onProgress?.(message),
    });
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const rows = [];
    for (const file of Array.isArray(files) ? files : []) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const result = await worker.recognize(file);
      rows.push(parseDisplayOcrText(result?.data?.text || ""));
      onProgress?.({ completed: rows.length, total: files.length });
    }
    return rows;
  } finally {
    // Worker memory is material on lower-memory phones. Always release it on
    // success, cancellation, navigation cleanup, and initial-download failure.
    signal?.removeEventListener("abort", abort);
    await terminate();
  }
}

export { OCR_ASSET_VERSION, OCR_BASE };

/** Cancels superseded runs so late OCR callbacks cannot update the active batch. */
export function createDisplayOcrSession(recognize = recognizeDisplayImages) {
  let generation = 0;
  let controller = null;
  const cancel = () => {
    generation += 1;
    const previous = controller;
    controller = null;
    previous?.abort();
  };
  const run = async (files, options = {}) => {
    // Invalidate before aborting. Some workers resolve/reject after abort, so
    // their callbacks must already be stale at that point.
    const previous = controller;
    const current = ++generation;
    controller = null;
    previous?.abort();
    controller = new AbortController();
    const currentController = controller;
    const batchFiles = Array.isArray(files) ? [...files] : [];
    const isCurrent = () => current === generation;
    if (isCurrent()) options.onStart?.({ generation: current, files: batchFiles });
    try {
      const rows = await recognize(batchFiles, { signal: currentController.signal, onProgress: (value) => { if (isCurrent()) options.onProgress?.(value, { generation: current, files: batchFiles }); } });
      if (!isCurrent()) return { stale: true, rows: [] };
      options.onSuccess?.(rows, { generation: current, files: batchFiles });
      return { stale: false, rows };
    } catch (error) {
      if (!isCurrent()) return { stale: true, rows: [] };
      options.onError?.(error, { generation: current, files: batchFiles });
      throw error;
    } finally {
      if (isCurrent()) {
        controller = null;
        options.onSettled?.({ generation: current, files: batchFiles });
      }
    }
  };
  return { run, cancel, get generation() { return generation; } };
}
