import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));
const readSource = (relativePath) => readFile(path.join(srcRoot, relativePath), "utf8");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return sourceFiles(target);
    }
    return /\.(?:js|jsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

test("ErrorBoundaryは再読み込みを主導線にし、削除前にバックアップと再確認を挟む", async () => {
  const source = await readSource("main.jsx");
  assert.match(source, /データを残して再読み込み/);
  assert.match(source, /先にバックアップを書き出す/);
  assert.match(source, /バックアップしてからリセット/);
  assert.match(source, /全実戦記録・設定・保存済み履歴が削除され、元に戻せません/);
  assert.ok(
    source.indexOf("データを残して再読み込み") < source.indexOf("バックアップしてからリセット"),
    "安全な再読み込みを破壊的リセットより先に表示する",
  );
});

test("全画面の確認操作はアプリ共通シートを使い、ブラウザ標準confirmを残さない", async () => {
  const files = await sourceFiles(srcRoot);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /window\.confirm|\bconfirm\s*\(/, path.relative(srcRoot, file));
  }
  const app = await readSource("App.jsx");
  assert.match(app, /requestConfirmation/);
  assert.match(app, /<ConfirmSheet/);
});

test("巨大タブと機種マスタを起動用バンドルから分離する", async () => {
  const tabs = await readSource("components/Tabs.jsx");
  const rotPath = path.join(srcRoot, "components", "tabs", "RotTab.jsx");
  const rotStat = await stat(rotPath);
  const app = await readSource("App.jsx");
  const vite = await readFile(path.join(srcRoot, "..", "vite.config.js"), "utf8");

  assert.ok(tabs.split(/\r?\n/).length < 100, "Tabs.jsxは遅延読込の小さな入口だけにする");
  assert.match(tabs, /lazy\(\(\) => import\("\.\/tabs\/RotTab"\)/);
  assert.match(tabs, /lazy\(\(\) => import\("\.\/tabs\/SettingsTab"\)/);
  assert.ok(rotStat.size < 500_000, "Babelの500KB最適化上限を超えない");
  assert.doesNotMatch(app, /from\s+["']\.\/machineDB["']/);
  assert.match(app, /import\("\.\/machineDB"\)/);
  assert.match(vite, /globIgnores:[\s\S]*siteSevenPdfReader-\*\.js/);
  assert.match(vite, /globIgnores:[\s\S]*siteSevenImageOcr-\*\.js/);
});

test("期待値計算は依存値が変わった時だけ再計算する", async () => {
  const app = await readSource("App.jsx");
  assert.match(app, /const baseCalculatedEv = useMemo\(\(\) => calcPreciseEV\(/);
  assert.match(app, /const calculatedEv = useMemo\(\(\) => applyEconomicEV\(/);
});
