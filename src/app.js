// AEROCORE — интерфейс на один экран. Данные NASA посчитаны заранее (research/), свои файлы считает ядро (core.js) прямо в браузере.
(() => {
  const D = window.AEROCORE_DATA, A = window.AeroCore, S = D.summary;
  const st = { view: 'me', ds: 'c3', onlyAction: false, group: 'All', user: null, pid: 'C3D_7961', tk: 'end', edit: Object.create(null), shown: Object.create(null) };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (v, d = 0, sign = false) => !Number.isFinite(v) ? '—' : (sign && v > 0 ? '+' : '') + v.toFixed(d).replace('-', '−');
  const ci = (o, d = 0, sign = false, u = '') => `${f(o.est, d, sign)}${u} <span class="note">[${f(o.lo, d, sign)}; ${f(o.hi, d, sign)}]</span>`;
  const pf = v => v == null ? '—' : (Math.abs(v - 80) <= 0.5 || Math.abs(v - 85) <= 0.5) ? f(Math.floor(v * 10) / 10, 1) : f(v);
  const cls = p => p == null ? 'na' : p < 80 ? 'bad' : p < 85 ? 'warn' : 'ok';
  const ds = () => st.ds === 'user' ? st.user : D.datasets[st.ds];
  const flagged = pid => st.ds !== 'user' && D.archive.some(k => k.people.includes(pid));
  const needsAction = r => Object.values(r.cells).some(c => (c.meas != null && c.meas < 80) || (c.aci != null && c.aci < 85));

  // ---------- шапка ----------
  function header() {
    const opts = Object.entries(D.datasets).map(([k, v]) => `<option value="${k}" ${st.ds === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('') +
      (st.user ? `<option value="user" ${st.ds === 'user' ? 'selected' : ''}>${esc(st.user.label)}</option>` : '');
    $('#ds').innerHTML = `<select id="ds-sel" aria-label="Dataset">${opts}</select><div class="src">Data source: ${esc(ds().source)}</div>`;
    $('#ds-sel').onchange = e => { st.ds = e.target.value; st.group = 'All'; render(); };
  }

  // ---------- левая колонка ----------
  function side() {
    const d = ds(), groups = [...new Set(d.rows.map(r => r.group).filter(Boolean))];
    $('#side').innerHTML = `
      ${groups.length ? `<div class="block"><h3>Group</h3><div class="seg">${['All', ...groups].map(g => `<button data-g="${esc(g)}" aria-pressed="${st.group === g}" class="${st.group === g ? 'on' : ''}">${esc(g)}</button>`).join('')}</div></div>` : ''}
      <div class="block"><label class="chk"><input type="checkbox" id="only" ${st.onlyAction ? 'checked' : ''}> Show only flagged participants</label></div>
      <div class="block legend"><h3>Colour = measured peak VO₂</h3>
        <div><span class="sw ok"></span>≥ 85% of own baseline</div>
        <div><span class="sw warn"></span>80–85%: watch</div>
        <div><span class="sw bad"></span>&lt; 80%: below NASA standard</div>
        ${d.hasAci ? `<div style="margin-top:12px"><span class="bolt">⚡</span>ACI screen &lt; 85% → proposed review</div>` : ''}
        <div><span class="warnmark" style="margin:0 4px">⚠</span>data issue found in source files</div>
        <div><span style="margin:0 8px;font-weight:700">•</span>note on this test — click the row</div>
      </div>
      <div class="block note">NASA-STD-3001 [V1 4003]: in-mission VO₂max ≥ 80% of the pre-mission value. ACI = NASA’s submaximal estimate of VO₂max (Moore 2015).</div>`;
    document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { st.group = b.dataset.g; render(); });
    $('#only').onchange = e => { st.onlyAction = e.target.checked; render(); };
  }

  // ---------- таблица экипажа ----------
  function cellHtml(c, hasAci) {
    if (!c) return `<span class="cell na"><span class="m">—</span><div class="x">no test</div></span>`;
    const aci = !hasAci ? '' : c.aci != null ? `ACI ${pf(c.aci)}%${c.aci < 85 ? ' <span class="bolt">⚡</span>' : ''}` : 'ACI —';
    return `<span class="cell ${cls(c.meas)}" title="${esc([c.day, ...(c.notes || [])].join(' · '))}">${c.notes && c.notes.length ? '<span class="flag">•</span>' : ''}<span class="m">${c.meas != null ? pf(c.meas) + '%' : '—'}</span><div class="x">${esc(c.day || '')}${aci ? ' · ' + aci : ''}</div></span>`;
  }
  function table() {
    const d = ds();
    let rows = d.rows.filter(r => st.group === 'All' || r.group === st.group);
    if (st.onlyAction) rows = rows.filter(needsAction);
    $('#crew').innerHTML = `<h2>Crew vs own baseline</h2>
      <p class="sub">Peak VO₂ measured at each time point, as % of the person’s own pre-bed-rest value${d.hasAci ? ', with the submaximal estimate (ACI) below it' : ''}. Click a row to open that person’s own view.</p>
      <div class="table-wrap"><table><thead><tr><th>Participant</th><th>Baseline<small>VO₂, L/min · type shown</small></th>${d.cols.map(c => `<th>${esc(c.label)}<small>${esc(c.sub)}</small></th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr class="row" tabindex="0" aria-label="Open ${esc(r.pid)} details" data-pid="${esc(r.pid)}"><td>${esc(r.pid)}${r.group ? `<span class="tag">${esc(r.group)}</span>` : ''}${flagged(r.pid) || r.baseNote ? '<span class="warnmark" title="Data issue in source files">⚠</span>' : ''}</td>
        <td class="base">${f(r.base, 2)}<small>${esc(r.baseKind || 'Measured peak')}</small></td>${d.cols.map(c => `<td>${cellHtml(r.cells[c.key], d.hasAci)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${d.cols.length + 2}" class="note">No participants match the filter.</td></tr>`}</tbody></table></div>
      <p class="note" style="margin:12px 0 0">${esc(d.hidden || '')}</p>`;
    // Campaign 3: клик по строке открывает экран этого астронавта; для других наборов — карточка
    const open = pid => { if (st.ds === 'c3') { st.view = 'me'; st.mode = 'nasa'; st.pid = pid; st.tk = 'end'; render(); window.scrollTo(0, 0); } else person(pid); };
    document.querySelectorAll('tr.row').forEach(tr => activate(tr, () => open(tr.dataset.pid))); 
  }

  // ---------- правая колонка ----------
  function panel() {
    const d = ds(), key = d.cols[0].key;
    const rows = d.rows.filter(r => st.group === 'All' || r.group === st.group);
    const withCell = rows.filter(r => r.cells[key] && r.cells[key].meas != null);
    const below = withCell.filter(r => r.cells[key].meas < 80);
    const review = rows.filter(r => r.cells[key] && ((r.cells[key].meas != null && r.cells[key].meas < 80) || (r.cells[key].aci != null && r.cells[key].aci < 85)))
      .sort((a, b) => (a.cells[key].meas ?? a.cells[key].aci) - (b.cells[key].meas ?? b.cells[key].aci));
    const desc = c => c.meas != null && c.meas < 80 ? 'Measured peak below 80% of baseline; review the test quality and study protocol.' : 'ACI below the team’s 85% screen; confirmatory review proposed. Measured breach is not established.';
    const nIssues = st.ds === 'user' ? d.issueKinds.length : D.archive.length;
    $('#panel').innerHTML = `<h2><span style="color:var(--warn)">●</span> Checks for review</h2>
      <p class="stat">${esc(d.cols[0].label)}: <b>${review.length}</b> flagged · <b>${below.length} of ${withCell.length}</b> measured results below 80%</p>
      ${review.slice(0, 5).map((r, i) => { const c = r.cells[key]; return `<div class="item" tabindex="0" role="button" aria-label="Review ${esc(r.pid)}" data-pid="${esc(r.pid)}"><div class="t"><span>${i + 1}. ${esc(r.pid)}${r.group ? ` <span class="tag">${esc(r.group)}</span>` : ''}</span><span class="v">${pf(c.meas ?? c.aci)}%</span></div><div class="d">${c.meas == null ? '<b>ACI estimate · </b>' : ''}${esc(desc(c))}</div></div>`; }).join('') || '<p class="note">No results cross the review thresholds at this time point. Missing results remain unavailable.</p>'}
      ${review.length > 5 ? `<p class="note">+ ${review.length - 5} more — use the review filter.</p>` : ''}
      <div class="card trust" style="padding:16px"><div class="big">${nIssues}</div><div>types of data-quality issues ${st.ds === 'user' ? 'in your files' : 'in the included archive audit'}</div>
        <button class="btn ghost" id="issues-btn" style="margin-top:12px;width:100%">View data issues</button></div>`;
    document.querySelectorAll('.item').forEach(el => activate(el, () => { if (st.ds === 'c3') { st.view = 'me'; st.mode = 'nasa'; st.pid = el.dataset.pid; st.tk = 'end'; render(); window.scrollTo(0, 0); } else person(el.dataset.pid); }));
    $('#issues-btn').onclick = issues;
  }

  // ---------- окна ----------
  let modalTrigger = null;
  const activate = (el, action) => { el.onclick = action; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); } }; };
  const modal = html => {
    if (!$('#modal').classList.contains('on')) modalTrigger = document.activeElement;
    $('#modal .content').innerHTML = html;
    $('#modal').classList.add('on');
    $('#modal').setAttribute('aria-hidden', 'false');
    const box = $('#modal .box');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const heading = $('#modal .content h2'); if (heading) { heading.id = 'dialog-title'; box.setAttribute('aria-labelledby', heading.id); }
    document.body.style.overflow = 'hidden'; $('#modal .close').focus();
  };
  const closeModal = () => { $('#modal').classList.remove('on'); $('#modal').setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; if (modalTrigger?.isConnected) modalTrigger.focus(); };
  const download = (name, text, type = 'text/plain') => {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  function chart(r) {
    const pts = [...(r.pre || []).map((p, i) => ({ x: `Pre ${i + 1}`, m: p.pct, a: p.aciPct })), ...ds().cols.filter(c => r.cells[c.key]).map(c => ({ x: c.label, m: r.cells[c.key].meas, a: r.cells[c.key].aci }))];
    if (!pts.length) return '';
    const W = 680, H = 270, L = 50, Rr = 70, T = 14, B = 34;
    const vals = pts.flatMap(p => [p.m, p.a]).filter(v => v != null).concat([80, 100]);
    const lo = Math.floor((Math.min(...vals) - 5) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
    const x = i => L + (pts.length === 1 ? (W - L - Rr) / 2 : i * (W - L - Rr) / (pts.length - 1)), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    const line = (k, col, dash) => { const p = pts.map((q, i) => q[k] == null ? null : [x(i), y(q[k])]).filter(Boolean);
      return `<polyline points="${p.map(q => q.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" ${dash ? 'stroke-dasharray="6 5"' : ''}/>` + p.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="4.5" fill="${col}"/>`).join(''); };
    const hl = (v, col, lab) => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="${col}" stroke-dasharray="3 4"/><text x="${W - Rr}" y="${y(v) - 4}" text-anchor="end" font-size="11" fill="${col}">${lab}</text>`;
    let g = ''; for (let v = lo; v <= hi; v += 10) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="#eef1f5"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#8a93a3">${v}%</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Measured peak VO2 and ACI as % of baseline">${g}${hl(100, '#8a93a3', 'baseline')}${hl(85, '#b45309', '85% screen')}${hl(80, '#b91c1c', '80% NASA standard')}
      ${line('m', '#0f172a')}${ds().hasAci ? line('a', '#7c3aed', true) : ''}${pts.map((p, i) => `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#5b6577">${esc(p.x)}</text>`).join('')}</svg>
      <div class="note"><b style="color:#0f172a">—</b> measured peak VO₂ ${ds().hasAci ? '&nbsp; <b style="color:#7c3aed">- -</b> ACI (submaximal estimate)' : ''}</div>`;
  }
  function person(pid) {
    const d = ds(), r = d.rows.find(x => x.pid === pid); if (!r) return;
    const notes = [r.baseNote, ...d.cols.flatMap(c => (r.cells[c.key]?.notes || []).map(n => `${c.label}: ${n}`))].filter(Boolean);
    const kinds = st.ds === 'user' ? [] : D.archive.filter(k => k.people.includes(pid));
    modal(`<h2>${esc(pid)}${r.group ? ` <span class="tag">${esc(r.group)}</span>` : ''}</h2>
      <p class="sub">${r.baseKind === 'ACI estimate' ? 'Baseline ACI estimate' : 'Baseline measured peak VO₂'} ${f(r.base, 2)} L/min${r.pre && r.pre.length ? ` (mean of ${r.pre.length} pre-bed-rest test${r.pre.length > 1 ? 's' : ''})` : ''}${r.hrPre ? ` · baseline peak HR ${r.hrPre} bpm` : ''}</p>
      ${chart(r)}
      ${notes.length ? `<h3 style="margin:18px 0 0;font-size:15px">Why the system flags this</h3><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${kinds.length ? `<h3 style="margin:18px 0 0;font-size:15px">Data issues in this person’s source files</h3><ul class="notes">${kinds.map(k => { const own = k.files.filter(x => x.includes(pid.replace(/^C3[A-H]_/, '')) || x.includes(pid)); return `<li><b>${esc(k.title)}</b>${own.length ? ` — <span class="files">${own.map(esc).join(', ')}</span>` : ''}<div class="note">${esc(k.evidence)}</div></li>`; }).join('')}</ul>` : ''}`);
  }

  function evidence() {
    const P = S.protocol, row = (n, k, hl) => `<tr${hl ? ' style="background:#e8f1fb;font-weight:600"' : ''}><td>${n}</td><td>${f(P[k].sens, 1)}%</td><td>${f(P[k].fa, 1)}%</td><td>${f(P[k].peak, 1)}</td></tr>`;
    modal(`<h2>What the NASA data show</h2><p class="sub">MR080G Campaign 3 and CFT70 bed rest; 95% confidence intervals in brackets (bootstrap over participants).</p>
      <div class="grid4">
        <div class="kpi"><div class="v">${ci(S.declineR0, 0, true, '%')}</div><div class="l">peak VO₂ at end of bed rest (median)</div></div>
        <div class="kpi"><div class="v">${ci(S.hrpk, 1, true)}</div><div class="l">peak HR change, bpm in this ground cohort</div></div>
        <div class="kpi"><div class="v">r = ${ci(S.r, 2)}</div><div class="l">ACI tracks the change in measured VO₂</div></div>
        <div class="kpi"><div class="v">${f(S.scrPeak, 1)} vs ${f(P.REF.peak, 1)}</div><div class="l">maximal tests per simulated crew member / 180 days</div></div>
      </div>
      <h3 style="font-size:16px;margin:6px 0 8px">Which monitoring protocol (20,000 simulated crew, 180 days)</h3>
      <table><thead><tr><th>Protocol</th><th>Catches &lt; 80%</th><th>False alarm, fit crew</th><th>Peak tests / person</th></tr></thead><tbody>
        ${row('Peak test every 30 days (schedule of NASA’s ISS VO₂max study)', 'REF')}${row('ACI only, every 14 days, single test', 'ACI1')}${row('ACI only, every 14 days, two in a row', 'ACI2')}${row('AEROCORE: ACI every 14 days → Peak test if ACI &lt; 85%', 'SCR', true)}
      </tbody></table>
      <ul class="notes" style="margin-top:14px">
        <li>Under the model assumptions, the screen meets the comparison rule (within 0.5 percentage point) in ${S.nOk} of ${S.nScen} scenarios, with ${S.fewerLo}–${S.fewerHi}% fewer maximal tests.</li>
        <li>ACI alone is not enough: single-test noise ${ci(S.noise, 1, false, '%')} flags ${f(S.aci1Fa)}% of fit crew.</li>
        <li>Honest baseline: within one bed-rest cohort, ACI is no more accurate than “everyone loses the cohort average” (${f(S.maeAci.est, 1)} vs ${f(S.maeMean.est, 1)} pp). But that average does not transfer: applied to the pooled CFT70 exercise + flywheel groups it errs by ${f(S.transferEx.est, 0)} pp. This supports investigating screening; it does not establish individual accuracy.</li>
        <li>The estimated typical error of repeated maximal tests is ${f(S.peakTE.est, 1)}%. Interpretation and any repeat testing require a study or clinical protocol.</li>
      </ul>
      <p class="note">Model assumptions: both protocols stop at the first positive; only positives during a true breach count. Costs exclude baseline tests, screening sessions and downstream care. Simulation normalizes ACI to pre-study ACI, while the replay uses measured peak VO₂; this is a separate protocol hypothesis. Slow-decline sensitivity falls to about 36%, and to about 24% in the combined worst scenario. This is not clinical or flight validation. Full method, code and report: <span class="files">research/</span> in the project repository.</p>`);
  }

  function useCases() {
    const c = (t, p, dd) => `<div class="uc"><h3>${t}</h3><p>${p}</p><p class="note" style="margin-top:8px">${dd}</p></div>`;
    modal(`<h2>Mission concept &amp; validation path</h2><p class="sub">A research workflow for review by flight medicine teams. Proposed use cases require operational and flight validation.</p>
      <div class="cards">
        ${c('ISS: fewer maximal tests', `NASA already runs a submaximal test (PFE) about monthly on the ISS; the historical 2009 VO₂max experiment budgeted about 3 hours per session, including setup and stowage. The proposed model reviews submaximal results every 14 days and requests confirmation below 85%: ${f(S.scrPeak, 1)} maximal tests per simulated 180-day mission versus ${f(S.protocol.REF.peak, 1)} with the comparison rule. Detection depends on the model assumptions.`, 'Based on: MR080G Campaign 3; NASA-STD-3001 [V1 4003]; NASA VO₂max study (NTRS 20090010236)')}
        ${c('Artemis and Gateway', 'Explore offline fitness tracking and data-quality review for constrained missions. Integration with mission hardware, sensor validation and flight-surgeon protocols remains future work; this prototype does not assess EVA clearance.', 'Concept; thresholds tied to [V1 4001–4003]')}
        ${c('Bed-rest and analog studies', `Check every file before analysis: ${D.archive.length} kinds of recording errors were found in the public MR080G archive, including a file whose header was copied from another visit.`, 'Supplied historical audit; raw files needed for independent checksum verification')}
        ${c('Countermeasure trials', 'Judge each person against their own baseline and the 80% line, not only group means: in CFT70, 5 of 8 controls fell below 80% and 0 of 18 who exercised.', 'Based on: MR080G CFT70')}
      </div>`);
  }

  function issues() {
    if (st.ds === 'user') {
      const k = st.user.issueKinds;
      modal(`<h2>Data issues in your files</h2><p class="sub">${st.user.files} files · ${st.user.rowCount} rows · nothing is deleted silently: each row keeps its raw values.</p>
        <table><thead><tr><th>Issue</th><th>Rows</th><th>What AEROCORE did</th></tr></thead><tbody>${k.map(x => `<tr><td><b>${esc(x.title)}</b><details><summary>examples</summary><div class="files">${x.examples.map(esc).join('<br>')}</div></details></td><td>${x.n}</td><td>${esc(x.action)}</td></tr>`).join('') || '<tr><td colspan="3">No issues found.</td></tr>'}</tbody></table>`);
      return;
    }
    modal(`<h2>Recording errors in the public NASA archive</h2>
      <p class="sub">The included archive audit reports checksum agreement for 1,505 MR080G files and lists the issues below. Raw archive files are not bundled; reproducing this audit requires obtaining them separately.</p>
      <table><thead><tr><th>Error</th><th>Evidence</th><th>If unchecked</th><th>Found by</th></tr></thead><tbody>
      ${D.archive.map(k => `<tr><td><b>${esc(k.title)}</b><details><summary>${k.people.length ? k.people.length + ' participant' + (k.people.length > 1 ? 's' : '') + ', ' : ''}${k.files.length} item${k.files.length > 1 ? 's' : ''}</summary><div class="files">${k.files.map(esc).join('<br>')}</div></details></td><td>${esc(k.evidence)}</td><td>${esc(k.effect)}</td><td class="note">${esc(k.found)}</td></tr>`).join('')}
      </tbody></table>`);
  }

  // ---------- свои файлы ----------
  function upload() {
    modal(`<h2>Load your data</h2><p class="sub">CSV files with per-test or per-stage records. Processing stays in this browser; uploaded datasets are kept only for this session.</p>
      <div class="drop" id="drop">Drop CSV files here or <label style="color:var(--accent);cursor:pointer"><u>choose files</u><input type="file" id="file" multiple accept=".csv,.txt,text/csv"></label></div>
      <p class="upload-status" id="upload-status" role="status" aria-live="polite"></p>
      <button class="btn ghost" id="template">Download a CSV example</button>
      <p class="note">Required: participant_id, test_type (Peak or Submax), study_day (negative before onset), and vo2_lmin. Per-stage data also needs stage, workload_w and heart_rate. A peak baseline and follow-up are needed to compare measured capacity. ACI requires pre-study peak heart rate and measured stage VO₂. Use comparable posture and equipment.</p>`);
    $('#template').onclick = () => download('aerocore-example.csv', 'participant_id,test_type,study_day,heart_rate,vo2_lmin,rer,age,posture\nDEMO,Peak,-7,185,3.0,1.15,30,upright\nDEMO,Peak,-3,186,3.02,1.16,30,upright\nDEMO,Peak,30,184,2.35,1.15,30,upright\n', 'text/csv');
    const go = async list => {
      const status = $('#upload-status');
      try {
        const selected = [...list]; if (!selected.length) return;
        if (selected.length > 100 || selected.reduce((n, file) => n + file.size, 0) > 20 * 1024 * 1024) throw new Error('Choose up to 100 files with a combined size below 20 MB.');
        if (selected.some(file => !/\.(csv|txt)$/i.test(file.name))) throw new Error('Choose CSV or TXT files.');
        status.textContent = 'Reading and checking files…';
        load(await Promise.all(selected.map(async fl => ({ name: fl.name, text: await fl.text() }))));
      } catch (error) { status.textContent = `Unable to load data: ${error.message || 'check the file format.'}`; status.classList.add('form-error'); }
    };
    $('#file').onchange = e => go(e.target.files);
    const dz = $('#drop');
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); go(e.dataTransfer.files); };
  }
  function load(files) {
    if (!files.length) return;
    const res = A.run(files);
    const rows = [];
    for (const pid of res.participants) {
      const m = res.analysis[pid].metrics, v = m.vo2peak, a = m.aci;
      if (!v.baseline && !a.baseline) continue;
      const main = v.baseline ? v : a;
      const fu = main.points.filter(p => p.role === 'followup' || p.role === 'caution');
      const aciAt = t => { const q = (a.points || []).filter(p => p.pctOfPre != null && p.phase !== 'pre').sort((x, y) => Math.abs(x.t - t) - Math.abs(y.t - t))[0]; return q && Math.abs(q.t - t) <= res.cfg.pairWindowDays ? q.pctOfPre : null; };
      const cell = p => p && { day: `day ${p.t}`, meas: main === v ? p.pctOfPre : null, aci: main === v ? aciAt(p.t) : p.pctOfPre, notes: (p.session?.notes || []) };
      const low = fu.length ? fu.reduce((x, y) => (y.pctOfPre < x.pctOfPre ? y : x)) : null, last = fu[fu.length - 1];
      if (fu.length) rows.push({ pid, base: main.baseline.value, baseKind: main === v ? 'Measured peak' : 'ACI estimate', cells: { low: cell(low), last: cell(last) } });
    }
    if (!res.records.length) throw new Error('No data rows were recognised. Use the CSV example to check your columns and delimiter.');
    const by = Object.create(null);
    res.issues.forEach(i => { const k = by[i.code] = by[i.code] || { title: A.ISSUES[i.code]?.[1] || i.code, action: i.action, n: 0, examples: [] }; k.n++; if (k.examples.length < 6) k.examples.push(`${i.row_id} ${i.field}=${i.value} — ${i.message}`); });
    st.user = { label: `Your data — ${files.length} file${files.length > 1 ? 's' : ''}`, short: 'Your data', source: `${files.length} uploaded file${files.length > 1 ? 's' : ''}, processed in the browser`, hasAci: true,
      cols: [{ key: 'low', label: 'Lowest after onset', sub: '% of own baseline' }, { key: 'last', label: 'Latest', sub: '% of own baseline' }],
      rows, files: files.length, rowCount: res.summary.rows, issueKinds: Object.values(by).sort((x, y) => y.n - x.n),
      hidden: rows.length ? `${res.summary.usedRows} of ${res.summary.rows} rows used; the rest are listed under “View data issues”.` : 'No participant has both a baseline and a follow-up measurement.' };
    st.ds = 'user'; st.group = 'All'; st.onlyAction = false; st.view = 'crew'; closeModal(); render();
  }

  function answer() {
    $('#answer').innerHTML = `<div class="context-bar"><span class="eyebrow">HUMAN PERFORMANCE / RESEARCH WORKSPACE</span><span class="session-note">OFFLINE CAPABLE · ${st.view === 'me' && st.mode === 'own' ? 'LOCAL INPUT' : 'GROUND-ANALOG DATA'}</span></div>
      <div class="hero-copy"><div><h1 class="hero-title">${st.view === 'me' ? 'Understand the signal.<br>Make the next check count.' : 'Every participant.<br>A personal baseline.'}</h1><p class="hero-description">${st.view === 'me' ? 'Trace a submaximal exercise estimate from source readings to a clear research screening result.' : 'Review aerobic capacity, screening signals and data quality across the study cohort.'}</p></div>
      <div class="metric-strip"><div class="metric"><strong>80<span>%</span></strong><span>NASA VO₂max reference</span></div><div class="metric"><strong>85<span>%</span></strong><span>Team’s research screen</span></div><div class="metric"><strong>14<span>d</span></strong><span>Proposed review interval</span></div></div></div>
      <p class="session-note">Research prototype · bed rest is a ground analog, not flight validation · results support review and do not establish medical or EVA clearance.</p>`;
  }
  function tabs() {
    $('#tabs').innerHTML = [['me', 'My fitness (astronaut)'], ['crew', 'Crew & flight surgeon']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${st.view === k}" class="${st.view === k ? 'on' : ''}">${l}</button>`).join('');
    document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.view = b.dataset.v; render(); window.scrollTo(0, 0); });
    $('#me-main').style.display = st.view === 'me' ? 'grid' : 'none';
    $('#crew-main').style.display = st.view === 'me' ? 'none' : 'block';
  }


  // ---------- экран астронавта: короткий тест → проверка данных → где я → что делать → подтверждение ----------
  const C3 = D.datasets.c3;
  function aciCalc(stages, hrRef) {
    const validRef = Number.isFinite(hrRef) && hrRef >= 60 && hrRef <= 230;
    const phys = stages.map(s => ({ ...s, okv: Number.isFinite(s.hr) && s.hr >= 30 && s.hr <= 230 && Number.isFinite(s.vo2) && s.vo2 >= 0.1 && s.vo2 <= 7 && Number.isFinite(s.w) && s.w >= 0 && s.w <= 600 }));
    const good = phys.filter(s => s.okv).sort((a, b) => a.w - b.w);
    let mono = true; for (let i = 1; i < good.length; i++) if (good[i].hr < good[i - 1].hr - 2 || good[i].vo2 <= good[i - 1].vo2 || good[i].w <= good[i - 1].w) mono = false;
    const used = validRef ? good.filter(s => s.hr < hrRef - 3) : [];
    const span = used.length ? Math.max(...used.map(s => s.hr)) - Math.min(...used.map(s => s.hr)) : 0;
    const checks = [
      { ok: validRef, t: validRef ? 'Pre-flight peak heart rate is in range' : 'Enter measured pre-flight peak heart rate (60–230 bpm)' },
      { ok: phys.every(s => s.okv) && phys.length > 0, t: phys.every(s => s.okv) && phys.length > 0 ? 'Stage readings are within physiological ranges' : `Missing or out-of-range value at stage ${phys.filter(s => !s.okv).map(s => s.st).join(', ')} — that stage is excluded` },
      { ok: mono, t: mono ? 'Heart rate and oxygen uptake rise with workload' : 'Workloads must be distinct, with increasing VO₂ and no fall in heart rate greater than 2 bpm' },
      { ok: used.length >= 2, t: used.length >= 2 ? `${used.length} usable stages below pre-flight peak heart rate${used.length === 2 ? ' — two-stage estimate is fragile' : ''}` : `Only ${used.length} usable stage${used.length === 1 ? '' : 's'} — at least 2 are needed` },
      { ok: span >= 10, t: span >= 10 ? `Stages span ${Math.round(span)} bpm` : 'Stages must span at least 10 bpm' },
    ];
    let est = null, fit = null;
    if (used.length >= 2 && span >= 10 && mono) {
      const n = used.length, mx = used.reduce((a, s) => a + s.vo2, 0) / n, my = used.reduce((a, s) => a + s.hr, 0) / n;
      const denom = used.reduce((a, s) => a + (s.vo2 - mx) ** 2, 0);
      const slope = denom > 1e-8 ? used.reduce((a, s) => a + (s.vo2 - mx) * (s.hr - my), 0) / denom : NaN;
      const intercept = my - slope * mx, estimate = (hrRef - intercept) / slope;
      const validFit = Number.isFinite(slope) && slope > 0 && Number.isFinite(estimate) && estimate >= 0.5 && estimate <= 7;
      checks.push({ ok: validFit, t: validFit ? 'Regression gives a finite estimate within 0.5–7 L/min' : 'Regression is unstable or extrapolates outside 0.5–7 L/min; no estimate reported' });
      if (validFit) { est = estimate; fit = { a: intercept, b: slope }; }
    }
    return { est, fit, used, checks };
  }
  const meRow = () => C3.rows.find(r => r.pid === st.pid);
  const stagesOf = (r, t) => (r.pid === '__own__' && t.key === 'today') ? st.own.stages : (st.edit[r.pid + t.key] || t.stages);
  function verdict(t, pct) {
    if (t.kind === 'pre') return { c: 'base', head: 'Baseline reference', todo: 'Pre-study maximal tests establish the personal reference.', why: 'A submaximal estimate can differ from a measured peak. Compare like-for-like methods and retain the measured baseline.' };
    if (!Number.isFinite(pct)) return { c: 'na', head: 'Estimate unavailable', todo: 'Review the highlighted data checks before interpreting this record.', why: 'Missing, inconsistent or unstable readings do not produce a screening result.' };
    if (pct >= 85) return { c: 'ok', head: 'Above research screening line', todo: 'No signal under the proposed 85% rule. Continue review under the approved study or mission protocol.', why: `A single ACI result has noise (estimated typical error ${f(S.noise.est, 1)}% in this cohort). A passing screen does not rule out a decline.` };
    if (pct >= 80) return { c: 'warn', head: 'Screening signal · review needed', todo: 'The proposed rule requests review and a confirmatory maximal test.', why: 'The 85% screening threshold is a team research proposal, not a NASA operational protocol.' };
    return { c: 'bad', head: 'Estimate below 80% reference', todo: 'The proposed rule requests review and a confirmatory maximal test.', why: 'An ACI estimate alone cannot establish whether measured VO₂max meets NASA’s in-mission 80% standard.' };
  }
  function hrChart(r, t, res) {
    const base = r.base, hrRef = r.hrPre;
    if (!validBase(base) || !validHR(hrRef)) return '<p class="form-error">Enter a valid pre-flight baseline and peak heart rate to show the estimate.</p>';
    const sts = stagesOf(r, t).filter(s => Number.isFinite(s.vo2) && s.vo2 >= 0.1 && s.vo2 <= 7 && Number.isFinite(s.hr) && s.hr >= 30 && s.hr <= 230);
    const W = 560, H = 300, L = 48, Rr = 20, T = 16, B = 40;
    const xmax = Math.max(base * 1.08, ...(sts.map(s => s.vo2)), res.est || 0) + 0.1, xmin = Math.max(0, Math.min(...sts.map(s => s.vo2), 0.6) - 0.2);
    const ymin = Math.min(...sts.map(s => s.hr), 100) - 10, ymax = Math.max(hrRef, ...sts.map(s => s.hr)) + 15;
    const x = v => L + (v - xmin) / (xmax - xmin) * (W - L - Rr), y = v => T + (ymax - v) / (ymax - ymin) * (H - T - B);
    let g = '';
    for (let v = Math.ceil(xmin * 2) / 2; v <= xmax; v += 0.5) g += `<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}" stroke="#eef1f5"/><text x="${x(v)}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="#8a93a3">${v.toFixed(1)}</text>`;
    for (let v = Math.ceil(ymin / 20) * 20; v <= ymax; v += 20) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="#eef1f5"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#8a93a3">${v}</text>`;
    const vline = (v, col, lab) => `<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}" stroke="${col}" stroke-dasharray="4 4"/><text x="${x(v) + 4}" y="${T + 12}" font-size="11" fill="${col}">${lab}</text>`;
    let line = '', dot = '';
    if (res.fit) { const x0 = Math.min(...res.used.map(s => s.vo2)), x1 = res.est;
      line = `<line x1="${x(x0)}" y1="${y(res.fit.a + res.fit.b * x0)}" x2="${x(x1)}" y2="${y(hrRef)}" stroke="#7c3aed" stroke-width="2.5" stroke-dasharray="7 5"/>`;
      dot = `<circle cx="${x(x1)}" cy="${y(hrRef)}" r="7" fill="#7c3aed"/><text x="${x(x1) + 10}" y="${y(hrRef) + 20}" font-size="12" font-weight="700" fill="#7c3aed">estimate ${f(x1, 2)} L/min</text>`; }
    const pts = sts.map(s => `<circle cx="${x(s.vo2)}" cy="${y(s.hr)}" r="6" fill="${res.used.includes(s) || res.used.some(u => u.st === s.st) ? '#0f172a' : '#cbd2dc'}"/><text x="${x(s.vo2) - 10}" y="${y(s.hr) + 4}" text-anchor="end" font-size="11" fill="#5b6577">${s.w ? f(s.w) + ' W' : ''}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Heart rate against oxygen uptake with the line extended to maximal heart rate">${g}
      <line x1="${L}" x2="${W - Rr}" y1="${y(hrRef)}" y2="${y(hrRef)}" stroke="#b91c1c"/><text x="${L + 6}" y="${y(hrRef) - 6}" font-size="11" fill="#b91c1c">my max heart rate before flight: ${Math.round(hrRef)} bpm</text>
      ${vline(base, '#16a34a', '100%')}${vline(base * 0.85, '#b45309', '85%')}${vline(base * 0.8, '#b91c1c', '80%').replace('x="' + (x(base * 0.8) + 4) + '"', 'x="' + (x(base * 0.8) - 4) + '" text-anchor="end"')}${line}${pts}${dot}
      <text x="${(L + W - Rr) / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#5b6577">oxygen uptake, L/min</text><text x="12" y="${(T + H - B) / 2}" font-size="12" fill="#5b6577" transform="rotate(-90 12 ${(T + H - B) / 2})" text-anchor="middle">heart rate, bpm</text></svg>`;
  }
  function trendChart(r) {
    const pts = r.tests.slice(-12).map(t => { const e = aciCalc(stagesOf(r, t), t.hrRef ?? r.hrPre).est; return { x: t.kind === 'pre' ? t.label.replace('Pre-flight test ', 'Pre ') : t.label, a: Number.isFinite(e) && validBase(t.base ?? r.base) ? e / (t.base ?? r.base) * 100 : null, m: t.kind === 'post' && (st.shown[r.pid + t.key] || r.pid === '__own__') && validBase(t.peakVo2) && validBase(t.base ?? r.base) ? t.peakVo2 / (t.base ?? r.base) * 100 : null, on: t.key === st.tk }; });
    const W = 560, H = 230, L = 46, Rr = 44, T = 14, B = 30;
    const vals = pts.flatMap(p => [p.a, p.m]).filter(v => v != null).concat([80, 100]);
    const lo = Math.floor((Math.min(...vals) - 5) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
    const x = i => L + (pts.length === 1 ? 0 : i * (W - L - Rr) / (pts.length - 1)), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    let g = ''; for (let v = lo; v <= hi; v += 10) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="#eef1f5"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#8a93a3">${v}%</text>`;
    const hl = (v, col, lab) => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="${col}" stroke-dasharray="3 4"/><text x="${W - Rr}" y="${y(v) - 4}" text-anchor="end" font-size="11" fill="${col}">${lab}</text>`;
    const ln = (k, col, dash) => { const q = pts.map((p, i) => p[k] == null ? null : [x(i), y(p[k])]).filter(Boolean); return (q.length > 1 ? `<polyline points="${q.map(z => z.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" ${dash ? 'stroke-dasharray="6 5"' : ''}/>` : '') + q.map(z => `<circle cx="${z[0]}" cy="${z[1]}" r="5" fill="${col}"/>`).join(''); };
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Your fitness over time">${g}${hl(85, '#b45309', '85% screen')}${hl(80, '#b91c1c', '80% NASA standard')}${ln('a', '#7c3aed', true)}${ln('m', '#0f172a')}
      ${pts.map((p, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" font-weight="${p.on ? 700 : 400}" fill="${p.on ? '#0f172a' : '#5b6577'}">${esc(p.x)}</text>`).join('')}</svg>
      <div class="note"><b style="color:#7c3aed">- -</b> short-test estimate &nbsp; <b>—</b> measured maximal test · latest 12 checks</div>`;
  }
  // Свои цифры: новый астронавт вводит норму до полёта и сегодняшний тест
  st.mode = 'nasa';
  const validBase = value => Number.isFinite(value) && value >= 0.5 && value <= 7;
  const validHR = value => Number.isFinite(value) && value >= 60 && value <= 230;
  const validFull = value => value == null || (Number.isFinite(value) && value >= 0.5 && value <= 7);
  const storageKey = 'aerocore-checks-v1';
  let storageAvailable = true;
  st.own = { base: 3.0, hr: 185, full: null, history: [], stages: [{ st: '1', w: 50, hr: 108, vo2: 1.15 }, { st: '2', w: 100, hr: 133, vo2: 1.65 }, { st: '3', w: 150, hr: 158, vo2: 2.15 }] };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && Array.isArray(stored.history) && Array.isArray(stored.stages) && stored.stages.length === 3) {
      const validStage = row => row && ['w', 'hr', 'vo2'].every(key => row[key] == null || (Number.isFinite(row[key]) && Math.abs(row[key]) <= 1e6));
      if (stored.stages.every(validStage) && stored.history.length <= 50 && stored.history.every(row => /^c\d+$/.test(row.key) && typeof row.label === 'string' && typeof row.day === 'string' && validBase(row.base) && validHR(row.hrRef) && validFull(row.peakVo2) && Array.isArray(row.stages) && row.stages.length === 3 && row.stages.every(validStage))) { st.own = { ...stored, base: validBase(stored.base) ? stored.base : 3, hr: validHR(stored.hr) ? stored.hr : 185, full: validFull(stored.full) ? stored.full : null }; }
    }
  } catch (_) { storageAvailable = false; }
  const persistOwn = () => { try { localStorage.setItem(storageKey, JSON.stringify(st.own)); storageAvailable = true; } catch (_) { storageAvailable = false; } };
  const ownRow = () => {
    const selected = st.own.history.find(t => t.key === st.tk);
    return { pid: '__own__', base: selected?.base ?? st.own.base, hrPre: selected?.hrRef ?? st.own.hr, pre: [],
      tests: [...st.own.history, { key: 'today', label: 'Current check', kind: 'post', day: '', base: st.own.base, hrRef: st.own.hr, stages: st.own.stages, peakVo2: st.own.full, peakHr: null }] };
  };
  const curRow = () => st.mode === 'own' ? ownRow() : meRow();

  function share(r, t, pct, v, res, meas) {
    const who = st.mode === 'own' ? 'My check' : `${r.pid} (replay of NASA MR080G data)`;
    const lines = [`AEROCORE fitness check — ${who}`, `${t.label}${t.day ? ` (${t.day})` : ''}`, `Exported: ${new Date().toISOString()}`, ...(st.mode === 'nasa' && st.edit[r.pid + t.key] ? ['MODIFIED REPLAY — readings differ from the supplied NASA record.'] : []), '',
      `Estimated aerobic capacity: ${pct != null ? pf(pct) + '% of pre-flight level' : 'not available'}${res.est ? ` (${f(res.est, 2)} vs ${f(r.base, 2)} L/min pre-flight)` : ''}`,
      `Status: ${v.head}`, `Action: ${v.todo}`, '',
      `Data check: ${res.checks.every(c => c.ok) ? 'all passed' : res.checks.filter(c => !c.ok).map(c => c.t).join('; ')}`,
      `Short test: ${stagesOf(r, t).map(x => `${f(x.w)} W, HR ${x.hr}, VO₂ ${x.vo2}`).join(' | ')}`,
      `Pre-flight max heart rate: ${f(r.hrPre)} bpm`,
      ...(meas != null && (st.shown[r.pid + t.key] || st.mode === 'own') ? [`Full (maximal) test: ${pf(meas)}% of pre-flight level`] : []),
      '', 'Team research proposal: screen every 14 days; seek maximal-test confirmation below 85%. This is not a NASA-approved operational protocol. NASA-STD-3001 [V1 4003] specifies ≥ 80% of pre-flight VO₂max.', 'Research prototype, not a medical device.'];
    modal(`<h2>Export this check</h2><p class="sub">A plain-text research summary. Copy or download it for a reviewer or study log.</p>
      <textarea id="share-txt" readonly style="width:100%;height:300px;font:13px/1.5 ui-monospace,Menlo,monospace;border:1px solid var(--line);border-radius:10px;padding:12px">${esc(lines.join('\n'))}</textarea>
      <button class="btn dark" id="copy" style="margin-top:10px">Copy text</button> <button class="btn ghost" id="download-report" style="margin-top:10px">Download .txt</button> <span class="note" id="copied" role="status"></span>`);
    $('#download-report').onclick = () => download('aerocore-check.txt', lines.join('\n'));
    $('#copy').onclick = async () => { const ta = $('#share-txt'); ta.select(); let ok = false; try { await navigator.clipboard.writeText(ta.value); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) {} } $('#copied').textContent = ok ? 'Copied.' : 'Text selected — press Ctrl+C / ⌘C.'; };
  }

  function me() {
    const own = st.mode === 'own', r = curRow();
    if (!r.tests.some(t => t.key === st.tk)) st.tk = own ? 'today' : r.tests[r.tests.length - 1].key;
    const t = r.tests.find(x => x.key === st.tk), sts = stagesOf(r, t), res = aciCalc(sts, r.hrPre);
    res.checks.unshift({ ok: validBase(r.base), t: validBase(r.base) ? 'Measured pre-flight VO₂ baseline is in range' : 'Enter a measured pre-flight VO₂ baseline within 0.5–7 L/min' });
    const pct = res.est && validBase(r.base) ? res.est / r.base * 100 : null, v = verdict(t, pct), edited = !own && !!st.edit[r.pid + t.key];
    const meas = validBase(t.peakVo2) && validBase(t.base ?? r.base) ? t.peakVo2 / (t.base ?? r.base) * 100 : null, shown = own ? meas != null : st.shown[r.pid + t.key];
    const signal = t.kind === 'post' && (pct == null || pct < 85);
    const res2 = m => m < 80 ? (signal ? 'The measured peak is also below the 80% reference.' : 'The measured peak is below 80% despite a passing screen: a false negative in this replay.') : (signal ? 'The measured peak is at or above 80%: the screen triggered a review without a measured breach.' : 'The measured peak is at or above the 80% reference.');
    let conf = '';
    if (own && t.key === 'today') {
      conf = `<div class="reveal"><label style="font-size:14px">If you did the full (maximal) test, enter its peak VO₂: <input id="own-full" type="number" min="0.5" max="7" step="0.01" aria-label="Measured maximal test VO2 in litres per minute" value="${st.own.full ?? ''}" placeholder="L/min" style="width:90px;font:inherit;padding:5px 8px;border:1px solid var(--line);border-radius:7px"> L/min</label>
        ${!validFull(st.own.full) ? '<p class="form-error">Measured peak VO₂ must be within 0.5–7 L/min.</p>' : ''}${meas != null ? `<div style="margin-top:8px"><b>Full test: ${pf(meas)}% of your pre-flight level.</b> ${res2(meas)}</div>` : ''}</div>`;
    } else if (t.kind === 'post' && meas != null) {
      const hrDrop = t.peakHr && t.peakHr < r.hrPre - 10 ? ` Note: peak heart rate in that test was ${t.peakHr} vs ${f(r.hrPre)} bpm before flight — the full test itself may not have been maximal.` : '';
      conf = `<div class="reveal">${shown ? `<b>Full (maximal) test result: ${pf(meas)}% of your pre-flight level</b> (${f(t.peakVo2, 2)} L/min).<div style="margin-top:6px">${res2(meas)}${esc(hrDrop)}</div>`
        : `<button class="btn ${signal ? 'dark' : 'ghost'}" id="reveal">${signal ? 'Reveal measured test result' : 'Compare with measured result'}</button> <span class="note">In this NASA study the full test was done the same day, so we can check the decision.</span>`}</div>`;
    }
    const kinds = own ? 0 : D.archive.filter(k => k.people.includes(r.pid)).length;
    const lab = 'font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0 0 8px';
    $('#me-main').innerHTML = `
      <aside class="card">
        <div class="seg2"><button data-mode="nasa" aria-pressed="${!own}" class="${own ? '' : 'on'}">Replay NASA study</button><button data-mode="own" aria-pressed="${own}" class="${own ? 'on' : ''}">My local checks</button></div>
        ${own ? `<div class="who" style="margin-top:14px"><h3 style="${lab}">My pre-flight level</h3>
            <div class="ownbase"><label>Peak VO₂ before flight<input id="own-base" type="number" min="0.5" max="7" step="0.01" value="${st.own.base ?? ''}"> L/min</label>
            <label>Max heart rate before flight<input id="own-hr" type="number" min="60" max="230" value="${st.own.hr ?? ''}"> bpm</label></div>
            <p class="note" style="margin:6px 0 0">From measured pre-flight full tests. ${st.own.history.length ? 'Saved checks retain their original baseline and heart rate.' : 'Default values are an editable example.'}</p><p class="session-note">${storageAvailable ? 'The latest 50 checks are stored on this browser/device. Avoid shared devices for personal health data.' : 'Browser storage is unavailable. Checks last for this session only.'}</p></div>`
        : `<div class="who" style="margin-top:14px"><h3 style="${lab}">Study participant</h3>
          <select id="who" aria-label="Study participant">${C3.rows.map(x => `<option ${x.pid === r.pid ? 'selected' : ''}>${esc(x.pid)}</option>`).join('')}</select>
          <p class="note" style="margin:6px 0 0">Real participant of NASA’s 60–90-day bed-rest study (LSDA MR080G, Campaign 3). Bed rest is NASA’s ground model of spaceflight.</p>
          <p style="margin:12px 0 0;font-size:14px">My pre-flight level: <b>${f(r.base, 2)} L/min</b> · max heart rate <b>${f(r.hrPre)} bpm</b><br><span class="note">mean of ${r.pre.length} pre-flight full test${r.pre.length > 1 ? 's' : ''}${kinds ? ` · ⚠ ${kinds} data issue${kinds > 1 ? 's' : ''} in this person’s source files` : ''}</span></p></div>`}
        ${own && t.key !== 'today' ? `<p class="session-note">Saved reference: ${f(r.base, 2)} L/min · ${f(r.hrPre)} bpm. This check is read-only.</p>` : ''}
        <div class="step"><span class="n">1</span><b>${own ? 'My checks' : 'Pick a check'}</b></div>
        <div class="chips">${r.tests.map(x => `<button data-tk="${x.key}" aria-pressed="${x.key === t.key}" class="${x.key === t.key ? 'on' : ''}">${esc(x.label)} <span class="note" style="color:inherit;opacity:.8">${esc(x.day)}</span></button>`).join('')}</div>
        <div class="step"><span class="n">2</span><b>My short cycle test</b></div>
        <p class="note" style="margin:-4px 0 8px">Three steady stages on the cycle; heart rate and oxygen uptake at the end of each. ${own ? 'Type your numbers.' : 'Values are from the NASA file — change any of them to see how the result reacts.'}</p>
        <table class="stages"><thead><tr><th>Stage</th><th>Load, W</th><th>Heart rate</th><th>VO₂, L/min</th></tr></thead><tbody>
          ${sts.map((x, i) => `<tr><td>${esc(x.st)}</td><td>${own && t.key === 'today' ? `<input data-i="${i}" data-k="w" type="number" min="0" max="600" step="any" aria-label="Stage ${esc(x.st)} workload in watts" value="${x.w ?? ''}">` : f(x.w)}</td><td><input data-i="${i}" data-k="hr" type="number" min="30" max="230" step="any" ${own && t.key !== 'today' ? 'readonly' : ''} value="${x.hr ?? ''}" class="${edited ? 'edited' : ''}" aria-label="Stage ${esc(x.st)} heart rate"></td><td><input data-i="${i}" data-k="vo2" type="number" min="0.1" max="7" step="0.01" ${own && t.key !== 'today' ? 'readonly' : ''} value="${x.vo2 ?? ''}" class="${edited ? 'edited' : ''}" aria-label="Stage ${esc(x.st)} VO2"></td></tr>`).join('')}
        </tbody></table>
        ${own && st.own.history.length ? '<button class="btn ghost" id="clear-history" style="margin-top:8px">Clear saved checks</button>' : ''}
        ${edited ? '<button class="btn ghost" id="reset" style="margin-top:8px">Reset to NASA values</button>' : ''}
        ${own && t.key === 'today' ? `<button class="btn dark" id="save" style="margin-top:8px" ${pct == null || !validFull(st.own.full) || !res.checks.every(c => c.ok) ? 'disabled' : ''}>Save this check</button><p class="note">Save requires valid stage readings and references. Current values stay available for the next edit.</p>` : ''}
        <div class="step"><span class="n">3</span><b>Data check</b></div>
        <ul class="checks">${res.checks.map(c => `<li><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✕'}</span><span>${esc(c.t)}</span></li>`).join('')}</ul>
      </aside>
      <section>
        <div class="card">
          <div class="step" style="margin-top:0"><span class="n">4</span><b>Where I stand — ${esc(t.label)}${t.day ? ` (${esc(t.day)})` : ''}</b></div>
          <div class="status ${v.c}" role="status" aria-live="polite"><div class="pct">${pct != null ? pf(pct) + '%' : '—'}</div><div class="lab">estimated aerobic capacity, % of my pre-flight level</div><div class="head">${esc(v.head)}</div></div>${edited ? '<p class="session-note">MODIFIED REPLAY · values differ from the supplied study record.</p>' : ''}
          <div class="todo"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h3>${t.kind === 'pre' ? 'What this means' : 'Proposed next review'}</h3>${esc(v.todo)}<div class="note" style="margin-top:6px">${esc(v.why)}</div></div>
            ${t.kind === 'post' ? '<button class="btn light" id="share" style="white-space:nowrap">Export check</button>' : ''}</div></div>
          ${t.kind === 'post' ? `<div class="step"><span class="n">5</span><b>Compare with the measured test</b></div>${conf}` : ''}
          <div class="two">
            <div><h3>How the estimate is made</h3><p class="note" style="margin:0 0 6px">ACI adaptation: fit a line through the measured stages and extend it to my pre-flight maximal heart rate. Where it lands is my estimated maximum.</p>${hrChart(r, t, res)}</div>
            <div><h3>My trend</h3><p class="note" style="margin:0 0 6px">Each check against my own pre-flight level, with NASA’s 80% standard.</p>${trendChart(r)}</div>
          </div>
          <details class="gloss"><summary>What do these words mean?</summary><ul class="notes">
            <li><b>VO₂max</b> — how much oxygen your body can use at peak effort; the main measure of aerobic fitness. It drops in weightlessness.</li>
            <li><b>80% standard</b> — NASA-STD-3001 [V1 4003]: during a mission VO₂max must stay at or above 80% of the pre-flight value.</li>
            <li><b>Short test</b> — this replay uses the recorded three-minute stages at the start of ground-study maximal tests. The ISS PFE uses a different stage protocol; this is not a direct reproduction. <b>Full test</b> — measured at maximal effort; it also has measurement error. An in-flight session took about 3 hours in the cited study.</li>
            <li><b>ACI</b> — a submaximal estimate of VO₂max; this replay applies the method to stages recorded within maximal tests. <b>85% screen</b> — our proposed threshold for confirmatory review, not a NASA operational rule. Estimated single-test typical error is ${f(S.noise.est, 1)}% in this ground cohort.</li>
          </ul></details>
        </div>
      </section>`;
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; st.tk = st.mode === 'own' ? 'today' : 'end'; render(); });
    if ($('#who')) $('#who').onchange = e => { st.pid = e.target.value; st.tk = 'end'; render(); };
    const num = (sel, fn) => { if ($(sel)) $(sel).onchange = e => { fn(e.target.value.trim() === '' ? null : Number(e.target.value)); persistOwn(); render(); }; };
    num('#own-base', val => { st.own.base = val; });
    num('#own-hr', val => { st.own.hr = val; });
    num('#own-full', val => { st.own.full = val; });
    document.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { st.tk = b.dataset.tk; render(); });
    document.querySelectorAll('.stages input').forEach(inp => inp.onchange = e => {
      const i = +e.target.dataset.i, k = e.target.dataset.k, val = e.target.value.trim() === '' ? null : Number(e.target.value);
      if (own && t.key !== 'today') return;
      if (own && t.key === 'today') { st.own.stages[i][k] = val; persistOwn(); }
      else { const arr = (st.edit[r.pid + t.key] || t.stages).map(x => ({ ...x })); arr[i][k] = val; st.edit[r.pid + t.key] = arr; }
      render();
    });
    if ($('#reset')) $('#reset').onclick = () => { delete st.edit[r.pid + t.key]; render(); };
    if ($('#reveal')) $('#reveal').onclick = () => { st.shown[r.pid + t.key] = true; render(); };
    if ($('#save')) $('#save').onclick = () => {
      if (pct == null || !validBase(st.own.base) || !validHR(st.own.hr) || !validFull(st.own.full) || !res.checks.every(c => c.ok)) return;
      const n = Math.max(0, ...st.own.history.map(check => Number(check.key.slice(1)))) + 1;
      st.own.history.push({ key: 'c' + n, label: 'Check ' + n, kind: 'post', day: new Date().toLocaleString(), base: st.own.base, hrRef: st.own.hr, stages: st.own.stages.map(x => ({ ...x })), peakVo2: st.own.full, peakHr: null });
      st.own.history = st.own.history.slice(-50); st.own.full = null; st.tk = 'c' + n; persistOwn(); render();
    };
    if ($('#clear-history')) $('#clear-history').onclick = () => {
      modal('<h2>Clear saved checks?</h2><p class="sub">This removes saved checks from this browser. Your current input stays available.</p><button class="btn dark" id="confirm-clear">Clear saved checks</button>');
      $('#confirm-clear').onclick = () => { st.own.history = []; st.tk = 'today'; persistOwn(); closeModal(); render(); };
    };
    if ($('#share')) $('#share').onclick = () => share(r, t, pct, v, res, meas);
  }

  function render() { tabs(); answer(); if (st.view === 'me') me(); else { header(); side(); table(); panel(); } }
  $('#uc').onclick = useCases; $('#up').onclick = upload; $('#ev').onclick = evidence;
  $('#modal').onclick = e => { if (e.target.id === 'modal' || e.target.classList.contains('close')) closeModal(); };
  document.addEventListener('keydown', e => {
    if (!$('#modal').classList.contains('on')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') { const els = [...$('#modal').querySelectorAll('button, [href], input, select, textarea, summary, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length); const first = els[0], last = els[els.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
  render();
})();
