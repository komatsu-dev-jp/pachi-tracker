# Pachi-Tracker 開発申し送り

## プロジェクト概要

**Pachi-Tracker** はパチンコの稼働データを記録・分析するPWAアプリです。
回転数、投資額、大当たりデータを記録し、期待値・仕事量・ボーダー差などをリアルタイムで計算します。

### デプロイURL
- 本番環境の情報は `package.json` や設定ファイルを確認してください

---

## 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | React 19.2 |
| ビルドツール | Vite 7.3 |
| PWA | vite-plugin-pwa + Workbox |
| スタイル | CSS (カスタムプロパティ + テーマ対応) |
| 状態管理 | useState + localStorage (カスタムフック `useLS`) |

---

## ファイル構造

```
src/
├── App.jsx          # メインコンポーネント（状態管理の中心）
├── components/
│   ├── Tabs.jsx     # 各タブのUIコンポーネント（DataTab, RotTab, HistoryTab, CalendarTab, SettingsTab）
│   └── Atoms.jsx    # 再利用可能なUIコンポーネント（NI, Card, Btn, etc.）
├── logic.js         # 期待値計算エンジン（calcPreciseEV, deriveFromRows）
├── machineDB.js     # 機種データベース
├── constants.js     # 色、フォント、ユーティリティ関数
├── index.css        # グローバルスタイル
└── main.jsx         # エントリーポイント + PWA Service Worker登録
```

---

## 主要な状態変数（App.jsx）

### セッション関連
| 変数 | 説明 |
|------|------|
| `rotRows` | 回転数記録の配列（type: "start", "data", "hit"） |
| `jpLog` | 大当たりチェーン記録（v3構造: chainId, hits[], completed, summary） |
| `sesLog` | セッションログ（投資、当たりなどのイベント記録） |
| `playMode` | 現在の遊技モード（"cash", "mochi", "chodama"） |

### リアルタイム玉数
| 変数 | 説明 |
|------|------|
| `currentMochiBalls` | 現在の持ち玉数 |
| `currentChodama` | 現在の貯玉数 |
| `totalTrayBalls` | 初当たり時の上皿玉数の累計 |

### 機種スペック
| 変数 | 説明 |
|------|------|
| `spec1R` | 1ラウンド出玉 |
| `specAvgRounds` | 平均総R/初当たり |
| `specSapo` | サポ増減/初当たり |
| `border` | ボーダー（回転/K） |

---

## 最近の主な変更履歴

### 2026-03-30 (PR #66)
- **0の表示改善**: スラッシュドゼロを無効化（`font-feature-settings: "zero" 0`）
- **テンキー入力時の0クリア**: 値が「0」のみの場合、新しい数字で置き換え
- **ラウンド終了出玉の自動計算**: 直前出玉 + 液晶表示玉数
- **削除時の持ち玉減算バグ修正**: `delJPLast()` で `currentMochiBalls` と `totalTrayBalls` を正しく減算

### 以前の変更
- PR #65: サポ増減の計算から出玉を除外
- PR #64: 連チャン入力フローのUI/UX改善
- PR #63: 貸玉・交換率の未定義値でのエラー修正
- PR #62: 貸玉・交換を玉/100円単位で入力可能に
- PR #61: 確変中ラウンド振り分けとボーダーのインポート対応
- PR #60: 大当りページに単発終了機能を追加
- PR #57: PWA Service Worker追加（キャッシュ問題解決）

---

## 期待値計算エンジン（logic.js）

`calcPreciseEV()` が中心的な計算ロジックです。

### 計算の優先順位
1. **実測ベース**: `jpLog` に完了した大当たりデータがある場合
2. **機種スペックベース**: `spec1R`, `specAvgRounds` が設定されている場合
3. **フォールバック**: 手動設定の `border` を使用

### 主要な出力
- `start1K`: 1Kスタート（回転/K）
- `ev1K`: 期待値/K（円）
- `workAmount`: 仕事量（円）
- `theoreticalBorder`: 理論ボーダー
- `bDiff`: ボーダー差

---

## 大当たりデータ構造（jpLog v3）

```javascript
{
  chainId: number,        // ユニークID
  trayBalls: number,      // 初当たり時の上皿玉数
  hitRot: number,         // 初当たり時の累計回転数
  hits: [{                // 連チャン内の各当たり
    hitNumber: number,
    rounds: number,       // ラウンド数
    displayBalls: number, // 液晶表示出玉
    actualBalls: number,  // 実出玉
    lastOutBalls: number, // 連チャン追加時: ラウンド終了出玉
    nextTimingBalls: number, // 連チャン追加時: 次回ラウンド開始出玉
    sapoChange: number,   // サポ増減
  }],
  completed: boolean,     // チェーン完了フラグ
  finalBalls: number,     // 最終出玉
  summary: {              // 集計データ
    totalRounds,
    totalDisplayBalls,
    totalSapoRot,
    totalSapoChange,
    netGain,
  }
}
```

---

## 開発環境セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# リント
npm run lint
```

---

## 注意点・既知の課題

### UI/UX
- **スワイプナビゲーション**: タブ間のスワイプ切り替えが実装済み（touchイベント処理はApp.jsx）
- **テンキー**: カスタムテンキーがモーダルとして実装（Tabs.jsx内のNumericKeypad）

### データ整合性
- `delJPLast()` で大当たりを削除する際、`currentMochiBalls` と `totalTrayBalls` の減算処理が必要
- 連チャン追加時の `lastOutBalls` と `nextTimingBalls` の差分がサポ増減として計算される

### PWA
- Service Workerが `vite-plugin-pwa` で自動生成
- キャッシュ戦略: NetworkFirst（ナビゲーション）、StaleWhileRevalidate（アセット）

---

## Slackスレッド参照

直近の開発依頼は以下のSlackスレッドで確認できます：
- https://p-evidence.slack.com/archives/D0AP932U59N/p1774884574716449

---

## 連絡先

開発に関する質問は、Slackまたは該当するGitHub Issueで確認してください。

---

*最終更新: 2026-03-30*
