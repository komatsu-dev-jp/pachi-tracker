// 愛媛県のパチンコ店マスタ（内蔵リスト）
//
// ※ このリストはアプリ内蔵の初期店舗データです。
//    P-WORLD（松山・伊予エリア）の情報をもとに収録しています。
//    App.jsx で初回起動時に pt_stores へ自動シードされます（pt_storesSeeded フラグで一度のみ）。
//
//  - address は市町村レベルまで（番地は収録しない＝誤った番地を載せないため）
//  - 不足する店舗は「店舗検索・登録」画面の手動登録、または CSVインポートで追加可能
//  - 各店の貸玉/交換率は登録時に既定値を入れ、店舗ごとに編集できます
//
// 1件の形: { name: 店名, city: 市町村, address: 表示用住所 }

const raw = [
  // ── 松山市 ──
  { name: "ダイナム愛媛北条店", city: "松山市" },
  { name: "BIG ROCKY北久米", city: "松山市" },
  { name: "BIG ROCKY堀江", city: "松山市" },
  { name: "キスケPAO東雲店", city: "松山市" },
  { name: "セントラルディーボ空港通店", city: "松山市" },
  { name: "パチンコ天国福音寺店", city: "松山市" },
  { name: "POWER STATION小栗店", city: "松山市" },
  { name: "コロンボ松山インター店", city: "松山市" },
  { name: "丸之内ヘリオス2000竹原", city: "松山市" },
  { name: "セントラルディーボ小坂店", city: "松山市" },
  { name: "POWER STATION久米店", city: "松山市" },
  { name: "セントラルディーボ山越店", city: "松山市" },
  { name: "スーパーキスケPAO", city: "松山市" },
  { name: "クラブコロンボ森松店", city: "松山市" },
  { name: "キスケPAO小坂店", city: "松山市" },
  { name: "パチンコタイセイ", city: "松山市" },
  { name: "ブロードウェイ丸之内", city: "松山市" },
  { name: "パチンコ天国本店", city: "松山市" },
  { name: "パチンコ天国空港通店", city: "松山市" },
  { name: "セントラルディーボ保免店", city: "松山市" },
  { name: "ゴーゴーマルサン古三津店", city: "松山市" },
  { name: "大盛空港通り店", city: "松山市" },
  { name: "B.BⅢ", city: "松山市" },
  { name: "マイダス中央", city: "松山市" },
  { name: "第一会館三津店", city: "松山市" },
  { name: "B.BⅠ", city: "松山市" },
  { name: "大盛銀天街", city: "松山市" },

  // ── 伊予市 ──
  { name: "GOGOMARUSAN伊予", city: "伊予市" },
  { name: "ポポロ伊予", city: "伊予市" },

  // ── 東温市 ──
  { name: "ナングン東温店", city: "東温市" },
  { name: "大盛東温店", city: "東温市" },
  { name: "コロンボ東温店", city: "東温市" },

  // ── 伊予郡（松前町・砥部町）──
  { name: "キスケPAO松前店", city: "伊予郡松前町" },
  { name: "遊スタジアム", city: "伊予郡砥部町" },
];

// 表示・検索しやすいよう address（愛媛県＋市町村）を付与して公開
export const EHIME_STORES = raw.map((r) => ({
  name: r.name,
  city: r.city,
  address: `愛媛県${r.city}`,
}));

export default EHIME_STORES;
