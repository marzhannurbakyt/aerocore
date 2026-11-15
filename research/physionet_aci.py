"""
Шаг 1. Насколько точен метод NASA ACI на реальных людях (PhysioNet, Малага, 992 теста).

ACI (Moore et al. 2015): регрессия ЧСС по VO₂ на субмаксимальной части теста,
VO₂ при «известной» ЧСС пика. Сравниваем с измеренным VO₂max того же теста.

Анализы:
  A. Поперечный: ЧСС пика из того же теста (оптимистичный вариант) и по возрасту (без предварительного max-теста).
  B. Продольный (как у NASA): ЧСС пика из ПЕРВОГО теста человека, ACI на последующих тестах.
     Проверяем, отслеживает ли ACI изменение VO₂max (rmcorr, согласие решений).
  C. Влияние высоты верхней субмаксимальной ступени (75% / 80% / 85% ЧСС пика) на ошибку.
Запуск: python -I physionet_aci.py <папка с subject-info.csv и test_measure.csv> <папка для результатов>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

info = pd.read_csv(src / "subject-info.csv")
m = pd.read_csv(src / "test_measure.csv")
log = {"tests_total": int(info.shape[0]), "rows": int(m.shape[0])}

# --- 15-секундные интервалы: сглаживание дыхательного шума ---
m = m.dropna(subset=["HR", "VO2", "VCO2"])
m["bin"] = (m["time"] // 15).astype(int)
b = m.groupby(["ID_test", "bin"], as_index=False).agg(t=("time", "mean"), HR=("HR", "mean"), VO2=("VO2", "mean"), VCO2=("VCO2", "mean"), speed=("Speed", "mean"))
b = b.sort_values(["ID_test", "bin"])

def peak_values(g):
    """VO₂max — максимум скользящего 30-с среднего (2 интервала); ЧСС пика — максимум 15-с интервала."""
    v = g["VO2"].rolling(2, min_periods=2).mean()
    i = v.idxmax()
    if pd.isna(i):
        return None
    vco = g["VCO2"].rolling(2, min_periods=2).mean()[i]
    return {"vo2max": v[i] / 1000.0, "rer_peak": vco / v[i], "hrmax": g["HR"].max(), "t_peak": g.loc[i, "t"], "duration": g["t"].max()}

peaks = {k: peak_values(g) for k, g in b.groupby("ID_test")}
pk = pd.DataFrame([dict(ID_test=k, **v) for k, v in peaks.items() if v]).merge(info, on="ID_test")
log["tests_with_gas"] = int(pk.shape[0])

# --- Отбор: взрослые, критерии максимального теста (NASA: RER ≥ 1,10; ЧСС ≥ 207 − 0,67·возраст − 10) ---
pk["hr_pred"] = 207 - 0.67 * pk["Age"]
pk["crit_rer"] = pk["rer_peak"] >= 1.10
pk["crit_hr"] = pk["hrmax"] >= pk["hr_pred"] - 10
pk["adult"] = pk["Age"] >= 18
pk["valid"] = pk["adult"] & pk["crit_rer"] & pk["crit_hr"] & (pk["duration"] >= 360)
log["adults"] = int(pk["adult"].sum())
log["adults_rer_ok"] = int((pk["adult"] & pk["crit_rer"]).sum())
log["valid_max_tests"] = int(pk["valid"].sum())

def aci(g, hr_ref, upper=0.85, lower=0.60):
    """ACI: ЧСС = a + b·VO₂ на нарастающей части теста, пока ЧСС не превысит upper·hr_ref; экстраполяция до hr_ref.
    Восстановление после пика исключено: там ЧСС высокая, а VO₂ уже падает."""
    g = g[g["t"] > 60]
    over = g.index[g["HR"] > upper * hr_ref]
    if len(over):
        g = g.loc[: over[0]].iloc[:-1]          # всё до первого превышения верхней границы
    s = g[g["HR"] >= lower * hr_ref]
    if s.shape[0] < 4 or s["HR"].max() - s["HR"].min() < 15:
        return None
    x, y = s["VO2"].values / 1000.0, s["HR"].values
    bslope, a = np.polyfit(x, y, 1)
    if bslope <= 0:
        return None
    r2 = np.corrcoef(x, y)[0, 1] ** 2
    return {"aci": (hr_ref - a) / bslope, "n_pts": int(s.shape[0]), "r2": float(r2), "top_hr_frac": float(s["HR"].max() / hr_ref)}

def agreement(est, meas):
    d = (est - meas) / meas * 100
    return {"n": int(len(d)), "bias_pct": float(d.mean()), "sd_pct": float(d.std(ddof=1)),
            "loa_pct": [float(d.mean() - 1.96 * d.std(ddof=1)), float(d.mean() + 1.96 * d.std(ddof=1))],
            "mape": float(d.abs().mean()), "r": float(np.corrcoef(est, meas)[0, 1]),
            "within_10pct": float((d.abs() <= 10).mean() * 100)}

bins = dict(tuple(b.groupby("ID_test")))
valid = pk[pk["valid"]].copy()

# --- A. Поперечный анализ ---
rowsA = []
for _, r in valid.iterrows():
    g = bins[r["ID_test"]]
    for mode, href in [("hrmax_measured", r["hrmax"]), ("hrmax_age", r["hr_pred"])]:
        for up in (0.75, 0.80, 0.85):
            res = aci(g, href, upper=up)
            if res:
                rowsA.append({"ID_test": r["ID_test"], "ID": r["ID"], "age": r["Age"], "sex": r["Sex"], "mode": mode, "upper": up, "vo2max": r["vo2max"], **res})
A = pd.DataFrame(rowsA)
A.to_csv(out / "A_cross_sectional.csv", index=False)
resA = {}
for (mode, up), g in A.groupby(["mode", "upper"]):
    resA[f"{mode}@{up}"] = agreement(g["aci"], g["vo2max"])
log["A"] = resA

# --- B. Продольный анализ (метод NASA): ЧСС пика из первого теста ---
valid["order"] = valid["ID_test"].str.split("_").str[1].astype(int)
rowsB = []
for pid, g in valid.sort_values(["ID", "order"]).groupby("ID"):
    if g.shape[0] < 2:
        continue
    first = g.iloc[0]
    href = first["hrmax"]
    base_aci = aci(bins[first["ID_test"]], href)
    if not base_aci:
        continue
    for _, r in g.iloc[1:].iterrows():
        res = aci(bins[r["ID_test"]], href)
        if not res:
            continue
        rowsB.append({"ID": pid, "ID_test": r["ID_test"], "age": r["Age"], "dt_years": r["Age"] - first["Age"],
                      "vo2_base": first["vo2max"], "vo2": r["vo2max"], "aci_base": base_aci["aci"], "aci": res["aci"],
                      "hrmax_first": href, "hrmax_now": r["hrmax"]})
B = pd.DataFrame(rowsB)
if not B.empty:
    B["d_meas"] = (B["vo2"] - B["vo2_base"]) / B["vo2_base"] * 100
    B["d_aci"] = (B["aci"] - B["aci_base"]) / B["aci_base"] * 100
    B["d_hrmax"] = B["hrmax_now"] - B["hrmax_first"]
    B.to_csv(out / "B_longitudinal.csv", index=False)

    def rmcorr(df, x, y, g="ID"):
        d = df.copy()
        d["xc"] = d[x] - d.groupby(g)[x].transform("mean")
        d["yc"] = d[y] - d.groupby(g)[y].transform("mean")
        k = d[g].nunique()
        dfree = len(d) - k - 1
        r = float(np.corrcoef(d["xc"], d["yc"])[0, 1]) if dfree > 2 else None
        return {"r": r, "df": int(dfree)}

    # корреляция изменений: у большинства по одной паре, поэтому и обычная r по первой паре каждого
    firstpair = B.groupby("ID").head(1)
    diff = B["d_aci"] - B["d_meas"]
    resB = {
        "pairs": int(len(B)), "people": int(B["ID"].nunique()),
        "median_years_between": float(B["dt_years"].median()),
        "r_change_firstpair": float(np.corrcoef(firstpair["d_meas"], firstpair["d_aci"])[0, 1]),
        "n_firstpair": int(len(firstpair)),
        "rmcorr_change": rmcorr(B, "d_meas", "d_aci") if B.groupby("ID").size().max() > 1 else None,
        "change_error_sd_pct": float(diff.std(ddof=1)), "change_error_bias_pct": float(diff.mean()),
        "change_loa_pct": [float(diff.mean() - 1.96 * diff.std(ddof=1)), float(diff.mean() + 1.96 * diff.std(ddof=1))],
        "hrmax_change_sd_bpm": float(B["d_hrmax"].std(ddof=1)), "hrmax_change_mean_bpm": float(B["d_hrmax"].mean()),
        "meas_change_sd_pct": float(B["d_meas"].std(ddof=1)),
    }
    # согласие решений «снижение ≥ 10%» и «≥ 20%» (стандарт NASA)
    for thr in (5, 10, 20):
        true_dec = B["d_meas"] <= -thr
        flag = B["d_aci"] <= -thr
        tp, fn, fp = int((true_dec & flag).sum()), int((true_dec & ~flag).sum()), int((~true_dec & flag).sum())
        tn = int((~true_dec & ~flag).sum())
        resB[f"decision_{thr}"] = {"true_declines": int(true_dec.sum()), "tp": tp, "fn": fn, "fp": fp, "tn": tn,
                                   "sens": tp / (tp + fn) * 100 if tp + fn else None, "spec": tn / (tn + fp) * 100 if tn + fp else None}
    log["B"] = resB

# --- C. Ошибка ACI в зависимости от того, насколько ступени не доходят до пика ---
Am = A[A["mode"] == "hrmax_measured"].copy()
Am["err_pct"] = (Am["aci"] - Am["vo2max"]) / Am["vo2max"] * 100
log["C"] = {f"{up}": {"sd_pct": float(g["err_pct"].std(ddof=1)), "mape": float(g["err_pct"].abs().mean()), "n": int(len(g))} for up, g in Am.groupby("upper")}
# связь ошибки с качеством линейной аппроксимации
g85 = Am[Am["upper"] == 0.85]
log["C"]["r2_median"] = float(g85["r2"].median())
log["C"]["err_vs_r2_corr"] = float(np.corrcoef(g85["r2"], g85["err_pct"].abs())[0, 1])

(out / "summary.json").write_text(json.dumps(log, indent=2, ensure_ascii=False))
print(json.dumps(log, indent=2, ensure_ascii=False))
