import { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, f, font, mono, localDateStr } from "../../constants";
import { NI, Card, Btn, SecLabel } from "../Atoms";
import { searchMachines, deriveSpecForMachine, findEffectiveMachineByName } from "../../machineDB";
import { MACHINE_PROBABILITY_FILTER_OPTIONS, MACHINE_SORT_OPTIONS, filterMachines, getMachineMakerKey, sortMachines } from "../../machineSort";
import { restoreBackup } from "../../persistence";
import { exportFullBackup } from "../../backupDownload";
import { hashPin, verifyPin } from "../../pinSecurity";
import { archiveIdentityKey, createArchiveRecordId, getArchiveRecordId, legacyArchiveContentKey, parseCsvRows, toCsvRow } from "../../csv";
import { validateSettingNumber } from "../../settingsUtils";
import { STORE_RATE_STATUS, formatExchangeRate, formatLendingYen, formatPachinkoRateResearchSummary, formatResearchDate, storeRateStatusLabel } from "../../storeRateResearch";
import MachineSpecWorkspace from "../machines/MachineSpecWorkspace";
import IslandMapManager from "../select/IslandMapManager";
import { getStoreIslands, setStoreIslands } from "../select/hallMapSelectors";
import { createYutimeSessionFromMachine } from "../yutime/yutimeCalculator";
import PushSyncSettings from "../PushSyncSettings";
import { isValidRentBalls, resolveRentBalls } from "../../rentBalls";

export function SettingsTab({ s, onReset, onOpenStoreDetail }) {
    const [confirming, setConfirming] = useState(false);
    const [showMachineSearch, setShowMachineSearch] = useState(false);
    const [query, setQuery] = useState("");
    const [machineFilter, setMachineFilter] = useState("all");
    const [machineMakerFilter, setMachineMakerFilter] = useState("all");
    const [machineProbabilityFilter, setMachineProbabilityFilter] = useState("all");
    const [machineSort, setMachineSort] = useState("default");
    const [showMachineDetails, setShowMachineDetails] = useState(false);
    const [selected, setSelected] = useState(null);
    const [editingMachine, setEditingMachine] = useState(null);
    const [showMachineForm, setShowMachineForm] = useState(false);
    const [showEvidenceMachineUi, setShowEvidenceMachineUi] = useState(false);
    const allResults = searchMachines(query, s.customMachines);
    const makerOptions = useMemo(() => {
        const counts = new Map();
        searchMachines("", s.customMachines).forEach((machine) => {
            const maker = getMachineMakerKey(machine);
            counts.set(maker, (counts.get(maker) || 0) + 1);
        });
        return [...counts.entries()]
            .map(([id, count]) => ({ id, label: id, count }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ja"));
    }, [s.customMachines]);
    const quickMakerOptions = ["SANKYO", "京楽", "三洋", "サミー"]
        .map((id) => makerOptions.find((option) => option.id === id))
        .filter(Boolean);
    const visibleQuickMakerOptions = machineMakerFilter === "all"
        || quickMakerOptions.some((option) => option.id === machineMakerFilter)
        ? quickMakerOptions
        : [makerOptions.find((option) => option.id === machineMakerFilter), ...quickMakerOptions].filter(Boolean);
    const filteredResults = filterMachines(allResults, {
        type: machineFilter,
        maker: machineMakerFilter,
        probability: machineProbabilityFilter,
    });
    const results = sortMachines(filteredResults, machineSort);
    const activeMachineFilterCount = Number(machineMakerFilter !== "all")
        + Number(machineProbabilityFilter !== "all");
    const updateManualYutime = (key, value) => {
        const number = Math.max(0, Number(value) || 0);
        if (key === "triggerLowSpins") s.setCeilingRot(number);
        if (key === "expectedNetBalls") s.setYutimePayout(number);
        if (key === "triggerLowSpins" && number <= 0) {
            s.setYutimeSession(null);
            s.setYutimeDecision(null);
            return;
        }
        s.setYutimeSession((previous) => ({
            machineName: s.machineName || "",
            triggerLowSpins: Number(previous?.triggerLowSpins || s.ceilingRot) || 0,
            durationSpins: Number(previous?.durationSpins) || 0,
            expectedNetBalls: previous?.expectedNetBalls ?? (Number(s.yutimePayout) > 0 ? Number(s.yutimePayout) : null),
            assumedStart1K: Number(previous?.assumedStart1K || s.border) || 0,
            sourceUrl: previous?.sourceUrl || "",
            verifiedAt: previous?.verifiedAt || "",
            ...previous,
            [key]: key === "expectedNetBalls" && value === "" ? null : number,
            source: "manual",
        }));
        s.setYutimeDecision(null);
    };

    // 店舗管理用のstate
    const [showStoreSearch, setShowStoreSearch] = useState(false);
    const [storeQuery, setStoreQuery] = useState("");
    const [selectedStore, setSelectedStore] = useState(null);
    const [editingStore, setEditingStore] = useState(null);
    const [showStoreForm, setShowStoreForm] = useState(false);
    // 店舗詳細のインライン編集（会員カード残高 / 貯玉入出金）
    const [cardEditOpen, setCardEditOpen] = useState(false);
    const [cardEditNumber, setCardEditNumber] = useState("");
    const [cardEditChodama, setCardEditChodama] = useState(0);
    const [cardEditDeposit, setCardEditDeposit] = useState(0);
    const [chodamaMoveOpen, setChodamaMoveOpen] = useState(null); // "deposit" | "withdraw" | null
    const [chodamaMoveBalls, setChodamaMoveBalls] = useState("");
    const [chodamaMoveMemo, setChodamaMoveMemo] = useState("");
    const [showChodamaHistory, setShowChodamaHistory] = useState(false);

    // サブ画面ナビゲーション
    const [showAppearanceView, setShowAppearanceView] = useState(false);
    const [showNotificationView, setShowNotificationView] = useState(false);
    const [showAutoLockView, setShowAutoLockView] = useState(false);
    const [showGameSettingsView, setShowGameSettingsView] = useState(false);
    const [showMachineSpecView, setShowMachineSpecView] = useState(false);
    const [showChodamaView, setShowChodamaView] = useState(false);
    const [showChodamaDataView, setShowChodamaDataView] = useState(false);
    // 貯玉データ画面の入出金フォーム
    const [chodamaFormStoreId, setChodamaFormStoreId] = useState("");
    const [chodamaFormType, setChodamaFormType] = useState("deposit"); // deposit | withdraw | adjust
    const [chodamaFormBalls, setChodamaFormBalls] = useState("");
    const [chodamaFormDate, setChodamaFormDate] = useState(() => localDateStr());
    const [chodamaFormMemo, setChodamaFormMemo] = useState("");
    const [showBackupView, setShowBackupView] = useState(false);
    const [showAdvancedView, setShowAdvancedView] = useState(false);
    const [showHallMapView, setShowHallMapView] = useState(false);
    const [showPushSyncView, setShowPushSyncView] = useState(false);
    useEffect(() => {
        if (s.settingsIntent?.section !== "backup") return;
        setShowBackupView(true);
        s.clearSettingsIntent?.();
        // requestIdごとに一度だけ外部ナビゲーション要求を消費する。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [s.settingsIntent?.requestId]);

    // 削除確認
    const [confirmingDeleteMachine, setConfirmingDeleteMachine] = useState(null);
    const [confirmingDeleteStore, setConfirmingDeleteStore] = useState(null);

    // セキュリ: PIN設定UI
    const [pinSetStep, setPinSetStep] = useState("idle"); // idle | verify-disable | verify-change | enter | confirm
    const [pinCurrent, setPinCurrent] = useState("");
    const [pinDraft, setPinDraft] = useState("");
    const [pinConfirm, setPinConfirm] = useState("");
    const [pinSetError, setPinSetError] = useState(false);

    const validatePositive = (raw) => validateSettingNumber(raw);
    const validateNonNegative = (raw) => validateSettingNumber(raw, { allowZero: true });
    const validateFinite = (raw) => validateSettingNumber(raw, { allowZero: true, allowNegative: true });

    // トースト通知
    const [toasts, setToasts] = useState([]);
    const showToast = (msg, type = "success") => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
    };

    const ToastPortal = () => ReactDOM.createPortal(
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className="toast-item" style={{
                    background: t.type === "error" ? "var(--red)" : t.type === "warn" ? "var(--yellow)" : "var(--green)",
                }}>
                    {t.msg}
                </div>
            ))}
        </div>,
        document.body
    );

    // 機種フォームの初期値
    const emptyMachine = {
        name: "", maker: "", type: "ミドル", prob: "1/319.6", synthProb: 319.6,
        spec1R: 140, specAvgTotalRounds: 30, specSapo: 0, roundDist: "", rushDist: "",
        border: { "4.00": 0, "3.57": 0, "3.33": 0, "3.03": 0 }
    };
    const [formData, setFormData] = useState(emptyMachine);

    // 会員カードの初期値（created=作成済み有無 / number=カード番号 / deposit=入金残高円）
    const emptyMemberCard = { created: false, number: "", deposit: 0 };
    const normalizeMemberCard = (mc) => ({ ...emptyMemberCard, ...(mc || {}) });

    // 店舗フォームの初期値（rentBalls/exRateはフォーム内では面値=玉/100円で扱う）
    // lastVisit=最終来店(表示用テキスト) / replayBalls=店内再プレイ玉数 / todaySettle=本日精算予定玉数（いずれも任意・既定0/空）
    const emptyStore = { name: "", address: "", closingTime: "", rentBalls: 25, exRate: 25, memo: "", chodama: 0, chodamaMax: 0, lastVisit: "", replayBalls: 0, todaySettle: 0, memberCard: { ...emptyMemberCard } };
    const [storeFormData, setStoreFormData] = useState(emptyStore);
    const [storeFormErrors, setStoreFormErrors] = useState({});
    const validateStoreNumberField = (field, value) => {
        if (field === "rentBalls") return isValidRentBalls(Number(value) * 10) ? "" : "貸玉は25〜200玉/100円で入力してください";
        return validateSettingNumber(value, { allowZero: field !== "exRate" });
    };
    const setStoreNumberValue = (field, value) => {
        setStoreFormData((prev) => ({ ...prev, [field]: value }));
        setStoreFormErrors((prev) => ({ ...prev, [field]: "" }));
    };
    const validateStoreNumberOnBlur = (field) => {
        setStoreFormErrors((prev) => ({
            ...prev,
            [field]: validateStoreNumberField(field, storeFormData[field]),
        }));
    };
    const StoreFieldError = ({ field }) => storeFormErrors[field]
        ? <div role="alert" style={{ color: C.red, fontSize: 10, marginTop: 4 }}>{storeFormErrors[field]}</div>
        : null;

    // 店舗データの正規化（旧形式の文字列配列を新形式のオブジェクト配列に変換）+ chodama/会員カードフィールドの補完
    const normalizedStores = (s.stores || []).map(st =>
        typeof st === "string"
            ? { id: Date.now() + Math.random(), name: st, address: "", closingTime: "", rentBalls: 250, exRate: 250, memo: "", chodama: 0, chodamaMax: 0, lastVisit: "", replayBalls: 0, todaySettle: 0, memberCard: { ...emptyMemberCard } }
            : { ...st, closingTime: st.closingTime || "", chodama: st.chodama || 0, chodamaMax: st.chodamaMax || 0, lastVisit: st.lastVisit || "", replayBalls: st.replayBalls || 0, todaySettle: st.todaySettle || 0, memberCard: normalizeMemberCard(st.memberCard) }
    );

    // 島マップ管理（設定）用: 編集対象店舗 → 選択中の店舗 → 無ければ先頭。
    // 島配置は App.jsx の pt_hallMaps（s.hallMaps / s.setHallMaps）に一元保存する。
    const hallMapStore = normalizedStores.find((st) => st.id === s.selectedStoreId) || normalizedStores[0] || null;
    const hallMapStoreId = hallMapStore?.id ?? null;
    const hallMapIslands = getStoreIslands(s.hallMaps, hallMapStoreId);
    const handleChangeHallMapIslands = (nextIslands) => {
        if (hallMapStoreId == null || typeof s.setHallMaps !== "function") return;
        s.setHallMaps((prev) => setStoreIslands(prev, hallMapStoreId, nextIslands));
    };
    const handleChangeHallMapStore = (nextStoreId) => {
        if (typeof s.setSelectedStoreId === "function") s.setSelectedStoreId(nextStoreId);
    };

    // 店舗検索
    const storeResults = storeQuery.trim()
        ? normalizedStores.filter(st =>
            st.name.toLowerCase().includes(storeQuery.toLowerCase()) ||
            (st.address && st.address.toLowerCase().includes(storeQuery.toLowerCase()))
        )
        : normalizedStores;

    // 店舗フィールドの部分更新（一覧と選択中の詳細を同時に反映）
    const patchStore = (id, patch) => {
        const applyPatch = (st) => ({ ...st, ...(typeof patch === "function" ? patch(st) : patch) });
        s.setStores(prev => prev.map(st => (typeof st === "object" && st.id === id) ? applyPatch(st) : st));
        setSelectedStore(prev => (prev && prev.id === id) ? applyPatch(prev) : prev);
    };

    // 会員カードフィールドの部分更新
    const patchMemberCard = (store, patch) => {
        patchStore(store.id, (st) => ({ memberCard: { ...normalizeMemberCard(st.memberCard), ...patch } }));
    };

    // 貯玉の入出金（残高の真実源は store.chodama、履歴は chodamaLog に追記）
    // type: "deposit"(預入/+) | "withdraw"(引出/−) | "adjust"(調整/=)
    const adjustStoreChodama = (store, type, balls, memo = "") => {
        const amount = Math.max(0, Math.round(Number(balls) || 0));
        if (type !== "adjust" && amount <= 0) {
            showToast("玉数を入力してください", "warn");
            return false;
        }
        const before = store.chodama || 0;
        let after;
        if (type === "deposit") after = before + amount;
        else if (type === "withdraw") after = Math.max(0, before - amount);
        else after = amount; // adjust = 絶対値セット
        patchStore(store.id, { chodama: after });
        const entry = {
            id: Date.now() + Math.random(),
            date: localDateStr(),
            storeId: store.id,
            storeName: store.name,
            type,
            balls: amount, // 既存の貯玉データ画面と統一：balls は正の絶対値、符号は type から導出
            balanceBefore: before,
            balanceAfter: after,
            memo,
        };
        s.setChodamaLog(prev => [entry, ...prev]);
        return true;
    };

    // 機種登録フォームを開く
    const openMachineForm = (machine = null) => {
        if (machine) {
            setEditingMachine(machine);
            setFormData({ ...emptyMachine, ...machine });
        } else {
            setEditingMachine(null);
            setFormData(emptyMachine);
        }
        setShowMachineForm(true);
    };

    // 機種を保存
    const saveMachine = () => {
        if (!formData.name.trim()) return;
        const machineData = {
            ...formData,
            id: editingMachine?.id || Date.now(),
            synthProb: parseFloat(formData.synthProb) || 319.6,
            spec1R: parseFloat(formData.spec1R) || 140,
            specAvgTotalRounds: parseFloat(formData.specAvgTotalRounds) || 30,
            specSapo: parseFloat(formData.specSapo) || 0,
        };
        if (editingMachine) {
            // 編集
            s.setCustomMachines(prev => prev.map(m => m.id === editingMachine.id ? machineData : m));
        } else {
            // 新規登録
            s.setCustomMachines(prev => [...prev, machineData]);
        }
        setShowMachineForm(false);
        setEditingMachine(null);
        setFormData(emptyMachine);
    };

    // 機種を削除
    const deleteMachine = (machine) => {
        s.setCustomMachines(prev => prev.filter(m => m.id !== machine.id));
        setSelected(null);
        setConfirmingDeleteMachine(null);
        showToast(`「${machine.name}」を削除しました`);
    };

    // 機種スペック画面（MachineSpecWorkspace）の編集結果をカスタム機種として保存する。
    // 同名（または同id）のカスタムがあれば id を保ったまま置換、無ければ追記（重複を作らない）。
    // ビルトイン機種を編集した場合も「同名カスタム」を作ることで searchMachines が先頭で拾い上書きする。
    const persistMachineOverride = (rec) => {
        if (!rec || !rec.name) return;
        s.setCustomMachines(prev => {
            const i = prev.findIndex(m => m.id === rec.id || m.name === rec.name);
            if (i >= 0) {
                const next = [...prev];
                next[i] = { ...rec, id: prev[i].id };
                return next;
            }
            return [...prev, rec];
        });
        showToast(`「${rec.name}」のスペックを保存しました`);
    };

    // 店舗登録フォームを開く
    const openStoreForm = (store = null) => {
        setStoreFormErrors({});
        if (store) {
            setEditingStore(store);
            // 内部値（×10）をフォーム用の面値（÷10）に変換してセット
            setStoreFormData({
                ...emptyStore, ...store,
                rentBalls: resolveRentBalls(store.rentBalls).value / 10,
                exRate: Number(store.exRate || 250) / 10,
            });
        } else {
            setEditingStore(null);
            setStoreFormData(emptyStore);
        }
        setShowStoreForm(true);
    };

    // 店舗を保存（フォームの面値を内部値×10に変換）
    const saveStore = () => {
        if (!storeFormData.name.trim()) return;
        const numericFields = ["rentBalls", "exRate", "chodama", "chodamaMax", "replayBalls", "todaySettle"];
        const errors = Object.fromEntries(numericFields.map((field) => [field, validateStoreNumberField(field, storeFormData[field])]));
        setStoreFormErrors(errors);
        if (Object.values(errors).some(Boolean)) {
            showToast("数値欄のエラーを修正してください", "error");
            return;
        }
        const storeData = {
            ...storeFormData,
            id: editingStore?.id || Date.now(),
            rentBalls: Math.round(Number(storeFormData.rentBalls) * 10),
            exRate: Math.round(Number(storeFormData.exRate) * 10),
            closingTime: (storeFormData.closingTime || "").trim(),
            chodama: Math.round(Number(storeFormData.chodama)),
            chodamaMax: Math.round(Number(storeFormData.chodamaMax)),
            lastVisit: (storeFormData.lastVisit || "").trim(),
            replayBalls: Math.round(Number(storeFormData.replayBalls)),
            todaySettle: Math.round(Number(storeFormData.todaySettle)),
            memberCard: normalizeMemberCard(storeFormData.memberCard),
        };
        if (editingStore) {
            s.setStores(prev => prev.map(st => (typeof st === "object" && st.id === editingStore.id) ? storeData : st));
        } else {
            s.setStores(prev => [...prev.filter(st => typeof st === "object"), storeData]);
        }
        setShowStoreForm(false);
        setEditingStore(null);
        setStoreFormData(emptyStore);
    };

    // 店舗を削除
    const deleteStore = (store) => {
        s.setStores(prev => prev.filter(st => typeof st === "object" ? st.id !== store.id : st !== store.name));
        setSelectedStore(null);
        setConfirmingDeleteStore(null);
        showToast(`「${store.name}」を削除しました`);
    };

    // 店舗の設定を反映（複数交換率対応: 玉単価 ballVal も exRate から同期）
    const applyStore = (store) => {
        if (s.requestSessionContextChange?.(["店舗", "貸玉", "交換率"])) return;
        s.setStoreName(store.name);
        if (store.rentBalls) s.setRentBalls(store.rentBalls);
        if (store.exRate) {
            s.setExRate(store.exRate);
            s.setBallVal(1000 / store.exRate);
        }
        setSelectedStore(null);
        setShowStoreSearch(false);
    };

    // === CSV機能 ===
    // 店舗データをCSVエクスポート
    const exportStoresCSV = () => {
        if (normalizedStores.length === 0) {
            showToast("エクスポートする店舗がありません", "warn");
            return;
        }
        // 日本語ヘッダー・表示値（貸玉/交換は100円あたり玉数の面値）でエクスポート。
        // みんパチ調査は複数レート・確認状態・確認日・参照元を別列で保持する。
        let correctedCount = 0;
        const rows = normalizedStores.map(st => {
            const rentResolution = resolveRentBalls(st.rentBalls);
            if (rentResolution.isAbnormal) correctedCount += 1;
            return toCsvRow([
            st.name || "",
            st.address || "",
            rentResolution.value / 10,
            Number(st.exRate || 250) / 10,
            st.memo || "",
            st.chodama || 0,
            formatPachinkoRateResearchSummary(st.pachinkoRates),
            st.rateResearch ? storeRateStatusLabel(st.rateResearch.status) : "未登録",
            st.rateResearch?.checkedAt || "",
            st.rateResearch?.sourceUrl || "",
            ]);
        });
        const csvContent = ["店舗名,住所,貸玉,交換,メモ,貯玉,みんパチ貸玉・交換率,確認状態,確認日,参照元", ...rows].join("\n");
        downloadCSV(csvContent, "stores.csv");
        if (correctedCount > 0) showToast(`${correctedCount}件を25玉/100円で仮補正して出力（店舗保存値は未変更）`, "warn");
    };

    // CSVダウンロード共通関数
    const downloadCSV = (content, filename) => {
        const bom = "\uFEFF";
        const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // \u5373\u6642 revoke \u306F iOS Safari \u3067\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u304C\u4E2D\u65AD\u3055\u308C\u308B\u3053\u3068\u304C\u3042\u308B\u305F\u3081\u9045\u5EF6\u3055\u305B\u308B\uFF08backupAllData \u3068\u540C\u3058\u6271\u3044\uFF09
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // CSVパース関数
    const parseCSV = (text) => {
        const rows = parseCsvRows(text);
        if (rows.length < 2) return [];
        const headers = rows[0].map(h => h.trim());
        return rows.slice(1).map(values => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = (values[i] || "").trim(); });
            return obj;
        });
    };

    // 店舗CSVインポート（日本語・英語ヘッダー両対応）
    const importStoresCSV = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const inputEl = e.target;
        let text = "";
        try {
            const url = URL.createObjectURL(file);
            try {
                const resp = await fetch(url);
                text = await resp.text();
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch {
            inputEl.value = "";
            showToast("ファイルの読み込みに失敗しました", "error");
            return;
        }
        inputEl.value = "";
        try {
            const data = parseCSV(text.replace(/^\uFEFF/, ""));
            if (data.length === 0) {
                showToast("インポートできる店舗が見つかりませんでした", "error");
                return;
            }
            // 日本語ヘッダー（店舗名, 住所, 貸玉, 交換）と英語ヘッダー（name, address, rentBalls, exRate）の両方に対応
            const firstRow = data[0];
            const isJp = "店舗名" in firstRow;
            const getName = d => isJp ? d["店舗名"] : d["name"];
            // 日本語形式: 貸玉/交換は表示値（25玉）→ 内部値（250）に変換
            // 英語形式: 既に内部値（250）のまま
            let correctedRentBalls = 0;
            const getRentBalls = d => {
                const raw = isJp ? d["貸玉"] : d["rentBalls"];
                const parsed = Number.parseFloat(raw);
                const internal = raw === "" || raw == null ? 250 : (isJp ? Math.round(parsed * 10) : parsed);
                if (!isValidRentBalls(internal)) {
                    correctedRentBalls += 1;
                    return 250;
                }
                return internal;
            };
            const getExRate   = d => isJp ? Math.round((parseFloat(d["交換"])  || 25) * 10) : (parseFloat(d["exRate"])    || 250);
            const getChodama  = d => isJp ? (parseInt(d["貯玉"]) || 0) : (parseInt(d["chodama"]) || 0);
            const candidates = data.filter(d => getName(d)).map((d, index) => ({
                id: Date.now() + index,
                name: getName(d) || "",
                address: (isJp ? d["住所"] : d["address"]) || "",
                rentBalls: getRentBalls(d),
                exRate: getExRate(d),
                memo: (isJp ? d["メモ"] : d["memo"]) || "",
                chodama: getChodama(d),
            }));
            const known = new Set(normalizedStores.map(st => `${String(st.name || "").trim().toLowerCase()}|${String(st.address || "").trim().toLowerCase()}`));
            const newStores = candidates.filter((store) => {
                const key = `${store.name.trim().toLowerCase()}|${store.address.trim().toLowerCase()}`;
                if (known.has(key)) return false;
                known.add(key);
                return true;
            });
            if (correctedRentBalls > 0) showToast(`${correctedRentBalls}件の貸玉を25玉/100円に補正して取り込みました`, "warn");
            if (newStores.length > 0) {
                s.setStores(prev => [...prev.filter(st => typeof st === "object"), ...newStores]);
                showToast(`${newStores.length}件の店舗をインポートしました`);
            } else {
                showToast("インポートできる店舗が見つかりませんでした", "error");
            }
        } catch {
            showToast("ファイルの読み込みに失敗しました", "error");
        }
    };

    const applyMachine = (m) => {
        if (s.requestSessionContextChange?.(["機種", "機種スペック"])) return;
        s.setSynthDenom(m.synthProb);
        // 新形式（border1K のみ）の機種も border1K から等価スペックを逆算して反映する
        const spec = deriveSpecForMachine(m);
        if (spec.spec1R != null) s.setSpec1R(spec.spec1R);
        if (spec.specAvgRounds != null) s.setSpecAvgRounds(spec.specAvgRounds);
        if (spec.specSapo != null) s.setSpecSapo(spec.specSapo);
        if (m.name) s.setMachineName(m.name);
        s.setYutimeSession(createYutimeSessionFromMachine(m, { assumedStart1K: m.border1K || s.border }));
        s.setYutimeDecision(null);
        setSelected(null);
        setShowMachineSearch(false);
    };

    // === 全データバックアップ/リストア ===
    const backupAllData = async () => {
        try {
            const result = await exportFullBackup();
            s.setLastBackupAt?.(result.completedAt);
            showToast("全データのバックアップを保存しました");
        } catch (error) {
            console.error("[backup] export failed:", error);
            showToast("バックアップの保存に失敗しました", "error");
        }
    };

    const restoreAllData = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const inputEl = e.target;
        let text = "";
        try {
            const url = URL.createObjectURL(file);
            try { const resp = await fetch(url); text = await resp.text(); }
            finally { URL.revokeObjectURL(url); }
        } catch {
            inputEl.value = "";
            showToast("ファイルの読み込みに失敗しました", "error");
            return;
        }
        inputEl.value = "";
        try {
            const data = JSON.parse(text);
            const ok = await s.requestConfirmation?.({
                title: "バックアップから復元しますか？",
                message: "現在のデータをバックアップファイルの内容に置き換えます。復元前の状態へは戻せません。",
                confirmLabel: "復元する",
                tone: "danger",
            });
            if (!ok) return;
            const result = await restoreBackup(data);
            showToast(`${result.keyCount}項目のデータを復元しました。再読み込みします`);
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            console.error("[backup] restore failed:", error);
            showToast(error?.message || "バックアップファイルの読み込みに失敗しました", "error");
        }
    };

    // 「重複データを削除」は、従来どおり内容が同一の記録を検出する専用操作。
    // CSV取り込み時の別セッション判定は、下段の archiveIdentityKey（記録ID）で個別に行う。
    const archiveKey = (a) => legacyArchiveContentKey(a);

    const countDuplicateArchives = () => {
        const keyCount = {};
        (s.archives || []).forEach(a => {
            const key = archiveKey(a);
            keyCount[key] = (keyCount[key] || 0) + 1;
        });
        return Object.values(keyCount).reduce((sum, c) => sum + (c > 1 ? c - 1 : 0), 0);
    };

    const exportArchiveCSV = () => {
        const archives = s.archives || [];
        if (archives.length === 0) {
            showToast("エクスポートする収支データがありません", "warn");
            return;
        }
        const headers = [
            "記録ID", "日付", "時刻", "遊技時間（分）", "店舗名", "台番号", "機種名",
            "遊技種別", "貸メダル単価", "総ゲーム数", "BB回数", "RB回数", "AT・ART回数",
            "投資", "回収", "収支", "確率分母", "貸玉数", "換金率",
            "時間回転数", "ボーダー", "玉単価", "仕事量", "期待値/K", "1Kスタート", "総回転",
            "遊タイム期待値", "遊タイム残り回転", "遊タイム到達率", "遊タイム平均投資", "遊タイム到達必要資金",
            "遊タイム開始カウント", "遊タイム想定1K", "遊タイム遊技方法", "遊タイム発動回転",
            "遊タイム回数", "遊タイム平均純増玉", "遊タイムデータ種別", "遊タイム根拠URL"
        ];
        headers.push("遊タイム実績JSON");
        const rows = archives.map(a => {
            const isSlot = a.gameType === "slot";
            // スロット記録には、古いデータに残っているパチンコ専用値を出力しない。
            const settings = isSlot ? {} : (a.settings || {});
            const st = isSlot ? {} : (a.stats || {});
            const invest = a.investYen || 0;
            const recovery = a.recoveryYen || 0;
            const yd = isSlot ? {} : (a.yutimeDecision || {});
            const yr = yd.result || {};
            const ys = yd.spec || {};
            const yutimeRuns = Array.isArray(a.yutimeRuns) ? a.yutimeRuns : [];
            const slotStats = a.slotStats || {};
            return toCsvRow([
                getArchiveRecordId(a),
                a.date || "",
                a.time || "",
                Math.max(0, Math.round(Number(a.playMinutes) || 0)),
                a.storeName || "",
                a.machineNum || "",
                a.machineName || "",
                isSlot ? "slot" : "pachinko",
                isSlot ? (slotStats.rateYen || 20) : "",
                isSlot ? (slotStats.totalGames || 0) : "",
                isSlot ? (slotStats.bbCount || 0) : "",
                isSlot ? (slotStats.rbCount || 0) : "",
                isSlot ? (slotStats.atCount || 0) : "",
                invest,
                recovery,
                recovery - invest,
                settings.synthDenom || "",
                settings.rentBalls || "",
                settings.exRate || "",
                settings.rotPerHour || "",
                settings.border || "",
                settings.ballVal || "",
                Math.round(st.workAmount || 0),
                Math.round(st.ev1K || 0),
                st.start1K ? st.start1K.toFixed(2) : "",
                Math.round(st.netRot || 0),
                yr.valid ? Math.round(yr.selectedEV || 0) : "",
                yr.valid ? Math.round(yr.remainingSpins || 0) : "",
                yr.valid ? Number(yr.reachProbability || 0).toFixed(8) : "",
                yr.valid ? Math.round(yr.selectedInvestment || 0) : "",
                yr.valid && yr.selectedArrivalInvestment != null ? Math.ceil(yr.selectedArrivalInvestment) : "",
                yd.currentLowSpins ?? "",
                yd.assumedStart1K ?? "",
                yd.playMode || "",
                ys.triggerLowSpins ?? "",
                ys.durationSpins ?? "",
                ys.expectedNetBalls ?? "",
                ys.source || "",
                String(ys.sourceUrl || ""),
                yutimeRuns.length ? JSON.stringify(yutimeRuns) : ""
            ]);
        });
        const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
        downloadCSV(csv.replace(/^\uFEFF/, ""), `pachi-tracker-${localDateStr()}.csv`);
    };

    const importArchiveCSV = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                let text = ev.target?.result;
                if (typeof text !== "string") return;
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const rows = parseCsvRows(text);
                if (rows.length < 2) {
                    showToast("有効なCSVデータがありません", "error");
                    return;
                }
                const headers = rows[0].map(h => h.trim());
                const colIdx = (names) => {
                    const arr = Array.isArray(names) ? names : [names];
                    for (const name of arr) {
                        const idx = headers.indexOf(name);
                        if (idx !== -1) return idx;
                    }
                    return -1;
                };
                const getCol = (cols, names, def = "") => {
                    const idx = colIdx(names);
                    return idx >= 0 && cols[idx] ? cols[idx] : def;
                };

                const newArchives = [];
                for (let i = 1; i < rows.length; i++) {
                    const cols = rows[i].map(c => c.trim());
                    if (cols.length < 3) continue;
                    let date = getCol(cols, ["日付", "date"]);
                    if (date.includes("/")) date = date.replace(/\//g, "-");
                    if (!date) continue;

                    // 「記録ID」が無い旧CSVは空のまま受け取り、後段で従来の内容比較を行う。
                    const csvRecordId = getCol(cols, ["記録ID", "recordId"]).trim();
                    const time = getCol(cols, ["時刻", "time"]);
                    const playMinutes = Math.max(0, Math.round(
                        parseFloat(getCol(cols, ["遊技時間（分）", "遊技時間", "playMinutes"], "0")) || 0
                    ));
                    const invest = parseFloat(getCol(cols, ["投資額", "投資", "invest"], "0")) || 0;
                    const recovery = parseFloat(getCol(cols, ["回収額", "回収", "recovery"], "0")) || 0;
                    const gameTypeText = getCol(cols, ["遊技種別", "gameType"], "pachinko").toLowerCase();
                    const gameType = ["slot", "パチスロ", "スロット"].includes(gameTypeText) ? "slot" : "pachinko";
                    const slotStats = gameType === "slot" ? {
                        rateYen: Math.max(0, parseFloat(getCol(cols, ["貸メダル単価", "slotRateYen"], "20")) || 20),
                        totalGames: Math.max(0, Math.round(parseFloat(getCol(cols, ["総ゲーム数", "totalGames"], "0")) || 0)),
                        bbCount: Math.max(0, Math.round(parseFloat(getCol(cols, ["BB回数", "bbCount"], "0")) || 0)),
                        rbCount: Math.max(0, Math.round(parseFloat(getCol(cols, ["RB回数", "rbCount"], "0")) || 0)),
                        atCount: Math.max(0, Math.round(parseFloat(getCol(cols, ["AT・ART回数", "atCount"], "0")) || 0)),
                    } : null;
                    const synthDenom = parseFloat(getCol(cols, ["確率分母"], "319.6")) || 319.6;
                    const rentBalls = parseFloat(getCol(cols, ["貸玉数"], "250")) || 250;
                    const exRate = parseFloat(getCol(cols, ["換金率"], "250")) || 250;
                    const rotPerHour = parseFloat(getCol(cols, ["時間回転数"], "250")) || 250;
                    const border = parseFloat(getCol(cols, ["ボーダー"], "20")) || 20;
                    const ballVal = parseFloat(getCol(cols, ["玉単価"], "4")) || 4;
                    const workAmount = parseFloat(getCol(cols, ["仕事量", "期待値"], "0")) || 0;
                    const ev1K = parseFloat(getCol(cols, ["期待値/K"], "0")) || 0;
                    const start1K = parseFloat(getCol(cols, ["1Kスタート"], "0")) || 0;
                    const netRot = parseFloat(getCol(cols, ["総回転"], "0")) || 0;
                    const yutimeTrigger = parseFloat(getCol(cols, ["遊タイム発動回転"], "0")) || 0;
                    const yutimeEvText = getCol(cols, ["遊タイム期待値"], "");
                    const hasYutime = gameType !== "slot" && (yutimeTrigger > 0 || yutimeEvText !== "");
                    const yutimeDecision = hasYutime ? {
                        version: 2,
                        createdAt: `${date}T${time || "00:00"}:00`,
                        machineName: getCol(cols, ["機種名", "機種"]).replace(/，/g, ","),
                        currentLowSpins: parseFloat(getCol(cols, ["遊タイム開始カウント"], "0")) || 0,
                        assumedStart1K: parseFloat(getCol(cols, ["遊タイム想定1K"], "0")) || 0,
                        rateSource: "assumed",
                        playMode: getCol(cols, ["遊タイム遊技方法"], "cash") || "cash",
                        spec: {
                            triggerLowSpins: yutimeTrigger,
                            durationSpins: parseFloat(getCol(cols, ["遊タイム回数"], "0")) || 0,
                            expectedNetBalls: getCol(cols, ["遊タイム平均純増玉"], "") === "" ? null : parseFloat(getCol(cols, ["遊タイム平均純増玉"], "0")),
                            source: getCol(cols, ["遊タイムデータ種別"], "manual") || "manual",
                            sourceUrl: getCol(cols, ["遊タイム根拠URL"], "").replace(/%2C/g, ","),
                        },
                        result: yutimeEvText === "" ? { valid: false, status: "missing-input" } : {
                            valid: true,
                            selectedEV: parseFloat(yutimeEvText) || 0,
                            remainingSpins: parseFloat(getCol(cols, ["遊タイム残り回転"], "0")) || 0,
                            reachProbability: parseFloat(getCol(cols, ["遊タイム到達率"], "0")) || 0,
                            selectedInvestment: parseFloat(getCol(cols, ["遊タイム平均投資"], "0")) || 0,
                            selectedArrivalInvestment: getCol(cols, ["遊タイム到達必要資金"], "") === "" ? null : (parseFloat(getCol(cols, ["遊タイム到達必要資金"], "0")) || 0),
                        },
                    } : null;

                    let yutimeRuns = [];
                    const yutimeRunsJson = getCol(cols, ["遊タイム実績JSON"], "");
                    if (yutimeRunsJson) {
                        try {
                            const parsedRuns = JSON.parse(yutimeRunsJson);
                            if (Array.isArray(parsedRuns)) yutimeRuns = parsedRuns;
                        } catch {
                            yutimeRuns = [];
                        }
                    }

                    newArchives.push({
                        id: Date.now() + i + Math.random(),
                        recordId: csvRecordId,
                        gameType,
                        date,
                        time,
                        playMinutes,
                        storeName: getCol(cols, ["店舗名", "店舗"]).replace(/，/g, ","),
                        machineNum: getCol(cols, ["台番号"]),
                        machineName: getCol(cols, ["機種名", "機種"]).replace(/，/g, ","),
                        investYen: invest,
                        recoveryYen: recovery,
                        settings: gameType === "slot" ? {} : { synthDenom, rentBalls, exRate, rotPerHour, border, ballVal },
                        stats: gameType === "slot" ? {} : { workAmount, ev1K, start1K, netRot },
                        slotStats,
                        rotRows: [],
                        jpLog: [],
                        sesLog: [],
                        totalTrayBalls: 0,
                        startRot: 0,
                        yutimeDecision,
                        yutimeRuns,
                        isManual: true,
                    });
                }

                if (newArchives.length === 0) {
                    showToast("インポートできる収支データがありませんでした", "error");
                    return;
                }

                const previous = Array.isArray(s.archives) ? s.archives : [];
                const nonImported = previous.filter(a => !a.isImported);
                const existingIdentityKeys = new Set(nonImported.map(archiveIdentityKey));
                const existingLegacyKeys = new Set(nonImported.map(legacyArchiveContentKey));
                const seenIdentityKeys = new Set();
                const seenLegacyKeys = new Set();
                const dedupedImported = newArchives
                    .filter(a => {
                        if (a.recordId) {
                            const key = archiveIdentityKey(a);
                            if (existingIdentityKeys.has(key) || seenIdentityKeys.has(key)) return false;
                            seenIdentityKeys.add(key);
                            return true;
                        }

                        // 旧CSV（記録ID列なし）は、これまでと同じ内容比較で重複を避ける。
                        const key = legacyArchiveContentKey(a);
                        if (existingLegacyKeys.has(key) || seenLegacyKeys.has(key)) return false;
                        seenLegacyKeys.add(key);
                        return true;
                    })
                    // 一度取り込んだ旧CSVにも新しい固有IDを付け、次回の書き出し以降は安全に往復できるようにする。
                    .map(a => ({
                        ...a,
                        recordId: a.recordId || createArchiveRecordId(),
                        isImported: true,
                    }));
                s.setArchives([...nonImported, ...dedupedImported]);
                showToast(`${dedupedImported.length}件の収支データをインポートしました`);
            } catch (err) {
                showToast(`CSVの読み込みに失敗しました: ${err.message}`, "error");
            }
        };
        reader.readAsText(file, "UTF-8");
        e.target.value = "";
    };

    const deleteDuplicateArchives = async () => {
        const duplicateCount = countDuplicateArchives();
        if (duplicateCount <= 0) return;
        const confirmed = await s.requestConfirmation?.({
            title: "重複データを削除しますか？",
            message: `${duplicateCount}件の重複を削除し、同じ内容のデータは1件だけ残します。`,
            confirmLabel: "重複を削除",
            tone: "danger",
        });
        if (!confirmed) return;
        s.setArchives(prev => {
            const seen = new Set();
            return prev.filter(a => {
                const key = archiveKey(a);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        });
        showToast("重複データを削除しました");
    };

    const deleteImportedArchives = async () => {
        const confirmed = await s.requestConfirmation?.({
            title: "CSV取込データを削除しますか？",
            message: "CSVから取り込んだデータをすべて削除します。手動で記録したデータは残ります。",
            confirmLabel: "取込データを削除",
            tone: "danger",
        });
        if (!confirmed) return;
        s.setArchives(prev => prev.filter(a => !a.isImported));
        showToast("インポートデータを削除しました");
    };

    // 交換レート（円/玉）を計算
    const yenPerBall = 100 / ((s.exRate || 250) / 10);
    // 交換レートキーを特定（4.00, 3.57, 3.33, 3.03に近い値）
    const getExRateKey = () => {
        if (Math.abs(yenPerBall - 4.00) < 0.1) return "4.00";
        if (Math.abs(yenPerBall - 3.57) < 0.1) return "3.57";
        if (Math.abs(yenPerBall - 3.33) < 0.1) return "3.33";
        if (Math.abs(yenPerBall - 3.03) < 0.1) return "3.03";
        return null; // カスタムレート
    };
    const exRateKey = getExRateKey();
    const exRateLabel = exRateKey ? `${exRateKey}円交換` : `${yenPerBall.toFixed(2)}円交換`;

    // 理論ボーダーのリアルタイム計算
    const exchP = 1000 / (s.exRate || 1);
    const avgNetGainSpec = (s.spec1R || 0) * (s.specAvgRounds || 0) + (s.specSapo || 0);
    const specNetGainYen = avgNetGainSpec * exchP;
    const formulaBorder = specNetGainYen > 0 ? ((s.synthDenom || 1) * 1000) / specNetGainYen : 0;

    // 機種DB（標準＋カスタム）から現在設定中の機種を引き当て、DB実戦値ボーダーを優先
    const matchedMachine = s.machineName
        ? findEffectiveMachineByName(s.machineName, s.customMachines)
        : null;
    const dbBorderForKey = matchedMachine && exRateKey && matchedMachine.border?.[exRateKey];
    const calcBorder = dbBorderForKey != null ? Number(dbBorderForKey) : formulaBorder;
    const borderSource = dbBorderForKey != null ? "db" : "formula";

    // Store detail view
    if (selectedStore) {
        const st = selectedStore;
        const rentResolution = resolveRentBalls(st.rentBalls);
        const faceRent = rentResolution.value / 10;
        const faceEx = Number(st.exRate || 250) / 10;
        const yenPerBall = faceRent > 0 ? 100 / faceRent : 0;        // 1玉あたりの貸玉単価（円）
        const rentLabel = `${Number.isInteger(yenPerBall) ? yenPerBall : yenPerBall.toFixed(1)}円パチンコ`;
        const exYenPerBall = faceEx > 0 ? 100 / faceEx : 0;          // 1玉あたりの換金額（円）
        const chodamaBalls = st.chodama || 0;
        const chodamaYen = Math.round(chodamaBalls * exYenPerBall);
        const mc = normalizeMemberCard(st.memberCard);
        const maxBalls = st.chodamaMax || 0;
        const usagePct = maxBalls > 0 ? Math.min(100, Math.round((chodamaBalls / maxBalls) * 100)) : 0;
        const replayBalls = st.replayBalls || 0;
        const todaySettle = st.todaySettle || 0;
        const cardHistory = (s.chodamaLog || []).filter(l => l.storeId === st.id);
        // Bloomberg風スタイル（KPIタイル／情報ボックス／カード枠）
        const tile = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 6px", textAlign: "center" };
        const tileLabel = { fontSize: 10, color: C.sub, marginBottom: 6, fontWeight: 600 };
        const tileBig = { fontSize: 16, fontWeight: 800, fontFamily: mono };
        const tileSub = { fontSize: 9, color: C.sub, marginTop: 4 };
        const infoBox = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" };
        const infoLabel = { fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 };
        const cardSt = { padding: 18, marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 18 };
        const secTitle = { fontSize: 11, fontWeight: 800, color: C.subHi, letterSpacing: 0.8 };
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                {/* ヘッダー操作（戻る / 店舗を登録） */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <button className="b" onClick={() => { setSelectedStore(null); setCardEditOpen(false); setChodamaMoveOpen(null); setShowChodamaHistory(false); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                        color: C.text, fontSize: 12, padding: "9px 14px", minHeight: 44, fontFamily: font, fontWeight: 600
                    }}>← 一覧に戻る</button>
                    <div style={{ flex: 1 }} />
                    <button className="b" onClick={() => { setSelectedStore(null); openStoreForm(); }} style={{
                        background: C.blue, border: "none", borderRadius: 10,
                        color: "#fff", fontSize: 12, padding: "9px 16px", minHeight: 44, fontFamily: font, fontWeight: 800,
                        boxShadow: `0 4px 14px ${C.blue}44`,
                    }}>＋ 店舗を登録</button>
                </div>

                {/* ① 店舗サマリーカード */}
                <Card style={cardSt}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${C.blue}22`, border: `1px solid ${C.blue}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.blue }}>
                            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9 4.5 4h15L21 9" /><path d="M3 9v11h18V9" /><path d="M3 9c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3" /><path d="M9 20v-6h6v6" />
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{st.name}</div>
                            {st.address && <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{st.address}</div>}
                        </div>
                        <button className="b" onClick={() => { setSelectedStore(null); openStoreForm(st); }} style={{
                            flexShrink: 0, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                            color: C.subHi, fontSize: 11, padding: "7px 14px", fontFamily: font, fontWeight: 700
                        }}>編集</button>
                    </div>

                    {/* KPI 3列: 交換率 / 貸玉 / 換金レート */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={tile}>
                            <div style={tileLabel}>交換率</div>
                            <div style={{ ...tileBig, color: C.teal }}>{exYenPerBall ? exYenPerBall.toFixed(2) : "—"}円</div>
                            <div style={tileSub}>{faceEx}玉交換</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>貸玉</div>
                            <div style={{ ...tileBig, color: C.yellow, fontSize: 13 }}>{rentLabel}</div>
                            <div style={tileSub}>{faceRent}玉/100円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>換金レート</div>
                            <div style={{ ...tileBig, color: C.green }}>{faceEx}玉</div>
                            <div style={tileSub}>= 100円</div>
                        </div>
                    </div>

                    {maxBalls > 0 && (
                        <div style={{ ...infoBox, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                                <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>貯玉上限</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(maxBalls)}玉</span>
                            </div>
                            <div style={{ height: 7, borderRadius: 999, background: C.borderHi, overflow: "hidden" }}>
                                <div style={{ width: `${usagePct}%`, height: "100%", background: usagePct >= 90 ? C.red : C.purple, borderRadius: 999 }} />
                            </div>
                            <div style={{ fontSize: 9, color: C.sub, marginTop: 6 }}>上限に対して {usagePct}%（貯玉残高 {f(chodamaBalls)}玉）</div>
                        </div>
                    )}

                    {/* 最終来店 / メモ */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div style={infoBox}>
                            <div style={infoLabel}>最終来店</div>
                            <div style={{ fontSize: 12, color: st.lastVisit ? C.text : C.sub, fontWeight: 700, fontFamily: mono }}>{st.lastVisit || "—"}</div>
                        </div>
                        <div style={infoBox}>
                            <div style={infoLabel}>メモ</div>
                            <div style={{ fontSize: 12, color: st.memo ? C.text : C.sub, lineHeight: 1.5 }}>{st.memo || "—"}</div>
                        </div>
                    </div>
                </Card>

                {/* みんパチで確認した複数の貸玉・交換率。具体値不明は未確認のまま表示する。 */}
                <Card style={cardSt}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                        <div style={secTitle}>みんパチ確認記録</div>
                        <span style={{
                            fontSize: 9, fontWeight: 800, padding: "4px 9px", borderRadius: 999,
                            color: st.rateResearch?.status === STORE_RATE_STATUS.VERIFIED ? C.green : C.yellow,
                            background: st.rateResearch?.status === STORE_RATE_STATUS.VERIFIED ? `${C.green}18` : `${C.yellow}18`,
                            border: `1px solid ${st.rateResearch?.status === STORE_RATE_STATUS.VERIFIED ? `${C.green}44` : `${C.yellow}44`}`,
                        }}>
                            {st.rateResearch ? storeRateStatusLabel(st.rateResearch.status) : "参照元未登録"}
                        </span>
                    </div>
                    {st.rateResearch ? (
                        <>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10, fontSize: 10, color: C.sub }}>
                                <span>確認日 {formatResearchDate(st.rateResearch.checkedAt)}</span>
                                <span>{st.rateResearch.sourceLabel || "みんパチ"}</span>
                            </div>
                            {st.sourceName && st.sourceName !== st.name && (
                                <div style={{ ...infoBox, marginBottom: 8, fontSize: 10, color: C.subHi }}>
                                    みんパチ掲載名: {st.sourceName}
                                </div>
                            )}
                            {(st.pachinkoRates || []).length > 0 ? (
                                <div style={{ display: "grid", gap: 7 }}>
                                    {st.pachinkoRates.map((rate) => {
                                        const verified = rate.exchangeStatus === STORE_RATE_STATUS.VERIFIED;
                                        return (
                                            <div key={`${rate.lendingYen}-${rate.exchangeBallsPer100Yen ?? "unknown"}`} style={{ ...infoBox, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{formatLendingYen(rate.lendingYen)}パチンコ</div>
                                                    <div style={{ fontSize: 10, color: C.sub, marginTop: 3 }}>{formatExchangeRate(rate)}</div>
                                                </div>
                                                <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, color: verified ? C.green : C.yellow }}>
                                                    {verified ? "確認済み" : "未確認"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ ...infoBox, fontSize: 11, fontWeight: 700, color: C.subHi }}>パチンコ貸玉の掲載なし</div>
                            )}
                            {st.rateResearch.note && <div style={{ fontSize: 10, lineHeight: 1.6, color: C.sub, marginTop: 10 }}>{st.rateResearch.note}</div>}
                            <div style={{ fontSize: 9, lineHeight: 1.55, color: C.sub, marginTop: 8 }}>第三者サイトの情報です。古い情報や具体値不明のレートは確認済みにしていません。実戦前は店頭でも確認してください。</div>
                            {st.rateResearch.sourceUrl && (
                                <a href={st.rateResearch.sourceUrl} target="_blank" rel="noreferrer" style={{
                                    minHeight: 44, marginTop: 10, borderRadius: 10, border: `1px solid ${C.blue}55`,
                                    background: `${C.blue}14`, color: C.blue, fontSize: 11, fontWeight: 800,
                                    display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
                                }}>参照元を開く ↗</a>
                            )}
                        </>
                    ) : (
                        <div style={{ ...infoBox, fontSize: 11, color: C.sub }}>確認日・参照元は未登録です。</div>
                    )}
                </Card>

                {/* ② 会員カード情報 */}
                <Card style={cardSt}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={secTitle}>会員カード情報</div>
                        <span style={{
                            fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 999,
                            background: mc.created ? `${C.green}22` : C.surfaceHi,
                            color: mc.created ? C.green : C.sub,
                            border: `1px solid ${mc.created ? `${C.green}55` : C.borderHi}`,
                        }}>{mc.created ? "● 作成済み" : "未作成"}</span>
                    </div>

                    {mc.created ? (
                        <>
                            <div style={{ ...infoBox, marginBottom: 10 }}>
                                <div style={infoLabel}>カード番号</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: mono, letterSpacing: 1.5 }}>{mc.number || "—— —— —— ——"}</div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                <div style={tile}>
                                    <div style={tileLabel}>貯玉残高</div>
                                    <div style={{ ...tileBig, color: C.purple, fontSize: 15 }}>{f(chodamaBalls)}</div>
                                    <div style={tileSub}>玉</div>
                                </div>
                                <div style={tile}>
                                    <div style={tileLabel}>入金残高</div>
                                    <div style={{ ...tileBig, color: C.teal, fontSize: 15 }}>{f(mc.deposit)}</div>
                                    <div style={tileSub}>円</div>
                                </div>
                            </div>

                            {cardEditOpen ? (
                                <div style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12, padding: 12, marginBottom: 4 }}>
                                    <div style={{ fontSize: 11, color: C.subHi, fontWeight: 700, marginBottom: 10 }}>残高を更新</div>
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>カード番号</div>
                                        <input type="text" value={cardEditNumber} onChange={e => setCardEditNumber(e.target.value)}
                                            placeholder="1234 5678 9012 3456"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "9px 11px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none" }} />
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>貯玉残高(玉)</div>
                                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={cardEditChodama} onChange={e => setCardEditChodama(e.target.value)}
                                                style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "9px 8px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none", textAlign: "right" }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>入金残高(円)</div>
                                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={cardEditDeposit} onChange={e => setCardEditDeposit(e.target.value)}
                                                style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "9px 8px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none", textAlign: "right" }} />
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <Btn label="保存" small onClick={() => {
                                            patchStore(st.id, (cur) => ({
                                                chodama: parseInt(cardEditChodama) || 0,
                                                memberCard: { ...normalizeMemberCard(cur.memberCard), number: cardEditNumber.trim(), deposit: parseInt(cardEditDeposit) || 0 },
                                            }));
                                            setCardEditOpen(false);
                                            showToast("会員カード残高を更新しました");
                                        }} bg={C.blue} fg="#fff" bd="none" />
                                        <Btn label="キャンセル" small onClick={() => setCardEditOpen(false)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", gap: 8 }}>
                                    <Btn label="残高を更新" small onClick={() => {
                                        setCardEditNumber(mc.number || "");
                                        setCardEditChodama(chodamaBalls);
                                        setCardEditDeposit(mc.deposit || 0);
                                        setCardEditOpen(true);
                                    }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                    <Btn label="履歴を見る" small onClick={() => setShowChodamaHistory(v => !v)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                    <Btn label="カード削除" small onClick={() => {
                                        patchMemberCard(st, { ...emptyMemberCard });
                                        showToast("会員カードを削除しました", "warn");
                                    }} bg="rgba(180,60,60,0.18)" fg={C.red} bd={`${C.red}40`} />
                                </div>
                            )}

                            {showChodamaHistory && (
                                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                                    <div style={{ fontSize: 11, color: C.subHi, fontWeight: 700, marginBottom: 8 }}>貯玉 入出金履歴</div>
                                    {cardHistory.length === 0 ? (
                                        <div style={{ fontSize: 11, color: C.sub, textAlign: "center", padding: "12px 0" }}>履歴はありません</div>
                                    ) : cardHistory.slice(0, 20).map(l => (
                                        <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                                            <div>
                                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, marginRight: 8, background: l.type === "deposit" ? `${C.green}22` : l.type === "withdraw" ? `${C.red}22` : `${C.yellow}22`, color: l.type === "deposit" ? C.green : l.type === "withdraw" ? C.red : C.yellow }}>
                                                    {l.type === "deposit" ? "預入" : l.type === "withdraw" ? "引出" : "調整"}
                                                </span>
                                                <span style={{ fontSize: 10, color: C.sub }}>{l.date}</span>
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                <div style={{ fontSize: 13, fontWeight: 800, color: l.type === "deposit" ? C.green : l.type === "withdraw" ? C.red : C.subHi, fontFamily: mono }}>
                                                    {l.type === "adjust" ? "=" : l.type === "withdraw" ? "−" : "+"}{f(l.balls)}玉
                                                </div>
                                                <div style={{ fontSize: 9, color: C.sub }}>残 {f(l.balanceAfter)}玉</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>この店舗の会員カードはまだ作成されていません。作成すると貯玉残高・入金残高を管理できます。</div>
                            <Btn label="会員カードを作成" onClick={() => {
                                patchMemberCard(st, { created: true });
                                setCardEditNumber("");
                                setCardEditChodama(chodamaBalls);
                                setCardEditDeposit(0);
                                setCardEditOpen(true);
                                showToast("会員カードを作成しました");
                            }} bg={C.green} fg="#06120d" bd="none" />
                        </div>
                    )}
                    {rentResolution.isAbnormal && <div role="alert" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: `${C.yellow}22`, color: C.text, fontSize: 11 }}>保存値が範囲外のため4円貸しで仮表示中です。</div>}
                </Card>

                {/* ③ 貯玉・精算管理 */}
                <Card style={cardSt}>
                    <div style={{ ...secTitle, marginBottom: 14 }}>貯玉・精算管理</div>

                    {/* KPI 3列: 店内貯玉 / 店内再プレイ / 本日精算予定 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={tile}>
                            <div style={tileLabel}>店内貯玉</div>
                            <div style={{ ...tileBig, color: C.purple }}>{f(chodamaBalls)}</div>
                            <div style={tileSub}>約{f(chodamaYen)}円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>店内再プレイ</div>
                            <div style={{ ...tileBig, color: C.blue }}>{f(replayBalls)}</div>
                            <div style={tileSub}>玉</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>本日精算予定</div>
                            <div style={{ ...tileBig, color: C.yellow }}>{f(todaySettle)}</div>
                            <div style={tileSub}>玉</div>
                        </div>
                    </div>

                    {chodamaMoveOpen ? (
                        <div style={{ ...infoBox, borderColor: chodamaMoveOpen === "deposit" ? `${C.green}55` : `${C.orange}55`, padding: 14 }}>
                            <div style={{ fontSize: 11, color: chodamaMoveOpen === "deposit" ? C.green : C.orange, fontWeight: 800, marginBottom: 12 }}>{chodamaMoveOpen === "deposit" ? "貯玉に入れる（預入 ＋）" : "貯玉から使う（引出 −）"}</div>
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 5 }}>玉数</div>
                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={chodamaMoveBalls} onChange={e => setChodamaMoveBalls(e.target.value)}
                                    placeholder="0"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "12px 14px", fontSize: 22, fontWeight: 800, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }} />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 5 }}>メモ（任意）</div>
                                <input type="text" value={chodamaMoveMemo} onChange={e => setChodamaMoveMemo(e.target.value)}
                                    placeholder="例: 当日精算分"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, color: C.text, fontFamily: font, outline: "none" }} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <Btn label="キャンセル" small onClick={() => { setChodamaMoveOpen(null); setChodamaMoveBalls(""); setChodamaMoveMemo(""); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                <Btn label={chodamaMoveOpen === "deposit" ? "入れる" : "使う"} small onClick={() => {
                                    const ok = adjustStoreChodama(st, chodamaMoveOpen, chodamaMoveBalls, chodamaMoveMemo.trim());
                                    if (ok) { setChodamaMoveOpen(null); setChodamaMoveBalls(""); setChodamaMoveMemo(""); showToast(chodamaMoveOpen === "deposit" ? "貯玉に入れました" : "貯玉から使いました"); }
                                }} bg={chodamaMoveOpen === "deposit" ? C.green : C.orange} fg="#06120d" bd="none" />
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                            <Btn label="貯玉に入れる" onClick={() => { setChodamaMoveOpen("deposit"); setChodamaMoveBalls(""); setChodamaMoveMemo(""); }} bg={C.green} fg="#06120d" bd="none" />
                            <Btn label="貯玉から使う" onClick={() => { setChodamaMoveOpen("withdraw"); setChodamaMoveBalls(""); setChodamaMoveMemo(""); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        </div>
                    )}
                </Card>

                {/* ④ 交換率・貸玉情報 */}
                <Card style={cardSt}>
                    <div style={{ ...secTitle, marginBottom: 14 }}>交換率・貸玉情報</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                        <div style={tile}>
                            <div style={tileLabel}>貸玉単価</div>
                            <div style={{ ...tileBig, color: C.yellow }}>{yenPerBall ? (Number.isInteger(yenPerBall) ? yenPerBall : yenPerBall.toFixed(1)) : "—"}円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>交換率</div>
                            <div style={{ ...tileBig, color: C.teal }}>{faceEx}玉</div>
                            <div style={tileSub}>/100円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>玉単価</div>
                            <div style={{ ...tileBig, color: C.green }}>{exYenPerBall ? exYenPerBall.toFixed(2) : "—"}円</div>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <Btn label="この店舗の設定を反映" onClick={() => applyStore(st)} bg={C.blue} fg="#fff" bd="none" />
                        <Btn label="編集" small onClick={() => { setSelectedStore(null); openStoreForm(st); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                    </div>
                </Card>

                {/* ⑤ 店舗削除（危険操作・独立カード） */}
                <Card style={{ padding: 16, marginBottom: 12, border: `1px solid ${C.red}33`, borderRadius: 18, background: "rgba(180,60,60,0.06)" }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 800, letterSpacing: 0.8, marginBottom: 6 }}>危険な操作</div>
                    <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, marginBottom: 12 }}>この店舗の全データ（貯玉残高・会員カード・設定）を削除します。元に戻せません。</div>
                    {confirmingDeleteStore === st.id ? (
                        <div style={{ display: "flex", gap: 10 }}>
                            <Btn label="キャンセル" onClick={() => setConfirmingDeleteStore(null)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                            <Btn label="本当に削除する" onClick={() => deleteStore(st)} bg={C.red} fg="#fff" bd="none" />
                        </div>
                    ) : (
                        <Btn label="この店舗を削除する" onClick={() => setConfirmingDeleteStore(st.id)} bg="rgba(180,60,60,0.14)" fg={C.red} bd={`${C.red}40`} />
                    )}
                </Card>
            </div>
        );
    }

    // Store form view
    if (showStoreForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowStoreForm(false); setEditingStore(null); setStoreFormData(emptyStore); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                        {editingStore ? "店舗を編集" : "新規店舗登録"}
                    </div>
                    {editingStore && resolveRentBalls(editingStore.rentBalls).isAbnormal && <div role="alert" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: `${C.yellow}22`, color: C.text, fontSize: 11, lineHeight: 1.5 }}>
                        現在は仮補正表示です。更新すると250玉/Kへ訂正されます。
                    </div>}

                    {/* 店舗名 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>店舗名 *</div>
                        <input type="text" value={storeFormData.name} onChange={e => setStoreFormData({ ...storeFormData, name: e.target.value })}
                            placeholder="例: パチンコXX店"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 住所 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>住所</div>
                        <input type="text" value={storeFormData.address} onChange={e => setStoreFormData({ ...storeFormData, address: e.target.value })}
                            placeholder="例: 東京都渋谷区..."
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 閉店時刻は稼働計画の「閉店までの仕事量」に使用する。 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>閉店時刻</div>
                        <input
                            aria-label="店舗の閉店時刻"
                            type="time"
                            value={storeFormData.closingTime || ""}
                            onChange={e => setStoreFormData({ ...storeFormData, closingTime: e.target.value })}
                            style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none" }}
                        />
                        <div style={{ fontSize: 9, color: C.sub, marginTop: 5 }}>登録すると、稼働開始時に自動で入力されます。</div>
                    </div>

                    {/* 貸玉100円 */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>100円で借りる玉数（玉/100円）</div>
                        <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>4円貸しは25を入力（3.9ではありません）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input type="text" inputMode="decimal"
                                aria-label="店舗の貸玉100円あたりの玉数" aria-invalid={storeFormErrors.rentBalls ? "true" : undefined}
                                value={storeFormData.rentBalls}
                                onChange={e => setStoreNumberValue("rentBalls", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("rentBalls")}
                                placeholder="25"
                                style={{ flex: 1, minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.rentBalls ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / (parseFloat(storeFormData.rentBalls) || 25)).toFixed(2)}円/玉</span>
                        </div>
                        <StoreFieldError field="rentBalls" />
                        {/* プリセット（4円/2円/1円/0.5円 を含む複数交換率対応） */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {[{l:"4円等価",v:25},{l:"28玉",v:28},{l:"30玉",v:30},{l:"33玉",v:33},{l:"2円",v:50},{l:"1円",v:100},{l:"0.5円",v:200}].map(({l,v}) => {
                                const active = String(storeFormData.rentBalls) === String(v);
                                return <button key={v} className="b" onClick={() => { setStoreFormData(p => ({...p, rentBalls: v, exRate: v})); setStoreFormErrors(p => ({ ...p, rentBalls: "", exRate: "" })); }} style={{ fontSize: 10, padding: "5px 10px", minHeight: 44, borderRadius: 6, border: `1px solid ${active ? C.blue : C.borderHi}`, background: active ? `${C.blue}22` : C.surfaceHi, color: active ? C.blue : C.sub, fontFamily: font, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{l}</button>;
                            })}
                        </div>
                    </div>

                    {/* 交換100円 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>交換（玉/100円）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input type="text" inputMode="decimal"
                                aria-label="店舗の交換100円あたりの玉数" aria-invalid={storeFormErrors.exRate ? "true" : undefined}
                                value={storeFormData.exRate}
                                onChange={e => setStoreNumberValue("exRate", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("exRate")}
                                placeholder="25"
                                style={{ flex: 1, minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.exRate ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / (parseFloat(storeFormData.exRate) || 25)).toFixed(2)}円/玉</span>
                        </div>
                        <StoreFieldError field="exRate" />
                        {/* プリセット（貸玉レート別の代表的な交換率: 4円/2円/1円/0.5円） */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {(() => {
                                const rb = parseFloat(storeFormData.rentBalls) || 25;
                                let presets;
                                if (rb >= 180) presets = [{l:"等価",v:200}];
                                else if (rb >= 80) presets = [{l:"等価",v:100},{l:"0.9円",v:111}];
                                else if (rb >= 40) presets = [{l:"等価",v:50},{l:"1.8円",v:56}];
                                else presets = [{l:"等価",v:25},{l:"28玉",v:28},{l:"30玉",v:30},{l:"33玉",v:33}];
                                return presets.map(({l,v}) => {
                                    const active = String(storeFormData.exRate) === String(v);
                                    return <button key={v} className="b" onClick={() => { setStoreNumberValue("exRate", v); }} style={{ fontSize: 10, padding: "5px 10px", minHeight: 44, borderRadius: 6, border: `1px solid ${active ? C.blue : C.borderHi}`, background: active ? `${C.blue}22` : C.surfaceHi, color: active ? C.blue : C.sub, fontFamily: font, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{l}</button>;
                                });
                            })()}
                        </div>
                    </div>

                    {/* 貯玉残高・貯玉上限 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉残高（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の貯玉残高" aria-invalid={storeFormErrors.chodama ? "true" : undefined}
                                value={storeFormData.chodama === "" ? "" : String(storeFormData.chodama || 0)}
                                onChange={e => setStoreNumberValue("chodama", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("chodama")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.chodama ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="chodama" />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉上限（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の貯玉上限" aria-invalid={storeFormErrors.chodamaMax ? "true" : undefined}
                                value={storeFormData.chodamaMax === "" ? "" : String(storeFormData.chodamaMax || 0)}
                                onChange={e => setStoreNumberValue("chodamaMax", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("chodamaMax")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.chodamaMax ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="chodamaMax" />
                        </div>
                    </div>

                    {/* 店内再プレイ・本日精算予定 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>店内再プレイ（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の再プレイ玉数" aria-invalid={storeFormErrors.replayBalls ? "true" : undefined}
                                value={storeFormData.replayBalls === "" ? "" : String(storeFormData.replayBalls || 0)}
                                onChange={e => setStoreNumberValue("replayBalls", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("replayBalls")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.replayBalls ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="replayBalls" />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>本日精算予定（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の本日精算予定玉数" aria-invalid={storeFormErrors.todaySettle ? "true" : undefined}
                                value={storeFormData.todaySettle === "" ? "" : String(storeFormData.todaySettle || 0)}
                                onChange={e => setStoreNumberValue("todaySettle", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("todaySettle")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.todaySettle ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="todaySettle" />
                        </div>
                    </div>

                    {/* 最終来店 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>最終来店（任意）</div>
                        <input type="text" value={storeFormData.lastVisit || ""}
                            onChange={e => setStoreFormData({ ...storeFormData, lastVisit: e.target.value })}
                            placeholder="例: 2025/05/24 22:30"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 会員カード */}
                    <div style={{ marginBottom: 12, background: "rgba(0,0,0,0.12)", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: (storeFormData.memberCard?.created) ? 10 : 0 }}>
                            <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>会員カードを作成済み</span>
                            <button className="b" type="button" role="switch" aria-label="会員カードを作成済み" aria-checked={!!storeFormData.memberCard?.created}
                                onClick={() => setStoreFormData(p => ({ ...p, memberCard: { ...normalizeMemberCard(p.memberCard), created: !p.memberCard?.created } }))}
                                style={{
                                    width: 51, height: 44, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
                                    background: "transparent",
                                }}>
                                <span aria-hidden="true" style={{ position: "absolute", top: 6.5, left: 0, width: 51, height: 31, borderRadius: 999, background: storeFormData.memberCard?.created ? C.green : C.borderHi, transition: "background 0.2s" }}>
                                    <span style={{ position: "absolute", top: 2, left: storeFormData.memberCard?.created ? 22 : 2, width: 27, height: 27, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                                </span>
                            </button>
                        </div>
                        {storeFormData.memberCard?.created && (
                            <div>
                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>カード番号</div>
                                <input type="text" value={storeFormData.memberCard?.number || ""}
                                    onChange={e => setStoreFormData(p => ({ ...p, memberCard: { ...normalizeMemberCard(p.memberCard), number: e.target.value } }))}
                                    placeholder="1234 5678 9012 3456"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none" }} />
                                <div style={{ fontSize: 9, color: C.sub, marginTop: 6 }}>入金残高・貯玉残高は登録後、店舗詳細の「残高を更新」から管理できます。</div>
                            </div>
                        )}
                    </div>

                    {/* メモ */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>メモ</div>
                        <textarea value={storeFormData.memo} onChange={e => setStoreFormData({ ...storeFormData, memo: e.target.value })}
                            placeholder="営業時間など..."
                            rows={3}
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none", resize: "vertical" }} />
                    </div>

                    <Btn label={editingStore ? "更新" : "登録"} onClick={saveStore} bg={C.blue} fg="#fff" bd="none" disabled={!storeFormData.name.trim()} />
                </Card>
            </div>
        );
    }

    // Store search view
    if (showStoreSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={() => { setShowStoreSearch(false); setStoreQuery(""); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600
                    }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openStoreForm()} style={{
                        background: C.blue, border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 700
                    }}>+ 店舗を登録</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <input
                        type="text"
                        value={storeQuery}
                        onChange={e => setStoreQuery(e.target.value)}
                        placeholder="店舗名・住所で検索..."
                        style={{
                            width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.text, fontFamily: font,
                            outline: "none",
                        }}
                    />
                </div>

                {/* CSV インポート/エクスポート */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={exportStoresCSV} style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600
                    }}>CSVエクスポート</button>
                    <label style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600,
                        textAlign: "center", cursor: "pointer"
                    }}>
                        CSVインポート
                        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={importStoresCSV} style={{ display: "none" }} />
                    </label>
                </div>

                {storeResults.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>登録された店舗がありません</div>
                ) : (
                    storeResults.map((st, i) => (
                        <div key={st.id || i} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <button className="b" onClick={() => setSelectedStore(st)} style={{
                                width: "100%", background: "transparent",
                                border: "none", padding: "14px 16px",
                                display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                                textAlign: "left",
                            }}>
                                <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{st.name}</span>
                                        {st.memberCard?.created && <span style={{ fontSize: 9, fontWeight: 800, color: C.green, background: `${C.green}22`, border: `1px solid ${C.green}55`, borderRadius: 6, padding: "1px 6px" }}>会員</span>}
                                    </div>
                                    {st.address && <div style={{ fontSize: 10, color: C.sub }}>{st.address}</div>}
                                    {st.rateResearch && (
                                        <div style={{ fontSize: 9, color: C.subHi, marginTop: 5, lineHeight: 1.45 }}>
                                            {formatPachinkoRateResearchSummary(st.pachinkoRates)}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: st.rateResearch?.status === STORE_RATE_STATUS.VERIFIED ? C.green : C.yellow }}>
                                        {st.rateResearch ? storeRateStatusLabel(st.rateResearch.status) : "確認記録なし"}
                                    </div>
                                    <div style={{ fontSize: 9, color: C.sub, marginTop: 3 }}>
                                        {st.rateResearch ? formatResearchDate(st.rateResearch.checkedAt) : `設定 ${Math.round(st.exRate || 250) / 10}玉`}
                                        {(st.chodama || 0) > 0 ? ` 💎${f(st.chodama)}` : ""}
                                    </div>
                                </div>
                            </button>
                            {/* 店舗詳細への導線。店舗設定・貯玉・保存済み実戦を st.id で店舗別に集計する。 */}
                            {onOpenStoreDetail && (
                                <button className="b" onClick={() => onOpenStoreDetail(st)} style={{
                                    width: "100%", background: "transparent", border: "none",
                                    padding: "0 16px 12px", display: "flex", alignItems: "center", gap: 4,
                                    cursor: "pointer", textAlign: "left", minHeight: 32,
                                    fontSize: 11, fontWeight: 700, color: C.blue, fontFamily: font,
                                }}>
                                    店舗詳細を見る ›
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        );
    }

    // Machine detail view
    if (selected) {
        return (
            <MachineSpecWorkspace
                machineData={selected}
                onBack={() => setSelected(null)}
                primaryActionLabel="この機種の確率を設定に反映"
                onPrimaryAction={() => applyMachine(selected)}
                onPersist={persistMachineOverride}
            />
        );
    }

    // Legacy machine detail view
    if (selected) {
        const borderKeys = selected.border ? Object.keys(selected.border).filter(k => selected.border[k] > 0).sort((a, b) => Number(b) - Number(a)) : [];
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setSelected(null)} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 一覧に戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selected.name}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>{selected.maker} | {selected.type}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>大当たり確率</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.yellow, fontFamily: mono }}>{selected.prob}</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{f(selected.spec1R)}</div>
                        </div>
                    </div>

                    {selected.chargeProb && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>チャージ確率</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: C.purple, fontFamily: mono }}>1/{selected.chargeProb}</div>
                            </div>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>合算確率</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: mono }}>1/{selected.synthProb}</div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>平均総R/初当たり</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: mono }}>{selected.specAvgTotalRounds}R</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>ラウンド振り分け（初当たり）</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.subHi, lineHeight: 1.5 }}>{selected.roundDist || "未設定"}</div>
                        </div>
                    </div>

                    {/* 確変中ラウンド振り分け */}
                    {selected.rushDist && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 12 }}>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>確変中ラウンド振り分け（連チャン用）</div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: C.orange, lineHeight: 1.5 }}>{selected.rushDist}</div>
                            </div>
                        </div>
                    )}

                    {/* 追加スペック情報（データがある場合のみ表示） */}
                    {(selected.avgPayoutPerHit || selected.rushEntryRate || selected.prize) && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                                {selected.avgPayoutPerHit > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>平均出玉/当</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono }}>{f(selected.avgPayoutPerHit)}</div>
                                    </div>
                                )}
                                {selected.prize > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>賞球数</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{selected.prize}</div>
                                    </div>
                                )}
                                {selected.unitCost > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>回転単価</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{selected.unitCost}</div>
                                    </div>
                                )}
                            </div>
                            {(selected.rushEntryRate || selected.rushContinueRate) && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                    {selected.rushEntryRate > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH突入率</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.orange, fontFamily: mono }}>{selected.rushEntryRate}%</div>
                                        </div>
                                    )}
                                    {selected.rushContinueRate > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH継続率</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.orange, fontFamily: mono }}>{selected.rushContinueRate}%</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {(selected.rushAvgPayout || selected.stdDev) && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    {selected.rushAvgPayout > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH平均出玉</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono }}>{f(selected.rushAvgPayout)}</div>
                                        </div>
                                    )}
                                    {selected.stdDev > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>標準偏差</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{f(selected.stdDev)}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* ボーダー表（データがある場合のみ） */}
                {borderKeys.length > 0 && (
                    <Card style={{ overflow: "hidden", marginBottom: 12 }}>
                        <SecLabel label="交換率別ボーダー" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "10px 16px 6px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>交換率</span>
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 700, textAlign: "right" }}>ボーダー (回/K)</span>
                        </div>
                        {borderKeys.map(key => (
                            <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: 13, color: C.text }}>{key}円</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono, textAlign: "right" }}>{selected.border[key]}</span>
                            </div>
                        ))}
                    </Card>
                )}

                <Btn label="この機種の確率を設定に反映" onClick={() => applyMachine(selected)} bg={C.blue} fg="#fff" bd="none" />

                {/* カスタム機種の場合は編集・削除ボタンを表示 */}
                {selected.isCustom && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <Btn label="編集" onClick={() => { setSelected(null); openMachineForm(selected); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        {confirmingDeleteMachine === selected.id ? (
                            <>
                                <Btn label="本当に削除" onClick={() => deleteMachine(selected)} bg={C.red} fg="#fff" bd="none" />
                                <Btn label="キャンセル" onClick={() => setConfirmingDeleteMachine(null)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                            </>
                        ) : (
                            <Btn label="削除" onClick={() => setConfirmingDeleteMachine(selected.id)} bg="rgba(180,60,60,0.2)" fg={C.red} bd={C.red + "40"} />
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (showEvidenceMachineUi) {
        return <MachineSpecWorkspace onBack={() => setShowEvidenceMachineUi(false)} />;
    }

    // Machine form view (新規登録/編集)
    if (showMachineForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowMachineForm(false); setEditingMachine(null); setFormData(emptyMachine); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                        {editingMachine ? "機種を編集" : "新規機種登録"}
                    </div>

                    {/* 機種名 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>機種名 *</div>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="例: 大海物語5"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* メーカー */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>メーカー</div>
                        <input type="text" value={formData.maker} onChange={e => setFormData({ ...formData, maker: e.target.value })}
                            placeholder="例: 三洋"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* タイプ */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>タイプ</div>
                        <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }}>
                            <option value="ミドル">ミドル</option>
                            <option value="ハイミドル">ハイミドル</option>
                            <option value="ライトミドル">ライトミドル</option>
                            <option value="甘デジ">甘デジ</option>
                            <option value="遊パチ">遊パチ</option>
                        </select>
                    </div>

                    {/* 確率表記 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>大当たり確率（表記用）</div>
                        <input type="text" value={formData.prob} onChange={e => setFormData({ ...formData, prob: e.target.value })}
                            placeholder="例: 1/319.6"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 確率分母 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>合成確率分母</div>
                        <input type="text" inputMode="decimal" value={formData.synthProb} onChange={e => setFormData({ ...formData, synthProb: e.target.value })}
                            placeholder="319.6"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 1R出玉 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                        <input type="text" inputMode="numeric" pattern="[0-9]*" value={formData.spec1R} onChange={e => setFormData({ ...formData, spec1R: e.target.value })}
                            placeholder="140"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 平均総R */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>平均総R/初当たり</div>
                        <input type="text" inputMode="decimal" value={formData.specAvgTotalRounds} onChange={e => setFormData({ ...formData, specAvgTotalRounds: e.target.value })}
                            placeholder="30"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* サポ増減 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>サポ増減/初当たり</div>
                        <input type="text" inputMode="numeric" pattern="[0-9-]*" value={formData.specSapo} onChange={e => setFormData({ ...formData, specSapo: e.target.value })}
                            placeholder="0"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* ラウンド振り分け */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>ラウンド振り分け（初当たり）</div>
                        <input type="text" value={formData.roundDist} onChange={e => setFormData({ ...formData, roundDist: e.target.value })}
                            placeholder="例: 4R:50%, 10R:50%"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 確変中ラウンド振り分け */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>確変中ラウンド振り分け（連チャン用）</div>
                        <input type="text" value={formData.rushDist || ""} onChange={e => setFormData({ ...formData, rushDist: e.target.value })}
                            placeholder="例: 10R:100%（未設定時は初当たり振り分けを使用）"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    <Btn label={editingMachine ? "更新" : "登録"} onClick={saveMachine} bg={C.blue} fg="#fff" bd="none" disabled={!formData.name.trim()} />
                </Card>
            </div>
        );
    }

    // Machine search view
    if (showMachineSearch) {
        const settingsTypeColors = {
            "スマパチ": "#f7971e",
            "ハイミドル": "#ef473a",
            "ミドル": "#2f6fed",
            "ライトミドル": "#20e3b2",
            "甘デジ": "#16a34a",
        };
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* ヘッダー + 上部検索 */}
                <div style={{ padding: "12px 14px 10px", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                        <button className="b" onClick={() => {
                            setShowMachineSearch(false);
                            setQuery("");
                            setMachineFilter("all");
                            setMachineMakerFilter("all");
                            setMachineProbabilityFilter("all");
                            setMachineSort("default");
                            setShowMachineDetails(false);
                            setConfirmingDeleteMachine(null);
                        }} style={{
                            background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 9,
                            color: C.text, fontSize: 12, padding: "8px 13px", minHeight: 40, fontFamily: font, fontWeight: 700
                        }}>← 設定に戻る</button>
                        <span style={{ color: C.sub, fontSize: 11, fontWeight: 700 }}>{results.length}機種</span>
                    </div>
                    <div style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 850, color: C.text, marginBottom: 10 }}>機種を探す</div>
                    <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.sub, display: "flex" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="機種名・メーカーで検索"
                            style={{
                                width: "100%", minHeight: 44, boxSizing: "border-box",
                                background: "var(--surface-hi)", border: `1px solid ${C.border}`,
                                borderRadius: 12, padding: "11px 38px 11px 39px",
                                fontSize: 13, color: C.text, fontFamily: font, outline: "none",
                            }}
                        />
                        {query && (
                            <button className="b" aria-label="検索文字を消す" onClick={() => setQuery("")} style={{
                                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                                width: 32, height: 32, border: "none", borderRadius: 999,
                                background: "transparent", color: C.sub, fontSize: 17, cursor: "pointer",
                            }}>×</button>
                        )}
                    </div>
                </div>

                {/* タイプ絞り込み */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", padding: "0 14px 9px", scrollbarWidth: "none", flexShrink: 0 }}>
                    <span style={{ width: 48, flex: "0 0 48px", color: C.sub, fontSize: 10, fontWeight: 800 }}>タイプ</span>
                    {[
                        { id: "all", label: "全て" },
                        { id: "スマパチ", label: "スマパチ" },
                        { id: "ハイミドル", label: "ハイミドル" },
                        { id: "ミドル", label: "ミドル" },
                        { id: "ライトミドル", label: "ライト" },
                        { id: "甘デジ", label: "甘デジ" },
                    ].map(chip => {
                        const active = machineFilter === chip.id;
                        return (
                            <button key={chip.id} className="b" onClick={() => setMachineFilter(chip.id)} style={{
                                flexShrink: 0, minHeight: 32, background: active ? C.blue : "var(--surface-hi)",
                                color: active ? "#fff" : C.text, border: "none", borderRadius: 999,
                                padding: "6px 12px", fontSize: 11, fontWeight: 700, fontFamily: font,
                                cursor: "pointer", whiteSpace: "nowrap",
                            }}>{chip.label}</button>
                        );
                    })}
                </div>

                {/* メーカー快捷チップ */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", padding: "0 14px 10px", scrollbarWidth: "none", flexShrink: 0 }}>
                    <span style={{ width: 48, flex: "0 0 48px", color: C.sub, fontSize: 10, fontWeight: 800 }}>メーカー</span>
                    <button className="b" onClick={() => setMachineMakerFilter("all")} style={{
                        flexShrink: 0, minHeight: 32, borderRadius: 999, padding: "6px 11px",
                        background: machineMakerFilter === "all" ? "rgba(31,182,255,0.18)" : "var(--surface-hi)",
                        border: `1px solid ${machineMakerFilter === "all" ? C.blue : C.borderHi}`,
                        color: machineMakerFilter === "all" ? C.blue : C.text,
                        fontSize: 11, fontWeight: 700, fontFamily: font, cursor: "pointer",
                    }}>全て</button>
                    {visibleQuickMakerOptions.map((option) => {
                        const active = machineMakerFilter === option.id;
                        return (
                            <button key={option.id} className="b" onClick={() => setMachineMakerFilter(option.id)} style={{
                                flexShrink: 0, minHeight: 32, borderRadius: 999, padding: "6px 11px",
                                background: active ? "rgba(31,182,255,0.18)" : "var(--surface-hi)",
                                border: `1px solid ${active ? C.blue : C.borderHi}`,
                                color: active ? C.blue : C.text,
                                fontSize: 11, fontWeight: 700, fontFamily: font, cursor: "pointer", whiteSpace: "nowrap",
                            }}>{option.label}</button>
                        );
                    })}
                </div>

                {/* 並び替え + 詳細条件 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px", flexShrink: 0 }}>
                    <select id="settings-machine-sort" aria-label="並び替え" value={machineSort} onChange={(event) => setMachineSort(event.target.value)} style={{
                        flex: 1, minWidth: 0, minHeight: 38, boxSizing: "border-box",
                        background: "var(--surface-hi)", border: `1px solid ${C.borderHi}`,
                        borderRadius: 10, padding: "8px 32px 8px 11px",
                        color: C.text, fontSize: 11, fontWeight: 700, fontFamily: font, outline: "none", cursor: "pointer",
                    }}>
                        {MACHINE_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{`並び替え：${option.label}`}</option>
                        ))}
                    </select>
                    <button className="b" aria-expanded={showMachineDetails} onClick={() => setShowMachineDetails((open) => !open)} style={{
                        minHeight: 38, flexShrink: 0, borderRadius: 10, padding: "7px 10px",
                        background: showMachineDetails ? "rgba(31,182,255,0.14)" : "var(--surface-hi)",
                        border: `1px solid ${showMachineDetails ? C.blue : C.borderHi}`,
                        color: showMachineDetails ? C.blue : C.text, fontSize: 11, fontWeight: 750,
                        fontFamily: font, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    }}>
                        詳細条件
                        {activeMachineFilterCount > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: C.blue, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{activeMachineFilterCount}</span>}
                        <span style={{ color: C.sub }}>{showMachineDetails ? "⌃" : "⌄"}</span>
                    </button>
                </div>

                {/* 詳細条件パネル */}
                {showMachineDetails && (
                    <div style={{ margin: "0 14px 10px", padding: 12, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 12, flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                            <span style={{ color: C.text, fontSize: 11, fontWeight: 800 }}>大当り確率</span>
                            <button className="b" onClick={() => { setMachineMakerFilter("all"); setMachineProbabilityFilter("all"); }} style={{ background: "transparent", border: "none", color: C.blue, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>条件をリセット</button>
                        </div>
                        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "none" }}>
                            {MACHINE_PROBABILITY_FILTER_OPTIONS.map((option) => {
                                const active = machineProbabilityFilter === option.value;
                                return (
                                    <button key={option.value} className="b" onClick={() => setMachineProbabilityFilter(option.value)} style={{
                                        flexShrink: 0, minHeight: 32, borderRadius: 9, padding: "6px 10px",
                                        background: active ? "rgba(31,182,255,0.16)" : "var(--surface-hi)",
                                        border: `1px solid ${active ? C.blue : C.borderHi}`,
                                        color: active ? C.blue : C.text, fontSize: 10, fontWeight: 700, cursor: "pointer",
                                    }}>{option.label}</button>
                                );
                            })}
                        </div>
                        <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>すべてのメーカー</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 92, overflowY: "auto" }}>
                            {makerOptions.map((option) => {
                                const active = machineMakerFilter === option.id;
                                return (
                                    <button key={option.id} className="b" onClick={() => setMachineMakerFilter(option.id)} style={{
                                        minHeight: 30, borderRadius: 8, padding: "5px 9px",
                                        background: active ? "rgba(31,182,255,0.16)" : "var(--surface-hi)",
                                        border: `1px solid ${active ? C.blue : C.border}`,
                                        color: active ? C.blue : C.text, fontSize: 10, fontWeight: 700, cursor: "pointer",
                                    }}>{option.label} <span style={{ color: C.sub }}>{option.count}</span></button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 機種リスト (コンパクト表示) */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
                    {results.length === 0 ? (
                        <div style={{ textAlign: "center", color: C.sub, padding: "36px 16px", fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>該当する機種がありません</div>
                            条件を減らすか、検索文字を変更してください
                        </div>
                    ) : (
                        results.map((m, i) => {
                            const typeColorKey = ["スマパチ", "ハイミドル", "ライトミドル", "甘デジ", "ミドル"]
                                .find((type) => String(m.type || "").includes(type));
                            const iconColor = settingsTypeColors[typeColorKey] || C.sub;
                            const iconLabel = (m.type || "").slice(0, 2);
                            const probText = m.prob || (m.synthProb ? `1/${m.synthProb}` : "—");
                            return (
                                <div key={m.isCustom ? `custom-${m.id}` : `db-${i}`} style={{
                                    borderBottom: `1px solid ${C.border}`, overflow: "hidden",
                                }}>
                                    {/* カード本体（タップで詳細・適用へ） */}
                                    <button className="b" onClick={() => { setConfirmingDeleteMachine(null); setSelected(m); }} style={{
                                        width: "100%", background: "transparent",
                                        border: "none", padding: "8px 5px",
                                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left",
                                        fontFamily: font, minHeight: 68,
                                    }}>
                                        <div style={{
                                            width: 36, height: 36, flexShrink: 0, borderRadius: 9,
                                            background: iconColor,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "#fff", fontSize: 10, fontWeight: 800, fontFamily: font,
                                        }}>{iconLabel}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>
                                                {m.name}
                                            </div>
                                            <div style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {m.maker || "メーカー未設定"}{m.type ? ` ・ ${m.type}` : ""}
                                                {m.isCustom ? ` ・ ${m.isOverride ? "編集済み" : "カスタム"}` : ""}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: C.yellow, fontFamily: mono, whiteSpace: "nowrap" }}>{probText}</span>
                                        <span style={{ fontSize: 15, color: C.sub, flexShrink: 0, fontWeight: 500 }}>›</span>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    }

    // ── 細線 SVG アイコン群（SF Symbols 風） ──
    const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
    const IconPaint = () => (<svg {...svgProps}><circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/><path d="M12 22a10 10 0 1 1 10-10c0 2-2 3-4 3h-2a2 2 0 0 0-1 3.7 2 2 0 0 1-3 3.3z"/></svg>);
    const IconGear = () => (<svg {...svgProps}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
    const IconTarget = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>);
    const IconDiamond = () => (<svg {...svgProps}><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9h8l-3-6"/><path d="M2 9h20"/></svg>);
    const IconMagnifier = () => (<svg {...svgProps}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    const IconStore = () => (<svg {...svgProps}><path d="M3 9 4.5 4h15L21 9"/><path d="M3 9v11h18V9"/><path d="M3 9c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3"/><path d="M9 20v-6h6v6"/></svg>);
    const IconGrid = () => (<svg {...svgProps}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
    const IconLock = () => (<svg {...svgProps}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>);
    const IconKey = () => (<svg {...svgProps}><circle cx="7.5" cy="15.5" r="3.5"/><path d="m10 13 10-10"/><path d="m17 6 3 3"/><path d="m14 9 3 3"/></svg>);
    const IconCloud = () => (<svg {...svgProps}><path d="M17.5 19a4.5 4.5 0 1 0-1.2-8.84A6 6 0 0 0 5.1 13.5 4 4 0 0 0 6 19z"/><path d="M12 12v6"/><path d="m9 15 3-3 3 3"/></svg>);
    const IconTrash = () => (<svg {...svgProps}><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>);
    const IconChat = () => (<svg {...svgProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
    const IconStar = () => (<svg {...svgProps}><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8l-6.2 3.2L7 14.2 2 9.3l6.9-1z"/></svg>);
    const IconDoc = () => (<svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>);
    const IconShield = () => (<svg {...svgProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
    const IconContrast = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><path d="M12 3v18" fill="currentColor"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>);
    const IconEye = () => (<svg {...svgProps}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>);
    const IconVibrate = () => (<svg {...svgProps}><rect x="8" y="5" width="8" height="14" rx="1.5"/><path d="M2 10v4"/><path d="M22 10v4"/></svg>);
    const IconExchange = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><path d="M9 8h4.5a2.5 2.5 0 0 1 0 5H9"/><path d="M9 13h4.5a2.5 2.5 0 0 1 0 5H9"/><path d="M11 6v12"/><path d="M14 6v12"/></svg>);
    const IconTrending = () => (<svg {...svgProps}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>);
    const IconCoin = () => (<svg {...svgProps}><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>);
    const IconCalculator = () => (<svg {...svgProps}><rect x="4" y="3" width="16" height="18" rx="2.5"/><rect x="7" y="6" width="10" height="3" rx="0.5"/><circle cx="8.5" cy="13" r="0.6" fill="currentColor"/><circle cx="12" cy="13" r="0.6" fill="currentColor"/><circle cx="15.5" cy="13" r="0.6" fill="currentColor"/><circle cx="8.5" cy="17" r="0.6" fill="currentColor"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/><circle cx="15.5" cy="17" r="0.6" fill="currentColor"/></svg>);
    const IconChartBars = () => (<svg {...svgProps}><path d="M4 19V11"/><path d="M10 19V5"/><path d="M16 19v-9"/><path d="M22 19v-5"/></svg>);
    const IconBell = () => (<svg {...svgProps}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>);
    const IconCsv = () => (<svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 14h1.5a1 1 0 1 1 0 2H8v2"/><path d="M16 14a1 1 0 0 0-1 1c0 1 2 1 2 2a1 1 0 0 1-1 1"/><path d="M11 14l1 4 1-4"/></svg>);
    const IconFaceId = () => (<svg {...svgProps}><path d="M5 8V6a1 1 0 0 1 1-1h2"/><path d="M19 8V6a1 1 0 0 0-1-1h-2"/><path d="M5 16v2a1 1 0 0 0 1 1h2"/><path d="M19 16v2a1 1 0 0 1-1 1h-2"/><circle cx="9.5" cy="11" r="0.6" fill="currentColor"/><circle cx="14.5" cy="11" r="0.6" fill="currentColor"/><path d="M12 10v3.5"/><path d="M10 16c0.6 0.7 1.3 1 2 1s1.4-0.3 2-1"/></svg>);
    const IconFingerprint = () => (<svg {...svgProps}><path d="M12 11v3.5a2.5 2.5 0 0 0 5 0"/><path d="M9 8a4 4 0 0 1 7 2.7v3.3"/><path d="M6 13c0-4 2.7-7 6.5-7s6.5 3 6.5 7v2"/><path d="M7 17c-.4-.7-.7-1.6-.8-2.5"/><path d="M14 18c-1.5.7-3 1-4.5 1"/></svg>);

    // ── サブ画面共通ヘッダー ──
    const SubHeader = ({ title, onBack }) => (
        <div style={{
            background: "var(--settings-card)",
            padding: "14px 12px 16px",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            borderBottom: "1px solid var(--settings-line)",
        }}>
            <button className="b" onClick={onBack} aria-label={`${title}から設定トップへ戻る`} style={{
                background: "transparent", border: "none",
                color: "var(--settings-accent)", fontSize: 26, width: 44, height: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, fontWeight: 400, lineHeight: 1,
            }}>‹</button>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: -0.4 }}>{title}</div>
        </div>
    );

    // ── 共通UIヘルパー ──
    const Toggle = ({ value, onChange, color, label }) => (
        <button className="b" type="button" role="switch" aria-checked={!!value} aria-label={label} onClick={() => onChange(!value)} style={{
            width: 51, height: 44, borderRadius: 22, border: "none", flexShrink: 0,
            background: "transparent", position: "relative", cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
        }}>
            <span aria-hidden="true" style={{
                width: 51, height: 31, borderRadius: 16,
                background: value ? (color || "var(--settings-accent)") : "var(--settings-line)",
                position: "absolute", left: 0, top: 6.5, transition: "background 0.25s ease",
            }}>
                <span style={{
                    width: 27, height: 27, borderRadius: 14, background: "#fff",
                    position: "absolute", top: 2,
                    left: value ? 22 : 2, transition: "left 0.25s ease",
                    boxShadow: "0 1px 1px rgba(0,0,0,0.04), 0 3px 8px rgba(0,0,0,0.12)",
                }} />
            </span>
        </button>
    );

    const ComingSoonBadge = () => (
        <span style={{
            borderRadius: 999, padding: "4px 9px", flexShrink: 0,
            background: "var(--settings-badge)",
            color: "var(--settings-badge-text)", fontSize: 10.5, fontWeight: 700,
        }}>準備中</span>
    );

    // 汎用リスト行（onPressなしはdivでレンダリング → Toggle等の子要素がiOSでも押せる）
    const Row = ({ icon, IconComp, label, sub, right, onPress, danger }) => {
        const Tag = onPress ? "button" : "div";
        const clr = danger ? C.red : "var(--settings-icon-color)";
        return (
            <Tag className="b settings-row settings-list-row" onClick={onPress || undefined} style={{
                width: "100%", background: "transparent", border: "none",
                borderBottom: "1px solid var(--settings-line)", padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
                cursor: onPress ? "pointer" : "default", textAlign: "left",
                WebkitTapHighlightColor: "transparent",
            }}>
                {(IconComp || icon) && (
                    <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: danger ? "rgba(255,59,48,0.12)" : "var(--settings-icon-bg)",
                        border: danger ? "none" : "1px solid var(--settings-icon-line)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, color: clr,
                    }}>{IconComp ? <IconComp /> : icon}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: danger ? C.red : C.text, fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
                    {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
                </div>
                {right !== undefined ? right : (onPress ? <span style={{ fontSize: 15, color: C.sub, flexShrink: 0, fontWeight: 500 }}>›</span> : null)}
            </Tag>
        );
    };

    // セクションラベル
    const SectionLabel = ({ label }) => (
        <div style={{
            padding: "24px 16px 8px",
            fontSize: 13, fontWeight: 500, color: "var(--sub)",
            letterSpacing: 0, textTransform: "none",
        }}>{label}</div>
    );

    // セクションカード（角丸まとめ）— last-childのborderBottomはCSS側で除去
    const Section = ({ children, danger }) => (
        <div style={{
            background: danger ? "color-mix(in srgb, var(--red) 4%, transparent)" : "var(--settings-card)",
            borderRadius: "var(--settings-radius)",
            border: `1px solid ${danger ? "color-mix(in srgb, var(--red) 18%, transparent)" : "var(--settings-line)"}`,
            overflow: "hidden",
        }}>{children}</div>
    );

    // ── 外観サブビュー ──
    if (showAppearanceView) {
        const atmospheres = [
            {
                id: "deep-night",
                name: "DEEP NIGHT",
                description: "夜のホールでも眩しさを抑える",
                theme: "dark",
                accent: "purple",
                background: "linear-gradient(135deg, #302858, #16182c 68%)",
                text: "#f7f7ff",
                sampleLabel: "本日の期待値",
                sampleValue: "+12,800円",
                sampleSideLabel: "判断",
                sampleSideValue: "続 行",
            },
            {
                id: "focus-green",
                name: "FOCUS GREEN",
                description: "判断と数値の差を見分けやすく",
                theme: "dark",
                accent: "green",
                background: "linear-gradient(135deg, #0c544c, #102a2f 70%)",
                text: "#f1fffb",
                sampleLabel: "回転率",
                sampleValue: "19.8 /K",
                sampleSideLabel: "差",
                sampleSideValue: "+2.1",
            },
            {
                id: "daylight",
                name: "DAYLIGHT",
                description: "昼間・屋外でも読みやすい明るさ",
                theme: "light",
                accent: "teal",
                background: "linear-gradient(135deg, #f6f1e8, #dce9ff)",
                text: "#172033",
                sampleLabel: "今月の収支",
                sampleValue: "+48,500円",
                sampleSideLabel: "勝率",
                sampleSideValue: "66%",
            },
        ];
        const selectedAtmosphere = atmospheres.find(
            (item) => s.theme === item.theme && s.accentColor === item.accent,
        );
        const applyAtmosphere = (item) => {
            s.setTheme(item.theme);
            s.setAccentColor(item.accent);
        };
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="テーマ" onBack={() => setShowAppearanceView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <div style={{ padding: "18px 2px 2px" }}>
                        <div style={{ color: C.blue, fontSize: 10, fontWeight: 900, letterSpacing: ".15em" }}>SELECT YOUR ATMOSPHERE</div>
                        <h2 style={{ margin: "7px 0 5px", color: C.text, fontSize: 24, lineHeight: 1.25, letterSpacing: "-.04em" }}>
                            色ではなく、<br />使う場面で選ぶ。
                        </h2>
                        <p style={{ margin: 0, color: C.sub, fontSize: 11, lineHeight: 1.65 }}>
                            画面全体の明るさと強調色を、使いやすい3つの世界観にまとめました。
                        </p>
                    </div>

                    <div role="group" aria-label="テーマの連動方法" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "16px 0" }}>
                        <button type="button" className="b" aria-pressed={s.theme === "system"} onClick={() => s.setTheme("system")} style={{
                            minHeight: 44, borderRadius: 12, padding: "10px 8px",
                            border: s.theme === "system" ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                            background: s.theme === "system" ? "color-mix(in srgb, var(--blue) 18%, var(--surface))" : C.surface,
                            color: s.theme === "system" ? C.blue : C.subHi,
                            fontSize: 12, fontWeight: 800,
                        }}>端末に合わせる</button>
                        <button type="button" className="b" aria-pressed={s.theme !== "system"} onClick={() => applyAtmosphere(selectedAtmosphere || atmospheres[0])} style={{
                            minHeight: 44, borderRadius: 12, padding: "10px 8px",
                            border: s.theme !== "system" ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                            background: s.theme !== "system" ? "color-mix(in srgb, var(--blue) 18%, var(--surface))" : C.surface,
                            color: s.theme !== "system" ? C.blue : C.subHi,
                            fontSize: 12, fontWeight: 800,
                        }}>固定する</button>
                    </div>

                    <div role="radiogroup" aria-label="テーマの世界観" style={{ display: "grid", gap: 10 }}>
                        {atmospheres.map((item) => {
                            const active = selectedAtmosphere?.id === item.id && s.theme !== "system";
                            return (
                                <button key={item.id} type="button" className="b" role="radio" aria-checked={active}
                                    aria-label={`${item.name}。${item.description}`} onClick={() => applyAtmosphere(item)} style={{
                                        width: "100%", minHeight: 136, position: "relative", overflow: "hidden",
                                        padding: 15, borderRadius: 22, textAlign: "left", color: item.text,
                                        background: item.background,
                                        border: active ? "2px solid #ffffff" : "1px solid rgba(255,255,255,.12)",
                                        boxShadow: active ? `0 0 0 2px ${C.blue}, inset 0 1px 0 rgba(255,255,255,.14)` : "inset 0 1px 0 rgba(255,255,255,.1)",
                                    }}>
                                    <span aria-hidden="true" style={{
                                        position: "absolute", width: 150, height: 150, right: -45, top: -60,
                                        borderRadius: "50%", background: "rgba(255,255,255,.12)",
                                    }} />
                                    <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span>
                                            <strong style={{ display: "block", fontSize: 16, letterSpacing: ".01em" }}>{item.name}</strong>
                                            <span style={{ display: "block", marginTop: 2, fontSize: 10, opacity: .72 }}>{item.description}</span>
                                        </span>
                                        <span aria-hidden="true" style={{
                                            width: 28, height: 28, borderRadius: "50%", flex: "0 0 auto",
                                            display: "grid", placeItems: "center", fontSize: 13,
                                            border: "1px solid rgba(255,255,255,.4)",
                                            background: active ? "#fff" : "transparent",
                                            color: active ? "#191532" : item.text,
                                        }}>{active ? "✓" : ""}</span>
                                    </span>
                                    <span aria-label="表示見本" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 7, marginTop: 13 }}>
                                        {[
                                            [item.sampleLabel, item.sampleValue],
                                            [item.sampleSideLabel, item.sampleSideValue],
                                        ].map(([label, value]) => (
                                            <span key={label} style={{
                                                minHeight: 40, borderRadius: 10, padding: 8,
                                                background: item.theme === "light" ? "rgba(255,255,255,.54)" : "rgba(10,12,20,.34)",
                                                border: item.theme === "light" ? "1px solid rgba(20,40,80,.1)" : "1px solid rgba(255,255,255,.12)",
                                            }}>
                                                <small style={{ display: "block", fontSize: 8, opacity: .65 }}>{label}</small>
                                                <strong style={{ display: "block", marginTop: 2, fontSize: 12 }}>{value}</strong>
                                            </span>
                                        ))}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {s.theme === "system" && (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, color: C.sub, background: C.surface, border: `1px solid ${C.border}`, fontSize: 10, lineHeight: 1.6 }}>
                            端末に合わせる間は、端末のライト・ダーク設定へ自動で追従します。世界観を選ぶと固定表示へ切り替わります。
                        </div>
                    )}

                    <SectionLabel label="アクセシビリティ" />
                    <Section>
                        <Row IconComp={IconContrast} iconColor={C.subHi} label="ハイコントラストモード" sub="視認性を向上させます"
                            right={<Toggle label="ハイコントラストモード" value={s.highContrast} onChange={s.setHighContrast} />} />
                        <Row IconComp={IconEye} iconColor={C.subHi} label="色覚サポート" sub="色の識別をサポート"
                            right={<Toggle label="色覚サポート" value={s.colorBlind} onChange={s.setColorBlind} />} />
                        <Row IconComp={IconVibrate} iconColor={C.subHi} label="タップ振動フィードバック" sub="ボタン操作時に振動（対応端末のみ）"
                            right={<Toggle label="タップ振動フィードバック" value={s.hapticFeedback} onChange={s.setHapticFeedback} />} />
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 通知設定サブビュー ──
    if (showNotificationView) {
        const prefs = s.notificationPrefs || {};
        const setPref = (key, value) => s.setNotificationPrefs((prev) => ({ ...(prev || {}), [key]: value }));
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <SubHeader title="通知設定" onBack={() => setShowNotificationView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="アプリ内通知" />
                    <Section>
                        <Row IconComp={IconBell} iconColor={C.purple} label="レベルアップ" sub="ハンターランクが上がったとき"
                            right={<Toggle label="レベルアップ通知" value={prefs.levelUp !== false} onChange={(v) => setPref("levelUp", v)} />} />
                        <Row IconComp={IconBell} iconColor={C.green} label="連続記録" sub="連続稼働ボーナスを獲得したとき"
                            right={<Toggle label="連続記録通知" value={prefs.streak !== false} onChange={(v) => setPref("streak", v)} />} />
                        <Row IconComp={IconBell} iconColor={C.orange} label="バッジ獲得" sub="新しい実績バッジを獲得したとき"
                            right={<Toggle label="バッジ獲得通知" value={prefs.badge !== false} onChange={(v) => setPref("badge", v)} />} />
                        <Row IconComp={IconBell} iconColor={C.blue} label="判断変化" sub="続行・様子見・ヤメの判断が変わったとき"
                            right={<Toggle label="判断変化通知" value={prefs.verdict !== false} onChange={(v) => setPref("verdict", v)} />} />
                        <Row IconComp={IconBell} iconColor={C.yellow} label="現金上限" sub="停止目安まで約30分になったとき"
                            right={<Toggle label="現金上限通知" value={prefs.cashLimit !== false} onChange={(v) => setPref("cashLimit", v)} />} />
                    </Section>
                    <div style={{ padding: "12px 16px", color: C.sub, fontSize: 11, lineHeight: 1.6 }}>
                        ここで切り替えるのはアプリ内の通知履歴です。端末のプッシュ通知は使用していません。
                    </div>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 自動ロック設定サブビュー ──
    if (showAutoLockView) {
        const options = [
            { value: 0, label: "オフ" },
            { value: "background", label: "バックグラウンド移動時" },
            { value: 1, label: "1分後" },
            { value: 5, label: "5分後" },
            { value: 15, label: "15分後" },
            { value: 30, label: "30分後" },
        ];
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <SubHeader title="自動ロック" onBack={() => setShowAutoLockView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="ロックするタイミング" />
                    {!s.appPin ? (
                        <Section><div style={{ padding: 16, color: C.sub, fontSize: 12, lineHeight: 1.6 }}>先にアプリロックをオンにして、4桁のPINを設定してください。</div></Section>
                    ) : (
                        <Section>
                            {options.map((option, index) => {
                                const active = String(s.autoLockMinutes ?? 0) === String(option.value);
                                return (
                                    <button key={String(option.value)} type="button" className="b settings-row" aria-pressed={active}
                                        onClick={() => s.setAutoLockMinutes(option.value)} style={{
                                            width: "100%", minHeight: 52, padding: "12px 16px", textAlign: "left",
                                            display: "flex", alignItems: "center", justifyContent: "space-between",
                                            background: "transparent", border: "none",
                                            borderBottom: index < options.length - 1 ? `1px solid ${C.border}` : "none",
                                            color: active ? C.blue : C.text, fontSize: 14, fontWeight: active ? 700 : 500,
                                        }}>
                                        <span>{option.label}</span><span aria-hidden="true">{active ? "✓" : ""}</span>
                                    </button>
                                );
                            })}
                        </Section>
                    )}
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 基本設定サブビュー ──
    if (showGameSettingsView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="基本設定" onBack={() => setShowGameSettingsView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="貸玉・交換率" />
                    {s.rentBallsWarning && <div role="alert" style={{ margin: "0 0 10px", padding: 10, borderRadius: 8, background: `${C.yellow}22`, color: C.text, fontSize: 12, lineHeight: 1.5 }}>
                        保存値が範囲外のため4円貸しで仮表示中です。貸玉を25〜200玉/100円で手動訂正してください。
                    </div>}
                    <Section>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>100円で借りる玉数（玉/100円）</div>
                                <div style={{ fontSize: 10, color: C.sub }}>4円貸しは25を入力（3.9ではありません）</div>
                                <div style={{ fontSize: 11, color: C.sub }}>{(100 / ((s.rentBalls || 250) / 10)).toFixed(2)}円/玉</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI ariaLabel="貸玉100円あたりの玉数" validate={(v) => isValidRentBalls(Number(v) * 10) ? "" : "25〜200で入力してください"} v={Number(s.rentBalls || 250) / 10} set={(v) => s.setRentBalls(Math.round(Number(v) * 10))} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>玉/100円</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>交換100円</div>
                                <div style={{ fontSize: 11, color: C.sub }}>{(100 / ((s.exRate || 250) / 10)).toFixed(2)}円/玉</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI ariaLabel="交換100円あたりの玉数" validate={validatePositive} v={Number(s.exRate || 250) / 10} set={(v) => { const ex = Math.round(Number(v) * 10); s.setExRate(ex); s.setBallVal(1000 / ex); }} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>玉/100円</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, padding: "12px 16px", flexWrap: "wrap" }}>
                            {[
                                { label: "等価", balls: 25, yen: "4.00" },
                                { label: "3.57円", balls: 28, yen: "3.57" },
                                { label: "3.33円", balls: 30, yen: "3.33" },
                                { label: "3.03円", balls: 33, yen: "3.03" },
                            ].map(({ label, balls, yen }) => {
                                const isActive = Math.abs(Number(s.exRate || 250) / 10 - balls) < 0.05;
                                return (
                                    <button key={yen} className="b" onClick={() => { s.setExRate(balls * 10); s.setBallVal(1000 / (balls * 10)); }} style={{
                                        background: isActive ? C.blue : C.surfaceHi,
                                        border: isActive ? "none" : `1px solid ${C.border}`,
                                        borderRadius: 999, color: isActive ? "#fff" : C.subHi,
                                        fontSize: 13, padding: "8px 14px", minHeight: 44, fontFamily: font, fontWeight: 600,
                                    }}>{label}</button>
                                );
                            })}
                        </div>
                    </Section>

                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 機種スペックサブビュー（回転・補正を統合）──
    if (showMachineSpecView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="機種スペック設定" onBack={() => setShowMachineSpecView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="期待値算出用スペック" />
                    <Section>
                        {[
                            { lbl: "1R出玉（実出玉）", v: s.spec1R, set: s.setSpec1R, unit: "玉/R" },
                            { lbl: "平均総R/初当たり", v: s.specAvgRounds, set: s.setSpecAvgRounds, unit: "R" },
                            { lbl: "サポ増減/初当たり", v: s.specSapo, set: s.setSpecSapo, unit: "玉" },
                        ].map(({ lbl, v, set, unit }) => (
                            <div key={lbl} className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{lbl}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <NI ariaLabel={lbl} validate={lbl === "サポ増減/初当たり" ? validateFinite : validateNonNegative} v={v} set={set} w={80} center />
                                    <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </Section>

                    <SectionLabel label="合成確率・回転" />
                    <Section>
                        {[
                            { lbl: "合成確率分母", v: s.synthDenom, set: s.setSynthDenom, unit: "1/x" },
                            { lbl: "1h消化回転数", v: s.rotPerHour, set: s.setRotPerHour, unit: "回/h" },
                            { lbl: "ボーダー手動値", v: s.border, set: s.setBorder, unit: "回/K" },
                        ].map(({ lbl, v, set, unit }, i, arr) => (
                            <div key={lbl} className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{lbl}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <NI ariaLabel={lbl} validate={validatePositive} v={v} set={set} w={80} center />
                                    <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </Section>

                    <SectionLabel label="ボーダー（自動計算）" />
                    <Section>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px" }}>
                            <div>
                                <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{borderSource === "db" ? "DB標準ボーダー" : "理論ボーダー"}</div>
                                <div style={{ fontSize: 11, color: C.teal, marginTop: 2 }}>{exRateLabel}</div>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: mono }}>
                                {calcBorder > 0 ? f(calcBorder, 1) : "—"}
                                <span style={{ fontSize: 11, color: C.sub, marginLeft: 4 }}>回/K</span>
                            </div>
                        </div>
                    </Section>

                    <SectionLabel label="遊タイム狙い目分析（任意）" />
                    <Section>
                        {[
                            { key: "triggerLowSpins", lbl: "発動する低確率回転数", sub: "0 で非搭載・未設定", v: s.yutimeSession?.triggerLowSpins ?? s.ceilingRot, unit: "回" },
                            { key: "durationSpins", lbl: "遊タイム回数", sub: "電サポが続く規定回数", v: s.yutimeSession?.durationSpins ?? 0, unit: "回" },
                            { key: "expectedNetBalls", lbl: "スルー込み平均純増玉", sub: "電サポ増減も含む。0玉も有効", v: s.yutimeSession?.expectedNetBalls ?? "", unit: "玉" },
                            { key: "assumedStart1K", lbl: "想定1K回転率", sub: "実測前の暫定計算に使用", v: s.yutimeSession?.assumedStart1K ?? s.border, unit: "回/K" },
                        ].map(({ key, lbl, sub, v, unit }) => (
                            <div key={lbl} className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{lbl}</div>
                                    {sub && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{sub}</div>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <NI ariaLabel={lbl} validate={key === "expectedNetBalls" ? validateFinite : validateNonNegative} v={v} set={(value) => updateManualYutime(key, value)} w={80} center />
                                    <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 貯玉設定サブビュー ──
    if (showChodamaView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="貯玉設定" onBack={() => setShowChodamaView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="貯玉オプション" />
                    <Section>
                        <Row IconComp={IconDiamond} iconColor={C.teal} label="貯玉を収支に含める" sub="OFFの場合、貯玉使用分は投資額0円として計算"
                            right={<Toggle label="貯玉を収支に含める" value={s.includeChodamaInBalance} onChange={s.setIncludeChodamaInBalance} color="var(--settings-accent)" />} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>1日の再プレイ上限</div>
                                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>上限到達時に警告を表示します</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI ariaLabel="1日の再プレイ上限" validate={validateNonNegative} v={s.chodamaReplayLimit} set={s.setChodamaReplayLimit} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 20 }}>玉</span>
                            </div>
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 貯玉データサブビュー（店舗別残高 + 入出金履歴） ──
    if (showChodamaDataView) {
        const storeObjs = (s.stores || []).filter(st => typeof st === "object" && st.name);
        const logEntries = [...(s.chodamaLog || [])].sort(
            (a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || 0) - (a.id || 0)
        );
        const typeLabel = { deposit: "預入", withdraw: "引出", adjust: "調整" };
        const typeColor = { deposit: C.green, withdraw: C.red, adjust: C.blue };
        const fieldStyle = {
            width: "100%", boxSizing: "border-box", background: C.bg,
            border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "12px",
            fontSize: 16, color: C.text, fontFamily: font, outline: "none", minHeight: 44,
        };

        const recordChodama = () => {
            const store = storeObjs.find(st => String(st.id) === String(chodamaFormStoreId));
            const ballsNum = Math.round(Number(chodamaFormBalls) || 0);
            if (!store) { showToast("店舗を選択してください", "warn"); return; }
            if (ballsNum <= 0) { showToast("玉数を入力してください", "warn"); return; }
            const before = Number(store.chodama) || 0;
            let after = before;
            if (chodamaFormType === "deposit") after = before + ballsNum;
            else if (chodamaFormType === "withdraw") after = Math.max(0, before - ballsNum);
            else after = ballsNum; // adjust = 残高を絶対値でセット
            s.setStores(prev => prev.map(st =>
                (typeof st === "object" && st.id === store.id) ? { ...st, chodama: after } : st
            ));
            const entry = {
                id: Date.now(),
                date: chodamaFormDate || localDateStr(),
                storeId: store.id,
                storeName: store.name,
                type: chodamaFormType,
                balls: ballsNum,
                balanceBefore: before,
                balanceAfter: after,
                memo: chodamaFormMemo || "",
            };
            s.setChodamaLog(prev => [entry, ...(prev || [])]);
            setChodamaFormBalls("");
            setChodamaFormMemo("");
            showToast(`「${store.name}」に記録しました（残高 ${f(after)}玉）`);
        };

        const deleteLog = (id) => {
            s.setChodamaLog(prev => (prev || []).filter(e => e.id !== id));
            showToast("履歴を削除しました（残高は変わりません）", "warn");
        };

        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="貯玉データ" onBack={() => setShowChodamaDataView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>

                    {/* 店舗別 貯玉残高 */}
                    <SectionLabel label="店舗別 貯玉残高" />
                    <Section>
                        {storeObjs.length === 0 ? (
                            <div style={{ padding: "16px", fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                                登録された店舗がありません。「データ管理 → 店舗検索・登録」で店舗を追加してください。
                            </div>
                        ) : (
                            storeObjs.map((st) => (
                                <Row
                                    key={st.id}
                                    IconComp={IconDiamond}
                                    iconColor={C.purple}
                                    label={st.name}
                                    sub="タップで下のフォームに選択"
                                    onPress={() => setChodamaFormStoreId(String(st.id))}
                                    right={<span style={{ fontSize: 15, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(Number(st.chodama) || 0)} 玉</span>}
                                />
                            ))
                        )}
                    </Section>

                    {/* 入出金を記録 */}
                    <SectionLabel label="入出金を記録" />
                    <Section>
                        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>店舗</div>
                                <select value={chodamaFormStoreId} onChange={(e) => setChodamaFormStoreId(e.target.value)} style={fieldStyle}>
                                    <option value="">店舗を選択</option>
                                    {storeObjs.map((st) => (
                                        <option key={st.id} value={String(st.id)}>{st.name}（{f(Number(st.chodama) || 0)}玉）</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>種別</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {[
                                        { id: "deposit", label: "預入 (+)" },
                                        { id: "withdraw", label: "引出 (−)" },
                                        { id: "adjust", label: "調整 (=)" },
                                    ].map(({ id, label }) => {
                                        const active = chodamaFormType === id;
                                        return (
                                            <button key={id} className="b" onClick={() => setChodamaFormType(id)} style={{
                                                flex: 1, minHeight: 44, borderRadius: 8, cursor: "pointer",
                                                border: active ? `2px solid ${typeColor[id]}` : `1px solid ${C.border}`,
                                                background: active ? `${typeColor[id]}22` : C.surfaceHi,
                                                color: active ? typeColor[id] : C.text, fontSize: 13, fontWeight: active ? 700 : 500,
                                                fontFamily: font, WebkitTapHighlightColor: "transparent",
                                            }}>{label}</button>
                                        );
                                    })}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>
                                    {chodamaFormType === "adjust" ? "調整: 入力した玉数を残高にそのままセットします" : chodamaFormType === "withdraw" ? "引出: 残高から差し引きます" : "預入: 残高に加算します"}
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>玉数</div>
                                    <NI ariaLabel="貯玉データの玉数" validate={validatePositive} v={chodamaFormBalls} set={setChodamaFormBalls} w="100%" center ph="2500" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>日付</div>
                                    <input type="date" value={chodamaFormDate} onChange={(e) => setChodamaFormDate(e.target.value)} style={fieldStyle} />
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>メモ（任意）</div>
                                <input type="text" value={chodamaFormMemo} onChange={(e) => setChodamaFormMemo(e.target.value)} placeholder="例: 全部交換 / 持ち越し" style={fieldStyle} />
                            </div>
                            <Btn label="記録する" onClick={recordChodama} primary fs={15} />
                        </div>
                    </Section>

                    {/* 入出金履歴 */}
                    <SectionLabel label="入出金履歴" />
                    <Section>
                        {logEntries.length === 0 ? (
                            <div style={{ padding: "16px", fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                                まだ履歴がありません。上のフォームから記録してください。
                            </div>
                        ) : (
                            logEntries.map((e) => (
                                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: typeColor[e.type] || C.subHi, background: `${typeColor[e.type] || C.sub}22`, borderRadius: 4, padding: "2px 6px" }}>{typeLabel[e.type] || e.type}</span>
                                            <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{e.storeName}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                                            {e.date}・残高 {f(e.balanceAfter)}玉{e.memo ? `・${e.memo}` : ""}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: mono, color: typeColor[e.type] || C.text }}>
                                            {e.type === "adjust" ? "=" : e.type === "withdraw" ? "−" : "+"}{f(e.balls)}
                                        </div>
                                    </div>
                                    <button className="b" aria-label={`${e.storeName}の貯玉履歴を削除`} onClick={() => deleteLog(e.id)} style={{
                                        background: "transparent", border: "none", color: C.sub, fontSize: 18,
                                        width: 44, height: 44, cursor: "pointer", flexShrink: 0,
                                    }}>✕</button>
                                </div>
                            ))
                        )}
                        <div style={{ padding: "12px 16px", fontSize: 10, color: C.sub, lineHeight: 1.6 }}>
                            ※ 残高の真実源は店舗ごとの貯玉です。履歴の削除は残高に影響しません。
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 島マップ管理サブビュー（全面リニューアル：島レイアウト管理画面） ──
    // 旧「島一覧」中心のホールマップ編集を、「この店舗の島構成を俯瞰する」レイアウト管理画面へ再設計。
    // データの実体は App.jsx の pt_hallMaps（s.hallMaps）。戦略マップと同じ世界観で自己完結する。
    if (showHallMapView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <IslandMapManager
                    store={hallMapStore}
                    stores={normalizedStores}
                    onChangeStore={handleChangeHallMapStore}
                    islands={hallMapIslands}
                    onChangeIslands={handleChangeHallMapIslands}
                    onBack={() => setShowHallMapView(false)}
                    requestConfirmation={s.requestConfirmation}
                />
                <ToastPortal />
            </div>
        );
    }

    // ── Windows自動解析・Push連携サブビュー ──
    if (showPushSyncView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <SubHeader title="Windows自動取込" onBack={() => setShowPushSyncView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <PushSyncSettings requestConfirmation={s.requestConfirmation} />
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── バックアップサブビュー ──
    if (showBackupView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="データ入出力" onBack={() => setShowBackupView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="全データバックアップ" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                実践記録・収支・設定・機種・店舗・Windowsから届いた解析原本を、1つのファイルに保存します。アプリを削除する前に実行してください。
                            </div>
                            <div style={{ fontSize: 11, color: C.orange, marginBottom: 14, lineHeight: 1.6 }}>
                                PINとAI APIキーは安全のため含まれません。利用再開時にこの端末で再設定してください。
                            </div>
                            <div style={{ fontSize: 11, color: C.subHi, marginBottom: 14, lineHeight: 1.6 }}>
                                最終バックアップ: {Number.isFinite(Date.parse(String(s.lastBackupAt || "")))
                                    ? new Date(s.lastBackupAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })
                                    : "まだありません"}
                            </div>
                            <Btn label="全データをバックアップ" onClick={backupAllData} bg={C.green} fg="#fff" bd="none" />
                        </div>
                    </Section>

                    <SectionLabel label="バックアップから復元" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                保存したバックアップファイル（.json）を選ぶと、実践データを元に戻せます。復元前に確認画面が表示されます。
                            </div>
                            <label style={{
                                display: "block", width: "100%", boxSizing: "border-box",
                                background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                                color: C.text, fontSize: 14, padding: "12px 16px", fontFamily: font, fontWeight: 600,
                                textAlign: "center", cursor: "pointer",
                            }}>
                                バックアップから復元
                                <input type="file" accept=".json" onChange={restoreAllData} style={{ display: "none" }} />
                            </label>
                        </div>
                    </Section>

                    <SectionLabel label="収支CSV" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                収支分析に使うアーカイブデータをCSV形式で出力・取り込みできます。
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <Btn label="CSVエクスポート" onClick={exportArchiveCSV} bg={C.orange} fg="#fff" bd="none" />
                                <label style={{
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    minHeight: 44, boxSizing: "border-box",
                                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                                    color: C.text, fontSize: 14, padding: "12px 16px", fontFamily: font, fontWeight: 600,
                                    textAlign: "center", cursor: "pointer",
                                }}>
                                    CSVインポート
                                    <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={importArchiveCSV} style={{ display: "none" }} />
                                </label>
                            </div>
                        </div>
                    </Section>

                    <SectionLabel label="収支データ整理" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>
                                重複データとCSVから取り込んだデータを整理できます。
                            </div>
                            <Btn
                                label={countDuplicateArchives() > 0 ? `重複データを削除（${countDuplicateArchives()}件）` : "重複データはありません"}
                                onClick={deleteDuplicateArchives}
                                bg={countDuplicateArchives() > 0 ? C.orange : C.surfaceHi}
                                fg={countDuplicateArchives() > 0 ? "#fff" : C.sub}
                                bd={countDuplicateArchives() > 0 ? "none" : C.border}
                                disabled={countDuplicateArchives() <= 0}
                            />
                            {(s.archives || []).some(a => a.isImported) && (
                                <div style={{ marginTop: 10 }}>
                                    <Btn
                                        label={`CSVインポートデータを削除（${(s.archives || []).filter(a => a.isImported).length}件）`}
                                        onClick={deleteImportedArchives}
                                        bg={C.red}
                                        fg="#fff"
                                        bd="none"
                                    />
                                </div>
                            )}
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }


    // ── セッション初期化サブビュー ──
    if (showAdvancedView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="データをリセット" onBack={() => setShowAdvancedView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(72px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="セッションの初期化" />
                    <Section danger>
                        {!confirming ? (
                            <Row IconComp={IconTrash} iconColor={C.red} label="データをリセット" sub="現在のセッション内データだけを消去します" danger onPress={() => setConfirming(true)} />
                        ) : (
                            <div style={{ padding: "16px" }}>
                                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 6 }}>本当にリセットしますか？</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                    現在のセッション内の回転数・獲得出玉・入力履歴が消去されます。保存済み収支・店舗の貯玉・会員カード・設定値は保持されます。この操作は元に戻せません。
                                </div>
                                <div style={{ display: "flex", gap: 10 }}>
                                    <Btn label="本当にリセット" onClick={() => { onReset(); setConfirming(false); }} bg={C.red} fg="#fff" bd="none" />
                                    <Btn label="キャンセル" onClick={() => setConfirming(false)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                </div>
                            </div>
                        )}
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── メイン設定（分析OS風ダークUI、全1カラム縦リスト） ──
    // 環境プロファイル用の値
    const rateDisplay = `${Number(s.exRate || 250) / 10}玉交換`;
    const exLabelShort = exRateKey === "4.00" ? "等価"
        : exRateKey ? `${exRateKey}円`
        : `${yenPerBall.toFixed(2)}円`;
    const borderShort = calcBorder > 0 ? `${f(calcBorder, 1)}/K` : "—";
    const appVersion = import.meta.env.PACKAGE_VERSION || "0.0.0";
    const autoLockLabel = s.autoLockMinutes === "background"
        ? "バックグラウンド移動時"
        : Number(s.autoLockMinutes) > 0 ? `${Number(s.autoLockMinutes)}分後` : "オフ";
    const verifyingPin = pinSetStep === "verify-disable" || pinSetStep === "verify-change";
    const pinEntryValue = verifyingPin ? pinCurrent : (pinSetStep === "enter" ? pinDraft : pinConfirm);
    const pinStepTitle = pinSetStep === "verify-disable"
        ? "現在のPINを入力してロックを解除"
        : pinSetStep === "verify-change"
            ? "現在のPINを確認"
            : pinSetStep === "enter" ? "新しいPINを入力（4桁）" : "PINを再入力して確認";
    // 「現在の遊技環境」サマリーカード用の値
    const storeCount = (s.stores || []).length;
    // 貯玉残高の合計（店舗オブジェクトの chodama を集計）と「要確認」判定
    const chodamaTotal = (s.stores || []).reduce(
        (a, st) => a + (typeof st === "object" ? Number(st.chodama) || 0 : 0), 0
    );
    const chodamaUnset = chodamaTotal === 0 && (s.chodamaLog || []).length === 0;

    // 情報アイコン（i）。既存に IconInfo が無いため svgProps を流用した極小コンポーネント
    const IconInfo = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/></svg>);

    // 「要確認」ピル（オレンジ系・小バッジ）
    const WarnPill = () => (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "color-mix(in srgb, var(--orange) 16%, transparent)",
            border: "1px solid color-mix(in srgb, var(--orange) 34%, transparent)",
            borderRadius: 999, padding: "3px 9px", flexShrink: 0,
            fontSize: 10.5, fontWeight: 700, color: "var(--orange)", whiteSpace: "nowrap",
        }}>⚠ 要確認</span>
    );

    // 設定用アイコン枠。テーマ色に関係なく発光させず、文字の判読を優先する。
    const SettingsIconBox = ({ IconComp, size = 44 }) => (
        <div style={{
            width: size, height: size, borderRadius: size * 0.30,
            background: "var(--settings-icon-bg)",
            border: "1px solid var(--settings-icon-line)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--settings-icon-color)", flexShrink: 0,
        }}>
            {IconComp ? <IconComp /> : null}
        </div>
    );

    // A案（ダーク）/B案（ライト）で共通利用するフラットカード。
    const glassCardStyle = {
        background: "var(--settings-card)",
        border: "1px solid var(--settings-line)",
        borderRadius: "var(--settings-radius)",
        overflow: "hidden",
    };

    // セクション見出し（カード外、左寄せの小ラベル）
    const SectionLabelV2 = ({ label }) => (
        <div style={{
            padding: "4px 6px 8px",
            fontSize: 12.5, fontWeight: 700, color: "var(--sub)",
            letterSpacing: 0.4,
        }}>{label}</div>
    );

    // 縦リストの1行（1カラム共通）
    // - iPhone片手操作のため最小高さ 60px（タップ領域 >= 44px の余裕を確保）
    // - 文字は 1〜2 行で省略、サブテキストは長くても 1 行で …
    const ListRow = ({ IconComp, label, sub, onPress, right, isLast }) => {
        const Tag = onPress ? "button" : "div";
        return (
            <Tag className="b settings-list-row" onClick={onPress || undefined} style={{
                width: "100%", background: "transparent", border: "none",
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 14px", cursor: onPress ? "pointer" : "default",
                textAlign: "left", WebkitTapHighlightColor: "transparent",
                borderBottom: isLast ? "none" : "1px solid var(--settings-line)",
                minHeight: 60,
            }}>
                {IconComp && <SettingsIconBox IconComp={IconComp} size={40} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 14.5, color: C.text, fontWeight: 600, lineHeight: 1.3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{label}</div>
                    {sub && <div style={{
                        fontSize: 11.5, color: "var(--sub)", marginTop: 3, lineHeight: 1.3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{sub}</div>}
                </div>
                {right !== undefined ? right : (onPress ? <span style={{ fontSize: 16, color: "var(--sub)", flexShrink: 0, fontWeight: 400 }}>›</span> : null)}
            </Tag>
        );
    };

    // セクションカード（縦リストをまとめる）
    const SectionCard = ({ children }) => (
        <div style={{ ...glassCardStyle, marginBottom: 18 }}>{children}</div>
    );

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--settings-bg)" }}>

            {/* ── スクロールコンテンツ（ヘッダーも内側に置き、固定せずスクロール追従させる） ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 14px calc(72px + env(safe-area-inset-bottom))" }}>

                {/* ── タイトル ── */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: -0.6, lineHeight: 1.05 }}>設定</div>
                    <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 4, fontFamily: font }}>アプリの各種設定を管理します</div>
                    <div style={{ fontSize: 10.5, color: "var(--settings-good)", marginTop: 5, fontFamily: font }}>✓ 変更はこの端末へ自動保存されます</div>
                </div>

                {/* ── 貸玉・交換率（サマリーカード） ── */}
                <button
                    className="b"
                    onClick={() => {
                        setShowGameSettingsView(true);
                    }}
                    style={{
                        ...glassCardStyle,
                        width: "100%", textAlign: "left",
                        borderLeft: "var(--settings-summary-rule)",
                        padding: "14px", marginBottom: 18,
                        cursor: "pointer", WebkitTapHighlightColor: "transparent",
                    }}
                >
                    {/* 上段：見出し + 情報アイコン + chevron */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>貸玉・交換率</span>
                                <span aria-hidden="true" style={{ color: "var(--settings-accent)", display: "inline-flex" }}><IconInfo /></span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 3 }}>収支計算に使う玉数と交換率を確認</div>
                        </div>
                        <span style={{ fontSize: 16, color: "var(--sub)", flexShrink: 0, fontWeight: 400 }}>›</span>
                    </div>
                    {/* 下段：3指標（横スクロール禁止＝flex 等幅） */}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {[
                            { label: "貸玉", value: `${Number(s.rentBalls || 250) / 10}玉`, warn: false },
                            { label: "交換率", value: rateDisplay, warn: false },
                            { label: "玉単価", value: `${yenPerBall.toFixed(2)}円`, warn: false },
                        ].map((m) => (
                            <div key={m.label} style={{
                                flex: 1, minWidth: 0,
                                background: "var(--settings-card-alt)",
                                border: "1px solid var(--settings-line)",
                                borderRadius: 10, padding: "10px 8px", textAlign: "center",
                            }}>
                                <div style={{ fontSize: 10.5, color: "var(--sub)", marginBottom: 4 }}>{m.label}</div>
                                <div style={{
                                    fontSize: 14, fontWeight: 800, lineHeight: 1.2,
                                    color: m.warn ? "var(--orange)" : C.text,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{m.value}</div>
                                {m.warn && <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}><WarnPill /></div>}
                            </div>
                        ))}
                    </div>
                </button>

                {/* ── 1. 最初に設定する（1カラム縦リスト） ── */}
                <SectionLabelV2 label="最初に設定する" />
                <SectionCard>
                    {(() => {
                        const items = [
                            { color: "var(--blue)", icon: IconExchange,   label: "レート・交換率",   sub: `${Number(s.exRate || 250) / 10}玉 / ${exLabelShort}・収支計算に使用`, onPress: () => setShowGameSettingsView(true) },
                            { color: "var(--green)", icon: IconStore,      label: "店舗検索・登録",   sub: `利用可能な店舗データ: ${storeCount}件`,                                       onPress: () => setShowStoreSearch(true) },
                            { color: "var(--teal)", icon: IconMagnifier,  label: "機種検索・登録",   sub: `カスタム機種: ${(s.customMachines || []).length}件`,                          onPress: () => setShowMachineSearch(true) },
                            { color: "var(--orange)", icon: IconCoin,       label: "貯玉設定",         sub: s.includeChodamaInBalance ? "収支に含める / 再プレイ上限あり" : "収支に含めない", onPress: () => setShowChodamaView(true), warn: chodamaUnset },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                                right={it.warn ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                        <WarnPill />
                                        <span style={{ fontSize: 16, color: "var(--sub)", fontWeight: 400 }}>›</span>
                                    </span>
                                ) : undefined}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 2. 遊技データ（1カラム縦リスト） ── */}
                <SectionLabelV2 label="遊技データ" />
                <SectionCard>
                    {(() => {
                        const hallMapIslandCount = Array.isArray(hallMapIslands) ? hallMapIslands.length : 0;
                        const items = [
                            { color: "var(--teal)", icon: IconDiamond,     label: "貯玉データ",       sub: "店舗別残高 / 入出金履歴",                                                       onPress: () => setShowChodamaDataView(true) },
                            { color: "var(--teal)", icon: IconGrid,       label: "店舗レイアウト",   sub: hallMapStore ? `${hallMapStore.name || "店舗"} ・ ${hallMapIslandCount}島` : "店舗を登録すると編集できます", onPress: () => setShowHallMapView(true) },
                            { color: "var(--red)", icon: IconTarget,     label: "機種スペック設定", sub: `${s.synthDenom || 319.6} / ${borderShort}`,                                     onPress: () => setShowMachineSpecView(true) },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 3. データ管理（1カラム縦リスト） ── */}
                <SectionLabelV2 label="データ管理" />
                <SectionCard>
                    {(() => {
                        const items = [
                            { color: "var(--green)", icon: IconCloud,      label: "Windows自動取込",    sub: "iCloud解析結果を暗号化して受信",          onPress: () => setShowPushSyncView(true) },
                            { color: "var(--blue)", icon: IconCloud,      label: "データの保存・復元", sub: "JSON全体バックアップ",                  onPress: () => setShowBackupView(true) },
                            { color: "var(--purple)", icon: IconCsv,        label: "CSV入出力",         sub: "収支データのインポート / エクスポート",  onPress: () => setShowBackupView(true) },
                            { color: "var(--red)", icon: IconTrash,       label: "データをリセット",   sub: "現在のセッションだけを初期化",            onPress: () => setShowAdvancedView(true) },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 4. 表示・通知（1カラム縦リスト） ── */}
                <SectionLabelV2 label="表示・通知" />
                <SectionCard>
                    {(() => {
                        const items = [
                            { color: "var(--purple)", icon: IconPaint,      label: "テーマ・カラー",     sub: "ダーク / 配色 / アクセシビリティ", onPress: () => setShowAppearanceView(true) },
                            { color: "var(--purple)", icon: IconBell,       label: "通知設定",           sub: "5種類のアプリ内通知", onPress: () => setShowNotificationView(true) },
                            { color: "var(--blue)", icon: IconChartBars,  label: "グラフ・表示設定",   sub: "形式 / 表示項目 / 単位", right: <ComingSoonBadge /> },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                                right={it.right}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 5. セキュリティ（1カラム縦リスト・4項目） ── */}
                <SectionLabelV2 label="セキュリティ" />
                <SectionCard>
                    {/* アプリロック（Toggle） */}
                    <ListRow
                        color="var(--blue)"
                        IconComp={IconLock}
                        label="アプリロック"
                        sub={s.appLock ? (s.appPin ? "PIN設定済み" : "PIN未設定") : "オフ"}
                        right={
                            <Toggle
                                label="アプリロック"
                                value={s.appLock}
                                onChange={(v) => {
                                    setPinSetError(false);
                                    setPinCurrent(""); setPinDraft(""); setPinConfirm("");
                                    if (!v && s.appPin) { setPinSetStep("verify-disable"); }
                                    else if (!v) { s.setAppLock(false); setPinSetStep("idle"); }
                                    else if (!s.appPin) { s.setAppLock(true); setPinSetStep("enter"); setPinDraft(""); }
                                    else s.setAppLock(true);
                                }}
                                color="var(--settings-accent)"
                            />
                        }
                    />
                    {/* 自動ロック（chevron） */}
                    <ListRow
                        color="var(--purple)"
                        IconComp={IconFaceId}
                        label="自動ロック"
                        sub={s.appPin ? autoLockLabel : "PIN設定後に利用できます"}
                        onPress={() => setShowAutoLockView(true)}
                    />
                    {s.appPin && (
                        <ListRow
                            color="var(--green)"
                            IconComp={IconKey}
                            label="PINを変更"
                            sub="現在のPINを確認して変更します"
                            onPress={() => {
                                setPinSetError(false); setPinCurrent(""); setPinDraft(""); setPinConfirm("");
                                setPinSetStep("verify-change");
                            }}
                        />
                    )}
                    {/* 生体認証でのロック（chevron） */}
                    <ListRow
                        color="#22d3ee"
                        IconComp={IconFingerprint}
                        label="生体認証でのロック"
                        sub="対応端末向け機能"
                        right={<ComingSoonBadge />}
                        isLast
                    />

                    {/* PIN設定UI（展開時のみ表示） */}
                    {pinSetStep !== "idle" && (
                        <div style={{
                            margin: "0 14px 14px", padding: "14px", borderRadius: 12,
                            background: "var(--settings-card-alt)",
                            border: "1px solid var(--settings-line)",
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                                {pinStepTitle}
                            </div>
                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
                                {[0,1,2,3].map(i => {
                                    const val = pinEntryValue;
                                    return (
                                        <div key={i} style={{
                                            width: 14, height: 14, borderRadius: 7,
                                            background: val.length > i ? (pinSetError ? C.red : "var(--settings-accent)") : "rgba(128,128,128,0.3)",
                                            transition: "background 0.15s ease",
                                        }} />
                                    );
                                })}
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input
                                     type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                                    aria-label={pinStepTitle}
                                    value={pinEntryValue}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                        if (verifyingPin) setPinCurrent(v);
                                        else if (pinSetStep === "enter") setPinDraft(v);
                                        else setPinConfirm(v);
                                        setPinSetError(false);
                                    }}
                                    placeholder="••••"
                                    style={{
                                        flex: 1, background: C.bg,
                                        border: `1.5px solid ${pinSetError ? C.red : C.borderHi}`,
                                        borderRadius: 10, padding: "11px 12px", fontSize: 22, color: C.text,
                                        fontFamily: mono, outline: "none", letterSpacing: 10, textAlign: "center",
                                    }}
                                />
                                <button className="b" onClick={async () => {
                                    const val = pinEntryValue;
                                    if (val.length !== 4 || !/^\d{4}$/.test(val)) { setPinSetError(true); return; }
                                    if (verifyingPin) {
                                        if (!(await verifyPin(pinCurrent, s.appPin))) { setPinSetError(true); return; }
                                        if (pinSetStep === "verify-disable") {
                                            const confirmed = await s.requestConfirmation?.({
                                                title: "アプリロックを解除しますか？",
                                                message: "保存済みのPINと自動ロック設定を削除します。",
                                                confirmLabel: "ロックを解除",
                                                tone: "danger",
                                            });
                                            if (!confirmed) return;
                                            s.setAppLock(false); s.setAppPin(""); s.setAutoLockMinutes(0); s.setIsLocked(false);
                                            setPinSetStep("idle"); setPinCurrent("");
                                            showToast("アプリロックを解除しました");
                                        } else {
                                            setPinSetStep("enter"); setPinCurrent(""); setPinDraft("");
                                        }
                                    } else if (pinSetStep === "enter") {
                                        setPinSetStep("confirm"); setPinConfirm(""); setPinSetError(false);
                                    } else {
                                        if (pinConfirm !== pinDraft) { setPinSetError(true); return; }
                                        try {
                                            const protectedPin = await hashPin(pinConfirm);
                                            s.setAppPin(protectedPin); s.setAppLock(true); s.setIsLocked(false);
                                        } catch {
                                            setPinSetError(true);
                                            return;
                                        }
                                        setPinSetStep("idle"); setPinDraft(""); setPinConfirm("");
                                        showToast("PINを設定しました");
                                    }
                                }} style={{
                                     background: "var(--settings-accent)", border: "none", borderRadius: 10,
                                     color: "#fff", fontSize: 13, padding: "11px 18px", minHeight: 44,
                                    fontFamily: font, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                                }}>{verifyingPin ? "確認" : pinSetStep === "enter" ? "次へ" : "確定"}</button>
                                <button className="b" onClick={() => {
                                    setPinSetStep("idle"); setPinCurrent(""); setPinDraft(""); setPinConfirm(""); setPinSetError(false);
                                    if (!s.appPin) s.setAppLock(false);
                                }} style={{
                                     background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                                     color: C.text, fontSize: 13, padding: "11px 14px", minHeight: 44,
                                    fontFamily: font, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                                }}>キャンセル</button>
                            </div>
                            {pinSetError && (
                                <div style={{ fontSize: 12, color: C.red, marginTop: 8, textAlign: "center" }}>
                                    {verifyingPin ? "現在のPINが一致しません" : pinSetStep === "enter" ? "4桁の数字を入力してください" : "PINが一致しません。もう一度入力してください"}
                                </div>
                            )}
                            {pinSetStep === "enter" && (
                                <div style={{ fontSize: 11, color: C.orange, marginTop: 10, lineHeight: 1.5 }}>
                                    PINを忘れるとロックを解除できません。忘れない番号を設定してください。
                                </div>
                            )}
                        </div>
                    )}
                </SectionCard>

                {/* ── 6. サポート（1カラム縦リスト） ── */}
                <SectionLabelV2 label="サポート" />
                <SectionCard>
                    <ListRow
                        color="var(--blue)"
                        IconComp={IconChat}
                        label="お問い合わせ"
                        sub="サポート / 不具合報告"
                        right={<ComingSoonBadge />}
                    />
                    <ListRow
                        color="var(--purple)"
                        IconComp={IconDoc}
                        label="利用規約・プライバシー"
                        sub="利用規約 / プライバシーポリシー"
                        right={<ComingSoonBadge />}
                        isLast
                    />
                </SectionCard>

                {/* ── 7. アプリ情報 ── */}
                <SectionLabelV2 label="アプリ情報" />
                <div style={{ ...glassCardStyle, padding: "14px", marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {/* アプリアイコン */}
                        <div style={{
                            width: 56, height: 56, borderRadius: 14,
                            background: "var(--settings-card-alt)",
                            border: "1px solid var(--settings-line)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 28, flexShrink: 0,
                        }}>🎰</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>パチトラッカー</div>
                            <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2, fontFamily: mono }}>Version {appVersion}</div>
                            <div style={{
                                fontSize: 10.5, color: "var(--sub-hi)", marginTop: 4, lineHeight: 1.3,
                                overflow: "hidden", textOverflow: "ellipsis",
                                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                            }}>パチンコデータをもっと賢く、もっと楽しく。</div>
                        </div>
                    </div>
                    {/* アップデート履歴 */}
                    <div aria-disabled="true" style={{
                        marginTop: 12, width: "100%",
                        background: "var(--settings-card-alt)",
                        border: "1px solid var(--settings-line)",
                        borderRadius: 12, padding: "11px 14px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        boxSizing: "border-box",
                        minHeight: 48,
                    }}>
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>アップデート履歴</div>
                            <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>リリースノート</div>
                        </div>
                        <ComingSoonBadge />
                    </div>
                </div>

                <div style={{ height: 16 }} />
            </div>

            <ToastPortal />
        </div>
    );
}
