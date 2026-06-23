import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { awaitReady, flushAll, clearAll } from './persistence'

// Service Workerを登録し、新しいバージョンがあれば更新バナーを表示
// 既に表示済みのバナーを多重生成しないためのガード
let updateBannerShown = false

const showUpdateBanner = (onUpdate) => {
  if (updateBannerShown) return
  if (document.getElementById('pwa-update-banner')) return
  updateBannerShown = true

  // スライドアップ・フェードインアニメーションをheadに1回注入
  if (!document.getElementById('pwa-update-style')) {
    const style = document.createElement('style')
    style.id = 'pwa-update-style'
    style.textContent = `
      @keyframes pwa-slide-up {
        from { transform: translateY(100%); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes pwa-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `
    document.head.appendChild(style)
  }

  const dismiss = () => {
    banner.remove()
    updateBannerShown = false
  }

  const banner = document.createElement('div')
  banner.id = 'pwa-update-banner'
  banner.innerHTML = `
    <div id="pwa-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:198;animation:pwa-fade-in 0.3s ease;"></div>
    <div id="pwa-update-sheet" style="
      position:fixed;bottom:0;left:0;right:0;
      max-width:480px;margin:0 auto;
      background:var(--surface,#fff);
      border-top:1px solid var(--border,#eceef2);
      border-radius:16px 16px 0 0;
      padding:8px 20px calc(24px + 52px + env(safe-area-inset-bottom));
      z-index:199;
      animation:pwa-slide-up 0.35s cubic-bezier(0.32,0.72,0,1);
      font-family:var(--font-main,sans-serif);
    ">
      <div style="width:36px;height:4px;background:var(--border-hi,#d9dce2);border-radius:2px;margin:0 auto 20px;"></div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:4px;">
        <div style="width:48px;height:48px;flex-shrink:0;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        </div>
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text,#111827);">アップデート利用可能</div>
          <div style="font-size:12px;color:var(--sub,#8b90a0);margin-top:2px;">新しいバージョンが見つかりました</div>
        </div>
      </div>
      <button id="pwa-update-btn" style="
        display:block;width:100%;height:52px;margin-top:20px;
        background:var(--blue,#2f6fed);color:#fff;
        border:none;border-radius:14px;
        font-size:16px;font-weight:700;
        font-family:var(--font-main,sans-serif);
        cursor:pointer;
      ">今すぐ更新</button>
      <button id="pwa-dismiss-btn" style="
        display:block;width:100%;height:44px;margin-top:8px;
        background:transparent;color:var(--sub,#8b90a0);
        border:none;border-radius:14px;
        font-size:14px;font-weight:500;
        font-family:var(--font-main,sans-serif);
        cursor:pointer;
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
    console.log('オフラインで使用できます')
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return

    const triggerUpdateCheck = () => {
      // 既に waiting している SW があれば即座にバナー表示（iOSスタンドアロンで
      // updatefound イベントを取りこぼすケースの保険）
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(() => updateSW(true))
        return
      }
      registration.update().catch(() => { /* ignore */ })
    }

    // 起動直後に1回チェック（ブラウザ既定の24時間ルールを上書き）
    triggerUpdateCheck()

    // 30分ごとにチェック
    setInterval(triggerUpdateCheck, 30 * 60 * 1000)

    // バックグラウンドからの復帰時にチェック（iOSスタンドアロンPWA対策）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) triggerUpdateCheck()
    })

    // ウィンドウフォーカス時にもチェック
    window.addEventListener('focus', triggerUpdateCheck)
  },
  immediate: true
})

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#09090c', color: '#e2e8f0', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#ef4444', marginBottom: 12 }}>エラーが発生しました</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 20, textAlign: 'center' }}>{String(this.state.error)}</p>
          <button onClick={async () => { try { await clearAll(); } finally { window.location.reload(); } }} style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10,
            padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10
          }}>データをリセットして再起動</button>
          <button onClick={() => window.location.reload()} style={{
            background: '#18181f', color: '#94a3b8', border: '1px solid #2c2c3e', borderRadius: 10,
            padding: '10px 20px', fontSize: 13, cursor: 'pointer'
          }}>再読み込みのみ</button>
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
