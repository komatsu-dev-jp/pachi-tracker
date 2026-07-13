import React, { useRef, useState } from "react";
import "./MachineSpecWorkspace.css";
import {
  formatNumber,
  plainNum,
  sumRatio,
  buildDist,
  normalizeMachine,
  buildMachineOverride,
  buildTsv,
} from "./machineSpecModel";

// 詳細画面の列マッピング一覧（全列）
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

// 登録画面のセグメント別 列グループ（タブ切替で表示を絞り込む）
const mappingGroups = {
  必須: [
    ["A", "機種名"],
    ["B", "確率"],
    ["C", "ボーダー"],
    ["D", "賞球"],
    ["F", "平均出玉"],
    ["L", "ヘソ平均"],
  ],
  出玉: [
    ["F", "平均出玉"],
    ["L", "ヘソ平均"],
    ["M", "RUSH平均"],
    ["G", "標準偏差"],
  ],
  MC: [
    ["H", "初期確率"],
    ["I", "ムラ係数"],
    ["J", "空間感応度"],
    ["K", "レジーム感応度"],
    ["N", "RUSH突入率"],
    ["O", "RUSH継続率"],
    ["W", "MC期待日当"],
    ["X", "MC勝率"],
  ],
  振分: [
    ["Q〜V", "ヘソ振分"],
  ],
};
const segmentKeys = ["必須", "出玉", "MC", "振分"];

const validationItems = [
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

function allocationLabel(row) {
  const rounds = row.roundsLabel || (row.rounds ? `${row.rounds}R` : "");
  const payout = row.payoutLabel || `${formatNumber(row.payout, "0")}発`;
  const outcome = row.label || row.destination;
  return [rounds, payout, outcome].filter(Boolean).join("・");
}

function AllocationMode({ mode, tone = "success" }) {
  return (
    <div className="ms-allocation-mode">
      <div className="ms-allocation-head">
        <strong>{mode.name}</strong>
        <Pill tone={tone}>比率合計 {sumRatio(mode.rows)}%</Pill>
      </div>
      <div className="ms-chip-row">
        {mode.rows.map((row) => (
          <React.Fragment key={row.id}>
            <span>{allocationLabel(row)}</span>
            <strong>{row.ratio}%</strong>
          </React.Fragment>
        ))}
      </div>
      {mode.note && <p className="ms-allocation-note">{mode.note}</p>}
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

function DetailScreen({ machine, synced, onToggleSync, onEdit, onBack, primaryActionLabel, onPrimaryAction }) {
  const [tsvCopied, setTsvCopied] = useState(false);
  const hesoModes = machine.hesoModes?.length
    ? machine.hesoModes
    : [{ id: "heso-default", name: "特図1・ヘソ", rows: machine.heso }];
  const rushModes = machine.rushModes?.length
    ? machine.rushModes
    : [{ id: "rush-default", name: "特図2・RUSH", rows: machine.rush || [] }];
  const allocationRatioOk = machine.allocationUsable
    && [...hesoModes, ...rushModes].every((mode) => mode.rows.length > 0 && Math.abs(sumRatio(mode.rows) - 100) < 0.001);

  const copyTsv = async () => {
    const text = machine.tsv.join("\t");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setTsvCopied(true);
      setTimeout(() => setTsvCopied(false), 1500);
    } catch {
      // クリップボード非対応環境では何もしない
    }
  };

  return (
    <section className="machine-spec-workspace machine-detail-screen" aria-label="機種詳細">
      <header className="ms-detail-header">
        <button type="button" className="ms-icon-button" aria-label="戻る" onClick={onBack}>
          <Icon name="back" />
        </button>
        <div className="ms-detail-title-block">
          <h1>機種詳細</h1>
          <Pill tone={synced ? "success" : "sync"}>
            {synced ? "登録済み・P-EVIDENCE同期OK" : "登録済み・P-EVIDENCE未同期"}
          </Pill>
        </div>
        <div className="ms-detail-actions">
          <ActionButton icon="edit" label="編集" onClick={onEdit} />
          <ActionButton icon="sync" label={synced ? "同期済" : "同期"} onClick={onToggleSync} />
        </div>
      </header>

      <main className="ms-detail-content">
        <section className="ms-hero-panel">
          <h2>{machine.name}</h2>
          <p>{machine.meta}</p>
          <div className="ms-model-name">
            <span>正式型式</span>
            <strong>{machine.modelName}</strong>
            {machine.modelVerified && <Pill tone="success">型式確認済み</Pill>}
            {machine.modelSourceUrl && (
              <a href={machine.modelSourceUrl} target="_blank" rel="noreferrer">確認元</a>
            )}
          </div>
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
          <MetricCard label="標準偏差" value={machine.stdDev} color="blue" sub={machine.stdDevSource} />
          <MetricCard label="RUSH突入率" value={machine.rushEntry} color="orange" />
          <MetricCard label="RUSH継続率" value={machine.rushContinue} color="orange" />
        </section>

        <section className="ms-panel">
          <h2>大当り振分サマリー</h2>
          <div className="ms-allocation-box">
            {!machine.allocationUsable ? (
              <p className="ms-allocation-note ms-allocation-note-global">
                公開情報との照合が未完了のため、振分は表示していません。共通の1500発などで自動補完せず、確認できた値だけを登録します。
              </p>
            ) : (
              <>
                {hesoModes.map((mode) => <AllocationMode key={mode.id} mode={mode} />)}
                <div className="ms-divider" />
                {rushModes.map((mode) => <AllocationMode key={mode.id} mode={mode} tone="orange" />)}
                {machine.allocationNote && <p className="ms-allocation-note ms-allocation-note-global">{machine.allocationNote}</p>}
                {machine.hasExplicitAllocationModes ? (
                  <p className="ms-allocation-note ms-allocation-note-global">
                    状態別の表を正しい振分として表示しています。平均出玉はP-EVIDENCE計算用の参考値です。
                  </p>
                ) : (
                  <div className="ms-summary-line">
                    ヘソ平均出玉 <b>{machine.hesoAvg}</b>
                    <span>/</span>
                    RUSH平均出玉 <b>{machine.rushAvg}</b>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="ms-panel">
          <div className="ms-panel-title-row">
            <h2>P-EVIDENCE登録内容</h2>
            <button type="button" className="ms-ghost-button" onClick={copyTsv}>
              {tsvCopied ? "コピーしました" : "TSV確認"}
            </button>
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
            <div className="ms-validation-item">
              <CheckMark status={allocationRatioOk ? "ok" : "warn"} />
              <span>{allocationRatioOk ? "振分比率合計 100%" : "振分未検証"}</span>
            </div>
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

function Stepper({ active, onStep }) {
  const steps = ["基本", "出玉", "振分", "検証"];
  return (
    <div className="ms-stepper" aria-label="登録ステップ">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <button
            type="button"
            className={`ms-step ${active === step ? "active" : ""}`}
            onClick={() => onStep(step)}
          >
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </button>
          {index < steps.length - 1 && <div className="ms-step-line" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function Field({ label, value, unit, compact, onChange }) {
  return (
    <label className={`ms-field ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <div>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        {unit && <em>{unit}</em>}
      </div>
    </label>
  );
}

function TextField({ label, value, onChange, compact }) {
  return (
    <label className={`ms-field ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <div className="single">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </div>
    </label>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      className={`ms-toggle ${checked ? "checked" : ""}`}
      aria-label="RUSH突入"
      aria-pressed={checked}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function RegisterScreen({ machine, onSave, onBack }) {
  const fileRef = useRef(null);
  const idRef = useRef(0);
  const basicRef = useRef(null);
  const payoutRef = useRef(null);
  const hesoRef = useRef(null);
  const mapRef = useRef(null);

  const [activeStep, setActiveStep] = useState("出玉");
  const [activeSeg, setActiveSeg] = useState("必須");
  const [openBasic, setOpenBasic] = useState(true);
  const [openPayout, setOpenPayout] = useState(true);
  const [form, setForm] = useState(() => ({
    name: machine.name || "",
    maker: machine.maker || "",
    type: machine.type || "",
    synthProb: plainNum(machine.synthProb),
    chargeProb: plainNum(machine.chargeProb),
    border1K: plainNum(machine.border1K),
    prize: plainNum(machine.prize),
    unitCost: plainNum(machine.unitCost),
    initialProb: plainNum(machine.initialProb),
    muraCoef: plainNum(machine.muraCoef),
    spatialSens: plainNum(machine.spatialSens),
    regimeSens: plainNum(machine.regimeSens),
    spec1R: plainNum(machine.spec1R),
    specAvgTotalRounds: plainNum(machine.specAvgTotalRounds),
    specSapo: plainNum(machine.specSapo),
    avgPayout: plainNum(machine.avgPayout),
    hesoAvg: plainNum(machine.hesoAvg),
    rushAvg: plainNum(machine.rushAvg),
    rushEntry: plainNum(machine.rushEntry),
    rushContinue: plainNum(machine.rushContinue),
    stdDev: plainNum(machine.stdDev),
    manualHesoValue: plainNum(machine.manualHesoValue),
    mcExpectedDaily: plainNum(machine.mcExpectedDaily),
    mcWinRate: plainNum(machine.mcWinRate),
    synced: !!machine.synced,
    heso: machine.heso.map((row, index) => ({
      key: `init-${index}`,
      payout: plainNum(row.payout),
      ratio: plainNum(row.ratio),
      rounds: plainNum(row.rounds),
      rush: !!row.rush,
    })),
    rush: (machine.rush || []).map((row, index) => ({
      key: `rinit-${index}`,
      payout: plainNum(row.payout),
      ratio: plainNum(row.ratio),
      rounds: plainNum(row.rounds),
    })),
  }));

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const patchHeso = (key, patch) =>
    setForm((f) => ({ ...f, heso: f.heso.map((h) => (h.key === key ? { ...h, ...patch } : h)) }));
  const addHeso = () =>
    setForm((f) => ({
      ...f,
      heso: [...f.heso, { key: `add-${(idRef.current += 1)}`, payout: "0", ratio: "0", rounds: "", rush: false }],
    }));
  const removeHeso = (key) => setForm((f) => ({ ...f, heso: f.heso.filter((h) => h.key !== key) }));
  const patchRush = (key, patch) =>
    setForm((f) => ({ ...f, rush: f.rush.map((h) => (h.key === key ? { ...h, ...patch } : h)) }));
  const addRush = () =>
    setForm((f) => ({
      ...f,
      rush: [...f.rush, { key: `radd-${(idRef.current += 1)}`, payout: "0", ratio: "0", rounds: "" }],
    }));
  const removeRush = (key) => setForm((f) => ({ ...f, rush: f.rush.filter((h) => h.key !== key) }));

  const refByStep = { 基本: basicRef, 出玉: payoutRef, 振分: hesoRef, 検証: mapRef };
  const goStep = (step) => {
    setActiveStep(step);
    refByStep[step]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const ratioSum = sumRatio(form.heso);
  const ratioOk = ratioSum === 100;
  const rushRatioSum = sumRatio(form.rush);
  const rushRatioOk = rushRatioSum === 100;
  const emptyRequired = [
    form.name.trim(),
    plainNum(form.synthProb),
    plainNum(form.border1K),
    plainNum(form.avgPayout),
    plainNum(form.rushEntry),
    plainNum(form.rushContinue),
  ].filter((v) => v === "").length;
  const errorCount = emptyRequired + (ratioOk ? 0 : 1) + (rushRatioOk ? 0 : 1);

  const previewTsv = buildTsv({
    ...machine,
    ...form,
  });

  const handleSave = () => {
    const updatedHeso = form.heso.map((h, i) => ({
      id: `ヘソ${i + 1}`,
      payout: plainNum(h.payout) || "0",
      ratio: plainNum(h.ratio) || "0",
      rounds: plainNum(h.rounds),
      rush: h.rush,
    }));
    const updatedRush = form.rush.map((h, i) => ({
      id: `RUSH${i + 1}`,
      payout: plainNum(h.payout) || "0",
      ratio: plainNum(h.ratio) || "0",
      rounds: plainNum(h.rounds),
    }));
    const updated = {
      ...machine,
      name: form.name.trim() || machine.name,
      maker: form.maker.trim(),
      type: form.type.trim(),
      synthProb: plainNum(form.synthProb),
      chargeProb: plainNum(form.chargeProb),
      probability: plainNum(form.synthProb) ? `1/${plainNum(form.synthProb)}` : machine.probability,
      border1K: plainNum(form.border1K),
      border: form.border1K ? formatNumber(form.border1K, machine.border) : machine.border,
      prize: plainNum(form.prize),
      unitCost: plainNum(form.unitCost),
      initialProb: plainNum(form.initialProb),
      muraCoef: plainNum(form.muraCoef),
      spatialSens: plainNum(form.spatialSens),
      regimeSens: plainNum(form.regimeSens),
      spec1R: plainNum(form.spec1R),
      specAvgTotalRounds: plainNum(form.specAvgTotalRounds),
      specSapo: plainNum(form.specSapo),
      avgPayout: form.avgPayout ? formatNumber(form.avgPayout, machine.avgPayout) : machine.avgPayout,
      hesoAvg: form.hesoAvg ? formatNumber(form.hesoAvg, machine.hesoAvg) : machine.hesoAvg,
      rushAvg: form.rushAvg ? formatNumber(form.rushAvg, machine.rushAvg) : machine.rushAvg,
      rushEntry: form.rushEntry ? `${form.rushEntry}%` : machine.rushEntry,
      rushContinue: form.rushContinue ? `${form.rushContinue}%` : machine.rushContinue,
      stdDev: form.stdDev ? formatNumber(form.stdDev, machine.stdDev) : machine.stdDev,
      manualHesoValue: plainNum(form.manualHesoValue),
      mcExpectedDaily: plainNum(form.mcExpectedDaily),
      mcWinRate: plainNum(form.mcWinRate),
      synced: form.synced,
      heso: updatedHeso,
      rush: updatedRush,
      hesoModes: machine.hesoModes?.map((mode, modeIndex) => modeIndex > 0 ? mode : ({
        ...mode,
        rows: updatedHeso.map((row, index) => ({ ...(mode.rows[index] || {}), ...row })),
      })) || [],
      rushModes: machine.rushModes?.map((mode, modeIndex) => modeIndex > 0 ? mode : ({
        ...mode,
        rows: updatedRush.map((row, index) => ({ ...(mode.rows[index] || {}), ...row })),
      })) || [],
      // R数が入力されていれば記録フロー用の roundDist / rushDist を再生成（未入力なら従来値を維持）
      roundDist: buildDist(form.heso) || machine.roundDist,
      rushDist: buildDist(form.rush) || machine.rushDist,
    };
    updated.meta = `${updated.maker || "メーカー未設定"} | ${updated.type || "タイプ未設定"}${updated.prize ? ` | ${updated.prize}個賞球` : ""}`;
    updated.tsv = buildTsv(updated);
    onSave(updated);
  };

  const handleImportClick = () => fileRef.current?.click();
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
      const cells = firstLine.split(/\t|,/).map((c) => c.trim());
      // TSV列順（機種名/確率/ボーダー/賞球/単価/平均出玉/標準偏差）に従い数値欄へ反映
      setForm((f) => ({
        ...f,
        name: cells[0] || f.name,
        synthProb: plainNum(cells[1]) || f.synthProb,
        border1K: plainNum(cells[2]) || f.border1K,
        prize: plainNum(cells[3]) || f.prize,
        unitCost: plainNum(cells[4]) || f.unitCost,
        avgPayout: plainNum(cells[5]) || f.avgPayout,
        stdDev: plainNum(cells[6]) || f.stdDev,
        initialProb: plainNum(cells[7]) || f.initialProb,
        muraCoef: plainNum(cells[8]) || f.muraCoef,
        spatialSens: plainNum(cells[9]) || f.spatialSens,
        regimeSens: plainNum(cells[10]) || f.regimeSens,
        hesoAvg: plainNum(cells[11]) || f.hesoAvg,
        rushAvg: plainNum(cells[12]) || f.rushAvg,
        rushEntry: plainNum(cells[13]) || f.rushEntry,
        rushContinue: plainNum(cells[14]) || f.rushContinue,
        manualHesoValue: plainNum(cells[15]) || f.manualHesoValue,
        mcExpectedDaily: plainNum(cells[22]) || f.mcExpectedDaily,
        mcWinRate: plainNum(cells[23]) || f.mcWinRate,
      }));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <section className="machine-spec-workspace machine-register-screen" aria-label="機種スペック登録">
      <header className="ms-register-header">
        <button type="button" className="ms-register-back" aria-label="戻る" onClick={onBack}>
          <Icon name="back" />
        </button>
        <div className="ms-register-title">
          <h1>機種スペック登録</h1>
          <Pill tone={form.synced ? "success" : "sync"}>
            {form.synced ? "P-EVIDENCE同期済み" : "P-EVIDENCE未同期"}
          </Pill>
        </div>
        <button type="button" className="ms-import-button" onClick={handleImportClick}>
          <Icon name="excel" />
          <span>インポート</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".tsv,.csv,.txt,text/tab-separated-values,text/csv,text/plain"
          onChange={handleImportFile}
          style={{ display: "none" }}
        />
      </header>

      <div className="ms-register-content">
        <Stepper active={activeStep} onStep={goStep} />

        <section className="ms-register-card" ref={basicRef}>
          <div className="ms-card-head">
            <h2>基本情報</h2>
            <button
              type="button"
              className="ms-collapse"
              aria-label={openBasic ? "基本情報を閉じる" : "基本情報を開く"}
              aria-expanded={openBasic}
              onClick={() => setOpenBasic((v) => !v)}
            >
              {openBasic ? "⌃" : "⌄"}
            </button>
          </div>
          {openBasic && (
            <div className="ms-form-grid">
              <TextField label="機種名" value={form.name} onChange={(v) => setField("name", v)} />
              <TextField label="メーカー" value={form.maker} onChange={(v) => setField("maker", v)} />
              <TextField label="タイプ" value={form.type} onChange={(v) => setField("type", v)} />
              <Field label="大当り確率" value={form.synthProb} unit="分母" onChange={(v) => setField("synthProb", v)} />
              <Field label="チャージ確率" value={form.chargeProb} unit="分母" onChange={(v) => setField("chargeProb", v)} />
              <Field label="ボーダー(1k)" value={form.border1K} unit="回" onChange={(v) => setField("border1K", v)} />
              <Field label="賞球数" value={form.prize} unit="個" onChange={(v) => setField("prize", v)} />
              <Field label="回転単価" value={form.unitCost} unit="円" onChange={(v) => setField("unitCost", v)} />
            </div>
          )}
        </section>

        <section className="ms-register-card" ref={payoutRef}>
          <div className="ms-card-head">
            <h2>出玉・RUSH設計 <Pill tone="blue">自動計算</Pill></h2>
            <button
              type="button"
              className="ms-collapse"
              aria-label={openPayout ? "出玉設計を閉じる" : "出玉設計を開く"}
              aria-expanded={openPayout}
              onClick={() => setOpenPayout((v) => !v)}
            >
              {openPayout ? "⌃" : "⌄"}
            </button>
          </div>
          {openPayout && (
            <>
              <div className="ms-form-grid">
                <Field label="1大当り平均出玉（削り込み）" value={form.avgPayout} unit="発" onChange={(v) => setField("avgPayout", v)} />
                <Field label="ヘソ平均出玉(自動)" value={form.hesoAvg} unit="発" onChange={(v) => setField("hesoAvg", v)} />
                <Field label="RUSH平均出玉" value={form.rushAvg} unit="発" onChange={(v) => setField("rushAvg", v)} />
                <Field label="RUSH突入率" value={form.rushEntry} unit="%" onChange={(v) => setField("rushEntry", v)} />
                <Field label="RUSH継続率" value={form.rushContinue} unit="%" onChange={(v) => setField("rushContinue", v)} />
                <Field label="標準偏差" value={form.stdDev} unit="発" onChange={(v) => setField("stdDev", v)} />
                <Field label="手動入力値(優先)" value={form.manualHesoValue} unit="発" onChange={(v) => setField("manualHesoValue", v)} />
              </div>
              <div className="ms-info-note">
                <span>i</span>
                <strong>1500発表示 → 1400/1430削り込みで管理</strong>
              </div>
            </>
          )}
        </section>

        <section className="ms-register-card">
          <div className="ms-card-head">
            <h2>MC・記録フロー補正</h2>
          </div>
          <div className="ms-form-grid">
            <Field label="初期確率" value={form.initialProb} onChange={(v) => setField("initialProb", v)} />
            <Field label="ムラ係数" value={form.muraCoef} onChange={(v) => setField("muraCoef", v)} />
            <Field label="空間感応度" value={form.spatialSens} onChange={(v) => setField("spatialSens", v)} />
            <Field label="レジーム感応度" value={form.regimeSens} onChange={(v) => setField("regimeSens", v)} />
            <Field label="MC期待日当" value={form.mcExpectedDaily} unit="円" onChange={(v) => setField("mcExpectedDaily", v)} />
            <Field label="MC勝率" value={form.mcWinRate} unit="%" onChange={(v) => setField("mcWinRate", v)} />
            <Field label="1R出玉（記録用）" value={form.spec1R} unit="発" onChange={(v) => setField("spec1R", v)} />
            <Field label="平均総R/初当り" value={form.specAvgTotalRounds} unit="R" onChange={(v) => setField("specAvgTotalRounds", v)} />
            <Field label="サポ増減" value={form.specSapo} unit="発" onChange={(v) => setField("specSapo", v)} />
          </div>
        </section>

        <section className="ms-register-card" ref={hesoRef}>
          <div className="ms-card-head">
            <h2>
              特図1・ヘソ振分（初当たり）{" "}
              <Pill tone={ratioOk ? "success" : "orange"}>比率合計 {ratioSum}%</Pill>
            </h2>
            <button type="button" className="ms-small-icon" aria-label="ヘソ振分を追加" onClick={addHeso}>
              <Icon name="plus" />
            </button>
          </div>
          <div className="ms-heso-list">
            {form.heso.length === 0 ? (
              <div className="ms-heso-empty">「＋」で振分を追加してください</div>
            ) : (
              form.heso.map((row, index) => (
                <div className="ms-heso-row" key={row.key}>
                  <div className="ms-heso-top">
                    <span className="ms-grip" aria-hidden>⋮⋮</span>
                    <strong>ヘソ{index + 1}</strong>
                    <div className="ms-rush-toggle">
                      <span>RUSH突入</span>
                      <Toggle checked={row.rush} onChange={() => patchHeso(row.key, { rush: !row.rush })} />
                    </div>
                    <button type="button" className="ms-trash" aria-label={`ヘソ${index + 1}を削除`} onClick={() => removeHeso(row.key)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                  <div className="ms-heso-inputs cols3">
                    <Field compact label="R数" value={row.rounds} unit="R" onChange={(v) => patchHeso(row.key, { rounds: v })} />
                    <Field compact label="出玉" value={row.payout} unit="発" onChange={(v) => patchHeso(row.key, { payout: v })} />
                    <Field compact label="比率" value={row.ratio} unit="%" onChange={(v) => patchHeso(row.key, { ratio: v })} />
                  </div>
                  {index < form.heso.length - 1 && <div className="ms-row-line" />}
                </div>
              ))
            )}
          </div>
          <div className="ms-info-note">
            <span>i</span>
            <strong>R数は大当たり後のラウンド入力プリセットに連動します</strong>
          </div>
        </section>

        <section className="ms-register-card">
          <div className="ms-card-head">
            <h2>
              特図2・RUSH振分（確変中）{" "}
              <Pill tone={rushRatioOk ? "success" : "orange"}>比率合計 {rushRatioSum}%</Pill>
            </h2>
            <button type="button" className="ms-small-icon" aria-label="RUSH振分を追加" onClick={addRush}>
              <Icon name="plus" />
            </button>
          </div>
          <div className="ms-heso-list">
            {form.rush.length === 0 ? (
              <div className="ms-heso-empty">「＋」で振分を追加してください</div>
            ) : (
              form.rush.map((row, index) => (
                <div className="ms-heso-row" key={row.key}>
                  <div className="ms-heso-top">
                    <span className="ms-grip" aria-hidden>⋮⋮</span>
                    <strong>RUSH{index + 1}</strong>
                    <button type="button" className="ms-trash" aria-label={`RUSH${index + 1}を削除`} onClick={() => removeRush(row.key)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                  <div className="ms-heso-inputs cols3">
                    <Field compact label="R数" value={row.rounds} unit="R" onChange={(v) => patchRush(row.key, { rounds: v })} />
                    <Field compact label="出玉" value={row.payout} unit="発" onChange={(v) => patchRush(row.key, { payout: v })} />
                    <Field compact label="比率" value={row.ratio} unit="%" onChange={(v) => patchRush(row.key, { ratio: v })} />
                  </div>
                  {index < form.rush.length - 1 && <div className="ms-row-line" />}
                </div>
              ))
            )}
          </div>
          <div className="ms-info-note">
            <span>i</span>
            <strong>R数・出玉・比率を設定（R数は連チャン入力プリセットに連動）</strong>
          </div>
        </section>

        <section className="ms-register-card" ref={mapRef}>
          <h2>P-EVIDENCE列マッピング</h2>
          <div className="ms-segmented">
            {segmentKeys.map((seg) => (
              <button
                key={seg}
                type="button"
                className={activeSeg === seg ? "active" : ""}
                onClick={() => setActiveSeg(seg)}
              >
                {seg}
              </button>
            ))}
          </div>
          <div className="ms-mapping-grid-register">
            {mappingGroups[activeSeg].map(([col, label]) => (
              <div key={`${col}-${label}`} className="ms-map-pill">
                <CheckMark />
                <span>{col}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
          <div className="ms-scroll-hint">タブで列グループを切り替えできます</div>
        </section>

        <section className="ms-preview">
          <div>
            <h2>TSV出力プレビュー</h2>
            <span>1行目のプレビュー</span>
          </div>
          <div className="ms-preview-strip">
            {previewTsv.map((cell, i) => (
              <span key={`${i}-${cell}`}>{cell}</span>
            ))}
          </div>
        </section>
      </div>

      <div className="ms-save-bar">
        <div className="ms-save-status">
          <CheckMark status={errorCount === 0 ? "ok" : "warn"} />
          <div>
            <strong>{errorCount === 0 ? "保存可能・エラー0" : `要確認・エラー${errorCount}`}</strong>
            <span>{errorCount === 0 ? "必須項目はすべて入力済みです" : "比率合計100%・必須項目を確認してください"}</span>
          </div>
        </div>
        <button
          type="button"
          className="ms-sync-button"
          onClick={() => setField("synced", !form.synced)}
        >
          <Icon name="sync" />
          <span>{form.synced ? "同期済" : "同期"}</span>
        </button>
        <button type="button" className="ms-save-button" onClick={handleSave}>登録する</button>
      </div>
    </section>
  );
}

export default function MachineSpecWorkspace({
  onBack,
  machineData,
  primaryActionLabel = "営業シミュレーションへ",
  onPrimaryAction,
  onPersist,
}) {
  const [screen, setScreen] = useState("detail");
  const [model, setModel] = useState(() => normalizeMachine(machineData));

  const toggleSync = () => setModel((m) => ({ ...m, synced: !m.synced }));

  if (screen === "register") {
    return (
      <RegisterScreen
        machine={model}
        onSave={(updated) => {
          setModel(updated);
          setScreen("detail");
          // 編集結果をカスタム機種として永続化（記録フローの roundDist/rushDist へ連携）。
          // onPersist 未指定（P-EVIDENCE デモ）の場合は従来どおりローカルのみ。
          if (onPersist) onPersist(buildMachineOverride(machineData, updated));
        }}
        onBack={() => setScreen("detail")}
      />
    );
  }

  return (
    <DetailScreen
      machine={model}
      synced={!!model.synced}
      onToggleSync={toggleSync}
      onEdit={() => setScreen("register")}
      onBack={onBack}
      primaryActionLabel={primaryActionLabel}
      onPrimaryAction={onPrimaryAction}
    />
  );
}
