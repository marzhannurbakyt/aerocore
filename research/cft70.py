"""
CFT70 (70 сут постельного режима, NASA): реальное изменение VO₂pk по группам и качество записей.
Запуск: python -I cft70.py <папка MR080G_CFT70> <папка результата>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
fr = {}
for k in ("PRE", "POST1", "POST2"):
    d = pd.read_csv(src / f"MR080G_CFT70_{k}_ALL", encoding="utf-8-sig")
    d.columns = [c.strip().upper() for c in d.columns]
    d["visit"] = k
    fr[k] = d
A = pd.concat(fr.values(), ignore_index=True)
for c in ("HRPK", "VO2PK", "VCO2PK", "RERPK", "RPEPK", "AGE", "WEIGHT", "MAX WKLD"):
    A[c] = pd.to_numeric(A[c], errors="coerce")
A["GROUP"] = A["GROUP"].str.strip().str.upper()

# --- Проверка качества: ЧСС пика вне 30–230 и согласованность VCO₂/VO₂ с RER ---
issues = []
bad_hr = A[(A.HRPK < 30) | (A.HRPK > 230)]
for _, r in bad_hr.iterrows():
    issues.append({"subject": int(r.SUBJECT), "visit": r.visit, "issue": f"HRPK = {r.HRPK} вне 30–230 (вероятен сдвиг столбцов; MAX WKLD = {r['MAX WKLD']})"})
rer_calc = A.VCO2PK / A.VO2PK
bad_rer = A[(rer_calc - A.RERPK).abs() > 0.05]
for _, r in bad_rer.iterrows():
    issues.append({"subject": int(r.SUBJECT), "visit": r.visit, "issue": f"VCO2/VO2 = {r.VCO2PK / r.VO2PK:.2f} ≠ RER {r.RERPK}"})
A["row_ok"] = ~A.index.isin(bad_hr.index) & ~A.index.isin(bad_rer.index)
# критерии максимальности NASA (доступны RER, ЧСС+возраст, RPE): опровергнут, если не выполнено ≥ 2
A["c_rer"] = A.RERPK >= 1.10
A["c_hr"] = A.HRPK >= 207 - 0.67 * A.AGE - 10
A["c_rpe"] = A.RPEPK >= 19
A["n_fail"] = (~A[["c_rer", "c_hr", "c_rpe"]]).sum(axis=1) - A[["RERPK", "HRPK", "RPEPK"]].isna().sum(axis=1)
A["maximal"] = A.n_fail < 2
pd.DataFrame(issues).to_csv(out / "cft70_quality_issues.csv", index=False)

# --- Изменение VO₂pk относительно PRE ---
pre = A[A.visit == "PRE"].set_index("SUBJECT")
rows = []
for _, r in A[A.visit != "PRE"].iterrows():
    if r.SUBJECT not in pre.index: continue
    p = pre.loc[r.SUBJECT]
    rows.append({"subject": int(r.SUBJECT), "group": r.GROUP, "visit": r.visit, "br_day": r["BR DAY"],
                 "vo2_pre": p.VO2PK, "vo2": r.VO2PK, "d_pct": (r.VO2PK / p.VO2PK - 1) * 100,
                 "hr_pre": p.HRPK, "hr": r.HRPK, "both_ok": bool(p.row_ok and r.row_ok), "both_max": bool(p.maximal and r.maximal),
                 "termination": r.TERMINATION})
C = pd.DataFrame(rows)
C["d_hr"] = C.hr - C.hr_pre
C.to_csv(out / "cft70_change.csv", index=False)
ok = C[C.both_ok]
def s(x):
    x = x.dropna()
    return {"n": int(len(x)), "median": round(float(x.median()), 1), "mean": round(float(x.mean()), 1), "sd": round(float(x.std(ddof=1)), 1),
            "min": round(float(x.min()), 1), "max": round(float(x.max()), 1)} if len(x) else None
res = {"rows": int(len(A)), "quality_issues": len(issues), "nonmaximal_tests": int((~A.maximal).sum()),
       "change": {f"{g}|{v}": {**s(d.d_pct), "below80": int((d.d_pct < -20).sum()), "loss_gt10": int((d.d_pct < -10).sum())}
                  for (g, v), d in ok.groupby(["group", "visit"])},
       "hrpk_change_bpm": {v: s(d.d_hr) for v, d in ok.groupby("visit")}}
(out / "cft70_summary.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
print(json.dumps(res, indent=1, ensure_ascii=False))
print(pd.DataFrame(issues).to_string())
