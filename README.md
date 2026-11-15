# AEROCORE — Aerobic Capacity Research Workbench

**An offline research prototype for transparent aerobic-capacity screening.** Built around NASA LSDA MR080G flight-analog data for the [2026 Health Monitoring Software challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/).

AEROCORE traces a submaximal estimate from exercise-stage readings to a personal baseline, exposes questionable data, and makes a proposed screening rule inspectable. It includes a participant replay, local checks with saved reference snapshots, a cohort review, CSV import, evidence and TXT export.

## Open and run

Open **docs/index.html** in a current Chrome, Edge, Firefox or Safari. The entire app is embedded in that file; it needs no internet, account, API key, package installation or backend.

For a stable browser storage origin, or if local-file access is restricted:

```sh
python start.py
```

Open `http://127.0.0.1:8787/`. Use `python start.py 8788` to choose another port. Keep the terminal running; Ctrl+C stops it. Personal checks stay in the same browser and origin. Moving the file or changing ports can give a different storage origin.

## Demonstrate the workflow

1. Start with participant **C3D_7961**, end of bed rest. The ACI estimate is approximately **65%** of the measured baseline. Reveal the same-day measured result (about **61%**).
2. Change a heart-rate value to **0**. See the excluded stage and unavailable estimate; reset the replay. Modified records are labelled.
3. Open **My local checks**. Enter valid stage readings, measured baseline and peak HR. Save a check; it retains its original baseline and peak HR even after the current reference changes. The latest 50 checks persist in this browser. Export a check as TXT or copy it.
4. Switch to **Crew & flight surgeon**. Review both datasets, group filters, flagged participants and supplied archive issues. Load a CSV example or your own data.
5. Open **Research evidence** for cohort findings and the explicitly illustrative simulation.

No messages are sent to anyone. CSV files are processed in the browser and held for the session. Personal local checks use localStorage; **Clear saved checks** removes the saved history, while current inputs remain editable. There is no sensor connection, live telemetry, authentication or cloud health-record service in this prototype.

## Interpretation and sources

[NASA-STD-3001 Vol. 1 Rev. C, §4.1.3](https://standards.nasa.gov/sites/default/files/standards/NASA/C/nasa-std-3001-vol-1-rev-c-signature.pdf) specifies retaining at least **80%** of pre-mission aerobic capacity, measured directly or indirectly. Additional absolute EVA requirements are separate. A relative percentage does not establish EVA readiness.

The **85%** screen and **14-day** review interval are team research proposals. They are not NASA operational instructions. The ACI method extrapolates stage HR–VO₂ to measured pre-study peak HR ([Moore et al., 2015](https://pubmed.ncbi.nlm.nih.gov/26630198/)). Our replay uses three-minute stages embedded within maximal bed-rest tests, rather than the independent five-minute-stage ISS PFE protocol described in that source. Two-stage fits are fragile and are labelled accordingly. Physiological ranges, a 10-bpm span and extrapolation limits are software screening guards, not clinical validation.

## Evidence from the supplied processed records

| Analysis | Result and denominator |
| --- | --- |
| Median measured peak VO₂ change immediately after bed rest | −32.1%; 15 participants |
| Correlation of measured and ACI-to-ACI changes | r = 0.743; 20 observations, 13 participants |
| ACI below 80% of measured baseline: sensitivity | 9/10 true-breach tests; 95% participant-cluster interval 73.3–100% |
| Same comparison: specificity | 9/11 non-breach tests; interval 60–100% |
| Decision-analysis sample | 21 follow-up tests, 14 participants; includes repeated observations |
| Head-to-head mean absolute error | ACI 6.56 pp vs leave-one-participant-out cohort mean 6.76 pp; paired 20-test subset |
| CFT70 immediate post-bed-rest values below 80% | Control 5/8; exercise 0/18; flywheel 0/8 after supplied exclusions |

These are small exploratory samples. The 80% decision analysis is different from the proposed 85% review threshold. Correlation is not agreement. Single-test noise around 6.36% is an estimate under equal, independent-error assumptions; it is not an individual confidence bound.

### Illustrative simulation, not application accuracy

A seeded model simulates 20,000 participants over 180 days. Under its base assumptions, screening detects **2,998/3,029 modelled breaches (99.0%)**, with **2.18** post-baseline maximal tests per participant, compared with **2,967/3,029 (98.0%)** and **4.90** for the monthly reference. Six monthly tests are planned before stopping; both protocols now stop at their first positive. A positive only counts as detection when underlying capacity is actually below 80% at that time.

Screening is within 0.5 percentage point of or above the reference in **15/18 selected scenarios**, with **25–78% fewer actual maximal tests**. This descriptive tolerance is not a noninferiority study. With slow linear decline sensitivity falls to about **36%**; the combined worst scenario is about **24%**. The model assumes independent zero-mean errors, omits observed bias and correlated drift, and normalizes ACI to pre-study ACI. The replay instead uses measured peak VO₂ as its denominator. The model is a separate protocol hypothesis, not end-to-end validation of the UI. Test counts exclude baseline testing, submaximal sessions, downstream care and crew time.

## Data provenance and audit boundary

- [NASA LSDA MR080G — Aerobic Capacity (Flight Analog)](https://doi.org/10.83263/w056-8t76): Campaign 3 and CFT70; supplied processed stage/summary tables and provenance manifest.
- [PhysioNet — Treadmill Maximal Exercise Tests](https://doi.org/10.13026/7ezk-j442): supplied processed reference analysis.
- NASA standards and historical VO₂max experiment [NTRS 20090010236](https://ntrs.nasa.gov/api/citations/20090010236/downloads/20090010236.pdf). Its roughly three-hour session allocation included preparation and stowage; it is not a universal duration for today's maximal tests.

**The original raw archives are absent.** This revision reproduced the supplied Campaign 3 processed-stage calculations, uncertainty analysis and simulation. It did not independently verify the claimed 1,505 raw-file MD5 matches or every manual archive-error category. The manifest and supplied issue inventory preserve those original audit claims. Read [the research audit](documentation/RESEARCH_AUDIT_EN.md) and [verified sources](documentation/SOURCES_VERIFIED_EN.md).

## Build and checks

The build uses only Python's standard library. Core and calculator tests need Node.js 18+; no npm install is needed.

```sh
python build.py
npm test
```

Optional research checks:

```sh
python -m pip install -r research/requirements.txt
python -m unittest discover -s research -p test_research.py -v
```

Optional real-browser regression checks (starts its own local server):

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/browser_smoke.py
```

An installed Chromium is used automatically; `CHROMIUM_PATH` overrides it. This checks every built-in participant/time point, invalid/blank values, history snapshots/reload, export downloads, keyboard interactions, malformed/valid CSV, and viewport widths from 360 to 1440 px. The embedded app has no external network dependency.

Reproduce available processed-data analysis:

```sh
python research/mr080g_tests.py research/results_mr080g
python research/mr080g_aci.py research/results_mr080g
python research/uncertainty.py research
python research/robustness.py research
python research/make_dashboard_data.py research src/dashboard_data.js
python research/make_findings.py research src/findings.js
python build.py
```

Raw re-parsing and checksum verification additionally require the exact original data identified by `research/MR080G_manifest_sha256.csv`; see the script headers for their input paths. Do not describe processed-data regeneration as a fresh raw-data audit.

## Structure

- `docs/index.html` — self-contained deliverable; GitHub Pages can serve `/docs`.
- `src/` — interface, styles, analytic core and generated dashboard data.
- `research/` — scripts, processed results, simulation and manifest.
- `tests/` — core/calculator regressions and optional browser integration checks.
- `documentation/` — research audit, verified sources and submission narrative.
- `pitch/` — current UI screenshots.

## Limits and next work

This is a working **research prototype**, not a certified medical device or flight system. It has no NASA endorsement. Flight records, independent prospective validation, sensor/hardware validation and a flight-medicine-approved protocol would be needed for operational use. Bed rest is an analog; errors, selection and small samples limit generalization. Local storage is device/browser-specific and is not a secure multi-user clinical record system.

AI assistance is disclosed: the original project reports Claude and ChatGPT use; this revision used ChatGPT/Codex for code review, fixes, research checks, design, documentation and verification. The team must review and accept scientific and submission claims. Original third-party data and publications retain their own terms; no new license is asserted for the uploaded source.
