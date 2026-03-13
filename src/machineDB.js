/* ================================================================
   実機データベース — 人気パチンコ機種スペック
   ※ 代表的なスペックを収録。実際の出玉は店舗により異なります。

   spec1R: 1R実出玉（NET — P tools互換）
   specAvgTotalRounds: 連チャン込み平均総R数/初当たり
   specSapo: サポ増減/初当たり
   ※ 理論ボーダー = synthProb × exRate / (spec1R × specAvgTotalRounds + specSapo)
================================================================ */
export const machineDB = [
  // ── ミドルスペック ──
  {
    name: "大海物語5",
    maker: "三洋",
    type: "ハイミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 140,
    specAvgTotalRounds: 34.17,
    specSapo: 0,
    roundDist: "10R:100%（確変ループ）",
    border: { "4.00": 16.7, "3.57": 17.6, "3.33": 18.4, "3.03": 19.3 },
  },
  {
    name: "エヴァンゲリオン15",
    maker: "ビスティ",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 130,
    specAvgTotalRounds: 28.0,
    specSapo: 0,
    roundDist: "4R:50%, 10R:50%",
    border: { "4.00": 22.0, "3.57": 23.2, "3.33": 24.2, "3.03": 25.4 },
  },
  {
    name: "北斗の拳10",
    maker: "サミー",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 135,
    specAvgTotalRounds: 32.0,
    specSapo: 0,
    roundDist: "3R:30%, 10R:70%",
    border: { "4.00": 18.5, "3.57": 19.5, "3.33": 20.4, "3.03": 21.4 },
  },
  {
    name: "真・花の慶次3",
    maker: "ニューギン",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 130,
    specAvgTotalRounds: 30.0,
    specSapo: 0,
    roundDist: "4R:40%, 10R:60%",
    border: { "4.00": 20.5, "3.57": 21.6, "3.33": 22.6, "3.03": 23.7 },
  },
  {
    name: "ルパン三世 消されたルパン",
    maker: "平和",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 140,
    specAvgTotalRounds: 33.0,
    specSapo: 0,
    roundDist: "3R:25%, 10R:75%",
    border: { "4.00": 17.3, "3.57": 18.2, "3.33": 19.0, "3.03": 20.0 },
  },
  {
    name: "仮面ライダー轟音",
    maker: "京楽",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 130,
    specAvgTotalRounds: 28.0,
    specSapo: 0,
    roundDist: "4R:50%, 10R:50%",
    border: { "4.00": 22.0, "3.57": 23.2, "3.33": 24.2, "3.03": 25.4 },
  },
  // ── ライトミドル ──
  {
    name: "海物語IN沖縄5",
    maker: "三洋",
    type: "ライトミドル",
    prob: "1/199.8",
    synthProb: 199.8,
    spec1R: 130,
    specAvgTotalRounds: 22.0,
    specSapo: 0,
    roundDist: "5R:50%, 10R:50%",
    border: { "4.00": 17.5, "3.57": 18.4, "3.33": 19.2, "3.03": 20.2 },
  },
  {
    name: "ジューシーハニー3",
    maker: "三洋",
    type: "ライトミドル",
    prob: "1/199.8",
    synthProb: 199.8,
    spec1R: 120,
    specAvgTotalRounds: 18.0,
    specSapo: 0,
    roundDist: "4R:60%, 10R:40%",
    border: { "4.00": 23.1, "3.57": 24.4, "3.33": 25.5, "3.03": 26.7 },
  },
  // ── 甘デジ ──
  {
    name: "海物語IN沖縄5 甘デジ",
    maker: "三洋",
    type: "甘デジ",
    prob: "1/99.9",
    synthProb: 99.9,
    spec1R: 50,
    specAvgTotalRounds: 22.0,
    specSapo: 0,
    roundDist: "3R:50%, 10R:50%",
    border: { "4.00": 18.1, "3.57": 19.1, "3.33": 20.0, "3.03": 20.9 },
  },
  {
    name: "大海物語5 甘デジ",
    maker: "三洋",
    type: "甘デジ",
    prob: "1/99.9",
    synthProb: 99.9,
    spec1R: 45,
    specAvgTotalRounds: 20.0,
    specSapo: 0,
    roundDist: "5R:70%, 10R:30%",
    border: { "4.00": 22.2, "3.57": 23.4, "3.33": 24.4, "3.03": 25.6 },
  },
  {
    name: "ガンダムSEED",
    maker: "バンダイナムコ",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 130,
    specAvgTotalRounds: 28.0,
    specSapo: 0,
    roundDist: "4R:50%, 10R:50%",
    border: { "4.00": 22.0, "3.57": 23.2, "3.33": 24.2, "3.03": 25.4 },
  },
  {
    name: "Re:ゼロから始める異世界生活",
    maker: "大都",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 135,
    specAvgTotalRounds: 30.0,
    specSapo: 0,
    roundDist: "3R:40%, 10R:60%",
    border: { "4.00": 19.7, "3.57": 20.8, "3.33": 21.7, "3.03": 22.8 },
  },
  {
    name: "源さん超韋駄天",
    maker: "三洋",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 140,
    specAvgTotalRounds: 24.0,
    specSapo: 0,
    roundDist: "2R:50%, 10R:50%",
    border: { "4.00": 23.8, "3.57": 25.1, "3.33": 26.2, "3.03": 27.5 },
  },
  {
    name: "とある魔術の禁書目録",
    maker: "藤商事",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    spec1R: 130,
    specAvgTotalRounds: 30.0,
    specSapo: 0,
    roundDist: "4R:45%, 10R:55%",
    border: { "4.00": 20.5, "3.57": 21.6, "3.33": 22.6, "3.03": 23.7 },
  },
];

// 機種検索
export function searchMachines(query) {
  if (!query || query.trim().length === 0) return machineDB;
  const q = query.trim().toLowerCase();
  return machineDB.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.maker.toLowerCase().includes(q) ||
    m.type.toLowerCase().includes(q)
  );
}
