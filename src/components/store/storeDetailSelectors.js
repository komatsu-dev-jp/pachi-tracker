// 店舗詳細画面: 実店舗データ（App.jsx の S.stores）から表示用データを組み立てる純粋関数。
//
// 概要/設定タブのうち「店舗基本情報・貯玉・会員カード・交換率」は実データに接続する。
// 一方、分析タブ関連（店舗分析度・データ充足状況・傾向・判断ログ・次に確認すること）は
// 対応する実集計ロジックがまだ存在しないため、引き続き mockStoreDetail.js のダミー値を使う
// （TODO: archives ベースの店舗別集計は別ステップで実装）。
//
// 交換率・貸玉単価の計算式は src/components/Tabs.jsx の SettingsTab 内「Store detail view」
// （faceRent / yenPerBall / faceEx / exYenPerBall / chodamaYen の導出）と同一のものを使用し、
// 独自の新しい計算式は導入しない。logic.js には依存しない・触れない。

import { MOCK_STORE_DETAIL } from "../../data/mockStoreDetail";

const normalizeMemberCard = (mc) => ({ created: false, number: "", deposit: 0, ...(mc || {}) });

export function resolveStoreDetail(stores, storeId, opts = {}) {
  const { chodamaReplayLimit = 0, currentRentBalls, currentExRate } = opts;
  const list = Array.isArray(stores) ? stores : [];
  const store = list.find((st) => st && st.id === storeId) || list[0] || null;

  if (!store) {
    // 登録店舗がまだ無い場合はダミー1店舗をそのまま表示（見た目確認用のフォールバック）
    return { ...MOCK_STORE_DETAIL, isRealStore: false };
  }

  // Tabs.jsx の Store detail view と同一の導出式（faceRent/faceEx は 玉/100円 の面値）
  const faceRent = Math.round((store.rentBalls || 250) / 10);
  const faceEx = Math.round((store.exRate || 250) / 10);
  const yenPerBall = faceRent > 0 ? 100 / faceRent : 0; // 貸玉単価（円/1玉）
  const exYenPerBall = faceEx > 0 ? 100 / faceEx : 0; // 玉単価（円/1玉、交換時）
  const rentalYenPer100 = Number.isInteger(yenPerBall) ? yenPerBall : Math.round(yenPerBall * 10) / 10;

  const chodamaBalls = store.chodama || 0;
  const replayBalls = store.replayBalls || 0;
  const todaySettle = store.todaySettle || 0;
  const mc = normalizeMemberCard(store.memberCard);
  const replayCapBalls = Number(chodamaReplayLimit) || 0;

  const appliedToCurrentSession =
    currentRentBalls != null &&
    currentExRate != null &&
    Number(store.rentBalls || 250) === Number(currentRentBalls) &&
    Number(store.exRate || 250) === Number(currentExRate);

  return {
    ...MOCK_STORE_DETAIL, // 分析タブ関連（analysisScore/dataSufficiency/trends/judgmentLog等）はダミー値を継続使用
    id: store.id,
    name: store.name || "",
    address: store.address || "",
    logoUrl: null,
    logoInitial: (store.name || "?").trim().charAt(0) || "?",
    currentSettings: {
      appliedToCurrentSession,
      rentalYenPer100,
      exchangeBallsPer100: faceEx,
      hasChodama: chodamaBalls > 0 || !!mc.created,
      replayCapBalls,
    },
    chodama: {
      storeBalls: chodamaBalls,
      storeBallsYen: Math.round(chodamaBalls * exYenPerBall),
      storeReplayBalls: replayBalls,
      storeReplayYen: Math.round(replayBalls * exYenPerBall),
      todaySettlementBalls: todaySettle,
      todaySettlementYen: Math.round(todaySettle * exYenPerBall),
    },
    basicInfo: {
      name: store.name || "",
      address: store.address || "",
      lastVisitLabel: store.lastVisit || "",
      memo: store.memo || "",
    },
    memberCard: {
      created: !!mc.created,
      lastBalanceBalls: chodamaBalls,
      lastBalanceYen: Math.round(chodamaBalls * exYenPerBall),
      depositBalanceYen: mc.deposit || 0,
    },
    exchangeInfo: {
      rentalYenPer100,
      exchangeBallsPer100: faceEx,
      ballUnitYen: exYenPerBall,
      replayCapBalls,
    },
    isRealStore: true,
  };
}
