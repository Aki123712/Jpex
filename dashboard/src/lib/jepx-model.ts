/** JEPX regional price sensitivity model — Perplexity rules baked in */

export type Region = "tokyo" | "kansai" | "kyushu" | "chubu";
export type ScenarioId = "base" | "heat" | "heatOutage";
export type DayType = "weekday" | "weekend" | "obon";

export interface PriceStats {
  avg: number;
  max: number;
  min: number;
  peakAvg: number;
  peakMax: number;
}

export interface DailyRow {
  date: string;
  dayType: DayType;
  system: PriceStats;
  tokyo: PriceStats;
  kansai: PriceStats;
  kyushu: PriceStats;
  chubu: PriceStats;
  temp: Record<Region, number>;
}

export interface IntradaySlot {
  code: number;
  time: string;
  system: number;
  tokyo: number;
  kansai: number;
  kyushu: number;
  chubu: number;
}

export interface JepxData {
  meta: {
    source: string;
    fetchedAt: string;
    latestDate: string;
    peakWindow: string;
    notes: string[];
  };
  daily: DailyRow[];
  summer: DailyRow[];
  recent: DailyRow[];
  intraday: IntradaySlot[];
}

export const REGION_LABEL: Record<Region | "system", string> = {
  tokyo: "东京",
  kansai: "关西",
  kyushu: "九州",
  chubu: "中部",
  system: "系统价",
};

export const REGION_COLOR: Record<Region | "system", string> = {
  tokyo: "#f87171",
  kansai: "#38bdf8",
  kyushu: "#4ade80",
  chubu: "#fbbf24",
  system: "#a1a1aa",
};

export const SCENARIOS: {
  id: ScenarioId;
  label: string;
  desc: string;
  /** Multipliers on peak max relative to base */
  peakMult: Record<Region, number>;
  demandLift: number;
}[] = [
  {
    id: "base",
    label: "基准",
    desc: "当前夏季水平，无额外极端假设",
    peakMult: { tokyo: 1, kansai: 1, kyushu: 1, chubu: 1 },
    demandLift: 0,
  },
  {
    id: "heat",
    label: "猛暑 H1",
    desc: "十年一遇高温，空调负荷显著抬升",
    peakMult: { tokyo: 1.85, kansai: 1.55, kyushu: 1.35, chubu: 1.65 },
    demandLift: 0.07,
  },
  {
    id: "heatOutage",
    label: "猛暑 + 机组故障",
    desc: "高温叠加大型机组计划外停机，尾部风险右偏",
    peakMult: { tokyo: 3.2, kansai: 2.1, kyushu: 1.7, chubu: 2.4 },
    demandLift: 0.12,
  },
];

/** Stock impact profiles: electricity cost sensitivity */
export interface StockTarget {
  id: string;
  name: string;
  ticker: string;
  region: Region;
  plant: string;
  /** 0–1: how much earnings hurt when regional peak spikes */
  costSensitivity: number;
  /** benefit if high wholesale prices (generators/equipment) */
  benefitFromHighPrice: number;
  note: string;
}

export const STOCKS: StockTarget[] = [
  {
    id: "kioxia",
    name: "キオクシア",
    ticker: "285A",
    region: "chubu",
    plant: "四日市 fab",
    costSensitivity: 0.72,
    benefitFromHighPrice: 0.05,
    note: "NAND fab 高耗电；中部价会被东京连系线拖高",
  },
  {
    id: "mhi",
    name: "三菱重工",
    ticker: "7011",
    region: "kyushu",
    plant: "長崎",
    costSensitivity: 0.18,
    benefitFromHighPrice: 0.55,
    note: "电力成本占比低；燃气轮机/能源设备反而受益",
  },
  {
    id: "khi",
    name: "川崎重工",
    ticker: "7012",
    region: "kansai",
    plant: "関西",
    costSensitivity: 0.2,
    benefitFromHighPrice: 0.5,
    note: "多元化重工，电费非主矛盾",
  },
  {
    id: "tepco",
    name: "东京电力",
    ticker: "9501",
    region: "tokyo",
    plant: "東京エリア",
    costSensitivity: 0.35,
    benefitFromHighPrice: 0.65,
    note: "批发价高利好自有电源，零售端有滞后传导",
  },
  {
    id: "kepco",
    name: "关西电力",
    ticker: "9503",
    region: "kansai",
    plant: "関西エリア",
    costSensitivity: 0.25,
    benefitFromHighPrice: 0.7,
    note: "核电缓冲使区域价相对稳定",
  },
  {
    id: "kyuden",
    name: "九州电力",
    ticker: "9508",
    region: "kyushu",
    plant: "九州エリア",
    costSensitivity: 0.22,
    benefitFromHighPrice: 0.68,
    note: "白天光伏压价至近 0，结构与东京完全不同",
  },
];

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den === 0 ? 0 : num / den;
}

/** Filter out Obon + optionally weekends for clean correlation */
export function filterForCorr(
  rows: DailyRow[],
  opts: { excludeObon?: boolean; weekdaysOnly?: boolean } = {},
): DailyRow[] {
  const { excludeObon = true, weekdaysOnly = true } = opts;
  return rows.filter((r) => {
    if (excludeObon && r.dayType === "obon") return false;
    if (weekdaysOnly && r.dayType !== "weekday") return false;
    return true;
  });
}

export function regionStats(rows: DailyRow[], region: Region) {
  const clean = filterForCorr(rows);
  const temps = clean.map((r) => r.temp[region]);
  const peak = clean.map((r) => r[region].peakMax);
  const avg = clean.map((r) => r[region].avg);
  return {
    corrTempPeak: pearson(temps, peak),
    corrTempAvg: pearson(temps, avg),
    n: clean.length,
  };
}

export interface ScenarioResult {
  scenario: ScenarioId;
  region: Region;
  basePeak: number;
  stressedPeak: number;
  baseAvg: number;
  stressedAvg: number;
  fuelLagNote: string;
  subsidyNote: string;
}

export function runScenario(
  latest: DailyRow,
  scenarioId: ScenarioId,
  region: Region,
): ScenarioResult {
  const sc = SCENARIOS.find((s) => s.id === scenarioId)!;
  const basePeak = latest[region].peakMax;
  const baseAvg = latest[region].avg;
  // Right-skew: peak scales harder than average
  const stressedPeak = +(basePeak * sc.peakMult[region]).toFixed(2);
  const stressedAvg = +(baseAvg * (1 + sc.demandLift * 0.6 + (sc.peakMult[region] - 1) * 0.25)).toFixed(2);
  return {
    scenario: scenarioId,
    region,
    basePeak,
    stressedPeak,
    baseAvg,
    stressedAvg,
    fuelLagNote: "燃料费调整滞后 3–5 个月 → 今夏高价在 Q4 财报体现",
    subsidyNote: "补贴退坡 10 月确定性事件 → 与燃料费形成成本双击",
  };
}

/** Impact score: negative = hit hard (cost), positive = benefits */
export function stockImpact(
  stock: StockTarget,
  basePeak: number,
  stressedPeak: number,
): { score: number; label: string; detail: string } {
  const delta = Math.max(0, stressedPeak - basePeak);
  const hurt = -stock.costSensitivity * (delta / Math.max(basePeak, 1)) * 100;
  const help = stock.benefitFromHighPrice * (delta / Math.max(basePeak, 1)) * 40;
  const score = +(hurt + help).toFixed(1);
  let label = "中性";
  if (score <= -15) label = "重创";
  else if (score <= -5) label = "承压";
  else if (score >= 10) label = "受益";
  else if (score >= 3) label = "偏多";
  return {
    score,
    label,
    detail: `区域峰价 ${basePeak.toFixed(1)} → ${stressedPeak.toFixed(1)} 円/kWh（Δ${delta.toFixed(1)}）`,
  };
}

export function latestWeekday(rows: DailyRow[]): DailyRow {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].dayType === "weekday") return rows[i];
  }
  return rows[rows.length - 1];
}
