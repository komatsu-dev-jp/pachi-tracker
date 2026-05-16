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

  const banner = document.createElement('div')
  banner.id = 'pwa-update-banner'
  // iOS standalone のステータスバー領域に被らないよう safe-area-inset-top を確保
  banner.innerHTML = `
    <div style="position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;padding:calc(12px + env(safe-area-inset-top)) 16px 12px;display:flex;justify-content:space-between;align-items:center;z-index:9999;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
      <span style="font-size:13px;font-weight:600;">新しいバージョンが利用可能です</span>
      <button id="pwa-update-btn" style="background:#fff;color:#3b82f6;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;">更新</button>
    </div>
  `
  document.body.appendChild(banner)
  document.getElementById('pwa-update-btn').onclick = () => {
    banner.remove()
    onUpdate()
  }
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
