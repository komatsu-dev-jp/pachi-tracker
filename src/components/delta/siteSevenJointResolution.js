// 共同照合で安全に対応した表行へ、確定した台番号と監査情報を反映する純粋関数。
// 台番号だけが要確認だった行は解除し、回転数など別項目の要確認はそのまま残す。

export function resolveMatchedSiteSevenRows(tableRows, matches) {
  const rows = Array.isArray(tableRows) ? tableRows : [];
  const matchByTableIndex = new Map(
    (Array.isArray(matches) ? matches : [])
      .filter((match) => match?.accepted === true && Number.isInteger(match.tableIndex))
      .map((match) => [match.tableIndex, match]),
  );

  return rows.map((row, tableIndex) => {
    const match = matchByTableIndex.get(tableIndex);
    if (!match) return row;
    const nonNumberReviewRequired = row?.nonNumberReviewRequired === true;
    return {
      ...row,
      num: String(match.resolvedNum),
      numAccepted: true,
      fieldAccepted: row?.fieldAccepted
        ? { ...row.fieldAccepted, num: true }
        : row?.fieldAccepted,
      fieldReviewRequired: row?.fieldReviewRequired
        ? { ...row.fieldReviewRequired, num: false }
        : row?.fieldReviewRequired,
      fieldReviewReason: row?.fieldReviewReason
        ? { ...row.fieldReviewReason, num: "" }
        : row?.fieldReviewReason,
      reviewRequired: nonNumberReviewRequired,
      reviewConfirmed: false,
      reviewReason: nonNumberReviewRequired
        ? row?.nonNumberReviewReason || row?.reviewReason || ""
        : "",
      matchedBy: match.matchedBy,
      jointMatchAccepted: true,
      jointPanelId: match.panelId,
    };
  });
}
