export default function MachinePickerSheet({
  showMachinePicker,
  setShowMachinePicker,
  C,
  font,
  filteredMachines,
  pickerFilter,
  setPickerFilter,
  pickerSort,
  setPickerSort,
  MACHINE_SORT_OPTIONS,
  deriveSpecForMachine,
  createYutimeSessionFromMachine,
  S,
  machinePickerFor,
  setMoveMachineName,
  setMoveYutimeTarget,
  movePickedMachineRef,
  moveStartRot,
  setSetupMachineName,
  setSetupYutimeLowSpins,
  setSetupYutimeStart1K,
  setMachineQuery,
  machineQuery,
  setShowSetupSpec,
}) {
  return showMachinePicker && (
        <div
            onClick={() => setShowMachinePicker(false)}
            style={{
                position: "fixed", inset: 0,
                background: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(4px)",
                zIndex: 1100,
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: C.surface,
                    borderTopLeftRadius: 16, borderTopRightRadius: 16,
                    maxHeight: "85vh",
                    display: "flex", flexDirection: "column",
                    animation: "fi 0.25s ease",
                }}
            >
                {/* ヘッダー: キャンセル | 機種を選択 | N機種 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px" }}>
                    <button className="b" onClick={() => setShowMachinePicker(false)} style={{
                        background: "var(--surface-hi)", border: "none",
                        borderRadius: 999, padding: "8px 14px",
                        fontSize: 13, fontWeight: 600, color: C.text, fontFamily: font,
                        cursor: "pointer",
                    }}>キャンセル</button>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>機種を選択</div>
                    <div style={{
                        fontSize: 11, fontWeight: 600, color: C.sub,
                        background: "var(--surface-hi)",
                        padding: "6px 12px", borderRadius: 999,
                        minWidth: 56, textAlign: "center",
                    }}>{filteredMachines.length}機種</div>
                </div>

                {/* フィルターチップ (横スクロール) */}
                <div style={{
                    display: "flex", gap: 8,
                    overflowX: "auto",
                    padding: "4px 16px 12px",
                    scrollbarWidth: "none",
                    WebkitOverflowScrolling: "touch",
                }}>
                    {[
                        { id: "all", label: "全て" },
                        { id: "スマパチ", label: "スマパチ" },
                        { id: "ハイミドル", label: "ハイミドル" },
                        { id: "ミドル", label: "ミドル" },
                        { id: "ライトミドル", label: "ライトミドル" },
                        { id: "甘デジ", label: "甘デジ" },
                    ].map(chip => {
                        const active = pickerFilter === chip.id;
                        return (
                            <button
                                key={chip.id}
                                className="b"
                                onClick={() => setPickerFilter(chip.id)}
                                style={{
                                    flexShrink: 0,
                                    background: active ? C.blue : "var(--surface-hi)",
                                    color: active ? "#fff" : C.text,
                                    border: "none",
                                    borderRadius: 999,
                                    padding: "8px 16px",
                                    fontSize: 13, fontWeight: 600,
                                    fontFamily: font,
                                    cursor: "pointer",
                                    transition: "background 0.15s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {chip.label}
                            </button>
                        );
                    })}
                </div>

                {/* 並び替え */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 12px" }}>
                    <label htmlFor="machine-picker-sort" style={{ color: C.sub, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        並び替え
                    </label>
                    <select
                        id="machine-picker-sort"
                        value={pickerSort}
                        onChange={(event) => setPickerSort(event.target.value)}
                        style={{
                            width: "100%", minHeight: 40, boxSizing: "border-box",
                            background: "var(--surface-hi)", border: `1px solid ${C.borderHi}`,
                            borderRadius: 10, padding: "8px 36px 8px 12px",
                            color: C.text, fontSize: 13, fontWeight: 700, fontFamily: font,
                            outline: "none", cursor: "pointer",
                        }}
                    >
                        {MACHINE_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>

                {/* 機種リスト (スクロール) */}
                <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
                    {filteredMachines.map((m, i) => {
                        const typeColors = {
                            "スマパチ": "#f7971e",
                            "ハイミドル": "#ef473a",
                            "ミドル": "#2f6fed",
                            "ライトミドル": "#20e3b2",
                            "甘デジ": "#16a34a",
                        };
                        const iconColor = typeColors[m.type] || C.sub;
                        const iconLabel = (m.type || "").slice(0, 2);
                        return (
                            <button
                                key={m.id || `${m.name}-${i}`}
                                className="b"
                                onClick={() => {
                                    // 新形式（border1K のみ）の機種も border1K から等価スペックを逆算して反映する
                                    const spec = deriveSpecForMachine(m);
                                    const pickedYutime = createYutimeSessionFromMachine(m, {
                                        assumedStart1K: m.border1K || S.border,
                                    });
                                    if (machinePickerFor === "move") {
                                        // 台移動モーダル：即時にstateを書き換えず、移動確定時に反映するため ref に退避
                                        setMoveMachineName(m.name);
                                        setMoveYutimeTarget(null);
                                        movePickedMachineRef.current = {
                                            synthDenom: m.synthProb,
                                            spec1R: spec.spec1R,
                                            specAvgRounds: spec.specAvgRounds,
                                            specSapo: spec.specSapo,
                                            yutimeSession: pickedYutime,
                                            yutimeLowSpins: Math.max(0, Math.round(Number(moveStartRot) || 0)),
                                        };
                                    } else {
                                        if (S.requestSessionContextChange?.(["機種", "機種スペック"])) return;
                                        setSetupMachineName(m.name);
                                        S.setYutimeSession(pickedYutime);
                                        S.setYutimeDecision(null);
                                        setSetupYutimeLowSpins("");
                                        setSetupYutimeStart1K(pickedYutime?.assumedStart1K ? String(pickedYutime.assumedStart1K) : "");
                                        S.setSynthDenom(m.synthProb);
                                        if (spec.spec1R != null) S.setSpec1R(spec.spec1R);
                                        if (spec.specAvgRounds != null) S.setSpecAvgRounds(spec.specAvgRounds);
                                        if (spec.specSapo != null) S.setSpecSapo(spec.specSapo);
                                    }
                                    setShowMachinePicker(false);
                                    setMachineQuery("");
                                }}
                                style={{
                                    width: "100%",
                                    display: "flex", alignItems: "center", gap: 14,
                                    padding: "14px 16px",
                                    background: "transparent",
                                    border: "none",
                                    borderBottom: `1px solid ${C.border}`,
                                    textAlign: "left",
                                    cursor: "pointer",
                                    fontFamily: font,
                                }}
                            >
                                <div style={{
                                    width: 44, height: 44, flexShrink: 0,
                                    borderRadius: 10,
                                    background: iconColor,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#fff", fontSize: 13, fontWeight: 800,
                                    fontFamily: font,
                                }}>{iconLabel}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                                        {m.maker || ""}{m.maker && (m.prob || m.synthProb) ? "  " : ""}{m.prob || (m.synthProb ? `1/${m.synthProb}` : "")}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {filteredMachines.length === 0 && (
                        <div style={{ padding: "32px 20px 16px", textAlign: "center", color: C.sub, fontSize: 13 }}>
                            該当する機種がありません
                        </div>
                    )}
                    {/* 未登録機種の行き止まり解消: 検索語があれば「そのまま使う」導線を出す。
                        機種名だけ確定し、スペックは稼働開始モーダルの任意入力／後の機種設定で補える。 */}
                    {machineQuery.trim() && (
                        <button
                            className="b"
                            onClick={() => {
                                if (machinePickerFor === "move") {
                                    // 台移動：機種名だけ確定（スペックは直前の台の値を保持）
                                    setMoveMachineName(machineQuery.trim());
                                    setMoveYutimeTarget(null);
                                    movePickedMachineRef.current = null;
                                } else {
                                    setSetupMachineName(machineQuery.trim());
                                    S.setYutimeSession(null);
                                    S.setYutimeDecision(null);
                                    setSetupYutimeLowSpins("");
                                    setSetupYutimeStart1K("");
                                    // 未登録機種はスペック入力を促すため任意セクションを開いておく
                                    setShowSetupSpec(true);
                                }
                                setShowMachinePicker(false);
                                setMachineQuery("");
                            }}
                            style={{
                                width: "calc(100% - 32px)", margin: "8px 16px 12px",
                                minHeight: 52, borderRadius: 12,
                                background: "var(--surface-hi)",
                                border: `1px dashed ${C.borderHi}`,
                                color: C.text, fontSize: 14, fontWeight: 700, fontFamily: font,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                cursor: "pointer",
                            }}
                        >
                            <span style={{ fontSize: 18, lineHeight: 1, color: C.blue }}>+</span>
                            「{machineQuery.trim()}」を未登録のまま使う
                        </button>
                    )}
                </div>

                {/* 検索バー (下部固定) */}
                <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid ${C.border}`, background: C.surface }}>
                    <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.sub, display: "flex" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={machineQuery}
                            onChange={e => setMachineQuery(e.target.value)}
                            placeholder="機種名・メーカーで検索"
                            style={{
                                width: "100%", boxSizing: "border-box",
                                background: "var(--surface-hi)",
                                border: "none",
                                borderRadius: 12,
                                padding: "12px 14px 12px 40px",
                                fontSize: 14,
                                color: C.text,
                                fontFamily: font,
                                outline: "none",
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
