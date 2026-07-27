import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { awaitReady, flushAll, clearAll } from './persistence'
import { exportFullBackup } from './backupDownload'

// Service Worker を登録し、新しいバージョンがあれば更新バナー（ボトムシート）を表示する。
// ユーザーが「今すぐ更新」を押すと skipWaiting → リロードで最新版を適用。
// 多重生成を防ぐためのガード。
let updateBannerShown = false

const showUpdateBanner = (onUpdate) => {
  if (updateBannerShown) return
  if (document.getElementById('pwa-update-banner')) return
  updateBannerShown = true

  // スライドアップ・フェードインアニメーションを head に1回注入
  if (!document.getElementById('pwa-update-style')) {
    const style = document.createElement('style')
    style.id = 'pwa-update-style'
    style.textContent = `
      @keyframes pwa-slide-up {
        from { transform: translateY(100%); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes pwa-fade-in { from { opacity: 0; } to { opacity: 1; } }
    `
    document.head.appendChild(style)
  }

  const dismiss = () => {
    banner.remove()
    updateBannerShown = false
  }

  // アプリ本体のCSS変数を使い、ライト・ダークどちらのテーマにも合わせる。
  const banner = document.createElement('div')
  banner.id = 'pwa-update-banner'
  banner.innerHTML = `
    <div id="pwa-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;animation:pwa-fade-in 0.3s ease;"></div>
    <div id="pwa-update-sheet" style="
      position:fixed;bottom:0;left:0;right:0;
      max-width:480px;margin:0 auto;
      background:var(--surface);
      color:var(--text);
      border-top:1px solid var(--border);
      border-radius:18px 18px 0 0;
      padding:10px 20px calc(24px + env(safe-area-inset-bottom));
      z-index:9999;
      animation:pwa-slide-up 0.35s cubic-bezier(0.32,0.72,0,1);
      font-family:sans-serif;
      box-shadow:0 -12px 36px rgba(0,0,0,0.18);
    ">
      <div style="width:36px;height:4px;background:var(--border-hi);border-radius:2px;margin:0 auto 20px;"></div>
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:48px;height:48px;flex-shrink:0;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--purple));display:flex;align-items:center;justify-content:center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        </div>
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text);">アップデートがあります</div>
          <div style="font-size:12px;color:var(--sub);margin-top:2px;">新しいバージョンが見つかりました</div>
        </div>
      </div>
      <button id="pwa-update-btn" style="
        display:block;width:100%;height:52px;margin-top:20px;
        background:var(--blue);color:#fff;border:none;border-radius:14px;
        font-size:16px;font-weight:800;font-family:sans-serif;cursor:pointer;
      ">今すぐ更新</button>
      <button id="pwa-dismiss-btn" style="
        display:block;width:100%;height:44px;margin-top:8px;
        background:transparent;color:var(--sub-hi);border:none;border-radius:14px;
        font-size:14px;font-weight:600;font-family:sans-serif;cursor:pointer;
      ">後で</button>
    </div>
  `
  document.body.appendChild(banner)

  document.getElementById('pwa-update-btn').onclick = () => {
    banner.remove()
    onUpdate()
  }
  document.getElementById('pwa-dismiss-btn').onclick = dismiss
  document.getElementById('pwa-overlay').onclick = dismiss
}

const updateSW = registerSW({
  onNeedRefresh() {
    showUpdateBanner(() => updateSW(true))
  },
  onOfflineReady() {
    // オフラインキャッシュ準備完了（ログのみ）
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return

    const check = () => {
      // waiting 状態の新SWがあればバナー表示（iOS で updatefound を取りこぼすケースの保険）。
      // navigator.serviceWorker.controller は条件にしない（スタンドアロンPWAで null になり
      // バナーが出ない不具合の原因だったため）。
      if (registration.waiting) {
        showUpdateBanner(() => updateSW(true))
        return
      }
      registration.update().catch(() => {})
    }

    check()
    setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
    window.addEventListener('focus', check)
    // iOS BFCache（ホーム画面 PWA をバックグラウンドから復帰させたとき）
    window.addEventListener('pageshow', (e) => { if (e.persisted) check() })
  },
  immediate: true,
})

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      confirmReset: false,
      busy: false,
      recoveryMessage: "",
    };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  exportBackup = async () => {
    this.setState({ busy: true, recoveryMessage: "" });
    try {
      await exportFullBackup();
      this.setState({ recoveryMessage: "バックアップを書き出しました。保存を確認してからリセットできます。" });
      return true;
    } catch (error) {
      this.setState({ recoveryMessage: `バックアップに失敗しました: ${error?.message || "不明なエラー"}` });
      return false;
    } finally {
      this.setState({ busy: false });
    }
  };
  resetAllData = async ({ backupFirst = false } = {}) => {
    this.setState({ busy: true, recoveryMessage: "" });
    try {
      if (backupFirst) {
        const exported = await this.exportBackup();
        if (!exported) return;
        this.setState({ busy: true });
      }
      await clearAll();
      window.location.reload();
    } catch (error) {
      this.setState({
        busy: false,
        recoveryMessage: `リセットに失敗しました: ${error?.message || "不明なエラー"}`,
      });
    }
  };
  render() {
    if (this.state.hasError) {
      const { busy, confirmReset, recoveryMessage } = this.state;
      return (
        <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'sans-serif' }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 20, boxSizing: 'border-box' }}>
            <h2 style={{ color: 'var(--red)', margin: '0 0 12px' }}>エラーが発生しました</h2>
            <p style={{ color: 'var(--sub)', fontSize: 13, margin: '0 0 18px', lineHeight: 1.7, overflowWrap: 'anywhere' }}>{String(this.state.error)}</p>
            {!confirmReset ? (
              <>
                <button disabled={busy} onClick={() => window.location.reload()} style={{
                  width: '100%', minHeight: 50, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 12,
                  padding: '12px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', marginBottom: 10
                }}>データを残して再読み込み</button>
                <button disabled={busy} onClick={this.exportBackup} style={{
                  width: '100%', minHeight: 46, background: 'var(--surface-hi)', color: 'var(--text)', border: '1px solid var(--border-hi)', borderRadius: 12,
                  padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 10
                }}>{busy ? '処理中…' : '先にバックアップを書き出す'}</button>
                <button disabled={busy} onClick={() => this.setState({ confirmReset: true, recoveryMessage: "" })} style={{
                  width: '100%', minHeight: 44, background: 'transparent', color: 'var(--red)', border: 'none', borderRadius: 12,
                  padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}>最終手段としてデータをリセット</button>
              </>
            ) : (
              <>
                <div style={{ padding: 12, marginBottom: 12, borderRadius: 12, background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 45%, transparent)', color: 'var(--text)', fontSize: 12, lineHeight: 1.7 }}>
                  全実戦記録・設定・保存済み履歴が削除され、元に戻せません。バックアップを書き出してからのリセットを推奨します。
                </div>
                <button disabled={busy} onClick={() => this.resetAllData({ backupFirst: true })} style={{
                  width: '100%', minHeight: 50, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 12,
                  padding: '12px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', marginBottom: 10
                }}>{busy ? '処理中…' : 'バックアップしてからリセット'}</button>
                <button disabled={busy} onClick={() => this.resetAllData()} style={{
                  width: '100%', minHeight: 46, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 12,
                  padding: '10px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginBottom: 8
                }}>バックアップせず全データを削除</button>
                <button disabled={busy} onClick={() => this.setState({ confirmReset: false, recoveryMessage: "" })} style={{
                  width: '100%', minHeight: 42, background: 'transparent', color: 'var(--sub-hi)', border: 'none', borderRadius: 12,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer'
                }}>戻る</button>
              </>
            )}
            {recoveryMessage && (
              <div role="status" style={{ marginTop: 12, color: recoveryMessage.includes('失敗') ? 'var(--red)' : 'var(--green)', fontSize: 11, lineHeight: 1.6 }}>
                {recoveryMessage}
              </div>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 永続化レイヤーのブートを待ってからアプリをマウント。
// useLS の同期初期値取得契約を満たすため、IDB → memCache のロードを完了させる必要がある。
awaitReady().then(() => {
  // ライフサイクル: バックグラウンド送り / 終了直前に保留中の書き込みを確実に flush
  const flushSafely = () => { flushAll().catch(() => {}); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSafely();
  });
  window.addEventListener('pagehide', flushSafely);

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
})
