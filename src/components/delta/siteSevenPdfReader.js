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
      throw new Error("台データを見つけられませんでした。画像だけのPDFはAI補助読み取りを使ってください");
    }
    return parsed;
  } finally {
    await loadingTask.destroy();
  }
}

