// 差玉解析：APIキー設定者向けワンタップAI読み取りクライアント
//
// Anthropic Messages API をブラウザから直接呼び、差玉画像と大当たり情報（画像/PDF）を
// 1回のリクエストで台番号ごとの TSV へ統合する。
// 外部ライブラリは使わず fetch のみ。APIキー未設定時は呼ばれない（手動フローが従来どおり動く）。
// 画像はAnthropic APIに送信される（端末内完結のピクセル解析とは別物）。
// logic.js・rotRows とは無関係の独立データ。

// Anthropicの最新Opus。モデルを変えるときはここだけ書き換える。
export const AI_MODEL = "claude-opus-4-8";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 8192;
const MAX_LONG_EDGE = 1568; // 長辺の上限（トークン費用・5MB制限対策）
const JPEG_QUALITY = 0.85;

// dataURL（"data:...;base64,XXXX"）から base64 本体だけを取り出す。
function stripDataUrlPrefix(dataUrl) {
  const str = String(dataUrl || "");
  const comma = str.indexOf(",");
  return comma >= 0 ? str.slice(comma + 1) : str;
}

// 画像 dataURL を Canvas で長辺 1568px に縮小し、JPEG(0.85) で再エンコードする。
// それ以下のサイズならリサイズせずそのまま JPEG 化する。
// 戻り値: { base64, mediaType: "image/jpeg" }
export function prepareImageForAi(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const longEdge = Math.max(img.width, img.height);
        const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const jpegUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve({ base64: stripDataUrlPrefix(jpegUrl), mediaType: "image/jpeg" });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("画像読み込み失敗"));
    img.src = dataUrl;
  });
}

// 画像またはPDFを Messages API の content block へ変換する。
// 画像は従来どおり長辺を縮小し、PDFはレイアウトを保ったまま base64 document として送る。
export async function prepareAttachmentForAi(attachment = {}) {
  const dataUrl = String(attachment.dataUrl || "");
  const mediaType = String(attachment.mediaType || attachment.type || "").toLowerCase();
  const isPdf = mediaType === "application/pdf" || String(attachment.name || "").toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const data = stripDataUrlPrefix(dataUrl);
    if (!data) throw new Error("PDF読み込み失敗");
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }

  if (mediaType.startsWith("image/") || dataUrl.startsWith("data:image/")) {
    const prepared = await prepareImageForAi(dataUrl);
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: prepared.mediaType,
        data: prepared.base64,
      },
    };
  }

  throw new Error("未対応のファイル形式");
}

// レスポンスJSONの content 配列から text ブロックを連結して返す（純粋関数）。
// stop_reason === "refusal" の場合は { refused: true } を返す。
export function extractText(responseJson) {
  const json = responseJson || {};
  if (json.stop_reason === "refusal") return { refused: true };
  const content = Array.isArray(json.content) ? json.content : [];
  const text = content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  return { refused: false, text };
}

// HTTPステータス／エラー種別を日本語メッセージへ変換する（純粋関数）。
// errorType（Anthropicの error.type）は将来の細分化用に受け取るが現状はステータスで分岐する。
// eslint-disable-next-line no-unused-vars
export function apiErrorMessage(status, errorType) {
  switch (status) {
    case 401:
      return "APIキーが無効です。設定を確認してください";
    case 429:
      return "リクエストが集中しています。少し待って再試行してください";
    case 413:
      return "添付ファイルのサイズが大きすぎます";
    case 400:
      return "リクエストエラー（画像・PDF形式を確認してください）";
    case 500:
    case 529:
      return "AIサービスが混雑しています。少し待って再試行してください";
    default:
      return `読み取りに失敗しました（エラー${status}）`;
  }
}

// 複数の画像/PDFと読み取りプロンプトを Anthropic API に送り、統合済みテキストを得る。
// 成功: { ok: true, text } / 失敗: { ok: false, message }
export async function readTaiDataAttachments({ apiKey, attachments, prompt }) {
  const files = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (!files.length) return { ok: false, message: "差玉データと大当たり情報を選んでください" };

  let contentBlocks;
  try {
    contentBlocks = await Promise.all(files.map((file) => prepareAttachmentForAi(file)));
  } catch {
    return { ok: false, message: "画像またはPDFの読み込みに失敗しました" };
  }

  const body = {
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          ...contentBlocks,
          { type: "text", text: String(prompt || "") },
        ],
      },
    ],
    // temperature / top_p / top_k / thinking は claude-opus-4-8 では送らない（400エラーになる）。
  };

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": String(apiKey || ""),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "通信に失敗しました。電波状況を確認してください" };
  }

  if (!res.ok) {
    return { ok: false, message: apiErrorMessage(res.status) };
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: "読み取り結果の解析に失敗しました" };
  }

  const out = extractText(json);
  if (out.refused) {
    return { ok: false, message: "AIが読み取りを辞退しました。手動貼り付けをご利用ください" };
  }
  return { ok: true, text: out.text };
}

// 旧呼び出しとの後方互換。単一画像でも従来どおり利用できる。
export function readTaiDataImage({ apiKey, dataUrl, prompt }) {
  return readTaiDataAttachments({
    apiKey,
    attachments: [{ dataUrl, mediaType: "image/*" }],
    prompt,
  });
}
