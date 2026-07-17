import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  ChevronRight,
  Clock3,
  Info,
  Pencil,
  Play,
  ScanLine,
  Search,
  Sparkles,
  Store,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getActualPL, getEvAmount } from "../analysis/analysisSelectors";
import { localDateStr } from "../../constants";
import {
  buildDeltaStatus,
  buildMonthOverview,
  getNextAction,
  latestArchive,
} from "./homeDashboardModel";
import "./HomeDashboard.css";

const yen = (value, signed = false) => {
  const n = Math.round(Number(value) || 0);
  return `${signed && n >= 0 ? "+" : ""}${n.toLocaleString("ja-JP")}円`;
};

const compactYen = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 10000) return `${Math.round(n / 10000)}万`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}千`;
  return String(Math.round(n));
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
      <Store size={24} strokeWidth={2.1} />
    </div>
  );
}

function ArrowButton({ children, onClick, className = "" }) {
  return (
    <button type="button" onClick={onClick} className={`home-arrow-button ${className}`}>
      <span>{children}</span>
      <ChevronRight size={17} strokeWidth={2.4} />
    </button>
  );
}

function SectionTitle({ icon: Icon, children, aside }) {
  return (
    <div className="home-section-title-row">
      <div className="home-section-title">
        {Icon && <Icon size={17} strokeWidth={2.2} />}
        <h2>{children}</h2>
      </div>
      {aside}
    </div>
  );
}

function MonthGoalCard({ overview, onEdit, onDetail }) {
  const progressWidth = Math.min(100, Math.max(0, overview.progress));
  const varianceLabel = overview.variance >= 0 ? "期待値より上振れ" : "期待値より下振れ";
  const varianceTone = overview.variance >= 0 ? "is-positive" : "is-negative";

  return (
    <section className={`home-card home-goal-card ${overview.achieved ? "is-achieved" : ""}`}>
      <div className="home-card-heading">
        <div className="home-card-heading__title">
          <Target size={17} />
          <h2>今月の期待値目標</h2>
        </div>
        <button type="button" className="home-target-edit" onClick={onEdit} aria-label="月間期待値目標を編集">
          <Pencil size={12} /> 目標 {yen(overview.target)}
        </button>
      </div>

      <div className="home-goal-summary">
        <div>
          <span>累計期待値</span>
          <strong className={overview.expected >= 0 ? "is-positive" : "is-negative"}>{yen(overview.expected, true)}</strong>
        </div>
        <div className="home-goal-rate">
          <span>達成率</span>
          <strong>{overview.progress}%</strong>
        </div>
      </div>

      <div className="home-progress" aria-label={`月間目標の達成率 ${overview.progress}%`}>
        <i style={{ width: `${progressWidth}%` }} />
      </div>
      <div className="home-progress-copy">
        {overview.achieved ? (
          <strong><Sparkles size={13} /> 今月の目標を達成しました</strong>
        ) : overview.target > 0 ? (
          <span>目標まであと <b>{yen(overview.remaining)}</b></span>
        ) : (
          <span>目標を設定すると進み具合を確認できます</span>
        )}
      </div>

      <div className="home-chart-heading">
        <span>期待値の積み上げ</span>
        <div className="home-chart-legend">
          <i className="is-ev" />累計期待値 <i className="is-target" />目標ペース
        </div>
      </div>
      <div className="home-goal-chart" aria-label="今月の累計期待値と目標ペースのグラフ">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={116} initialDimension={{ width: 340, height: 128 }}>
          <LineChart data={overview.chartData} margin={{ top: 6, right: 3, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              interval={6}
              tick={{ fill: "var(--sub-hi)", fontSize: 8 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}日`}
            />
            <YAxis
              width={35}
              tick={{ fill: "var(--sub-hi)", fontSize: 8 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactYen}
            />
            <ReferenceLine y={0} stroke="var(--border-hi)" />
            <Tooltip
              contentStyle={{ background: "var(--surface-hi)", border: "1px solid var(--border-hi)", borderRadius: 9, fontSize: 10 }}
              labelFormatter={(day) => `${day}日`}
              formatter={(value, name) => [yen(value, true), name]}
            />
            <Line type="monotone" dataKey="cumulativeEv" name="累計期待値" stroke="var(--home-green)" strokeWidth={2.4} dot={false} connectNulls={false} />
            <Line type="linear" dataKey="targetPace" name="目標ペース" stroke="var(--home-blue)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="home-result-row">
        <div>
          <span>実収支</span>
          <strong className={overview.hasActual ? (overview.actual >= 0 ? "is-positive" : "is-negative") : ""}>
            {overview.hasActual ? yen(overview.actual, true) : "—"}
          </strong>
        </div>
        <div>
          <span>{overview.hasActual ? varianceLabel : "期待値との差"}</span>
          <strong className={overview.hasActual ? varianceTone : ""}>{overview.hasActual ? yen(Math.abs(overview.variance)) : "—"}</strong>
        </div>
        <div>
          <span>稼働日数</span>
          <strong>{overview.activeDays}日</strong>
        </div>
        <div>
          <span>勝ちセッション率</span>
          <strong>{overview.winSessionRate}%</strong>
        </div>
      </div>

      <button type="button" className="home-detail-link" onClick={onDetail}>月別分析を見る <ChevronRight size={15} /></button>
    </section>
  );
}

function TargetEditor({ current, onClose, onSave }) {
  const [value, setValue] = useState(() => String(Math.max(0, Math.floor(Number(current) || 0))));
  const presets = [30000, 50000, 100000, 200000, 300000];
  const parsed = Math.max(0, Math.floor(Number(value) || 0));

  return (
    <div className="home-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="home-target-sheet" role="dialog" aria-modal="true" aria-labelledby="home-target-title">
        <div className="home-target-sheet__heading">
          <div>
            <h2 id="home-target-title">月間期待値目標を設定</h2>
            <p>今月、理論上積み上げたい期待値の金額です。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"><X size={20} /></button>
        </div>
        <label className="home-target-input">
          <span>目標額</span>
          <div><input type="number" min="0" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ""))} /><em>円</em></div>
        </label>
        <div className="home-target-presets">
          {presets.map((preset) => (
            <button type="button" key={preset} className={parsed === preset ? "is-selected" : ""} onClick={() => setValue(String(preset))}>
              {preset / 10000}万円
            </button>
          ))}
        </div>
        <div className="home-target-sheet__actions">
          <button type="button" className="is-cancel" onClick={onClose}>キャンセル</button>
          <button type="button" className="is-save" onClick={() => { onSave(parsed); onClose(); }}>保存する</button>
        </div>
      </section>
    </div>
  );
}

const actionIcons = {
  record: Play,
  settings: Store,
  analysis: BarChart3,
  delta: ScanLine,
  strategy: Target,
};

function NextActionCard({ action, onOpen }) {
  const Icon = actionIcons[action.kind] || Clock3;
  return (
    <section className="home-card home-next-card">
      <SectionTitle icon={Clock3}>次にやること</SectionTitle>
      <div className="home-next-card__body">
        <div className="home-next-icon"><Icon size={27} /></div>
        <div className="home-next-copy">
          <strong>{action.title}</strong>
          <span>{action.message}</span>
          <em>{action.tag}</em>
        </div>
        <ArrowButton onClick={onOpen}>{action.actionLabel}</ArrowButton>
      </div>
    </section>
  );
}

function DeltaStatusCard({ status, onAnalyze, onViewMap }) {
  return (
    <section className="home-card home-delta-card">
      <SectionTitle icon={ScanLine} aside={<span className="home-section-aside">対象：{status.scopeLabel}</span>}>差玉解析</SectionTitle>
      <div className="home-delta-stats">
        <div className="home-delta-stat"><span>最終解析</span><strong>{status.lastLabel}</strong></div>
        <div className="home-delta-stat"><span>解析済み台数</span><strong className="tone-yellow">{status.machineCount}<em>台</em></strong></div>
        <div className="home-delta-stat">
          <span>状態</span>
          <strong className="home-delta-state"><i className={status.hasScans ? "is-on" : ""} />{status.stateLabel}</strong>
        </div>
      </div>
      <div className="home-delta-actions">
        <button type="button" className="home-delta-analyze" onClick={onAnalyze}>差玉を解析</button>
        {status.hasScans && <button type="button" className="home-delta-map" onClick={onViewMap}>解析マップを見る</button>}
      </div>
    </section>
  );
}

function JudgmentCard({ continueCount, stopCount, latestText, onDetail }) {
  return (
    <section className="home-card home-judgment-card">
      <SectionTitle icon={BrainCircuit}>判断履歴</SectionTitle>
      <div className="home-judgment-grid">
        <JudgmentItem icon={Target} label="続行判断" count={continueCount} tone="teal" onClick={onDetail} />
        <JudgmentItem icon={Search} label="終了・比較判断" count={stopCount} tone="yellow" onClick={onDetail} />
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
      <span className="home-judgment__icon">{React.createElement(icon, { size: 31, strokeWidth: 1.8 })}</span>
      <span className="home-judgment__copy">
        <small>{label}</small>
        <strong>{count}<em>件</em></strong>
        <span>履歴を見る <ChevronRight size={13} /></span>
      </span>
    </button>
  );
}

function StoreDataCard({ storeName, metrics, onOpen }) {
  return (
    <section className="home-card home-active-store">
      <div className="home-active-store__top">
        <SectionTitle icon={Users}>店舗データ状況</SectionTitle>
        <div className="home-active-state"><i />記録 <b>{metrics.sessions}件</b></div>
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
            <span><small>実戦記録</small><b>{metrics.sessions}<em>回</em></b></span>
            <span><small>記録機種</small><b>{metrics.machines}<em>機種</em></b></span>
            <span><small>時間帯</small><b>{metrics.timeBands}<em>/3</em></b></span>
            <span><small>最終記録</small><b>{metrics.lastDate}</b></span>
          </div>
        </div>
      </div>
      <div className="home-active-store__footer"><span>{metrics.statusText}</span><ArrowButton onClick={onOpen}>店舗を見る</ArrowButton></div>
    </section>
  );
}

function RecentCard({ recent, onDetail }) {
  if (!recent) {
    return (
      <section className="home-card home-recent-card">
        <SectionTitle icon={Clock3}>直近の記録</SectionTitle>
        <div className="home-empty-state">最初の実戦を記録すると、機種・回転率・期待値・実収支がここに表示されます。</div>
      </section>
    );
  }
  return (
    <section className="home-card home-recent-card">
      <SectionTitle icon={Clock3}>直近の記録</SectionTitle>
      <button type="button" className="home-recent-row" onClick={onDetail}>
        <span className="home-machine-mark">P</span>
        <span className="home-recent-copy">
          <strong>{recent.machineName}</strong>
          <small>{recent.meta}</small>
          <span>回転率 {recent.spin}<i>・</i>期待値 <b>{yen(recent.ev, true)}</b></span>
        </span>
        <span className={`home-recent-amount ${recent.actual == null ? "" : recent.actual >= 0 ? "is-positive" : "is-negative"}`}>
          <small>実収支</small>{recent.actual == null ? "—" : yen(recent.actual, true)}
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
  const deltaScansRaw = S?.deltaScans;
  const archives = useMemo(() => Array.isArray(archivesRaw) ? archivesRaw : [], [archivesRaw]);
  const stores = useMemo(() => Array.isArray(storesRaw) ? storesRaw.filter(Boolean) : [], [storesRaw]);
  const now = useMemo(() => new Date(), []);
  const todayStr = localDateStr();
  const [targetEditorOpen, setTargetEditorOpen] = useState(false);

  // 稼働中セッションはまだ archives に保存されていないため、ホーム集計にだけ仮想レコードとして加える。
  // セッション終了後は sessionStarted=false になるため、保存済み記録との二重計上は起きない。
  const overviewArchives = useMemo(() => {
    if (!S?.sessionStarted) return archives;
    const effectiveWorkAmount = Number(S?.ev?.effectiveWorkAmount);
    const workAmount = Number(S?.ev?.workAmount);
    return [...archives, {
      date: S?.sessionStartDate || todayStr,
      investYen: Number(S?.investYen) || 0,
      recoveryYen: Number(S?.recoveryYen) || 0,
      stats: {
        effectiveWorkAmount: Number.isFinite(effectiveWorkAmount) ? effectiveWorkAmount : undefined,
        workAmount: Number.isFinite(workAmount) ? workAmount : 0,
      },
    }];
  }, [archives, S?.sessionStarted, S?.sessionStartDate, S?.investYen, S?.recoveryYen, S?.ev?.effectiveWorkAmount, S?.ev?.workAmount, todayStr]);

  const monthOverview = useMemo(
    () => buildMonthOverview(overviewArchives, S?.monthlyEvTarget, now),
    [overviewArchives, S?.monthlyEvTarget, now]
  );
  const latest = useMemo(() => latestArchive(archives), [archives]);
  const selectedStore = useMemo(() => (
    stores.find((store) => store?.id === selectedStoreId)
    || stores.find((store) => latest?.storeId != null && store?.id === latest.storeId)
    || stores.find((store) => latest?.storeName && store?.name === latest.storeName)
    || stores[0]
    || null
  ), [stores, selectedStoreId, latest]);

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
    const last = latestArchive(storeRecords);
    const [, month, day] = String(last?.date || "").split("-").map(Number);
    const missing = ["午前", "昼", "夕方以降"].filter((band) => !bands.has(band));
    return {
      sessions: storeRecords.length,
      machines,
      timeBands: bands.size,
      coverage: Math.round((bands.size / 3) * 100),
      lastDate: month && day ? `${month}/${day}` : "未記録",
      statusText: storeRecords.length === 0 ? "実戦記録はまだありません" : missing.length ? `未記録の時間帯：${missing.join("・")}` : "3つの時間帯に記録があります",
    };
  }, [storeRecords]);

  const deltaStatus = useMemo(
    () => buildDeltaStatus(deltaScansRaw, selectedStore, todayStr),
    [deltaScansRaw, selectedStore, todayStr]
  );
  const hasTodayRecord = useMemo(() => archives.some((record) => record?.date === todayStr), [archives, todayStr]);
  const nextAction = useMemo(() => getNextAction({
    sessionStarted: Boolean(S?.sessionStarted),
    stores,
    selectedStore,
    hasTodayRecord,
    hasTodayScan: deltaStatus.hasTodayScan,
  }), [S?.sessionStarted, stores, selectedStore, hasTodayRecord, deltaStatus.hasTodayScan]);

  const judgmentSummary = useMemo(() => {
    const snapshots = monthOverview.monthRecords.flatMap((record) => Array.isArray(record?.decisionSnapshots) ? record.decisionSnapshots : []);
    const continueActions = new Set(["continue", "continue_strong"]);
    const stopActions = new Set(["stop_candidate", "compare", "stop"]);
    const latestSnapshot = [...snapshots].sort((a, b) => String(b?.recordedAt || "").localeCompare(String(a?.recordedAt || "")))[0];
    return {
      continueCount: snapshots.filter((item) => continueActions.has(item?.action)).length,
      stopCount: snapshots.filter((item) => stopActions.has(item?.action)).length,
      latestText: latestSnapshot?.reason || "判断チェックポイント到達後に記録されます",
    };
  }, [monthOverview.monthRecords]);

  const recent = useMemo(() => {
    if (!latest) return null;
    const physical = Number(latest?.stats?.start1K);
    const effective = Number(latest?.stats?.effectiveStart1K);
    const spinRate = physical > 0 ? physical : effective > 0 ? effective : null;
    const playMinutes = Math.max(0, Number(latest?.playMinutes) || 0);
    const dateLabel = latest.date === todayStr ? "今日" : String(latest.date || "日付未設定").replaceAll("-", "/");
    return {
      machineName: latest.machineName || "機種名未設定",
      meta: [dateLabel, playMinutes > 0 ? `${(playMinutes / 60).toFixed(1)}時間` : null].filter(Boolean).join(" ・ "),
      spin: spinRate != null ? `${spinRate.toFixed(1)} /k` : "-- /k",
      ev: getEvAmount(latest),
      actual: getActualPL(latest),
    };
  }, [latest, todayStr]);

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 11) return ["おはようございます！", "期待値を一つずつ積み上げましょう"];
    if (hour < 18) return ["こんにちは！", "期待値を一つずつ積み上げましょう"];
    return ["おつかれさまです！", "今日の記録を次の判断につなげましょう"];
  }, [now]);

  const goAnalysis = () => S?.setTab?.("calendar");
  const goStore = () => {
    if (!selectedStore) return S?.setTab?.("settings");
    S?.setSelectedStoreId?.(selectedStore.id);
    if (S?.openStoreDetail) S.openStoreDetail(selectedStore.id);
    else S?.setTab?.("storeDetail");
  };
  const handleNextAction = () => {
    const modeByKind = { record: "rot", settings: "settings", analysis: "calendar", delta: "delta", strategy: "strategy" };
    S?.setTab?.(modeByKind[nextAction.kind]);
  };
  const unread = Array.isArray(S?.notificationLog) && S.notificationLog.some((item) => !item?.read);

  return (
    <div className="home-dashboard">
      <header className="home-header">
        <div className="home-header__top">
          <AppMark />
          <button type="button" aria-label="通知を見る" className="home-bell" onClick={S?.openNotificationPanel}>
            <Bell size={22} />{unread && <i />}
          </button>
        </div>
        <h1>{greeting[0]}</h1>
        <p>{greeting[1]}</p>
      </header>

      <MonthGoalCard overview={monthOverview} onEdit={() => setTargetEditorOpen(true)} onDetail={goAnalysis} />
      <NextActionCard action={nextAction} onOpen={handleNextAction} />
      <DeltaStatusCard status={deltaStatus} onAnalyze={() => S?.setTab?.("delta")} onViewMap={() => S?.setTab?.("deltaMap")} />
      <RecentCard recent={recent} onDetail={goAnalysis} />
      <JudgmentCard {...judgmentSummary} onDetail={goAnalysis} />
      {selectedStore && <StoreDataCard storeName={selectedStore.name || "登録店舗"} metrics={storeMetrics} onOpen={goStore} />}

      {targetEditorOpen && (
        <TargetEditor
          current={monthOverview.target}
          onClose={() => setTargetEditorOpen(false)}
          onSave={(value) => S?.setMonthlyEvTarget?.(value)}
        />
      )}
    </div>
  );
}
