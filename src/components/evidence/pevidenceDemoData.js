// 開発中の画面確認専用データ。URLに ?pevidenceDemo=1 がある場合だけ使用する。
// 利用者の保存データやlocalStorageは一切変更しない。

export const P_EVIDENCE_DEMO_MACHINE = {
  name: "P-EVIDENCEデモ機",
  modelName: "P-EVIDENCE-DEMO",
  modelVerified: true,
  border1K: 18,
  prob: "1/319.6",
  synthProb: 319.6,
  avgPayoutPerHit: 1400,
  hesoAvgPayout: 450,
  rushAvgPayout: 1500,
  rushEntryRate: 60,
  rushContinueRate: 81,
  allocationVerified: true,
  stdDev: 18000,
  stdDevMethod: "p-evidence-branching-v2",
  stdDevLabel: "画面確認用デモ値",
  muraCoef: 50000,
};

function demoRow(num, rate, island, date, event = "") {
  const normalSpins = 720;
  const totalStarts = 10;
  const inputBalls = normalSpins / rate * 250;
  return {
    date,
    island,
    machineName: P_EVIDENCE_DEMO_MACHINE.name,
    num: String(num),
    normalSpins,
    totalStarts,
    val: totalStarts * P_EVIDENCE_DEMO_MACHINE.avgPayoutPerHit - inputBalls,
    event,
  };
}

export const P_EVIDENCE_DEMO_SCANS = Array.from({ length: 14 }, (_, index) => {
  const day = index + 1;
  const date = `2026-06-${String(day).padStart(2, "0")}`;
  const rates = {
    101: 22,
    102: day <= 8 ? 21 : 14,
    103: day % 3 === 0 ? 19.5 : 20.5,
    201: 21.5,
    202: day <= 8 ? 18 : 24,
    203: 16.5,
  };
  return {
    id: `pe-demo-${day}`,
    storeId: "pe-demo-store",
    storeName: "P-EVIDENCEデモ店",
    date,
    createdAt: `${date}T12:00:00.000Z`,
    rows: [
      demoRow(101, rates[101], "A島", date),
      demoRow(102, rates[102], "A島", date),
      demoRow(103, rates[103], "A島", date, day === 14 ? "イベント" : ""),
      demoRow(201, rates[201], "B島", date),
      demoRow(202, rates[202], "B島", date),
      demoRow(203, rates[203], "B島", date),
    ],
  };
});

export const P_EVIDENCE_DEMO_HALL_MAPS = {
  "pe-demo-store": [
    { id: "pe-demo-a", name: "A島", start: 101, end: 106, machineName: P_EVIDENCE_DEMO_MACHINE.name, facingIslandId: "pe-demo-b", facingReversed: true },
    { id: "pe-demo-b", name: "B島", start: 201, end: 206, machineName: P_EVIDENCE_DEMO_MACHINE.name, facingIslandId: "pe-demo-a", facingReversed: true },
  ],
};
