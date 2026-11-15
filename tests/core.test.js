// Тесты ядра AEROCORE: node tests/core.test.js
const A = require('../src/core.js');
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('  ✗', msg); } else console.log('  ✓', msg); };

console.log('Синтетический сценарий mixed');
const syn = A.generateSynthetic({ seed: 42, n: 10 });
const res = A.run([{ name: syn.fileName, text: syn.csv }]);
const ev = A.evaluateAgainstTruth(res, syn.truth);
console.log('  строк', res.summary.rows, 'участников', res.summary.participants, 'замечаний', res.summary.sevCount);
ok(ev.errors.detected === ev.errors.n, `внедрённые ошибки найдены: ${ev.errors.detected}/${ev.errors.n}`);
ev.errors.list.filter(e => !e.detected).forEach(e => console.log('    пропущено:', e));
ok(ev.clean.flagged === 0, `ложные замечания на чистых строках: ${ev.clean.flagged}/${ev.clean.n}`);
ev.clean.list.slice(0, 5).forEach(r => console.log('    ', r, res.issues.filter(i => i.row_id === r).map(i => i.code + ' ' + i.message)));
console.log('  TE:', Object.entries(res.te).map(([k, v]) => `${k} ${v.used.toFixed(1)}% (${v.source}, лит ${v.lit}, данные ${v.data && v.data.toFixed(1)}, n=${v.subjects})`).join(' | '));
console.log('  чувствительность', ev.sens, 'из', ev.nPos, '; ложные тревоги', ev.falseAlarm, 'из', ev.nNeg);
ev.change.forEach(c => console.log('   ', c.pid, c.group, c.trueDecline, c.status, A.util.fmt(c.worst, 1), c.nasa80 ? '<80%' : ''));
const c = res.comparison;
console.log('  сравнение', JSON.stringify({ n: c.nPairs, biasPct: c.biasPct && +c.biasPct.toFixed(1), loaPct: c.loaPct && c.loaPct.map(x => +x.toFixed(1)), r: c.r && +c.r.toFixed(2), rm: c.rmChange && c.rmChange.r && +c.rmChange.r.toFixed(2), nasaAgree: c.nasaAgree, rmHr: c.rmHr.r && +c.rmHr.r.toFixed(2), v: c.verdict.level }));

console.log('Парсер и единицы');
const csv = 'Subject;Day;Test;VO2 (mL/min);HR (bpm);Weight (kg)\nA1;-5;Peak;3100;185;80\nA1;10;Peak;2900,5;180;79,5\nA1;20;Peak;;181;79\n';
const r2 = A.run([{ name: 't.csv', text: csv }]);
ok(Math.abs(r2.records[0].vo2_lmin - 3.1) < 1e-9, 'мл/мин → л/мин по заголовку');
ok(Math.abs(r2.records[1].vo2_lmin - 2.9005) < 1e-9, 'десятичная запятая при разделителе ;');
ok(r2.issues.some(i => i.code === 'MISSING_VALUE' && i.field === 'vo2_lmin'), 'пропуск VO₂ отмечен');
ok(r2.records[0].phase === 'pre' && r2.records[1].phase === 'in', 'фаза по дню исследования');

console.log('Положение тела (CFT70): тесты лёжа не сравниваются с базой сидя');
const pcsv = 'participant_id,test_type,posture,study_day,heart_rate,vo2_lmin,rer,age\n' +
  'B1,Peak,upright,-5,185,3.20,1.15,30\nB1,Peak,upright,-2,186,3.25,1.16,30\nB1,Peak,supine,4,180,2.70,1.14,30\nB1,Peak,supine,25,181,2.65,1.15,30\nB1,Peak,upright,61,184,3.00,1.15,30\n';
const r3 = A.run([{ name: 'p.csv', text: pcsv }]);
const a3 = r3.analysis.B1.metrics.vo2peak;
ok(a3.points.filter(p => p.role === 'nobase').length === 2, 'два теста лёжа без базы — не сравниваются');
ok(r3.issues.some(i => i.code === 'POSTURE_NO_BASE'), 'замечание POSTURE_NO_BASE');

console.log('Стандарт NASA 80%');
const ncsv = 'participant_id,test_type,study_day,heart_rate,vo2_lmin,rer,age\nC1,Peak,-5,185,3.00,1.15,30\nC1,Peak,-2,186,3.02,1.16,30\nC1,Peak,30,185,2.30,1.15,30\nC1,Peak,59,185,2.25,1.15,30\n';
const r4 = A.run([{ name: 'n.csv', text: ncsv }]);
ok(r4.analysis.C1.nasa.below80, 'снижение до ~75% → ниже 80% (V1 4003)');

console.log('Ошибки архива NASA (MR080G): дюймы, скопированная шапка, тип по содержимому, ватты');
const H = 'ID,Campaign,Subject,Test_Phase,BR_Day,Date,Age,Body Weight,Height,Stage,Workload,HR,VO2,RVO2\n';
const row = (pid, ph, d, date, m, h, st, w, hr, v) => `1,C3X,${pid},${ph},${d},${date},40,${m},${h},${st},${w},${hr},${v},${(v / m * 1000).toFixed(1)}\n`;
const gxt = (pid, ph, d, date, m, h, peak, hrs) => [['1', 50], ['2', 100], ['3', 150]].map(([st, w], i) => row(pid, ph, d, date, m, h, st, w, hrs[i], [1.2, 1.7, 2.2][i] * peak / 2.6)).join('') + row(pid, ph, d, date, m, h, 'Peak', 175, hrs[3], peak);
const fz = [
  { name: 'MR080G_Campaign_3_C3X_0001_Peak_090301_gxt_summary.csv', text: H + gxt('0001', 'PRE_TEST', 10, '03/01/2009', 73.8, 72, 2.6, [100, 130, 160, 185]) },
  { name: 'MR080G_Campaign_3_C3X_0001_Peak_090306_gxt_summary.csv', text: H + gxt('0001', 'PRE_TEST', 5, '03/06/2009', 175, 73.5, 2.7, [101, 131, 161, 186]) },
  { name: 'MR080G_Campaign_3_C3X_0001_Peak_090529_gxt_summary.csv', text: H + gxt('0001', 'POST_TEST', 0, '05/29/2009', 73, 183, 1.8, [120, 160, 184, 186]) },
  { name: 'MR080G_Campaign_3_C3X_0001_Peak_090609_gxt_summary.csv', text: H + gxt('0001', 'POST_TEST', 0, '05/29/2009', 73, 183, 2.1, [110, 145, 175, 185]) },
  { name: 'MR080G_Campaign_3_C3X_0002_Submax_090401_gxt_summary.csv', text: H + row('0002', 'PRE_TEST', 9, '04/01/2009', 80, 180, '1', 50, 100, 1.1) + row('0002', 'PRE_TEST', 9, '04/01/2009', 80, 180, '2', 50, 120, 1.4) + row('0002', 'PRE_TEST', 9, '04/01/2009', 80, 180, '3', 100, 150, 1.8) + row('0002', 'PRE_TEST', 9, '04/01/2009', 80, 180, 'Peak', 75, 160, 1.9) },
];
const r5 = A.run(fz);
const has = (code, f) => r5.issues.some(i => i.code === code && (!f || i.row_id.includes(f)));
ok(has('HEIGHT_INCHES', '090301') && !has('MASS_HEIGHT_SWAP', '090301'), 'рост 72 при массе 73,8 → дюймы, а не перестановка');
ok(has('MASS_HEIGHT_SWAP', '090306'), 'масса 175 при росте 73,5 → перестановка');
ok(has('HEADER_COPIED', '090609'), 'шапка R+11 скопирована из R+0 → замечание');
const post = r5.sessions.filter(s => s.participant_id === '0001' && s.test_type === 'peak' && s.phase === 'post').map(s => s.t).sort((a, b) => a - b);
ok(post.length === 2 && post[1] - post[0] === 11, `день пересчитан: R+0 и R+11 (${post.join(', ')})`);
ok(!r5.issues.some(i => i.code === 'DUPLICATE' && i.row_id.includes('090609')), 'тест R+11 не принят за дубликат');
ok(has('TEST_TYPE_CONFLICT', '0002') && r5.sessions.some(s => s.participant_id === '0002' && s.test_type === 'peak'), '«Submax» в имени со строкой Peak → максимальный тест');
ok(has('STAGE_W_REPEAT', '0002'), 'ступени 50, 50, 100 Вт при пике 75 Вт → замечание');

console.log('Кривая обнаружения, 20 повторов');
const curve = A.detectionCurve({ magnitudes: [0, 5, 10, 20], runs: 20 });
curve.forEach(c => console.log(`   D=${c.m}% (реально ${c.realized.toFixed(1)}%): VO₂peak ${c.vo2.toFixed(1)}%, любой ${c.any.toFixed(1)}%, единичные ${c.single.toFixed(1)}%, <80% ${c.nasa.toFixed(1)}%`));
ok(curve[0].vo2 < 5, 'ложные тревоги по VO₂peak < 5% без изменений');
ok(curve[3].vo2 > 80, 'обнаружение > 80% при снижении 20%');

console.log('Regression: import integrity and isolated identities');
const runCSV = (text, name = 'regression.csv') => A.run([{ name, text }]);
const throws = (fn, match) => { try { fn(); return false; } catch (err) { return match.test(err.message); } };
for (const id of ['__proto__', 'constructor', 'toString']) {
  const rr = runCSV(`participant_id,test_type,study_day,vo2_lmin\n${id},Peak,-5,3\n${id},Peak,10,2.3\n`);
  ok(rr.participants.length === 1 && rr.analysis[id].metrics.vo2peak.baseline.value === 3, `reserved participant ID is isolated: ${id}`);
}
const multiStudy = runCSV('participant_id,study_id,test_type,study_day,vo2_lmin\nP,A,Peak,-5,3\nP,A,Peak,10,2\nP,B,Peak,-5,4\nP,B,Peak,10,4\n');
ok(multiStudy.participants.length === 2 && Object.values(multiStudy.analysis).map(x => x.metrics.vo2peak.baseline.value).sort().join(',') === '3,4', 'same ID in two studies keeps separate baselines');
ok(multiStudy.issues.some(i => i.code === 'STUDY_ID_COLLISION'), 'cross-study ID qualification is visible in issues');
const protoCfg = JSON.parse('{"__proto__":{"polluted":true},"metrics":{"constructor":{"prototype":{"polluted":true}}}}');
A.util.deepMerge(A.DEFAULT_CONFIG, protoCfg);
ok(({}).polluted === undefined, 'configuration merge cannot pollute object prototypes');
const sourceConflict = A.run([
  { name: 'a.csv', text: 'participant_id,test_type,study_day,vo2_lmin\nP,Peak,-5,3\n' },
  { name: 'b.csv', text: 'participant_id,test_type,study_day,vo2_lmin,age\nP,Peak,-5,4,30\n' }
]);
ok(sourceConflict.summary.usedRows === 0 && sourceConflict.issues.filter(i => i.code === 'CONFLICT').length === 2, 'contradictory source files cannot silently replace each other');

console.log('Regression: CSV structure, numbers and time');
const quoted = A.parseCSV('participant_id,"note;;;;;",test_type,study_day,vo2_lmin\nP,"line 1\nline 2",Peak,-5,3\n');
ok(quoted.delimiter === ',' && !quoted.errors.length && quoted.rows[0].cells[1] === 'line 1\nline 2', 'quoted punctuation and multiline fields preserve CSV structure');
ok(A.parseCSV('a;b\r1;2\r').rows.length === 1, 'CR line endings are supported');
ok(throws(() => runCSV('participant_id,test_type,study_day,vo2_lmin\n"P,Peak,-5,3\n'), /invalid CSV/), 'unclosed CSV quote is rejected with an import error');
ok(throws(() => runCSV('participant_id,test_type,study_day,vo2_lmin\nP,Peak,-5,3,extra\n'), /Expected 4 columns/), 'shifted or extra columns cannot silently change values');
ok(throws(() => runCSV('participant_id,subject,test_type,study_day,vo2_lmin\nP,Q,Peak,-5,3\n'), /duplicate columns/), 'ambiguous duplicate mapped columns are rejected');
ok(Number.isNaN(A.parseNum('0x80')) && Number.isNaN(A.parseNum('Infinity')) && A.parseNum('2.5e-1') === 0.25, 'numeric parser accepts finite decimal notation only');
ok(A.parseDate('2026-02-28junk') === null && A.parseDate('2026-02-30') === null, 'date parser rejects trailing text and impossible dates');
const crCSV = A.toCSV([{ note: 'a\rb' }], ['note']);
ok(A.parseCSV(crCSV).rows[0].cells[0] === 'a\rb', 'CSV export quotes carriage returns correctly');
const mixedTime = runCSV('participant_id,test_type,measurement_date,study_day,study_phase,vo2_lmin\nP,Peak,2026-01-01,-5,pre,3\nP,Peak,2026-01-16,,in,2.5\n');
ok(mixedTime.sessions.some(s => s.t === 10) && !mixedTime.sessions.some(s => s.t === 0), 'date-only followup aligns to the study-day axis');
const badTime = runCSV('participant_id,test_type,measurement_date,study_day,study_phase,vo2_lmin\nP,Peak,2026-01-01,-5,pre,3\nP,Peak,2026-01-02,-1,pre,3\nP,Peak,2026-01-16,,in,2.5\n');
ok(badTime.records[2].excluded && badTime.issues.some(i => i.code === 'TIME_CONFLICT'), 'ambiguous time-axis alignment excludes the affected date-only row');
const unknownPhase = runCSV('participant_id,test_type,measurement_date,study_phase,vo2_lmin\nP,Peak,2026-01-01,pre,3\nP,Peak,2026-01-16,,2\n');
ok(unknownPhase.analysis.P.metrics.vo2peak.status === 'insufficient', 'unknown phase cannot become a valid followup');

console.log('Regression: valid physiological conclusions');
ok(A.util.linreg([1, 1], [100, 150]) === null && A.util.linreg([1, Infinity], [100, 150]) === null, 'regression rejects zero VO₂ span and nonfinite input');
ok(A.util.linreg([1, 2], [100, 100]).r2 === null && A.util.pearson([1, 2, 3], [1, 2]) === null, 'constant response and mismatched correlation vectors return no statistic');
const cautionBase = runCSV('participant_id,test_type,study_day,vo2_lmin,heart_rate,rer,age\nP,Peak,-5,3,100,0.8,30\nP,Peak,10,2.2,185,1.15,30\n');
ok(cautionBase.analysis.P.metrics.vo2peak.status === 'insufficient' && !cautionBase.analysis.P.nasa.below80, 'questionable-only baseline cannot support a standard breach conclusion');
const invalidOfficialPeak = runCSV('participant_id,test_type,study_day,stage,vo2_lmin\nP,Peak,-5,1,1.5\nP,Peak,-5,Peak,0\n');
ok(invalidOfficialPeak.sessions[0].metrics.vo2peak == null, 'invalid official Peak row cannot be replaced by a submaximal stage');
const flatACI = runCSV('participant_id,test_type,study_day,stage,workload_w,heart_rate,vo2_lmin\nP,Peak,-5,Peak,200,185,3\nP,Submax,-4,1,50,100,1\nP,Submax,-4,2,100,105,2\n');
ok(flatACI.sessions.find(s => s.test_type === 'submax').metrics.aci == null && flatACI.issues.some(i => i.code === 'ACI_INVALID_FIT'), 'ACI with less than 10 bpm of heart-rate span is rejected');
const aciOnly = runCSV('participant_id,test_type,study_day,stage,workload_w,heart_rate,vo2_lmin\nP,Peak,-5,Peak,200,185,3\nP,Submax,-4,1,50,100,1\nP,Submax,-4,2,100,140,2\nP,Submax,10,1,50,120,1\nP,Submax,10,2,100,180,2\n');
ok(aciOnly.analysis.P.nasa.screenBelow80 && !aciOnly.analysis.P.nasa.below80, 'ACI-only screen cannot declare a measured NASA-standard breach');
const estimatedACI = runCSV('participant_id,test_type,study_day,stage,workload_w,heart_rate,body_weight_kg,age\nP,Submax,-4,1,50,100,75,30\nP,Submax,-4,2,100,140,75,30\nP,Submax,10,1,50,120,75,30\nP,Submax,10,2,100,170,75,30\n');
ok(estimatedACI.sessions.every(s => s.quality === 'caution') && estimatedACI.analysis.P.metrics.aci.status === 'insufficient', 'age HR and ACSM-estimated VO₂ stay exploratory rather than produce screening conclusions');

console.log(fail ? `\nПровалено: ${fail}` : '\nВсе проверки пройдены');
process.exit(fail ? 1 : 0);
