import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { awaitReady, flushAll, clearAll } from './persistence'

// autoUpdate: 新しい SW が見つかると自動で skipWaiting → アクティブ化 → ページ自動リロードで最新版を適用。
// ユーザーがボタンを押す必要はない。
//
// iOS スタンドアロン PWA でのキャッシュ固着対策として、更新検知を多重化している:
//  1. 起動時・復帰時・フォーカス時・30分ごとに registration.update() で新SWを取りに行く
//  2. waiting 状態の新SWを見つけたら即 skipWaiting を要求
//  3. controllerchange（新SWが制御を奪った瞬間）で必ず一度だけ自動リロード
//     → これで新しいアセット(HTML/JS/CSS)を確実に読み込み直す

// 新SWがページ制御を取得したら一度だけリロード（多重リロード防止ガード付き）
if ('serviceWorker' in navigator) {
  let hasReloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloaded) return
    hasReloaded = true
    sessionStorage.setItem('pwa-just-updated', '1')
    window.location.reload()
  })
}

const updateSW = registerSW({
  onNeedRefresh() {
    // 新しいバージョンが待機状態。skipWaiting を要求 → controllerchange で自動リロードされる
    updateSW(true)
  },
  onOfflineReady() {
    // オフラインキャッシュ準備完了（ログのみ）
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return

    const check = () => {
      // waiting SW があれば即時適用（iOS で updatefound を取りこぼすケースの保険）
      if (registration.waiting) {
        updateSW(true)
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

// リロード後に「更新しました」トーストを一時表示
if (sessionStorage.getItem('pwa-just-updated')) {
  sessionStorage.removeItem('pwa-just-updated')
  const s = document.createElement('style')
  s.textContent = '@keyframes _pwa_in{from{opacity:0;transform:translateX(-50%) translateY(-6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}'
  document.head.appendChild(s)
  const t = document.createElement('div')
  t.textContent = '✓ アプリを最新版に更新しました'
  t.style.cssText = [
    'position:fixed',
    'top:calc(max(env(safe-area-inset-top), 56px) + 14px)',
    'left:50%',
    'transform:translateX(-50%)',
    'background:#1a6fda',
    'color:#fff',
    'font-size:13px',
    'font-weight:700',
    'padding:9px 18px',
    'border-radius:100px',
    'z-index:9999',
    'white-space:nowrap',
    'pointer-events:none',
    'animation:_pwa_in .3s ease both',
  ].join(';')
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}

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
