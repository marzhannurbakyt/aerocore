"""Собирает src/findings.js — результаты анализа данных NASA и PhysioNet для страницы приложения."""
import json
import sys
from pathlib import Path

import pandas as pd

res, outjs = Path(sys.argv[1]), Path(sys.argv[2])
c3 = json.loads((res / "results_mr080g/c3_summary.json").read_text())
cft = json.loads((res / "results_mr080g/cft70_summary.json").read_text())
ph = json.loads((res / "results_physionet/summary.json").read_text())
ch = pd.read_csv(res / "results_mr080g/c3_change.csv").dropna(subset=["d_aci_vs_aci"])
cf = pd.read_csv(res / "results_mr080g/cft70_change.csv")
cf = cf[cf.both_ok]
def baseline_flips():
    """Выбор исходного теста: первый или второй тест до режима — сколько решений «ниже 80%» меняется.
    Те же исключения, что для эффекта привыкания (C3A_5788, C3E_6607)."""
    P = pd.read_csv(res / "results_mr080g/c3_tests.csv", dtype={"fdate": str}); P = P[P.test == "Peak"].copy()
    P["date"] = pd.to_datetime(P.fdate, format="%y%m%d")
    n = k = 0
    for s_, g in P.sort_values("date").groupby("subject"):
        pre, post = g[g.phase == "PRE_TEST"], g[g.phase != "PRE_TEST"]
        if s_ in ("C3A_5788", "C3E_6607") or len(pre) < 2 or post.empty: continue
        for v in post.vo2pk:
            n += 1; k += (v / pre.vo2pk.iloc[0] < 0.8) != (v / pre.vo2pk.iloc[-1] < 0.8)
    return {"reclass": int(k), "of": int(n)}

F = {
    "c3": {"aci_pre": c3["A_pre"], "aci_post": c3["A_post"], "measured_change": c3["measured_change"], "hrmax_change": c3["hrmax_change_bpm"],
           "change_error": c3["change_error"]["aci_vs_aci"], "r_change": c3["r_change"], "decision": c3["nasa80_decision"],
           "subjects": c3["subjects_with_change"],
           "pairs": ch[["subject", "br_day", "d_meas", "d_aci_vs_aci", "hr_pre", "hrpk"]].round(2).to_dict("records")},
    "learning": {"n": 21, "cft70_n": 10, "cft70_mean_pct": 0.1, **baseline_flips()},
    "cft70": {"change": cft["change"], "hrpk": cft["hrpk_change_bpm"], "quality_issues": cft["quality_issues"],
              "points": cf[["group", "visit", "d_pct"]].round(1).to_dict("records")},

    "ci": json.loads((res / "results_uncertainty.json").read_text()),
    "robust": json.loads((res / "results_robustness.json").read_text()),
    "physionet": {"valid": ph["valid_max_tests"], "A": {k: ph["A"][k] for k in ph["A"] if k.startswith("hrmax_measured")}, "B": ph["B"]},
}
# В приложение — только английские тексты
for r in F["robust"]["rows"]: r.pop("ru", None)
F["ci"]["c3_learning_excluded"] = ["C3A_5788 (test 2 not maximal: RER 0.95, HR 120)", "C3E_6607 (test 1: 2.59 L/min at 300 W vs 3.29 at 150 W — inconsistent record)"]
outjs.write_text("window.AEROCORE_FINDINGS = " + json.dumps(F, ensure_ascii=False) + ";\n")
print(outjs, outjs.stat().st_size // 1024, "КБ")
