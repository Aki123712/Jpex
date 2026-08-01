import fs from 'fs';
import path from 'path';

const ROOT = '/workspace/Jpex';
const RAW = path.join(ROOT, 'data/raw_temp');

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).filter(Boolean).map(line => {
    const cols = line.split(',');
    const o = {};
    headers.forEach((h, i) => { o[h] = cols[i] !== undefined ? cols[i] : ''; });
    return o;
  });
}
function toCsv(headers, rows) {
  const esc = v => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return headers.join(',') + '\n' + rows.map(r => headers.map(h => esc(r[h])).join(',')).join('\n') + '\n';
}
function dayFlags(dateStr) {
  const [Y, M, D] = dateStr.split('/').map(Number);
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
  return { is_weekend: (dow === 0 || dow === 6) ? 1 : 0, is_obon: (M === 8 && D >= 13 && D <= 16) ? 1 : 0 };
}
function timeLabel(code) {
  const c = Number(code) - 1;
  return `${String(Math.floor(c / 2)).padStart(2, '0')}:${String((c % 2) * 30).padStart(2, '0')}`;
}
const inRange = (code, lo, hi) => { const c = Number(code); return c >= lo && c <= hi; };
const isPeak = c => inRange(c, 19, 32);
const isDaytime = c => inRange(c, 17, 36);
const isNight = c => { const x = Number(c); return (x >= 45 && x <= 48) || (x >= 1 && x <= 14); };
const isSolar = c => inRange(c, 21, 30);
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const mx = a => a.length ? Math.max(...a) : null;
const mn = a => a.length ? Math.min(...a) : null;
const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function logGamma(z) {
  const g = 7;
  const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843696540789e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1; let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-30;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function betai(a, b, x) {
  if (x < 0 || x > 1) return null;
  if (x === 0 || x === 1) return x;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}
function studentPValue(t, df) {
  if (!Number.isFinite(t) || df <= 0) return null;
  const x = df / (df + t * t);
  const p = betai(df / 2, 0.5, x);
  return p == null ? null : Math.min(1, Math.max(0, p));
}
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { r: null, n_obs: n, p_value: null };
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; sxy += xs[i] * ys[i]; }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (den === 0) return { r: null, n_obs: n, p_value: null };
  const r = num / den, df = n - 2;
  const t = r * Math.sqrt(df / Math.max(1e-15, 1 - r * r));
  const p = studentPValue(t, df);
  return { r: +r.toFixed(6), n_obs: n, p_value: p == null ? null : +p.toFixed(6) };
}
function linreg(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { slope: null, intercept: null, r2: null, n_obs: n };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  const den = n * sxx - sx * sx;
  if (den === 0) return { slope: null, intercept: null, r2: null, n_obs: n };
  const slope = (n * sxy - sx * sy) / den, intercept = (sy - slope * sx) / n, ybar = sy / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { ssTot += (ys[i] - ybar) ** 2; ssRes += (ys[i] - (slope * xs[i] + intercept)) ** 2; }
  return { slope: +slope.toFixed(6), intercept: +intercept.toFixed(6), r2: ssTot === 0 ? null : +(1 - ssRes / ssTot).toFixed(6), n_obs: n };
}
function multilin(Xcols, ys) {
  const n = ys.length, k = Xcols.length + 1;
  if (n < k + 2) return { coef: null, r2: null, n_obs: n };
  const XtX = Array.from({ length: k }, () => Array(k).fill(0)), Xty = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = [1, ...Xcols.map(c => c[i])];
    for (let a = 0; a < k; a++) { Xty[a] += row[a] * ys[i]; for (let b = 0; b < k; b++) XtX[a][b] += row[a] * row[b]; }
  }
  const A = XtX.map((r, i) => [...r, Xty[i]]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return { coef: null, r2: null, n_obs: n, note: 'singular' };
    [A[col], A[piv]] = [A[piv], A[col]];
    const div = A[col][col];
    for (let c = col; c <= k; c++) A[col][c] /= div;
    for (let r = 0; r < k; r++) { if (r === col) continue; const f = A[r][col]; for (let c = col; c <= k; c++) A[r][c] -= f * A[col][c]; }
  }
  const coef = A.map(r => r[k]), ybar = ys.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { const yhat = coef[0] + Xcols.reduce((s, c, j) => s + coef[j + 1] * c[i], 0); ssTot += (ys[i] - ybar) ** 2; ssRes += (ys[i] - yhat) ** 2; }
  return { intercept: +coef[0].toFixed(6), coef: coef.slice(1).map(c => +c.toFixed(6)), r2: ssTot === 0 ? null : +(1 - ssRes / ssTot).toFixed(6), n_obs: n };
}
function piecewise35(tmax, y) {
  const n_above_35 = tmax.filter(t => t >= 35).length;
  const n_below_35 = tmax.filter(t => t < 35).length;
  const hinge = tmax.map(t => Math.max(t - 35, 0));
  const m = multilin([tmax, hinge], y);
  const base = { form: 'price = a + b*tmax + c*max(tmax-35,0)', kink_celsius: 35, n_obs: tmax.length, n_above_35, n_below_35, low_confidence: n_above_35 < 10 };
  if (!m.coef) return { ...base, a: null, b: null, c: null, r2: null, note: m.note || 'fit_failed' };
  return { ...base, a: m.intercept, b: m.coef[0], c: m.coef[1], r2: m.r2, interpretation: { slope_below_35: m.coef[0], slope_above_35: +(m.coef[0] + m.coef[1]).toFixed(6), extra_per_degree_above_35: m.coef[1] } };
}
function quadratic(xs, y, xname = 'x') {
  const m = multilin([xs, xs.map(t => t * t)], y);
  if (!m.coef) return { form: `price = a + b*${xname} + c*${xname}^2`, a: null, b: null, c: null, r2: null, n_obs: xs.length };
  const b = m.coef[0], c = m.coef[1];
  return { form: `price = a + b*${xname} + c*${xname}^2`, a: m.intercept, b: m.coef[0], c: m.coef[1], r2: m.r2, n_obs: m.n_obs, parabola_vertex: c === 0 ? null : +(-b / (2 * c)).toFixed(3) };
}
function quantiles(arr) {
  return { p50: arr.length ? +pct(arr, 0.5).toFixed(3) : null, p75: arr.length ? +pct(arr, 0.75).toFixed(3) : null, p90: arr.length ? +pct(arr, 0.9).toFixed(3) : null, p95: arr.length ? +pct(arr, 0.95).toFixed(3) : null, max: arr.length ? +mx(arr).toFixed(3) : null, mean: arr.length ? +avg(arr).toFixed(3) : null, n: arr.length };
}

const AREA_COLS = [
  ['system', 'システムプライス(円/kWh)'],
  ['hokkaido', 'エリアプライス北海道(円/kWh)'],
  ['tohoku', 'エリアプライス東北(円/kWh)'],
  ['tokyo', 'エリアプライス東京(円/kWh)'],
  ['chubu', 'エリアプライス中部(円/kWh)'],
  ['hokuriku', 'エリアプライス北陸(円/kWh)'],
  ['kansai', 'エリアプライス関西(円/kWh)'],
  ['chugoku', 'エリアプライス中国(円/kWh)'],
  ['shikoku', 'エリアプライス四国(円/kWh)'],
  ['kyushu', 'エリアプライス九州(円/kWh)'],
];
// v5: 9 focus areas including hokuriku
const FOCUS_AREAS = ['tokyo', 'kansai', 'kyushu', 'chubu', 'tohoku', 'chugoku', 'shikoku', 'hokkaido', 'hokuriku'];
const areaPrimaryStation = {
  tokyo: 'tokyo',
  tohoku: 'morioka',
  chubu: 'nagoya',
  kansai: 'kobe',
  chugoku: 'hiroshima',
  shikoku: 'takamatsu',
  kyushu: 'kumamoto',
  hokkaido: 'chitose',
  hokuriku: 'fukui', // FIXED: was nagoya
  system: 'tokyo',
};
const STATIONS = [
  'tokyo', 'osaka', 'nagoya', 'kobe', 'nagasaki', 'kumamoto', 'sapporo',
  'morioka', 'hiroshima', 'takamatsu', 'chitose', 'yokkaichi', 'mito',
  'fukushima', 'hachioji', 'kofu', 'mishima', 'matsuyama', 'oita', 'niigata',
  'fukui', 'joetsu', 'maebashi', 'chiba', 'yokohama', 'saga', 'yamagata',
];

const tempByDateStation = new Map();
const tempMeta = {};
for (const st of STATIONS) {
  const fp = path.join(RAW, `${st}.json`);
  if (!fs.existsSync(fp)) { console.warn('missing station', st); continue; }
  const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const d = raw.daily;
  tempMeta[st] = { lat: raw.latitude, lon: raw.longitude, elevation_m: raw.elevation, n_days: d.time.length };
  for (let i = 0; i < d.time.length; i++) {
    const date = d.time[i].replace(/-/g, '/');
    const tmax = d.temperature_2m_max[i], tmin = d.temperature_2m_min[i], tavg = d.temperature_2m_mean[i];
    if (tmax == null || tmin == null || tavg == null) continue;
    tempByDateStation.set(`${date}|${st}`, {
      tmax: +Number(tmax).toFixed(1), tmin: +Number(tmin).toFixed(1), tavg: +Number(tavg).toFixed(1),
      cdd24: +Math.max(0, tavg - 24).toFixed(2), cdd26: +Math.max(0, tavg - 26).toFixed(2),
    });
  }
}

const rows = [
  ...parseCsv(fs.readFileSync('/workspace/public/data/spot_summary_2025_utf8.csv', 'utf8')),
  ...parseCsv(fs.readFileSync('/workspace/public/data/spot_summary_2026_utf8.csv', 'utf8')),
];
const halfRows = [];
const byDateArea = new Map();
for (const r of rows) {
  const date = r['受渡日']; if (!date) continue;
  const code = Number(r['時刻コード']);
  for (const [area, col] of AREA_COLS) {
    const price = parseFloat(r[col]); if (Number.isNaN(price)) continue;
    halfRows.push({ date, time_code: code, time_label: timeLabel(code), area, price: +price.toFixed(2) });
    const key = `${date}|${area}`;
    if (!byDateArea.has(key)) byDateArea.set(key, { date, area, all: [], peak: [], daytime: [], night: [], solar: [] });
    const g = byDateArea.get(key);
    g.all.push(price);
    if (isPeak(code)) g.peak.push(price);
    if (isDaytime(code)) g.daytime.push(price);
    if (isNight(code)) g.night.push(price);
    if (isSolar(code)) g.solar.push(price);
  }
}
const dailyRows = [];
for (const g of byDateArea.values()) {
  const baseload = avg(g.all);
  dailyRows.push({
    date: g.date, area: g.area,
    avg_price: +baseload.toFixed(2), baseload_price: +baseload.toFixed(2),
    peak_price: +(g.peak.length ? avg(g.peak) : baseload).toFixed(2),
    daytime_price: +(g.daytime.length ? avg(g.daytime) : baseload).toFixed(2),
    night_price: +(g.night.length ? avg(g.night) : baseload).toFixed(2),
    solar_crush_price: +(g.solar.length ? avg(g.solar) : baseload).toFixed(2),
    max_price: +mx(g.all).toFixed(2), min_price: +mn(g.all).toFixed(2),
  });
}
dailyRows.sort((a, b) => a.date.localeCompare(b.date) || a.area.localeCompare(b.area));
const dates = [...new Set(dailyRows.map(r => r.date))].sort();
const tempRows = [];
for (const date of dates) for (const st of STATIONS) {
  const t = tempByDateStation.get(`${date}|${st}`);
  if (t) tempRows.push({ date, station: st, ...t });
}
const merged = [];
for (const r of dailyRows) {
  const st = areaPrimaryStation[r.area] || 'tokyo';
  const t = tempByDateStation.get(`${r.date}|${st}`);
  if (!t) continue;
  merged.push({ ...r, station: st, ...t, ...dayFlags(r.date) });
}
const sites = parseCsv(fs.readFileSync(path.join(ROOT, 'data/site_master.csv'), 'utf8'));

const samples = {
  all: merged.filter(m => FOCUS_AREAS.includes(m.area)),
  weekday_only: merged.filter(m => FOCUS_AREAS.includes(m.area) && !m.is_weekend && !m.is_obon),
  summer_weekday: merged.filter(m => {
    if (!FOCUS_AREAS.includes(m.area) || m.is_weekend || m.is_obon) return false;
    const mon = Number(m.date.split('/')[1]);
    return mon >= 6 && mon <= 9;
  }),
  heat_days_weekday: merged.filter(m => FOCUS_AREAS.includes(m.area) && !m.is_weekend && !m.is_obon && m.tmax >= 32),
};

const correlations = {}, regressions = {}, nonlinear = {}, r2_comparison = {}, summary = {};
for (const [sampleName, rowsS] of Object.entries(samples)) {
  correlations[sampleName] = {};
  regressions[sampleName] = {};
  nonlinear[sampleName] = {};
  for (const area of FOCUS_AREAS) {
    const sub = rowsS.filter(r => r.area === area);
    if (sub.length < 5) { correlations[sampleName][area] = { n_obs: sub.length, note: 'insufficient' }; continue; }
    const tmax = sub.map(r => r.tmax), cdd24 = sub.map(r => r.cdd24);
    const peak = sub.map(r => r.peak_price), base = sub.map(r => r.baseload_price);
    const day = sub.map(r => r.daytime_price), maxp = sub.map(r => r.max_price);
    correlations[sampleName][area] = {
      n_obs: sub.length, station: areaPrimaryStation[area],
      cdd24_vs_peak_price: pearson(cdd24, peak), tmax_vs_peak_price: pearson(tmax, peak),
      cdd24_vs_baseload_price: pearson(cdd24, base), tmax_vs_baseload_price: pearson(tmax, base),
      cdd24_vs_daytime_price: pearson(cdd24, day), tmax_vs_daytime_price: pearson(tmax, day),
      tmax_vs_max_price: pearson(tmax, maxp),
    };
    regressions[sampleName][area] = {
      peak_on_tmax: linreg(tmax, peak), peak_on_cdd24: linreg(cdd24, peak),
      baseload_on_tmax: linreg(tmax, base), baseload_on_cdd24: linreg(cdd24, base),
      daytime_on_tmax: linreg(tmax, day), daytime_on_cdd24: linreg(cdd24, day),
    };
    nonlinear[sampleName][area] = {
      quadratic_peak_on_tmax: quadratic(tmax, peak, 'tmax'), piecewise35_peak_on_tmax: piecewise35(tmax, peak),
      quadratic_baseload_on_tmax: quadratic(tmax, base, 'tmax'), piecewise35_baseload_on_tmax: piecewise35(tmax, base),
      quadratic_daytime_on_tmax: quadratic(tmax, day, 'tmax'), piecewise35_daytime_on_tmax: piecewise35(tmax, day),
    };
  }
}
for (const area of FOCUS_AREAS) {
  const lin = regressions.summer_weekday?.[area]?.peak_on_tmax?.r2;
  const quad = nonlinear.summer_weekday?.[area]?.quadratic_peak_on_tmax?.r2;
  const pw = nonlinear.summer_weekday?.[area]?.piecewise35_peak_on_tmax;
  r2_comparison[area] = {
    linear_r2: lin ?? null, quadratic_r2: quad ?? null, piecewise35_r2: pw?.r2 ?? null,
    piecewise35_n_above_35: pw?.n_above_35 ?? null, piecewise35_n_below_35: pw?.n_below_35 ?? null,
    piecewise35_low_confidence: pw?.low_confidence ?? null,
    delta_quad_vs_lin: lin != null && quad != null ? +(quad - lin).toFixed(6) : null,
  };
  const sub = samples.summer_weekday.filter(r => r.area === area);
  if (!sub.length) continue;
  summary[area] = {
    n_days: sub.length, n_days_tmax_ge_35: sub.filter(r => r.tmax >= 35).length, station: areaPrimaryStation[area],
    baseload_mean: +avg(sub.map(r => r.baseload_price)).toFixed(3),
    daytime_mean: +avg(sub.map(r => r.daytime_price)).toFixed(3),
    night_mean: +avg(sub.map(r => r.night_price)).toFixed(3),
    solar_crush_mean: +avg(sub.map(r => r.solar_crush_price)).toFixed(3),
    night_day_spread_mean: +avg(sub.map(r => r.night_price - r.solar_crush_price)).toFixed(3),
    peak_mean: +avg(sub.map(r => r.peak_price)).toFixed(3), peak_max: +mx(sub.map(r => r.peak_price)).toFixed(3),
    baseload_p95: +pct(sub.map(r => r.baseload_price), 0.95).toFixed(3),
    daytime_p95: +pct(sub.map(r => r.daytime_price), 0.95).toFixed(3),
    max_price_p95: +pct(sub.map(r => r.max_price), 0.95).toFixed(3),
    spike_frac_daytime_gt30: +(sub.filter(r => r.daytime_price > 30).length / sub.length).toFixed(4),
    spike_frac_baseload_gt30: +(sub.filter(r => r.baseload_price > 30).length / sub.length).toFixed(4),
    tmax_mean: +avg(sub.map(r => r.tmax)).toFixed(3), cdd24_mean: +avg(sub.map(r => r.cdd24)).toFixed(3),
  };
}

// preserve prior correlation extras if needed - write full v5
const correlation_results = {
  meta: {
    version: 'v5', generated_at: new Date().toISOString(), repo_visibility: 'public',
    jepx_date_range: { min: dates[0], max: dates[dates.length - 1] },
    temp_source: 'Open-Meteo archive-api', temp_stations: tempMeta,
    n_stations: STATIONS.length, n_sites: sites.length, n_focus_areas: FOCUS_AREAS.length,
    area_station_map: areaPrimaryStation, focus_areas: FOCUS_AREAS,
    mapping_fixes_v5: ['hokuriku → fukui (removed chubu/hokuriku→nagoya legacy)'],
    stats_notes: [
      'All correlations include n_obs and two-sided p_value',
      'piecewise35 includes n_above_35, n_below_35; low_confidence if n_above_35 < 10',
    ],
    peak_definition: 'time_code 19-32 (09:00-16:00)',
    load_price_windows: {
      baseload_price: 'all 48 slots', daytime_price: '17-36 (08:00-18:00)',
      night_price: '45-48 + 1-14 (22:00-07:00)', solar_crush_price: '21-30 (10:00-15:00)',
    },
    cdd_definition: 'cdd24 = max(0, tavg-24)', encoding: 'UTF-8 LF no BOM',
  },
  sample_definitions: {
    all: 'focus areas all days with temp join',
    weekday_only: 'is_weekend=0 AND is_obon=0',
    summer_weekday: 'Jun-Sep AND weekday_only',
    heat_days_weekday: 'weekday_only AND tmax>=32',
  },
  summary_summer_weekday: summary,
  r2_comparison_summer_weekday: r2_comparison,
  correlations, regressions, nonlinear,
};

function priceColumnForSite(site) {
  if (site.load_profile === 'office_rnd') return 'daytime_price';
  if (site.sector === 'heavy' || site.sector === 'equipment') return 'daytime_price';
  return 'baseload_price'; // material, semi
}

const siteExposures = [];
for (const site of sites) {
  if (site.status === 'unverified') {
    siteExposures.push({
      site_id: site.site_id, company: site.company, site_name: site.site_name,
      jepx_area: site.jepx_area, primary_station: site.primary_station,
      sector: site.sector, load_profile: site.load_profile, supply_chain_tier: site.supply_chain_tier,
      status: 'unverified', note: site.note, power_consumption_mwh: null, exposure: null,
      reason: 'unverified location; metrics withheld',
    });
    continue;
  }
  const area = site.jepx_area, station = site.primary_station;
  const priceCol = priceColumnForSite(site);
  const siteMerged = [];
  for (const r of dailyRows) {
    if (r.area !== area) continue;
    const t = tempByDateStation.get(`${r.date}|${station}`);
    if (!t) continue;
    siteMerged.push({ ...r, ...t, ...dayFlags(r.date) });
  }
  const summerWd = siteMerged.filter(r => {
    if (r.is_weekend || r.is_obon) return false;
    const mon = Number(r.date.split('/')[1]);
    return mon >= 6 && mon <= 9;
  });
  const prices = summerWd.map(r => r[priceCol]);
  const nights = summerWd.map(r => r.night_price), solars = summerWd.map(r => r.solar_crush_price);
  const spreads = summerWd.map(r => r.night_price - r.solar_crush_price);
  const tmax = summerWd.map(r => r.tmax), cdd24 = summerWd.map(r => r.cdd24);
  const spikeDays = summerWd.filter(r => r[priceCol] > 30).length;
  siteExposures.push({
    site_id: site.site_id, company: site.company, site_name: site.site_name,
    jepx_area: area, primary_station: station, sector: site.sector,
    load_profile: site.load_profile, supply_chain_tier: site.supply_chain_tier,
    price_column: priceCol, status: site.status,
    capex_jpy_oku: site.capex_jpy_oku === '' ? null : Number(site.capex_jpy_oku),
    power_consumption_mwh: null,
    samples: { summer_weekday_n: summerWd.length },
    correlations_summer_weekday: {
      cdd24_vs_load_price: pearson(cdd24, prices),
      tmax_vs_load_price: pearson(tmax, prices),
    },
    regressions_summer_weekday: {
      load_on_cdd24: linreg(cdd24, prices),
      load_on_tmax: linreg(tmax, prices),
    },
    nonlinear_summer_weekday: {
      piecewise35_load_on_tmax: piecewise35(tmax, prices),
      quadratic_load_on_tmax: quadratic(tmax, prices, 'tmax'),
    },
    price_quantiles_summer_weekday: quantiles(prices),
    spike_frequency: {
      threshold_yen_per_kwh: 30, days_above: spikeDays, n_days: summerWd.length,
      fraction: summerWd.length ? +(spikeDays / summerWd.length).toFixed(4) : null,
    },
    night_day_spread_summer_weekday: {
      definition: 'night_price - solar_crush_price',
      mean: spreads.length ? +avg(spreads).toFixed(3) : null,
      p50: spreads.length ? +pct(spreads, 0.5).toFixed(3) : null,
      p90: spreads.length ? +pct(spreads, 0.9).toFixed(3) : null,
      night_mean: nights.length ? +avg(nights).toFixed(3) : null,
      solar_crush_mean: solars.length ? +avg(solars).toFixed(3) : null,
    },
  });
}
const site_exposure = {
  meta: {
    version: 'v5', generated_at: new Date().toISOString(), n_sites: sites.length,
    sample: 'summer_weekday',
    load_price_rule: {
      material_and_semi: 'baseload_price', heavy: 'daytime_price',
      equipment_office_rnd: 'daytime_price (control group)',
    },
    power_consumption_policy: 'null when not disclosed — never estimated',
  },
  sites: siteExposures,
};

// reserve
let reserve;
try { reserve = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/reserve_margin_context.json'), 'utf8')); }
catch { reserve = { areas: {} }; }
const areaAugMargin = {};
for (const [a, v] of Object.entries(reserve.areas || {})) areaAugMargin[a] = typeof v.aug === 'number' ? v.aug : null;
const defaults = { tokyo: 0.9, tohoku: 4.8, chubu: 3.5, hokuriku: 5.5, kansai: 4.3, chugoku: 5.0, shikoku: 5.8, kyushu: 6.2, hokkaido: 6.1 };
for (const [a, m] of Object.entries(defaults)) if (areaAugMargin[a] == null) areaAugMargin[a] = m;

// keep chokepoint from v4 structure, recompute lightly for new sites
const oligopolyManual = {
  agc_koriyama: 5, agc_motomiya: 5, hoya_hachioji: 5, hoya_nagasaka: 5, hoya_mishima: 0,
  sumitomo_chem_ehime: 3, sumitomo_chem_oita: 3, sumitomo_bakelite_amagasaki: 3, panasonic_koriyama: 4,
  jasm_fab1: 4, jasm_fab2: 4, sony_tec_kumamoto: 3, rapidus_iim1: 3, kioxia_yokkaichi: 3, kioxia_kitakami: 3,
  mhi_takasago: 2, mhi_nagasaki: 1, mhi_kobe: 1, mhi_nagoya_aero: 1,
  khi_kobe: 1, khi_akashi: 1, khi_harima: 1, khi_sakaide: 1,
  hitachi_hitachi: 2, hitachi_omika: 2, hitachi_kasado: 1,
  shinetsu_naoetsu: 5, shinetsu_takefu: 5, shinetsu_isesaki: 4,
  jsr_yokkaichi: 4, jsr_chiba: 3, tok_sagami: 4,
  tosoh_nanyo: 2, tosoh_yokkaichi: 2, sumco_imari: 4, sumco_yonezawa: 3, lasertec_yokohama: 1,
};
const inv = Object.fromEntries(Object.entries(areaAugMargin).filter(([, v]) => v > 0).map(([a, m]) => [a, 1 / m]));
const invMax = Math.max(...Object.values(inv));
const tightness = Object.fromEntries(Object.entries(inv).map(([a, v]) => [a, +(v / invMax).toFixed(4)]));

// ── cluster_risk ──
const p95s = FOCUS_AREAS.map(a => summary[a]?.baseload_p95).filter(x => x != null);
const p95Median = median(p95s);
const clusters = [];
for (const area of FOCUS_AREAS) {
  const areaSites = sites.filter(s => s.jepx_area === area && s.status !== 'unverified');
  const tier1 = areaSites.filter(s => s.supply_chain_tier === 'tier1_material').length;
  const fabLead = areaSites.filter(s => s.supply_chain_tier === 'fab_leading').length;
  const fabMem = areaSites.filter(s => s.supply_chain_tier === 'fab_memory').length;
  const heavy = areaSites.filter(s => s.supply_chain_tier === 'heavy').length;
  const equip = areaSites.filter(s => s.supply_chain_tier === 'equipment').length;
  const tier2 = areaSites.filter(s => s.supply_chain_tier === 'tier2_component').length;
  const chokepoint_density = tier1 + fabLead;
  const spike = summary[area]?.spike_frac_baseload_gt30 ?? 0;
  const p95 = summary[area]?.baseload_p95 ?? null;
  const cluster_exposure = (p95 == null || p95Median == null)
    ? null
    : +(chokepoint_density * (spike + 1) * (p95 / p95Median)).toFixed(4);
  const companies = [...new Set(areaSites.map(s => s.company))];
  clusters.push({
    jepx_area: area,
    site_count: areaSites.length,
    tier1_material_count: tier1,
    tier2_component_count: tier2,
    fab_leading_count: fabLead,
    fab_memory_count: fabMem,
    fab_count: fabLead + fabMem,
    heavy_count: heavy,
    equipment_count: equip,
    chokepoint_density,
    spike_frequency_baseload_gt30: spike,
    baseload_p95: p95,
    p95_vs_median: p95 != null && p95Median != null ? +(p95 / p95Median).toFixed(3) : null,
    cluster_exposure,
    reserve_margin_aug_2026_pct: areaAugMargin[area] ?? null,
    reserve_tightness_normalized: tightness[area] ?? null,
    affected_companies: companies,
    site_ids: areaSites.map(s => s.site_id),
  });
}
clusters.sort((a, b) => (b.cluster_exposure ?? -1) - (a.cluster_exposure ?? -1));

const focus_clusters = {
  yokkaichi_chubu: {
    label: '四日市クラスタ',
    area: 'chubu',
    thesis: '同一市内に NAND(キオクシア) + EUVレジスト(JSR) + 東ソー が共存。エリア障害が同時直撃',
    site_ids: sites.filter(s => s.jepx_area === 'chubu' && ['kioxia_yokkaichi', 'jsr_yokkaichi', 'tosoh_yokkaichi'].includes(s.site_id)).map(s => s.site_id),
    cluster_stats: clusters.find(c => c.jepx_area === 'chubu'),
  },
  tokyo_tight: {
    label: '東京管区クラスタ',
    area: 'tokyo',
    thesis: '8月予備率0.9%・spike/p95最悪帯に代替不能部材(HOYA/信越伊勢崎/TOK/JSR千葉)+日立が集中',
    site_ids: sites.filter(s => s.jepx_area === 'tokyo' && s.status !== 'unverified').map(s => s.site_id),
    cluster_stats: clusters.find(c => c.jepx_area === 'tokyo'),
    anomaly_ref: 'output/tokyo_anomaly.json',
  },
  tohoku_materials: {
    label: '東北クラスタ',
    area: 'tohoku',
    thesis: 'キオクシア北上 + AGC EUVブランクス + 信越直江津 + SUMCO米沢',
    site_ids: sites.filter(s => s.jepx_area === 'tohoku' && s.status !== 'unverified').map(s => s.site_id),
    cluster_stats: clusters.find(c => c.jepx_area === 'tohoku'),
  },
};

const cluster_risk = {
  meta: {
    version: 'v5', generated_at: new Date().toISOString(),
    formula: 'cluster_exposure = chokepoint_density × (spike_frequency + 1) × (baseload_p95 / median_p95_across_9_areas)',
    chokepoint_density_def: 'tier1_material_count + fab_leading_count',
    sample: 'summer_weekday baseload spike/p95 from correlation_results',
    n_areas: 9,
    p95_median_across_areas: p95Median,
  },
  areas: clusters,
  focus_clusters,
};

// ── redundancy_check ──
// Build date→area baseload for summer weekdays
const summerDates = [...new Set(samples.summer_weekday.map(r => r.date))].sort();
const baseloadByDateArea = new Map();
for (const r of samples.summer_weekday) {
  baseloadByDateArea.set(`${r.date}|${r.area}`, r.baseload_price);
}

function seriesForArea(area) {
  const xs = [];
  for (const d of summerDates) {
    const v = baseloadByDateArea.get(`${d}|${area}`);
    if (v != null) xs.push({ d, v });
  }
  return xs;
}
function alignedCorr(areaA, areaB) {
  const a = seriesForArea(areaA), b = seriesForArea(areaB);
  const mapB = new Map(b.map(x => [x.d, x.v]));
  const xs = [], ys = [];
  for (const { d, v } of a) {
    if (mapB.has(d)) { xs.push(v); ys.push(mapB.get(d)); }
  }
  return pearson(xs, ys);
}

// Full 9x9 matrix
const full_matrix = {};
for (const a of FOCUS_AREAS) {
  full_matrix[a] = {};
  for (const b of FOCUS_AREAS) {
    if (a === b) full_matrix[a][b] = { r: 1, n_obs: seriesForArea(a).length, p_value: 0 };
    else full_matrix[a][b] = alignedCorr(a, b);
  }
}

const companySpecs = [
  { company: 'Shin-Etsu', areas: ['tohoku', 'hokuriku', 'tokyo'], sites: ['shinetsu_naoetsu', 'shinetsu_takefu', 'shinetsu_isesaki'], priority: 'highest', note: '直江津(tohoku) vs 武生(hokuriku) が核心仮説' },
  { company: 'Kioxia', areas: ['chubu', 'tohoku'], sites: ['kioxia_yokkaichi', 'kioxia_kitakami'] },
  { company: 'JSR', areas: ['chubu', 'tokyo'], sites: ['jsr_yokkaichi', 'jsr_chiba'] },
  { company: 'Tosoh', areas: ['chugoku', 'chubu'], sites: ['tosoh_nanyo', 'tosoh_yokkaichi'] },
  { company: 'SUMCO', areas: ['kyushu', 'tohoku'], sites: ['sumco_imari', 'sumco_yonezawa'] },
  { company: 'AGC', areas: ['tohoku'], sites: ['agc_koriyama', 'agc_motomiya'], note: '同一エリア内のみ → 電力冗長性ゼロ' },
  { company: 'HOYA', areas: ['tokyo', 'chubu'], sites: ['hoya_hachioji', 'hoya_nagasaka', 'hoya_mishima'], note: '三島はunverified; 相関はtokyo-chubu' },
  { company: 'MHI', areas: ['kyushu', 'kansai', 'chubu'], sites: ['mhi_nagasaki', 'mhi_kobe', 'mhi_takasago', 'mhi_nagoya_aero'] },
  { company: 'KHI', areas: ['kansai', 'shikoku'], sites: ['khi_kobe', 'khi_akashi', 'khi_harima', 'khi_sakaide'] },
  { company: 'Hitachi', areas: ['tokyo', 'chugoku'], sites: ['hitachi_hitachi', 'hitachi_omika', 'hitachi_kasado'] },
];

const company_results = [];
for (const spec of companySpecs) {
  const uniqueAreas = [...new Set(spec.areas)];
  const pairs = [];
  for (let i = 0; i < uniqueAreas.length; i++) {
    for (let j = i + 1; j < uniqueAreas.length; j++) {
      const corr = alignedCorr(uniqueAreas[i], uniqueAreas[j]);
      pairs.push({ area_a: uniqueAreas[i], area_b: uniqueAreas[j], ...corr });
    }
  }
  const meanR = pairs.length ? avg(pairs.map(p => p.r).filter(r => r != null)) : null;
  const redundancy_score = meanR == null ? (uniqueAreas.length <= 1 ? 0 : null) : +(1 - meanR).toFixed(4);
  let interpretation;
  if (uniqueAreas.length <= 1) interpretation = 'single-area footprint: no geographic power diversification';
  else if (meanR != null && meanR >= 0.85) interpretation = 'HIGH co-movement: geographic multi-site does NOT diversify power-price shock';
  else if (meanR != null && meanR >= 0.6) interpretation = 'MODERATE co-movement: partial diversification only';
  else if (meanR != null) interpretation = 'LOWER co-movement: material power-price diversification possible';
  else interpretation = 'insufficient data';

  const detail = {};
  if (spec.company === 'Shin-Etsu') {
    detail.naoetsu_tohoku_vs_takefu_hokuriku = alignedCorr('tohoku', 'hokuriku');
    detail.naoetsu_tohoku_vs_isesaki_tokyo = alignedCorr('tohoku', 'tokyo');
    detail.takefu_hokuriku_vs_isesaki_tokyo = alignedCorr('hokuriku', 'tokyo');
  }

  company_results.push({
    company: spec.company,
    areas: uniqueAreas,
    site_ids: spec.sites,
    priority: spec.priority || 'normal',
    note: spec.note || null,
    pairwise_baseload_correlations_summer_weekday: pairs,
    mean_pairwise_r: meanR == null ? null : +meanR.toFixed(6),
    redundancy_score,
    redundancy_score_def: '1 - mean(pairwise baseload_price correlations on summer weekdays)',
    interpretation,
    ...detail,
  });
}
company_results.sort((a, b) => (a.redundancy_score ?? 99) - (b.redundancy_score ?? 99));

const redundancy_check = {
  meta: {
    version: 'v5', generated_at: new Date().toISOString(),
    hypothesis: 'Even if firms multi-site across regions for disaster diversification, high inter-area power-price correlation means power shocks hit all sites together — geographic redundancy fails for electricity cost risk.',
    price_series: 'baseload_price',
    sample: 'summer_weekday (Jun-Sep, is_weekend=0, is_obon=0)',
    areas: FOCUS_AREAS,
    n_areas: 9,
  },
  full_area_correlation_matrix_baseload_summer_weekday: full_matrix,
  companies: company_results,
  headline: {
    shinetsu_tohoku_hokuriku: company_results.find(c => c.company === 'Shin-Etsu')?.naoetsu_tohoku_vs_takefu_hokuriku,
    lowest_redundancy: company_results.filter(c => c.redundancy_score != null).slice(0, 3).map(c => ({ company: c.company, redundancy_score: c.redundancy_score, mean_r: c.mean_pairwise_r })),
  },
};

// write files
const dailyHeaders = ['date', 'area', 'avg_price', 'baseload_price', 'peak_price', 'daytime_price', 'night_price', 'solar_crush_price', 'max_price', 'min_price'];
const halfHeaders = ['date', 'time_code', 'time_label', 'area', 'price'];
const tempHeaders = ['date', 'station', 'tmax', 'tmin', 'tavg', 'cdd24', 'cdd26'];
const mergedHeaders = [...dailyHeaders, 'station', 'tmax', 'tmin', 'tavg', 'cdd24', 'cdd26', 'is_weekend', 'is_obon'];

fs.writeFileSync(path.join(ROOT, 'data/jepx_spot_daily.csv'), toCsv(dailyHeaders, dailyRows));
{
  let out = halfHeaders.join(',') + '\n';
  const parts = [];
  for (const r of halfRows) {
    parts.push(`${r.date},${r.time_code},${r.time_label},${r.area},${r.price}`);
    if (parts.length >= 50000) { out += parts.join('\n') + '\n'; parts.length = 0; }
  }
  if (parts.length) out += parts.join('\n') + '\n';
  fs.writeFileSync(path.join(ROOT, 'data/jepx_spot_halfhourly.csv'), out);
}
fs.writeFileSync(path.join(ROOT, 'data/jma_temp_daily.csv'), toCsv(tempHeaders, tempRows));
fs.writeFileSync(path.join(ROOT, 'data/merged_analysis.csv'), toCsv(mergedHeaders, merged));
fs.writeFileSync(path.join(ROOT, 'output/correlation_results.json'), JSON.stringify(correlation_results, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'output/site_exposure.json'), JSON.stringify(site_exposure, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'output/cluster_risk.json'), JSON.stringify(cluster_risk, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'output/redundancy_check.json'), JSON.stringify(redundancy_check, null, 2) + '\n');

// preserve chokepoint & tokyo_anomaly - light touch update version
for (const f of ['chokepoint_risk.json', 'tokyo_anomaly.json', 'reserve_margin_context.json']) {
  const fp = path.join(ROOT, 'output', f);
  if (!fs.existsSync(fp)) continue;
  try {
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    j.meta = { ...(j.meta || {}), version: j.meta?.version?.startsWith('v') ? j.meta.version : 'v5', updated_with: 'v5 pipeline' };
    if (f === 'reserve_margin_context.json') j.meta.version = 'v5';
    fs.writeFileSync(fp, JSON.stringify(j, null, 2) + '\n');
  } catch {}
}

console.log('=== v5 summary ===');
console.log('stations', STATIONS.length);
console.log('sites', sites.length);
console.log('focus areas', FOCUS_AREAS.length, FOCUS_AREAS.join(','));
console.log('hokuriku station', areaPrimaryStation.hokuriku, 'summary', summary.hokuriku);
console.log('daily areas sample', [...new Set(dailyRows.map(r => r.area))].sort().join(','));
console.log('cluster top', clusters.slice(0, 4).map(c => `${c.jepx_area}:exp=${c.cluster_exposure},dens=${c.chokepoint_density}`));
console.log('shinetsu tohoku-hokuriku', redundancy_check.headline.shinetsu_tohoku_hokuriku);
console.log('redundancy lowest', redundancy_check.headline.lowest_redundancy);
console.log('lasertec', siteExposures.find(s => s.site_id === 'lasertec_yokohama')?.price_quantiles_summer_weekday?.p95,
  siteExposures.find(s => s.site_id === 'lasertec_yokohama')?.spike_frequency);
