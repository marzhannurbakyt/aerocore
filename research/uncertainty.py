"""
Шаг 5. Неопределённость ключевых цифр: бутстреп с пересэмплированием УЧАСТНИКОВ (повторные тесты одного
человека не независимы), 95% процентильные интервалы; для долей CFT70 (одно наблюдение
на человека) — интервал Уилсона; для повторных тестов Campaign 3 — кластерный бутстреп.
Запуск: python -I uncertainty.py <research/>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

R = Path(sys.argv[1]); rng = np.random.default_rng(42); B = 3000
out = {}

def boot(df, fn, group="subject"):
    """Кластерный бутстреп: пересэмплируем участников (индексы строк), а не отдельные тесты."""
    df = df.reset_index(drop=True)
    ids = df[group].unique()
    if len(ids) == 0:
        raise ValueError("Cannot bootstrap an empty participant sample")
    rows_of = [np.flatnonzero(df[group].values == i) for i in ids]
    vals = []
    for _ in range(B):
        pick = rng.integers(0, len(ids), len(ids))
        idx = np.concatenate([rows_of[j] for j in pick])
        try: vals.append(fn(df.iloc[idx]))
        except Exception: pass
    vals = np.array([v for v in vals if v is not None and np.isfinite(v)])
    if len(vals) == 0:
        raise ValueError("No finite bootstrap replicates")
    return {"est": float(fn(df)), "lo": float(np.percentile(vals, 2.5)), "hi": float(np.percentile(vals, 97.5)), "n_obs": int(len(df)), "n_subj": int(len(ids))}

def wilson(k, n):
    if n == 0: return None
    lo, hi = stats.binomtest(k, n).proportion_ci(method="wilson")
    return {"k": int(k), "n": int(n), "est": k / n * 100, "lo": lo * 100, "hi": hi * 100}

def clustered_decision(df, flag_fn, sensitivity=True):
    """Test-level proportion, with participant clustering in its interval."""
    def counts(d):
        true = d.d_meas.to_numpy() < -20
        flag = np.asarray(flag_fn(d), dtype=bool)
        eligible = true if sensitivity else ~true
        correct = flag if sensitivity else ~flag
        return int((eligible & correct).sum()), int(eligible.sum())
    k, n = counts(df)
    result = boot(df, lambda d: (lambda a, b: a / b * 100 if b else None)(*counts(d)))
    result.update(k=k, n=n, interval_method="Participant-cluster percentile bootstrap; test-level proportion")
    return result

# --- MR080G Campaign 3 ---
ch = pd.read_csv(R / "results_mr080g/c3_change.csv")
aci = pd.read_csv(R / "results_mr080g/c3_aci.csv")
out["c3_decline_R0_median"] = boot(ch[(ch.phase == "POST_TEST") & (ch.br_day <= 1)], lambda d: d.d_meas.median())
out["c3_decline_R11_median"] = boot(ch[(ch.phase == "POST_TEST") & (ch.br_day >= 8)], lambda d: d.d_meas.median())
out["c3_hrpk_change_median"] = boot(ch, lambda d: d.d_hrmax.median())
pre = aci[aci.phase == "PRE_TEST"].dropna(subset=["err_pct"])
out["c3_aci_error_pre_median"] = boot(pre, lambda d: d.err_pct.median())
out["c3_aci_within10_pre"] = boot(pre, lambda d: (d.err_pct.abs() <= 10).mean() * 100)
cc = ch.dropna(subset=["d_aci_vs_aci"]).copy()
cc["err"] = cc.d_aci_vs_aci - cc.d_meas
out["c3_change_r"] = boot(cc, lambda d: np.corrcoef(d.d_meas, d.d_aci_vs_aci)[0, 1])
out["c3_change_within10"] = boot(cc, lambda d: (d.err.abs() <= 10).mean() * 100)
out["c3_change_error_sd"] = boot(cc, lambda d: d.err.std(ddof=1))
out["c3_aci_test_noise_sd"] = boot(cc, lambda d: d.err.std(ddof=1) / np.sqrt(2))
t = cc.d_meas < -20
for col, name in (("d_aci_vs_meas", "vs_measured_baseline"), ("d_aci_vs_aci", "vs_aci_baseline")):
    eligible = ch.dropna(subset=["d_meas", col])
    out[f"c3_decision_sens_{name}"] = clustered_decision(eligible, lambda d: d[col] < -20)
    out[f"c3_decision_spec_{name}"] = clustered_decision(eligible, lambda d: d[col] < -20, sensitivity=False)

# --- простой базовый вариант: «каждый теряет столько же, сколько в среднем остальные участники» ---
# Среднее берётся по ДРУГИМ участникам в той же точке восстановления (конец режима / R+8…11), без самого человека.
cc["grp"] = np.where((cc.phase == "IN_TEST") | (cc.br_day <= 1), "early", "late")
def loo_mean(d):
    # Exclude every observation of the held-out participant, including all copies
    # of that participant selected by a cluster-bootstrap draw.
    total_sum = d.groupby("grp").d_meas.transform("sum").to_numpy()
    total_n = d.groupby("grp").d_meas.transform("count").to_numpy()
    own_sum = d.groupby(["grp", "subject"]).d_meas.transform("sum").to_numpy()
    own_n = d.groupby(["grp", "subject"]).d_meas.transform("count").to_numpy()
    denom = total_n - own_n
    return np.divide(total_sum - own_sum, denom, out=np.full(len(d), np.nan), where=denom > 0)
def mae_pair(d, col):
    m = loo_mean(d); ok = ~np.isnan(m)
    return np.abs(d[col].values - d.d_meas.values)[ok].mean(), np.abs(m - d.d_meas.values)[ok].mean()
for col, name in (("d_aci_vs_aci", "vs_aci_baseline"), ("d_aci_vs_meas", "vs_measured_baseline")):
    dd = cc.dropna(subset=[col])
    out[f"c3_mae_aci_{name}"] = boot(dd, lambda d: mae_pair(d, col)[0])
    out[f"c3_mae_groupmean_{name}"] = boot(dd, lambda d: mae_pair(d, col)[1])
    out[f"c3_mae_diff_{name}"] = boot(dd, lambda d: float(np.subtract(*mae_pair(d, col))))
# решение «ниже 80%» по среднему группы: всем в одной точке — один и тот же ответ
gm = loo_mean(cc); fg = gm < -20
out["c3_decision_sens_groupmean"] = clustered_decision(cc, lambda d: loo_mean(d) < -20)
out["c3_decision_spec_groupmean"] = clustered_decision(cc, lambda d: loo_mean(d) < -20, sensitivity=False)

# эффект привыкания: пары тестов до режима
P = pd.read_csv(R / "results_mr080g/c3_tests.csv", dtype={"fdate": str}); P = P[(P.test == "Peak") & (P.phase == "PRE_TEST")]
P["date"] = pd.to_datetime(P.fdate, format="%y%m%d")
pairs = []
for s, g in P.sort_values("date").groupby("subject"):
    if len(g) == 2 and s not in ("C3A_5788", "C3E_6607"):
        pairs.append({"subject": s, "d": (g.vo2pk.iloc[1] / g.vo2pk.iloc[0] - 1) * 100, "lr": np.log(g.vo2pk.iloc[1] / g.vo2pk.iloc[0])})
L = pd.DataFrame(pairs)
out["c3_learning_mean"] = boot(L, lambda d: d.d.mean())
out["c3_learning_p"] = float(stats.ttest_1samp(L.d, 0).pvalue)
out["c3_typical_error_pct"] = boot(L, lambda d: (np.exp(d.lr.std(ddof=1) / np.sqrt(2)) - 1) * 100)
out["c3_learning_excluded"] = ["C3A_5788 (тест 2 не максимальный: RER 0,95, ЧСС 120)", "C3E_6607 (тест 1: 2,59 л/мин при 300 Вт против 3,29 при 150 Вт — несогласованная запись)"]

# --- CFT70 ---
cf = pd.read_csv(R / "results_mr080g/cft70_change.csv"); cf = cf[cf.both_ok]
for g in ("CONTROL", "EXERCISE", "FLY"):
    for v in ("POST1", "POST2"):
        d = cf[(cf.group == g) & (cf.visit == v)]
        if len(d) < 3: continue
        out[f"cft70_{g}_{v}_median"] = boot(d, lambda x: x.d_pct.median())
        out[f"cft70_{g}_{v}_below80"] = wilson(int((d.d_pct < -20).sum()), len(d))
out["cft70_hrpk_change_median"] = boot(cf, lambda d: d.d_hr.median())
ctl, ex = cf[(cf.group == "CONTROL") & (cf.visit == "POST1")].d_pct, cf[(cf.group != "CONTROL") & (cf.visit == "POST1")].d_pct
out["cft70_control_vs_exercise_p"] = float(stats.mannwhitneyu(ctl, ex).pvalue)
out["cft70_control_vs_exercise_p_method"] = "Two-sided Mann–Whitney U of continuous change: CONTROL (n=8) versus pooled EXERCISE+FLY (n=26), POST1; not a categorical 5/8 versus 0/18 comparison."
# Перенос «среднего по группе» на другие условия: среднее падение Campaign 3 к концу режима (без контрмер)
# применяем к участникам CFT70 — ошибка показывает, что среднее работает только там, где условия заранее известны
c3_mean_early = float(cc[cc.grp == "early"].d_meas.mean())
out["transfer_c3_mean_early"] = c3_mean_early
for nm, d in (("exercise", cf[(cf.group != "CONTROL") & (cf.visit == "POST1")]), ("control", cf[(cf.group == "CONTROL") & (cf.visit == "POST1")])):
    out[f"transfer_mae_cft70_{nm}"] = boot(d, lambda x: (x.d_pct - c3_mean_early).abs().mean())

# --- PhysioNet ---
A = pd.read_csv(R / "results_physionet/A_cross_sectional.csv"); A = A[A["mode"] == "hrmax_measured"].copy()
A["err"] = (A.aci - A.vo2max) / A.vo2max * 100; A = A.rename(columns={"ID": "subject"})
for u in (0.75, 0.8, 0.85):
    d = A[A.upper == u]
    out[f"phys_err_median_{u}"] = boot(d, lambda x: x.err.median())
    out[f"phys_within10_{u}"] = boot(d, lambda x: (x.err.abs() <= 10).mean() * 100)

(R / "results_uncertainty.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
for k, v in out.items():
    if isinstance(v, dict) and "lo" in v: print(f"{k:42s} {v['est']:8.2f}  [{v['lo']:.2f}; {v['hi']:.2f}]  n={v.get('n_obs', v.get('n'))}/{v.get('n_subj', '')}")
    else: print(k, v)
