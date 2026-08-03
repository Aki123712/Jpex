# Jpex — 产业链电力风险地图（v5）

Public dataset: **JEPX area prices × semiconductor supply-chain plant sites × cluster & multi-site power redundancy**.

## Structure

```
data/
  site_master.csv              # 37 sites
  jepx_spot_daily.csv          # 9 areas × load windows (incl. hokuriku)
  jepx_spot_halfhourly.csv
  jma_temp_daily.csv           # 27 stations
  merged_analysis.csv
  raw_temp/*.json
output/
  correlation_results.json     # 9 areas; n_obs + p_value; piecewise confidence
  site_exposure.json
  chokepoint_risk.json         # v4 site-level (kept)
  tokyo_anomaly.json           # v4 (kept)
  cluster_risk.json            # NEW: area density × tail risk
  redundancy_check.json        # NEW: multi-site power co-movement
  reserve_margin_context.json
README.md
```

## Version

| version | highlight |
|---------|-----------|
| v4 | materials tier; chokepoint; tokyo anomaly |
| **v5** | **hokuriku 第9エリア; +11 sites (Shin-Etsu/JSR/TOK/Tosoh/SUMCO/Lasertec); cluster_risk; redundancy_check** |

## 9 JEPX areas

`hokkaido / tohoku / tokyo / chubu / **hokuriku** / kansai / chugoku / shikoku / kyushu`

### Area → station (v5)

| area | station | note |
|------|---------|------|
| hokuriku | **fukui** | was incorrectly lumped with nagoya; fixed |
| tohoku | morioka | site stations: joetsu, yamagata, fukushima, … |
| tokyo | tokyo | site stations: hachioji, kofu, maebashi, chiba, yokohama, mito |
| others | (unchanged from v3/v4) | |

## site_master additions (v5)

**+11 sites** (total **37**):

| company | sites |
|---------|--------|
| Shin-Etsu | 直江津(tohoku/joetsu), 武生(hokuriku/fukui), 伊勢崎(tokyo/maebashi) |
| JSR | 四日市, 千葉(市原) |
| TOK | 相模/寒川 (yokohama station) |
| Tosoh | 南陽, 四日市 |
| SUMCO | 伊万里(saga), 米沢(yamagata) |
| Lasertec | 新横浜 **office_rnd 対照群** |

`supply_chain_tier` values: `tier1_material` | `tier2_component` | `fab_leading` | `fab_memory` | `heavy` | **`equipment`**

Load price: material/semi → `baseload_price`; heavy & **office_rnd/equipment** → `daytime_price`.

## New stations (v5)

`fukui, joetsu, maebashi, chiba, yokohama, saga, yamagata` (+ keep all prior) → **27** total.

## `output/cluster_risk.json`

Area-level density (not site-level):

```
chokepoint_density = tier1_material_count + fab_leading_count
cluster_exposure = density × (spike_freq + 1) × (baseload_p95 / median_p95_across_9_areas)
```

Focus clusters documented:

1. **四日市 (chubu)** — Kioxia NAND + JSR resist + Tosoh  
2. **東京** — HOYA / Shin-Etsu 伊勢崎 / TOK / JSR 千葉 / Hitachi + 0.9% reserve  
3. **東北** — Kioxia 北上 + AGC + Shin-Etsu 直江津 + SUMCO 米沢  

## `output/redundancy_check.json` (core v5)

Hypothesis: **multi-site geographic diversification fails if area power prices co-move.**

- Full **9×9** summer-weekday `baseload_price` correlation matrix  
- Per multi-area company: pairwise r, `redundancy_score = 1 − mean(pairwise r)`  
- Explicit Shin-Etsu **直江津(tohoku) vs 武生(hokuriku)** pair  

Interpretation guide:

| mean pairwise r | redundancy_score | meaning |
|----------------:|-----------------:|---------|
| ~1.0 | ~0 | power shocks hit all sites together |
| ~0.5 | ~0.5 | partial diversification |
| ~0 | ~1 | true power-price diversification |

## Stats hygiene (unchanged)

- Pearson: `{ r, n_obs, p_value }`  
- piecewise35: `n_above_35`, `n_below_35`, `low_confidence` if `n_above_35 < 10`  
- Power consumption: always `null` if not public  
- Unverified sites: metrics withheld  

## Counts (v5)

| item | n |
|------|--:|
| focus areas | **9** |
| stations | **27** |
| new stations this version | **7** |
| sites | **37** |
| new sites this version | **11** |

## Modeling rules

- `is_obon` excluded; prefer `is_weekend=0`  
- Area prices only (never system for plant risk)  
- Peak 09:00–16:00 (`time_code` 19–32)  
- CDD24 with true daily mean  
- UTF-8 / LF / no BOM  

## Sources

JEPX spot CSVs · Open-Meteo archive · METI/OCCTO reserve margins · company plant lists / IR

## Interactive dashboard

前端程序在 [`dashboard/`](./dashboard/)：

```bash
cd dashboard && npm install && npm run dev
```

- 情景推演（基准 / 猛暑 / 猛暑+故障）
- 区域峰价走势、气温×峰价散点（Tooltip 深色可读）
- 日内 48 时段曲线
- 数据：`dashboard/public/data/jepx-model.json`

## Data freshness

- JEPX spot (area price): **2025/04/01 → 2026/08/04** (official `spot_summary`, last refresh 2026-08-03)
- Temperature (Open-Meteo archive): through **2026-08-03** (archive lag; 08-04 weather not yet final)
- Source: JEPX `csv_read.php` + Open-Meteo ERA5 daily

