// タップ時の触覚フィードバック（Vibration API）
// iOS Safari は Vibration API 未対応のため、対応端末（主に Android Chrome）のみ振動する。
// 未対応端末では navigator.vibrate が存在せず何も起きない（エラーにはならない）。
const TAP_TARGET_SELECTOR =
    "button, [role='button'], input[type='checkbox'], input[type='radio'], input[type='range'], select";

export function triggerHaptic(durationMs = 12) {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try {
        navigator.vibrate(durationMs);
    } catch {
        // 一部ブラウザは呼び出し自体で例外を投げる場合があるため握りつぶす
    }
}

// document 全体にタップ検知を1つだけ登録し、全ページ共通でボタン等の操作に振動を返す
export function setupGlobalHaptics() {
    if (typeof document === "undefined") return () => {};
    const handlePointerDown = (e) => {
        const target = e.target.closest && e.target.closest(TAP_TARGET_SELECTOR);
        if (!target || target.disabled) return;
        triggerHaptic(12);
    };
    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown);
}
