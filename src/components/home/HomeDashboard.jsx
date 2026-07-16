import React, { useMemo } from "react";
import {
  Bell,
  BrainCircuit,
  ChevronRight,
  Clock3,
  Info,
  ScanLine,
  Search,
  Store,
  Target,
  Users,
} from "lucide-react";
import { getActualPL, getEvAmount } from "../analysis/analysisSelectors";
import { localDateStr } from "../../constants";
import "./HomeDashboard.css";

const yen = (value, signed = false) => {
  const n = Math.round(Number(value) || 0);
  return `${signed && n >= 0 ? "+" : ""}${n.toLocaleString("ja-JP")}円`;
};

function AppMark() {
  return (
    <div className="home-brand" aria-label="P-Tracker">
      <span className="home-brand__mark">P</span>
      <span>P-Tracker</span>
    </div>
  );
}

function StoreMark() {
  return (
    <div className="home-store-logo" aria-hidden="true">
      <Store size={25} strokeWidth={2.1} />
    </div>
  );
}

function ArrowButton({ children, onClick, tone = "blue", className = "" }) {
  return (
    <button type="button" onClick={onClick} className={`home-arrow-button home-arrow-button--${tone} ${className}`}>
      <span>{children}</span>
      <ChevronRight size={17} strokeWidth={2.4} />
    </button>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="home-section-title">
      {Icon && <Icon size={17} strokeWidth={2.2} />}
      <h2>{children}</h2>
    </div>
  );
}

function BalanceCard({ balance, expected, days, winRate, onDetail }) {
  const difference = balance - expected;
  const positive = balance >= 0;
  return (
    <section className="home-card home-balance-card">
      <div className="home-card-heading">
        <div className="home-card-heading__title">
          <h2>今月の収支</h2>
          <Info size={14} />
        </div>
        <button type="button" className="home-text-link" onClick={onDetail}>
          詳細を見る <ChevronRight size={16} />
        </button>
      </div>

      <div className={`home-balance ${positive ? "is-positive" : "is-negative"}`}>{yen(balance, true)}</div>

      <div className="home-balance-stats">
        <BalanceStat label="期待値" value={yen(expected, true)} tone="green" />
        <BalanceStat label="差" value={yen(difference, true)} tone={difference >= 0 ? "green" : "red"} />
        <BalanceStat label="稼働日数" value={`${days}日`} tone="blue" />
        <BalanceStat label="勝率" value={`${winRate}%`} tone="yellow" />
      </div>
    </section>
  );
}

function BalanceStat({ label, value, tone }) {
  return (
    <div className="home-balance-stat">
      <span>{label}</span>
      <strong className={`tone-${tone}`}>{value}</strong>
      <i className={`home-stat-line tone-bg-${tone}`} />
    </div>
  );
}

function NextActionCard({ storeName, message, tags, actionLabel, onOpen }) {
  return (
    <section className="home-card home-next-card">
      <SectionTitle icon={Clock3}>次にやること</SectionTitle>
      <div className="home-next-card__body">
        <div className="home-next-icon"><Store size={28} /></div>
        <div className="home-next-copy">
          <strong>{storeName}</strong>
          <span>{message}</span>
          <div>{tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
        </div>
        <ArrowButton onClick={onOpen}>{actionLabel}</ArrowButton>
      </div>
    </section>
  );
}

function JudgmentCard({ goodCount, reviewCount, latestText, onDetail }) {
  return (
    <section className="home-card home-judgment-card">
      <SectionTitle icon={BrainCircuit}>今月の判断</SectionTitle>
      <div className="home-judgment-grid">
        <JudgmentItem
          icon={Target}
          label="良い判断"
          count={goodCount}
          tone="teal"
          onClick={onDetail}
        />
        <JudgmentItem
          icon={Search}
          label="見直し候補"
          count={reviewCount}
          tone="yellow"
          onClick={onDetail}
        />
      </div>
      <button type="button" className="home-review-row" onClick={onDetail}>
        <span><small>最新の判断記録</small><strong>{latestText}</strong></span>
        <ChevronRight size={18} />
      </button>
    </section>
  );
}

function JudgmentItem({ icon, label, count, tone, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`home-judgment home-judgment--${tone}`}>
      <span className="home-judgment__icon">{React.createElement(icon, { size: 34, strokeWidth: 1.8 })}</span>
      <span className="home-judgment__copy">
        <small>{label}</small>
        <strong>{count}<em>件</em></strong>
        <span>詳細を見る <ChevronRight size={13} /></span>
      </span>
    </button>
  );
}

// 差玉解析ステータス（独立タブにせず、ホームから起動。戦略マップ等の案内文が「ホームの差玉解析」を参照）
function DeltaStatusCard({ status, onAnalyze, onViewMap }) {
  return (
    <section className="home-card home-delta-card">
      <SectionTitle icon={ScanLine}>差玉解析</SectionTitle>
      <div className="home-delta-stats">
        <div className="home-delta-stat">
          <span>最終解析</span>
          <strong>{status.lastLabel}</strong>
        </div>
        <div className="home-delta-stat">
          <span>解析済み台数</span>
          <strong className="tone-yellow">{status.machineCount}<em>台</em></strong>
        </div>
        <div className="home-delta-stat">
          <span>状態</span>
          <strong className="home-delta-state">
            <i className={status.hasScans ? "is-on" : ""} />
            {status.stateLabel}
          </strong>
        </div>
      </div>
      <button type="button" className="home-delta-analyze" onClick={onAnalyze}>解析する</button>
      {status.hasScans && (
        <button type="button" className="home-delta-map" onClick={onViewMap}>保存した解析をマップで見る</button>
      )}
    </section>
  );
}

function ActiveStoreCard({ storeName, metrics, onOpen }) {
  return (
    <section className="home-card home-active-store">
      <div className="home-active-store__top">
        <SectionTitle icon={Users}>攻略中のホール</SectionTitle>
        <div className="home-active-state"><i />記録中 <b>{metrics.sessions}件</b></div>
      </div>
      <div className="home-active-store__main">
        <StoreMark />
        <div className="home-active-store__content">
          <strong>{storeName}</strong>
          <div className="home-store-score">
            <span>時間帯カバー <b>{metrics.coverage}%</b></span>
            <i><span style={{ width: `${metrics.coverage}%` }} /></i>
          </div>
          <div className="home-store-metrics">
            <span><small>稼働記録</small><b>{metrics.sessions}<em>回</em></b></span>
            <span><small>把握機種</small><b>{metrics.machines}<em>機種</em></b></span>
            <span><small>時間帯データ</small><b>{metrics.timeBands}<em>区分</em></b></span>
            <span><small>最終記録</small><b>{metrics.lastDate}</b></span>
          </div>
        </div>
      </div>
      <div className="home-active-store__footer">
        <span>{metrics.statusText}</span>
        <ArrowButton onClick={onOpen}>店舗を見る</ArrowButton>
      </div>
    </section>
  );
}

function RecentCard({ recent, onDetail }) {
  if (!recent) {
    return (
      <section className="home-card home-recent-card">
        <SectionTitle icon={Clock3}>直近の記録</SectionTitle>
        <div className="home-empty-state">実戦を記録すると、機種・回転率・収支がここに表示されます。</div>
      </section>
    );
  }
  const isPositive = recent.amount >= 0;
  return (
    <section className="home-card home-recent-card">
      <SectionTitle icon={Clock3}>直近の記録</SectionTitle>
      <button type="button" className="home-recent-row" onClick={onDetail}>
        <span className="home-machine-mark">P</span>
        <span className="home-recent-copy">
          <strong>{recent.machineName}</strong>
          <small>{recent.meta}</small>
          <span>回転率&nbsp; {recent.spin}<i>・</i>期待値&nbsp; <b>{yen(recent.ev, true)}</b></span>
        </span>
        <span className={`home-recent-amount ${isPositive ? "is-positive" : "is-negative"}`}>
          {yen(recent.amount, true)}
        </span>
        <ChevronRight className="home-recent-chevron" size={18} />
      </button>
    </section>
  );
}

export default function HomeDashboard({ S }) {
  const archivesRaw = S?.archives;
  const storesRaw = S?.stores;
  const selectedStoreId = S?.selectedStoreId;
  const archives = useMemo(() => Array.isArray(archivesRaw) ? archivesRaw : [], [archivesRaw]);
  const stores = useMemo(() => Array.isArray(storesRaw) ? storesRaw : [], [storesRaw]);
  const now = useMemo(() => new Date(), []);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthRecords = useMemo(
    () => archives.filter((item) => String(item?.date || "").startsWith(monthKey)),
    [archives, monthKey]
  );

  const monthSummary = useMemo(() => {
    const realRecords = monthRecords.filter((item) => getActualPL(item) != null);
    const balance = realRecords.reduce((sum, item) => sum + getActualPL(item), 0);
    const expected = monthRecords.reduce((sum, item) => sum + getEvAmount(item), 0);
    const days = new Set(monthRecords.map((item) => item?.date).filter(Boolean)).size;
    const wins = realRecords.filter((item) => getActualPL(item) > 0).length;
    return {
      balance,
      expected,
      days,
      winRate: realRecords.length ? Math.round((wins / realRecords.length) * 100) : 0,
    };
  }, [monthRecords]);

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 11) return ["おはようございます！", "今日もナイスハンティング！"];
    if (hour < 18) return ["こんにちは！", "今日もナイスハンティング！"];
    return ["おつかれさまです！", "今日もナイスハンティング！"];
  }, [now]);

  const latest = archives[archives.length - 1] || null;
  const selectedStore = useMemo(() => {
    const current = stores.find((store) => store?.id === selectedStoreId);
    return current
      || stores.find((store) => latest?.storeId != null && store?.id === latest.storeId)
      || stores.find((store) => latest?.storeName && store?.name === latest.storeName)
      || stores.find((store) => store && typeof store === "object")
      || null;
  }, [stores, selectedStoreId, latest]);

  const storeRecords = useMemo(() => {
    if (!selectedStore) return [];
    return archives.filter((record) => (
      (record?.storeId != null && record.storeId === selectedStore.id)
      || (record?.storeName && record.storeName === selectedStore.name)
    ));
  }, [archives, selectedStore]);

  const storeMetrics = useMemo(() => {
    const bands = new Set();
    for (const record of storeRecords) {
      const hour = Number.parseInt(String(record?.time || "").slice(0, 2), 10);
      if (!Number.isFinite(hour)) continue;
      bands.add(hour < 12 ? "午前" : hour < 17 ? "昼" : "夕方以降");
    }
    const machines = new Set(storeRecords.map((record) => record?.machineName).filter(Boolean)).size;
    const last = storeRecords[storeRecords.length - 1];
    const [, month, day] = String(last?.date || "").split("-").map(Number);
    const lastDate = month && day ? `${month}月${day}日` : "未記録";
    const missing = ["午前", "昼", "夕方以降"].find((band) => !bands.has(band));
    return {
      sessions: storeRecords.length,
      machines,
      timeBands: bands.size,
      coverage: Math.round((bands.size / 3) * 100),
      lastDate,
      missing,
      statusText: storeRecords.length === 0
        ? "この店舗の実戦記録はまだありません"
        : missing ? `不足：${missing}の記録` : "主要な時間帯の記録が揃っています",
    };
  }, [storeRecords]);

  const nextAction = useMemo(() => {
    if (!selectedStore) {
      return {
        storeName: "店舗が未登録です",
        message: "最初に設定画面から店舗を登録してください",
        tags: ["初期設定"],
        actionLabel: "店舗を登録",
      };
    }
    if (storeRecords.length === 0) {
      return {
        storeName: selectedStore.name || "登録店舗",
        message: "最初の実戦を記録すると店舗分析が始まります",
        tags: ["実戦記録"],
        actionLabel: "店舗を見る",
      };
    }
    const bandTimes = { "午前": "開店〜12時", "昼": "12〜17時", "夕方以降": "17時以降" };
    return storeMetrics.missing ? {
      storeName: selectedStore.name || "登録店舗",
      message: `${storeMetrics.missing}の記録がまだありません`,
      tags: [storeMetrics.missing, bandTimes[storeMetrics.missing]],
      actionLabel: "店舗を見る",
    } : {
      storeName: selectedStore.name || "登録店舗",
      message: "主要な時間帯の記録が揃っています",
      tags: ["記録済み"],
      actionLabel: "店舗を見る",
    };
  }, [selectedStore, storeRecords.length, storeMetrics.missing]);

  const judgmentSummary = useMemo(() => {
    const snapshots = monthRecords.flatMap((record) => (
      Array.isArray(record?.decisionSnapshots) ? record.decisionSnapshots : []
    ));
    const goodActions = new Set(["continue", "continue_strong"]);
    const reviewActions = new Set(["stop_candidate", "compare", "stop"]);
    const latestSnapshot = snapshots[snapshots.length - 1];
    return {
      goodCount: snapshots.filter((item) => goodActions.has(item?.action)).length,
      reviewCount: snapshots.filter((item) => reviewActions.has(item?.action)).length,
      latestText: latestSnapshot?.reason || "判断チェックポイント到達後に記録されます",
    };
  }, [monthRecords]);

  const latestPL = latest ? getActualPL(latest) : null;
  const latestSpinRate = (() => {
    // 現行データは物理回転率を優先。旧記録だけ実質回転率へフォールバックする。
    const physical = Number(latest?.stats?.start1K);
    if (physical > 0) return physical;
    const effective = Number(latest?.stats?.effectiveStart1K);
    return effective > 0 ? effective : null;
  })();
  const playMinutes = Math.max(0, Number(latest?.playMinutes) || 0);
  const recent = latest ? {
    machineName: latest.machineName || "機種名未設定",
    meta: [latest.date === localDateStr() ? "今日" : "前回", playMinutes > 0 ? `${(playMinutes / 60).toFixed(1)}時間` : null].filter(Boolean).join(" ・ "),
    spin: latestSpinRate != null ? `${latestSpinRate.toFixed(1)} /k` : "-- /k",
    ev: getEvAmount(latest),
    amount: latestPL ?? getEvAmount(latest),
  } : null;

  // 差玉解析ステータス（保存済みスキャン pt_deltaScans から導出）
  const todayStr = localDateStr();
  const deltaScansRaw = S?.deltaScans;
  const deltaStatus = useMemo(() => {
    const scans = Array.isArray(deltaScansRaw) ? deltaScansRaw : [];
    if (scans.length === 0) {
      return { hasScans: false, lastLabel: "—", machineCount: 0, stateLabel: "未解析" };
    }
    const sorted = [...scans].sort((a, b) =>
      String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""))
    );
    const last = sorted[0];
    const machineCount = scans.reduce((s, sc) => s + (Array.isArray(sc?.rows) ? sc.rows.length : 0), 0);
    // 日時ラベル: 今日は時刻、それ以外は M/D
    let lastLabel = "—";
    const created = String(last?.createdAt || "");
    const day = String(last?.date || created.slice(0, 10));
    if (day === todayStr) {
      lastLabel = created.length >= 16
        ? `本日 ${new Date(created).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
        : "本日";
    } else if (day.length >= 10) {
      lastLabel = `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
    }
    return { hasScans: true, lastLabel, machineCount, stateLabel: "解析済み" };
  }, [deltaScansRaw, todayStr]);

  const goAnalysis = () => S?.setTab?.("calendar");
  const goStore = () => {
    if (!selectedStore) {
      S?.setTab?.("settings");
      return;
    }
    S?.setSelectedStoreId?.(selectedStore.id);
    if (S?.openStoreDetail) S.openStoreDetail(selectedStore.id);
    else S?.setTab?.("storeDetail");
  };
  const goDelta = () => S?.setTab?.("delta");
  const goDeltaMap = () => S?.setTab?.("deltaMap");
  const unread = Array.isArray(S?.notificationLog) && S.notificationLog.some((item) => !item?.read);

  return (
    <div className="home-dashboard">
      <header className="home-header">
        <div className="home-header__top">
          <AppMark />
          <button type="button" aria-label="通知を見る" className="home-bell" onClick={S?.openNotificationPanel}>
            <Bell size={22} />
            {unread && <i />}
          </button>
        </div>
        <h1>{greeting[0]}</h1>
        <p>{greeting[1]}</p>
      </header>

      <BalanceCard {...monthSummary} onDetail={goAnalysis} />
      <NextActionCard {...nextAction} onOpen={goStore} />
      {/* 差玉解析ステータス（独立タブにせず、ここから起動） */}
      <DeltaStatusCard status={deltaStatus} onAnalyze={goDelta} onViewMap={goDeltaMap} />
      <JudgmentCard {...judgmentSummary} onDetail={goAnalysis} />
      {selectedStore && <ActiveStoreCard storeName={selectedStore.name || "登録店舗"} metrics={storeMetrics} onOpen={goStore} />}
      <RecentCard recent={recent} onDetail={goAnalysis} />
    </div>
  );
}
