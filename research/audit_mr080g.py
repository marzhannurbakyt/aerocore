"""
Аудит CSV-файлов NASA LSDA (MR080G и аналогичных) перед построением алгоритма.

Отвечает на вопросы этапа «Data Audit»:
  - сколько файлов Peak и Submax;
  - какие переменные, единицы, пропуски, дубликаты;
  - сколько уникальных участников и у скольких есть оба типа теста;
  - совпадают ли временные точки Peak и Submax (в окне ±N суток).

Ничего не объединяет «по похожим названиям»: всё, что угадано автоматически
(столбец участника, времени, тип теста), выводится явно для ручной проверки.

Запуск:
  python audit_mr080g.py путь/к/папке_или_файлам ... [--out audit_mr080g.xlsx] [--window 3]
  python audit_mr080g.py data/raw --export-aerocore data/processed/aerocore_input.csv
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

# Синонимы столбцов — те же, что в веб-приложении (src/core.js)
ALIASES = {
    "participant_id": ["participant_id", "participant", "subject", "subject_id", "subj", "subj_id", "id", "pid", "crew_id"],
    "study_id": ["study_id", "study", "experiment", "campaign"],
    "test_type": ["test_type", "test", "protocol", "test_name"],
    "posture": ["posture", "position", "body_position", "orientation"],
    "measurement_date": ["measurement_date", "date", "test_date", "session_date"],
    "study_day": ["study_day", "day", "bed_rest_day", "br_day", "hdt_day", "mission_day", "flight_day"],
    "study_phase": ["study_phase", "phase", "period", "condition"],
    "stage": ["stage", "step", "level"],
    "workload_w": ["workload_w", "workload", "watts", "power", "power_w", "load_w", "work_rate", "work_rate_w"],
    "heart_rate": ["heart_rate", "hr", "heartrate", "hr_bpm", "heart_rate_bpm", "pulse"],
    "vo2_lmin": ["vo2_lmin", "vo2", "vo2_l_min", "vo2_lpm", "vo2_l", "vo2peak", "vo2_peak", "vo2peak_l_min"],
    "vo2_mlmin": ["vo2_mlmin", "vo2_ml_min"],
    "vo2_mlkgmin": ["vo2_mlkgmin", "vo2_ml_kg_min", "vo2_rel", "vo2_relative", "vo2peak_ml_kg_min"],
    "rer": ["rer", "rq", "resp_exchange_ratio"],
    "rpe": ["rpe", "borg", "rpe_borg"],
    "body_weight_kg": ["body_weight_kg", "body_weight", "weight", "weight_kg", "mass", "body_mass", "body_mass_kg"],
    "age": ["age", "age_years"],
}
UNIT_HINTS = [("ml/kg/min", "мл/кг/мин"), ("ml/min", "мл/мин"), ("l/min", "л/мин"), ("bpm", "уд/мин"),
              ("kg", "кг"), ("(w)", "Вт"), ("watts", "Вт"), ("%", "%")]


def norm_header(h: str) -> str:
    """Нормализация названия столбца: 'VO2 (L/min)' -> 'vo2_l_min'."""
    s = str(h).lower().replace("₂", "2")
    s = re.sub(r"\(([^)]*)\)", r"_\1", s)
    s = re.sub(r"[^a-z0-9а-яё]+", "_", s)
    return s.strip("_")


def guess_canon(col: str) -> str:
    n = norm_header(col)
    for k, al in ALIASES.items():
        if n in al:
            return k
    return ""


def unit_hint(col: str) -> str:
    low = str(col).lower()
    for pat, ru in UNIT_HINTS:
        if pat in low:
            return ru
    return ""


def test_type_from_name(name: str) -> str:
    low = name.lower()
    if "sub" in low:
        return "Submax"
    if "peak" in low:
        return "Peak"
    return "не определён"


def read_csv(path: Path) -> pd.DataFrame:
    """Чтение с автоопределением разделителя и кодировки."""
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return pd.read_csv(path, sep=None, engine="python", encoding=enc)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Не удалось прочитать {path}")


def collect(paths: list[str]) -> list[Path]:
    out = []
    for p in map(Path, paths):
        if p.is_dir():
            out += sorted(x for x in p.rglob("*") if x.suffix.lower() in (".csv", ".txt", ".tsv"))
        elif p.exists():
            out.append(p)
        else:
            print(f"! не найден: {p}", file=sys.stderr)
    return out


def audit(files: list[Path], window: int):
    file_rows, var_rows, obs = [], [], []
    for f in files:
        try:
            df = read_csv(f)
        except Exception as e:  # noqa: BLE001 — фиксируем ошибку чтения в отчёте
            file_rows.append({"Файл": f.name, "Ошибка чтения": str(e)})
            continue
        mapping = {c: guess_canon(c) for c in df.columns}
        inv = {}
        for c, k in mapping.items():
            if k and k not in inv:
                inv[k] = c
        ttype = test_type_from_name(f.name)
        if "test_type" in inv:
            vals = df[inv["test_type"]].dropna().astype(str).str.lower()
            if vals.str.contains("sub").all():
                ttype = "Submax"
            elif vals.str.contains("peak|max").all():
                ttype = "Peak"
            else:
                ttype = "смешанный"
        pid_col = inv.get("participant_id")
        time_col = inv.get("study_day") or inv.get("measurement_date") or inv.get("study_phase")
        file_rows.append({
            "Файл": f.name, "Путь": str(f), "Тип теста (угадан)": ttype, "Строк": len(df), "Столбцов": df.shape[1],
            "Столбец участника (угадан)": pid_col or "НЕ НАЙДЕН",
            "Столбец времени (угадан)": time_col or "НЕ НАЙДЕН",
            "Участников": df[pid_col].nunique() if pid_col else None,
            "Полных дубликатов строк": int(df.duplicated().sum()),
            "Ячеек с пропусками, %": round(df.isna().mean().mean() * 100, 1),
            "Нераспознанных столбцов": sum(1 for k in mapping.values() if not k),
        })
        for c in df.columns:
            s = df[c]
            num = pd.to_numeric(s, errors="coerce")
            is_num = num.notna().sum() >= max(1, 0.8 * s.notna().sum())
            var_rows.append({
                "Файл": f.name, "Столбец": c, "Поле AEROCORE": mapping[c] or "—", "Единица (по заголовку)": unit_hint(c),
                "Тип": "число" if is_num else "текст", "Заполнено": int(s.notna().sum()),
                "Пропусков, %": round(s.isna().mean() * 100, 1), "Уникальных": int(s.nunique()),
                "Мин": num.min() if is_num else None, "Макс": num.max() if is_num else None,
                "Примеры": ", ".join(map(str, s.dropna().astype(str).unique()[:4])),
            })
        if pid_col and time_col:
            t = df[[pid_col, time_col]].dropna().drop_duplicates()
            for _, r in t.iterrows():
                obs.append({"participant": str(r[pid_col]).strip(), "time": r[time_col], "test": ttype, "file": f.name})

    obs_df = pd.DataFrame(obs)
    part_rows, pairs_total = [], 0
    if not obs_df.empty:
        for pid, g in obs_df.groupby("participant"):
            pk = g[g.test == "Peak"]["time"].tolist()
            sb = g[g.test == "Submax"]["time"].tolist()
            pk_n, sb_n = pd.to_numeric(pd.Series(pk, dtype=object), errors="coerce"), pd.to_numeric(pd.Series(sb, dtype=object), errors="coerce")
            if len(pk) and len(sb) and pk_n.notna().all() and sb_n.notna().all():
                matched = sum(1 for a in pk_n if any(abs(a - b) <= window for b in sb_n))
                how = f"по дню, окно ±{window} сут"
            else:
                matched = len(set(map(str, pk)) & set(map(str, sb)))
                how = "по совпадению значения"
            pairs_total += matched
            part_rows.append({"Участник": pid, "Точек Peak": len(pk), "Точек Submax": len(sb),
                              "Есть оба теста": "да" if pk and sb else "нет", "Совпадающих точек": matched, "Способ": how,
                              "Точки Peak": ", ".join(map(str, sorted(map(str, pk)))), "Точки Submax": ", ".join(map(str, sorted(map(str, sb))))})
    parts = pd.DataFrame(part_rows)
    files_df, vars_df = pd.DataFrame(file_rows), pd.DataFrame(var_rows)
    both = int((parts["Есть оба теста"] == "да").sum()) if not parts.empty else 0
    units = sorted({u for u in vars_df.get("Единица (по заголовку)", []) if u}) if not vars_df.empty else []
    summary = pd.DataFrame([
        ("Количество файлов Peak", int((files_df.get("Тип теста (угадан)", pd.Series(dtype=str)) == "Peak").sum())),
        ("Количество файлов Submax", int((files_df.get("Тип теста (угадан)", pd.Series(dtype=str)) == "Submax").sum())),
        ("Файлов с неопределённым типом", int((~files_df.get("Тип теста (угадан)", pd.Series(dtype=str)).isin(["Peak", "Submax"])).sum()) if not files_df.empty else 0),
        ("Уникальные участники", len(parts)),
        ("Участники с обоими типами теста", both),
        (f"Совпадающие временные точки Peak/Submax (±{window} сут)", pairs_total),
        ("Доступные переменные (уникальные названия)", int(vars_df["Столбец"].nunique()) if not vars_df.empty else 0),
        ("Распознано как поля AEROCORE", ", ".join(sorted(set(vars_df["Поле AEROCORE"]) - {"—"})) if not vars_df.empty else ""),
        ("Единицы по заголовкам", ", ".join(units) or "не указаны — уточнить по документации"),
        ("Полных дубликатов строк (сумма)", int(files_df["Полных дубликатов строк"].sum()) if "Полных дубликатов строк" in files_df else 0),
        ("Положение тела (supine/upright)", "есть столбец" if (not vars_df.empty and (vars_df["Поле AEROCORE"] == "posture").any()) else "НЕТ — уточнить по протоколу: тесты лёжа и сидя несопоставимы (CFT70)"),
        ("Критерии максимального теста NASA (RER, ЧСС+возраст, RPE)", ", ".join(k for k in ["rer", "heart_rate", "age", "rpe"] if not vars_df.empty and (vars_df["Поле AEROCORE"] == k).any()) or "нет"),
        ("Достаточно ли для проверки Peak vs Submax", "предварительно да" if both >= 8 and pairs_total >= 15 else "нет — нужно ≥ 8 участников и ≥ 15 пар"),
    ], columns=["Что проверяем", "Результат"])
    return summary, files_df, vars_df, parts


def export_aerocore(files: list[Path], out: Path) -> int:
    """Сводит файлы в формат AEROCORE: переименование распознанных столбцов, тип теста, источник. Значения не меняются."""
    frames = []
    for f in files:
        df = read_csv(f)
        ren = {}
        for c in df.columns:
            k = guess_canon(c)
            if k and k not in ren.values():
                ren[c] = k
        d = df.rename(columns=ren)[list(ren.values())].copy()
        if "test_type" not in d:
            d["test_type"] = test_type_from_name(f.name)
        d["data_source"] = f.name
        frames.append(d)
    res = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    out.parent.mkdir(parents=True, exist_ok=True)
    res.to_csv(out, index=False)
    return len(res)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Аудит CSV MR080G для AEROCORE")
    ap.add_argument("paths", nargs="+", help="файлы или папки с CSV")
    ap.add_argument("--out", default="audit_mr080g.xlsx", help="Excel-отчёт аудита")
    ap.add_argument("--window", type=int, default=3, help="окно совпадения Peak/Submax, сутки")
    ap.add_argument("--export-aerocore", help="сохранить объединённый CSV в формате AEROCORE")
    a = ap.parse_args(argv)
    files = collect(a.paths)
    if not files:
        sys.exit("Нет CSV-файлов")
    summary, files_df, vars_df, parts = audit(files, a.window)
    with pd.ExcelWriter(a.out, engine="openpyxl") as xw:
        for name, df in [("Сводка", summary), ("Файлы", files_df), ("Переменные", vars_df), ("Участники", parts)]:
            df.to_excel(xw, sheet_name=name, index=False)
            ws = xw.sheets[name]
            for col in ws.columns:
                ws.column_dimensions[col[0].column_letter].width = min(60, max(10, *(len(str(c.value or "")) + 2 for c in col)))
            ws.freeze_panes = "A2"
    print(summary.to_string(index=False))
    print(f"\nОтчёт: {a.out}")
    if a.export_aerocore:
        n = export_aerocore(files, Path(a.export_aerocore))
        print(f"Формат AEROCORE: {a.export_aerocore} ({n} строк) — загрузите в приложение для проверки качества")


if __name__ == "__main__":
    main()
