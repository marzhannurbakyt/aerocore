"""
Сводка по тестам MR080G Campaign 3: VO₂pk, ЧСС пика, критерии NASA, ACI.
ACI (Moore 2015): регрессия ЧСС по VO₂ по субмаксимальным ступеням, VO₂ при ЧСС пика ДО постельного режима.
Запуск: python -I mr080g_tests.py <папка результата разбора>
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

d = Path(sys.argv[1])
T = pd.read_csv(d / "c3_stages.csv")
T["stage"] = T["stage"].astype(str).str.strip()

def stage_kind(s):
    s = s.lower()
    if s == "peak": return "peak"
    if s in ("seated rest", "rest"): return "rest"
    if s.startswith("recov") or s.startswith("cd"): return "recovery"
    return "ex"

T["kind"] = T["stage"].map(stage_kind)
rows = []
for (subj, test, fdate), g in T.groupby(["subject", "test", "fdate"]):
    ex = g[g["kind"] == "ex"].dropna(subset=["HR", "VO2"])
    ex = ex[ex.HR.between(30, 230) & ex.VO2.between(0.1, 7)]   # нули и невозможные значения не используются
    pkrow = g[g["kind"] == "peak"]
    r = {"subject": subj, "test": test, "fdate": str(fdate).zfill(6), "phase": g["phase"].iloc[0], "br_day": g["br_day"].iloc[0],
         "age": g["age"].dropna().iloc[0] if g["age"].notna().any() else np.nan,
         "mass": g["mass"].dropna().iloc[0] if g["mass"].notna().any() else np.nan, "n_ex_stages": len(ex)}
    if test == "Peak":
        allv = pd.concat([ex, pkrow.dropna(subset=["VO2"])])
        if allv.empty: continue
        # VO₂pk = строка «Peak» лаборатории NASA (официальное значение пика); если её нет — максимум по ступеням.
        # В 4 подробных файлах короткая последняя ступень на 0,02–0,05 л/мин выше строки Peak — берём строку Peak,
        # чтобы результат не зависел от того, какой из двух файлов одного теста выбран.
        pkv = pkrow.dropna(subset=["VO2"])
        i = pkv["VO2"].idxmax() if len(pkv) else allv["VO2"].idxmax()
        r.update(vo2pk=g.loc[i, "VO2"], hrpk=pd.concat([ex["HR"], pkrow["HR"]]).max(), rer_pk=allv.loc[i, "RER"] if "RER" in allv else np.nan,
                 rpe_pk=pd.concat([ex["RPE"], pkrow["RPE"]]).max() if "RPE" in g else np.nan, w_pk=allv["W"].max())
    rows.append(r)
P = pd.DataFrame(rows)
P["date"] = pd.to_datetime(P["fdate"], format="%y%m%d")
P.to_csv(d / "c3_tests.csv", index=False)
print(P.sort_values(["subject", "date"]).to_string())
