# Jpex — 产业链电力风险地图（v4）

Public dataset: **JEPX area prices × site-level weather × semiconductor supply-chain nodes**.

分析主体是**先进制造与半导体上游材料/部材的工厂所在地**，不是行政区。

## Structure

```
data/
  site_master.csv              # 26 sites (fab + heavy + materials)
  jepx_spot_daily.csv          # load-window prices
  jepx_spot_halfhourly.csv     # 48 half-hour slots
  jma_temp_daily.csv           # 20 stations
  merged_analysis.csv
  raw_temp/*.json              # Open-Meteo provenance
output/
  correlation_results.json     # 8 areas; n_obs + p_value; piecewise confidence
  site_exposure.json           # per-site load-price risk
  chokepoint_risk.json         # NEW: oligopoly × reserve tightness heuristic
  tokyo_anomaly.json           # NEW: tokyo near-zero r but high tails + HOYA/Hitachi
  reserve_margin_context.json
README.md
```

## Version

| version | highlight |
|---------|-----------|
| v3 | 17 terminal plants; load prices; 8 areas |
| **v4** | **+materials chain; supply_chain_tier; chokepoint_risk; tokyo_anomaly; stats confidence flags** |

## `supply_chain_tier` (site_master)

| tier | meaning | examples |
|------|---------|----------|
| `tier1_material` | マスクブランクス / 高純度化学品 / EUV blanks | AGC, HOYA, Sumitomo Chemical |
| `tier2_component` | 基板材料 / 封止材 | Panasonic MEGTRON, Sumitomo Bakelite |
| `fab_leading` | 先端ロジック / CIS | JASM, Rapidus, Sony TEC |
| `fab_memory` | NAND | Kioxia |
| `heavy` | 重工 | MHI, KHI, Hitachi |

Load-price rule: **material + semi → `baseload_price`**; **heavy → `daytime_price`**.

## Primary-source notes (v4)

| site | verification |
|------|----------------|
| AGC 郡山 / 本宮 | [agcel.co.jp](https://www.agcel.co.jp/company.html) addresses confirmed |
| HOYA 八王子 / 長坂 | [hoya.com network](https://www.hoya.com/company/network/japan/) confirmed |
| HOYA 三島 | **unverified** — not listed on official HOYA Japan network for mask blanks; metrics withheld |
| Panasonic MEGTRON 国内 | **郡山** (not 新潟). Dempa: 日本（郡山）+ 海外増設（タイ/広州）. Registered as `panasonic_koriyama` |
| 耗電量 | always `null` unless public — **never estimated** |

## Stations (20)

v3 set (13) + **fukushima, hachioji, kofu, mishima, matsuyama, oita, niigata**.

`niigata` kept for future use; no verified Panasonic Niigata MEGTRON plant registered.

## Stats hygiene (v4 mandatory)

1. Every Pearson result: `{ r, n_obs, p_value }` (two-sided Student-t on r)
2. Every `piecewise35`: `n_above_35`, `n_below_35`, `low_confidence: true` if `n_above_35 < 10`
3. Large above-35 slopes with `low_confidence` are **not** treated as causal

## `output/chokepoint_risk.json`

Heuristic only (`meta.heuristic=true`):

```
chokepoint_score = oligopoly_score(1–5, manual) × reserve_tightness
tightness = (1 / aug_2026_reserve_margin) / max_over_areas(...)
```

Tokyo Aug **0.9%** → tightness = 1.0 → HOYA 八王子/長坂 top the ranking (oligopoly 5 × 1.0).

## `output/tokyo_anomaly.json`

Documents the v3 finding for **tokyo area** and HOYA/Hitachi sites:

- summer weekday linear `r(tmax, peak) ≈ 0` (p large)
- but daytime/baseload **p95 / spike** among highest of 8 areas
- channel: **reserve scarcity**, not average heat correlation

## Modeling rules

- Exclude `is_obon=1`; prefer `is_weekend=0`
- **Area prices only** (never system for plant risk)
- Peak window 09:00–16:00 (`time_code` 19–32)
- CDD24 with true daily mean
- UTF-8 / LF / no BOM

## Counts (v4)

| item | n |
|------|--:|
| stations | 20 |
| new stations this version | 7 |
| sites in site_master | 26 |
| new material sites | 9 (1 unverified) |
| focus areas | 8 |

## Sources

- JEPX spot market CSVs
- Open-Meteo historical archive
- METI/OCCTO summer reserve margins (hand-entered)
- Company site lists / IR for plant addresses

## License

JEPX per JEPX terms. Temps via Open-Meteo; replace with JMA for regulatory use.
