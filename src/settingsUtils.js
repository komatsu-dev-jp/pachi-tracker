const EMPTY_MEMBER_CARD = Object.freeze({ created: false, number: "", deposit: 0 });

export function builtinStoreId(name) {
  return `builtin:${String(name || "").trim()}`;
}

const storeNames = (store) => [
  String(store?.name || "").trim(),
  ...(Array.isArray(store?.legacyNames) ? store.legacyNames.map((name) => String(name || "").trim()) : []),
].filter(Boolean);

const cloneRateResearchFields = (store) => ({
  sourceName: String(store?.sourceName || store?.name || "").trim(),
  legacyNames: Array.isArray(store?.legacyNames) ? [...store.legacyNames] : [],
  pachinkoRates: Array.isArray(store?.pachinkoRates)
    ? store.pachinkoRates.map((rate) => ({ ...rate }))
    : [],
  rateResearch: store?.rateResearch ? { ...store.rateResearch } : null,
});

export function createBuiltinStore(store) {
  return {
    id: builtinStoreId(store?.name),
    source: "builtin",
    name: String(store?.name || "").trim(),
    address: String(store?.address || ""),
    city: String(store?.city || ""),
    rentBalls: 250,
    exRate: 250,
    memo: "",
    chodama: 0,
    chodamaMax: 0,
    lastVisit: "",
    replayBalls: 0,
    todaySettle: 0,
    memberCard: { ...EMPTY_MEMBER_CARD },
    ...cloneRateResearchFields(store),
  };
}

// 内蔵店舗の不足分だけを追加する。既存オブジェクトは参照IDも含め、そのまま保持する。
export function mergeBuiltinStores(existingStores, builtinStores) {
  const existing = Array.isArray(existingStores) ? existingStores : [];
  const builtins = Array.isArray(builtinStores) ? builtinStores : [];
  const builtinByName = new Map(
    builtins
      .filter((store) => String(store?.name || "").trim())
      .flatMap((store) => storeNames(store).map((name) => [name, store]))
  );

  const normalizedExisting = existing.map((store, index) => {
    if (store && typeof store === "object") {
      const builtin = builtinByName.get(String(store.name || "").trim());
      const hasBuiltinResearch = Boolean(
        builtin?.rateResearch
        || builtin?.sourceName
        || (Array.isArray(builtin?.pachinkoRates) && builtin.pachinkoRates.length)
      );
      return hasBuiltinResearch ? {
        ...store,
        sourceName: builtin.sourceName || store.sourceName || "",
        pachinkoRates: builtin.pachinkoRates || store.pachinkoRates || [],
        rateResearch: builtin.rateResearch || store.rateResearch || null,
      } : store;
    }
    const name = String(store || "").trim();
    if (!name) return null;
    const builtin = builtinByName.get(name);
    if (builtin) return createBuiltinStore(builtin);
    return {
      ...createBuiltinStore({ name, address: "" }),
      id: `custom:${index}:${name}`,
      source: "custom",
    };
  }).filter(Boolean);

  const existingNames = new Set(normalizedExisting.map((store) => String(store.name || "").trim()));
  const missingBuiltins = builtins
    .filter((store) => {
      const names = storeNames(store);
      return names.length > 0 && !names.some((name) => existingNames.has(name));
    })
    .map(createBuiltinStore);

  return [...normalizedExisting, ...missingBuiltins];
}

// 既存の店舗設定・貯玉・会員カードは維持し、内蔵店舗の調査メタデータだけを更新する。
// legacyNames は過去の内蔵名から現行名へ移行するために使う。
export function mergeBuiltinStoreResearch(existingStores, builtinStores) {
  const builtins = Array.isArray(builtinStores) ? builtinStores : [];
  const builtinByName = new Map(
    builtins.flatMap((store) => storeNames(store).map((name) => [name, store]))
  );
  const merged = mergeBuiltinStores(existingStores, builtins);

  return merged.map((store) => {
    if (!store || typeof store !== "object") return store;
    const builtin = builtinByName.get(String(store.name || "").trim());
    if (!builtin) return store;
    const isLegacyBuiltinName = store.source === "builtin"
      && String(store.name || "").trim() !== String(builtin.name || "").trim()
      && storeNames(builtin).includes(String(store.name || "").trim());
    return {
      ...store,
      ...(isLegacyBuiltinName ? { name: String(builtin.name || "").trim() } : {}),
      ...cloneRateResearchFields(builtin),
    };
  });
}

export function validateSettingNumber(raw, { allowZero = false, allowNegative = false } = {}) {
  if (raw === "" || raw === null || raw === undefined) return "数値を入力してください";
  const value = Number(raw);
  if (!Number.isFinite(value)) return "有効な数値を入力してください";
  if (!allowNegative && value < 0) return "0以上の数値を入力してください";
  if (!allowZero && value === 0) return "0より大きい数値を入力してください";
  return "";
}

export function normalizeAutoLockMinutes(value) {
  if (value === "background") return "background";
  const n = Number(value);
  return [1, 5, 15, 30].includes(n) ? n : 0;
}

export function shouldAutoLock({ autoLockMinutes, hiddenAt, now = Date.now() }) {
  const mode = normalizeAutoLockMinutes(autoLockMinutes);
  if (!hiddenAt || mode === 0) return false;
  if (mode === "background") return true;
  return now - hiddenAt >= mode * 60 * 1000;
}

export function updateStoresForSessionReset(
  stores,
  { persistStoreBalance = true, selectedStoreId = null, currentChodama = 0, extraChodama = 0 } = {}
) {
  const source = Array.isArray(stores) ? stores : [];
  if (!persistStoreBalance || selectedStoreId == null) return source;
  const finalChodama = (Number(currentChodama) || 0) + Math.max(0, Math.round(Number(extraChodama) || 0));
  return source.map((store) =>
    store && typeof store === "object" && store.id === selectedStoreId
      ? { ...store, chodama: finalChodama }
      : store
  );
}
