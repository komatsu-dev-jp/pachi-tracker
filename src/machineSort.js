const japaneseCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

export const MACHINE_SORT_OPTIONS = Object.freeze([
  { value: "default", label: "登録順" },
  { value: "name-asc", label: "機種名（カナ順）" },
  { value: "name-desc", label: "機種名（逆順）" },
  { value: "maker-asc", label: "メーカー順" },
  { value: "prob-asc", label: "大当り確率（軽い順）" },
  { value: "prob-desc", label: "大当り確率（重い順）" },
  { value: "updated-desc", label: "更新が新しい順" },
]);

export const MACHINE_PROBABILITY_FILTER_OPTIONS = Object.freeze([
  { value: "all", label: "すべて" },
  { value: "under-130", label: "〜1/129" },
  { value: "130-199", label: "1/130〜199" },
  { value: "200-319", label: "1/200〜319" },
  { value: "over-320", label: "1/320〜" },
]);

function text(value) {
  return String(value || "").normalize("NFKC").trim();
}

// P・PA・eなどの型式記号は読み順に影響させず、作品名を基準に並べる。
function machineNameKey(machine) {
  const reading = text(machine?.kana || machine?.reading);
  if (reading) return reading;
  return text(machine?.name).replace(/^(?:P(?:A|F)?|e)\s*/i, "");
}

function compareText(left, right) {
  return japaneseCollator.compare(text(left), text(right));
}

function compareOptionalText(left, right) {
  const a = text(left);
  const b = text(right);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compareText(a, b);
}

function probability(machine) {
  const direct = Number(machine?.synthProb);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = text(machine?.prob).match(/1\s*\/\s*([\d.]+)/);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

export function getMachineMakerKey(machine) {
  const maker = text(machine?.maker);
  const alias = {
    sankyo: "SANKYO",
    kyoraku: "京楽",
    "京楽": "京楽",
    sammy: "サミー",
    "サミー": "サミー",
  }[maker.toLowerCase()];
  return alias || maker || "メーカー未設定";
}

function machineTypeKey(machine) {
  const type = text(machine?.type);
  if (type.includes("スマパチ")) return "スマパチ";
  if (type.includes("ハイミドル")) return "ハイミドル";
  if (type.includes("ライトミドル")) return "ライトミドル";
  if (type.includes("甘デジ")) return "甘デジ";
  if (type.includes("ミドル")) return "ミドル";
  return type;
}

function matchesProbabilityFilter(machine, filter) {
  if (filter === "all") return true;
  const value = probability(machine);
  if (!Number.isFinite(value)) return false;
  if (filter === "under-130") return value < 130;
  if (filter === "130-199") return value >= 130 && value < 200;
  if (filter === "200-319") return value >= 200 && value < 320;
  if (filter === "over-320") return value >= 320;
  return true;
}

export function filterMachines(machines, filters = {}) {
  const list = Array.isArray(machines) ? machines : [];
  const type = filters.type || "all";
  const maker = filters.maker || "all";
  const probabilityFilter = filters.probability || "all";

  return list.filter((machine) => (
    (type === "all" || machineTypeKey(machine) === type)
    && (maker === "all" || getMachineMakerKey(machine) === maker)
    && matchesProbabilityFilter(machine, probabilityFilter)
  ));
}

function updatedTime(machine) {
  const time = Date.parse(text(machine?.dataUpdatedAt));
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function compareMachineNames(left, right) {
  return compareText(machineNameKey(left), machineNameKey(right))
    || compareText(left?.name, right?.name);
}

export function sortMachines(machines, sort = "default") {
  const list = Array.isArray(machines) ? machines : [];
  if (sort === "default") return [...list];

  return list
    .map((machine, index) => ({ machine, index }))
    .sort((left, right) => {
      const a = left.machine;
      const b = right.machine;
      let compared = 0;

      if (sort === "name-asc") compared = compareMachineNames(a, b);
      if (sort === "name-desc") compared = compareMachineNames(b, a);
      if (sort === "maker-asc") {
        compared = compareOptionalText(a?.maker, b?.maker) || compareMachineNames(a, b);
      }
      if (sort === "prob-asc") {
        compared = probability(a) - probability(b) || compareMachineNames(a, b);
      }
      if (sort === "prob-desc") {
        const aProbability = probability(a);
        const bProbability = probability(b);
        if (!Number.isFinite(aProbability) && !Number.isFinite(bProbability)) compared = 0;
        else if (!Number.isFinite(aProbability)) compared = 1;
        else if (!Number.isFinite(bProbability)) compared = -1;
        else compared = bProbability - aProbability;
        compared ||= compareMachineNames(a, b);
      }
      if (sort === "updated-desc") {
        compared = updatedTime(b) - updatedTime(a) || compareMachineNames(a, b);
      }

      return compared || left.index - right.index;
    })
    .map(({ machine }) => machine);
}
