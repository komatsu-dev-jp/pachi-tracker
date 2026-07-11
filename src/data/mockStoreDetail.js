// 店舗詳細画面（StoreDetail）用ダミーデータ
//
// 見た目優先プロトタイプのための仮データ。実データ接続（archives / pt_stores /
// 会員カード・貯玉の実状態との連携）は次ステップで行う。
// StoreOverviewTab / StoreAnalysisTab / StoreSettingsTab は本データを props 経由で
// 受け取るだけの表示専用コンポーネントとし、logic.js には一切依存しない。

// 傾向カードのミニ棒グラフ用（0〜1 に正規化した相対値、装飾表示のみ）
const spark = (values) => values;

export const MOCK_STORE_DETAIL = {
  id: "maruhan-kukodori",
  name: "マルハン空港通店",
  address: "愛媛県松山市",
  // 画像未設定時はイニシャル表示にフォールバック
  logoUrl: null,
  logoInitial: "M",

  analysisScore: 78, // 店舗分析度（%）
  dataReliability: "中", // 低 / 中 / 高
  analysisStatus: "分析中",
  lastUpdatedLabel: "7月8日",

  // ① 現在の店舗設定（実戦設定に適用中かどうか）
  currentSettings: {
    appliedToCurrentSession: true,
    rentalYenPer100: 4, // 4円パチンコ
    exchangeBallsPer100: 25, // 25玉交換
    hasChodama: true, // 貯玉あり
    replayCapBalls: 500, // 再プレイ上限
  },

  // ② 貯玉状況 / 貯玉・精算管理で共用
  chodama: {
    storeBalls: 1250, // 店内貯玉
    storeBallsYen: 12500,
    storeReplayBalls: 500, // 店内再プレイ
    storeReplayYen: 5000,
    todaySettlementBalls: 0, // 本日精算予定
    todaySettlementYen: 0,
  },

  // ③ 分析サマリー（概要タブ）/ データ充足状況（分析タブ）で共用
  dataSufficiency: {
    validRecords: 12, // 有効記録
    knownMachines: 8, // 把握機種
    dayOfWeekCovered: 3,
    dayOfWeekTotal: 7,
    timeSlotCovered: 3,
    timeSlotTotal: 4,
    freshnessLabel: "7月8日", // 最新性
  },

  // ④ 次に確認すること（概要）/ 不足データ（分析）で共用
  nextToCheck: {
    title: "夕方帯の記録が不足",
    body: "17〜19時のデータを追加すると、分析精度が上がります",
  },

  // 分析タブ：傾向（曜日別 / 時間帯別 / 機種別 / イベント別）
  trends: [
    { id: "dayOfWeek", label: "曜日別", color: "purple", spark: spark([0.3, 0.9, 0.5, 0.2, 0.95, 0.4, 0.15]) },
    { id: "timeSlot", label: "時間帯別", color: "teal", spark: spark([0.5, 0.7, 0.85, 0.4, 0.9]) },
    { id: "machine", label: "機種別", color: "blue", spark: spark([0.8, 0.35, 0.6, 0.25, 0.15]) },
    { id: "event", label: "イベント別", color: "green", spark: spark([0.4, 0.9, 0.3, 0.2, 0.1]) },
  ],

  // 分析タブ：判断ログ
  judgmentLog: {
    good: 8, // 良かった判断
    review: 2, // 見直し候補
    withdrawal: 3, // 撤退タイミング（直近の撤退判断）
  },

  // 設定タブ：店舗基本情報
  basicInfo: {
    name: "マルハン空港通店",
    address: "愛媛県松山市",
    lastVisitLabel: "2025年7月8日",
    memo: "",
  },

  // 設定タブ：会員カード
  memberCard: {
    created: true,
    lastBalanceBalls: 1250, // 最終残高
    lastBalanceYen: 12500,
    depositBalanceYen: 500, // 入金残高
  },

  // 設定タブ：交換率・貸玉情報
  exchangeInfo: {
    rentalYenPer100: 4, // 貸玉単価
    exchangeBallsPer100: 25, // 交換率
    ballUnitYen: 4.0, // 玉単価
    replayCapBalls: 500, // 再プレイ上限
  },
};
