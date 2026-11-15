/*
 * AEROCORE — аналитическое ядро (v2).
 * Работает в браузере (window.AeroCore) и в Node (module.exports) — для тестов.
 *
 * Стандарты NASA и физиологические методы привязаны к SOURCES;
 * программные фильтры качества — решения команды, не клинические критерии NASA:
 *   - NASA-STD-3001 Vol.1 Rev C: VO₂max в миссии ≥ 80% исходного [V1 4003], ≥ 32,9 / 36,5 мл/кг/мин [V1 4001/4002];
 *   - HRP Evidence Report (2022): ошибка измерения VO₂peak ±3%, критерии максимального теста (4 из 5);
 *   - Moore et al. 2014, 2015: метод ACI — экстраполяция ЧСС–VO₂ до ЧСС пика, измеренной до полёта;
 *   - CFT70 (NTRS 20210016728): тесты лёжа и сидя несопоставимы.
 *
 * Слои:
 *   1. Data Trust Layer — загрузка, проверка качества, стандартизация.
 *   2. Physiological Intelligence Layer — личный базовый уровень, динамика, стандарты NASA, Peak vs Submax.
 *   3. Проверка алгоритма — синтетические сценарии с известной «истиной».
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Язык интерфейса и сообщений
  // ---------------------------------------------------------------------------
  // Интерфейс только на английском
  const LANG = 'en';
  const L = (ru, en) => en;
  const tr = x => (Array.isArray(x) ? x[1] : x);
  const setLang = () => {};
  const getLang = () => LANG;

  // ---------------------------------------------------------------------------
  // Источники. Каждый параметр алгоритма ссылается на один из них.
  // ---------------------------------------------------------------------------
  const SOURCES = {
    STD3001: {
      cite: 'NASA-STD-3001 Vol. 1 Rev. C (2023), §4.1',
      title: 'NASA Spaceflight Human-System Standard, Volume 1: Crew Health',
      url: 'https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf',
    },
    TB031: {
      cite: 'OCHMO-TB-031 (2023)',
      title: 'NASA-STD-3001 Technical Brief: Exercise Overview',
      url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-031-exercise-overview.pdf',
    },
    EVID: {
      cite: 'NASA HRP Evidence Report (2022)',
      title: 'Risk of Reduced Physical Performance Capabilities Due to Reduced Aerobic Capacity / Muscle (Evidence Report)',
      url: 'https://ntrs.nasa.gov/api/citations/20220019338/downloads/Evidence%20report%20aerobic%20and%20muscle_FINAL%209-21-22%20Pubpress%20accepted_v2.pdf',
    },
    MOORE14: {
      cite: 'Moore et al., J Appl Physiol 2014;117:231',
      title: 'Peak exercise oxygen uptake during and following long-duration spaceflight (abstract, NTRS 20140003748)',
      url: 'https://ntrs.nasa.gov/api/citations/20140003748/downloads/20140003748.pdf',
    },
    MOORE15: {
      cite: 'Moore, Lynn, Feiveson, Aerosp Med Hum Perform 2015;86(12 Suppl):A78',
      title: 'The first 10 years of aerobic exercise responses to long-duration ISS flights',
      url: 'https://meridian-asma-published.prime-prod-local.pubfactory.com/downloadpdf/view/journals/amhp/86/12:Supplement/article-pA78.pdf',
    },
    MOORE10: {
      cite: 'Moore et al. 2010, NTRS 20100003953',
      title: 'Maximum Oxygen Uptake during and after Long-Duration Space Flight',
      url: 'https://ntrs.nasa.gov/api/citations/20100003953/downloads/20100003953.pdf',
    },
    VO2MAX: {
      cite: 'NASA VO2max experiment, NTRS 20090015252',
      title: 'Evaluation of Maximal Oxygen Uptake and Submaximal Estimates of VO2max Before, During, and After Long Duration ISS Missions',
      url: 'https://ntrs.nasa.gov/api/citations/20090015252/downloads/20090015252.pdf',
    },
    CFT70: {
      cite: 'CFT70 formal report, NTRS 20210016728',
      title: 'Mitigating Effects of Exercise and Testosterone on Aerobic Fitness during 70-day Head-Down Bed Rest',
      url: 'https://ntrs.nasa.gov/api/citations/20210016728/downloads/20210016728_Formal_Report_CFT_Aerobic_Fitness_HDBR_Rev.docx.pdf',
    },
    STROCK: {
      cite: 'Strock et al. 2022, NTRS 20220014309',
      title: 'Evaluation of Aerobic Standards for Lunar Surface Extravehicular Activities',
      url: 'https://ntrs.nasa.gov/citations/20220014309',
    },
    HERITAGE: {
      cite: 'Wilmore et al., Med Sci Sports Exerc 1998;30:259',
      title: 'Reproducibility of cardiovascular, respiratory, and metabolic responses to submaximal exercise: the HERITAGE Family Study',
      url: 'https://doi.org/10.1097/00005768-199802000-00014',
    },
    HOPKINS: {
      cite: 'Hopkins, Sports Med 2000;30:1',
      title: 'Measures of reliability in sports medicine and science (typical error)',
      url: 'https://doi.org/10.2165/00007256-200030010-00001',
    },
    RMCORR: {
      cite: 'Bakdash & Marusich, Front Psychol 2017;8:456',
      title: 'Repeated Measures Correlation',
      url: 'https://doi.org/10.3389/fpsyg.2017.00456',
    },
    ACSM: {
      cite: 'ACSM Guidelines for Exercise Testing and Prescription',
      title: 'ACSM metabolic equation for leg cycle ergometry: VO₂ = 1.8·WR/BM + 7 (WR in kg·m/min)',
      url: 'https://www.acsm.org/education-resources/books/guidelines-exercise-testing-prescription',
    },
  };

  // ---------------------------------------------------------------------------
  // Настройки по умолчанию (с указанием источника)
  // ---------------------------------------------------------------------------
  const DEFAULT_CONFIG = {
    bedRestDays: 60,        // длительность разгрузки (сутки 0..N-1); < 0 — до, >= N — после
    pairWindowDays: 3,      // окно сопоставления Peak и Submax, сутки
    refWorkloadW: 0,        // эталонная нагрузка Submax, Вт; 0 = авто (старшая ступень, общая для всех базовых тестов)
    confirmPoints: 2,       // столько подряд значимых отклонений = устойчивое изменение
    teMode: 'auto',         // 'auto' — типичная ошибка по данным когорты (Hopkins 2000), если хватает участников; иначе — литература
    teMinSubjects: 5,       // минимум участников с ≥ 2 базовыми измерениями для оценки TE по данным
    metrics: {
      vo2peak:     { cv: 3.0 },   // EVID: ошибка измерения ±3%
      vo2peak_rel: { cv: 3.5 },   // VO₂ ±3% + погрешность массы тела
      hr_ref:      { cv: 4.0 },   // HERITAGE: CV < 9%, лучше при большей мощности; консервативно 4%
      aci:         { cv: 8.0 },   // нет опубликованной TE для ACI — рабочее допущение, заменяется оценкой по данным
    },
    ranges: {
      heart_rate: [30, 230],
      height_cm: [120, 220],
      vo2_lmin: [0.1, 7.0],
      body_weight_kg: [35, 200],
      rer: [0.6, 1.7],
      workload_w: [0, 600],
      age: [16, 80],
      rpe: [6, 20],
      vco2_lmin: [0.1, 8.0],
    },
    peakRerMin: 1.10,       // EVID: RER ≥ 1,10
    peakHrMarginBpm: 10,    // EVID: ЧСС пика в пределах 10 уд/мин от 207 − 0,67 × возраст
    peakRpeMin: 19,         // EVID: RPE ≥ 19
    peakCriteriaNeeded: 4,  // EVID: 4 из 5 критериев
    nasaPctOfPre: 80,       // STD3001 [V1 4003]
    nasaEvaMicroG: 32.9,    // STD3001 [V1 4001], мл/кг/мин
    nasaEvaSurface: 36.5,   // STD3001 [V1 4002], мл/кг/мин
    weightJumpPct: 7,
    weightJumpWindow: 14,
  };

  const METRICS = {
    vo2peak:     { label: 'VO₂peak (measured)',              unit: 'L/min',          test: 'peak',   unfav: -1, digits: 2 },
    vo2peak_rel: { label: 'VO₂peak per kg',                 unit: 'mL/kg/min',  test: 'peak',   unfav: -1, digits: 1 },
    hr_ref:      { label: 'HR at reference workload', unit: 'bpm',          test: 'submax', unfav: +1, digits: 0 },
    aci:         { label: 'ACI — VO₂peak estimated from Submax', unit: 'L/min', test: 'submax', unfav: -1, digits: 2 },
  };

  const PHASE_LABEL = { pre: 'pre', in: 'unloading', post: 'recovery' };
  const POSTURE_LABEL = { upright: 'upright', supine: 'supine', unspecified: 'unspecified' };

  // Справочник замечаний: [важность, сообщение RU, EN, действие RU, EN]
  const ISSUES = {
    MISSING_ID:      ['error', 'Missing participant ID', 'Row excluded'],
    MISSING_TEST:    ['error', 'Test type missing (Peak / Submax)', 'Row excluded'],
    UNKNOWN_TEST:    ['error', 'Unknown test type', 'Row excluded'],
    MISSING_TIME:    ['error', 'No date and no study day', 'Row excluded'],
    BAD_DATE:        ['error', 'Unparseable date', 'Row excluded: no time'],
    PHASE_UNKNOWN:   ['warning', 'Study phase unknown', 'Not used for baseline'],
    PHASE_MISMATCH:  ['warning', 'Phase conflicts with study day', 'Phase taken from study day'],
    MISSING_VALUE:   ['warning', 'Missing value', 'Flagged; metric not computed'],
    NOT_NUMBER:      ['error', 'Non-numeric value', 'Value not used'],
    OUT_OF_RANGE:    ['error', 'Value outside physiological range', 'Value excluded, raw kept'],
    UNIT_SUSPECT:    ['error', 'Suspected wrong unit', 'Not interpreted until clarified'],
    NO_WEIGHT:       ['warning', 'No body mass for unit conversion', 'Value not used'],
    DUPLICATE:       ['warning', 'Exact duplicate row', 'Copy not used'],
    CONFLICT:        ['error', 'Conflicting records of one measurement', 'All excluded until clarified'],
    PEAK_CRITERIA:   ['warning', 'Maximal effort not confirmed (NASA criteria)', 'Test flagged as questionable'],
    WEIGHT_JUMP:     ['warning', 'Abrupt body-mass change', 'Check record'],
    SUBMAX_HR_ABOVE: ['warning', 'Submax stage HR above personal peak', 'Stage not used'],
    SUBMAX_NONMONO:  ['warning', 'HR does not rise with workload', 'ACI not computed for session'],
    FEW_STAGES:      ['info', 'Fewer than two valid stages', 'ACI not computed'],
    NO_HRMAX:        ['info', 'No pre-unloading peak HR and no age', 'ACI not computed'],
    MASS_HEIGHT_SWAP: ['error', 'Mass and height likely swapped', 'Mass not used until clarified'],
    RER_MISMATCH:    ['error', 'VCO₂/VO₂ ≠ RER — likely column shift', 'Row excluded until clarified'],
    PEAK_HR_DROP:    ['warning', 'Peak HR well below baseline — test may be submaximal', 'Test flagged as questionable'],
    HEIGHT_INCHES:   ['warning', 'Height likely recorded in inches', 'Converted ×2.54, raw kept'],
    FILE_DATE_MISMATCH: ['warning', 'File-name date differs from date inside file', 'Date inside file used; check source'],
    HEADER_COPIED:   ['warning', 'File header copied from another test', 'Test day recomputed from file-name date'],
    TEST_TYPE_CONFLICT: ['warning', 'Test type in file name contradicts content', 'Type taken from content'],
    STAGE_W_REPEAT:  ['warning', 'Stage workloads inconsistent (repeat or peak below a stage)', 'Watts not used for this session'],
    POSTURE_NO_BASE: ['info', 'No baseline test in the same posture', 'Not compared with other-posture baseline'],
    TIME_CONFLICT: ['error', 'Cannot align date-only rows with study days', 'Date-only row excluded; supply a study day'],
    STUDY_ID_COLLISION: ['warning', 'Participant ID reused across studies', 'Studies kept separate using a qualified participant ID'],
    ACI_INVALID_FIT: ['warning', 'Insufficient physiological span or invalid ACI regression', 'ACI not computed; review the exercise stages'],
    ACI_MODEL_ASSUMPTION: ['info', 'ACI uses estimated inputs', 'Shown as exploratory; excluded from screening conclusions'],
  };

  // ---------------------------------------------------------------------------
  // Утилиты
  // ---------------------------------------------------------------------------
  const DAY = 864e5;
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const median = a => { const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function fmt(v, d = 1, sign = false) {
    if (v == null || !Number.isFinite(v)) return '—';
    let s = v.toFixed(d);
    s = s.replace('-', '−');
    return sign && v > 0 ? '+' + s : s;
  }

  function linreg(xs, ys) {
    const n = xs.length; if (n < 2 || n !== ys.length || !xs.every(Number.isFinite) || !ys.every(Number.isFinite)) return null;
    const mx = mean(xs), my = mean(ys);
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
    if (!(sxx > 0) || !Number.isFinite(sxx) || !Number.isFinite(sxy)) return null;
    const b = sxy / sxx, a = my - b * mx;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    let sse = 0; for (let i = 0; i < n; i++) sse += (ys[i] - a - b * xs[i]) ** 2;
    const se = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : null;
    const syy = ys.reduce((s, y) => s + (y - my) ** 2, 0);
    return { a, b, se, n, r2: syy > 0 ? Math.max(0, Math.min(1, 1 - sse / syy)) : null };
  }

  function pearson(xs, ys) {
    if (xs.length < 3 || xs.length !== ys.length || !xs.every(Number.isFinite) || !ys.every(Number.isFinite)) return null;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
    return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
  }

  // Корреляция повторных измерений (Bakdash & Marusich 2017): центрирование по участнику, df = N − k − 1
  function rmcorr(rows) {
    const by = Object.create(null);
    rows.filter(r => Number.isFinite(r.x) && Number.isFinite(r.y)).forEach(r => (by[r.g] = by[r.g] || []).push(r));
    const xs = [], ys = []; let k = 0;
    for (const g in by) {
      const a = by[g]; if (a.length < 2) continue; k++;
      const mx = mean(a.map(r => r.x)), my = mean(a.map(r => r.y));
      a.forEach(r => { xs.push(r.x - mx); ys.push(r.y - my); });
    }
    const df = xs.length - k - 1;
    if (df < 3) return { r: null, df, n: xs.length, k };
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] ** 2; syy += ys[i] ** 2; }
    const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
    return { r: Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null, df, n: xs.length, k };
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    const u = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    return {
      u,
      n: (m = 0, s = 1) => { let x = 0; while (x === 0) x = u(); return m + s * Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); },
      uni: (lo, hi) => lo + (hi - lo) * u(),
      int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * u()),
      pick: arr => arr[Math.floor(u() * arr.length)],
    };
  }

  function deepMerge(base, over) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(over || {})) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) continue;
      const v = over[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') ? deepMerge(base[k], v) : v;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // CSV
  // ---------------------------------------------------------------------------
  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const first = text.split(/\r\n|\n|\r/).find(s => s.trim()) || '';
    const count = d => {
      let n = 0, quoted = false;
      for (let i = 0; i < first.length; i++) {
        if (first[i] === '"') { if (quoted && first[i + 1] === '"') i++; else quoted = !quoted; }
        else if (!quoted && first[i] === d) n++;
      }
      return n;
    };
    let delim = ',', best = -1;
    for (const d of [',', ';', '\t']) { const n = count(d); if (n > best) { best = n; delim = d; } }
    const rows = [], errors = []; let row = [], field = '', inQ = false, afterQ = false, line = 1, rowLine = 1;
    const finish = () => { row.push(field); rows.push({ line: rowLine, cells: row }); row = []; field = ''; afterQ = false; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; afterQ = true; } }
        else { if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++; field += ch; }
      } else if (ch === '"') {
        if (field.length || afterQ) errors.push({ line, message: 'Quote inside an unquoted field' });
        inQ = true;
      } else if (ch === delim) { row.push(field); field = ''; afterQ = false; }
      else if (ch === '\n' || ch === '\r') {
        finish(); if (ch === '\r' && text[i + 1] === '\n') i++;
        line++; rowLine = line;
      } else if (afterQ) { if (!/\s/.test(ch)) errors.push({ line, message: 'Unexpected text after closing quote' }); }
      else field += ch;
    }
    if (inQ) errors.push({ line: rowLine, message: 'Unclosed quoted field' });
    if (field !== '' || row.length || afterQ) finish();
    const nonEmpty = rows.filter(r => r.cells.some(c => c.trim() !== ''));
    const head = nonEmpty.shift();
    const header = head ? head.cells.map(h => h.trim()) : [];
    nonEmpty.forEach(r => { if (r.cells.length !== header.length) errors.push({ line: r.line, message: `Expected ${header.length} columns, found ${r.cells.length}` }); });
    return { header, rows: nonEmpty, delimiter: delim, errors };
  }

  function toCSV(rows, cols) {
    const q = v => { const s = v == null ? '' : String(v); return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n');
  }

  const CANON_COLUMNS = ['participant_id', 'study_id', 'test_type', 'posture', 'measurement_date', 'study_day', 'study_phase', 'stage',
    'workload_w', 'heart_rate', 'vo2_lmin', 'vco2_lmin', 'rer', 'rpe', 'body_weight_kg', 'height_cm', 'age', 'data_source', 'is_synthetic'];

  const ALIASES = {
    participant_id: ['participant_id', 'participant', 'subject', 'subject_id', 'subj', 'subj_id', 'pid', 'crew_id'],
    study_id: ['study_id', 'study', 'experiment', 'campaign'],
    test_type: ['test_type', 'test', 'protocol', 'test_name'],
    posture: ['posture', 'position', 'body_position', 'orientation'],
    measurement_date: ['measurement_date', 'date', 'test_date', 'session_date'],
    study_day: ['study_day', 'day', 'bed_rest_day', 'br_day', 'hdt_day', 'mission_day', 'flight_day'],
    study_phase: ['study_phase', 'phase', 'period', 'condition', 'test_phase'],
    stage: ['stage', 'step', 'level'],
    workload_w: ['workload_w', 'workload', 'watts', 'power', 'power_w', 'load_w', 'work_rate', 'work_rate_w'],
    heart_rate: ['heart_rate', 'hr', 'heartrate', 'hr_bpm', 'heart_rate_bpm', 'pulse', 'hrpk'],
    vo2_lmin: ['vo2_lmin', 'vo2', 'vo2_l_min', 'vo2_lpm', 'vo2_l', 'vo2peak', 'vo2_peak', 'vo2peak_l_min'],
    vo2_mlmin: ['vo2_mlmin', 'vo2_ml_min'],
    vo2_mlkgmin: ['vo2_mlkgmin', 'vo2_ml_kg_min', 'vo2_rel', 'vo2_relative', 'vo2peak_ml_kg_min'],
    rer: ['rer', 'rq', 'resp_exchange_ratio'],
    rpe: ['rpe', 'borg', 'rpe_borg', 'rpe_6_20'],
    vco2_lmin: ['vco2_lmin', 'vco2', 'vco2_l_min'],
    height_cm: ['height_cm', 'height', 'ht_cm'],
    body_weight_kg: ['body_weight_kg', 'body_weight', 'weight', 'weight_kg', 'mass', 'body_mass', 'body_mass_kg'],
    test_name: ['test_name_full'],
    age: ['age', 'age_years'],
    data_source: ['data_source', 'source', 'file'],
    is_synthetic: ['is_synthetic', 'synthetic'],
  };

  const normHeader = h => String(h).toLowerCase().replace(/₂/g, '2').replace(/\(([^)]*)\)/g, '_$1')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  function mapColumns(header) {
    const mapping = {}, unmapped = [], duplicates = [];
    header.forEach((h, i) => {
      const n = normHeader(h);
      const key = Object.keys(ALIASES).find(k => ALIASES[k].includes(n));
      if (key && mapping[key] == null) mapping[key] = i; else { unmapped.push(h); if (key) duplicates.push(h); }
    });
    return { mapping, unmapped, duplicates };
  }

  function parseNum(s, decComma) {
    if (s == null) return null;
    let t = String(s).trim();
    if (t === '' || /^(na|n\/a|nan|null|none|-|—|\.)$/i.test(t)) return null;
    if (decComma || /^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) return NaN;
    const v = Number(t);
    return Number.isFinite(v) ? v : NaN;
  }

  function parseDate(s) {
    const t = String(s).trim(); let y, m, d, mt;
    if ((mt = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
    else if ((mt = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
    else if ((mt = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { m = +mt[1]; d = +mt[2]; y = +mt[3]; } // формат США
    else return null;
    const ms = Date.UTC(y, m - 1, d), dt = new Date(ms);
    return (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) ? ms : null;
  }

  function normTest(v, fileName) {
    const s = String(v || '').toLowerCase();
    if (s) { if (/sub/.test(s)) return 'submax'; if (/peak|max/.test(s)) return 'peak'; return 'unknown'; }
    const f = String(fileName || '').toLowerCase();
    if (/sub/.test(f)) return 'submax'; if (/peak|gxt|max/.test(f)) return 'peak';
    return null;
  }

  function normPhase(v) {
    const s = String(v || '').toLowerCase().trim();
    if (!s) return null;
    if (/^(pre|bdc|baseline|base|preflight|pre-flight|l-)/.test(s)) return 'pre';
    if (/^(post|r\+|rec|recovery|postflight|post-flight)/.test(s)) return 'post';
    if (/^(in|hdt|hdbr|br|bed|flight|fd|inflight|in-flight)/.test(s)) return 'in';
    return null;
  }

  function normPosture(v) {
    const s = String(v || '').toLowerCase().trim();
    if (!s) return 'unspecified';
    if (/sup|lying|recumb|hdt|horizontal/.test(s)) return 'supine';
    if (/up|sit|seat|erect/.test(s)) return 'upright';
    return 'unspecified';
  }

  const phaseFromDay = (d, L_) => d < 0 ? 'pre' : (d < L_ ? 'in' : 'post');

  // ---------------------------------------------------------------------------
  // Data Trust Layer
  // ---------------------------------------------------------------------------
  function run(files, userCfg) {
    const cfg = deepMerge(DEFAULT_CONFIG, userCfg || {});
    const issues = [], records = [], fileInfo = [];
    const addIssue = (rec, field, value, code, extra = {}) => {
      const d = ISSUES[code];
      issues.push({
        row_id: rec.row_id, participant_id: rec.participant_id || '', field, value: value == null ? '' : String(value),
        code, severity: extra.severity || d[0], message: extra.message || d[1], action: extra.action || d[2],
      });
    };

    for (const f of files) {
      const p = parseCSV(f.text);
      if (p.errors.length) throw new Error(`${f.name}: invalid CSV at line ${p.errors[0].line}: ${p.errors[0].message}`);
      const { mapping, unmapped, duplicates } = mapColumns(p.header);
      if (duplicates.length) throw new Error(`${f.name}: ambiguous duplicate columns: ${duplicates.join(', ')}`);
      const info = { name: f.name, nRows: p.rows.length, header: p.header, mapping, unmapped, delimiter: p.delimiter, notes: [] };
      fileInfo.push(info);
      const decComma = p.delimiter === ';';
      const has = k => mapping[k] != null;
      if (!has('participant_id')) info.notes.push('No participant ID column');
      // Тип теста по содержимому: строка «Peak» означает максимальный тест, даже если в имени Submax (MR080G C3B_4023)
      let fileTest = null, typeConflict = false;
      if (!has('test_type')) {
        const t = normTest('', f.name);
        const hasPeakRow = has('stage') && p.rows.some(rr => /^peak$/i.test(String(rr.cells[mapping.stage] ?? '').trim()));
        if (t === 'submax' && hasPeakRow) { fileTest = 'peak'; typeConflict = true; info.notes.push('File name says Submax but a Peak row exists — treated as maximal test'); }
        else info.notes.push(t ? `Test type taken from file name: ${t === 'peak' ? 'Peak' : 'Submax'}` : 'Test type not found in columns or file name');
      }
      // Дата в имени файла (ГГММДД, формат NASA LSDA) — для сверки с датой внутри файла
      const mDate = /(?:^|[_\-])(\d{2})(\d{2})(\d{2})(?=[_\-.]|$)/.exec(f.name);
      info.nameDate = mDate ? parseDate(`20${mDate[1]}-${mDate[2]}-${mDate[3]}`) : null;
      const fileRecs = [];
      if (!has('measurement_date') && !has('study_day')) info.notes.push('No date or study-day column');
      if (!has('posture')) info.notes.push('No posture column: all tests assumed same posture. Check protocol — supine and upright tests are not comparable (CFT70).');
      if (has('vo2_mlmin') && !has('vo2_lmin')) info.notes.push('VO₂ in mL/min converted to L/min');
      if (has('vo2_mlkgmin') && !has('vo2_lmin') && !has('vo2_mlmin')) info.notes.push('VO₂ in mL/kg/min converted to L/min using body mass');
      if (!has('age')) info.notes.push('No age: NASA peak-HR criterion not checked');

      for (const rr of p.rows) {
        const c = rr.cells;
        const get = k => has(k) ? String(c[mapping[k]] ?? '').trim() : undefined;
        const rec = { row_id: `${f.name}:${rr.line}`, line: rr.line, source: f.name, richness: Object.keys(mapping).length, raw: {}, excluded: false, excludedFields: {}, synthetic: false };
        for (const k in mapping) rec.raw[k] = get(k);
        rec.synthetic = /^(1|true|yes)$/i.test(get('is_synthetic') || '');

        rec.participant_id = get('participant_id') || '';
        if (!rec.participant_id) { addIssue(rec, 'participant_id', '', 'MISSING_ID'); rec.excluded = true; }
        rec.study_id = get('study_id') || '';
        rec.posture = normPosture(get('posture'));

        const tt = fileTest || normTest(get('test_type'), f.name);
        rec.test_type = tt === 'peak' || tt === 'submax' ? tt : null;
        if (tt === null) { addIssue(rec, 'test_type', '', 'MISSING_TEST'); rec.excluded = true; }
        else if (tt === 'unknown') { addIssue(rec, 'test_type', get('test_type'), 'UNKNOWN_TEST'); rec.excluded = true; }

        // Время измерения
        rec.study_day = null; rec.date = null;
        const sdRaw = get('study_day');
        if (sdRaw) {
          const v = parseNum(sdRaw, decComma);
          if (Number.isFinite(v)) rec.study_day = Math.round(v); else addIssue(rec, 'study_day', sdRaw, 'NOT_NUMBER');
        }
        const dRaw = get('measurement_date');
        if (dRaw) {
          const ms = parseDate(dRaw);
          if (ms == null) {
            if (rec.study_day != null) addIssue(rec, 'measurement_date', dRaw, 'BAD_DATE', { severity: 'warning', action: 'Study day used instead' });
            else { addIssue(rec, 'measurement_date', dRaw, 'BAD_DATE'); rec.excluded = true; }
          } else rec.date = ms;
        }
        if (rec.study_day == null && rec.date == null && !dRaw) { addIssue(rec, 'measurement_date', '', 'MISSING_TIME'); rec.excluded = true; }

        // Фаза. Формат NASA LSDA: BR_Day положителен и до, и после режима (BR−N / R+N) — пересчитываем по фазе
        const phRaw = get('study_phase'), ph = normPhase(phRaw);
        if (rec.study_day != null && ph === 'pre' && rec.study_day > 0) { rec.study_day = -rec.study_day; info.dayConverted = true; }
        else if (rec.study_day != null && ph === 'post' && rec.study_day < cfg.bedRestDays) { rec.study_day = cfg.bedRestDays + rec.study_day; info.dayConverted = true; }
        const phDay = rec.study_day != null ? phaseFromDay(rec.study_day, cfg.bedRestDays) : null;
        if (phDay) { rec.phase = phDay; if (ph && ph !== phDay) addIssue(rec, 'study_phase', phRaw, 'PHASE_MISMATCH'); }
        else if (ph) rec.phase = ph;
        else { rec.phase = null; if (!rec.excluded) addIssue(rec, 'study_phase', phRaw || '', 'PHASE_UNKNOWN'); }

        rec.stage = get('stage') || '';

        // Числовые показатели
        const required = k => (k === 'heart_rate') || (k === 'workload_w' && rec.test_type === 'submax');
        rec.isRestStage = /rest|recov|cool|^cd/i.test(rec.stage);
        for (const k of ['body_weight_kg', 'height_cm', 'age', 'workload_w', 'heart_rate', 'rer', 'rpe', 'vco2_lmin']) {
          rec[k] = null;
          const s = get(k);
          if (s === undefined) continue;
          const v = parseNum(s, decComma);
          if (v === null) { if (required(k) && !rec.excluded) addIssue(rec, k, '', 'MISSING_VALUE'); continue; }
          if (Number.isNaN(v)) { addIssue(rec, k, s, 'NOT_NUMBER'); rec.excludedFields[k] = true; continue; }
          const [lo, hi] = cfg.ranges[k];
          if (v < lo || v > hi) { addIssue(rec, k, s, 'OUT_OF_RANGE', { message: `Outside allowed range ${lo}–${hi}` }); rec.excludedFields[k] = true; continue; }
          rec[k] = v;
        }

        // VO₂ с приведением к л/мин
        rec.vo2_lmin = null;
        const [vlo, vhi] = cfg.ranges.vo2_lmin;
        const checkVo2 = (v, s, field) => {
          if (Number.isNaN(v)) { addIssue(rec, field, s, 'NOT_NUMBER'); rec.excludedFields.vo2_lmin = true; return; }
          if (v >= vlo && v <= vhi) { rec.vo2_lmin = v; return; }
          rec.excludedFields.vo2_lmin = true;
          if (v > 100 && v <= 7000) addIssue(rec, field, s, 'UNIT_SUSPECT', { message: 'Looks like mL/min, expected L/min' });
          else if (v > vhi && v <= 100) addIssue(rec, field, s, 'UNIT_SUSPECT', { message: 'Looks like mL/kg/min, expected L/min' });
          else addIssue(rec, field, s, 'OUT_OF_RANGE', { message: `Outside ${vlo}–${vhi} L/min` });
        };
        const sL = get('vo2_lmin'), sM = get('vo2_mlmin'), sK = get('vo2_mlkgmin');
        const vL = parseNum(sL, decComma), vM = parseNum(sM, decComma), vK = parseNum(sK, decComma);
        if (vL !== null && sL !== undefined) checkVo2(vL, sL, 'vo2_lmin');
        else if (vM !== null && sM !== undefined) checkVo2(Number.isNaN(vM) ? NaN : vM / 1000, sM, 'vo2_mlmin');
        else if (vK !== null && sK !== undefined) {
          if (Number.isNaN(vK)) checkVo2(NaN, sK, 'vo2_mlkgmin');
          else if (rec.body_weight_kg) checkVo2(vK * rec.body_weight_kg / 1000, sK, 'vo2_mlkgmin');
          else { addIssue(rec, 'vo2_mlkgmin', sK, 'NO_WEIGHT'); rec.excludedFields.vo2_lmin = true; }
        } else if (rec.test_type === 'peak' && !rec.excluded) addIssue(rec, 'vo2_lmin', '', 'MISSING_VALUE');

        // Масса и рост переставлены (найдено в MR080G Campaign 3)
        // Перестановка: «масса» похожа на рост (≥120), а «рост» меньше «массы». Иначе малый рост — вероятно, дюймы (MR080G: 72″ = 183 см)
        const hRaw = Number(get('height_cm'));
        const [hLo, hHi] = cfg.ranges.height_cm;
        const swap = rec.body_weight_kg != null && rec.height_cm == null && rec.excludedFields.height_cm && rec.body_weight_kg >= hLo && hRaw < rec.body_weight_kg;
        if (!swap && rec.height_cm == null && rec.excludedFields.height_cm && Number.isFinite(hRaw) && hRaw * 2.54 >= hLo && hRaw * 2.54 <= hHi) {
          const ix = issues.findIndex(i => i.row_id === rec.row_id && i.field === 'height_cm' && i.code === 'OUT_OF_RANGE');
          if (ix >= 0) issues.splice(ix, 1);
          addIssue(rec, 'height_cm', get('height_cm'), 'HEIGHT_INCHES', { message: `Height ${get('height_cm')} “cm” = ${fmt(hRaw * 2.54, 0)} cm if in inches` });
          rec.height_cm = hRaw * 2.54; delete rec.excludedFields.height_cm;
        }
        if (swap) {
          addIssue(rec, 'body_weight_kg', `${get('body_weight_kg')} / ${get('height_cm')}`, 'MASS_HEIGHT_SWAP', { message: `Mass ${get('body_weight_kg')} “kg” with height ${get('height_cm')} “cm” — columns likely swapped` });
          rec.body_weight_kg = null; rec.excludedFields.body_weight_kg = true;
        }
        // VCO₂/VO₂ должен совпадать с RER (найдено в MR080G CFT70: сдвиг столбцов)
        if (rec.vco2_lmin != null && rec.vo2_lmin != null && rec.rer != null && Math.abs(rec.vco2_lmin / rec.vo2_lmin - rec.rer) > 0.05) {
          addIssue(rec, 'rer', `${fmt(rec.vco2_lmin / rec.vo2_lmin, 2)} ≠ ${rec.rer}`, 'RER_MISMATCH', { message: `VCO₂/VO₂ = ${fmt(rec.vco2_lmin / rec.vo2_lmin, 2)} but RER = ${fmt(rec.rer, 2)} — likely column shift` });
          rec.excluded = true;
        }
        if (typeConflict && !fileRecs.length) addIssue(rec, 'test_type', 'Submax → Peak', 'TEST_TYPE_CONFLICT', { message: 'File name says Submax but the file has a Peak row' });
        records.push(rec); fileRecs.push(rec);
      }
      info.recs = fileRecs;
      if (info.dayConverted) info.notes.push('Study day converted using phase (NASA format: BR−N before, R+N after)');
    }

    // IDs are local to a study; repeated IDs must never combine different people.
    const studiesById = new Map(), qualified = new Map();
    for (const r of records) {
      if (!studiesById.has(r.participant_id)) studiesById.set(r.participant_id, new Set());
      studiesById.get(r.participant_id).add(r.study_id);
    }
    const occupied = new Set(records.map(r => r.participant_id));
    for (const r of records) {
      if (studiesById.get(r.participant_id).size < 2) continue;
      const original = r.participant_id, key = JSON.stringify([r.study_id, original]);
      if (!qualified.has(key)) {
        let label = `${original} [${r.study_id || 'unspecified study'}]`;
        while (occupied.has(label)) label += '·';
        qualified.set(key, label); occupied.add(label);
      }
      r.original_participant_id = original; r.participant_id = qualified.get(key);
      addIssue(r, 'participant_id', original, 'STUDY_ID_COLLISION');
    }

    // Дата в имени файла против даты внутри (MR080G C3G_5580: шапка файла R+11 скопирована из файла R+0)
    for (const fi of fileInfo) {
      const rs = (fi.recs || []).filter(r => !r.excluded);
      if (!fi.nameDate || !rs.length) continue;
      const inDate = rs.find(r => r.date != null)?.date;
      if (inDate == null || inDate === fi.nameDate) continue;
      const pid = rs[0].participant_id, diff = Math.round((fi.nameDate - inDate) / DAY);
      // Другой файл того же участника, у которого эта же дата и в имени, и внутри, — источник скопированной шапки
      const donor = fileInfo.find(o => o !== fi && o.nameDate === inDate && (o.recs || []).some(r => r.participant_id === pid && r.date === inDate));
      if (donor) {
        for (const r of rs) { r.date = fi.nameDate; if (r.study_day != null) { r.study_day += diff; r.phase = phaseFromDay(r.study_day, cfg.bedRestDays); } }
        addIssue(rs[0], 'measurement_date', iso(inDate), 'HEADER_COPIED', { message: `Date and day match file ${donor.name}, while file-name date is ${diff} d later — day recomputed` });
        fi.notes.push(`Header copied from ${donor.name}: day shifted by ${diff > 0 ? '+' : ''}${diff} d`);
      } else addIssue(rs[0], 'measurement_date', iso(inDate), 'FILE_DATE_MISMATCH', { message: `Name ${iso(fi.nameDate)}, file ${iso(inDate)}` });
    }

    // Keep date-only and study-day records on one participant-specific time axis.
    const firstDate = Object.create(null), anchors = Object.create(null);
    for (const r of records) {
      if (r.excluded || r.date == null) continue;
      firstDate[r.participant_id] = Math.min(firstDate[r.participant_id] ?? Infinity, r.date);
      if (r.study_day != null) (anchors[r.participant_id] ||= []).push(r.date - r.study_day * DAY);
    }
    for (const r of records) {
      r.t = r.study_day;
      if (r.t != null || r.date == null || r.excluded) continue;
      const ax = anchors[r.participant_id] || [];
      if (ax.length && Math.max(...ax) - Math.min(...ax) > DAY / 2) {
        addIssue(r, 'study_day', '', 'TIME_CONFLICT'); r.excluded = true; continue;
      }
      const origin = ax.length ? ax[0] : firstDate[r.participant_id];
      r.t = Math.round((r.date - origin) / DAY);
    }

    // Дубликаты и противоречия
    const comparableFields = ['phase', 'heart_rate', 'vo2_lmin', 'workload_w', 'body_weight_kg', 'height_cm', 'age', 'rer', 'rpe', 'vco2_lmin'];
    const groups = new Map();
    for (const r of records) {
      if (r.excluded) continue;
      const key = JSON.stringify([r.participant_id, r.test_type, r.posture, r.t, r.stage || (r.test_type === 'submax' ? (r.raw.workload_w || '') : '')]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (let g of groups.values()) {
      if (g.length < 2) continue;
      // Один тест в нескольких файлах (разные выгрузки): оставляем самый подробный файл, остальные — дубликаты источника
      const srcs = [...new Set(g.map(r => r.source))];
      if (srcs.length > 1) {
        const conflict = comparableFields.find(k => { const vals = g.map(r => r[k]).filter(v => v != null); return vals.some(v => typeof v === 'number' ? Math.abs(v - vals[0]) > 1e-8 : v !== vals[0]); });
        if (conflict) {
          g.forEach(r => { addIssue(r, conflict, r[conflict], 'CONFLICT', { message: `Source files disagree on ${conflict}: ${srcs.join(', ')}` }); r.excluded = true; });
          continue;
        }
        const completeness = r => comparableFields.filter(k => r[k] != null).length;
        const best = g.reduce((a, b) => (completeness(b) > completeness(a) || (completeness(b) === completeness(a) && b.richness > a.richness) ? b : a)).source;
        g.filter(r => r.source !== best).forEach(r => { addIssue(r, '*', '', 'DUPLICATE', { message: `Same test exists in a more detailed file ${best}`, action: 'More detailed file used' }); r.excluded = true; });
        g = g.filter(r => r.source === best);
        if (g.length < 2) continue;
      }
      const sig = r => JSON.stringify(Object.keys(r.raw).filter(k => k !== 'data_source').sort().map(k => r.raw[k]));
      if (g.every(r => sig(r) === sig(g[0]))) g.slice(1).forEach(r => { addIssue(r, '*', '', 'DUPLICATE', { message: `Exact duplicate of row ${g[0].line}` }); r.excluded = true; });
      else g.forEach(r => { addIssue(r, '*', '', 'CONFLICT', { message: `Conflicting records: rows ${g.map(x => x.line).join(', ')}` }); r.excluded = true; });
    }

    // Резкие изменения массы тела
    const byPid = Object.create(null);
    for (const r of records) if (!r.excluded) (byPid[r.participant_id] = byPid[r.participant_id] || []).push(r);
    for (const pid in byPid) {
      const w = byPid[pid].filter(r => r.body_weight_kg != null && r.t != null).sort((a, b) => a.t - b.t);
      for (let i = 1; i < w.length; i++) {
        const a = w[i - 1], b = w[i];
        if (b.t - a.t <= cfg.weightJumpWindow && Math.abs(b.body_weight_kg - a.body_weight_kg) / a.body_weight_kg * 100 > cfg.weightJumpPct)
          addIssue(b, 'body_weight_kg', b.body_weight_kg, 'WEIGHT_JUMP', { message: `Mass ${a.body_weight_kg} → ${b.body_weight_kg} kg in ${b.t - a.t} d` });
      }
    }

    // -------------------------------------------------------------------------
    // Сессии тестов
    // -------------------------------------------------------------------------
    const sessions = [];
    const sMap = new Map();
    for (const r of records) {
      if (r.excluded || r.t == null) continue;
      const key = JSON.stringify([r.participant_id, r.test_type, r.posture, r.t]);
      if (!sMap.has(key)) { const s = { key, participant_id: r.participant_id, test_type: r.test_type, posture: r.posture, t: r.t, study_day: r.study_day, date: r.date, phase: r.phase, rows: [], metrics: {}, quality: 'ok', notes: [] }; sMap.set(key, s); sessions.push(s); }
      const s = sMap.get(key); s.rows.push(r); if (!s.phase && r.phase) s.phase = r.phase;
    }
    const pInfo = Object.create(null);
    for (const s of sessions) {
      const pi = pInfo[s.participant_id] = pInfo[s.participant_id] || { pid: s.participant_id, ages: [], weights: [], postures: new Set() };
      pi.postures.add(s.posture);
      for (const r of s.rows) { if (r.age != null) pi.ages.push(r.age); if (r.body_weight_kg != null) pi.weights.push({ t: r.t, w: r.body_weight_kg }); }
    }
    for (const pid in pInfo) pInfo[pid].age = pInfo[pid].ages.length ? median(pInfo[pid].ages) : null;
    const sessionIssue = (s, code, extra) => addIssue(s.rows[0], (extra && extra.field) || '*', extra && extra.value, code, extra || {});
    const weightNear = (pid, t, own) => {
      if (own.length) return mean(own);
      const ws = pInfo[pid].weights.filter(x => Math.abs(x.t - t) <= 7).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t));
      return ws.length ? ws[0].w : null;
    };

    // Нагрузка ступеней: повтор ватт с разной ЧСС или «Peak» ниже ступени (MR080G C3G_9139: 50, 50, 100, Peak 75 Вт)
    const wattCheck = s => {
      const ex = s.rows.filter(r => !r.isRestStage && r.workload_w > 0);
      const st = ex.filter(r => !/^peak$/i.test(r.stage)), pk = ex.filter(r => /^peak$/i.test(r.stage));
      const seen = {}; let bad = null;
      for (const r of st) { const o = seen[r.workload_w]; if (o && r.heart_rate != null && o.heart_rate != null && Math.abs(r.heart_rate - o.heart_rate) > 5) bad = `two ${r.workload_w} W stages with HR ${o.heart_rate} and ${r.heart_rate}`; seen[r.workload_w] = r; }
      const maxSt = st.length ? Math.max(...st.map(r => r.workload_w)) : null;
      if (!bad && pk.length && maxSt != null && pk[0].workload_w < maxSt) bad = `Peak ${pk[0].workload_w} W below a ${maxSt} W stage`;
      if (bad) { sessionIssue(s, 'STAGE_W_REPEAT', { field: 'workload_w', message: 'Stage workloads inconsistent: ' + bad }); s.wattsBad = true; s.notes.push('Stage watts inconsistent'); }
    };

    // Peak: VO₂peak и проверка максимальности по критериям NASA (EVID)
    for (const s of sessions.filter(x => x.test_type === 'peak')) {
      const pi = pInfo[s.participant_id];
      const valid = s.rows.filter(r => r.vo2_lmin != null && !r.isRestStage);
      if (!valid.length) { s.quality = 'excluded'; s.notes.push('No valid VO₂'); continue; }
      // VO₂peak — строка «Peak» лаборатории, если она есть (официальное значение), иначе максимум по строкам
      const pkRows = valid.filter(x => /^peak$/i.test(x.stage));
      if (s.rows.some(x => /^peak$/i.test(x.stage)) && !pkRows.length) { s.quality = 'excluded'; s.notes.push('Official Peak row has no valid VO₂; submaximal stages cannot replace it'); continue; }
      const r = (pkRows.length ? pkRows : valid).reduce((a, b) => b.vo2_lmin > a.vo2_lmin ? b : a);
      wattCheck(s);
      s.metrics.vo2peak = r.vo2_lmin;
      s.hrPeak = r.heart_rate; s.rer = r.rer;
      const crit = [];
      if (r.rer != null) crit.push({ k: 'RER', ok: r.rer >= cfg.peakRerMin, txt: `RER ${fmt(r.rer, 2)} ${r.rer >= cfg.peakRerMin ? '≥' : '<'} ${fmt(cfg.peakRerMin, 2)}` });
      if (r.heart_rate != null && pi.age != null) {
        const pred = 207 - 0.67 * pi.age;
        const okHr = r.heart_rate >= pred - cfg.peakHrMarginBpm;
        crit.push({ k: 'HR', ok: okHr, txt: `HR ${r.heart_rate} ${okHr ? '≥' : '<'} ${Math.round(pred)} − ${cfg.peakHrMarginBpm} (207 − 0.67 × age)` });
      }
      if (r.rpe != null) crit.push({ k: 'RPE', ok: r.rpe >= cfg.peakRpeMin, txt: `RPE ${r.rpe} ${r.rpe >= cfg.peakRpeMin ? '≥' : '<'} ${cfg.peakRpeMin}` });
      const met = crit.filter(c => c.ok).length, failed = crit.length - met;
      s.criteria = { list: crit, met, failed, available: crit.length };
      // Тест опровергнут, только если даже при выполнении всех неизмеренных критериев не набрать 4 из 5
      const refuted = failed > 5 - cfg.peakCriteriaNeeded;
      if (met >= cfg.peakCriteriaNeeded) s.notes.push(`Maximal effort confirmed: ${met} of 5 NASA criteria`);
      else if (!refuted) s.notes.push(`${crit.length} of 5 NASA criteria measured, ${met} met${failed ? ' (one miss allowed: 4 of 5 needed)' : ''}`);
      else {
        addIssue(r, 'peak', crit.filter(c => !c.ok).map(c => c.k).join('+'), 'PEAK_CRITERIA', { message: 'Not met: ' + crit.filter(c => !c.ok).map(c => c.txt).join('; ') });
        s.quality = 'caution'; s.notes.push('Maximal effort not confirmed');
      }
      const w = weightNear(s.participant_id, s.t, s.rows.filter(x => x.body_weight_kg != null).map(x => x.body_weight_kg));
      s.weight = w;
      if (w) s.metrics.vo2peak_rel = r.vo2_lmin * 1000 / w;
    }

    // ЧСС пика до разгрузки (опора метода ACI: ЧСС пика в полёте не меняется — MOORE14)
    for (const pid in pInfo) {
      const pi = pInfo[pid];
      pi.hrMax = {};
      for (const pos of pi.postures) {
        let base = sessions.filter(s => s.participant_id === pid && s.test_type === 'peak' && s.phase === 'pre' && s.quality === 'ok' && s.hrPeak != null && s.posture === pos);
        let src = 'same';
        if (!base.length) { base = sessions.filter(s => s.participant_id === pid && s.test_type === 'peak' && s.phase === 'pre' && s.quality === 'ok' && s.hrPeak != null); src = 'other'; }
        if (base.length) pi.hrMax[pos] = { v: mean(base.map(s => s.hrPeak)), n: base.length, method: 'measured', src };
        else if (pi.age != null) pi.hrMax[pos] = { v: 207 - 0.67 * pi.age, n: 0, method: 'age' };
      }
      // Эталонная нагрузка: старшая ступень, присутствующая во всех базовых Submax-тестах (HERITAGE: при большей мощности воспроизводимость выше)
      if (cfg.refWorkloadW > 0) pi.refW = cfg.refWorkloadW;
      else {
        const pre = sessions.filter(s => s.participant_id === pid && s.test_type === 'submax' && s.phase === 'pre');
        const sets = pre.map(s => new Set(s.rows.filter(r => !r.isRestStage && r.workload_w > 0 && r.heart_rate != null).map(r => r.workload_w)));
        const common = sets.length ? [...sets[0]].filter(w => sets.every(st => st.has(w))) : [];
        pi.refW = common.length ? Math.max(...common) : null;
      }
    }

    // ЧСС пика после начала разгрузки заметно ниже исходной (MR080G: оба крупных промаха ACI — у таких тестов)
    for (const s of sessions.filter(x => x.test_type === 'peak' && x.phase !== 'pre' && x.hrPeak != null && x.quality === 'ok')) {
      const hm = pInfo[s.participant_id].hrMax[s.posture];
      if (hm && hm.method === 'measured' && s.hrPeak < hm.v - 10) {
        sessionIssue(s, 'PEAK_HR_DROP', { field: 'heart_rate', value: s.hrPeak, message: `Peak HR ${s.hrPeak} vs baseline ${Math.round(hm.v)}: test may be submaximal` });
        s.quality = 'caution'; s.notes.push('Peak HR > 10 bpm below baseline');
      }
    }

    // Submax: ЧСС при эталонной нагрузке и ACI
    for (const s of sessions.filter(x => x.test_type === 'submax')) {
      const pi = pInfo[s.participant_id];
      const hm = pi.hrMax[s.posture];
      const exRows = s.rows.filter(r => !r.isRestStage);
      const incomplete = exRows.some(r => r.heart_rate == null || r.workload_w == null);
      let st = exRows.filter(r => r.heart_rate != null && r.workload_w != null && r.workload_w > 0).sort((a, b) => a.workload_w - b.workload_w);
      if (incomplete) { s.quality = 'caution'; s.notes.push('Incomplete session: stage without HR or workload'); }
      if (hm && hm.method === 'measured') {
        const over = st.filter(r => r.heart_rate > hm.v + 5);
        over.forEach(r => addIssue(r, 'heart_rate', r.heart_rate, 'SUBMAX_HR_ABOVE', { message: `HR ${r.heart_rate} above personal peak ${Math.round(hm.v)}` }));
        if (over.length) { st = st.filter(r => !over.includes(r)); s.quality = 'caution'; s.notes.push('Stage HR above personal peak'); }
      }
      const w = weightNear(s.participant_id, s.t, s.rows.filter(x => x.body_weight_kg != null).map(x => x.body_weight_kg));
      s.weight = w;
      s.stages = st.map(r => ({ w: r.workload_w, hr: r.heart_rate, vo2: r.vo2_lmin != null ? r.vo2_lmin : (w ? (1.8 * 6.12 * r.workload_w + 7 * w) / 1000 : null), vo2Measured: r.vo2_lmin != null }));
      let mono = true;
      for (let i = 1; i < st.length; i++) if (st[i].heart_rate < st[i - 1].heart_rate - 2 && st[i].workload_w > st[i - 1].workload_w) mono = false;
      if (!mono) { sessionIssue(s, 'SUBMAX_NONMONO'); s.quality = 'caution'; s.notes.push('HR does not rise with workload'); }
      wattCheck(s);
      // ЧСС при эталонной нагрузке (только интерполяция); при противоречивых ваттах не считается
      if (pi.refW != null && st.length && !s.wattsBad) {
        const exact = st.find(r => r.workload_w === pi.refW);
        if (exact) s.metrics.hr_ref = exact.heart_rate;
        else {
          const lo = [...st].reverse().find(r => r.workload_w < pi.refW), hi = st.find(r => r.workload_w > pi.refW);
          if (lo && hi) s.metrics.hr_ref = lo.heart_rate + (hi.heart_rate - lo.heart_rate) * (pi.refW - lo.workload_w) / (hi.workload_w - lo.workload_w);
        }
      }
      // ACI (MOORE15): регрессия ЧСС по VO₂ на ступенях, VO₂ при ЧСС пика до разгрузки
      const pts = s.stages.filter(x => Number.isFinite(x.vo2) && Number.isFinite(x.hr));
      if (pts.length < 2) sessionIssue(s, 'FEW_STAGES');
      else if (!hm) sessionIssue(s, 'NO_HRMAX');
      else if (mono && !s.wattsBad) {
        const lr = linreg(pts.map(x => x.vo2), pts.map(x => x.hr));
        // Team software guard against unstable extrapolation; not a NASA clinical cutoff.
        const hrSpan = Math.max(...pts.map(x => x.hr)) - Math.min(...pts.map(x => x.hr));
        if (lr && Number.isFinite(lr.b) && lr.b > 0 && hrSpan >= 10) {
          const est = (hm.v - lr.a) / lr.b;
          if (Number.isFinite(est) && est > 0.5 && est < 7) {
            s.metrics.aci = est; s.fit = lr; s.hrMaxUsed = hm;
            if (hm.method !== 'measured') s.notes.push('ACI uses age-predicted peak HR — deviates from NASA method');
            if (pts.some(x => !x.vo2Measured)) s.notes.push('Stage VO₂ computed with ACSM equation');
            if (hm.method !== 'measured' || pts.some(x => !x.vo2Measured)) { sessionIssue(s, 'ACI_MODEL_ASSUMPTION'); s.quality = 'caution'; }
          }
        }
      }
      if (pts.length >= 2 && hm && mono && s.metrics.aci == null) { sessionIssue(s, 'ACI_INVALID_FIT'); s.quality = 'caution'; }
    }

    // -------------------------------------------------------------------------
    // Типичная ошибка: по данным когорты (Hopkins 2000) или из литературы
    // -------------------------------------------------------------------------
    const te = {};
    for (const key of Object.keys(METRICS)) {
      const lit = cfg.metrics[key].cv;
      const groupsTE = Object.create(null);
      sessions.filter(s => s.metrics[key] != null && s.phase === 'pre' && s.quality === 'ok')
        .forEach(s => (groupsTE[JSON.stringify([s.participant_id, s.posture])] = groupsTE[JSON.stringify([s.participant_id, s.posture])] || []).push(Math.log(s.metrics[key])));
      let ss = 0, df = 0, subj = 0;
      for (const g in groupsTE) { const a = groupsTE[g]; if (a.length < 2) continue; const m = mean(a); ss += a.reduce((x, v) => x + (v - m) ** 2, 0); df += a.length - 1; subj++; }
      const dataCv = df ? (Math.exp(Math.sqrt(ss / df)) - 1) * 100 : null;
      // Консервативно: верхняя 90%-я граница TE (χ², аппроксимация Уилсона — Хилферти), чтобы малое df не занижало порог
      const chi2lo = df ? df * Math.pow(1 - 2 / (9 * df) - 1.2816 * Math.sqrt(2 / (9 * df)), 3) : null;
      const dataCvUpper = df && chi2lo > 0 ? (Math.exp(Math.sqrt(ss / chi2lo)) - 1) * 100 : null;
      const useData = cfg.teMode === 'auto' && subj >= cfg.teMinSubjects && dataCvUpper != null;
      te[key] = { used: useData ? dataCvUpper : lit, lit, data: dataCv, dataUpper: dataCvUpper, subjects: subj, df, source: useData ? 'data' : 'literature' };
    }

    // -------------------------------------------------------------------------
    // Physiological Intelligence Layer
    // -------------------------------------------------------------------------
    const participants = Object.keys(pInfo).sort();
    const analysis = Object.create(null);
    for (const pid of participants) {
      const ss = sessions.filter(s => s.participant_id === pid);
      const m = {};
      for (const key of Object.keys(METRICS)) m[key] = analyzeMetric(ss, key, cfg, te[key], (r, code, ex) => addIssue(r, '*', '', code, ex));
      analysis[pid] = { pid, info: pInfo[pid], metrics: m, status: overallStatus(m), nasa: nasaStatus(m, cfg) };
    }
    const comparison = comparePeakSubmax(sessions, analysis, cfg);

    const usedRows = records.filter(r => !r.excluded).length;
    const sevCount = { error: 0, warning: 0, info: 0 };
    issues.forEach(i => sevCount[i.severity]++);
    const rowsWithIssues = new Set(issues.filter(i => i.severity !== 'info').map(i => i.row_id)).size;
    const summary = {
      files: fileInfo.length, rows: records.length, usedRows, excludedRows: records.length - usedRows,
      rowsWithIssues, cleanRows: records.length - rowsWithIssues, issues: issues.length, sevCount,
      sessions: sessions.length, participants: participants.length,
      synthetic: records.length > 0 && records.every(r => r.synthetic), anySynthetic: records.some(r => r.synthetic),
      trustPct: records.length ? (records.length - rowsWithIssues) / records.length * 100 : 0,
      postures: [...new Set(sessions.map(s => s.posture))],
    };
    return { cfg, te, files: fileInfo, records, issues, sessions, participants, analysis, comparison, summary, lang: LANG };
  }

  // Анализ одного показателя у одного участника. База — отдельно для каждого положения тела.
  function analyzeMetric(sessions, key, cfg, teInfo, issueCb) {
    const meta = METRICS[key];
    const te = teInfo.used;
    const pts = sessions.filter(s => s.metrics[key] != null).map(s => ({ t: s.t, v: s.metrics[key], phase: s.phase, posture: s.posture, quality: s.quality, session: s })).sort((a, b) => a.t - b.t);
    const res = { key, meta, te, teInfo, points: pts, status: 'insufficient', reasons: [], baselines: {}, baseline: null, mdc: null, run: [], trend: null, recovery: null, worst: null, nasa: null };
    if (!pts.length) { res.reasons.push('No measurements of this metric'); return res; }
    // Базовый уровень по каждому положению тела
    const postures = [...new Set(pts.map(p => p.posture))];
    for (const pos of postures) {
      let base = pts.filter(p => p.phase === 'pre' && p.quality === 'ok' && p.posture === pos), caution = false;
      if (!base.length) { base = pts.filter(p => p.phase === 'pre' && p.posture === pos); caution = base.length > 0; }
      if (!base.length) continue;
      const bv = mean(base.map(p => p.v)), bsd = sd(base.map(p => p.v));
      res.baselines[pos] = { posture: pos, value: bv, n: base.length, sd: bsd, cvObs: bsd != null ? bsd / bv * 100 : null, caution, points: base, mdc: 1.96 * te * Math.sqrt(1 + 1 / base.length) };
    }
    const bkeys = Object.keys(res.baselines);
    if (!bkeys.length) { res.reasons.push('No pre-unloading measurements — personal baseline undefined'); pts.forEach(p => p.role = 'nobase'); return res; }
    res.baseline = bkeys.map(k => res.baselines[k]).sort((a, b) => b.points.length - a.points.length)[0];
    res.mdc = res.baseline.mdc;
    let warnedPosture = false;
    for (const p of pts) {
      const b = res.baselines[p.posture];
      if (!b) { p.role = 'nobase'; if (!warnedPosture && issueCb && p.phase !== 'pre') { issueCb(p.session.rows[0], 'POSTURE_NO_BASE', { message: `${tr(meta.label)}: ${tr(POSTURE_LABEL[p.posture])} test without same-posture baseline` }); warnedPosture = true; } continue; }
      p.base = b;
      p.delta = (p.v - b.value) / b.value * 100;
      p.pctOfPre = 100 + p.delta;
      p.beyond = Math.abs(p.delta) > b.mdc;
      p.unfav = p.beyond && Math.sign(p.delta) === meta.unfav;
      p.fav = p.beyond && !p.unfav;
      p.role = b.points.includes(p) ? 'baseline' : (p.phase === 'pre' ? 'pre-extra' : (!['in', 'post'].includes(p.phase) ? 'unphased' : (p.quality === 'ok' && !b.caution ? 'followup' : 'caution')));
    }
    const fu = pts.filter(p => p.role === 'followup');
    if (!fu.length) { res.reasons.push('No valid post-onset measurements comparable to baseline'); return res; }
    let run = [], best = [], runF = [], bestF = [];
    for (const p of fu) {
      if (p.unfav) { run.push(p); if (run.length > best.length) best = [...run]; } else run = [];
      if (p.fav) { runF.push(p); if (runF.length > bestF.length) bestF = [...runF]; } else runF = [];
    }
    const unfavPts = fu.filter(p => p.unfav);
    res.worst = fu.reduce((a, b) => (b.delta * meta.unfav > a.delta * meta.unfav ? b : a));
    if (best.length >= cfg.confirmPoints) { res.status = 'confirmed'; res.run = best; }
    else if (unfavPts.length) { res.status = 'single'; res.run = unfavPts; }
    else if (bestF.length >= cfg.confirmPoints) { res.status = 'improved'; res.run = bestF; }
    else res.status = 'stable';
    const inP = fu.filter(p => p.phase === 'in' && p.posture === res.baseline.posture);
    if (inP.length >= 3) {
      const lr = linreg(inP.map(p => p.t), inP.map(p => p.delta));
      if (lr) res.trend = { slope: lr.b, se: lr.se, n: lr.n, lo: lr.se != null ? lr.b - 1.96 * lr.se : null, hi: lr.se != null ? lr.b + 1.96 * lr.se : null };
    }
    const post = fu.filter(p => p.phase === 'post');
    if (post.length) { const last = post[post.length - 1]; res.recovery = { last, recovered: !last.beyond || last.fav }; }
    res.cautionCount = pts.filter(p => p.role === 'caution').length;
    res.nobaseCount = pts.filter(p => p.role === 'nobase').length;
    // Стандарт NASA [V1 4003]: ≥ 80% исходного (прямое или косвенное измерение — поэтому и для ACI)
    if (key === 'vo2peak' || key === 'vo2peak_rel' || key === 'aci') {
      const below = fu.filter(p => p.pctOfPre < cfg.nasaPctOfPre);
      res.nasa = { below80: below, min: Math.min(...fu.map(p => p.pctOfPre)) };
    }
    // Абсолютные стандарты [V1 4001/4002] для VO₂peak на кг
    if (key === 'vo2peak_rel') {
      const valid = pts.filter(p => p.quality === 'ok');
      res.eva = {
        belowMicroG: valid.filter(p => p.v < cfg.nasaEvaMicroG),
        belowSurface: valid.filter(p => p.v < cfg.nasaEvaSurface),
        preBelowSurface: res.baseline.value < cfg.nasaEvaSurface,
        preBelowMicroG: res.baseline.value < cfg.nasaEvaMicroG,
      };
    }
    return res;
  }

  function overallStatus(m) {
    // Итог опирается на прямые измерения; ACI учитывается, только если прямых нет (MOORE10: ACI плохо отслеживает VO₂max)
    const direct = ['vo2peak', 'vo2peak_rel', 'hr_ref'].map(k => m[k].status);
    const pool = direct.some(s => s !== 'insufficient') ? direct : [m.aci.status];
    for (const st of ['confirmed', 'single', 'improved', 'stable']) if (pool.includes(st)) return st;
    return 'insufficient';
  }

  function nasaStatus(m, cfg) {
    const v = m.vo2peak, a = m.aci;
    const out = { below80: false, screenBelow80: false, by: null, minPct: null };
    if (v.nasa && v.nasa.below80.length) { out.below80 = true; out.by = 'vo2peak'; out.minPct = v.nasa.min; }
    else if (v.status === 'insufficient' && a.nasa && a.nasa.below80.length) { out.screenBelow80 = true; out.by = 'aci'; out.minPct = a.nasa.min; }
    else if (v.nasa) out.minPct = v.nasa.min;
    return out;
  }

  // Peak vs Submax: согласие ACI с измеренным VO₂peak (Бланд — Альтман) и согласие изменений (rmcorr)
  function comparePeakSubmax(sessions, analysis, cfg) {
    const pairs = [], hrPairs = [];
    const pointOf = (pid, key, s) => analysis[pid].metrics[key].points.find(x => x.session === s);
    for (const pid in analysis) {
      const peaks = sessions.filter(s => s.participant_id === pid && s.test_type === 'peak' && s.quality === 'ok' && s.metrics.vo2peak != null);
      const subs = sessions.filter(s => s.participant_id === pid && s.test_type === 'submax' && s.quality === 'ok');
      for (const pk of peaks) {
        const near = subs.filter(s => s.posture === pk.posture && Math.abs(s.t - pk.t) <= cfg.pairWindowDays).sort((a, b) => Math.abs(a.t - pk.t) - Math.abs(b.t - pk.t));
        const se = near.find(s => s.metrics.aci != null);
        const pm = pointOf(pid, 'vo2peak', pk);
        if (se) { const pe = pointOf(pid, 'aci', se); pairs.push({ pid, t: pk.t, phase: pk.phase, posture: pk.posture, meas: pk.metrics.vo2peak, est: se.metrics.aci, dt: se.t - pk.t, dMeas: pm && pm.delta != null ? pm.delta : null, dEst: pe && pe.delta != null ? pe.delta : null }); }
        const sh = near.find(s => s.metrics.hr_ref != null);
        if (sh) { const ph = pointOf(pid, 'hr_ref', sh); hrPairs.push({ pid, t: pk.t, phase: pk.phase, dVo2: pm && pm.delta != null ? pm.delta : null, dHr: ph && ph.delta != null ? ph.delta : null }); }
      }
    }
    const out = { pairs, hrPairs, nPairs: pairs.length, nPid: new Set(pairs.map(p => p.pid)).size };
    if (pairs.length >= 3) {
      const diff = pairs.map(p => p.est - p.meas), dpct = pairs.map(p => (p.est - p.meas) / p.meas * 100);
      out.bias = mean(diff); out.sdDiff = sd(diff);
      out.loa = out.sdDiff != null ? [out.bias - 1.96 * out.sdDiff, out.bias + 1.96 * out.sdDiff] : null;
      out.biasPct = mean(dpct); const sp = sd(dpct); out.loaPct = sp != null ? [out.biasPct - 1.96 * sp, out.biasPct + 1.96 * sp] : null;
      out.r = pearson(pairs.map(p => p.meas), pairs.map(p => p.est));
      out.mape = mean(dpct.map(Math.abs));
      const ch = pairs.filter(p => p.phase !== 'pre' && p.dMeas != null && p.dEst != null);
      out.nChange = ch.length;
      out.rChange = pearson(ch.map(p => p.dMeas), ch.map(p => p.dEst));
      out.rmChange = rmcorr(pairs.filter(p => p.dMeas != null && p.dEst != null).map(p => ({ g: p.pid, x: p.dMeas, y: p.dEst })));
      const thr = 1.96 * cfg.metrics.vo2peak.cv * Math.SQRT2;
      const sig = ch.filter(p => Math.abs(p.dMeas) > thr);
      out.dirAgree = sig.length ? sig.filter(p => Math.sign(p.dEst) === Math.sign(p.dMeas)).length / sig.length * 100 : null;
      out.nSig = sig.length;
      // Совпадение решения по стандарту NASA 80%: ACI < 80% ⇔ измеренный < 80%
      const cls = ch.map(p => [p.dMeas < -20, p.dEst < -20]);
      out.nasaAgree = cls.length ? cls.filter(([a, b]) => a === b).length / cls.length * 100 : null;
      out.nasaMissed = cls.filter(([a, b]) => a && !b).length;
      out.nasaFalse = cls.filter(([a, b]) => !a && b).length;
    }
    const hc = hrPairs.filter(p => p.dVo2 != null && p.dHr != null);
    out.nHr = hc.filter(p => p.phase !== 'pre').length;
    out.rmHr = rmcorr(hc.map(p => ({ g: p.pid, x: p.dVo2, y: p.dHr })));
    // Критерии AEROCORE (не NASA): смещение ≤ 5%, пределы согласия ≤ ±10%, rmcorr изменений ≥ 0,7
    const crit = { bias: 5, loa: 10, rm: 0.7 };
    out.criteria = crit;
    if (out.nPid < 8 || out.nPairs < 15) out.verdict = { level: 'insufficient', text: `Not enough pairs: ${out.nPairs} pairs from ${out.nPid} participants (need ≥ 15 pairs and ≥ 8 participants).` };
    else {
      const okBias = Math.abs(out.biasPct) <= crit.bias;
      const okLoa = out.loaPct && Math.max(Math.abs(out.loaPct[0] - out.biasPct), Math.abs(out.loaPct[1] - out.biasPct)) <= crit.loa;
      const okRm = out.rmChange && out.rmChange.r != null && out.rmChange.r >= crit.rm;
      out.checks = { okBias, okLoa, okRm };
      if (okBias && okLoa && okRm) out.verdict = { level: 'promising', text: 'ACI agrees with measured VO₂peak on all three criteria. This does not prove Submax can replace the Peak test outside this dataset.' };
      else out.verdict = { level: 'weak', text: 'ACI fails the agreement criteria. This matches NASA’s finding that submaximal estimates do not track measured VO₂max well. ACI is a trigger for an extra Peak test, not a replacement.' };
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Объяснения
  // ---------------------------------------------------------------------------
  const STATUS_TEXT = {
    confirmed: 'Sustained change',
    single: 'Single deviation',
    improved: 'Sustained improvement',
    stable: 'Within variability',
    insufficient: 'Insufficient data',
  };
  const statusText = s => tr(STATUS_TEXT[s]);

  function explainMetric(a, cfg) {
    const m = a.meta, d = m.digits, unit = tr(m.unit);
    const ex = { title: tr(m.label), status: a.status, statusText: statusText(a.status), headline: '', why: [], method: [], limits: [], sources: [], nasa: [] };
    if (a.status === 'insufficient') {
      ex.headline = a.reasons.join('. ');
      ex.limits.push('Without a same-posture personal baseline the system draws no conclusion — by design.');
      return ex;
    }
    const b = a.baseline;
    const dirWord = m.unfav < 0 ? 'decrease' : 'increase';
    const fmtPt = p => `${fmt(p.v, d)} ${unit} (${'day'} ${p.t}, ${fmt(p.delta, 1, true)}%)`;
    if (a.status === 'confirmed') ex.headline = `${cap(dirWord)} of ${fmt(Math.abs(a.worst.delta), 1)}% from personal baseline, confirmed by ${a.run.length} consecutive measurements.`;
    else if (a.status === 'single') ex.headline = `${a.run.length === 1 ? 'One deviation' : 'Isolated deviations'} beyond threshold, not confirmed by ${cfg.confirmPoints} consecutive measurements.`;
    else if (a.status === 'improved') ex.headline = `Sustained favourable change (${fmt(a.run[a.run.length - 1].delta, 1, true)}%).`;
    else ex.headline = `All valid measurements within ±${fmt(a.mdc, 1)}% of personal baseline.`;

    for (const bb of Object.values(a.baselines)) {
      ex.why.push(`Personal baseline (${tr(POSTURE_LABEL[bb.posture])}): ${fmt(bb.value, d)} ${unit} — mean of ${bb.n} pre-unloading measurement${bb.n === 1 ? '' : 's'}${bb.caution ? ' (questionable tests only — unreliable)' : ''}.`);
    }
    const ti = a.teInfo;
    ex.why.push(`Minimal detectable change MDC₉₅: ±${fmt(a.mdc, 1)}% with typical error ${fmt(a.te, 1)}% (${ti.source === 'data' ? `from cohort data, upper 90% bound: ${ti.subjects} participants, df = ${ti.df}` : 'from literature'}).`);
    if (['confirmed', 'single', 'improved'].includes(a.status)) ex.why.push('Measurements beyond threshold: ' + a.run.map(fmtPt).join('; ') + '.');
    if (a.worst) ex.why.push('Largest unfavourable deviation: ' + fmtPt(a.worst) + '.');
    if (a.trend) ex.why.push(`Trend during unloading: ${fmt(a.trend.slope, 2, true)}% per day${a.trend.lo != null ? ` (95% CI ${fmt(a.trend.lo, 2, true)}…${fmt(a.trend.hi, 2, true)})` : ''}, n = ${a.trend.n}.`);
    if (a.recovery) ex.why.push(a.recovery.recovered ? `Last recovery measurement (day ${a.recovery.last.t}) back within threshold.` : `Last recovery measurement (day ${a.recovery.last.t}) still beyond threshold: ${fmt(a.recovery.last.delta, 1, true)}%.`);
    if (a.cautionCount) ex.why.push(`${a.cautionCount} questionable measurement(s) shown on chart, excluded from conclusion.`);
    if (a.nobaseCount) ex.why.push(`${a.nobaseCount} measurement(s) in another posture not compared with baseline.`);

    // Стандарты NASA
    if (a.nasa) {
      if (a.nasa.below80.length) ex.nasa.push({ level: 'err', text: `Below 80% of pre-mission value (NASA-STD-3001 [V1 4003]): minimum ${fmt(a.nasa.min, 1)}% of baseline, ${a.nasa.below80.length} measurement(s).` });
      else ex.nasa.push({ level: 'ok', text: `At or above 80% of pre-mission value (NASA-STD-3001 [V1 4003]): minimum ${fmt(a.nasa.min, 1)}% of baseline.` });
    }
    if (a.eva) {
      ex.nasa.push({ level: a.eva.belowMicroG.length ? 'err' : 'ok', text: `Microgravity EVA threshold ${fmt(cfg.nasaEvaMicroG, 1)} mL/kg/min [V1 4001]: ${a.eva.belowMicroG.length} measurement(s) below${a.eva.preBelowMicroG ? '; baseline already below' : ''}.` });
      ex.nasa.push({ level: a.eva.belowSurface.length ? 'warn' : 'ok', text: `Surface EVA threshold ${fmt(cfg.nasaEvaSurface, 1)} mL/kg/min [V1 4002]: ${a.eva.belowSurface.length} measurement(s) below${a.eva.preBelowSurface ? '; baseline already below' : ''}.` });
    }

    ex.method.push('Comparison with the same participant’s baseline, same test type and same posture.');
    ex.method.push('MDC₉₅ = 1.96 × TE × √(1 + 1/n), n — number of baseline measurements.');
    ex.method.push(`“Sustained” = at least ${cfg.confirmPoints} consecutive valid measurements beyond threshold in one direction.`);
    ex.sources.push('EVID', 'HOPKINS');
    if (a.key === 'vo2peak' || a.key === 'vo2peak_rel') { ex.method.push('A test counts unless maximal effort is refuted by NASA criteria (4 of 5: RER ≥ 1.10; VO₂ plateau; volitional fatigue; HR within 10 bpm of 207 − 0.67 × age; RPE ≥ 19).'); ex.sources.push('STD3001'); }
    if (a.key === 'aci') { ex.method.push('ACI (NASA method): linear regression of HR on VO₂ across Submax stages, VO₂ at the peak HR measured before unloading. Peak HR does not change in flight (Moore 2014).'); ex.sources.push('MOORE15', 'MOORE14', 'MOORE10'); }
    if (a.key === 'hr_ref') { ex.method.push('HR at the same absolute workload (highest stage common to all baseline tests). Higher HR at the same load is the most prominent bed-rest deconditioning feature.'); ex.sources.push('HERITAGE'); }

    if (b.n < 2) ex.limits.push('Baseline from one measurement: individual variability unknown.');
    if (b.cvObs != null && b.cvObs > 2 * a.te) ex.limits.push(`Baseline variability (${fmt(b.cvObs, 1)}%) exceeds typical error — threshold may be too low.`);
    if (ti.source === 'literature' && a.key === 'aci') ex.limits.push('No published typical error for ACI: 8% assumption used. With ≥ 5 participants in real data it is estimated from data.');
    ex.limits.push('This is a change in a measured value, not a diagnosis. Medical interpretation requires a specialist.');
    if (a.key === 'aci') ex.limits.push('NASA: submaximal estimates do not track measured VO₂max well. ACI does not set the overall status when direct measurements exist.');
    if (a.key === 'vo2peak_rel') ex.limits.push('Depends on both VO₂ and body mass.');
    return ex;
  }

  function buildReport(res, pid) {
    const a = res.analysis[pid]; if (!a) return '';
    const R = [];
    R.push(`AEROCORE — report for participant ${pid}`);
    R.push('Generated' + `: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    if (res.summary.anySynthetic) R.push('WARNING: report built on SYNTHETIC data. These are not measurements of real people.');
    R.push('');
    R.push('1. Data quality');
    const iss = res.issues.filter(i => i.participant_id === pid);
    R.push('   ' + `Issues: ${iss.length} (errors ${iss.filter(i => i.severity === 'error').length}, warnings ${iss.filter(i => i.severity === 'warning').length}).`);
    iss.filter(i => i.severity !== 'info').slice(0, 12).forEach(i => R.push(`   - ${i.row_id} · ${i.field}: ${i.message}. ${i.action}.`));
    for (const [pos, h] of Object.entries(a.info.hrMax)) R.push('   ' + `Peak HR for ACI (${tr(POSTURE_LABEL[pos])}): ${Math.round(h.v)} bpm — ${h.method === 'measured' ? `measured pre-unloading, ${h.n} test(s)` : 'predicted 207 − 0.67 × age'}.`);
    R.push('   ' + 'Submax reference workload' + `: ${a.info.refW != null ? a.info.refW + ' W' : '—'}.`);
    R.push('');
    R.push('2. Summary' + `: ${statusText(a.status)}` + (a.nasa.below80 ? ' · BELOW 80% OF PRE-MISSION (NASA-STD-3001 [V1 4003])' : ''));
    R.push('');
    let k = 3;
    for (const key of Object.keys(METRICS)) {
      const ex = explainMetric(a.metrics[key], res.cfg);
      R.push(`${k++}. ${ex.title} — ${ex.statusText}`);
      R.push(`   ${ex.headline}`);
      ex.why.forEach(w => R.push(`   • ${w}`));
      ex.nasa.forEach(n => R.push(`   ${n.level === 'ok' ? '✓' : '!'} ${n.text}`));
      if (ex.limits.length) { R.push('   ' + 'Limitations:'); ex.limits.forEach(w => R.push(`   – ${w}`)); }
      R.push('');
    }
    R.push('Sources' + ':');
    ['STD3001', 'EVID', 'MOORE14', 'MOORE15', 'MOORE10', 'CFT70', 'HOPKINS'].forEach(s => R.push(`   ${SOURCES[s].cite} — ${SOURCES[s].url}`));
    R.push('');
    R.push('The system makes no diagnoses and prescribes no treatment.');
    return R.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Синтетические данные с известной «истиной»
  // Протокол Submax — 3 ступени по 5 мин на 25/50/75% VO₂peak (MOORE15); шум VO₂peak 3% (EVID).
  // ---------------------------------------------------------------------------
  function generateSynthetic(opt = {}) {
    const o = Object.assign({ seed: 42, n: 10, bedRestDays: 60, scenario: 'mixed', fixedDecline: 0, injectErrors: true, hrNoise: 3, vo2Cv: 3, stageVo2Cv: 3 }, opt);
    const R = makeRng(o.seed);
    const Ld = o.bedRestDays;
    const peakDays = [-9, -4, Math.round(Ld / 2), Ld - 1, Ld + 1, Ld + 12];
    const subDays = [-8, -3]; for (let d = 7; d < Ld; d += 7) subDays.push(d); subDays.push(Ld + 2, Ld + 5, Ld + 12);
    const rows = [];
    const truth = { participants: {}, errors: [], scenario: o.scenario, bedRestDays: Ld, seed: o.seed };
    const base = Date.UTC(2026, 0, 5);
    for (let i = 0; i < o.n; i++) {
      const pid = 'SYN-' + String(i + 1).padStart(2, '0');
      let group, D;
      if (o.scenario === 'null') { group = 'no change'; D = 0; }
      else if (o.scenario === 'fixed') { group = `set decline ${o.fixedDecline}%`; D = o.fixedDecline / 100; }
      else if (i % 3 === 2) { group = 'exercise'; D = R.uni(0, 0.04); }
      else { group = 'no countermeasure'; D = R.uni(0.12, 0.25); }
      const age = R.int(24, 52), kg0 = R.n(76, 9), vo2base = Math.max(1.8, R.n(3.1, 0.45));
      const hrmax = 207 - 0.67 * age + R.n(0, 4), hrrest0 = 60 + R.n(0, 5), curv = R.uni(0.9, 1.12);
      const tau = Ld / 3, tauR = 10;
      const dEnd = D * (1 - Math.exp(-(Ld - 1) / tau));
      const dAt = t => t < 0 ? 0 : (t < Ld ? D * (1 - Math.exp(-t / tau)) : dEnd * Math.exp(-(t - Ld) / tauR));
      const start = R.int(0, 40);
      const dateOf = t => iso(base + (start + t + 13) * DAY);
      // Ступени на 25/50/75% исходного VO₂peak (уравнение ACSM для велоэргометра)
      const stagesW = [0.25, 0.5, 0.75].map(f => Math.max(25, Math.round((f * vo2base * 1000 - 7 * kg0) / (1.8 * 6.12) / 25) * 25));
      truth.participants[pid] = { group, declineEndPct: +(dEnd * 100).toFixed(1), vo2base: +vo2base.toFixed(2), age };
      const evs = [...peakDays.map(d => ({ d, type: 'peak' })), ...subDays.map(d => ({ d, type: 'submax' }))].sort((a, b) => a.d - b.d || (a.type === 'submax' ? -1 : 1));
      for (const ev of evs) {
        const t = ev.d, d = dAt(t), vo2p = vo2base * (1 - d);
        const kg = kg0 * (1 - 0.02 * (D > 0 ? d / D : 0)) + R.n(0, 0.3);
        const common = { participant_id: pid, study_id: 'SYNTH-HDBR', posture: 'upright', measurement_date: dateOf(t), study_day: t, study_phase: phaseFromDay(t, Ld), body_weight_kg: kg.toFixed(1), age, data_source: 'synthetic', is_synthetic: 1 };
        if (ev.type === 'peak') {
          const v = vo2p * (1 + R.n(0, o.vo2Cv / 100));
          rows.push({ ...common, test_type: 'Peak', stage: '', workload_w: Math.round((v * 1000 - 7 * kg) / (1.8 * 6.12) / 10) * 10, heart_rate: Math.round(hrmax + R.n(0, 3)), vo2_lmin: v.toFixed(3), rer: (1.13 + Math.abs(R.n(0, 0.04))).toFixed(2), rpe: R.pick([19, 19, 20]) });
        } else {
          const hrrest = hrrest0 * (1 + 0.5 * d), vo2rest = 3.5 * kg / 1000;
          stagesW.forEach((W, k) => {
            const vs = (1.8 * 6.12 * W + 7 * kg) / 1000;
            const f = Math.max(0, Math.min(1.05, (vs - vo2rest) / (vo2p - vo2rest)));
            const hr = hrrest + (hrmax - hrrest) * Math.pow(f, curv) + R.n(0, o.hrNoise);
            rows.push({ ...common, test_type: 'Submax', stage: k + 1, workload_w: W, heart_rate: Math.round(hr), vo2_lmin: (vs * (1 + R.n(0, o.stageVo2Cv / 100))).toFixed(3), rer: (0.82 + 0.12 * f + R.n(0, 0.02)).toFixed(2), rpe: '' });
          });
        }
      }
    }
    // Внедрение известных ошибок
    if (o.injectErrors && o.scenario === 'mixed') {
      const pick = pred => { const c = rows.filter(r => !r._inj && pred(r)); return c.length ? R.pick(c) : null; };
      const mark = (r, codes, desc) => { (r._inj = r._inj || []).push({ codes, desc }); };
      const sub = x => x.test_type === 'Submax' && x.study_phase !== 'pre';
      let r;
      if ((r = pick(sub))) { r.heart_rate = 999; mark(r, ['OUT_OF_RANGE'], 'HR = 999 (sensor/record fault)'); }
      if ((r = pick(sub))) { r.heart_rate = ''; mark(r, ['MISSING_VALUE'], 'Missing HR'); }
      if ((r = pick(sub))) { r.heart_rate = '12O'; mark(r, ['NOT_NUMBER'], 'Typo: letter O instead of zero'); }
      if ((r = pick(x => x.test_type === 'Peak' && x.study_phase === 'in'))) { r.vo2_lmin = Math.round(+r.vo2_lmin * 1000); mark(r, ['UNIT_SUSPECT'], 'VO₂ recorded in mL/min instead of L/min'); }
      if ((r = pick(x => x.test_type === 'Peak' && x.study_phase === 'in'))) { r.rer = '1.03'; r.rpe = 15; r.vo2_lmin = (+r.vo2_lmin * 0.88).toFixed(3); mark(r, ['PEAK_CRITERIA'], 'Test stopped before maximum (RER 1.03, RPE 15, VO₂ underestimated)'); }
      if ((r = pick(x => x.test_type === 'Peak' && x.study_phase !== 'pre'))) { r.body_weight_kg = (+r.body_weight_kg / 10).toFixed(1); mark(r, ['OUT_OF_RANGE'], 'Body mass: lost digit (7.6 instead of 76)'); }
      if ((r = pick(sub))) { r.measurement_date = '2026-13-45'; mark(r, ['BAD_DATE'], 'Invalid date'); }
      if ((r = pick(sub))) { r.participant_id = ''; mark(r, ['MISSING_ID'], 'Missing participant ID'); }
      if ((r = pick(sub))) { const c = { ...r }; mark(c, ['DUPLICATE'], 'Exact duplicate row'); rows.splice(rows.indexOf(r) + 1, 0, c); }
      if ((r = pick(x => x.test_type === 'Peak' && x.study_phase !== 'pre'))) {
        const c = { ...r, vo2_lmin: (+r.vo2_lmin * 1.07).toFixed(3) };
        mark(r, ['CONFLICT'], 'Two different records of one test'); mark(c, ['CONFLICT'], 'Two different records of one test');
        rows.splice(rows.indexOf(r) + 1, 0, c);
      }
    }
    const fileName = o.scenario === 'mixed' ? 'aerocore_synthetic.csv' : `aerocore_synthetic_${o.scenario}.csv`;
    rows.forEach((r, i) => { if (r._inj) { r._inj.forEach(e => truth.errors.push({ row_id: `${fileName}:${i + 2}`, codes: e.codes, desc: e.desc, pid: r.participant_id })); delete r._inj; } });
    return { fileName, rows, truth, csv: toCSV(rows, CANON_COLUMNS) };
  }

  // ---------------------------------------------------------------------------
  // Проверка алгоритма против известной «истины»
  // ---------------------------------------------------------------------------
  function evaluateAgainstTruth(res, truth) {
    const byRow = {};
    res.issues.forEach(i => (byRow[i.row_id] = byRow[i.row_id] || []).push(i));
    const errList = truth.errors.map(e => {
      const found = (byRow[e.row_id] || []);
      return { ...e, detected: found.some(i => e.codes.includes(i.code)), found: found.map(i => i.code) };
    });
    const injRows = new Set(truth.errors.map(e => e.row_id));
    const clean = res.records.filter(r => !injRows.has(r.row_id));
    const flaggedClean = clean.filter(r => (byRow[r.row_id] || []).some(i => i.severity !== 'info'));
    const change = Object.entries(truth.participants).map(([pid, t]) => {
      const a = res.analysis[pid];
      return { pid, group: t.group, trueDecline: t.declineEndPct, status: a ? a.metrics.vo2peak.status : 'insufficient', overall: a ? a.status : 'insufficient', nasa80: a ? a.nasa.below80 : false, worst: a && a.metrics.vo2peak.worst ? a.metrics.vo2peak.worst.delta : null };
    });
    const pos = change.filter(c => c.trueDecline >= 10), neg = change.filter(c => c.trueDecline < 5);
    return {
      errors: { n: errList.length, detected: errList.filter(e => e.detected).length, list: errList },
      clean: { n: clean.length, flagged: flaggedClean.length, list: flaggedClean.map(r => r.row_id) },
      change, sens: pos.length ? pos.filter(c => c.status === 'confirmed').length / pos.length * 100 : null, nPos: pos.length,
      falseAlarm: neg.length ? neg.filter(c => c.status === 'confirmed').length / neg.length * 100 : null, nNeg: neg.length,
    };
  }

  // Монте-Карло: доля участников с «устойчивым изменением» при заданном истинном снижении
  function detectionCurve({ magnitudes = [0, 2, 4, 6, 8, 10, 12, 15, 20, 25], runs = 30, n = 10, seed = 1000, cfg = {} } = {}) {
    const out = [];
    const Ld = cfg.bedRestDays || 60;
    for (const m of magnitudes) {
      let tot = 0, vo2 = 0, any = 0, single = 0, nasa = 0;
      for (let k = 0; k < runs; k++) {
        const syn = generateSynthetic({ seed: seed + k * 7919 + m * 104729, n, scenario: m === 0 ? 'null' : 'fixed', fixedDecline: m, bedRestDays: Ld });
        const res = run([{ name: syn.fileName, text: syn.csv }], cfg);
        for (const pid of res.participants) {
          tot++;
          const a = res.analysis[pid];
          if (a.metrics.vo2peak.status === 'confirmed') vo2++;
          if (a.status === 'confirmed') any++;
          if (a.metrics.vo2peak.status === 'single') single++;
          if (a.nasa.below80) nasa++;
        }
      }
      out.push({ m, realized: m * (1 - Math.exp(-(Ld - 1) / (Ld / 3))), n: tot, vo2: vo2 / tot * 100, any: any / tot * 100, single: single / tot * 100, nasa: nasa / tot * 100 });
    }
    return out;
  }

  const api = {
    DEFAULT_CONFIG, METRICS, ISSUES, PHASE_LABEL, POSTURE_LABEL, STATUS_TEXT, SOURCES, CANON_COLUMNS, ALIASES,
    setLang, getLang, tr, L, statusText,
    parseCSV, toCSV, mapColumns, normHeader, parseNum, parseDate, normPosture,
    run, analyzeMetric, explainMetric, buildReport,
    generateSynthetic, evaluateAgainstTruth, detectionCurve,
    util: { mean, sd, median, linreg, pearson, rmcorr, fmt, iso, makeRng, deepMerge },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AeroCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
