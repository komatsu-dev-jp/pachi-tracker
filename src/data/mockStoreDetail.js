// 店舗未登録時の空表示。実在ブランドや架空の実績値は審査版に表示しない。

export const MOCK_STORE_DETAIL = {
  id: "unregistered-store",
  name: "店舗未設定",
  address: "",
  logoUrl: null,
  logoInitial: "店",

  analysisScore: 0,
  dataReliability: "未記録",
  analysisStatus: "未記録",
  lastUpdatedLabel: "未記録",

  // ① 現在の店舗設定（実戦設定に適用中かどうか）
  currentSettings: {
    appliedToCurrentSession: false,
    rentalYenPer100: 0,
    exchangeBallsPer100: 0,
    hasChodama: false,
    replayCapBalls: 0,
  },

  // ② 貯玉状況 / 貯玉・精算管理で共用
  chodama: {
    storeBalls: 0,
    storeBallsYen: 0,
    storeReplayBalls: 0,
    storeReplayYen: 0,
    todaySettlementBalls: 0,
    todaySettlementYen: 0,
  },

  // ③ 分析サマリー（概要タブ）/ データ充足状況（分析タブ）で共用
  dataSufficiency: {
    validRecords: 0,
    knownMachines: 0,
    dayOfWeekCovered: 0,
    dayOfWeekTotal: 7,
    timeSlotCovered: 0,
    timeSlotTotal: 4,
    freshnessLabel: "未記録",
  },

  // ④ 次に確認すること（概要）/ 不足データ（分析）で共用
  nextToCheck: {
    title: "実戦記録がまだありません",
    body: "店舗を選んで実戦を保存すると、分析内容が表示されます",
  },

  // 分析タブ：傾向（曜日別 / 時間帯別 / 機種別 / イベント別）
  trends: [],

  // 分析タブ：判断ログ
  judgmentLog: {
    good: 0,
    review: 0,
    withdrawal: 0,
  },

  // 設定タブ：店舗基本情報
  basicInfo: {
    name: "店舗未設定",
    address: "",
    lastVisitLabel: "",
    memo: "",
  },

  // 設定タブ：会員カード
  memberCard: {
    created: false,
    lastBalanceBalls: 0,
    lastBalanceYen: 0,
    depositBalanceYen: 0,
  },

  // 設定タブ：交換率・貸玉情報
  exchangeInfo: {
    rentalYenPer100: 0,
    exchangeBallsPer100: 0,
    ballUnitYen: 0,
    replayCapBalls: 0,
  },
};
