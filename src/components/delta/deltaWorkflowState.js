function normalizedMachineNumber(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? text : "";
}

function imageIdentity(image, index) {
  const file = image?.file;
  return [
    index,
    String(image?.id ?? ""),
    String(image?.name ?? file?.name ?? ""),
    Number(file?.size ?? image?.size ?? 0),
    Number(file?.lastModified ?? image?.lastModified ?? 0),
    String(image?.dataUrl ?? "").length,
  ];
}

// 非同期解析の開始時と完了時で、画像の追加・削除・順番が変わっていないか比較する。
export function createImageSelectionSnapshot(images) {
  return JSON.stringify((Array.isArray(images) ? images : []).map(imageIdentity));
}

export function shouldAcceptImageAnalysis({
  requestId,
  activeRequestId,
  selectionSnapshot,
  currentImages,
}) {
  return requestId === activeRequestId
    && selectionSnapshot === createImageSelectionSnapshot(currentImages);
}

export function trustedMachineNumberForSlot(slot, { jointOnly = false } = {}) {
  if (slot?.jointMatch?.accepted === true) {
    return normalizedMachineNumber(slot.jointMatch.resolvedNum);
  }
  if (jointOnly) return "";
  if (slot?.machineNumberOcr?.accepted === true) {
    return normalizedMachineNumber(
      slot.machineNumberOcr.candidate
      ?? slot.machineNumberCandidate
      ?? slot.machineNumber,
    );
  }
  return "";
}

// 信頼済み番号は常に固定し、利用者の入力は未解決slotだけに差し込む。
export function buildPartialMachineNumberAssignment(slots, manualByIndex = {}, options = {}) {
  return (Array.isArray(slots) ? slots : []).map((slot, index) => (
    trustedMachineNumberForSlot(slot, options)
      || normalizedMachineNumber(manualByIndex?.[index])
  ));
}

// 結果画面から番号設定へ戻った時、固定点以外の確認済み入力だけを復元する。
export function seedPartialMachineNumberInputs(slots, numbers, options = {}) {
  const values = Array.isArray(numbers) ? numbers : [];
  return (Array.isArray(slots) ? slots : []).reduce((seed, slot, index) => {
    if (trustedMachineNumberForSlot(slot, options)) return seed;
    const value = normalizedMachineNumber(values[index]);
    if (value) seed[index] = value;
    return seed;
  }, {});
}

export function summarizeSiteSevenReviewState(summary, rows) {
  if (!summary || !Array.isArray(rows) || !rows.length) return summary || null;
  const reviewCount = rows.filter((row) => (
    row?.reviewRequired === true && row?.reviewConfirmed !== true
  )).length;
  return {
    ...summary,
    reviewCount,
    skippedCount: reviewCount,
  };
}
