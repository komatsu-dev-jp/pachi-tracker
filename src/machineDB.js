/* ================================================================
   実機データベース — 人気パチンコ機種スペック
   ※ 代表的なスペックを収録。実際の出玉は店舗により異なります。
================================================================ */
export const machineDB = [
  // ── ミドルスペック ──
  {
    name: "大海物語5",
    maker: "三洋",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "10R:100%",
    border: { "4.00": 17.3, "3.57": 18.2, "3.33": 19.0, "3.03": 19.9 },
    avgRound: 10,
  },
  {
    name: "エヴァンゲリオン15",
    maker: "ビスティ",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1400,
    roundDist: "4R:50%, 10R:50%",
    border: { "4.00": 18.5, "3.57": 19.5, "3.33": 20.3, "3.03": 21.3 },
    avgRound: 7,
  },
  {
    name: "北斗の拳10",
    maker: "サミー",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "3R:30%, 10R:70%",
    border: { "4.00": 17.5, "3.57": 18.5, "3.33": 19.2, "3.03": 20.2 },
    avgRound: 7.9,
  },
  {
    name: "真・花の慶次3",
    maker: "ニューギン",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "4R:40%, 10R:60%",
    border: { "4.00": 17.8, "3.57": 18.8, "3.33": 19.5, "3.03": 20.5 },
    avgRound: 7.6,
  },
  {
    name: "ルパン三世 消されたルパン",
    maker: "平和",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "3R:25%, 10R:75%",
    border: { "4.00": 17.2, "3.57": 18.1, "3.33": 18.9, "3.03": 19.8 },
    avgRound: 8.25,
  },
  {
    name: "仮面ライダー轟音",
    maker: "京楽",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "4R:50%, 10R:50%",
    border: { "4.00": 18.0, "3.57": 19.0, "3.33": 19.8, "3.03": 20.8 },
    avgRound: 7,
  },
  // ── ライトミドル ──
  {
    name: "海物語IN沖縄5",
    maker: "三洋",
    type: "ライトミドル",
    prob: "1/199.8",
    synthProb: 199.8,
    avg1R: 1500,
    roundDist: "5R:50%, 10R:50%",
    border: { "4.00": 18.8, "3.57": 19.8, "3.33": 20.7, "3.03": 21.7 },
    avgRound: 7.5,
  },
  {
    name: "ジューシーハニー3",
    maker: "三洋",
    type: "ライトミドル",
    prob: "1/199.8",
    synthProb: 199.8,
    avg1R: 1400,
    roundDist: "4R:60%, 10R:40%",
    border: { "4.00": 20.0, "3.57": 21.2, "3.33": 22.0, "3.03": 23.1 },
    avgRound: 6.4,
  },
  // ── 甘デジ ──
  {
    name: "海物語IN沖縄5 甘デジ",
    maker: "三洋",
    type: "甘デジ",
    prob: "1/99.9",
    synthProb: 99.9,
    avg1R: 450,
    roundDist: "3R:50%, 10R:50%",
    border: { "4.00": 18.0, "3.57": 19.0, "3.33": 19.8, "3.03": 20.7 },
    avgRound: 6.5,
  },
  {
    name: "大海物語5 甘デジ",
    maker: "三洋",
    type: "甘デジ",
    prob: "1/99.9",
    synthProb: 99.9,
    avg1R: 400,
    roundDist: "5R:70%, 10R:30%",
    border: { "4.00": 19.5, "3.57": 20.6, "3.33": 21.5, "3.03": 22.5 },
    avgRound: 6.5,
  },
  // ── 1/99 ──
  {
    name: "ガンダムSEED",
    maker: "バンダイナムコ",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "4R:50%, 10R:50%",
    border: { "4.00": 18.0, "3.57": 19.0, "3.33": 19.7, "3.03": 20.7 },
    avgRound: 7,
  },
  {
    name: "Re:ゼロから始める異世界生活",
    maker: "大都",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "3R:40%, 10R:60%",
    border: { "4.00": 17.6, "3.57": 18.6, "3.33": 19.3, "3.03": 20.3 },
    avgRound: 7.2,
  },
  {
    name: "源さん超韋駄天",
    maker: "三洋",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "2R:50%, 10R:50%",
    border: { "4.00": 18.5, "3.57": 19.6, "3.33": 20.4, "3.03": 21.4 },
    avgRound: 6,
  },
  {
    name: "とある魔術の禁書目録",
    maker: "藤商事",
    type: "ミドル",
    prob: "1/319.6",
    synthProb: 319.6,
    avg1R: 1500,
    roundDist: "4R:45%, 10R:55%",
    border: { "4.00": 17.8, "3.57": 18.8, "3.33": 19.5, "3.03": 20.5 },
    avgRound: 7.3,
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
