// Прогон ядра AEROCORE на файлах NASA (Campaign 3 Summary и CFT70): какие ошибки записи найдены и у кого.
// Запуск: node tools/archive_issues.js <распакованный MR080G> <выходной json>
const fs = require('fs'), path = require('path');
const A = require('../src/core.js');
const [root, out] = process.argv.slice(2);
const read = d => fs.readdirSync(d).filter(f => !f.startsWith('.')).map(f => ({ name: f, text: fs.readFileSync(path.join(d, f), 'utf8') }));
// Ошибки записи в архиве — то, что важно показать; служебные замечания (дубли форматов, нет типа теста) — отдельно
const ARCHIVE = ['MASS_HEIGHT_SWAP', 'HEIGHT_INCHES', 'HEADER_COPIED', 'FILE_DATE_MISMATCH', 'TEST_TYPE_CONFLICT', 'STAGE_W_REPEAT', 'RER_MISMATCH', 'UNIT_SUSPECT', 'NOT_NUMBER', 'OUT_OF_RANGE', 'CONFLICT', 'WEIGHT_JUMP'];
const res = {};
for (const [key, dir, pidOf] of [
  ['c3', 'MR080G_Campaign_3_Aerobic_Capacity_Summary', i => (/(C3[A-H])_(\d+)/.exec(i.row_id) || [])[0]],
  ['cft70', 'MR080G_CFT70', i => i.participant_id],
]) {
  const files = read(path.join(root, dir));
  const r = A.run(files);
  const items = r.issues.filter(i => ARCHIVE.includes(i.code)).map(i => ({ code: i.code, pid: pidOf(i) || '', file: i.row_id.split(':')[0], row: i.row_id.split(':')[1], field: i.field, value: i.value, message: i.message, action: i.action, severity: i.severity }));
  const all = {}; r.issues.forEach(i => all[i.code] = (all[i.code] || 0) + 1);
  res[key] = { files: files.length, rows: r.summary.rows, usedRows: r.summary.usedRows, items, allCounts: all, title: Object.fromEntries(Object.entries(A.ISSUES).map(([k, v]) => [k, v[1]])) };
}
fs.writeFileSync(out, JSON.stringify(res));
for (const k in res) console.log(k, res[k].files, 'files', res[k].items.length, 'archive issues', JSON.stringify(res[k].allCounts));
