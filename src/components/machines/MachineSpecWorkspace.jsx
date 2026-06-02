import React, { useState } from "react";
import "./MachineSpecWorkspace.css";

const fallbackMachine = {
  name: "P大海物語5 MTE2",
  meta: "三洋 | ハイミドル | 3個賞球",
  tags: ["海シリーズ", "m_master連携", "削り込み適用"],
  updatedAt: "2026/06/02 18:42",
  probability: "1/319.6",
  border: "17.36",
  avgPayout: "1,350",
  stdDev: "13,000",
  rushEntry: "60%",
  rushContinue: "75%",
  hesoAvg: "1,500",
  rushAvg: "1,500",
  tsv: ["P大海物語5 MTE2", "319.6", "17.36", "3", "14.0", "1350", "13000", "0.5"],
  heso: [
    { id: "ヘソ1", payout: "1500", ratio: "60", rush: true },
    { id: "ヘソ2", payout: "1500", ratio: "40", rush: true },
    { id: "ヘソ3", payout: "0", ratio: "0", rush: false },
  ],
};

function formatNumber(value, fallback = "—") {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

function formatProbability(data) {
  if (data?.prob) return data.prob;
  const synthProb = Number(data?.synthProb);
  if (Number.isFinite(synthProb) && synthProb > 0) return `1/${synthProb}`;
  return fallbackMachine.probability;
}

function formatBorder(data) {
  if (data?.border && typeof data.border === "object") {
    const preferred = data.border["4.00"] || data.border["4"] || data.border["等価"];
    if (preferred) return formatNumber(preferred);
    const first = Object.values(data.border).find((value) => Number(value) > 0);
    if (first) return formatNumber(first);
  }
  if (data?.border) return formatNumber(data.border);
  return fallbackMachine.border;
}

function normalizeMachine(data) {
  if (!data) return fallbackMachine;

  const maker = data.maker || "メーカー未設定";
  const type = data.type || "タイプ未設定";
  const prize = Number(data.prize);
  const prizeText = Number.isFinite(prize) && prize > 0 ? ` | ${prize}個賞球` : "";
  const heso = Array.isArray(data.hesoDist) && data.hesoDist.length > 0
    ? data.hesoDist.slice(0, 3).map((row, index) => ({
        id: `ヘソ${index + 1}`,
        payout: String(row.payout ?? 0),
        ratio: String(row.rate ?? 0),
        rush: Number(row.rate) > 0,
      }))
    : fallbackMachine.heso;

  return {
    name: data.name || fallbackMachine.name,
    meta: `${maker} | ${type}${prizeText}`,
    tags: [
      data.name?.includes("海") ? "海シリーズ" : "機種検索連携",
      "m_master連携",
      "削り込み適用",
    ],
    updatedAt: fallbackMachine.updatedAt,
    probability: formatProbability(data),
    border: formatBorder(data),
    avgPayout: formatNumber(data.avgPayoutPerHit, fallbackMachine.avgPayout),
    stdDev: formatNumber(data.stdDev, fallbackMachine.stdDev),
    rushEntry: Number(data.rushEntryRate) > 0 ? `${data.rushEntryRate}%` : fallbackMachine.rushEntry,
    rushContinue: Number(data.rushContinueRate) > 0 ? `${data.rushContinueRate}%` : fallbackMachine.rushContinue,
    hesoAvg: formatNumber(data.hesoAvgPayout, fallbackMachine.hesoAvg),
    rushAvg: formatNumber(data.rushAvgPayout, fallbackMachine.rushAvg),
    tsv: [
      data.name || fallbackMachine.name,
      String(data.synthProb || "").replace(/^1\//, "") || fallbackMachine.tsv[1],
      formatBorder(data),
      String(data.prize || ""),
      String(data.unitCost || ""),
      String(data.avgPayoutPerHit || ""),
      String(data.stdDev || ""),
      "0.5",
    ],
    heso,
    roundDist: data.roundDist || fallbackMachine.roundDist || "1500発 100%",
    rushDist: data.rushDist || fallbackMachine.rushDist || "1500発 100%",
  };
}

const mappingItems = [
  ["A", "機種名"],
  ["B", "確率"],
  ["C", "ボーダー"],
  ["D", "賞球"],
  ["F", "平均出玉"],
  ["L", "ヘソ平均"],
  ["M", "RUSH平均"],
  ["Q〜V", "ヘソ振分"],
];

const validationItems = [
  ["ok", "比率合計 100%"],
  ["ok", "削り込み計算 OK"],
  ["ok", "重複なし"],
  ["ok", "関数列に未入力"],
  ["warn", "手動入力値なし"],
];

function Icon({ name }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "back") {
    return (
      <svg {...common}>
        <path d="M15 18l-6-6 6-6" />
      </svg>
    );
  }
  if (name === "edit") {
    return (
      <svg {...common}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }
  if (name === "sync") {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 0 1-14.8 6.9" />
        <path d="M3 12A9 9 0 0 1 17.8 5.1" />
        <path d="M17 1v4h4" />
        <path d="M7 23v-4H3" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }
  if (name === "trash") {
    return (
      <svg {...common}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </svg>
    );
  }
  if (name === "excel") {
    return (
      <svg {...common}>
        <path d="M14 3h5v18H5V3h5" />
        <path d="M10 3v18" />
        <path d="m7 8 6 8" />
        <path d="m13 8-6 8" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  return null;
}

function Pill({ children, tone = "default" }) {
  return <span className={`ms-pill ms-pill-${tone}`}>{children}</span>;
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button type="button" className="ms-header-action" onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function MetricCard({ label, value, color, sub }) {
  return (
    <div className="ms-metric-card">
      <div className="ms-metric-label">{label}</div>
      <div className={`ms-metric-value ${color || ""}`}>{value}</div>
      {sub && <div className="ms-metric-sub">{sub}</div>}
    </div>
  );
}

function CheckMark({ status = "ok" }) {
  return (
    <span className={`ms-check ms-check-${status}`}>
      {status === "warn" ? "!" : <Icon name="check" />}
    </span>
  );
}

function DetailScreen({ machine, onEdit, onBack, primaryActionLabel, onPrimaryAction }) {
  return (
    <section className="machine-spec-workspace machine-detail-screen" aria-label="機種詳細">
      <header className="ms-detail-header">
        <button type="button" className="ms-icon-button" aria-label="戻る" onClick={onBack}>
          <Icon name="back" />
        </button>
        <div className="ms-detail-title-block">
          <h1>機種詳細</h1>
          <Pill tone="success">登録済み・P-EVIDENCE同期OK</Pill>
        </div>
        <div className="ms-detail-actions">
          <ActionButton icon="edit" label="編集" onClick={onEdit} />
          <ActionButton icon="sync" label="同期" />
        </div>
      </header>

      <main className="ms-detail-content">
        <section className="ms-hero-panel">
          <h2>{machine.name}</h2>
          <p>{machine.meta}</p>
          <div className="ms-tag-row">
            {machine.tags.map((tag, index) => (
              <Pill key={tag} tone={index === 0 ? "blue" : index === 1 ? "teal" : "purple"}>
                {tag}
              </Pill>
            ))}
          </div>
          <div className="ms-updated">
            <Icon name="clock" />
            <span>最終更新 {machine.updatedAt}</span>
          </div>
        </section>

        <section className="ms-metric-grid">
          <MetricCard label="大当り確率" value={machine.probability} color="yellow" />
          <MetricCard label="ボーダー(1k)" value={machine.border} color="cyan" />
          <MetricCard label="1大当り平均出玉" value={machine.avgPayout} color="green" sub="削り込み" />
          <MetricCard label="標準偏差" value={machine.stdDev} color="blue" />
          <MetricCard label="RUSH突入率" value={machine.rushEntry} color="orange" />
          <MetricCard label="RUSH継続率" value={machine.rushContinue} color="orange" />
        </section>

        <section className="ms-panel">
          <h2>大当り振分サマリー</h2>
          <div className="ms-allocation-box">
            <div className="ms-allocation-head">
              <strong>特図1・ヘソ</strong>
              <Pill tone="success">比率合計 100%</Pill>
            </div>
            <div className="ms-chip-row">
              {machine.heso.map((row) => (
                <React.Fragment key={row.id}>
                  <span>{formatNumber(row.payout, "0")}発</span>
                  <strong>{row.ratio}%</strong>
                </React.Fragment>
              ))}
            </div>
            <div className="ms-divider" />
            <div className="ms-allocation-head">
              <strong>特図2・RUSH</strong>
              <Pill tone="orange">確変ループ</Pill>
            </div>
            <div className="ms-chip-row">
              <span>{machine.rushAvg}発</span>
              <strong>100%</strong>
            </div>
            <div className="ms-summary-line">
              ヘソ平均出玉 <b>{machine.hesoAvg}</b>
              <span>/</span>
              RUSH平均出玉 <b>{machine.rushAvg}</b>
            </div>
          </div>
        </section>

        <section className="ms-panel">
          <div className="ms-panel-title-row">
            <h2>P-EVIDENCE登録内容</h2>
            <button type="button" className="ms-ghost-button">TSV確認</button>
          </div>
          <div className="ms-mapping-grid-detail">
            {mappingItems.map(([col, label]) => (
              <div key={`${col}-${label}`} className="ms-mapping-item">
                <CheckMark />
                <span className="ms-col">{col}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="ms-panel">
          <h2>検証ステータス</h2>
          <div className="ms-validation-grid">
            {validationItems.map(([status, label]) => (
              <div key={label} className="ms-validation-item">
                <CheckMark status={status} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="ms-detail-bottom-actions">
          <button type="button" className="ms-secondary-cta" onClick={onEdit}>
            <Icon name="edit" />
            <span>編集する</span>
          </button>
          <button type="button" className="ms-primary-cta" onClick={onPrimaryAction}>
            <span>{primaryActionLabel}</span>
            <span className="ms-chevron">›</span>
          </button>
        </div>
      </main>
    </section>
  );
}

function Stepper() {
  const steps = ["基本", "出玉", "振分", "検証"];
  return (
    <div className="ms-stepper" aria-label="登録ステップ">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <div className={`ms-step ${index === 1 ? "active" : ""}`}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
          {index < steps.length - 1 && <div className="ms-step-line" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function Field({ label, value, unit, compact }) {
  return (
    <label className={`ms-field ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <div>
        <input type="text" inputMode="decimal" defaultValue={value} aria-label={label} />
        {unit && <em>{unit}</em>}
      </div>
    </label>
  );
}

function Toggle({ checked }) {
  return (
    <button type="button" className={`ms-toggle ${checked ? "checked" : ""}`} aria-label="RUSH突入">
      <span />
    </button>
  );
}

function RegisterScreen({ machine, onSave, onBack }) {
  return (
    <section className="machine-spec-workspace machine-register-screen" aria-label="機種スペック登録">
      <header className="ms-register-header">
        <button type="button" className="ms-register-back" aria-label="戻る" onClick={onBack}>
          <Icon name="back" />
        </button>
        <div className="ms-register-title">
          <h1>機種スペック登録</h1>
          <Pill tone="sync">P-EVIDENCE未同期</Pill>
        </div>
        <button type="button" className="ms-import-button">
          <Icon name="excel" />
          <span>インポート</span>
        </button>
      </header>

      <div className="ms-register-content">
        <Stepper />

        <section className="ms-register-card">
          <div className="ms-card-head">
            <h2>基本情報</h2>
            <span>⌄</span>
          </div>
          <div className="ms-basic-grid">
            <p>機種名： <b>{machine.name}</b></p>
            <p>タイプ： <b>P</b></p>
            <p>確率： <b>{machine.probability}</b></p>
            <p>ボーダー： <b>{machine.border}</b></p>
          </div>
        </section>

        <section className="ms-register-card">
          <div className="ms-card-head">
            <h2>出玉・RUSH設計 <Pill tone="blue">自動計算</Pill></h2>
            <span>⌃</span>
          </div>
          <div className="ms-form-grid">
            <Field label="1大当り平均出玉（削り込み）" value="1350" unit="発" />
            <Field label="ヘソ平均出玉(自動)" value="1500" unit="発" />
            <Field label="RUSH平均出玉" value="1500" unit="発" />
            <Field label="RUSH突入率" value="60" unit="%" />
            <Field label="RUSH継続率" value="75" unit="%" />
            <Field label="標準偏差" value="13000" unit="発" />
          </div>
          <div className="ms-info-note">
            <span>i</span>
            <strong>1500発表示 → 1400/1430削り込みで管理</strong>
          </div>
        </section>

        <section className="ms-register-card">
          <div className="ms-card-head">
            <h2>特図1・ヘソ振分 <Pill tone="success">比率合計 100%</Pill></h2>
            <button type="button" className="ms-small-icon" aria-label="ヘソ振分を追加">
              <Icon name="plus" />
            </button>
          </div>
          <div className="ms-heso-list">
            {machine.heso.map((row, index) => (
              <div className="ms-heso-row" key={row.id}>
                <span className="ms-grip">⋮⋮</span>
                <strong>{row.id}</strong>
                <Field compact label="出玉" value={row.payout} unit="発" />
                <Field compact label="比率" value={row.ratio} unit="%" />
                <div className="ms-rush-toggle">
                  <span>RUSH突入</span>
                  <Toggle checked={row.rush} />
                </div>
                <button type="button" className="ms-trash" aria-label={`${row.id}を削除`}>
                  <Icon name="trash" />
                </button>
                {index < machine.heso.length - 1 && <div className="ms-row-line" />}
              </div>
            ))}
          </div>
        </section>

        <section className="ms-register-card">
          <h2>P-EVIDENCE列マッピング</h2>
          <div className="ms-segmented">
            <button type="button" className="active">必須</button>
            <button type="button">出玉</button>
            <button type="button">MC</button>
            <button type="button">振分</button>
          </div>
          <div className="ms-mapping-grid-register">
            {mappingItems.slice(0, 6).map(([col, label]) => (
              <div key={`${col}-${label}`} className="ms-map-pill">
                <CheckMark />
                <span>{col}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
          <div className="ms-scroll-hint">← 横にスクロールできます →</div>
        </section>

        <section className="ms-preview">
          <div>
            <h2>TSV出力プレビュー</h2>
            <span>1行目のプレビュー</span>
          </div>
          <div className="ms-preview-strip">
            {machine.tsv.map((cell) => (
              <span key={cell}>{cell}</span>
            ))}
          </div>
        </section>
      </div>

      <div className="ms-save-bar">
        <div className="ms-save-status">
          <CheckMark />
          <div>
            <strong>保存可能・エラー0</strong>
            <span>必須項目はすべて入力済みです</span>
          </div>
        </div>
        <button type="button" className="ms-sync-button">
          <Icon name="sync" />
          <span>同期</span>
        </button>
        <button type="button" className="ms-save-button" onClick={onSave}>登録する</button>
      </div>
    </section>
  );
}

export default function MachineSpecWorkspace({
  onBack,
  machineData,
  primaryActionLabel = "営業シミュレーションへ",
  onPrimaryAction,
}) {
  const [screen, setScreen] = useState("detail");
  const machine = normalizeMachine(machineData);

  if (screen === "register") {
    return <RegisterScreen machine={machine} onSave={() => setScreen("detail")} onBack={() => setScreen("detail")} />;
  }

  return (
    <DetailScreen
      machine={machine}
      onEdit={() => setScreen("register")}
      onBack={onBack}
      primaryActionLabel={primaryActionLabel}
      onPrimaryAction={onPrimaryAction}
    />
  );
}
