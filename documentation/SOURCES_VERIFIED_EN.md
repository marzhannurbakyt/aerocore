# AEROCORE source audit (2026-11-15)

This is a read-only review of supplied materials and selected primary sources. Raw MR080G files are absent, so archive checksums and recording-error counts cannot be independently rerun here.

## Verified primary-source facts

- NASA's active [NASA-STD-3001 Vol. 1 page](https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_1) lists revision C, dated 2023-09-15. The linked PDF (§4.1, printed pp.32–34) supports the 80% pre-mission aerobic-capacity requirement and the 32.9 / 36.5 mL/kg/min EVA requirements. It explicitly says both relative and performance requirements are to be considered. An 80% result alone cannot establish EVA readiness.
- [OCHMO Exercise Overview](https://www.nasa.gov/ochmo-tb-031-exercise-overview-2/) corroborates these values and cautions that mission activity planning must consider more than the thresholds.
- [NTRS 20090010236](https://ntrs.nasa.gov/citations/20090010236), slide 10, genuinely schedules 3.0 hours for an in-flight VO₂max experiment session, including equipment and subject preparation, exercise, and stowage. This is a historical experiment, not a current general NASA requirement or the exercise duration alone. Slide 6 schedules FD14 then every30 days; [20090015252](https://ntrs.nasa.gov/citations/20090015252) gives FD15 and every30 days.
- The 2010 [NTRS 20100003953](https://ntrs.nasa.gov/citations/20100003953) describes three **5-minute** initial stages at ~25/50/75% preflight VO₂max. MR080G replay uses three **3-minute** stages from the start of maximal tests, a consequential protocol difference. Avoid calling the replay exactly the ISS PFE test.
- NASA's [2013 PFE daily report](https://www.nasa.gov/blogs/stationreport/2013/06/11/iss-daily-summary-report-06-11-13/) and [2016 technical publication](https://www.nasa.gov/wp-content/uploads/2022/03/iss_technical_publication_030116.pdf) support monthly historical PFEs. They do not prove the exact current operational cadence in 2026.

## Claims requiring correction or qualification

- Change “NASA already runs ... 6 maximal tests” to “A historical NASA VO₂max study used monthly maximal tests; our simulation compares that schedule.” The regular monthly PFE and the historical maximal-test experiment are different.
- “Answer from NASA’s own data: as a screen—yes” overstates validation. Use “Exploratory bed-rest analysis and an assumption-dependent simulation motivate evaluation of ACI as a screen.” Flight performance and independent prospective validation are absent.
- The 85% cutoff, 14-day cadence, action rules and any claim of clinical safety belong to the team; they are not NASA-approved protocols. Keep this visible beside decisions.
- Avoid “carry on,” “cleared,” “confirmed fine,” “the ACI assumption holds,” “likely below NASA standard,” and “the full test only if flagged.” More accurate: “No screening flag in this check”; “measured result above the relative 80% reference”; “no average peak-HR change was detected in this cohort”; “screen below the team’s review threshold.” ACI's single-test noise is not a ±6% confidence bound.
- Source data are **bed-rest participants**, not astronauts or in-flight crew. “Replay participant” should remain visible; simulated crew should always be identified as simulated.
- “All 1,505 files verified” may only be attributed to the supplied audit/manifest. The bundled manifest has reported `yes` values, but source files and source MD5 list are unavailable for independent verification. Say “The supplied archive audit reports...”.
- The original English DOCX report contains older simulation outcomes and operational recommendations. It should be clearly marked as the original submitted document, retained as provenance, or replaced with a current reviewed report before presenting to judges.
- Subsequent primary-source review verified the [official 2026 health-monitoring challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/). Exact submission-format rules still require the current central/event guide; the archived DOCX is not authoritative.

- [Moore et al. 2015](https://pubmed.ncbi.nlm.nih.gov/26630198/) supports extrapolating the HR–VO₂ relationship to pre-flight peak HR.
- The relative 80% standard expressly permits direct or indirect measures; maximal confirmation is the team’s proposed workflow, not the only measurement route NASA permits.

Selected source PDFs/text were inspected during the review. They are not redistributed in the project; use the original links above.
