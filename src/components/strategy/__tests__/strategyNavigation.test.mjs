import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve("src/components/strategy/StrategyMapDashboard.jsx"), "utf8");
const styles = readFileSync(resolve("src/components/strategy/StrategyMapDashboard.css"), "utf8");

test("台選び画面の戻る処理をヘッダーへ渡す", () => {
  assert.match(source, /aria-label="戻る"/);
  assert.match(source, /export default function StrategyMapDashboard\(\{ S, onBack, onStartRecord, onSelectStore \}\)/);
  assert.match(source, /storePickerOpen=\{storePickerOpen\}\s+onBack=\{handleStrategyBack\}\s+onHelp=/);
});

test("selected detail can return to the strategy map", () => {
  assert.match(source, /aria-label="\u53f0\u9078\u3073\u306b\u623b\u308b"/);
  assert.match(source, /const \[detailSheetOpen, setDetailSheetOpen\] = useState\(false\)/);
  assert.match(source, /const handleStrategyBack = \(\) => \{\s+if \(detailSheetOpen\)/);
  assert.match(source, /onBack=\{handleStrategyBack\}/);
  assert.match(source, /onClose=\{\(\) => setDetailSheetOpen\(false\)\}/);
  assert.match(styles, /\.strategy-selected-sheet__head\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
  assert.match(styles, /\.strategy-selected-sheet__head button\s*\{[^}]*min-height:\s*44px;/s);
});
