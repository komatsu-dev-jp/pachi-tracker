import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecordStartDraft,
  createStrategyMapYutimeInitialContext,
  createYutimeRecordStartSelection,
  findRecordStartStore,
  normalizeChodamaBalls,
  normalizeOptionalFiniteNumber,
  resolveRecordStartChodama,
  resolveRecordStartSpecSapo,
  resolveYutimeStartChodama,
  setupInitialChodamaFromDraft,
} from "../recordStartFlow.js";
import { deriveSpecForMachine, machineDB } from "../machineDB.js";

const stores = [
  { id: "A", name: "同名店", chodama: 5000, rentBalls: 250, exRate: 280 },
  { id: "B", name: "同名店", chodama: 700 },
  { id: 0, name: "ゼロ店", chodama: 0 },
];

test("normalizes malformed balances safely", () => {
  assert.equal(normalizeChodamaBalls(12.5), 13);
  for (const value of [NaN, Infinity, -Infinity, -1, "invalid"]) assert.equal(normalizeChodamaBalls(value), 0);
});

test("preserves optional finite specSapo including negative and zero values", () => {
  assert.equal(normalizeOptionalFiniteNumber(-800), -800);
  assert.equal(normalizeOptionalFiniteNumber("-800"), -800);
  assert.equal(normalizeOptionalFiniteNumber(0), 0);
  for (const value of [null, "", " ", true, {}, NaN, Infinity, -Infinity, "bad"]) assert.equal(normalizeOptionalFiniteNumber(value), undefined);
  assert.equal(resolveRecordStartSpecSapo({ draft: { specSapo: -800 }, machineSpecSapo: 1 }), -800);
  assert.equal(resolveRecordStartSpecSapo({ draft: {}, machineSpecSapo: -800 }), -800);
  assert.equal(resolveRecordStartSpecSapo({ draft: { specSapo: "bad" }, machineSpecSapo: undefined }), 0);
});

test("machine negative specSapo survives yutime selection and standard draft", () => {
  const machine = machineDB.find((item) => item.specSapo === -800);
  const spec = deriveSpecForMachine(machine);
  const selection = createYutimeRecordStartSelection({ machineName: machine.name, specSapo: spec.specSapo });
  const draft = createRecordStartDraft({ id: "negative", selection, stores: [], rentBalls: 250, exRate: 250 });
  assert.equal(resolveRecordStartSpecSapo({ draft, machineSpecSapo: spec.specSapo }), -800);
  assert.equal(resolveRecordStartSpecSapo({ draft: createRecordStartDraft({ id: "strategy", selection: { machineName: machine.name }, stores: [], rentBalls: 250, exRate: 250 }), machineSpecSapo: spec.specSapo }), -800);
});

test("yutime selection and draft keep only valid own specSapo properties", () => {
  for (const value of [-800, 0, 123]) {
    const selection = createYutimeRecordStartSelection({ specSapo: value });
    const draft = createRecordStartDraft({ id: `value-${value}`, selection, stores: [], rentBalls: 250, exRate: 250 });
    assert.equal(Object.hasOwn(selection, "specSapo"), true);
    assert.equal(Object.hasOwn(draft, "specSapo"), true);
    assert.equal(draft.specSapo, value);
  }
  for (const value of [null, "", NaN, Infinity, -Infinity, "bad"]) {
    const selection = createYutimeRecordStartSelection({ specSapo: value });
    const draft = createRecordStartDraft({ id: "invalid", selection, stores: [], rentBalls: 250, exRate: 250 });
    assert.equal(Object.hasOwn(selection, "specSapo"), false);
    assert.equal(Object.hasOwn(draft, "specSapo"), false);
  }
});

test("finds stores by exact id only, including zero and numeric-string selections", () => {
  assert.equal(findRecordStartStore(stores, null), null);
  assert.equal(findRecordStartStore(stores, ""), null);
  assert.equal(findRecordStartStore(stores, "A").id, "A");
  assert.equal(findRecordStartStore(stores, "0").id, 0);
  assert.equal(findRecordStartStore(stores, "同名店"), null);
});

test("strategy draft uses canonical store id and its master balance", () => {
  const draft = createRecordStartDraft({ id: "strategy", selection: { storeId: "0", storeName: "別名", machineName: "台", num: 12 }, stores, rentBalls: 200, exRate: 250 });
  assert.equal(draft.storeId, 0);
  assert.equal(draft.storeName, "別名");
  assert.equal(draft.initialChodama, 0);
  assert.equal(setupInitialChodamaFromDraft(draft), "0");
});

test("draft initial balance keeps explicit zero and omits only missing values", () => {
  assert.equal(setupInitialChodamaFromDraft({ initialChodama: 0 }), "0");
  assert.equal(setupInitialChodamaFromDraft({}), null);
  assert.equal(setupInitialChodamaFromDraft(null), null);
});

test("normal, strategy, and store-detail starts resolve the selected store master", () => {
  for (const storeId of ["A", "B", 0]) assert.equal(resolveRecordStartChodama(stores, storeId, null), findRecordStartStore(stores, storeId).chodama);
});

test("explicit setup values never fall back to a previous store", () => {
  assert.equal(resolveRecordStartChodama(stores, "A", ""), 0);
  assert.equal(resolveRecordStartChodama(stores, "A", "0"), 0);
  assert.equal(resolveRecordStartChodama(stores, "A", 0), 0);
  assert.equal(resolveRecordStartChodama(stores, "A", "3800"), 3800);
  assert.equal(resolveRecordStartChodama(stores, "missing", null), 0);
  assert.equal(resolveRecordStartChodama(stores, null, null), 0);
});

test("yutime fresh start uses master, replace uses its explicit current balance, and move/update do not initialize", () => {
  assert.equal(resolveYutimeStartChodama({ startAction: "start", stores, storeId: "A" }), 5000);
  assert.equal(resolveYutimeStartChodama({ startAction: "replace", stores, storeId: "A", currentChodama: 3800 }), 3800);
  assert.equal(resolveYutimeStartChodama({ startAction: "move", stores, storeId: "A", currentChodama: 3800 }), null);
  assert.equal(resolveYutimeStartChodama({ startAction: "update", stores, storeId: "A", currentChodama: 3800 }), null);
});

test("strategy-map yutime context keeps the displayed store and selected machine number", () => {
  const context = createStrategyMapYutimeInitialContext({ storeId: "B", storeName: "店舗B", machineNum: 668 });
  assert.deepEqual(context, { initialStoreId: "B", initialStoreName: "店舗B", initialMachineNum: "668" });
  const draft = createRecordStartDraft({
    id: "map-yutime",
    selection: createYutimeRecordStartSelection({
      storeId: context.initialStoreId,
      storeName: context.initialStoreName,
      machineName: "機種",
      machineNum: context.initialMachineNum,
    }),
    stores,
    rentBalls: 250,
    exRate: 280,
  });
  assert.equal(draft.storeId, "B");
  assert.equal(draft.machineNum, "668");
  assert.equal(draft.initialChodama, 700);
});
