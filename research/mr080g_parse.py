"""
Разбор MR080G Campaign 3 (папка Summary) в единую таблицу ступеней.
Форматы файлов разные: тип теста, участник и дата берутся из имени файла,
столбцы приводятся к одному виду. Ничего не удаляется молча: проблемы пишутся в журнал.
Запуск: python -I mr080g_parse.py <распакованный архив> <папка результата>
"""
import re
import sys
from pathlib import Path

import pandas as pd

root, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
RENAME = {}
def canon(c):
    c0 = c.strip().lower()
    if c0 in ("hr", "hr bpm", "hr (bpm)"): return "HR"
    if c0 in ("vo2", "vo2 l/min", "vo2 (l/min)"): return "VO2"
    if c0 in ("vco2", "vco2 l/min", "vco2 (l/min)"): return "VCO2"
    if c0 == "rer": return "RER"
    if c0 in ("watts", "workload", "workload (watts)"): return "W"
    if c0.startswith("rpe"): return "RPE"
    if c0 in ("body weight", "weight_kg", "weight"): return "mass"
    if c0 in ("rvo2", "vo2 ml/kg/min", "vo2 (ml/kg/min)"): return "RVO2"
    if c0 in ("age",): return "age"
    if c0 in ("stage",): return "stage"
    if c0 in ("test_phase",): return "phase"
    if c0 in ("br_day",): return "br_day"
    if c0 in ("date",): return "date"
    if c0 in ("test",): return "test_name"
    return c.strip()

pat = re.compile(r"MR080G_Campaign_3_(C3[A-H])_(\d+)_(?:MR080G_)?(?:(Peak|Submax)_)?(\d{6})")
frames, issues = [], []
for f in sorted((root / "MR080G_Campaign_3_Aerobic_Capacity_Summary").iterdir()):
    mt = pat.search(f.name)
    if not mt:
        issues.append((f.name, "имя файла не распознано")); continue
    try:
        d = pd.read_csv(f)
    except Exception as e:  # noqa: BLE001
        issues.append((f.name, f"не читается: {e}")); continue
    d.columns = [canon(c) for c in d.columns]
    d = d.loc[:, ~d.columns.duplicated()]
    stages = d["stage"].astype(str).str.strip().str.lower() if "stage" in d else pd.Series(dtype=str)
    ttype = mt.group(3)
    if ttype == "Submax" and stages.eq("peak").any():
        # имя говорит Submax, но в файле есть строка Peak — это максимальный тест (так и в ReadMe: «Preflight Maximum Cycle»)
        issues.append((f.name, "в имени Submax, по содержимому — максимальный тест (есть строка Peak): тип = Peak"))
        ttype = "Peak"
    if ttype is None:  # тип теста по содержимому: строка «Peak» — максимальный тест, ступени 25/50/75% — субмаксимальный
        if stages.eq("peak").any() or "gxt" in f.name: ttype = "Peak"
        elif stages.isin(["25%", "0.25", "50%", "0.5"]).any(): ttype = "Submax"
        else:
            issues.append((f.name, "тип теста не определён")); continue
        issues.append((f.name, f"тип теста определён по содержимому: {ttype}"))
    d["campaign"], d["subject"], d["test"], d["fdate"], d["file"] = mt.group(1), mt.group(1) + "_" + mt.group(2), ttype, mt.group(4), f.name
    frames.append(d)
T = pd.concat(frames, ignore_index=True)
for c in ("HR", "VO2", "VCO2", "RER", "W", "RPE", "mass", "age", "br_day", "RVO2"):
    if c in T: T[c] = pd.to_numeric(T[c], errors="coerce")
T["stage"] = T["stage"].astype(str).str.strip()
n = T.groupby("file").size().rename("nrows")
nn = T.drop(columns="file").notna().sum(axis=1).groupby(T["file"]).sum().rename("ncells")
T = T.join(n, on="file").join(nn, on="file")

# --- дата в имени файла против даты внутри файла ---
T["date_in_file"] = pd.to_datetime(T["date"], errors="coerce", format="mixed")
T["date_name"] = pd.to_datetime(T["fdate"], format="%y%m%d")
F = T.groupby("file").agg(subject=("subject", "first"), phase=("phase", "first"), br_day=("br_day", "first"),
                          d_in=("date_in_file", "first"), d_name=("date_name", "first"))
for fname, r in F[F.d_in.notna() & (F.d_in != F.d_name)].iterrows():
    msg = f"дата в имени {r.d_name.date()} ≠ дата в файле {r.d_in.date()}"
    if r.phase == "POST_TEST":
        # шапка скопирована из другого файла: день после постельного режима считаем от файла R+0 того же участника,
        # у которого дата в имени и в файле совпадают
        ref = F[(F.subject == r.subject) & (F.phase == "POST_TEST") & (F.br_day == 0) & (F.d_in == F.d_name)]
        if len(ref) == 1:
            nd = int((r.d_name - ref.d_in.iloc[0]).days)
            if nd != r.br_day:
                T.loc[T.file == fname, "br_day"] = nd
                msg += f"; шапка совпадает с файлом R+0 — день пересчитан по дате в имени: R+{nd} (было R+{int(r.br_day)})"
    issues.append((fname, msg))

best = T.sort_values(["nrows", "ncells"], ascending=False).groupby(["subject", "test", "fdate"]).file.first()
dups = T[~T.file.isin(best.values)].file.unique()
for f_ in dups: issues.append((f_, "дубликат теста (тот же участник, тип и дата) — используется файл с большим числом строк"))
T = T[T.file.isin(best.values)]
keep = [c for c in ["subject", "campaign", "test", "fdate", "phase", "br_day", "date", "test_name", "stage", "W", "HR", "VO2", "VCO2", "RER", "RPE", "RVO2", "age", "mass", "file"] if c in T]
T = T[keep]
T.to_csv(out / "c3_stages.csv", index=False)
pd.DataFrame(issues, columns=["file", "issue"]).to_csv(out / "c3_parse_issues.csv", index=False)
print("строк", len(T), "файлов", T.file.nunique(), "участников", T.subject.nunique(), "проблем", len(issues))
print(T.groupby(["test", "phase"]).file.nunique())
print(T.stage.value_counts().head(25))
