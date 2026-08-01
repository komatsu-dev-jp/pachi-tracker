import { hasTrustedHeaderContextEvidence } from "./pushInbox.js";

export const OBSERVED_CONTEXT_CORRECTION_SCHEMA =
  "pachi-tracker.observed-context-correction";
export const OBSERVED_CONTEXT_CORRECTION_VERSION = 1;

const KNOWN_STORE_OCR_ALIASES = new Map([
  ["スーバーキスケPA0", "スーパーキスケPAO"],
]);

function normalizedExactLabel(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function normalizedStoreName(value) {
  return normalizedExactLabel(value)
    .replace(/\s+/gu, "")
    .toLocaleLowerCase("ja-JP");
}

function hasValidSourceFingerprint(scan) {
  const fingerprint = scan?.sourceFingerprint;
  return String(fingerprint?.algorithm || "").toUpperCase() === "SHA-256"
    && /^[a-f0-9]{64}$/u.test(String(fingerprint?.hash || "").toLowerCase());
}

export function canonicalizeTrustedObservedStoreName(value) {
  const source = normalizedExactLabel(value);
  return KNOWN_STORE_OCR_ALIASES.get(source) || String(value ?? "");
}

export function repairTrustedObservedStoreAliases(
  scans,
  stores,
  { correctedAt } = {},
) {
  const sourceScans = Array.isArray(scans) ? scans : [];
  const registeredStores = (Array.isArray(stores) ? stores : [])
    .filter((store) => store && typeof store === "object");
  const correctionTime = String(correctedAt || "").trim() || new Date().toISOString();
  let repairedCount = 0;

  const repairedScans = sourceScans.map((scan) => {
    if (!scan || typeof scan !== "object") return scan;
    if (!hasTrustedHeaderContextEvidence(scan) || !hasValidSourceFingerprint(scan)) {
      return scan;
    }
    if (
      scan.storeId !== null
      && scan.storeId !== undefined
      && String(scan.storeId).trim()
    ) {
      return scan;
    }

    const fromStoreName = String(scan.storeName || "").trim();
    const toStoreName = canonicalizeTrustedObservedStoreName(fromStoreName);
    if (!toStoreName || toStoreName === fromStoreName) return scan;

    const matches = registeredStores.filter(
      (store) => normalizedStoreName(store.name) === normalizedStoreName(toStoreName),
    );
    if (matches.length !== 1) return scan;

    const registeredStore = matches[0];
    repairedCount += 1;
    return {
      ...scan,
      storeId: registeredStore.id,
      storeName: String(registeredStore.name || toStoreName).trim(),
      contextCorrection: {
        schema: OBSERVED_CONTEXT_CORRECTION_SCHEMA,
        version: OBSERVED_CONTEXT_CORRECTION_VERSION,
        reason: "known-site7-ocr-alias",
        fromStoreName,
        toStoreName: String(registeredStore.name || toStoreName).trim(),
        correctedAt: correctionTime,
      },
    };
  });

  return {
    scans: repairedCount > 0 ? repairedScans : sourceScans,
    repairedCount,
  };
}
