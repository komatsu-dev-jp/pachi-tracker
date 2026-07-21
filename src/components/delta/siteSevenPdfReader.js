// ブラウザ内でサイトセブンPDFの文字情報を読む。
// PDFは外部へ送信せず、端末内でPDF.jsを使って処理する。

import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import adobeJapanCMapUrl from "pdfjs-dist/cmaps/Adobe-Japan1-UCS2.bcmap?url";
import { parseSiteSevenTextPages } from "./siteSevenPdfParser.js";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// サイトセブンPDFの日本語フォントを文字へ戻す対応表を、通信なしで読み込む。
class SiteSevenBinaryDataFactory {
  async fetch({ kind, filename }) {
    if (kind !== "cMapUrl" || filename !== "Adobe-Japan1-UCS2.bcmap") {
      throw new Error(`未対応のPDF文字マップです: ${filename || kind}`);
    }
    const response = await fetch(adobeJapanCMapUrl);
    if (!response.ok) throw new Error("日本語文字マップを読み込めませんでした");
    return new Uint8Array(await response.arrayBuffer());
  }
}

function pdfReadError(message, code, parsed) {
  const error = new Error(message);
  error.code = code;
  error.extractionMode = parsed?.extractionMode || "unknown";
  error.details = {
    pageCount: Number(parsed?.pageCount) || 0,
    textItemCount: Number(parsed?.textItemCount) || 0,
    headerCount: Number(parsed?.headerCount) || 0,
    skippedCount: Array.isArray(parsed?.skipped) ? parsed.skipped.length : 0,
  };
  return error;
}

export async function readSiteSevenPdf(file, { dateText = "", storeName = "" } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("PDFファイルを選んでください");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: "bundled-cmaps/",
    cMapPacked: true,
    BinaryDataFactory: SiteSevenBinaryDataFactory,
    useWorkerFetch: false,
  });

  try {
    const document = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({ pageNumber, items: content.items });
      page.cleanup();
    }

    const parsed = parseSiteSevenTextPages(pages, { dateText, storeName });
    if (!parsed.rows.length) {
      if (parsed.extractionMode === "image-only") {
        throw pdfReadError(
          "このPDFは文字を直接取得できない画像PDFです。各ページを写真として読み取り、数値を要確認にしてください",
          "SITE_SEVEN_IMAGE_ONLY_PDF",
          parsed,
        );
      }
      if (!parsed.schemaDetected) {
        throw pdfReadError(
          "サイトセブンの6列見出しを確認できませんでした。元の台データPDFまたはCSVを選んでください",
          "SITE_SEVEN_PDF_SCHEMA_NOT_FOUND",
          parsed,
        );
      }
      throw pdfReadError(
        "6列の台データを安全に確定できませんでした。読み取れない行を要確認にしてください",
        "SITE_SEVEN_PDF_ROWS_UNRESOLVED",
        parsed,
      );
    }
    return parsed;
  } finally {
    await loadingTask.destroy();
  }
}

