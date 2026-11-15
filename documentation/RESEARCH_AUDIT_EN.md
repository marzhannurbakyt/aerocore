# AEROCORE research audit — 15 November 2026

## Scope and evidence

Reviewed all research Python scripts, supplied processed CSV/JSON, generated dashboard inputs, the original README and English DOCX report. Raw NASA MR080G and PhysioNet archives are not included. Therefore source-file parsing, the claimed 1,505 NASA MD5 matches, and manual archive-error confirmations cannot be independently repeated here. The supplied 1,507-row manifest contains an archive entry, the original MD5 list entry, and 1,505 file entries marked `yes`; that is provenance evidence, not a new verification.

The supplied `c3_stages.csv` independently regenerated `c3_tests.csv` (102 rows), `c3_aci.csv` (84 rows), `c3_change.csv` (30 rows), and original descriptive `c3_summary.json` values within 1e-12. Subsequent intentional changes to the decision denominators are described below. The deterministic uncertainty pipeline and corrected simulation are rerun from these supplied processed records. Six research regression tests cover early positives, recovered subjects, undefined denominators, equal stopping rules, seeded reproducibility, and graceful reporting when all source files are unreadable.

## Material corrections

1. **Future breach credited to an earlier false positive.** The simulation previously called any positive a successful detection whenever the person eventually crossed 80%. This generated impossible negative detection delays, including −30 and −66 days in slow-decline scenarios. Detection now requires the first positive to occur while the latent capacity is actually below 80%. A positive before breach or after recovery does not count as detection. In this model observation stops after the first positive.
2. **Unequal maximal-test stopping rules.** The monthly comparison charged all six tests even after a positive, whereas screening stopped after the first positive. Both maximal-test protocols now stop after their first positive. The six planned monthly tests are explicitly distinguished from actual tests performed. Baseline tests, submaximal sessions, repeat confirmation, downstream care and crew hours remain excluded from the test-count metric.
3. **Wrong complete-case restriction for measured-baseline decisions.** The measured-baseline ACI method was incorrectly restricted to records that also had a pre-ACI baseline, which only the alternative method requires. It now uses all 21 evaluable follow-up tests from 14 participants: TP=9, FN=1, FP=2, TN=9, i.e. 9/10 sensitivity and 9/11 specificity. The 20-observation/13-person subset remains appropriate for paired comparisons between both methods and the reported r≈0.743.
4. **Repeated observations treated as independent in decision intervals.** Campaign 3 decision percentages now use participant-cluster percentile bootstrap intervals, retaining test-level point denominators and recording the method. CFT70 proportions use Wilson intervals because each comparison has one observation per participant. These are small exploratory samples, not a clinical validation cohort.
5. **Mislabelled CFT70 p value.** The original p=0.000231 refers to two-sided Mann–Whitney U on continuous change, CONTROL n=8 vs pooled EXERCISE+FLY n=26. It does not refer to categorical 5/8 vs 0/18. The latter Fisher exact p is 0.000851; the continuous CONTROL vs EXERCISE-only Mann–Whitney p is 0.000444. Recommended short table: keep 5/8 and 0/18 without a p value.
6. **Parser dependency mismatch.** `include_groups=False` required pandas≥2.2 while requirements allowed pandas≥2.0. Replaced it with equivalent grouped completeness sums; all 102 supplied file rankings match.
7. **All-invalid audit input.** The archive audit crashed while summarizing a set consisting entirely of unreadable files. It now retains file errors and emits a valid zero-count report.
8. **Summary calculation.** `make_dashboard_data.py` now computes scenario savings using each scenario’s actual REF test count, adds `summary.refPeak`, and makes the 0.5 percentage-point descriptive comparison tolerance explicit. Non-finite data values are emitted as null rather than JavaScript Infinity/NaN.

## Corrected simulation results and wording

Seed 7; 20,000 simulated participants; 180 days; base mixture/trajectory assumptions are unchanged. Base scenario true-breach denominator: 3,029. Screening detects 2,998/3,029 (99.0%); monthly maximal testing detects 2,967/3,029 (98.0%). Average post-baseline maximal tests: screening 2.18 vs monthly 4.90 under the same stopping rule. Six monthly tests are planned before stopping. False alarms among 13,251 continuously clear (≥85%) simulated participants: screening 265 (2.0%), monthly 286 (2.2%); ACI-only 3,504 (26.4%).

Across 18 selected scenarios, screening sensitivity is within 0.5 percentage point of or above the reference in 15 scenarios, with 25–78% fewer maximal tests. This tolerance is a descriptive rule chosen by the team, not a prespecified noninferiority analysis. The slow-linear scenario is substantially worse for both protocols: screening 36.2% vs reference 37.3%; worst combined scenario 24.1% vs24.5%. The illustrative model gives no evidence of clinical safety or operational efficacy.

Recommended wording: “In one illustrative simulation, screening detected 99.0% of modelled breaches with 2.18 maximal tests per participant versus 98.0% and4.90 under the monthly comparison. Results depend strongly on trajectory, error and stopping assumptions. Independent prospective validation is required.”

The simulation normalizes ACI by the mean of two noisy pre-ACI tests, whereas the main replay displays ACI relative to measured preflight VO₂peak. It assumes zero-mean independent normal errors and omits observed systematic bias, drift and error correlation. Therefore it is a separate protocol hypothesis, not an end-to-end simulation of the current app. Avoid presenting 99% as observed sensitivity or a general performance guarantee.

## Findings supported by supplied processed records

- End-of-bed-rest median measured change about−32%, 15 participants.
- Peak-HR median change−0.25 bpm, 30 follow-up observations from16 participants. This is “no average change detected”, not proof that every participant’s peak HR stays fixed.
- Pearson correlation of measured and ACI-to-ACI changes r=0.743, 20 observations/13 participants; participant bootstrap interval appropriate. Correlation is not agreement or clinical accuracy.
- Estimated single-test ACI noise6.36% uses the assumption SD(change error)/√2. It is not an individual confidence bound and relies on independent equal error and comparable tests.
- CFT70 immediate post-bed-rest measured reference crossing: control5/8, exercise0/18, flywheel0/8 after supplied quality exclusions. Group-average transfer error27pp pools exercise and flywheel26 participants; label it accordingly.
- Head-to-head measured-baseline ACI MAE6.56pp versus leave-one-participant-out cohort mean6.76pp uses the paired20-test subset. The result does not demonstrate superior individual accuracy.

## Sources and presentation constraints

Primary NASA source check is in `SOURCES_VERIFIED_EN.md`; its facts were verified against NASA-hosted PDFs/text. NASA-STD-3001 Vol1 RevC (2023) supports80% pre-mission and32.9/36.5mL/kg/min EVA thresholds. Both relative and absolute requirements and mission planning apply; the app cannot establish EVA readiness from a relative percentage.

The3h session is from historical NASA VO₂max experiment NTRS20090010236 and includes preparation/exercise/stowage. Monthly historical PFEs and monthly maximal tests in that historical study are different. The cited ISS submaximal stages were5min, while the MR080G replay stages are3min within maximal tests; the datasets do not validate an independent PFE session. Use “candidate research workflow” rather than “How NASA can use it”. The85% review threshold,14-day cadence and app actions are team proposals.

Treat the original DOCX reports/submission kit and screenshots as unreviewed provenance: they contain superseded results and stronger operational language. Do not present them as the current verified report. Bed-rest participants are not flight astronauts, and automated checks do not establish all manual error categories. NASA challenge title/year/participation/endorsement should not be asserted as independently verified from the archive.

## Reproduction

```
python research/mr080g_tests.py research/results_mr080g
python research/mr080g_aci.py research/results_mr080g
python research/uncertainty.py research
python research/robustness.py research
python -m unittest discover -s research -p test_research.py -v
python research/make_dashboard_data.py research src/dashboard_data.js
python research/make_findings.py research src/findings.js
python build.py
```

The first two steps use supplied processed stages; they are not a raw archive reanalysis. Raw source verification requires obtaining the exact files matching the manifest. Build and browser checks are coordinated by the main agent separately.
