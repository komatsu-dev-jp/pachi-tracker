import { useEffect, useRef, useState } from "react";
import {
  createPairingResponse,
  downloadPairingResponse,
  getPushInboxSummary,
  isHomeScreenPwa,
  parsePairingRequestText,
  savePairingResponseFile,
  sharePairingResponse,
  subscribeFromPairingRequest,
  unsubscribeFromPush,
} from "../pushInbox.js";

const panel = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 14,
  background: "var(--surface)",
};

const button = {
  border: "1px solid var(--border-hi)",
  borderRadius: 10,
  minHeight: 44,
  padding: "10px 14px",
  background: "var(--surface-hi)",
  color: "var(--text)",
  fontWeight: 700,
  cursor: "pointer",
};

export default function PushSyncSettings({ requestConfirmation }) {
  const inputRef = useRef(null);
  const [request, setRequest] = useState(null);
  const [response, setResponse] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const standalone = isHomeScreenPwa();
  const supported = typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;

  useEffect(() => {
    let active = true;
    if (!supported) return undefined;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setSubscribed(Boolean(subscription));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [supported]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getPushInboxSummary()
        .then((nextSummary) => {
          if (active) setSummary(nextSummary);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener("pachi:push-import-summary", refresh);
    return () => {
      active = false;
      window.removeEventListener("pachi:push-import-summary", refresh);
    };
  }, []);

  const loadRequest = async (file) => {
    setError("");
    setMessage("");
    setResponse(null);
    try {
      if (!file || (!file.name.toLowerCase().endsWith(".pachipair")
        && file.type !== "application/json")) {
        throw new Error("Windowsで作成した.pachipairファイルを選んでください");
      }
      const parsed = parsePairingRequestText(await file.text());
      setRequest(parsed);
      setMessage(`${parsed.senderLabel || "Windows"}からの連携リクエストを読み込みました`);
    } catch (nextError) {
      setRequest(null);
      setError(nextError?.message || "連携ファイルを読み取れませんでした");
    }
  };

  const pair = async () => {
    if (!request || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const subscription = await subscribeFromPairingRequest(request);
      const registration = await navigator.serviceWorker.ready;
      const nextResponse = createPairingResponse(request, subscription, {
        scope: registration.scope,
      });
      setResponse(nextResponse);
      setSubscribed(true);
      setMessage("連携できました。次に応答ファイルをWindowsへ返してください。");
    } catch (nextError) {
      setError(nextError?.message || "Windowsとの連携に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runExport = async (operation, successMessage) => {
    if (!response || busy) return;
    setBusy(true);
    setError("");
    try {
      await operation(response);
      setMessage(successMessage);
    } catch (nextError) {
      if (nextError?.name !== "AbortError") {
        setError(nextError?.message || "応答ファイルを書き出せませんでした");
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || !subscribed) return;
    const confirmed = await requestConfirmation?.({
      title: "WindowsとのPush連携を解除しますか？",
      message: "受信済みデータは削除されません。再び受信するには、Windowsとの連携をやり直す必要があります。",
      confirmLabel: "連携を解除する",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      setRequest(null);
      setResponse(null);
      setMessage("Push連携を解除しました。受信済みデータは残っています。");
    } catch (nextError) {
      setError(nextError?.message || "連携を解除できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={panel} aria-labelledby="push-sync-title">
      <h3 id="push-sync-title" style={{ margin: 0, fontSize: 15, color: "var(--text)" }}>
        Windows自動解析との連携
      </h3>
      <p style={{ margin: "8px 0 12px", fontSize: 12, lineHeight: 1.7, color: "var(--sub-hi)" }}>
        Windowsで作成した連携ファイルを読み込みます。画像は送らず、解析済みの数字だけを受信します。
        受信データは確認用の受信箱へ入り、既存記録を直接上書きしません。
      </p>
      {summary && (
        <div
          aria-label="Push受信箱の状態"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {[
            ["自動登録", summary.imported],
            ["既存と重複", summary.duplicate],
            ["保留", summary.pending + summary.review],
            ["安全のため拒否", summary.rejected + summary.error],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: "8px 10px",
                color: "var(--sub-hi)",
                fontSize: 11,
              }}
            >
              {label}: <strong style={{ color: "var(--text)" }}>{value}件</strong>
            </div>
          ))}
        </div>
      )}

      {!supported && (
        <div role="alert" style={{ color: "var(--red)", fontSize: 12, lineHeight: 1.6 }}>
          この端末またはブラウザはWeb Pushに対応していません。
        </div>
      )}
      {supported && !standalone && (
        <div role="alert" style={{ color: "var(--orange)", fontSize: 12, lineHeight: 1.6 }}>
          iPhoneでは、先にSafariの共有ボタンから「ホーム画面に追加」し、ホーム画面のパチトラッカーを開いてください。
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pachipair,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) loadRequest(file);
          event.target.value = "";
        }}
      />

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          style={button}
          disabled={!supported || busy}
          onClick={() => inputRef.current?.click()}
        >
          1. Windowsの.pachipairを選ぶ
        </button>
        <button
          type="button"
          style={{ ...button, background: "var(--blue)", color: "#fff", borderColor: "var(--blue)" }}
          disabled={!request || !supported || !standalone || busy}
          onClick={pair}
        >
          {busy ? "処理中…" : "2. 通知を許可して連携する"}
        </button>
      </div>

      {request && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--sub-hi)" }}>
          連携先: {request.senderLabel || request.pairingId}
        </div>
      )}

      {response && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
            3. 応答ファイルをWindowsへ返す
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <button
              type="button"
              style={button}
              disabled={busy}
              onClick={() => runExport(sharePairingResponse, "共有画面へ応答ファイルを渡しました")}
            >
              共有する
            </button>
            <button
              type="button"
              style={button}
              disabled={busy}
              onClick={() => runExport(savePairingResponseFile, "応答ファイルを保存しました")}
            >
              保存先を選ぶ
            </button>
            <button
              type="button"
              style={{ ...button, gridColumn: "1 / -1" }}
              disabled={busy}
              onClick={() => runExport(
                async (value) => downloadPairingResponse(value),
                "応答ファイルをダウンロードしました",
              )}
            >
              ダウンロード
            </button>
          </div>
        </div>
      )}

      {message && (
        <div role="status" style={{ marginTop: 10, color: "var(--green)", fontSize: 12, lineHeight: 1.6 }}>
          {message}
        </div>
      )}
      {error && (
        <div role="alert" style={{ marginTop: 10, color: "var(--red)", fontSize: 12, lineHeight: 1.6 }}>
          {error}
        </div>
      )}

      {subscribed && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              window.dispatchEvent(new Event("pachi:process-push-inbox"));
              setMessage("受信箱を再確認しています。曖昧なデータは登録しません。");
            }}
            style={{ ...button, width: "100%", marginTop: 14 }}
          >
            保留中の受信データを再確認
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={disconnect}
            style={{
              marginTop: 14,
              border: "none",
              background: "transparent",
              color: "var(--red)",
              fontSize: 11,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            WindowsとのPush連携を解除
          </button>
        </>
      )}
    </section>
  );
}
