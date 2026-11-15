# AEROCORE — Aerobic Capacity Research Workbench

**Tagline:** Inspect the data. Explain the estimate. Test the assumptions.

Reviewed submission draft · 15 November 2026

## Project summary

AEROCORE is an offline research workbench for exploring changes in aerobic capacity using NASA flight-analog data. It combines editable participant replay, transparent ACI calculations, browser-local CSV quality checks, personal-baseline comparisons and an exportable review summary. Its purpose is to make a screening result inspectable: which measurements entered the estimate, what was excluded, how the estimate compares with a baseline, and where uncertainty remains.

The project addresses the [2026 health-monitoring software challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) through one focused health indicator. [NASA-STD-3001 Vol. 1 Rev. C](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1) includes an in-mission aerobic-capacity requirement of at least 80% of the pre-mission value, measured directly or indirectly. AEROCORE uses that relative reference for research comparisons. It does not assess the separate absolute EVA requirements or determine fitness for duty.

## What the judges can use

- **Participant replay:** inspect supplied NASA MR080G bed-rest records, change a stage value and see the quality checks and estimate react.
- **Own-number exploration:** enter a measured baseline and stage readings, inspect the fitted relationship, save checks locally and export a summary for review.
- **Cohort review:** compare participants against their own baselines and examine flagged source-data issues.
- **Local CSV analysis:** load supported records without sending them to a server. Invalid or unsuitable data are flagged before an interpretation is offered.
- **Evidence and methods:** distinguish descriptive results from model outcomes and inspect the assumptions behind both.

## Method and evidence

The ACI method extrapolates the heart-rate–oxygen-uptake relationship to a person's measured pre-mission peak heart rate ([Moore et al., 2015](https://pubmed.ncbi.nlm.nih.gov/26630198/)). The replay derives its submaximal stages from maximal bed-rest tests. Those three-minute stages differ from the five-minute stages described in the cited ISS protocol; this is not an independent validation of an operational ISS PFE session.

Reanalysis of the supplied processed records supports a median measured decline of approximately 32% at the end of bed rest in 15 participants. For the exploratory measured-baseline ACI comparison, 21 evaluable follow-up tests from 14 participants yielded 9 true positives, 1 false negative, 2 false positives and 9 true negatives against the measured 80% reference. The denominators are tests, with repeated observations in some participants. This small retrospective sample is not clinical validation.

The corrected illustrative simulation uses 20,000 virtual participants over 180 days. In its base scenario, the proposed screen detected 2,998 of 3,029 modelled breaches (99.0%), compared with 2,967 (98.0%) for the monthly maximal-test comparison. It used 2.18 versus 4.90 post-baseline maximal tests per participant under the same stopping rule. Six monthly tests were planned before stopping; baseline tests, submaximal sessions, repeat confirmation, downstream care and crew hours are excluded from these counts.

**The simulation does not model the replay end to end.** It normalizes ACI to the mean of two pre-ACI tests and maximal measurements to the mean of two pre-maximal tests. The replay UI instead displays ACI relative to measured pre-test VO₂peak. The simulation assumes independent zero-mean multiplicative errors and no systematic ACI bias, drift or error correlation. Its 99.0% result therefore cannot be presented as the observed accuracy of the interface.

Outcomes change substantially with assumptions: in the slow-linear scenario the screen detected 36.2% of modelled breaches, versus 37.3% for the monthly comparison. These results motivate further evaluation; they do not establish equivalent safety or operational effectiveness. The team's 85% review threshold and 14-day cadence are research proposals, not NASA-approved protocols.

## Data provenance and reproducibility

The primary dataset is [NASA LSDA MR080G, Aerobic Capacity (Flight Analog)](https://nlsp.nasa.gov/view/lsdapub/lsda_experiment/07f12dd0-6725-582c-a4d2-618ed8b8c452), particularly Campaign 3 and CFT70. PhysioNet treadmill-test processed results provide an additional Earth reference. The repository includes processed records, seeded analysis scripts and a source-file manifest. The supplied stages were sufficient to regenerate the downstream Campaign 3 tables and corrected model outputs. Raw archives are absent, so the original report of 1,505 matching NASA checksums has not been independently repeated in this review. The bundled archive-issue catalogue includes findings from the supplied audit; automated CSV checks do not independently establish every manual finding.

## Contribution and next steps

The contribution is an inspectable workflow connecting data quality, a personal baseline, an explainable estimate and reviewable evidence. A useful next step is independent prospective evaluation with a pre-specified protocol, consistent normalization and exercise-physiology oversight. Further work would test systematic bias, correlated measurement errors, sensor drift and the practical workload of repeat confirmation.

AEROCORE is an independent research prototype. Use of NASA data and standards does not imply NASA endorsement. It is not a medical device or an operational crew-health system.

## Suggested AI disclosure

The supplied project identifies prior use of Claude and ChatGPT in coding, analysis and drafting. This revision used ChatGPT/Codex to audit and repair code, improve the interface, check selected sources, rerun the supplied processed-data analyses and prepare documentation. The team should verify that this accurately describes its full workflow and retain responsibility for the submitted materials.

## Seven-slide presentation outline

This is a suggested structure, not a certification of the event's current submission-format rules. Add the actual team identity and working project/demo links before submission.

1. **AEROCORE: make aerobic-capacity evidence inspectable**
   - Tagline: Inspect the data. Explain the estimate. Test the assumptions.
   - Lead with the working application, actual team identity and the health-monitoring challenge.
   - Visual: current application screenshot; no implied NASA endorsement.

2. **One health indicator, one clear research question**
   - NASA's relative reference is 80% of pre-mission aerobic capacity.
   - Can an explainable submaximal estimate support a research review workflow?
   - Distinguish this question from EVA clearance and clinical deployment.
   - Visual: baseline, 85% team review threshold and 80% NASA relative reference, each labelled by origin.

3. **A working, offline inspection loop**
   - Load or replay → check inputs → inspect the estimate → compare with baseline → export for review.
   - Show one editable stage and a quality flag responding immediately.
   - Explain that user CSV data are processed locally.
   - Visual: input, data-check and result sections of the current app.

4. **Real processed records, explicit denominators**
   - Campaign 3 end-of-bed-rest median measured decline: approximately 32%, 15 participants.
   - Exploratory measured-baseline ACI comparison: 9/10 sensitivity and 9/11 specificity across 21 tests from 14 participants.
   - Bed-rest participants are not in-flight astronauts; repeat observations are not independent participants.
   - Visual: measured versus estimated trend with the reference line.

5. **Simulation is an experiment in assumptions**
   - Base model: 99.0% versus 98.0% detected; 2.18 versus 4.90 maximal tests.
   - Slow-linear model: 36.2% versus 37.3% detected.
   - ACI-to-ACI normalization in the model differs from measured-baseline normalization in the replay.
   - Visual: two scenarios side by side, prominently labelled “illustrative simulation”.

6. **Engineering that protects the interpretation**
   - Show invalid values, unsuitable regression data and CSV errors producing visible explanations.
   - Show local saved checks and a downloadable review summary.
   - Mention reproducible builds and regression/browser checks using the final verified test results.
   - Visual: current data-quality state and export summary; avoid legacy screenshots.

7. **What is ready, and what comes next**
   - Ready: an offline demonstrator with transparent calculations, local analysis and reproducible research outputs.
   - Next: independent data, consistent normalization, pre-specified evaluation and exercise-physiology review.
   - Close with the actual application and repository links.
   - Keep the research-prototype status visible.

## Approximate 90-second live demo script

“AEROCORE makes aerobic-capacity evidence inspectable, from the original stage readings to a reviewable result.

We focus on one NASA reference: maintaining at least 80% of pre-mission aerobic capacity. Our 85% review threshold is a research proposal.

Here is a real bed-rest participant replay. These are stage measurements, the fitted relationship and the estimate against a measured baseline. Watch what happens when I enter an impossible heart rate: the app explains the data problem before interpreting the result. I can restore the source values and reveal the measured follow-up result for comparison.

In the cohort view, each participant has a personal baseline. I can also load CSV records locally. Nothing needs to leave this computer. A review summary can be copied or downloaded.

Our processed-data analysis is small and retrospective. The simulation is separate: its normalization differs from this replay, and results change strongly with the assumed trajectory. We expose those limitations rather than presenting model accuracy as flight validation.

What we offer today is a working offline research tool. The next step is independent prospective evaluation with a consistent protocol and exercise-physiology oversight.”
