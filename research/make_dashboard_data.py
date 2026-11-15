"""
Данные для одноэкранного приложения: таблица экипажа (Campaign 3, CFT70), ошибки архива, ключевые цифры.
Запуск: python -I make_dashboard_data.py <research/> <src/dashboard_data.js>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

R, out = Path(sys.argv[1]), Path(sys.argv[2])
U = json.loads((R / "results_uncertainty.json").read_text())
RB = json.loads((R / "results_robustness.json").read_text())["rows"]
IS = json.loads((R / "results_mr080g/app_issues.json").read_text())
num = lambda v, d=3: None if v is None or not np.isfinite(float(v)) else round(float(v), d)

# ---------- Campaign 3 ----------
A = pd.read_csv(R / "results_mr080g/c3_aci.csv", dtype={"fdate": str})
CH = pd.read_csv(R / "results_mr080g/c3_change.csv", dtype={"fdate": str})
c3_rows = []
for pid, g in CH.groupby("subject"):
    a = A[A.subject == pid].sort_values("fdate")
    pre = a[a.phase == "PRE_TEST"]
    base, hr_pre = float(g.vo2_pre.iloc[0]), float(g.hr_pre.iloc[0])
    row = {"pid": pid, "base": round(base, 4), "hrPre": round(hr_pre, 1), "pre": [{"date": f, "vo2": num(v, 2), "pct": num(v / base * 100, 1), "aciPct": num(x / base * 100, 1) if pd.notna(x) else None}
                                                                          for f, v, x in zip(pre.fdate, pre.vo2pk, pre.aci)], "cells": {}}
    for _, t in g.iterrows():
        col = "end" if (t.phase == "IN_TEST" or t.br_day <= 1) else "r11"
        notes = []
        if t.phase == "IN_TEST": notes.append(f"Test on bed-rest day {int(t.br_day)} (last day of bed rest)")
        if t.hrpk < hr_pre - 10: notes.append(f"Peak HR {int(t.hrpk)} vs {int(round(hr_pre))} bpm before bed rest: the test may not have been maximal")
        if pd.isna(t.aci): notes.append("ACI not available: fewer than 2 submaximal stages below peak HR in this test")
        cell = {"day": ("BR" + str(int(t.br_day))) if t.phase == "IN_TEST" else f"R+{int(t.br_day)}", "date": t.fdate, "vo2": num(t.vo2pk, 2),
                "meas": num(100 + t.d_meas, 1), "aci": num(100 + t.d_aci_vs_meas, 1) if pd.notna(t.d_aci_vs_meas) else None,
                "hr": int(t.hrpk), "notes": notes}
        row["cells"][col] = cell
    if len(pre) == 2 and pre.vo2pk.max() / pre.vo2pk.min() > 1.25:
        row["baseNote"] = f"Pre-bed-rest tests {pre.vo2pk.iloc[0]:.2f} and {pre.vo2pk.iloc[1]:.2f} L/min differ by >25% — baseline uncertain"
    c3_rows.append(row)
# ступени 1–3 каждого Peak-теста — для экрана астронавта (ACI считается в браузере тем же методом)
ST = pd.read_csv(R / "results_mr080g/c3_stages.csv", dtype={"fdate": str})
ST = ST[ST.test == "Peak"]
for row in c3_rows:
    pid, tests = row["pid"], []
    g = ST[ST.subject == pid]
    pre_dates = [x["date"] for x in row["pre"]]
    for i, f in enumerate(pre_dates):
        tests.append(("pre%d" % (i + 1), f"Pre-flight test {i + 1}", "pre", f))
    for key, c in row["cells"].items():
        tests.append((key, "End of bed rest" if key == "end" else "Recovery", "post", c["date"]))
    out_t = []
    for key, label, kind, f in tests:
        t = g[g.fdate == f]
        if t.empty: continue
        stg = t[t.stage.astype(str).isin(["1", "2", "3"])]
        pk = t[t.stage.astype(str).str.lower() == "peak"]
        day = row["cells"][key]["day"] if kind == "post" else f"BR−{int(t.br_day.iloc[0])}"
        out_t.append({"key": key, "label": label, "kind": kind, "day": day, "date": f,
                      "stages": [{"st": str(r.stage), "w": num(r.W, 0), "hr": num(r.HR, 0), "vo2": num(r.VO2, 2)} for r in stg.itertuples()],
                      "peakVo2": num(pk.VO2.iloc[0], 2) if len(pk) else None, "peakHr": num(pk.HR.iloc[0], 0) if len(pk) else None})
    row["tests"] = out_t
c3_pre_only = int(A[A.phase == "PRE_TEST"].subject.nunique() - len(c3_rows))

# ---------- CFT70 ----------
CF = pd.read_csv(R / "results_mr080g/cft70_change.csv")
cf_rows = []
for pid, g in CF.groupby("subject"):
    row = {"pid": str(pid), "group": {"CONTROL": "Control", "EXERCISE": "Exercise", "FLY": "Flywheel"}[g.group.iloc[0]], "base": round(float(g.vo2_pre.iloc[0]), 2), "cells": {}}
    for _, t in g.iterrows():
        col = "end" if t.visit == "POST1" else "r11"
        notes = [] if t.both_ok else ["Excluded: record failed quality checks (column shift in the source file)"]
        row["cells"][col] = {"day": "R+0/1" if col == "end" else "R+10", "vo2": num(t.vo2, 2), "meas": num(100 + t.d_pct, 1) if t.both_ok else None, "aci": None, "notes": notes}
    cf_rows.append(row)
cfq = pd.read_csv(R / "results_mr080g/cft70_quality_issues.csv")

# ---------- ошибки архива ----------
items = IS["c3"]["items"]
by = lambda pred: sorted({i["file"].replace("MR080G_Campaign_3_", "") for i in items if pred(i)})
pids = lambda pred: sorted({i["pid"] for i in items if pred(i)})
K = []
def add(i, title, evidence, effect, pred=None, files=None, people=None, found="AEROCORE checks"):
    K.append({"id": i, "title": title, "evidence": evidence, "effect": effect, "files": files if files is not None else by(pred),
              "people": people if people is not None else pids(pred), "found": found})
add("swap", "Mass and height swapped", "157, 169 and 175 “kg” in the mass field; mass computed from VO₂ ÷ VO₂/kg equals the “height”", "Wrong VO₂ per kg", lambda i: i["code"] == "MASS_HEIGHT_SWAP")
add("inch", "Height in inches in the cm field", "72, 69.7, 65, 62 = 183, 177, 165, 157.5 cm — the same people’s height in their other files", "Wrong anthropometry", lambda i: i["code"] == "HEIGHT_INCHES")
add("hdr", "File header copied from another visit", "The R+11 file carries the R+0 date and day, but its data differ (rest HR 73 vs 113)", "Same person counted twice at R+0", lambda i: i["code"] == "HEADER_COPIED")
add("date", "File-name date does not match the file", "C3A_5788: name says 9 March, the file, ReadMe and PDF say 9 June (R+1); C3F_5683: one day apart", "Test placed at the wrong time point", lambda i: i["code"] == "FILE_DATE_MISMATCH")
add("type", "File named “Submax” holds a maximal test", "It has a Peak row and the same numbers as the Peak file of that day", "Wrong test type", lambda i: i["code"] == "TEST_TYPE_CONFLICT")
add("rot", "Columns rotated in submaximal tests", "VO₂ sits in the SBP field, SBP in DBP, DBP in RPE, RPE in VO₂ (VO₂/kg confirms the real VO₂)", "Effort rating read as oxygen uptake", lambda i: i["code"] == "UNIT_SUSPECT")
add("watt", "Stage workloads contradict each other", "Stages 50, 50, 100 W with a 75 W peak; HR 139 → 154 → 177", "Wrong heart rate at the reference load", lambda i: i["code"] == "STAGE_W_REPEAT")
add("zero", "Impossible values", "HR 0 and VO₂ 0.0 at a 100 W stage; VCO₂/VO₂ ≠ RER in two rows", "Corrupts the ACI estimate", lambda i: i["code"] == "RER_MISMATCH" or (i["code"] == "OUT_OF_RANGE" and i["field"] in ("heart_rate", "vo2_lmin")))
add("text", "Text in numeric fields", "“150 w”, “200W”, “75 Watts”, “NR”, a repeated header row inside the data", "Values lost or misread", lambda i: i["code"] == "NOT_NUMBER")
add("dup", "Same test stored in two file formats", "Detailed and short summary files of one test", "Test counted twice", files=[f"{IS['c3']['allCounts'].get('DUPLICATE', 0)} duplicate rows"], people=[])
add("cft", "Column shift in CFT70", "Peak HR field holds 2–4; VCO₂/VO₂ ≠ RER", "Wrong peak values", files=["MR080G_CFT70_*_ALL"], people=sorted(map(str, cfq.subject.unique())))
add("readme", "ReadMe template remnants", "An R+1 description keeps the BR−4 date block; “73 °C” is really °F", "Misread metadata", files=["C3A_0224 Submax 050606 ReadMe", "C3B_4023 ReadMe"], people=["C3A_0224", "C3B_4023"], found="Manual review")

# ---------- ключевые цифры ----------
base = RB[0]
saved_pct = [(1 - r["SCR_peak_tests"] / r["REF_peak_tests"]) * 100 for r in RB]
nOk = sum(r["SCR_sens"] >= r["REF_sens"] - 0.5 for r in RB)
S = {"scrPeak": round(base["SCR_peak_tests"], 1), "refPeak": round(base["REF_peak_tests"], 1), "scrSens": round(base["SCR_sens"], 0), "refSens": round(base["REF_sens"], 0),
     "aci1Fa": round(base["ACI1_fa_clear"], 0), "fewerLo": round(min(saved_pct)), "fewerHi": round(max(saved_pct)),
     "nOk": int(nOk), "nScen": len(RB), "comparisonTolerancePp": 0.5, "r": U["c3_change_r"], "noise": U["c3_aci_test_noise_sd"], "declineR0": U["c3_decline_R0_median"],
     "hrpk": U["c3_hrpk_change_median"], "sens": U["c3_decision_sens_vs_measured_baseline"], "spec": U["c3_decision_spec_vs_measured_baseline"],
     "maeAci": U["c3_mae_aci_vs_measured_baseline"], "maeMean": U["c3_mae_groupmean_vs_measured_baseline"], "transferEx": U["transfer_mae_cft70_exercise"],
     "peakTE": U["c3_typical_error_pct"], "protocol": {k: {"sens": round(base[k + "_sens"], 1), "fa": round(base[k + "_fa_clear"], 1), "peak": round(base[k + "_peak_tests"], 1)} for k in ("REF", "ACI1", "ACI2", "SCR")},
     "files": IS["c3"]["files"] + 5, "rows": IS["c3"]["rows"]}

D = {"summary": S, "archive": K,
     "datasets": {
         "c3": {"label": "NASA LSDA MR080G — Campaign 3 (60–90-day bed rest)", "short": "Campaign 3", "source": "NASA LSDA MR080G, Campaign 3 · DOI 10.83263/w056-8t76",
                "cols": [{"key": "end", "label": "End of bed rest", "sub": "R+0 / R+1"}, {"key": "r11", "label": "Recovery", "sub": "R+8 – R+11"}],
                "hasAci": True, "rows": c3_rows, "hidden": f"{c3_pre_only} participants with tests only before bed rest are not shown."},
         "cft70": {"label": "NASA LSDA MR080G — CFT70 (70-day bed rest, exercise vs control)", "short": "CFT70", "source": "NASA LSDA MR080G, CFT70 · DOI 10.83263/w056-8t76",
                   "cols": [{"key": "end", "label": "End of bed rest", "sub": "R+0 / R+1"}, {"key": "r11", "label": "Recovery", "sub": "R+10"}],
                   "hasAci": False, "rows": cf_rows, "hidden": "CFT70 files hold peak values only, so ACI cannot be computed."}}}
out.write_text("window.AEROCORE_DATA = " + json.dumps(D, ensure_ascii=False) + ";\n")
print(out, out.stat().st_size // 1024, "KB;", len(c3_rows), "C3 rows,", len(cf_rows), "CFT70 rows;", [(k["id"], len(k["files"]), len(k["people"])) for k in K])
