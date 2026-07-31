export default function SessionScheduleEditor({
  showScheduleEditor,
  ReactDOM,
  setShowScheduleEditor,
  C,
  scheduleTargetTime,
  setScheduleTargetTime,
  setScheduleEditorError,
  mono,
  scheduleClosingTime,
  setScheduleClosingTime,
  scheduleEditorError,
  font,
  saveScheduleEditor,
}) {
  return showScheduleEditor && ReactDOM.createPortal(
                    <div
                        role="presentation"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) setShowScheduleEditor(false);
                        }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 2400,
                            background: "rgba(0,0,0,0.72)",
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "center",
                        }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="予定時間の変更"
                            style={{
                                width: "100%",
                                maxWidth: 430,
                                boxSizing: "border-box",
                                borderRadius: "22px 22px 0 0",
                                border: `1px solid ${C.borderHi}`,
                                borderBottom: "none",
                                background: C.surface,
                                padding: "10px 16px calc(18px + env(safe-area-inset-bottom))",
                                boxShadow: "0 -18px 45px rgba(0,0,0,0.45)",
                            }}
                        >
                            <div aria-hidden="true" style={{ width: 38, height: 4, borderRadius: 99, background: C.borderHi, margin: "0 auto 14px" }} />
                            <div style={{ fontSize: 17, fontWeight: 900, color: C.text }}>予定時間を変更</div>
                            <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.55, color: C.sub }}>
                                時刻欄をタップすると、iPhoneでは端末標準のリール型時間選択が開きます。
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                                <label style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", marginBottom: 6, fontSize: 10, fontWeight: 800, color: C.subHi }}>終了予定時刻</span>
                                    <input
                                        aria-label="変更後の終了予定時刻"
                                        type="time"
                                        step="300"
                                        value={scheduleTargetTime}
                                        onChange={(e) => {
                                            setScheduleTargetTime(e.target.value);
                                            setScheduleEditorError("");
                                        }}
                                        style={{ width: "100%", minWidth: 0, minHeight: 52, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.borderHi}`, background: C.bg, color: C.text, padding: "8px 10px", fontSize: 20, fontWeight: 800, fontFamily: mono }}
                                    />
                                </label>
                                <label style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", marginBottom: 6, fontSize: 10, fontWeight: 800, color: C.subHi }}>店舗の閉店時刻</span>
                                    <input
                                        aria-label="変更後の店舗閉店時刻"
                                        type="time"
                                        step="300"
                                        value={scheduleClosingTime}
                                        onChange={(e) => {
                                            setScheduleClosingTime(e.target.value);
                                            setScheduleEditorError("");
                                        }}
                                        style={{ width: "100%", minWidth: 0, minHeight: 52, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.borderHi}`, background: C.bg, color: C.text, padding: "8px 10px", fontSize: 20, fontWeight: 800, fontFamily: mono }}
                                    />
                                </label>
                            </div>
                            {scheduleEditorError && (
                                <div role="alert" style={{ marginTop: 10, color: C.red, fontSize: 11, lineHeight: 1.5 }}>
                                    {scheduleEditorError}
                                </div>
                            )}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                                <button type="button" onClick={() => setShowScheduleEditor(false)} style={{ minHeight: 48, borderRadius: 12, border: `1px solid ${C.borderHi}`, background: C.surfaceHi, color: C.text, fontSize: 14, fontWeight: 800, fontFamily: font }}>キャンセル</button>
                                <button type="button" onClick={saveScheduleEditor} style={{ minHeight: 48, borderRadius: 12, border: "none", background: C.blue, color: "#fff", fontSize: 14, fontWeight: 900, fontFamily: font }}>この時刻で保存</button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                );
}
