const SHA256_HEX = /^[a-f0-9]{64}$/u;

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeHash(value) {
  const hash = String(value ?? "").trim().toLowerCase();
  return SHA256_HEX.test(hash) ? hash : "";
}

export function normalizeSourceFingerprint(value) {
  if (!value || typeof value !== "object") return null;
  if (value.algorithm !== "SHA-256") return null;
  const hash = normalizeHash(value.hash);
  const fileHashes = (Array.isArray(value.fileHashes) ? value.fileHashes : [])
    .map(normalizeHash)
    .filter(Boolean)
    .sort();
  const fileCount = Number(value.fileCount);
  if (!hash || !Number.isInteger(fileCount) || fileCount <= 0 || fileHashes.length !== fileCount) {
    return null;
  }
  return {
    algorithm: "SHA-256",
    hash,
    fileCount,
    fileHashes,
  };
}

async function sha256(bytes, subtle) {
  const digest = await subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function createSourceFingerprint(files, {
  cryptoObject = globalThis.crypto,
} = {}) {
  const sourceFiles = (Array.isArray(files) ? files : [])
    .filter((file) => file && typeof file.arrayBuffer === "function");
  const subtle = cryptoObject?.subtle;
  if (!sourceFiles.length) throw new Error("取込元ファイルがありません");
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("この端末では重複確認用のSHA-256を利用できません");
  }

  // 同じファイルを別の選択画面から重ねて選んでも、資料集合としては1件にまとめる。
  const fileHashes = [...new Set(await Promise.all(sourceFiles.map(async (file) => (
    sha256(await file.arrayBuffer(), subtle)
  ))))].sort();
  const aggregateBytes = new TextEncoder().encode(fileHashes.join("\n"));
  return normalizeSourceFingerprint({
    algorithm: "SHA-256",
    hash: await sha256(aggregateBytes, subtle),
    fileCount: fileHashes.length,
    fileHashes,
  });
}
