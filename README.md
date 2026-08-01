# Jpex — 工厂级电力风险地图（v3）

Public dataset: **JEPX regional spot prices × site-level temperature × manufacturing load profiles**.

分析主体是**日本先进制造产能所在地**，不是行政区。

## Structure

```
data/
  site_master.csv              # 17 manufacturing sites (semi + heavy)
  jepx_spot_daily.csv          # day-aggregated area prices + load windows
  jepx_spot_halfhourly.csv     # raw 48 half-hour slots
  jma_temp_daily.csv           # daily temps at 13 stations
  merged_analysis.csv          # area join + calendar flags
  raw_temp/                    # Open-Meteo JSON provenance
output/
  correlation_results.json     # 8-area Pearson / OLS / nonlinear
  site_exposure.json           # per-site risk metrics (core v3 deliverable)
  reserve_margin_context.json  # 2026 summer 供給予備率 (hand-entered)
README.md
```

## Version changelog

| version | highlight |
|---------|-----------|
| v1 | JEPX + synthetic temp; 4 areas; peak 13–16 |
| v2 | real Open-Meteo temps; CDD24; peak 09–16; nonlinear 35°C |
| **v3** | **site_master 17拠点; load-profile prices; 8 areas; fixed station map; site_exposure + reserve margin** |

## Area → station map (v3 fixes)

| jepx_area | primary_station | why |
|-----------|-----------------|-----|
| tokyo | tokyo | metro reference; Hitachi *sites* use **mito** |
| tohoku | **morioka** | was tokyo — キオクシア北上 |
| chubu | nagoya | + **yokkaichi** site station for キオクシア四日市 |
| kansai | **kobe** | was osaka — MHI/KHI 兵庫群 |
| chugoku | **hiroshima** | was osaka — 日立笠戸 |
| shikoku | **takamatsu** | was nagasaki — 川崎坂出 |
| kyushu | **kumamoto** | JASM/Sony 菊陽集群; MHI 長崎 site uses nagasaki |
| hokkaido | **chitose** | was sapporo — Rapidus 千歳 |
| hokuriku | nagoya | proxy |
| system | tokyo | reference only — **never use for plant risk** |

### Stations (13)

| station | lat | lon | purpose |
|---------|-----|-----|---------|
| tokyo | 35.6895 | 139.6917 | tokyo area |
| mito | 36.3418 | 140.4468 | 日立 日立/大みか |
| morioka | 39.7036 | 141.1527 | キオクシア北上 |
| nagoya | 35.1815 | 136.9066 | chubu / MHI aero |
| yokkaichi | 34.9650 | 136.6244 | キオクシア四日市 |
| kobe | 34.6901 | 135.1955 | kansai 兵庫群 |
| osaka | 34.6937 | 135.5023 | retained |
| hiroshima | 34.3853 | 132.4553 | 日立笠戸 |
| takamatsu | 34.3401 | 134.0434 | 川崎坂出 |
| nagasaki | 32.7503 | 129.8779 | MHI 長崎 |
| kumamoto | 32.8032 | 130.7079 | JASM / Sony |
| chitose | 42.8221 | 141.6521 | Rapidus |
| sapporo | 43.0618 | 141.3545 | retained contrast |

Temps: Open-Meteo archive (`temperature_2m_max/min/mean`), **not** official JMA obsdl. Schema is drop-in replaceable.

## Load-profile prices (core v3)

`data/jepx_spot_daily.csv` columns:

| column | window | used by |
|--------|--------|---------|
| baseload_price | all 48 slots | **semi** `baseload_24h` |
| daytime_price | time_code **17–36** (08:00–18:00) | **heavy** `daytime_shift` |
| night_price | **45–48 + 1–14** (22:00–07:00) | night exposure |
| solar_crush_price | **21–30** (10:00–15:00) | Kyushu PV dump window |
| peak_price | **19–32** (09:00–16:00) | legacy / general peak |
| avg_price | same as baseload | back-compat alias |
| max_price / min_price | 48-slot extreme | tail risk |

**Why this matters:** Kyushu midday can print ~0.01 円/kWh. JASM is 24h baseload — true cost sits in **night_price**, not solar_crush / peak. Using peak alone **systematically understates** fab power cost.

`night_day_spread = night_price − solar_crush_price` (summer weekday mean) is a key JASM risk indicator (should be **positive** in Kyushu).

## `data/site_master.csv`

| field | definition |
|-------|------------|
| site_id | stable key |
| company | TSMC / Sony / Rapidus / Kioxia / MHI / KHI / Hitachi |
| site_name | Japanese plant name |
| city, prefecture | location |
| jepx_area | JEPX pricing area |
| primary_station | temperature station for *this site* |
| sector | `semi` \| `heavy` |
| load_profile | `baseload_24h` \| `daytime_shift` |
| status | operating / construction / pilot |
| capex_jpy_oku | announced capex (億円), blank if n/a |
| note | free text |

**17 sites:** 6 semi (JASM×2, Sony TEC, Rapidus, Kioxia 四日市/北上) + 11 heavy (MHI×4, KHI×4, Hitachi×3).

## `output/site_exposure.json`

Per `site_id`:

1. Correlations / OLS: **cdd24 & tmax vs load price** (baseload or daytime)
2. **piecewise35** + quadratic nonlinear models
3. Summer-weekday quantiles: **p50 / p75 / p90 / p95 / max / mean**
4. **spike_frequency**: fraction of summer weekdays with load price **> 30 円/kWh**
5. **night_day_spread** stats (mean, p50, p90)
6. Rankings: by spike, by p95, by night_day_spread

## `output/reserve_margin_context.json`

2026 summer 供給予備率 (METI/OCCTO, hand-entered):

- **tokyo Aug 0.9%** — only sub-1% area; Hitachi 日立/大みか in this zone
- hokkaido min ~6.1–8.3%
- Implications block links sites ↔ reserve risk

## `output/correlation_results.json`

8 focus areas (tokyo, kansai, kyushu, chubu, **tohoku, chugoku, shikoku, hokkaido**):

- samples: all / weekday_only / summer_weekday / heat_days_weekday
- correlations & regressions for peak / baseload / daytime
- nonlinear quadratic + piecewise35
- `r2_comparison_summer_weekday`

## Modeling rules (unchanged)

1. Aggregate time codes **before** daily analytics
2. Exclude `is_obon=1`; prefer `is_weekend=0`
3. **Area prices only** — never system alone for plants
4. Summer linear collapse → trust **quadratic / piecewise35**
5. CDD: `cdd24 = max(0, tavg − 24)` with true daily mean

## Date coverage

- JEPX: 2025/04/01 → 2026/08/02
- Temp join: 2025/04/01 → 2026/08/01
- Encoding: UTF-8, LF, no BOM

## Recompute recipes

```python
import pandas as pd, json
sites = pd.read_csv("data/site_master.csv")
daily = pd.read_csv("data/jepx_spot_daily.csv")
merged = pd.read_csv("data/merged_analysis.csv")
exp = json.load(open("output/site_exposure.json"))

# JASM night-day spread vs baseload
j = [s for s in exp["sites"] if s["site_id"]=="jasm_fab1"][0]
print(j["night_day_spread_summer_weekday"])
print(j["price_quantiles_summer_weekday"])

# Hitachi in thin reserve zone
h = [s for s in exp["sites"] if s["site_id"]=="hitachi_hitachi"][0]
print(h["spike_frequency"], h["price_quantiles_summer_weekday"]["p95"])
```

## Sources

- JEPX spot: https://www.jepx.jp/electricpower/market-data/spot/
- Open-Meteo archive: https://archive-api.open-meteo.com/v1/archive
- Reserve margins: 経産省 / OCCTO 2026 summer outlook (manual entry)

## License

JEPX subject to JEPX terms. Open-Meteo temps for analysis; replace with JMA official for regulatory work.
