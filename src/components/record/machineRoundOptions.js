const DEFAULT_ROUNDS = [3, 4, 5, 6, 7, 8, 9, 10];

const makeOption = (rounds, mult = 1) => {
  const rawRounds = Number(rounds);
  const multiplier = Math.max(1, Number(mult) || 1);
  if (!Number.isFinite(rawRounds) || rawRounds <= 0) return null;
  return {
    rounds: rawRounds,
    mult: multiplier,
    totalRounds: rawRounds * multiplier,
  };
};

/**
 * 「10R×4」「10R×2～6」「2R or 10R×5」などを、記録用の選択肢へ変換する。
 * 範囲表記は下限と上限を別々の選択肢にし、ユーザーが実際の獲得回数を選べるようにする。
 */
export function parseRoundOptions(value) {
  const text = String(value ?? "");
  const options = [];
  const pattern = /(\d+)\s*R(?:\s*[×xX＊*]\s*(\d+)(?:\s*[～〜~-]\s*(\d+))?)?/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const rounds = Number(match[1]);
    const lowerMult = Number(match[2]) || 1;
    options.push(makeOption(rounds, lowerMult));
    if (match[3] && Number(match[3]) !== lowerMult) {
      options.push(makeOption(rounds, Number(match[3])));
    }
  }
  return options.filter(Boolean);
}

const addUnique = (target, seen, option) => {
  if (!option) return;
  const key = `${option.rounds}-${option.mult}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push(option);
};

/**
 * 簡易文字列だけでなく、状態別の詳細振分（hesoModes / rushModes）も全て読む。
 */
export function getMachineRoundOptions(machine, phase = "heso") {
  const fallback = DEFAULT_ROUNDS.map((rounds) => makeOption(rounds));
  if (!machine) return fallback;

  const options = [];
  const seen = new Set();
  const modes = phase === "rush" ? machine.rushModes : machine.hesoModes;
  for (const mode of Array.isArray(modes) ? modes : []) {
    for (const row of Array.isArray(mode?.rows) ? mode.rows : []) {
      if (Number.isFinite(Number(row?.recordRounds)) && Number(row.recordRounds) > 0) {
        addUnique(options, seen, makeOption(Number(row.recordRounds), Number(row.recordMult) || 1));
        continue;
      }
      const source = row?.roundsLabel ?? row?.rounds;
      if (typeof source === "number") {
        addUnique(options, seen, makeOption(source));
      } else {
        for (const option of parseRoundOptions(source)) addUnique(options, seen, option);
      }
    }
  }

  // 50%上乗せループなど、終了回数が実戦ごとに変わる機種の開始候補。
  for (const loop of Array.isArray(machine.roundLoops) ? machine.roundLoops : []) {
    if ((loop?.phase || "rush") !== phase) continue;
    for (const mult of Array.isArray(loop.baseMultipliers) ? loop.baseMultipliers : []) {
      addUnique(options, seen, makeOption(loop.rounds, mult));
    }
  }

  // 状態別振分がある場合はそちらを正とする。簡易文字列も足すと、
  // 「10R×2」と同じ意味の「20R」が二重に並ぶため、詳細が無い時だけ補完する。
  if (options.length === 0) {
    const dist = phase === "rush"
      ? (machine.rushDist || machine.roundDist)
      : machine.roundDist;
    for (const option of parseRoundOptions(dist)) addUnique(options, seen, option);
  }

  if (options.length === 0) return fallback;
  return options.sort((a, b) => a.totalRounds - b.totalRounds || a.rounds - b.rounds || a.mult - b.mult);
}

/** 選択中のR数に対応する上乗せループ設定を返す。未登録機種はnull。 */
export function getMachineRoundLoop(machine, phase, rounds) {
  if (!machine || !Number(rounds)) return null;
  return (Array.isArray(machine.roundLoops) ? machine.roundLoops : []).find((loop) =>
    (loop?.phase || "rush") === phase && Number(loop?.rounds) === Number(rounds)
  ) || null;
}

/** セット回数の増減。専用ループは開始倍率以降だけ機種固有の刻みを使う。 */
export function changeRoundMultiplier(currentMult, direction, loop = null) {
  const current = Math.max(1, Number(currentMult) || 1);
  const dir = direction < 0 ? -1 : 1;
  const loopBase = Math.max(1, Number(loop?.loopBaseMult) || 1);
  const loopStep = Math.max(1, Number(loop?.incrementMult) || 1);
  const step = current >= loopBase ? loopStep : 1;
  if (dir < 0 && current > loopBase && current - step < loopBase) return loopBase;
  return Math.max(1, current + dir * step);
}

/** 10R×Nを画面上は1回の大当たり、集計上は合計R数として保存する。 */
export function buildMultiRoundHit(hitNumber, {
  rounds,
  mult = 1,
  displayBalls = 0,
  lastOutBalls = 0,
  nextTimingBalls = 0,
  elecSapoRot = 0,
  time,
}) {
  const rawRounds = Number(rounds) || 0;
  const multiplier = Math.max(1, Number(mult) || 1);
  const perBonusDisplayBalls = Number(displayBalls) || 0;
  const totalDisplayBalls = perBonusDisplayBalls * multiplier;
  const lastOut = Number(lastOutBalls) || 0;
  const nextTiming = Number(nextTimingBalls) || 0;
  const sapoRot = Number(elecSapoRot) || 0;
  const sapoChange = nextTiming - lastOut - totalDisplayBalls;

  return {
    hitNumber,
    mult: multiplier,
    rawRounds,
    rounds: rawRounds * multiplier,
    displayBalls: totalDisplayBalls,
    lastOutBalls: lastOut,
    nextTimingBalls: nextTiming,
    elecSapoRot: sapoRot,
    sapoChange,
    sapoPerRot: sapoRot > 0 ? sapoChange / sapoRot : 0,
    actualBalls: 0,
    time,
  };
}
