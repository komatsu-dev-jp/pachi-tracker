// 貯玉/持ち玉プレーの「実測消費玉」確定ロジック（純関数）
//
// 背景:
//   通常入力（decide）では貯玉/持ち玉の消費を「1Kあたり rentBalls 玉（既定250玉）」
//   という固定値で暫定計上している。これは台の玉数を読めない打鍵中の概算に過ぎない。
//   一方、初当たり時にはユーザーが「開始上皿玉数（＝その時点の上皿残玉）」を入力する。
//   区間開始時の玉数と残玉の差が「本当に使った玉数」なので、当たりのタイミングで
//   その実測値へ置き換える（リコンサイル）。
//
// 設計上の制約:
//   - src/logic.js は変更禁止。deriveFromRows は各 data 行の ballsConsumed を
//     「正の値があればそれを優先、無ければ rentBalls」で読む。
//     よって本関数は rotRows の ballsConsumed を「区間合計＝実測消費」になるよう
//     書き直すだけで、計算式そのものには一切触れない。
//   - 回転率は「総回転数 ÷ 総消費K数」でしか効かないため、区間内の各行への
//     配分方法は回転率の値に影響しない（合計さえ合えばよい）。表示の自然さのため
//     各行の thisRot に比例配分する。

// rows: rotRows 全体（初当たりの hit data 行が追加済みの状態）
// opts.playMode: "chodama" | "mochi"（この区間のモード）
// opts.trayRemaining: 当たり時の上皿残玉（開始上皿玉数）
// opts.currentBalance: 現在の貯玉/持ち玉残高（= 区間開始玉 − 暫定消費の累計）
// 返り値: ballsConsumed を更新した新しい rows 配列（条件を満たさない場合は元配列をそのまま返す）
// 注: 玉数→K数の換算（÷rentBalls）は deriveFromRows 側で行うため本関数では rentBalls 不要。
export function reconcileSegmentConsumption(rows, { playMode, trayRemaining, currentBalance }) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    if (playMode !== "chodama" && playMode !== "mochi") return rows;

    // 直近の通常区間 = 「ひとつ前の hit 行」より後ろ（無ければ先頭）から今回の hit data 行まで
    const hitIdxs = [];
    rows.forEach((r, i) => { if (r.type === "hit") hitIdxs.push(i); });
    const prevHitIdx = hitIdxs.length >= 2 ? hitIdxs[hitIdxs.length - 2] : -1;

    // 区間内の「このモードの」data 行だけを対象にする（現金プッシュ行などは除外）
    const segIdxs = [];
    for (let i = prevHitIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (r.type === "data" && r.mode === playMode) segIdxs.push(i);
    }
    if (segIdxs.length === 0) return rows;

    // 暫定消費（固定250玉など）の累計。これを残高に足し戻すと区間開始玉が復元できる。
    const assumedSum = segIdxs.reduce((s, i) => s + (Number(rows[i].ballsConsumed) || 0), 0);
    const segmentStartBalls = (Number(currentBalance) || 0) + assumedSum;

    const trueConsumed = segmentStartBalls - (Number(trayRemaining) || 0);
    const totalRot = segIdxs.reduce((s, i) => s + (Number(rows[i].thisRot) || 0), 0);

    // 実測が負（残玉のほうが多い等の入力矛盾）や回転数0なら何もしない（暫定値を維持）
    if (!(trueConsumed > 0) || !(totalRot > 0)) return rows;

    // thisRot 比例で配分。最終行に丸め残差を吸収させ、各行は最低1玉とする。
    const next = rows.slice();
    let assigned = 0;
    segIdxs.forEach((rowIdx, k) => {
        let consumed;
        if (k === segIdxs.length - 1) {
            consumed = Math.max(1, trueConsumed - assigned);
        } else {
            const thisRot = Number(rows[rowIdx].thisRot) || 0;
            consumed = Math.max(1, Math.round(trueConsumed * (thisRot / totalRot)));
            assigned += consumed;
        }
        next[rowIdx] = { ...next[rowIdx], ballsConsumed: consumed };
    });
    return next;
}
