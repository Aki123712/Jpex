# Jpex — JEPX 区域价 × 气温 分析数据集

Private dataset repo for temperature–power-price cross analysis (Japan wholesale electricity market).

## Structure

```
data/
  jepx_spot_daily.csv        # day-aggregated area prices
  jepx_spot_halfhourly.csv   # raw 48 half-hour slots
  jma_temp_daily.csv         # daily temperatures (see TEMP note)
  merged_analysis.csv        # join + is_weekend / is_obon flags
output/
  correlation_results.json   # Pearson + OLS + scenario multipliers (machine-readable)
README.md
```

## Data sources

| File | Source | Fetched / generated |
|------|--------|---------------------|
| JEPX spot | [JEPX spot market data download](https://www.jepx.jp/electricpower/market-data/spot/) via `POST https://www.jepx.jp/_download.php` `dir=spot_summary&file=spot_summary_YYYY.csv` | 2026-08-01 HKT; files `spot_summary_2025.csv`, `spot_summary_2026.csv` |
| Temp | **SYNTHETIC climatology proxy** (not official JMA observations). Same schema so real JMA export can drop-in replace. | Generated 2026-08-01 |

### Official URLs to re-download JEPX

- UI: https://www.jepx.jp/electricpower/market-data/spot/
- Download form: `dir=spot_summary`, `file=spot_summary_2026.csv` (or `_2025.csv`)
- Encoding on wire: **Shift_JIS** → convert to UTF-8 before analysis

### JMA (recommended replacement for `jma_temp_daily.csv`)

- 気象庁 過去の気象データ検索: https://www.data.jma.go.jp/gmd/risk/obsdl/index.php
- Stations used as keys here: `tokyo`, `osaka`, `kobe`, `nagasaki`, `kumamoto`, `sapporo`
- Export daily: date, tmax, tmin, tavg; compute `cdd26 = max(0, tavg - 26)`

### Optional enrichments (not yet ingested)

- OCCTO エリア需給実績: https://www.occto.or.jp/
- 関西電力送配電 需給実績: https://www.kansai-td.co.jp/

## Date coverage

- JEPX: **2025/04/01 → 2026/08/02** (FY2025 full + FY2026 through latest available at fetch)
- Areas: `system`, `hokkaido`, `tohoku`, `tokyo`, `chubu`, `hokuriku`, `kansai`, `chugoku`, `shikoku`, `kyushu`

## Field dictionaries

### `data/jepx_spot_daily.csv`

| column | type | definition |
|--------|------|------------|
| date | YYYY/MM/DD | 受渡日 delivery date |
| area | string | area code (see above) |
| avg_price | float 円/kWh | mean of 48 half-hour prices |
| peak_price | float 円/kWh | mean of time_code **27–32** (13:00–16:00 JST) |
| max_price | float | max of 48 slots |
| min_price | float | min of 48 slots |

### `data/jepx_spot_halfhourly.csv`

| column | type | definition |
|--------|------|------------|
| date | YYYY/MM/DD | 受渡日 |
| time_code | 1–48 | JEPX 時刻コード (1 = 00:00–00:30) |
| time_label | HH:MM | slot start |
| area | string | area code |
| price | float 円/kWh | area (or system) price |

### `data/jma_temp_daily.csv`

| column | type | definition |
|--------|------|------------|
| date | YYYY/MM/DD | calendar date |
| station | string | tokyo / osaka / kobe / nagasaki / kumamoto / sapporo |
| tmax | float °C | daily max |
| tmin | float °C | daily min |
| tavg | float °C | (tmax+tmin)/2 |
| cdd26 | float | cooling degree-day base 26°C: max(0, tavg−26) |

**TEMP NOTE:** Values are synthetic seasonal proxies for pipeline testing. **Do not treat as observational JMA data.** Replace file in place with real exports keeping the same header.

### `data/merged_analysis.csv`

Join of daily area prices with primary station temp + calendar flags.

| column | definition |
|--------|------------|
| date, area, avg_price, peak_price, max_price, min_price | from daily JEPX |
| station | primary station mapped to area |
| tmax, tmin, tavg, cdd26 | from temp file |
| is_weekend | 1 if Sat/Sun |
| is_obon | 1 if Aug 13–16 (approx industrial trough window) |

Primary station map:

| area | station |
|------|---------|
| tokyo | tokyo |
| kansai, chubu, hokuriku, chugoku | osaka (chubu is proxy) |
| kyushu, shikoku | nagasaki |
| hokkaido | sapporo |
| tohoku, system | tokyo |

## Missing / special value policy

1. Non-numeric JEPX cells dropped at parse time.
2. If peak window empty (should not happen for complete days), `peak_price` falls back to `avg_price`.
3. No imputation across days.
4. Prices are **tax-excluded** 円/kWh as published by JEPX.

## Modeling rules (must-read)

1. **Aggregate time_code first** before daily analytics (48 slots → avg / peak / max / min).
2. **Filter calendar**: exclude `is_obon=1`; prefer `is_weekend=0` for industrial demand correlation.
3. **Use area prices**, not system alone — e.g. Kyushu midday can print ~0.01 円/kWh from solar while Tokyo is tight.
4. Under low reserve, risk is **right-skewed** — prefer `peak_price` / `max_price` over `avg_price`.

## `output/correlation_results.json`

Machine-readable cross-check file (not chart-only):

- `meta` — sources, date range, peak definition, missing policy
- `sample_definitions` — `all` / `weekday_only` / `summer_weekday`
- `summary_summer_weekday` — descriptive stats by area
- `correlations[sample][area]` — Pearson `r` + `n` for tmax/cdd26 vs peak/avg/max
- `regressions[sample][area]` — OLS slope, intercept, r², n (`peak ~ tmax`, `peak ~ cdd26`, `avg ~ tmax`)
- `scenario_model` — stress multipliers used in the companion dashboard (documented, not OLS-fitted)
- `verification_hints` — exact filter + columns to recompute Pearson

### Recompute example (Python)

```python
import pandas as pd
df = pd.read_csv("data/merged_analysis.csv")
s = df.query("area=='tokyo' and is_weekend==0 and is_obon==0")
print(s["tmax"].corr(s["peak_price"]))
```

Should match `correlations.weekday_only.tokyo.tmax_vs_peak_price.r` within rounding.

## Companion app rules (fuel lag / subsidy)

Not stored as time series here, but relevant for earnings mapping:

- Fuel cost adjustment lag **3–5 months** → summer high prices hit **Q4** statements.
- Usage subsidy phase-out is a **calendar-hard** cost step around **October**.

## License / usage

Private repository. JEPX data remain subject to JEPX terms of use. Synthetic temperatures are provided only for schema/pipeline testing.
