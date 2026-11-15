"""
Шаг 6. Устойчивость вывода «ACI-скрининг → Peak-тест» к допущениям модели «виртуального экипажа».
Для каждого сценария меняем ОДНО допущение относительно базового и сравниваем протоколы:
  REF  — Peak-тест каждые 30 сут (как в эксперименте NASA на МКС);
  SCR  — ACI каждые k сут → внеплановый Peak-тест, если ACI < порога; нарушение фиксирует Peak-тест;
  ACI1 — только ACI, решение по одному тесту;  ACI2 — только ACI, два теста подряд.
Метрики: доля пойманных нарушений (< 80% исходного к концу миссии или в любой момент), ложные тревоги
у явно здоровых (≥ 85%), число Peak-тестов на человека, медианная задержка обнаружения.
Запуск: python -I robustness.py <research/>
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.stats import norm

N, DAYS = 20000, 180

def iss_mixture(rng, n):
    """Снижение VO₂max, подобранное под ISS (Evidence Report): 53% > 10%, 15% > 20%, ~30% в пределах ±3%."""
    p_resp = 0.30
    z1, z2 = norm.ppf(1 - 0.53 / 0.7), norm.ppf(1 - 0.15 / 0.7)
    s = 10 / (z2 - z1); m = 10 - z1 * s
    resp = rng.random(n) < p_resp
    return np.where(resp, rng.normal(0, 1.5, n), rng.normal(m, s, n)) / 100

def make_traj(kind, D, days_count=DAYS):
    """Траектория отношения VO₂max к исходному по дням."""
    days = np.arange(days_count + 1)
    if kind == "step14":        # снижение к 15-му дню, дальше без изменений (Moore 2014: −17% на FD15)
        f = np.minimum(days / 14, 1)[None, :] * D[:, None]
    elif kind == "step7":
        f = np.minimum(days / 7, 1)[None, :] * D[:, None]
    elif kind == "recover":     # снижение к 15-му дню, затем возврат 40% потери к 180-му (в полёте VO₂peak растёт)
        f = np.where(days <= 14, days / 14, 1 - 0.4 * (days - 14) / (days_count - 14))[None, :] * D[:, None]
    elif kind == "linear":      # медленное снижение весь полёт (хуже всего для редких тестов)
        f = (days / days_count)[None, :] * D[:, None]
    else:
        raise ValueError(f"Unknown trajectory: {kind}")
    return 1 - f

def protocol_metrics(fd, npk, traj):
    """A positive before/after a true breach is not a detected breach.

    Monitoring ends at the first positive test in every protocol. Sensitivity
    counts a participant only when that positive occurs while true capacity is
    below 80%. This avoids crediting an early false positive as future detection.
    """
    worst = traj.min(axis=1)
    breach = worst < 0.80
    first_breach = np.where(breach, np.argmax(traj < 0.80, axis=1), np.inf)
    clear = worst >= 0.85
    alarm = np.isfinite(fd)
    alarm_rows = np.flatnonzero(alarm)
    caught = np.zeros(len(fd), dtype=bool)
    caught[alarm_rows] = traj[alarm_rows, fd[alarm_rows].astype(int)] < 0.80
    delay = (fd[caught] - first_breach[caught])
    n_breach, n_clear = int(breach.sum()), int(clear.sum())
    return {"sens": round(caught.sum() / n_breach * 100, 1) if n_breach else None,
            "fa_clear": round((clear & alarm).sum() / n_clear * 100, 1) if n_clear else None,
            "peak_tests": round(float(np.mean(npk)), 2),
            "delay_med": float(np.median(delay)) if len(delay) else None,
            "breach_share": round(breach.mean() * 100, 1),
            "breaches": n_breach, "detected_breaches": int(caught.sum()),
            "clear_participants": n_clear, "false_alarms_clear": int((clear & alarm).sum()),
            "alarms_before_breach": int((breach & alarm & (fd < first_breach)).sum())}


def run(sc, seed=7, n=N, days=DAYS):
    rng = np.random.default_rng(seed)
    D = sc["dist"](rng, n)
    traj = make_traj(sc["traj"], D, days)
    sa, sp = sc["sd_aci"] / 100, sc["sd_peak"] / 100
    base_aci = 1 + rng.normal(0, sa / np.sqrt(2), n)      # исходный ACI — среднее двух тестов до полёта
    base_pk = 1 + rng.normal(0, sp / np.sqrt(2), n)
    aci = lambda d: traj[:, d] * (1 + rng.normal(0, sa, n)) / base_aci
    pk = lambda d: traj[:, d] * (1 + rng.normal(0, sp, n)) / base_pk
    res = {}
    # REF
    fd = np.full(n, np.inf); npk = np.zeros(n)
    for d in range(15, days + 1, 30):
        active = np.isinf(fd)
        npk += active; fd = np.where(active & (pk(d) < 0.80), d, fd)
    res["REF"] = protocol_metrics(fd, npk, traj)
    # SCR
    fd = np.full(n, np.inf); npk = np.zeros(n)
    for d in range(15, days + 1, sc["every"]):
        scr = np.isinf(fd) & (aci(d) < sc["thr"]); npk += scr
        fd = np.where(scr & (pk(d) < 0.80), d, fd)
    res["SCR"] = protocol_metrics(fd, npk, traj)
    # ACI-only
    fd1 = np.full(n, np.inf); fd2 = np.full(n, np.inf); prev = np.zeros(n, bool)
    for d in range(15, days + 1, sc["every"]):
        low = aci(d) < 0.80
        fd1 = np.where(np.isinf(fd1) & low, d, fd1)
        fd2 = np.where(np.isinf(fd2) & low & prev, d, fd2); prev = low
    res["ACI1"] = protocol_metrics(fd1, np.zeros(n), traj); res["ACI2"] = protocol_metrics(fd2, np.zeros(n), traj)
    return res

def main(research_dir):
    R = Path(research_dir)
    U = json.loads((R / "results_uncertainty.json").read_text())
    noise = U["c3_aci_test_noise_sd"]
    te = U["c3_typical_error_pct"]
    BASE = {"dist": iss_mixture, "traj": "step14", "sd_aci": noise["est"], "sd_peak": 3.0, "thr": 0.85, "every": 14}
    def var(**kw): d = dict(BASE); d.update(kw); return d
    def cft_control(rng, n): return rng.normal(22.3, 12.9, n) / 100          # CFT70, контроль без тренировок (R+0/1)
    def cft_exercise(rng, n): return rng.normal(2.8, 8.9, n) / 100           # CFT70, тренировки (R+0/1)
    SC = [
        ("Базовый сценарий", "Base case", BASE),
        (f"Шум ACI: нижняя граница 95% ДИ ({noise['lo']:.1f}%)", f"ACI noise: lower 95% CI ({noise['lo']:.1f}%)", var(sd_aci=noise["lo"])),
        (f"Шум ACI: верхняя граница 95% ДИ ({noise['hi']:.1f}%)", f"ACI noise: upper 95% CI ({noise['hi']:.1f}%)", var(sd_aci=noise["hi"])),
        ("Шум ACI как на земных данных PhysioNet (10,6%)", "ACI noise as on PhysioNet Earth data (10.6%)", var(sd_aci=10.6)),
        (f"Шум Peak-теста как в MR080G ({te['est']:.1f}%)", f"Peak-test noise as in MR080G ({te['est']:.1f}%)", var(sd_peak=te["est"])),
        ("Снижение к 7-му дню", "Decline by day 7", var(traj="step7")),
        ("Снижение, затем частичное восстановление в полёте", "Decline, then partial in-flight recovery", var(traj="recover")),
        ("Медленное снижение весь полёт", "Slow decline over whole mission", var(traj="linear")),
        ("Экипаж без тренировок (как контроль CFT70)", "Crew without exercise (CFT70 control)", var(dist=cft_control)),
        ("Экипаж с тренировками (как CFT70)", "Crew with exercise (CFT70)", var(dist=cft_exercise)),
        ("Порог скрининга 80%", "Screening threshold 80%", var(thr=0.80)),
        ("Порог скрининга 82,5%", "Screening threshold 82.5%", var(thr=0.825)),
        ("Порог скрининга 87,5%", "Screening threshold 87.5%", var(thr=0.875)),
        ("Порог скрининга 90%", "Screening threshold 90%", var(thr=0.90)),
        ("ACI каждые 7 сут", "ACI every 7 days", var(every=7)),
        ("ACI каждые 21 сут", "ACI every 21 days", var(every=21)),
        ("ACI каждые 30 сут", "ACI every 30 days", var(every=30)),
        (f"Худший случай: шум ACI 10,6%, Peak {te['est']:.1f}%, медленное снижение".replace(".", ","), f"Worst case: ACI 10.6%, Peak {te['est']:.1f}%, slow decline", var(sd_aci=10.6, sd_peak=te["est"], traj="linear")),
    ]
    rows = []
    for ru, en, sc in SC:
        r = run(sc)
        rows.append({"ru": ru, "en": en, **{f"{k}_{m}": v for k, d in r.items() for m, v in d.items()}})
        print(f"{ru[:58]:58s} breach {r['REF']['breach_share']:5.1f}% | REF sens {r['REF']['sens']:5.1f} fa {r['REF']['fa_clear']:4.1f} pk {r['REF']['peak_tests']:4.1f} delay {r['REF']['delay_med']} | SCR sens {r['SCR']['sens']:5.1f} fa {r['SCR']['fa_clear']:4.1f} pk {r['SCR']['peak_tests']:4.2f} delay {r['SCR']['delay_med']} | ACI1 fa {r['ACI1']['fa_clear']:4.1f} ACI2 sens {r['ACI2']['sens']:5.1f} fa {r['ACI2']['fa_clear']:4.1f}")
    metadata = {
        "seed": 7,
        "model_version": 2,
        "detection": "First positive test occurs while true capacity is below 80% of baseline.",
        "stop_rule": "All protocols stop after their first positive decision; no subsequent tests are charged.",
        "reference_schedule": "Days 15, 45, 75, 105, 135, 165; 6 planned maximal tests before stopping.",
        "false_alarm_denominator": "Participants whose true capacity stays at or above 85% throughout the mission.",
        "sensitivity_denominator": "Participants whose true capacity falls below 80% on at least one day.",
        "costs_excluded": "Submaximal sessions, repeat confirmation, post-referral care, equipment, and crew hours.",
        "normalization": "ACI uses the mean of two pre-ACI tests; maximal tests use the mean of two pre-maximal tests. The replay UI uses measured VO2peak as its baseline instead.",
        "error_assumptions": "Independent zero-mean normal multiplicative errors; no systematic ACI bias, drift, or error correlation. This is not an end-to-end model of the replay UI.",
        "interpretation": "Illustrative simulation under selected assumptions; not clinical or flight validation.",
    }
    (R / "results_robustness.json").write_text(json.dumps({"N": N, "days": DAYS, "metadata": metadata, "base": {k: (v if not callable(v) else v.__name__) for k, v in BASE.items()}, "rows": rows}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
