export const DETAIL_KEYS = Object.freeze({
  COVERAGE: "coverage",
  RELIABILITY: "reliability",
  FRESHNESS: "freshness",
  RENTAL_RATE: "rental-rate",
  EXCHANGE_RATE: "exchange-rate",
  CHODAMA_STATUS: "chodama-status",
  REPLAY_CAP: "replay-cap",
  BALL_UNIT: "ball-unit",
  STORE_BALLS: "store-balls",
  STORE_REPLAY: "store-replay",
  TODAY_SETTLEMENT: "today-settlement",
  RECORDS: "records",
  MACHINES: "machines",
  WEEKDAYS: "weekdays",
  TIME_SLOTS: "time-slots",
  JUDGMENT_GOOD: "judgment-good",
  JUDGMENT_REVIEW: "judgment-review",
  JUDGMENT_WITHDRAWAL: "judgment-withdrawal",
  NEXT_CHECK: "next-check",
  STORE_INFO: "store-info",
  LAST_VISIT: "last-visit",
  MEMO: "memo",
  MEMBER_CARD: "member-card",
  DEPOSIT_BALANCE: "deposit-balance",
});

const yen = (value) => `${Number(value || 0).toLocaleString("ja-JP")}円`;
const balls = (value) => `${Number(value || 0).toLocaleString("ja-JP")}玉`;
const signedYen = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${yen(value)}`;
const displayDateTime = (item) => [item?.date, item?.time || item?.recordedAt].filter(Boolean).join(" ") || "日時未記録";

const withAction = (panel, action = "record") => ({
  ...panel,
  action,
  actionLabel: action === "settings" ? "設定トップで編集" : "記録を開始",
});

const sampleRecords = [
  { date: "2026-07-15", time: "18:20", machineName: "サンプル機種A", machineNum: "123", investYen: 12000, recoveryYen: 18500, actualProfitYen: 6500, expectedValueYen: 2100 },
  { date: "2026-07-12", time: "13:10", machineName: "サンプル機種B", machineNum: "87", investYen: 8000, recoveryYen: 5000, actualProfitYen: -3000, expectedValueYen: 900 },
  { date: "2026-07-08", time: "10:05", machineName: "サンプル機種A", machineNum: "121", investYen: 5000, recoveryYen: 11200, actualProfitYen: 6200, expectedValueYen: 1600 },
];

const sampleJudgments = {
  good: [{ date: "2026-07-15", recordedAt: "19:05", machineName: "サンプル機種A", machineNum: "123", reason: "回転率が基準を上回っていたため継続", checkpointK: 12 }],
  review: [{ date: "2026-07-12", recordedAt: "15:20", machineName: "サンプル機種B", machineNum: "87", reason: "持ち玉比率が下がった時点で再確認", checkpointK: 8 }],
  withdrawal: [{ date: "2026-07-08", recordedAt: "18:40", machineName: "サンプル機種C", machineNum: "45", reason: "期待値が基準を下回ったため終了", checkpointK: 18 }],
};

const sampleWeekdays = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"]
  .map((label, index) => ({ label, count: [1, 2, 0, 3, 1, 2, 0][index] }));
const sampleTimeSlots = [
  { label: "午前", range: "〜11:59", count: 2 },
  { label: "昼", range: "12:00〜15:59", count: 4 },
  { label: "夕方", range: "16:00〜19:59", count: 3 },
  { label: "夜", range: "20:00〜", count: 1 },
];
const sampleMachines = [
  { name: "サンプル機種A", count: 5, latestDate: "2026-07-15" },
  { name: "サンプル機種B", count: 3, latestDate: "2026-07-12" },
  { name: "サンプル機種C", count: 2, latestDate: "2026-07-08" },
];
const sampleBalanceHistory = [
  { date: "2026-07-15", type: "deposit", balls: 1250, balanceBefore: 2400, balanceAfter: 3650, memo: "実戦終了後" },
  { date: "2026-07-12", type: "withdraw", balls: 500, balanceBefore: 2900, balanceAfter: 2400, memo: "再プレイ利用" },
  { date: "2026-07-08", type: "adjust", balls: 100, balanceBefore: 2800, balanceAfter: 2900, memo: "残高調整" },
];

const historyLabel = (type) => ({ deposit: "入玉", withdraw: "出玉", adjust: "残高調整" }[type] || "残高更新");

const makeBalanceRows = (history) => history.map((item) => ({
  label: `${item.date || "日付未記録"} ${historyLabel(item.type)}`,
  value: `${item.type === "withdraw" ? "−" : "+"}${balls(Math.abs(item.balls))}`,
  meta: item.memo || "メモなし",
  details: [
    { label: "変更前", value: balls(item.balanceBefore) },
    { label: "変更後", value: balls(item.balanceAfter) },
  ],
}));

const makeRecordRows = (records) => records.map((record) => ({
  label: record.machineName,
  value: signedYen(record.actualProfitYen),
  meta: `${displayDateTime(record)}${record.machineNum ? `・台 ${record.machineNum}` : ""}`,
  tone: Number(record.actualProfitYen) >= 0 ? "positive" : "negative",
  details: [
    { label: "投資", value: yen(record.investYen) },
    { label: "回収", value: yen(record.recoveryYen) },
    { label: "期待値", value: signedYen(record.expectedValueYen) },
  ],
}));

const makeJudgmentPanel = (title, countLabel, items, sampleType) => {
  const demo = !items?.length;
  const source = demo ? sampleJudgments[sampleType] : items;
  return withAction({
    title,
    subtitle: "理由・チェック地点・日時・対象機種を確認できます。",
    demo,
    hero: { label: countLabel, value: `${items?.length || 0}件` },
    sections: [{
      title: demo ? "完成イメージ" : "判断履歴",
      rows: source.map((item) => ({
        label: item.machineName || "機種未設定",
        value: item.checkpointK == null ? "地点未記録" : `${item.checkpointK}K時点`,
        meta: displayDateTime(item),
        description: item.reason || "理由の記録なし",
        details: item.machineNum ? [{ label: "台番号", value: String(item.machineNum) }] : [],
      })),
    }],
  });
};

export function buildStoreDetailPanels(data) {
  const detail = data.analyticsDetail || {
    coverageBreakdown: [], weekdays: [], timeSlots: [], machines: [], recentRecords: [], judgments: {},
  };
  const coverage = detail.coverageBreakdown || [];
  const balanceHistory = data.chodama?.balanceHistory || [];
  const balanceDemo = balanceHistory.length === 0;
  const recordDemo = !detail.recentRecords?.length;
  const weekdayDemo = !data.dataSufficiency?.validRecords;
  const timeSlotDemo = !data.dataSufficiency?.validRecords;
  const machineDemo = !detail.machines?.length;
  const exchangeRate = Number(data.exchangeInfo?.exchangeBallsPer100 || 0);
  const ballUnit = Number(data.exchangeInfo?.ballUnitYen || 0);
  const replayCap = Number(data.exchangeInfo?.replayCapBalls || 0);

  return {
    [DETAIL_KEYS.COVERAGE]: withAction({
      title: "記録充足度",
      subtitle: "4項目の達成率を同じ比重で平均しています。",
      hero: { label: "総合充足度", value: `${data.analysisScore || 0}%` },
      sections: [{
        title: "計算内訳",
        rows: coverage.map((item) => ({
          label: item.label,
          value: `${item.value}/${item.target}`,
          meta: `${item.percent}%達成`,
          progress: item.percent,
        })),
      }, {
        title: "目標の考え方",
        note: "記録12件・曜日7区分・時間帯4区分・機種8種類を100%の目安にしています。サンプル値は計算に含めません。",
      }],
    }),
    [DETAIL_KEYS.RELIABILITY]: withAction({
      title: "データ信頼度",
      subtitle: "店舗別の有効記録件数で段階を判定します。",
      hero: { label: "現在の判定", value: data.dataReliability || "未記録" },
      sections: [{
        title: "判定条件",
        rows: [
          { label: "未記録", value: "0件" },
          { label: "低", value: "1〜2件" },
          { label: "中", value: "3〜9件" },
          { label: "高", value: "10件以上" },
        ],
      }, {
        title: "現在の記録",
        note: `この店舗の有効記録は${data.dataSufficiency?.validRecords || 0}件です。曜日・時間帯・機種の広がりは「記録充足度」で確認できます。`,
      }],
    }),
    [DETAIL_KEYS.FRESHNESS]: withAction({
      title: "最終更新",
      subtitle: "この店舗で最後に保存した実戦記録の日付です。",
      hero: { label: "最新の記録", value: data.lastUpdatedLabel || "未記録" },
      demo: recordDemo,
      sections: [{
        title: recordDemo ? "完成イメージ" : "直近の実戦",
        rows: makeRecordRows((recordDemo ? sampleRecords : detail.recentRecords).slice(0, 3)),
      }],
    }),
    [DETAIL_KEYS.RENTAL_RATE]: withAction({
      title: "貸玉",
      subtitle: "100円で借りられる玉数から貸玉単価を表示します。",
      hero: { label: "貸玉", value: `${data.currentSettings?.rentalYenPer100 || 0}円パチンコ` },
      sections: [{ title: "計算根拠", rows: [
        { label: "100円あたり", value: balls(data.exchangeInfo?.rentalBallsPer100) },
        { label: "1玉あたり", value: `${data.currentSettings?.rentalYenPer100 || 0}円` },
      ] }],
    }, "settings"),
    [DETAIL_KEYS.EXCHANGE_RATE]: withAction({
      title: "交換率",
      subtitle: "100円への交換に必要な玉数と円換算の根拠です。",
      hero: { label: "交換率", value: `${exchangeRate}玉交換` },
      sections: [{ title: "計算根拠", rows: [
        { label: "100円への交換", value: balls(exchangeRate) },
        { label: "1玉の交換価値", value: `${ballUnit.toFixed(2)}円` },
        { label: "計算式", value: exchangeRate > 0 ? `100 ÷ ${exchangeRate}` : "未設定" },
      ] }],
    }, "settings"),
    [DETAIL_KEYS.CHODAMA_STATUS]: withAction({
      title: "貯玉利用",
      subtitle: "会員カードと現在の店内貯玉をまとめています。",
      hero: { label: "利用状態", value: data.currentSettings?.hasChodama ? "貯玉あり" : "貯玉なし" },
      sections: [{ title: "現在の状態", rows: [
        { label: "会員カード", value: data.memberCard?.created ? "作成済み" : "未作成" },
        { label: "店内貯玉", value: balls(data.chodama?.storeBalls), meta: `約${yen(data.chodama?.storeBallsYen)}` },
        { label: "再プレイ上限", value: replayCap > 0 ? balls(replayCap) : "上限なし／未設定" },
      ] }],
    }, "settings"),
    [DETAIL_KEYS.REPLAY_CAP]: withAction({
      title: "再プレイ上限",
      subtitle: "1日に利用できる貯玉の上限設定です。",
      hero: { label: "現在の上限", value: replayCap > 0 ? balls(replayCap) : "上限なし／未設定" },
      sections: [{ title: "確認ポイント", note: "店舗ルールと会員カードの条件に合わせて設定してください。0玉は上限なし、または未設定として扱います。" }],
    }, "settings"),
    [DETAIL_KEYS.BALL_UNIT]: withAction({
      title: "玉単価",
      subtitle: "交換率から求めた、貯玉1玉の円換算額です。",
      hero: { label: "1玉の交換価値", value: `${ballUnit.toFixed(2)}円` },
      sections: [{ title: "計算例", rows: [
        { label: "交換率", value: `${exchangeRate}玉 / 100円` },
        { label: "計算式", value: exchangeRate > 0 ? `100 ÷ ${exchangeRate}` : "未設定" },
        { label: `${balls(data.chodama?.storeBalls)}の換算`, value: `約${yen(data.chodama?.storeBallsYen)}` },
      ] }],
    }, "settings"),
    [DETAIL_KEYS.STORE_BALLS]: withAction({
      title: "店内貯玉",
      subtitle: "現在残高と直近の入出金履歴です。",
      hero: { label: "現在残高", value: balls(data.chodama?.storeBalls), sub: `約${yen(data.chodama?.storeBallsYen)}` },
      demo: balanceDemo,
      sections: [{ title: balanceDemo ? "履歴の完成イメージ" : "直近の入出金", rows: makeBalanceRows(balanceDemo ? sampleBalanceHistory : balanceHistory) }, {
        title: "円換算の根拠", note: `${balls(exchangeRate)}で100円として、現在残高を約${yen(data.chodama?.storeBallsYen)}に換算しています。`,
      }],
    }, "settings"),
    [DETAIL_KEYS.STORE_REPLAY]: withAction({
      title: "店内再プレイ",
      subtitle: "現在の再プレイ利用量と上限を確認できます。",
      hero: { label: "再プレイ", value: balls(data.chodama?.storeReplayBalls), sub: `約${yen(data.chodama?.storeReplayYen)}` },
      sections: [{ title: "利用状況", rows: [
        { label: "利用済み", value: balls(data.chodama?.storeReplayBalls) },
        { label: "設定上限", value: replayCap > 0 ? balls(replayCap) : "上限なし／未設定" },
        { label: "上限まで", value: replayCap > 0 ? balls(Math.max(0, replayCap - Number(data.chodama?.storeReplayBalls || 0))) : "—" },
      ] }],
    }, "settings"),
    [DETAIL_KEYS.TODAY_SETTLEMENT]: withAction({
      title: "本日精算予定",
      subtitle: "本日分として登録されている精算予定です。",
      hero: { label: "精算予定", value: balls(data.chodama?.todaySettlementBalls), sub: yen(data.chodama?.todaySettlementYen) },
      sections: [{ title: "計算根拠", note: `${balls(exchangeRate)}で100円として円換算しています。実際の精算額は店舗条件をご確認ください。` }],
    }, "settings"),
    [DETAIL_KEYS.RECORDS]: withAction({
      title: "有効記録・直近の実戦",
      subtitle: "この店舗に一致する直近5件の実戦です。",
      hero: { label: "有効記録", value: `${data.dataSufficiency?.validRecords || 0}件` },
      demo: recordDemo,
      sections: [{ title: recordDemo ? "完成イメージ" : "直近5件", rows: makeRecordRows(recordDemo ? sampleRecords : detail.recentRecords) }],
    }),
    [DETAIL_KEYS.MACHINES]: withAction({
      title: "把握機種・機種別ランキング",
      subtitle: "実戦記録の件数が多い順に表示します。",
      hero: { label: "把握機種", value: `${data.dataSufficiency?.knownMachines || 0}機種` },
      demo: machineDemo,
      sections: [{
        title: machineDemo ? "完成イメージ" : "記録件数ランキング",
        rows: (machineDemo ? sampleMachines : detail.machines).map((machine, index) => ({
          label: `${index + 1}位 ${machine.name}`,
          value: `${machine.count}件`,
          meta: machine.latestDate ? `最終記録 ${machine.latestDate}` : "",
        })),
      }],
    }),
    [DETAIL_KEYS.WEEKDAYS]: withAction({
      title: "曜日別の記録",
      subtitle: "曜日ごとの件数と未記録の曜日を確認できます。",
      hero: { label: "カバー状況", value: `${data.dataSufficiency?.dayOfWeekCovered || 0}/7` },
      demo: weekdayDemo,
      sections: [{
        title: weekdayDemo ? "完成イメージ" : "曜日別件数",
        rows: (weekdayDemo ? sampleWeekdays : detail.weekdays).map((item) => ({ label: item.label, value: `${item.count}件`, progress: Math.min(100, item.count * 25) })),
      }, {
        title: "未記録の曜日",
        note: weekdayDemo ? "実データが入ると、未記録曜日と次のおすすめが表示されます。" : (detail.missingWeekdays?.join("・") || "全曜日の記録があります。"),
      }],
    }),
    [DETAIL_KEYS.TIME_SLOTS]: withAction({
      title: "時間帯別の記録",
      subtitle: "4つの時間帯ごとの記録件数です。",
      hero: { label: "カバー状況", value: `${data.dataSufficiency?.timeSlotCovered || 0}/4` },
      demo: timeSlotDemo,
      sections: [{
        title: timeSlotDemo ? "完成イメージ" : "時間帯別件数",
        rows: (timeSlotDemo ? sampleTimeSlots : detail.timeSlots).map((item) => ({ label: item.label, value: `${item.count}件`, meta: item.range, progress: Math.min(100, item.count * 25) })),
      }, {
        title: "未記録の時間帯",
        note: timeSlotDemo ? "実データが入ると、未記録時間帯と次のおすすめが表示されます。" : (detail.missingTimeSlots?.join("・") || "全時間帯の記録があります。"),
      }],
    }),
    [DETAIL_KEYS.JUDGMENT_GOOD]: makeJudgmentPanel("良かった判断", "良い判断", detail.judgments?.good || [], "good"),
    [DETAIL_KEYS.JUDGMENT_REVIEW]: makeJudgmentPanel("見直し候補", "見直し候補", detail.judgments?.review || [], "review"),
    [DETAIL_KEYS.JUDGMENT_WITHDRAWAL]: makeJudgmentPanel("撤退タイミング", "撤退判断", detail.judgments?.withdrawal || [], "withdrawal"),
    [DETAIL_KEYS.NEXT_CHECK]: withAction({
      title: "次に追加すると効果的な記録",
      subtitle: "不足している区分から、次の記録候補を提案します。",
      hero: { label: "おすすめ", value: data.nextToCheck?.recommended || "実戦記録を追加" },
      sections: [{ title: data.nextToCheck?.title || "確認事項", note: data.nextToCheck?.body || "記録を追加すると提案が更新されます。" }, {
        title: "不足データ",
        rows: [
          { label: "曜日", value: detail.missingWeekdays?.length ? detail.missingWeekdays.join("・") : "不足なし" },
          { label: "時間帯", value: detail.missingTimeSlots?.length ? detail.missingTimeSlots.join("・") : "不足なし" },
        ],
      }],
    }),
    [DETAIL_KEYS.STORE_INFO]: withAction({
      title: "店舗基本情報",
      subtitle: "登録している店舗情報です。",
      hero: { label: "店舗名", value: data.basicInfo?.name || "未設定" },
      sections: [{ title: "登録内容", rows: [
        { label: "住所", value: data.basicInfo?.address || "未設定" },
        { label: "閉店時間", value: data.basicInfo?.closingTime || "未設定" },
        { label: "最終来店", value: data.basicInfo?.lastVisitLabel || "未記録" },
      ] }],
    }, "settings"),
    [DETAIL_KEYS.LAST_VISIT]: withAction({
      title: "最終来店",
      subtitle: "店舗情報に登録されている最終来店日です。",
      hero: { label: "最終来店", value: data.basicInfo?.lastVisitLabel || "未記録" },
      sections: [{ title: "補足", note: "実戦記録の最終更新日とは別の項目です。設定トップから編集できます。" }],
    }, "settings"),
    [DETAIL_KEYS.MEMO]: withAction({
      title: "店舗メモ",
      subtitle: "店舗ごとに保存しているメモです。",
      hero: { label: "メモ", value: data.basicInfo?.memo || "未入力" },
      sections: [{ title: "使い方", note: "混雑傾向、入場方法、設備など、実戦前に確認したい情報の記録に使えます。" }],
    }, "settings"),
    [DETAIL_KEYS.MEMBER_CARD]: withAction({
      title: "会員カード",
      subtitle: "カード登録状態と紐づく残高を確認できます。",
      hero: { label: "登録状態", value: data.memberCard?.created ? "作成済み" : "未作成" },
      sections: [{ title: "カード情報", rows: [
        { label: "カード番号", value: data.memberCard?.number ? `•••• ${String(data.memberCard.number).slice(-4)}` : "未登録" },
        { label: "最終貯玉残高", value: balls(data.memberCard?.lastBalanceBalls), meta: `約${yen(data.memberCard?.lastBalanceYen)}` },
        { label: "入金残高", value: yen(data.memberCard?.depositBalanceYen) },
      ] }],
    }, "settings"),
    [DETAIL_KEYS.DEPOSIT_BALANCE]: withAction({
      title: "入金残高",
      subtitle: "会員カードに登録している現金残高です。",
      hero: { label: "現在残高", value: yen(data.memberCard?.depositBalanceYen) },
      sections: [{ title: "注意", note: "この値は店舗情報に保存した管理用の残高です。実際のカード残高と異なる場合は設定トップで更新してください。" }],
    }, "settings"),
  };
}
