"""
Манифест исходных файлов NASA MR080G: SHA-256 каждого файла, чтобы любой мог проверить,
что анализ сделан именно на этих данных. Дополнительно каждый файл сверяется со списком MD5,
который NASA кладёт в архив: совпадение значит, что найденные ошибки есть в самом опубликованном архиве. Запуск: python -I make_manifest.py <распакованный архив> <zip> <csv>
"""
import csv
import hashlib
import sys
from pathlib import Path

root, zf, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
nasa = {}
for m in root.glob("*.md5sum"):
    for line in m.read_text(errors="replace").splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2: nasa[parts[1].lstrip("*").strip()] = parts[0]
def md5ok(p):
    rel = str(p.relative_to(root))
    if p.suffix == ".md5sum": return "list"
    return "yes" if nasa.get(rel) == hashlib.md5(p.read_bytes()).hexdigest() else ("no" if rel in nasa else "not listed")
rows = [(str(p.relative_to(root)), p.stat().st_size, h(p), md5ok(p)) for p in sorted(root.rglob("*")) if p.is_file()]
with out.open("w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["path", "bytes", "sha256", "matches_nasa_md5"])
    w.writerow([f"(archive) {zf.name}", zf.stat().st_size, h(zf), ""])
    w.writerows(rows)
from collections import Counter
print(len(rows), "файлов; архив", zf.name, h(zf)[:16], "; сверка с MD5 NASA:", dict(Counter(r[3] for r in rows)))
