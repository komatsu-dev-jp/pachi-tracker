import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { awaitReady, flushAll, clearAll } from './persistence'

// Service Worker を登録（vite.config.js の registerType:'autoUpdate'）。
// 新しいデプロイを検知したら待機させずに自動でキャッシュを更新・適用する。
// これまでは更新バナーのタップ待ち（prompt方式）だったため、iOSスタンドアロン
// PWAでバナーが出ない/タップされないと旧UIが残り「変化しない」状態になっていた。
// 状態は localStorage(useLS) に永続化されるため、自動リロードでもセッションは復元される。
registerSW({
  immediate: true,
  onOfflineReady() {
    console.log('オフラインで使用できます')
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return

    // 新しい SW の有無を確認（autoUpdate のため、見つかれば自動で適用・リロードされる）
    const checkForUpdate = () => registration.update().catch(() => { /* ignore */ })

    // 起動直後に1回チェック（ブラウザ既定の24時間ルールを上書き）
    checkForUpdate()

    // 30分ごとにチェック
    setInterval(checkForUpdate, 30 * 60 * 1000)

    // バックグラウンドからの復帰時にチェック（iOSスタンドアロンPWA対策）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkForUpdate()
    })

    // ウィンドウフォーカス時にもチェック
    window.addEventListener('focus', checkForUpdate)
  }
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
