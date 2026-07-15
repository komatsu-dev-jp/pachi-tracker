import React, { useMemo } from "react";
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  ChevronRight,
  Clock3,
  Info,
  Search,
  Store,
  Target,
  Users,
} from "lucide-react";
import { getActualPL, getEvAmount } from "../analysis/analysisSelectors";
import { localDateStr } from "../../constants";
import "./HomeDashboard.css";

const DEMO = {
  balance: 48500,
  ev: 31200,
  days: 6,
  wins: 4,
  storeName: "マルハン空港通店",
  machineName: "P大海物語5 MTE2",
  recentAmount: -4000,
};

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

function MaruhanMark() {
  return (
    <div className="home-store-logo" aria-hidden="true">
      <div className="home-store-logo__m"><span /></div>
      <small>MARUHAN</small>
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

function NextActionCard({ storeName, onOpen }) {
  return (
    <section className="home-card home-next-card">
      <SectionTitle icon={Clock3}>次にやること</SectionTitle>
      <div className="home-next-card__body">
        <div className="home-next-icon"><Store size={28} /></div>
        <div className="home-next-copy">
          <strong>{storeName}</strong>
          <span>夕方帯の記録が不足しています</span>
          <div><em>夕方帯</em><em>17–19時</em></div>
        </div>
        <ArrowButton onClick={onOpen}>店舗を見る</ArrowButton>
      </div>
    </section>
  );
}

function JudgmentCard({ onDetail }) {
  return (
    <section className="home-card home-judgment-card">
      <SectionTitle icon={BrainCircuit}>今月の判断</SectionTitle>
      <div className="home-judgment-grid">
        <JudgmentItem
          icon={Target}
          label="良い判断"
          count={8}
          tone="teal"
          onClick={onDetail}
        />
        <JudgmentItem
          icon={Search}
          label="見直し候補"
          count={2}
          tone="yellow"
          onClick={onDetail}
        />
      </div>
      <button type="button" className="home-review-row" onClick={onDetail}>
        <span><small>前回の見直し</small><strong>回転率低下後も42回転継続しています</strong></span>
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

function ActiveStoreCard({ storeName, onOpen }) {
  return (
    <section className="home-card home-active-store">
      <div className="home-active-store__top">
        <SectionTitle icon={Users}>攻略中のホール</SectionTitle>
        <div className="home-active-state"><i />分析中 <b>Lv.4</b></div>
      </div>
      <div className="home-active-store__main">
        <MaruhanMark />
        <div className="home-active-store__content">
          <strong>{storeName}</strong>
          <div className="home-store-score">
            <span>店舗分析度 <b>78%</b></span>
            <i><span /></i>
          </div>
          <div className="home-store-metrics">
            <span><small>稼働記録</small><b>12<em>回</em></b></span>
            <span><small>把握機種</small><b>8<em>機種</em></b></span>
            <span><small>時間帯データ</small><b>3<em>区分</em></b></span>
            <span><small>最終記録</small><b>7月8日</b></span>
          </div>
        </div>
      </div>
      <div className="home-active-store__footer">
        <span><AlertTriangle size={16} />不足：夕方帯の記録</span>
        <ArrowButton onClick={onOpen}>店舗を見る</ArrowButton>
      </div>
    </section>
  );
}

function RecentCard({ recent, onDetail }) {
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
    if (monthRecords.length === 0) {
      return { balance: DEMO.balance, expected: DEMO.ev, days: DEMO.days, winRate: 66 };
    }
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

  const selectedStore = useMemo(() => {
    const current = stores.find((store) => store?.id === selectedStoreId);
    return (String(current?.name || "").includes("マルハン空港通") ? current : null)
      || stores.find((store) => String(store?.name || "").includes("マルハン空港通"))
      || null;
  }, [stores, selectedStoreId]);

  const storeName = selectedStore?.name || DEMO.storeName;
  const latest = archives[archives.length - 1];
  const latestPL = latest ? getActualPL(latest) : null;
  // 回転率（1Kスタート）: 上皿補正後を優先し、無ければ生値。総回転数(netRot)とは別物なので混同しない。
  const latestSpinRate = (() => {
    const eff = Number(latest?.stats?.effectiveStart1K);
    if (eff > 0) return eff;
    const raw = Number(latest?.stats?.start1K);
    return raw > 0 ? raw : null;
  })();
  const recent = latest ? {
    machineName: latest.machineName || DEMO.machineName,
    meta: `${latest.date === localDateStr() ? "今日" : "前回"} ・ ${Math.max(0, Number(latest?.playMinutes) || 0) / 60 || 0.2}時間`,
    spin: latestSpinRate != null ? `${latestSpinRate.toFixed(1)} /k` : "-- /k",
    ev: getEvAmount(latest),
    amount: latestPL ?? getEvAmount(latest),
  } : {
    machineName: DEMO.machineName,
    meta: "昨日 ・ 0.2時間",
    spin: "19.2 /k",
    ev: -2300,
    amount: DEMO.recentAmount,
  };

  const goAnalysis = () => S?.setTab?.("calendar");
  const goStore = () => S?.setTab?.("storeDetail");
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
      <NextActionCard storeName={storeName} onOpen={goStore} />
      <JudgmentCard onDetail={goAnalysis} />
      <ActiveStoreCard storeName={storeName} onOpen={goStore} />
      <RecentCard recent={recent} onDetail={goAnalysis} />
    </div>
  );
}
