"""
Шаг 1b. ACI на реальных данных NASA (MR080G, Campaign 3, постельный режим 60–90 сут).
Peak-тест начинается с трёх 3-минутных ступеней (≈ стационарные, как PFE) — по ним считаем ACI,
экстраполируя связь ЧСС–VO₂ до ЧСС пика ДО постельного режима (метод NASA, Moore 2015).
Сравниваем с измеренным VO₂pk того же теста и с изменением VO₂pk после постельного режима.
Запуск: python -I mr080g_aci.py <папка результата разбора>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

d = Path(sys.argv[1])
T = pd.read_csv(d / "c3_stages.csv")
T["stage"] = T["stage"].astype(str).str.strip()
P = pd.read_csv(d / "c3_tests.csv", dtype={"fdate": str})
P = P[P.test == "Peak"].copy()
log = {}

# --- Data Trust: проверки отдельных тестов ---
P["mass_flag"] = P.groupby("subject")["mass"].transform(lambda s: (s - s.median()).abs() / s.median() > 0.07)
P["submax_ok"] = P["n_ex_stages"] >= 3
log["peak_tests"] = int(len(P))
log["mass_outliers"] = P.loc[P.mass_flag, ["subject", "fdate", "mass"]].values.tolist()

def aci_for(subj, fdate, hr_ref):
    g = T[(T.subject == subj) & (T.test == "Peak") & (T.fdate.astype(str).str.zfill(6) == fdate)]
    st = g[g.stage.isin(["1", "2", "3"])].dropna(subset=["HR", "VO2"])
    st = st[st.HR.between(30, 230) & st.VO2.between(0.1, 7)]   # нули и невозможные значения (C3G_9032 R+11: ЧСС 0, VO₂ 0,0)
    st = st[st.HR < hr_ref - 3]            # ступени, не достигшие пика
    if len(st) < 2 or st.HR.max() - st.HR.min() < 10:
        return None, None
    b, a = np.polyfit(st.VO2, st.HR, 1)
    if b <= 0:
        return None, None
    return (hr_ref - a) / b, st.HR.max() / hr_ref

rows = []
for subj, g in P.sort_values("date").groupby("subject"):
    pre = g[g.phase == "PRE_TEST"]
    post = g[g.phase.isin(["POST_TEST", "IN_TEST"])]
    if pre.empty:
        continue
    hr_pre = pre.hrpk.mean()
    vo2_pre = pre.vo2pk.mean()
    for _, t in g.iterrows():
        aci, top = aci_for(subj, t.fdate, hr_pre)
        rows.append({"subject": subj, "fdate": t.fdate, "phase": t.phase, "br_day": t.br_day, "vo2pk": t.vo2pk, "hrpk": t.hrpk,
                     "vo2_pre": vo2_pre, "hr_pre": hr_pre, "n_pre": len(pre), "aci": aci, "top_hr_frac": top, "mass": t.mass})
R = pd.DataFrame(rows)
R["err_pct"] = (R.aci - R.vo2pk) / R.vo2pk * 100
R.to_csv(d / "c3_aci.csv", index=False)

def summ(e):
    e = e.dropna()
    return {"n": int(len(e)), "median": float(e.median()), "mean": float(e.mean()), "sd": float(e.std(ddof=1)),
            "p2_5": float(e.quantile(.025)), "p97_5": float(e.quantile(.975)), "within10": float((e.abs() <= 10).mean() * 100)}

log["A_pre"] = summ(R[R.phase == "PRE_TEST"].err_pct)
log["A_post"] = summ(R[R.phase != "PRE_TEST"].err_pct)

# --- B. Изменение после постельного режима: измерено vs ACI ---
pre_aci = R[R.phase == "PRE_TEST"].groupby("subject").aci.mean().rename("aci_pre")
Q = R[R.phase != "PRE_TEST"].join(pre_aci, on="subject")
Q["d_meas"] = (Q.vo2pk / Q.vo2_pre - 1) * 100
Q["d_aci_vs_aci"] = (Q.aci / Q.aci_pre - 1) * 100            # ACI после / ACI до
Q["d_aci_vs_meas"] = (Q.aci / Q.vo2_pre - 1) * 100           # ACI после / измеренный VO₂pk до
Q["d_hrmax"] = Q.hrpk - Q.hr_pre
Q = Q.dropna(subset=["d_meas"])
Q.to_csv(d / "c3_change.csv", index=False)
# группы по дню восстановления — только POST_TEST (тест на 90-е сутки постельного режима C3D_7984 сюда не входит)
QP = Q[Q.phase == "POST_TEST"]
log["measured_change"] = {"R0": summ(QP[QP.br_day <= 1].d_meas), "R11": summ(QP[QP.br_day >= 8].d_meas),
                          "R0_subjects": int(QP[QP.br_day <= 1].subject.nunique()), "R11_subjects": int(QP[QP.br_day >= 8].subject.nunique())}
log["hrmax_change_bpm"] = summ(Q.d_hrmax)
qq = Q.dropna(subset=["d_aci_vs_aci"])
log["change_error"] = {"aci_vs_aci": summ(qq.d_aci_vs_aci - qq.d_meas), "aci_vs_meas": summ(qq.d_aci_vs_meas - qq.d_meas)}
log["r_change"] = float(np.corrcoef(qq.d_meas, qq.d_aci_vs_aci)[0, 1]) if len(qq) > 2 else None
# решение по стандарту NASA [V1 4003]: ниже 80% исходного
dec = []
for col in ("d_aci_vs_aci", "d_aci_vs_meas"):
    eligible = Q.dropna(subset=["d_meas", col])
    t = eligible.d_meas < -20
    f = eligible[col] < -20
    dec.append({"method": col, "true_below80": int(t.sum()), "tp": int((t & f).sum()), "fn": int((t & ~f).sum()),
                "fp": int((~t & f).sum()), "tn": int((~t & ~f).sum()), "n_tests": len(eligible), "n_subjects": int(eligible.subject.nunique())})
log["nasa80_decision"] = dec
log["subjects_with_change"] = int(qq.subject.nunique())
(d / "c3_summary.json").write_text(json.dumps(log, indent=2, ensure_ascii=False, default=str))
print(json.dumps(log, indent=1, ensure_ascii=False, default=str))
print(qq[["subject", "br_day", "vo2_pre", "vo2pk", "aci_pre", "aci", "d_meas", "d_aci_vs_aci", "d_aci_vs_meas", "hr_pre", "hrpk", "top_hr_frac"]].round(2).to_string())
