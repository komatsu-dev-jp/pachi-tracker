import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  builtinStoreId,
  mergeBuiltinStoreResearch,
  mergeBuiltinStores,
  shouldAutoLock,
  updateStoresForSessionReset,
  validateSettingNumber,
} from "../settingsUtils.js";
import { sanitizeBackupKv, sanitizeLegacyBackupObject } from "../backupSafety.js";
import {
  archiveIdentityKey,
  createArchiveRecordId,
  legacyArchiveContentKey,
  parseCsvRows,
  toCsvRow,
} from "../csv.js";
import {
  isNotificationEnabled,
  normalizeNotificationPrefs,
  NOTIF_BADGE_UNLOCKED,
  NOTIF_CASH_LIMIT_WARNING,
  NOTIF_LEVEL_UP,
} from "../notifications.js";

test("設定画面からのセッション初期化は店舗資産を変更しない", () => {
  const stores = [{
    id: "store-1",
    name: "既存店",
    chodama: 4321,
    memberCard: { created: true, number: "A-1", deposit: 5000 },
  }];
  const archives = [{ id: 1, storeName: "既存店" }];
  const result = updateStoresForSessionReset(stores, {
    persistStoreBalance: false,
    selectedStoreId: "store-1",
    currentChodama: 999,
  });

  assert.equal(result, stores);
  assert.deepEqual(result[0], stores[0]);
  assert.deepEqual(archives, [{ id: 1, storeName: "既存店" }]);
});

test("通常のセッション終了だけが選択店舗の貯玉を更新する", () => {
  const stores = [
    { id: "store-1", chodama: 1, memberCard: { number: "keep" } },
    { id: "store-2", chodama: 2 },
  ];
  const result = updateStoresForSessionReset(stores, {
    selectedStoreId: "store-1",
    currentChodama: 120,
    extraChodama: 30,
  });
  assert.equal(result[0].chodama, 150);
  assert.equal(result[0].memberCard.number, "keep");
  assert.equal(result[1], stores[1]);
});

test("店舗移行は既存編集値を維持し、内蔵店舗の不足分だけ固定IDで追加する", () => {
  const existing = [{
    id: "user-kept-id",
    name: "内蔵A",
    address: "ユーザーが修正した住所",
    chodama: 999,
    memberCard: { created: true, number: "keep" },
  }];
  const result = mergeBuiltinStores(existing, [
    { name: "内蔵A", address: "元住所" },
    { name: "内蔵B", address: "追加住所" },
  ]);

  assert.equal(result[0], existing[0]);
  assert.equal(result[0].address, "ユーザーが修正した住所");
  assert.equal(result[0].chodama, 999);
  assert.equal(result[1].id, builtinStoreId("内蔵B"));
  assert.equal(result[1].address, "追加住所");
});

test("店舗レート調査の移行は旧店舗名を引き継ぎ、ユーザー設定を維持する", () => {
  const existing = [{
    id: "builtin:旧店舗名",
    source: "builtin",
    name: "旧店舗名",
    address: "ユーザー修正住所",
    rentBalls: 333,
    exRate: 360,
    chodama: 4321,
    memberCard: { created: true, number: "keep" },
  }];
  const result = mergeBuiltinStoreResearch(existing, [{
    name: "現行店舗名",
    legacyNames: ["旧店舗名"],
    address: "内蔵住所",
    pachinkoRates: [{ lendingYen: 4, exchangeBallsPer100Yen: 27.5 }],
    rateResearch: {
      sourceLabel: "みんパチ",
      sourceUrl: "https://example.com/store/",
      checkedAt: "2026-07-25",
      status: "verified",
    },
  }]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "builtin:旧店舗名");
  assert.equal(result[0].name, "現行店舗名");
  assert.equal(result[0].address, "ユーザー修正住所");
  assert.equal(result[0].rentBalls, 333);
  assert.equal(result[0].exRate, 360);
  assert.equal(result[0].chodama, 4321);
  assert.equal(result[0].memberCard.number, "keep");
  assert.equal(result[0].rateResearch.status, "verified");
  assert.deepEqual(result[0].pachinkoRates, [{ lendingYen: 4, exchangeBallsPer100Yen: 27.5 }]);
});

test("バックアップからPIN・ロック状態・APIキーを除外する", () => {
  const safe = sanitizeBackupKv([
    { key: "pt_archives", value: [1] },
    { key: "pt_appPin", value: "1234" },
    { key: "pt_appLock", value: true },
    { key: "pt_aiApiKey", value: "secret" },
  ]);
  assert.deepEqual(safe, [{ key: "pt_archives", value: [1] }]);
  assert.deepEqual(
    sanitizeLegacyBackupObject({ pt_archives: [1], pt_appPin: "1234", other: true }),
    [["pt_archives", [1]]]
  );
});

test("CSVはカンマ・改行・引用符を含む値を往復できる", () => {
  const values = ["店舗,本店", "愛媛\n松山", "メモに\"引用符\""];
  assert.deepEqual(parseCsvRows(toCsvRow(values)), [values]);
});

test("収支CSVは同じ内容でも記録IDが違えば別セッションとして識別する", () => {
  const base = {
    date: "2026-07-18",
    storeName: "同じ店舗",
    machineName: "同じ機種",
    investYen: 10000,
    recoveryYen: 12000,
  };
  const first = { ...base, id: 1, recordId: "session-a" };
  const second = { ...base, id: 2, recordId: "session-b" };

  assert.equal(legacyArchiveContentKey(first), legacyArchiveContentKey(second));
  assert.notEqual(archiveIdentityKey(first), archiveIdentityKey(second));
  assert.equal(
    archiveIdentityKey(first),
    archiveIdentityKey({ ...first, id: 999 }),
    "端末内IDが変わってもCSVの記録IDを優先する",
  );
});

test("新規収支記録IDは空でなく、連続生成しても重ならない", () => {
  const first = createArchiveRecordId();
  const second = createArchiveRecordId();
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
});

test("数値設定は空欄・負数・不正文字を拒否し、小数を許可する", () => {
  assert.ok(validateSettingNumber(""));
  assert.ok(validateSettingNumber("-1"));
  assert.ok(validateSettingNumber("abc"));
  assert.equal(validateSettingNumber("25.5"), "");
  assert.equal(validateSettingNumber("0", { allowZero: true }), "");
});

test("通知設定は既定オンで種類ごとに停止できる", () => {
  assert.deepEqual(normalizeNotificationPrefs({ badge: false }), {
    levelUp: true,
    streak: true,
    badge: false,
    verdict: true,
    cashLimit: true,
  });
  assert.equal(isNotificationEnabled(NOTIF_BADGE_UNLOCKED, { badge: false }), false);
  assert.equal(isNotificationEnabled(NOTIF_LEVEL_UP, { badge: false }), true);
  assert.equal(isNotificationEnabled(NOTIF_CASH_LIMIT_WARNING, {}), true);
  assert.equal(isNotificationEnabled(NOTIF_CASH_LIMIT_WARNING, { cashLimit: false }), false);
});

test("自動ロックは指定したタイミングだけ作動する", () => {
  const hiddenAt = 1_000;
  assert.equal(shouldAutoLock({ autoLockMinutes: 0, hiddenAt, now: 99_999 }), false);
  assert.equal(shouldAutoLock({ autoLockMinutes: "background", hiddenAt, now: 1_001 }), true);
  assert.equal(shouldAutoLock({ autoLockMinutes: 5, hiddenAt, now: hiddenAt + 4 * 60_000 }), false);
  assert.equal(shouldAutoLock({ autoLockMinutes: 5, hiddenAt, now: hiddenAt + 5 * 60_000 }), true);
});

test("設定のリセット経路は店舗残高を保存しない指定で呼び出す", async () => {
  const appPath = fileURLToPath(new URL("../App.jsx", import.meta.url));
  const source = await readFile(appPath, "utf8");
  assert.match(source, /onReset=\{\(\) => resetAll\(0, \{ persistStoreBalance: false \}\)\}/);
  const resetBlock = source.slice(source.indexOf("const resetAll ="), source.indexOf("const archiveCurrentSession"));
  assert.doesNotMatch(resetBlock, /setArchives|memberCard/);
});

test("テーマA案は3つの世界観を実際の明暗と強調色へ接続する", async () => {
  const tabsPath = fileURLToPath(new URL("../components/tabs/SettingsTab.jsx", import.meta.url));
  const source = await readFile(tabsPath, "utf8");

  assert.match(source, /name: "DEEP NIGHT"[\s\S]*?theme: "dark"[\s\S]*?accent: "purple"/);
  assert.match(source, /name: "FOCUS GREEN"[\s\S]*?theme: "dark"[\s\S]*?accent: "green"/);
  assert.match(source, /name: "DAYLIGHT"[\s\S]*?theme: "light"[\s\S]*?accent: "teal"/);
  assert.match(source, /s\.setTheme\(item\.theme\)[\s\S]*?s\.setAccentColor\(item\.accent\)/);
  assert.match(source, /s\.setTheme\("system"\)/);
  assert.doesNotMatch(source, /gridTemplateColumns: "repeat\(5, 1fr\)"/);
});

test("設定トップはダークA案とライトB案を発光なしで切り替える", async () => {
  const cssPath = fileURLToPath(new URL("../index.css", import.meta.url));
  const tabsPath = fileURLToPath(new URL("../components/tabs/SettingsTab.jsx", import.meta.url));
  const [css, tabs] = await Promise.all([
    readFile(cssPath, "utf8"),
    readFile(tabsPath, "utf8"),
  ]);

  const lightTokens = css.slice(css.indexOf(":root"), css.indexOf('[data-theme="dark"]'));
  const darkTokens = css.slice(css.indexOf('[data-theme="dark"]'), css.indexOf("/* ================================================================"));
  assert.match(lightTokens, /--settings-bg: #f3f0e9/);
  assert.match(lightTokens, /--settings-card: #fffdf9/);
  assert.match(lightTokens, /--settings-summary-rule: 4px solid #376f67/);
  assert.match(darkTokens, /--settings-bg: #11151b/);
  assert.match(darkTokens, /--settings-card: #191e26/);
  assert.match(darkTokens, /--settings-icon-color: #929ba8/);

  assert.match(tabs, /const SettingsIconBox/);
  assert.doesNotMatch(tabs, /const NeonIconBox/);
  const cardBlock = tabs.slice(tabs.indexOf("const glassCardStyle"), tabs.indexOf("const SectionLabelV2"));
  assert.match(cardBlock, /background: "var\(--settings-card\)"/);
  assert.doesNotMatch(cardBlock, /backdropFilter|linear-gradient|boxShadow/);
});

test("貸玉の安全補正は保存値を起動時に書き戻さず、訂正導線を表示する", async () => {
  const appPath = fileURLToPath(new URL("../App.jsx", import.meta.url));
  const tabsPath = fileURLToPath(new URL("../components/tabs/SettingsTab.jsx", import.meta.url));
  const rotPath = fileURLToPath(new URL("../components/tabs/RotTab.jsx", import.meta.url));
  const noticesPath = fileURLToPath(new URL("../components/tabs/RentBallsFallbackNotices.jsx", import.meta.url));
  const [app, tabs, rot, notices] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(tabsPath, "utf8"),
    readFile(rotPath, "utf8"),
    readFile(noticesPath, "utf8"),
  ]);
  assert.match(app, /storedRentBalls/);
  assert.match(app, /return previousStoredValue/);
  assert.match(app, /rentBallsWarning/);
  assert.match(tabs, /25〜200玉\/100円/);
  assert.match(notices, /role="alert"/);
  assert.match(notices, /保存値が範囲外のため4円貸しで仮表示中です/);
  assert.match(notices, /minHeight: 44/);
  assert.match(notices, /onClick=\{onConfirm\}/);
  assert.match(rot, /R onConfirm=\{S\.confirmRentBallsFallback\}/);
  assert.doesNotMatch(rot, /onClick=\{\(\) => S\.setRentBalls\(250\)\}/);
  assert.match(notices, /4円貸し（250玉\/K）で確定/);
  assert.doesNotMatch(rot.slice(rot.indexOf("const draft = S.recordStartDraft"), rot.indexOf("const restoreHandoffGlobals")), /S\.setRentBalls\(Number\(draft\.rentBalls\)\)/);
  assert.match(app, /const confirmRentBallsFallback = useCallback/);
  assert.match(app, /setRentBalls\(Number\(rentBalls\)\)/);
  assert.match(app, /confirmRentBallsFallback/);
  assert.equal([...notices.matchAll(/4円貸し（250玉\/K）で確定/g)].length, 1);
  const confirmBlock = app.slice(app.indexOf("const confirmRentBallsFallback"), app.indexOf("const [exRate"));
  assert.match(confirmBlock, /canConfirmRentBallsFallback/);
  assert.match(confirmBlock, /setRentBalls\(Number\(rentBalls\)\)/);
  assert.match(rot, /setSetupRentBallsContext/);
  assert.match(rot, /rentBalls: setupRentBallsContext\.value/);
  assert.match(rot, /setSetupRentBallsContext\(storeRateContext\)/);
  assert.doesNotMatch(rot, /warning: storeRateContext\.warning \|\| !!S\.rentBallsWarning/);
  assert.match(rot, /normalizeRecordStartRentBallsContext\(draftRentContext/);
  const storeDetailBlock = app.slice(app.indexOf("onStartRecord={() =>"), app.indexOf("onOpenStrategy"));
  assert.match(storeDetailBlock, /startRecordFromSelection\(\{ storeId: store\.id, storeName: store\.name \|\| "" \}\)/);
  assert.doesNotMatch(storeDetailBlock, /setRentBalls|setExRate|setBallVal|setSessionClosingTime/);
  assert.doesNotMatch(rot.slice(rot.indexOf("const restoreHandoffGlobals"), rot.indexOf("const clearSetupDraftFields")), /setRentBalls/);
  assert.match(tabs, /resolveRentBalls\(store\.rentBalls\)\.value/);
  assert.match(tabs, /現在は仮補正表示です。更新すると250玉\/Kへ訂正されます/);
});

test("店舗CSVは面値変換後に貸玉を検証し、保存値を変えずに補正通知する", async () => {
  const tabsPath = fileURLToPath(new URL("../components/tabs/SettingsTab.jsx", import.meta.url));
  const source = await readFile(tabsPath, "utf8");

  assert.match(source, /const rentResolution = resolveRentBalls\(st\.rentBalls\)/);
  assert.match(source, /rentResolution\.value\s*\/\s*10/);
  assert.match(source, /isJp \? Math\.round\(parsed \* 10\) : parsed/);
  assert.match(source, /isValidRentBalls\(internal\)/);
  assert.match(source, /店舗保存値は未変更/);
});

test("記録編集は範囲外貸玉を250へ安全表示し、正常入力で警告を消す", async () => {
  const rotPath = fileURLToPath(new URL("../components/tabs/RotTab.jsx", import.meta.url));
  const source = await readFile(rotPath, "utf8");

  assert.match(source, /const \[editRentBallsWarning, setEditRentBallsWarning\]/);
  assert.match(source, /resolveRentBalls\(st\.rentBalls\)/);
  assert.match(source, /role="alert"/);
  assert.match(source, /setEditRentBallsWarning\(false\)/);
});
