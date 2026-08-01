# Jpex — JEPX 区域价 × 气温 分析数据集

Public dataset for temperature–power-price cross analysis on Japan wholesale electricity (JEPX area prices).

## Structure

```
data/
  jepx_spot_daily.csv        # day-aggregated area prices
  jepx_spot_halfhourly.csv   # raw 48 half-hour slots
  jma_temp_daily.csv         # daily temperatures (Open-Meteo archive @ station coords)
  merged_analysis.csv        # join + is_weekend / is_obon flags
  raw_temp/                  # per-station Open-Meteo JSON pulls
output/
  correlation_results.json   # Pearson + OLS + quadratic/piecewise35 (machine-readable)
README.md
```

## Data sources

| File | Source | Fetched |
|------|--------|---------|
| JEPX spot | [JEPX spot market](https://www.jepx.jp/electricpower/market-data/spot/) via `POST https://www.jepx.jp/_download.php` (`dir=spot_summary`, `file=spot_summary_YYYY.csv`) | 2026-08-01; files 2025+2026 |
| Temp | [Open-Meteo Historical Weather API](https://archive-api.open-meteo.com/v1/archive) daily `temperature_2m_max/min/mean` at station lat/lon, `timezone=Asia/Tokyo` | 2026-08-01; range 2025-04-01 → 2026-08-01 |

### JEPX re-download

- Encoding on wire: **Shift_JIS** → convert to UTF-8
- Do **not** use system price alone for plant-level work — always area columns

### Temperature notes (important)

- **Not official JMA 観測所 CSV.** Same recommended cities (tokyo/osaka/nagoya/kobe/nagasaki/kumamoto/sapporo) via reanalysis grid points.
- `tavg` = **true daily mean** (`temperature_2m_mean`), **not** `(tmax+tmin)/2`.
- To swap in real JMA obsdl export: overwrite `data/jma_temp_daily.csv` keeping the header; recompute merge + `output/correlation_results.json`.

### Optional enrichments (not yet ingested)

- OCCTO エリア需給実績
- 関西電力送配電 需給実績

## Date coverage

- JEPX half-hourly / daily: **2025/04/01 → 2026/08/02**
- Temp join / merged: **2025/04/01 → 2026/08/01** (archive lag; 2026/08/02 dropped from merge)
- Areas: `system`, `hokkaido`, `tohoku`, `tokyo`, `chubu`, `hokuriku`, `kansai`, `chugoku`, `shikoku`, `kyushu`

## Field dictionaries

### `data/jepx_spot_daily.csv`

| column | definition |
|--------|------------|
| date | 受渡日 `YYYY/MM/DD` |
| area | area code |
| avg_price | mean of 48 half-hour prices (円/kWh) |
| peak_price | mean of time_code **19–32** (**09:00–16:00 JST**) |
| max_price / min_price | max/min of 48 slots |

### `data/jepx_spot_halfhourly.csv`

| column | definition |
|--------|------------|
| date, time_code (1–48), time_label, area, price | raw slots; code 1 = 00:00–00:30 |

### `data/jma_temp_daily.csv`

| column | definition |
|--------|------------|
| date, station | tokyo / osaka / **nagoya** / kobe / nagasaki / kumamoto / sapporo |
| tmax, tmin | daily max/min °C |
| tavg | true daily mean °C (API mean, not midrange) |
| cdd24 | **primary** cooling degree-day: `max(0, tavg − 24)` |
| cdd26 | legacy comparison: `max(0, tavg − 26)` |

### `data/merged_analysis.csv`

| column | definition |
|--------|------------|
| date, area, avg/peak/max/min_price | from daily JEPX |
| station | primary station for area |
| tmax, tmin, tavg, cdd24, cdd26 | from temp file |
| is_weekend | 1 if Sat/Sun |
| is_obon | 1 if Aug 13–16 |

### Area → station map

| area | station |
|------|---------|
| tokyo, tohoku, system | tokyo |
| **chubu, hokuriku** | **nagoya** |
| kansai, chugoku | osaka |
| kyushu, shikoku | nagasaki |
| hokkaido | sapporo |

(kobe / kumamoto available in temp file for alternate joins)

## Peak window change log

| version | peak window | time_code |
|---------|-------------|-----------|
| v1 (initial) | 13:00–16:00 | 27–32 |
| **v2 (current)** | **09:00–16:00** | **19–32** |

## CDD definition change log

| version | formula |
|---------|---------|
| v1 | `cdd26 = max(0, (tmax+tmin)/2 − 26)` synthetic |
| **v2** | **`cdd24 = max(0, tavg − 24)` with real daily mean** (+ `cdd26` kept for A/B) |

## Missing / special value policy

1. Non-numeric JEPX cells dropped at parse.
2. If peak window empty, `peak_price` falls back to `avg_price`.
3. Days without temp join excluded from `merged_analysis.csv` and correlations.
4. No cross-day imputation. Prices tax-excluded 円/kWh as published.

## Modeling rules

1. Aggregate time_code → daily avg / peak / max / min **before** analytics.
2. Filter calendar: drop `is_obon=1`; prefer `is_weekend=0` for industrial demand.
3. Use **area** prices (Kyushu midday can print ~0.01 円/kWh from solar while Tokyo is tight).
4. Under low reserve, risk is **right-skewed** — prefer `peak_price` / `max_price`.
5. Summer **linear** correlation often collapses; use **quadratic** or **piecewise at 35°C** (see JSON).

## `output/correlation_results.json`

Machine-readable (recompute/cross-check without charts):

- `meta` — sources, peak window, CDD definition, station coords
- `sample_definitions` — `all` / `weekday_only` / `summer_weekday` / `heat_days_weekday`
- `summary_summer_weekday` — descriptive stats + count of `tmax≥35` days
- `r2_comparison_summer_weekday` — linear vs quadratic vs piecewise35 lift
- `correlations[sample][area]` — Pearson `r` + `n`
- `regressions[sample][area]` — OLS slope / intercept / r²
- `nonlinear[sample][area]`:
  - `quadratic_peak_on_tmax`: `peak = a + b·tmax + c·tmax²`
  - `piecewise35_peak_on_tmax`: `peak = a + b·tmax + c·max(tmax−35, 0)`
  - `quadratic_peak_on_cdd24`
- `scenario_model` — dashboard stress multipliers (documented, not OLS-fitted)
- `verification_hints` — exact filters to recompute

### Headline check (summer_weekday, after v2 rebuild)

| area | linear R² (peak~tmax) | quadratic R² | piecewise35 R² |
|------|----------------------:|-------------:|---------------:|
| tokyo | ~0.00 | ~0.11 | ~0.08 |
| kansai | ~0.06 | ~0.14 | ~0.08 |
| chubu | ~0.01 | ~0.08 | ~0.04 |
| kyushu | ~0.01 | ~0.03 | ~0.01 |

Tokyo piecewise interpretation (summer weekday): slope ≈ flat/negative below 35°C; **+~1.8 円/kWh per °C above 35°C** on peak_price (see JSON for exact coefs).

### Recompute examples

```python
import pandas as pd
df = pd.read_csv("data/merged_analysis.csv")
s = df.query("area=='tokyo' and is_weekend==0 and is_obon==0 and date >= '2025/06/01' and date <= '2025/09/30' or area=='tokyo' and is_weekend==0 and is_obon==0")
# simpler summer filter:
s = df[(df.area=="tokyo") & (df.is_weekend==0) & (df.is_obon==0)]
s = s[s.date.str[5:7].isin(["06","07","08","09"])]
print(s["tmax"].corr(s["peak_price"]))          # linear Pearson
print(s["cdd24"].corr(s["peak_price"]))

# piecewise 35
import statsmodels.api as sm
x = s[["tmax"]].copy()
x["hinge35"] = (s["tmax"] - 35).clip(lower=0)
print(sm.OLS(s["peak_price"], sm.add_constant(x)).fit().summary())
```

## Fuel lag / subsidy (earnings mapping, not time series here)

- Fuel cost adjustment lag **3–5 months** → summer price spikes hit **Q4** statements.
- Usage subsidy phase-out is a **calendar-hard** cost step around **October**.

## License / usage

JEPX data subject to JEPX terms. Temperature via Open-Meteo (non-commercial friendly; check their license for redistribution). Replace with JMA official exports for regulatory-grade work.
