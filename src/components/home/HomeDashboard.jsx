import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Compass,
  Gauge,
  Pencil,
  Play,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  Trash2,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getEvAmount } from "../analysis/analysisSelectors";
import { localDateStr } from "../../constants";
import { getEffectiveMachineList } from "../../machineDB";
import {
  buildDeltaStatus,
  buildMonthOverview,
  getNextAction,
  latestArchive,
} from "./homeDashboardModel";
import {
  buildMonthProjection,
  buildStyleCandidates,
  getRealPL,
  PLAY_STYLES,
} from "./homePlanningModel";
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

function MonthlySummaryCard({ overview, projection, plan, onEdit, onDetail }) {
  const progressWidth = Math.min(100, Math.max(0, overview.progress));
  const gap = projection.actualExpectedGap;
  const actualIncomplete = projection.actualRecordCount < projection.recordCount;
  const gapLabel = gap == null ? "差は実収支入力後" : gap >= 0 ? "入力済み記録は余剰" : "入力済み記録は欠損";
  const gapTone = gap == null ? "" : gap >= 0 ? "is-positive" : "is-negative";
  const style = PLAY_STYLES[plan?.baseStyle] || null;
  const chartData = overview.chartData.map((row) => {
    const forecast = projection.projectionByDay.get(row.day);
    return {
      ...row,
      forecastCenter: forecast?.center ?? null,
      forecastRange: forecast ? [forecast.low, forecast.high] : null,
    };
  });

  return (
    <section className={`home-card home-command-card ${overview.achieved ? "is-achieved" : ""}`}>
      <div className="home-card-heading">
        <div className="home-card-heading__title">
          <WalletCards size={18} />
          <h2>今月の収支と期待値</h2>
        </div>
        <button type="button" className="home-target-edit" onClick={onEdit} aria-label="月間プランを編集">
          <Pencil size={12} /> 月間プラン
        </button>
      </div>

      <div className="home-money-hero">
        <div className="home-money-metric is-actual">
          <span><CircleDollarSign size={14} />実収支</span>
          <strong className={overview.hasActual ? (overview.actual >= 0 ? "is-positive" : "is-negative") : ""}>
            {overview.hasActual ? yen(overview.actual, true) : "—"}
          </strong>
          <small>実際に増減した金額 {projection.actualRecordCount}/{projection.recordCount}件</small>
        </div>
        <div className="home-money-metric is-expected">
          <span><TrendingUp size={14} />累計期待値</span>
          <strong className={overview.expected >= 0 ? "is-positive" : "is-negative"}>{yen(overview.expected, true)}</strong>
          <small>理論上積み上げた金額</small>
        </div>
      </div>

      <div className={`home-gap-banner ${gapTone}`}>
        <span>{gapLabel}</span>
        <strong>{gap == null ? "—" : yen(Math.abs(gap))}</strong>
        <em>{gap == null ? "投資・回収を記録すると表示" : actualIncomplete ? "未入力記録は差の計算から除外" : gap >= 0 ? "結果が期待値を上回っています" : "短期のブレとして切り分けます"}</em>
      </div>

      <div className="home-target-progress-row">
        <span>期待値目標 {yen(overview.target)}</span>
        <strong>{overview.progress}%</strong>
      </div>
      <div className="home-progress" aria-label={`月間期待値目標の達成率 ${overview.progress}%`}>
        <i style={{ width: `${progressWidth}%` }} />
      </div>

      <div className="home-chart-heading">
        <span>今月の推移と月末見込み</span>
        <div className="home-chart-legend home-chart-legend--v3">
          <i className="is-actual" />実収支 <i className="is-ev" />期待値 <i className="is-range" />80%目安
        </div>
      </div>
      <div className="home-goal-chart home-goal-chart--v3" aria-label="実収支、期待値、月末見込み幅のグラフ">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={148} initialDimension={{ width: 340, height: 154 }}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 3, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="day" interval={6} tick={{ fill: "var(--sub-hi)", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}日`} />
            <YAxis width={39} tick={{ fill: "var(--sub-hi)", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={compactYen} />
            <ReferenceLine y={0} stroke="var(--border-hi)" />
            <Tooltip
              contentStyle={{ background: "var(--surface-hi)", border: "1px solid var(--border-hi)", borderRadius: 9, fontSize: 10 }}
              labelFormatter={(day) => `${day}日`}
              formatter={(value, name) => [Array.isArray(value) ? `${yen(value[0], true)} 〜 ${yen(value[1], true)}` : yen(value, true), name]}
            />
            <Area type="linear" dataKey="forecastRange" name="月末80%目安" stroke="none" fill="var(--home-blue)" fillOpacity={0.13} connectNulls={false} />
            <Line type="monotone" dataKey="cumulativeActual" name="累計実収支" stroke="var(--home-green)" strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="cumulativeEv" name="累計期待値" stroke="var(--home-blue)" strokeWidth={2.2} dot={false} connectNulls={false} />
            <Line type="linear" dataKey="forecastCenter" name="月末中心見込み" stroke="var(--home-blue)" strokeWidth={1.4} strokeDasharray="4 3" dot={false} connectNulls={false} />
            <Line type="linear" dataKey="targetPace" name="目標ペース" stroke="var(--home-yellow)" strokeWidth={1.1} strokeDasharray="2 5" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="home-forecast-card">
        <div>
          <span>このペースの月末収支</span>
          <strong>{projection.center == null ? (projection.status === "incomplete-actual" ? "実収支入力待ち" : "算出待ち") : yen(projection.center, true)}</strong>
        </div>
        <div>
          <span>中央80%の目安</span>
          <strong>{projection.low == null ? (projection.status === "incomplete-actual" ? "全記録の入力後に表示" : "標準偏差データが必要") : `${yen(projection.low, true)} 〜 ${yen(projection.high, true)}`}</strong>
        </div>
        <small>標準偏差を確認できた記録 {projection.riskRecordCount}/{projection.recordCount}件（{projection.riskCoverage}%）。予測は保証額ではありません。</small>
      </div>

      <button type="button" className="home-plan-ribbon" onClick={onEdit}>
        <span className={`home-style-dot is-${plan?.baseStyle || "unset"}`}><Gauge size={17} /></span>
        <span>
          <small>今月の基本スタイル</small>
          <strong>{style ? `${style.label}・${style.shortLabel}` : "未設定（最初に決めましょう）"}</strong>
        </span>
        <em>{plan ? `${Number(plan.standardHours) || 0}時間 / 上限${yen(plan.cashLimit || 0)}` : "設定"}</em>
        <ChevronRight size={17} />
      </button>

      <button type="button" className="home-detail-link" onClick={onDetail}>月別分析を見る <ChevronRight size={15} /></button>
    </section>
  );
}

function StylePicker({ value, onChange, compact = false }) {
  return (
    <div className={`home-style-picker ${compact ? "is-compact" : ""}`}>
      {Object.values(PLAY_STYLES).map((style) => (
        <button type="button" key={style.id} className={value === style.id ? `is-selected is-${style.id}` : ""} onClick={() => onChange(style.id)}>
          <strong>{style.label}</strong>
          <span>{style.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

function PlanEditor({ current, monthKey, target, prefs, onClose, onSave }) {
  const [targetValue, setTargetValue] = useState(() => String(Math.max(0, Math.floor(Number(current?.expectedTarget ?? target) || 0))));
  const [styleId, setStyleId] = useState(current?.baseStyle || "balanced");
  const [standardHours, setStandardHours] = useState(String(current?.standardHours ?? 6));
  const [cashLimit, setCashLimit] = useState(String(current?.cashLimit ?? 30000));
  const [reminderTime, setReminderTime] = useState(current?.reminderTime || prefs?.reminderTime || "20:00");
  const [plannedDates, setPlannedDates] = useState(() => Array.isArray(current?.plannedDates) ? current.plannedDates : []);
  const [newDate, setNewDate] = useState("");
  const parsedTarget = Math.max(0, Math.floor(Number(targetValue) || 0));

  const addDate = () => {
    if (!newDate || !newDate.startsWith(monthKey)) return;
    setPlannedDates((previous) => [...new Set([...previous, newDate])].sort());
    setNewDate("");
  };

  return (
    <div className="home-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="home-target-sheet home-plan-sheet" role="dialog" aria-modal="true" aria-labelledby="home-plan-title">
        <div className="home-target-sheet__heading">
          <div>
            <h2 id="home-plan-title">今月の稼働プラン</h2>
            <p>月の基本方針です。前日に日別方針だけ変更できます。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"><X size={20} /></button>
        </div>

        <div className="home-plan-field">
          <span>基本スタイル</span>
          <StylePicker value={styleId} onChange={setStyleId} />
          <small>{PLAY_STYLES[styleId]?.description}</small>
        </div>

        <div className="home-plan-fields-grid">
          <label className="home-target-input">
            <span>期待値目標</span>
            <div><input type="number" min="0" inputMode="numeric" value={targetValue} onChange={(event) => setTargetValue(event.target.value.replace(/[^\d]/g, ""))} /><em>円</em></div>
          </label>
          <label className="home-target-input">
            <span>1日の標準時間</span>
            <div><input type="number" min="1" max="16" inputMode="decimal" value={standardHours} onChange={(event) => setStandardHours(event.target.value)} /><em>時間</em></div>
          </label>
          <label className="home-target-input">
            <span>1日の現金上限</span>
            <div><input type="number" min="0" inputMode="numeric" value={cashLimit} onChange={(event) => setCashLimit(event.target.value.replace(/[^\d]/g, ""))} /><em>円</em></div>
          </label>
          <label className="home-target-input">
            <span>前日の確認時刻</span>
            <div><input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /></div>
          </label>
        </div>

        <div className="home-plan-field">
          <span>稼働予定日</span>
          <div className="home-date-add">
            <input type="date" value={newDate} min={`${monthKey}-01`} max={`${monthKey}-31`} onChange={(event) => setNewDate(event.target.value)} />
            <button type="button" onClick={addDate}><Plus size={15} />追加</button>
          </div>
          <div className="home-date-chips">
            {plannedDates.length === 0 && <small>予定日を入れると、その前日にリサーチ方針を確認できます。</small>}
            {plannedDates.map((date) => (
              <button type="button" key={date} onClick={() => setPlannedDates((previous) => previous.filter((item) => item !== date))}>
                {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}<Trash2 size={12} />
              </button>
            ))}
          </div>
        </div>

        <div className="home-plan-note"><Bell size={14} />予定日前日にアプリを開くと、設定時刻からホームへ確認カードを表示します。端末へのプッシュ通知ではありません。</div>
        <div className="home-target-sheet__actions">
          <button type="button" className="is-cancel" onClick={onClose}>キャンセル</button>
          <button type="button" className="is-save" onClick={() => {
            onSave({
              monthKey,
              expectedTarget: parsedTarget,
              baseStyle: styleId,
              standardHours: Math.max(1, Number(standardHours) || 6),
              cashLimit: Math.max(0, Number(cashLimit) || 0),
              reminderTime,
              plannedDates,
              updatedAt: new Date().toISOString(),
            });
            onClose();
          }}>このプランで進める</button>
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
  planning: CalendarDays,
  daily: Compass,
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

function monthDayLabel(dateString) {
  const [, month, day] = String(dateString || "").split("-").map(Number);
  return month && day ? `${month}/${day}` : "明日";
}

function DailyResearchCard({ date, plan, basePlan, machines, storeName, onSelect, onOpenStrategy }) {
  const baseStyle = basePlan?.baseStyle || "balanced";
  const selectedStyleId = plan?.style || baseStyle;
  const selectedStyle = PLAY_STYLES[selectedStyleId] || PLAY_STYLES.balanced;
  const candidates = useMemo(
    () => selectedStyleId === "skip" ? [] : buildStyleCandidates(machines, selectedStyleId, 3),
    [machines, selectedStyleId]
  );

  return (
    <section className="home-card home-research-card" id="home-daily-research">
      <SectionTitle
        icon={Compass}
        aside={<span className="home-section-aside">{monthDayLabel(date)} の準備</span>}
      >明日はどのスタイルでリサーチしますか？</SectionTitle>

      {!plan ? (
        <>
          <p className="home-research-lead">今月の基本は「{PLAY_STYLES[baseStyle]?.label || "バランス"}」です。明日だけ変更しても構いません。</p>
          <StylePicker value={selectedStyleId} onChange={onSelect} compact />
          <button type="button" className="home-skip-button" onClick={() => onSelect("skip")}>明日は稼働しない・見送る</button>
        </>
      ) : plan.style === "skip" ? (
        <div className="home-skip-state">
          <CheckCircle2 size={28} />
          <div><strong>明日は見送り予定です</strong><span>見送る判断も、計画を守った成功として記録します。</span></div>
          <button type="button" onClick={() => onSelect(baseStyle || "balanced")}>方針を変更</button>
        </div>
      ) : (
        <>
          <div className={`home-selected-style is-${selectedStyleId}`}>
            <span><ShieldCheck size={17} />明日の方針</span>
            <strong>{selectedStyle.label}</strong>
            <em>{selectedStyle.shortLabel}</em>
            <button type="button" onClick={() => onSelect(null)}>変更</button>
          </div>
          <div className="home-daily-limits">
            <span><Clock3 size={12} />目安 {Number(plan?.standardHours ?? basePlan?.standardHours) || 0}時間</span>
            <span><WalletCards size={12} />現金上限 {yen(plan?.cashLimit ?? basePlan?.cashLimit ?? 0)}</span>
            <em>当日の条件が弱ければ使い切らず見送り</em>
          </div>

          <div className="home-research-scope">
            <span>{storeName ? `${storeName}の店舗データを次に確認` : "登録店舗を選ぶと店舗単位で確認できます"}</span>
            <em>機種マスタ候補・設置未確認</em>
          </div>
          {selectedStyleId === "ev" && (
            <p className="home-research-ev-note">高変動＝高期待値ではありません。ここではブレ幅の異なる機種を比較し、期待値順位は店舗データ取得後に決めます。</p>
          )}

          <div className="home-candidate-list">
            {candidates.map((candidate, index) => (
              <div className="home-candidate-row" key={`${candidate.name}-${candidate.modelName}`}>
                <span className="home-candidate-rank">{index + 1}</span>
                <span className="home-candidate-copy">
                  <strong>{candidate.name}</strong>
                  <small>{candidate.modelName}</small>
                </span>
                <span className={`home-risk-badge is-${candidate.riskTier}`}>
                  <small>{candidate.riskLabel}</small>
                  <strong>{candidate.stdDev.toLocaleString("ja-JP")}玉</strong>
                </span>
              </div>
            ))}
          </div>

          <div className="home-research-rules">
            <span><CheckCircle2 size={13} />予測の更新日を確認し、2日以上前なら見送り</span>
            <span><CheckCircle2 size={13} />期待値・信頼度・投資上限を当日に再確認</span>
            <span><CheckCircle2 size={13} />第一候補が弱ければ予備候補、全て弱ければ稼働しない</span>
          </div>
          <button type="button" className="home-research-open" onClick={onOpenStrategy}>店舗データと期待値を確認する <ChevronRight size={16} /></button>
          <small className="home-research-disclaimer">標準偏差は2,200回転時の出玉ブレを表すP-EVIDENCE推定です。機種名だけで着席を勧めるものではありません。</small>
        </>
      )}
    </section>
  );
}

function PlanningReminderPreview({ date, reminderTime, baseStyle, onOpen }) {
  return (
    <section className="home-card home-reminder-preview">
      <span className="home-reminder-preview__icon"><Bell size={20} /></span>
      <span className="home-reminder-preview__copy">
        <small>{monthDayLabel(date)} は稼働予定日</small>
        <strong>{reminderTime} に明日のリサーチ方針を確認</strong>
        <em>基本スタイル：{PLAY_STYLES[baseStyle]?.label || "バランス"}</em>
      </span>
      <button type="button" onClick={onOpen}>今決める <ChevronRight size={14} /></button>
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
  const customMachinesRaw = S?.customMachines;
  const selectedStoreId = S?.selectedStoreId;
  const deltaScansRaw = S?.deltaScans;
  const archives = useMemo(() => Array.isArray(archivesRaw) ? archivesRaw : [], [archivesRaw]);
  const stores = useMemo(() => Array.isArray(storesRaw) ? storesRaw.filter(Boolean) : [], [storesRaw]);
  const machines = useMemo(() => getEffectiveMachineList(customMachinesRaw), [customMachinesRaw]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const todayStr = localDateStr(now);
  const tomorrowStr = useMemo(() => {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDateStr(tomorrow);
  }, [now]);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [forceDailyOpen, setForceDailyOpen] = useState(false);

  // 稼働中セッションはまだ archives に保存されていないため、期待値の集計にだけ仮想レコードとして加える。
  // 実収支は精算前に現金・持ち玉を同じ基準で確定できないので、終了までは未入力扱いにする。
  // セッション終了後は sessionStarted=false になるため、保存済み記録との二重計上は起きない。
  const overviewArchives = useMemo(() => {
    if (!S?.sessionStarted) return archives;
    const effectiveWorkAmount = Number(S?.ev?.effectiveWorkAmount);
    const workAmount = Number(S?.ev?.workAmount);
    return [...archives, {
      date: S?.sessionStartDate || todayStr,
      machineName: S?.machineName || "",
      settings: {
        rotPerHour: Number(S?.rotPerHour) || 0,
        ballVal: Number(S?.ballVal) || 0,
        exRate: Number(S?.exRate) || 0,
      },
      stats: {
        effectiveWorkAmount: Number.isFinite(effectiveWorkAmount) ? effectiveWorkAmount : undefined,
        workAmount: Number.isFinite(workAmount) ? workAmount : 0,
        netRot: Number(S?.ev?.netRot) || 0,
      },
    }];
  }, [archives, S?.sessionStarted, S?.sessionStartDate, S?.machineName, S?.rotPerHour, S?.ballVal, S?.exRate, S?.ev?.effectiveWorkAmount, S?.ev?.workAmount, S?.ev?.netRot, todayStr]);

  const monthOverview = useMemo(
    () => buildMonthOverview(overviewArchives, S?.monthlyEvTarget, now),
    [overviewArchives, S?.monthlyEvTarget, now]
  );
  const monthPlan = S?.monthlyPlayPlans?.[monthOverview.monthKey] || null;
  const tomorrowMonthPlan = S?.monthlyPlayPlans?.[tomorrowStr.slice(0, 7)] || null;
  const tomorrowBasePlan = tomorrowMonthPlan || monthPlan;
  const dailyPlan = S?.dailyResearchPlans?.[tomorrowStr] || null;
  const tomorrowScheduled = Boolean(tomorrowBasePlan?.plannedDates?.includes(tomorrowStr));
  const reminderTime = tomorrowBasePlan?.reminderTime || S?.planningNotificationPrefs?.reminderTime || "20:00";
  const [reminderHour, reminderMinute] = reminderTime.split(":").map(Number);
  const reminderReady = now.getHours() * 60 + now.getMinutes() >= (Number(reminderHour) || 0) * 60 + (Number(reminderMinute) || 0);
  const showDailyResearch = Boolean(dailyPlan || (tomorrowScheduled && (reminderReady || forceDailyOpen)));
  const showReminderPreview = Boolean(tomorrowScheduled && !dailyPlan && !showDailyResearch);
  const monthProjection = useMemo(
    () => buildMonthProjection({ archives: overviewArchives, machines, now }),
    [overviewArchives, machines, now]
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
  const operationalAction = useMemo(() => getNextAction({
    sessionStarted: Boolean(S?.sessionStarted),
    stores,
    selectedStore,
    hasTodayRecord,
    hasTodayScan: deltaStatus.hasTodayScan,
  }), [S?.sessionStarted, stores, selectedStore, hasTodayRecord, deltaStatus.hasTodayScan]);
  const nextAction = useMemo(() => {
    if (S?.sessionStarted) return operationalAction;
    if (!monthPlan) return {
      kind: "planning",
      title: "今月の稼働プランを決める",
      message: "期待値目標・安定性・投資上限を先に決めます。",
      tag: "月初の準備",
      actionLabel: "プランを作る",
    };
    if (tomorrowScheduled && !dailyPlan && (reminderReady || forceDailyOpen)) return {
      kind: "daily",
      title: "明日のリサーチ方針を決める",
      message: "安定重視・バランス・期待値優先から選びます。",
      tag: "前日の準備",
      actionLabel: "方針を選ぶ",
    };
    return operationalAction;
  }, [S?.sessionStarted, operationalAction, monthPlan, tomorrowScheduled, dailyPlan, reminderReady, forceDailyOpen]);

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
      actual: getRealPL(latest),
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
    if (nextAction.kind === "planning") {
      setPlanEditorOpen(true);
      return;
    }
    if (nextAction.kind === "daily") {
      document.getElementById("home-daily-research")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    const modeByKind = { record: "rot", settings: "settings", analysis: "calendar", delta: "delta", strategy: "strategy" };
    S?.setTab?.(modeByKind[nextAction.kind]);
  };
  const saveMonthPlan = (plan) => {
    S?.setMonthlyPlayPlans?.((previous) => ({ ...(previous || {}), [monthOverview.monthKey]: plan }));
    S?.setMonthlyEvTarget?.(plan.expectedTarget);
    S?.setPlanningNotificationPrefs?.((previous) => ({
      ...(previous || {}),
      enabled: true,
      reminderTime: plan.reminderTime,
      channel: "in-app",
    }));
  };
  const saveDailyStyle = (styleId) => {
    S?.setDailyResearchPlans?.((previous) => {
      const next = { ...(previous || {}) };
      if (!styleId) {
        delete next[tomorrowStr];
        return next;
      }
      next[tomorrowStr] = {
        id: `research-${tomorrowStr}`,
        date: tomorrowStr,
        style: styleId,
        source: styleId === tomorrowBasePlan?.baseStyle ? "monthly-plan" : "daily-override",
        standardHours: Number(tomorrowBasePlan?.standardHours) || 0,
        cashLimit: Number(tomorrowBasePlan?.cashLimit) || 0,
        reminderTime,
        createdAt: new Date().toISOString(),
      };
      return next;
    });
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

      <MonthlySummaryCard overview={monthOverview} projection={monthProjection} plan={monthPlan} onEdit={() => setPlanEditorOpen(true)} onDetail={goAnalysis} />
      <NextActionCard action={nextAction} onOpen={handleNextAction} />
      {showReminderPreview && (
        <PlanningReminderPreview
          date={tomorrowStr}
          reminderTime={reminderTime}
          baseStyle={tomorrowBasePlan?.baseStyle || "balanced"}
          onOpen={() => setForceDailyOpen(true)}
        />
      )}
      {showDailyResearch && (
        <DailyResearchCard
          date={tomorrowStr}
          plan={dailyPlan}
          basePlan={tomorrowBasePlan}
          machines={machines}
          storeName={selectedStore?.name}
          onSelect={saveDailyStyle}
          onOpenStrategy={() => S?.setTab?.("strategy")}
        />
      )}
      <DeltaStatusCard status={deltaStatus} onAnalyze={() => S?.setTab?.("delta")} onViewMap={() => S?.setTab?.("deltaMap")} />
      <RecentCard recent={recent} onDetail={goAnalysis} />
      <JudgmentCard {...judgmentSummary} onDetail={goAnalysis} />
      {selectedStore && <StoreDataCard storeName={selectedStore.name || "登録店舗"} metrics={storeMetrics} onOpen={goStore} />}

      {planEditorOpen && (
        <PlanEditor
          current={monthPlan}
          monthKey={monthOverview.monthKey}
          target={monthOverview.target}
          prefs={S?.planningNotificationPrefs}
          onClose={() => setPlanEditorOpen(false)}
          onSave={saveMonthPlan}
        />
      )}
    </div>
  );
}
