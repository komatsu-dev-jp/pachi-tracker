import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { C, font } from "../../constants";
import { searchMachines } from "../../machineDB";
import { MACHINE_SORT_OPTIONS, sortMachines } from "../../machineSort";

const TAP = 44;
const DEFAULT_TYPE_ORDER = ["スマパチ", "ハイミドル", "ミドル", "ライトミドル", "甘デジ"];

function normalizedText(value) {
  return String(value || "").normalize("NFKC").trim();
}

function buildTypeOptions(machines) {
  const found = [...new Set(
    (Array.isArray(machines) ? machines : [])
      .map((machine) => normalizedText(machine?.type))
      .filter(Boolean),
  )];
  const known = DEFAULT_TYPE_ORDER.filter((type) => found.includes(type));
  const extras = found
    .filter((type) => !DEFAULT_TYPE_ORDER.includes(type))
    .sort((left, right) => left.localeCompare(right, "ja"));
  return [...known, ...extras];
}

function machineSubtitle(machine) {
  const maker = normalizedText(machine?.maker);
  const probability = normalizedText(machine?.prob)
    || (Number(machine?.synthProb) > 0 ? `1/${machine.synthProb}` : "");
  return [maker, probability].filter(Boolean).join("　");
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getAttribute("aria-hidden") !== "true");
}

/**
 * 機種マスターを検索する共通ボトムシート。
 *
 * onSelect は登録済み機種では machineDB の機種オブジェクトを受け取る。
 * 未登録名では { name, isUnregistered: true } を含む仮オブジェクトを受け取る。
 * onUseUnregistered を指定した場合は、未登録名だけ同コールバックへ文字列で返す。
 * 本コンポーネント自身は記録設定・差玉データを変更しない。
 */
export default function MachinePickerSheet({
  open,
  onClose,
  onSelect,
  onUseUnregistered,
  customMachines = [],
  title = "機種を選択",
  initialQuery = "",
  allowUnregistered = true,
  zIndex = 1200,
}) {
  if (!open) return null;
  // 開くたびに内部状態を作り直し、前回の検索条件を次の用途へ持ち越さない。
  return (
    <OpenMachinePickerSheet
      onClose={onClose}
      onSelect={onSelect}
      onUseUnregistered={onUseUnregistered}
      customMachines={customMachines}
      title={title}
      initialQuery={initialQuery}
      allowUnregistered={allowUnregistered}
      zIndex={zIndex}
    />
  );
}

function OpenMachinePickerSheet({
  onClose,
  onSelect,
  onUseUnregistered,
  customMachines,
  title,
  initialQuery,
  allowUnregistered,
  zIndex,
}) {
  const [query, setQuery] = useState(() => normalizedText(initialQuery));
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const queryRef = useRef(null);
  const previousFocusRef = useRef(typeof document === "undefined" ? null : document.activeElement);

  const allMachines = useMemo(
    () => searchMachines("", customMachines),
    [customMachines],
  );
  const typeOptions = useMemo(() => buildTypeOptions(allMachines), [allMachines]);
  const filteredMachines = useMemo(() => {
    const searched = searchMachines(query, customMachines);
    const filtered = typeFilter === "all"
      ? searched
      : searched.filter((machine) => normalizedText(machine?.type) === typeFilter);
    return sortMachines(filtered, sort);
  }, [customMachines, query, sort, typeFilter]);
  const unregisteredName = normalizedText(query);
  const hasExactName = allMachines.some((machine) => (
    normalizedText(machine?.name).toLocaleLowerCase("ja")
      === unregisteredName.toLocaleLowerCase("ja")
  ));

  useEffect(() => {
    const previous = previousFocusRef.current;
    queryRef.current?.focus();
    return () => {
      if (previous && typeof previous.focus === "function" && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  const close = () => onClose?.();
  const selectMachine = (machine) => {
    onSelect?.(machine, { isUnregistered: false });
    close();
  };
  const useUnregistered = () => {
    if (!unregisteredName) return;
    if (typeof onUseUnregistered === "function") {
      onUseUnregistered(unregisteredName);
    } else {
      onSelect?.({
        id: `unregistered:${unregisteredName}`,
        name: unregisteredName,
        maker: "",
        type: "",
        isUnregistered: true,
      }, { isUnregistered: true });
    }
    close();
  };
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(dialogRef.current);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.58)",
        backdropFilter: "blur(4px)",
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "88dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: `1px solid ${C.borderHi}`,
          borderBottom: "none",
          borderRadius: "18px 18px 0 0",
          background: C.surface,
          color: C.text,
          fontFamily: font,
          boxShadow: "0 -18px 52px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 10px" }}>
          <button
            type="button"
            onClick={close}
            style={{
              minWidth: 72,
              minHeight: TAP,
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              background: C.surfaceHi,
              color: C.text,
              fontFamily: font,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <h2 id={titleId} style={{ flex: 1, margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900 }}>
            {title}
          </h2>
          <div style={{ minWidth: 72, textAlign: "center", color: C.subHi, fontSize: 11, fontWeight: 800 }}>
            {filteredMachines.length}機種
          </div>
        </div>

        <p id={descriptionId} style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
          機種名やメーカーで検索し、候補を選択してください。
        </p>

        <div style={{ padding: "0 14px 10px" }}>
          <input
            ref={queryRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="機種名・メーカーで検索"
            placeholder="機種名・メーカーで検索"
            autoComplete="off"
            style={{
              width: "100%",
              minHeight: TAP,
              boxSizing: "border-box",
              border: `1px solid ${C.borderHi}`,
              borderRadius: 12,
              background: C.bg,
              color: C.text,
              padding: "0 13px",
              fontFamily: font,
              fontSize: 15,
              outline: "none",
            }}
          />
        </div>

        <div
          aria-label="機種タイプで絞り込み"
          style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 14px 10px", scrollbarWidth: "none" }}
        >
          {["all", ...typeOptions].map((type) => {
            const selected = typeFilter === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                onClick={() => setTypeFilter(type)}
                style={{
                  minHeight: TAP,
                  flexShrink: 0,
                  border: `1px solid ${selected ? C.blue : C.border}`,
                  borderRadius: 999,
                  background: selected ? C.blue : C.surfaceHi,
                  color: selected ? "#fff" : C.text,
                  padding: "0 15px",
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {type === "all" ? "すべて" : type}
              </button>
            );
          })}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px 10px", color: C.subHi, fontSize: 12, fontWeight: 800 }}>
          <span style={{ flexShrink: 0 }}>並び替え</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            style={{
              width: "100%",
              minHeight: TAP,
              border: `1px solid ${C.borderHi}`,
              borderRadius: 10,
              background: C.surfaceHi,
              color: C.text,
              padding: "0 12px",
              fontFamily: font,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {MACHINE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div aria-label="機種の検索結果" style={{ flex: 1, minHeight: 120, overflowY: "auto", overscrollBehavior: "contain" }}>
          {filteredMachines.map((machine, index) => (
            <button
              key={machine.id || `${machine.name}-${index}`}
              type="button"
              onClick={() => selectMachine(machine)}
              style={{
                width: "100%",
                minHeight: 64,
                display: "flex",
                alignItems: "center",
                gap: 12,
                border: "none",
                borderTop: `1px solid ${C.border}`,
                background: "transparent",
                color: C.text,
                padding: "10px 14px",
                textAlign: "left",
                fontFamily: font,
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: TAP,
                  height: TAP,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 11,
                  background: "color-mix(in srgb, var(--blue) 18%, var(--surface-hi))",
                  color: C.blue,
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {normalizedText(machine.type).slice(0, 2) || "機種"}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15, fontWeight: 850 }}>
                  {machine.name}
                </span>
                <span style={{ display: "block", marginTop: 3, color: C.subHi, fontSize: 12 }}>
                  {machineSubtitle(machine) || machine.type || "登録機種"}
                </span>
              </span>
              <span aria-hidden="true" style={{ color: C.sub, fontSize: 18 }}>›</span>
            </button>
          ))}

          {filteredMachines.length === 0 && (
            <div role="status" style={{ padding: "26px 16px 14px", textAlign: "center", color: C.subHi, fontSize: 13, fontWeight: 700 }}>
              条件に一致する登録機種がありません
            </div>
          )}

          {allowUnregistered && unregisteredName && !hasExactName && (
            <button
              type="button"
              onClick={useUnregistered}
              style={{
                width: "calc(100% - 28px)",
                minHeight: 54,
                margin: "8px 14px 16px",
                border: `1px dashed ${C.borderHi}`,
                borderRadius: 12,
                background: C.surfaceHi,
                color: C.text,
                padding: "8px 12px",
                fontFamily: font,
                fontSize: 14,
                fontWeight: 850,
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true" style={{ color: C.blue, marginRight: 7 }}>＋</span>
              「{unregisteredName}」を未登録のまま使う
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
