import {
  RATE_UNCONFIRMED_REASON,
  STORE_RATE_STATUS,
  deriveStoreRateStatus,
  normalizePachinkoRates,
} from "../storeRateResearch.js";

export const EHIME_STORE_RATE_CHECKED_AT = "2026-07-25";

const u = (lendingYen) => ({ lendingYen, exchangeBallsPer100Yen: null });
const v = (lendingYen, exchangeBallsPer100Yen) => ({ lendingYen, exchangeBallsPer100Yen });

const rows = [
  ["ダイナム愛媛北条店", "dynam-hojo", "ダイナム愛媛北条店", [u(2.22), u(1.11)]],
  ["BIG ROCKY北久米", "ＢＩＧ　ＲＯＣＫＹ北久米店", "ＢＩＧ ＲＯＣＫＹ北久米店", [u(4), u(1)]],
  ["BIG ROCKY堀江", "horie-rocky", "ＢＩＧ ＲＯＣＫＹ 堀江店", [u(4), u(1)]],
  ["キスケPAO東雲店", "paoshinonome", "キスケＰＡＯ東雲店", [u(4), u(1.02), u(0.4)]],
  ["セントラルディーボ空港通店", "central-kukoudori", "セントラルディーボ空港通店", [v(4, 25)]],
  ["パチンコ天国福音寺店", "パチンコ天国福音寺店", "パチンコ天国福音寺店", [u(4), u(1), u(0.4)]],
  ["POWER STATION小栗店", "powerstation-ogur", "パワーステーション小栗店", [u(4), u(1), u(0.4)]],
  ["コロンボ松山インター店", "コロンボ　松山インター店", "コロンボ松山インター店", [u(4), u(1.25)]],
  ["丸之内ヘリオス2000竹原", "marunouchi-helios-2", "丸之内ヘリオス2000竹原", [v(4, 25.5), v(1, 108)]],
  ["セントラルディーボ小坂店", "セントラルdivo小坂店", "セントラルDIVO小坂店", [u(4), u(1.25)]],
  ["POWER STATION久米店", "power　station　久米店", "POWER STATION 久米店", [u(4), u(1), u(0.2)]],
  ["セントラルディーボ山越店", "divo-yamagoe", "セントラルDIVO山越店", [u(4), u(1.25)]],
  ["スーパーキスケPAO", "super-kisukepao", "スーパーキスケＰＡＯ", [v(4, 25.5), v(1.02, 100)]],
  ["クラブコロンボ森松店", "クラブコロンボ森松店", "クラブコロンボ森松店", [], true],
  ["キスケPAO小坂店", "kisukepao-kosaka", "キスケPAO小坂店", [v(4, 27.5), u(1.02)]],
  ["パチンコタイセイ", "taisei", "パチンコタイセイ", [u(4), u(1), u(0.5)]],
  ["ブロードウェイ丸之内", "ブロードウェイ丸之内", "ブロードウェイ丸之内", [u(4), u(1)]],
  ["パチンコ天国本店", "tengoku-honten", "パチンコ天国本店", [v(4, 25.5), v(1, 102)]],
  ["パチンコ天国空港通店", "tengoku-kukodori", "パチンコ天国空港通店", [u(4), u(1)]],
  ["セントラルディーボ保免店", "セントラルdivo保免店", "セントラルDIVO保免店", [u(4), u(1.25)]],
  ["ゴーゴーマルサン古三津店", "ゴーゴーマルサン古三津店", "ゴーゴーマルサン古三津店", [u(4), u(1.08), u(0.21)]],
  ["大盛空港通り店", "taisei0425", "大盛空港通り店", [u(4), u(1), u(0.4)]],
  ["B.BⅢ", "brabo", "Ｂ．ＢIII", [u(1), u(0.25)]],
  ["マイダス中央", "マイダス中央", "マイダス中央", [u(4), u(1.08)]],
  ["第一会館三津店", "第一会館三津店", "第一会館三津店", [v(4, 30.3), u(1), u(0.5)]],
  ["B.BⅠ", "ｂ．ｂｉ", "Ｂ．ＢＩ", [u(1), u(0.25)]],
  ["大盛銀天街", "大盛銀天街", "大盛銀天街", [u(4), u(1.02), u(0.51)]],
  ["GOGOMARUSAN伊予", "eayo", "GOGOMARUSANイーヨ", [u(2), u(1.09), u(0.2)]],
  ["ポポロ伊予", "popolo-iyo", "ポポロ伊予", [v(4, 27.1), v(1.08, 100)]],
  ["ナングン東温店", "nangun-touonten", "ナングン東温店", [], true],
  ["大盛東温店", "taisei-touon", "大盛東温店", [u(4), u(1), u(0.5)]],
  ["コロンボ東温店", "コロンボ38号店", "コロンボ東温店", [u(4), u(1.02), u(0.2)]],
  ["キスケPAO松前店", "kisuke-pao", "キスケPAO松前店", [v(4, 27.5), v(1.1, 100)]],
  ["遊スタジアム", "遊スタジアム", "遊スタジアム", [u(1), u(4)]],
];

const researchByName = new Map(rows.map(([name, slug, sourceName, rawRates, noPachinko = false]) => {
  const pachinkoRates = normalizePachinkoRates(rawRates);
  const status = deriveStoreRateStatus(pachinkoRates);
  return [name, {
    sourceName,
    pachinkoRates,
    rateResearch: {
      sourceLabel: "みんパチ",
      sourceUrl: `https://minpachi.com/${slug}/`,
      checkedAt: EHIME_STORE_RATE_CHECKED_AT,
      status,
      unconfirmedReason: noPachinko ? RATE_UNCONFIRMED_REASON.NO_PACHINKO : null,
      note: noPachinko
        ? "みんパチ上はスロット専門店。パチンコ貸玉・交換率の掲載なし。"
        : status === STORE_RATE_STATUS.VERIFIED
          ? "掲載されている全パチンコレートで具体的な交換玉数を確認。"
          : status === STORE_RATE_STATUS.PARTIAL
            ? "具体的な交換玉数が載るレートのみ確認済み。残りは未確認。"
            : "貸玉レートは確認済み。交換率は具体値未掲載のため未確認。",
    },
  }];
}));

export function getEhimeStoreRateResearch(name) {
  return researchByName.get(String(name || "").trim()) || {};
}
