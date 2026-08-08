import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve("src/components/strategy/StrategyMapDashboard.jsx"), "utf8");

test("台選び画面の戻る処理をヘッダーへ渡す", () => {
  assert.match(source, /aria-label="戻る"/);
  assert.match(source, /export default function StrategyMapDashboard\(\{ S, onBack, onStartRecord, onSelectStore \}\)/);
  assert.match(source, /storePickerOpen=\{storePickerOpen\}\s+onBack=\{onBack\}\s+onHelp=/);
});
