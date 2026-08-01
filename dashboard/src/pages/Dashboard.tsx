import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Database,
  Flame,
  Gauge,
  Info,
  Layers,
  Sun,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientOnly } from "@/components/ClientOnly";
import {
  type JepxData,
  type Region,
  type ScenarioId,
  REGION_COLOR,
  REGION_LABEL,
  SCENARIOS,
  STOCKS,
  filterForCorr,
  latestWeekday,
  regionStats,
  runScenario,
  stockImpact,
} from "@/lib/jepx-model";
import { cn } from "@/lib/utils";

/** Recharts defaults to near-black text — unreadable on dark panels */
const CHART_TOOLTIP = {
  contentStyle: {
    background: "#1e1e26",
    border: "1px solid #71717a",
    borderRadius: 10,
    fontSize: 12,
    color: "#fafafa",
    boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
    padding: "10px 12px",
  } as React.CSSProperties,
  labelStyle: { color: "#fafafa", fontWeight: 600 } as React.CSSProperties,
  itemStyle: { color: "#f4f4f5" } as React.CSSProperties,
};

const TICK = { fill: "#d4d4d8", fontSize: 11 } as const;
const TICK_SM = { fill: "#a1a1aa", fontSize: 10 } as const;
const GRID = "#3f3f46";

const REGIONS: Region[] = ["tokyo", "kansai", "kyushu", "chubu"];

export function DashboardPage() {
  const [data, setData] = useState<JepxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>("tokyo");
  const [scenario, setScenario] = useState<ScenarioId>("heatOutage");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/jepx-model.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: JepxData) => {
        setData(j);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const latest = data ? data.daily[data.daily.length - 1] : null;
  const baseDay = data ? latestWeekday(data.daily) : null;

  const scenarioResults = useMemo(() => {
    if (!baseDay) return [];
    return REGIONS.map((r) => runScenario(baseDay, scenario, r));
  }, [baseDay, scenario]);

  const stockScores = useMemo(() => {
    if (!baseDay) return [];
    return STOCKS.map((s) => {
      const res = runScenario(baseDay, scenario, s.region);
      return { stock: s, impact: stockImpact(s, res.basePeak, res.stressedPeak), res };
    }).sort((a, b) => a.impact.score - b.impact.score);
  }, [baseDay, scenario]);

  const corr = useMemo(() => {
    if (!data) return null;
    return Object.fromEntries(REGIONS.map((r) => [r, regionStats(data.recent, r)])) as Record<
      Region,
      ReturnType<typeof regionStats>
    >;
  }, [data]);

  const priceSeries = useMemo(() => {
    if (!data) return [];
    return data.recent.map((d) => ({
      date: d.date.slice(5),
      fullDate: d.date,
      dayType: d.dayType,
      tokyo: d.tokyo.peakMax,
      kansai: d.kansai.peakMax,
      kyushu: d.kyushu.peakMax,
      chubu: d.chubu.peakMax,
      system: d.system.peakMax,
      tokyoAvg: d.tokyo.avg,
      tempTokyo: d.temp.tokyo,
      tempKansai: d.temp.kansai,
      tempKyushu: d.temp.kyushu,
    }));
  }, [data]);

  const scatterData = useMemo(() => {
    if (!data) return [];
    return filterForCorr(data.recent).map((d) => ({
      temp: d.temp[region],
      peak: d[region].peakMax,
      avg: d[region].avg,
      date: d.date,
    }));
  }, [data, region]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-sm text-muted">加载 JEPX 区域价模型数据…</div>
      </div>
    );
  }

  if (error || !data || !latest || !baseDay) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="panel max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" />
          <p className="font-medium text-fg">数据加载失败</p>
          <p className="mt-2 text-sm text-muted">{error ?? "未知错误"}</p>
        </div>
      </div>
    );
  }

  const activeScenario = SCENARIOS.find((s) => s.id === scenario)!;
  const chartBarData = scenarioResults.map((r) => ({
    name: REGION_LABEL[r.region],
    base: r.basePeak,
    stressed: r.stressedPeak,
    region: r.region,
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="accent">
              <Database className="mr-1 h-3 w-3" />
              JEPX 官方 CSV
            </Badge>
            <Badge>数据截至 {data.meta.latestDate}</Badge>
            <Badge variant="warn">预备率风险 · 东京最紧</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">区域价敏感度模型</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            气温 × JEPX 区域价交叉推演 · 峰段优先 · 工作日/盂兰盆过滤 · 燃料费滞后 + 10月补贴退坡
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={region === r ? "default" : "secondary"}
              onClick={() => setRegion(r)}
              className={cn(region === r && "ring-1 ring-accent/40")}
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ background: REGION_COLOR[r] }}
              />
              {REGION_LABEL[r]}
            </Button>
          ))}
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {REGIONS.map((r) => {
          const p = latest[r];
          const tight = r === "tokyo";
          return (
            <div key={r} className={cn("panel p-4", region === r && "ring-1 ring-border-strong")}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">{REGION_LABEL[r]} · 最新日均</span>
                {tight && (
                  <Badge variant="danger" className="text-[10px]">
                    最紧
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular" style={{ color: REGION_COLOR[r] }}>
                  {p.avg.toFixed(1)}
                </span>
                <span className="text-xs text-subtle">円/kWh</span>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-muted">
                <span>
                  峰段均 <span className="tabular text-fg">{p.peakAvg.toFixed(1)}</span>
                </span>
                <span>
                  尖峰 <span className="tabular text-fg">{p.peakMax.toFixed(1)}</span>
                </span>
              </div>
              <div className="mt-2 text-xs text-subtle">
                气温约 {latest.temp[r].toFixed(1)}°C ·{" "}
                {latest.dayType === "weekend" ? "周末" : latest.dayType === "obon" ? "盂兰盆" : "工作日"}
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel mb-6 border-l-2 border-l-accent p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-accent" />
          建模硬规则（Perplexity 建议已内置）
        </div>
        <ul className="grid gap-2 text-xs text-muted sm:grid-cols-3">
          <li className="flex gap-2">
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span>
              <strong className="text-fg">时刻コード先聚合</strong>：48 个半小时 → 日均 / 峰段 09:00–16:00 单独看
            </span>
          </li>
          <li className="flex gap-2">
            <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            <span>
              <strong className="text-fg">工作日 / 周末 / 盂兰盆</strong>：8 月中旬工业用电低谷，混样本会毁掉相关性
            </span>
          </li>
          <li className="flex gap-2">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kyushu" />
            <span>
              <strong className="text-fg">区域价非系统价</strong>：九州白天光伏可压到 0.01 円，系统价看不见结构
            </span>
          </li>
        </ul>
      </section>

      <Tabs defaultValue="scenarios" className="mb-8">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="scenarios">情景推演</TabsTrigger>
          <TabsTrigger value="prices">区域价走势</TabsTrigger>
          <TabsTrigger value="temp">气温相关</TabsTrigger>
          <TabsTrigger value="intraday">日内曲线</TabsTrigger>
          <TabsTrigger value="sources">数据源</TabsTrigger>
        </TabsList>

        <TabsContent value="scenarios">
          <div className="mb-4 flex flex-wrap gap-2">
            {SCENARIOS.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={scenario === s.id ? "default" : "secondary"}
                onClick={() => setScenario(s.id)}
              >
                {s.id === "heatOutage" && <Flame className="h-3.5 w-3.5" />}
                {s.id === "heat" && <Sun className="h-3.5 w-3.5" />}
                {s.id === "base" && <Gauge className="h-3.5 w-3.5" />}
                {s.label}
              </Button>
            ))}
          </div>
          <p className="mb-4 text-sm text-muted">{activeScenario.desc}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              <h3 className="mb-1 text-sm font-medium">峰段尖峰价 · 情景冲击</h3>
              <p className="mb-4 text-xs text-subtle">
                基准日 {baseDay.date}（工作日）· 用区域价峰段 max，非系统均价
              </p>
              <div className="h-64 w-full">
                <ClientOnly>
                  <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                    <BarChart data={chartBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis dataKey="name" tick={TICK} />
                      <YAxis tick={TICK} unit=" 円" width={52} />
                      <Tooltip {...CHART_TOOLTIP} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#e4e4e7" }} />
                      <Bar dataKey="base" name="基准峰价" fill="#71717a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="stressed" name="情景峰价" radius={[4, 4, 0, 0]}>
                        {chartBarData.map((r) => (
                          <Cell key={r.region} fill={REGION_COLOR[r.region as Region]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ClientOnly>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {scenarioResults.map((r) => (
                  <div key={r.region} className="rounded-md bg-elevated px-2 py-1.5">
                    <div className="text-subtle">{REGION_LABEL[r.region]}</div>
                    <div className="tabular font-medium" style={{ color: REGION_COLOR[r.region] }}>
                      {r.basePeak.toFixed(1)} → {r.stressedPeak.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <h3 className="mb-1 text-sm font-medium">标的尾部冲击排序</h3>
              <p className="mb-4 text-xs text-subtle">负分 = 成本端被打 · 正分 = 高电价受益（发电/设备）</p>
              <div className="space-y-2">
                {stockScores.map(({ stock, impact }) => (
                  <div
                    key={stock.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-elevated/50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{stock.name}</span>
                        <span className="font-mono text-xs text-subtle">{stock.ticker}</span>
                        <Badge
                          variant={
                            impact.label === "重创" || impact.label === "承压"
                              ? "danger"
                              : impact.label === "受益" || impact.label === "偏多"
                                ? "success"
                                : "default"
                          }
                        >
                          {impact.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {stock.plant} · {REGION_LABEL[stock.region]} · {impact.detail}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">{stock.note}</p>
                    </div>
                    <div
                      className={cn(
                        "shrink-0 text-right font-mono text-lg font-semibold tabular",
                        impact.score < 0 ? "text-danger" : impact.score > 0 ? "text-success" : "text-muted",
                      )}
                    >
                      {impact.score > 0 ? "+" : ""}
                      {impact.score}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1 rounded-md border border-border bg-bg px-3 py-2 text-xs text-muted">
                <p className="flex items-start gap-2">
                  <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                  燃料费调整滞后 3–5 个月：今夏高价 → Q4 财报才体现
                </p>
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                  补贴退坡是 10 月确定性事件：与燃料费形成 10–12 月成本双击
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prices">
          <div className="panel p-4">
            <h3 className="mb-1 text-sm font-medium">近 60 日 · 区域峰段尖峰价</h3>
            <p className="mb-4 text-xs text-subtle">对比系统价：东京持续溢价；九州白天常被光伏压低</p>
            <div className="h-80 w-full">
              <ClientOnly>
                <ResponsiveContainer width="100%" height="100%" minHeight={320}>
                  <LineChart data={priceSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="date" tick={TICK_SM} interval="preserveStartEnd" minTickGap={32} />
                    <YAxis tick={TICK} unit=" 円" width={44} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#e4e4e7" }} />
                    <Line type="monotone" dataKey="system" name="系统价峰" stroke={REGION_COLOR.system} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    <Line type="monotone" dataKey="tokyo" name="东京" stroke={REGION_COLOR.tokyo} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="kansai" name="关西" stroke={REGION_COLOR.kansai} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="kyushu" name="九州" stroke={REGION_COLOR.kyushu} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="chubu" name="中部" stroke={REGION_COLOR.chubu} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ClientOnly>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="temp">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-4 lg:col-span-2">
              <h3 className="mb-1 text-sm font-medium">气温 vs 峰段尖峰 · {REGION_LABEL[region]}</h3>
              <p className="mb-4 text-xs text-subtle">
                已剔除周末与盂兰盆 · n={corr?.[region].n ?? 0} · 相关 r=
                {corr ? corr[region].corrTempPeak.toFixed(3) : "—"}
              </p>
              <div className="h-72 w-full">
                <ClientOnly>
                  <ResponsiveContainer width="100%" height="100%" minHeight={288}>
                    <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis
                        type="number"
                        dataKey="temp"
                        name="气温"
                        unit="°C"
                        tick={TICK}
                        domain={["auto", "auto"]}
                        stroke="#71717a"
                      />
                      <YAxis
                        type="number"
                        dataKey="peak"
                        name="峰价"
                        unit=" 円"
                        tick={TICK}
                        width={48}
                        stroke="#71717a"
                      />
                      <ZAxis range={[64, 64]} />
                      <Tooltip
                        cursor={{ stroke: "#a1a1aa", strokeDasharray: "4 4" }}
                        {...CHART_TOOLTIP}
                        formatter={(value: number, name: string) => {
                          if (name === "peak" || name === "峰价") return [`${Number(value).toFixed(2)} 円`, "峰价"];
                          if (name === "temp" || name === "气温") return [`${Number(value).toFixed(1)}°C`, "气温"];
                          return [value, name];
                        }}
                        labelFormatter={() => ""}
                      />
                      <Scatter
                        data={scatterData}
                        fill={REGION_COLOR[region]}
                        fillOpacity={0.9}
                        stroke="#ffffff"
                        strokeWidth={1.25}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ClientOnly>
              </div>
            </div>
            <div className="panel p-4">
              <h3 className="mb-3 text-sm font-medium">分区域相关系数</h3>
              <div className="space-y-3">
                {REGIONS.map((r) => {
                  const c = corr![r];
                  const abs = Math.abs(c.corrTempPeak);
                  return (
                    <div key={r}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted">{REGION_LABEL[r]}</span>
                        <span className="font-mono tabular" style={{ color: REGION_COLOR[r] }}>
                          r = {c.corrTempPeak.toFixed(3)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, abs * 100)}%`,
                            background: REGION_COLOR[r],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-subtle">
                东京预备率最薄，气温对峰价弹性通常最大；九州因光伏白天压价，相关结构不同。气温序列为基于季节性与价格残差校准的合成代理，正式研究请接气象厅日最高气温 CSV。
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="intraday">
          <div className="panel p-4">
            <h3 className="mb-1 text-sm font-medium">最新受渡日日内区域价 · {data.meta.latestDate}</h3>
            <p className="mb-4 text-xs text-subtle">
              半小时粒度 · 参考线为峰段 09:00 / 16:00 · 可见九州白天与东京背离
            </p>
            <div className="h-80 w-full">
              <ClientOnly>
                <ResponsiveContainer width="100%" height="100%" minHeight={320}>
                  <ComposedChart data={data.intraday} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="time" tick={TICK_SM} interval={3} />
                    <YAxis tick={TICK} unit=" 円" width={44} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#e4e4e7" }} />
                    <ReferenceLine x="09:00" stroke="#71717a" strokeDasharray="3 3" />
                    <ReferenceLine x="16:00" stroke="#71717a" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="system"
                      name="系统"
                      stroke={REGION_COLOR.system}
                      fill={REGION_COLOR.system}
                      fillOpacity={0.08}
                      strokeDasharray="4 4"
                      strokeWidth={1}
                    />
                    <Line type="monotone" dataKey="tokyo" name="东京" stroke={REGION_COLOR.tokyo} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="kansai" name="关西" stroke={REGION_COLOR.kansai} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="kyushu" name="九州" stroke={REGION_COLOR.kyushu} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="chubu" name="中部" stroke={REGION_COLOR.chubu} strokeWidth={1.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ClientOnly>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sources">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4 text-accent" />
                已接入 / 推荐权威源
              </h3>
              <ul className="space-y-3 text-sm">
                <li className="rounded-lg border border-border bg-elevated/40 p-3">
                  <div className="font-medium">JEPX 官方年度 CSV</div>
                  <p className="mt-1 text-xs text-muted">
                    spot_summary_2026.csv · 受渡日 + 時刻コード(1–48) + 系统价 + 9 区域价
                  </p>
                  <Badge variant="success" className="mt-2">
                    已抓取并聚合
                  </Badge>
                </li>
                <li className="rounded-lg border border-border bg-elevated/40 p-3">
                  <div className="font-medium">气象厅历史气温</div>
                  <p className="mt-1 text-xs text-muted">东京/大阪/神户/长崎/熊本/札幌 · 日最高气温 CSV</p>
                  <Badge className="mt-2">可替换当前合成气温代理</Badge>
                </li>
                <li className="rounded-lg border border-border bg-elevated/40 p-3">
                  <div className="font-medium">OCCTO 区域需给实绩</div>
                  <p className="mt-1 text-xs text-muted">电源種別 + 1 小时值 · 解释九州负价/近零价</p>
                </li>
                <li className="rounded-lg border border-border bg-elevated/40 p-3">
                  <div className="font-medium">关西电力送配电需给</div>
                  <p className="mt-1 text-xs text-muted">区域级更细 · 适合神户/播磨线</p>
                </li>
              </ul>
            </div>
            <div className="panel p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-accent" />
                本模型处理流水线
              </h3>
              <ol className="list-inside list-decimal space-y-2 text-xs text-muted">
                <li>从 jepx.jp 下载 spot_summary_2026（Shift_JIS → UTF-8）</li>
                <li>48 半小时 slot → 日均 / min / max / 峰段(19–32) 均与 max</li>
                <li>标记 dayType：weekday / weekend / obon（8/13–16）</li>
                <li>相关分析默认仅用工作日样本</li>
                <li>情景：基准 / 猛暑 / 猛暑+机组故障，区域差异化乘数</li>
                <li>标的冲击 = 成本敏感度 × 峰价涨幅 − 高电价受益项</li>
              </ol>
              <div className="mt-4 break-all rounded-md border border-border bg-bg p-3 font-mono text-[11px] text-subtle">
                source: {data.meta.source}
                <br />
                fetched: {new Date(data.meta.fetchedAt).toLocaleString("zh-CN")}
                <br />
                peak: {data.meta.peakWindow}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <footer className="border-t border-border pt-4 text-center text-xs text-subtle">
        JEPX 区域价敏感度模型 · 数据来自日本卸电力取引所公开 CSV · 非投资建议
      </footer>
    </div>
  );
}
