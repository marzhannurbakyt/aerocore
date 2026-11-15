"""Build the offline application with Python 3; no packages or network needed."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCES = {
    "/*CSS*/": "app.css",
    "/*DATA*/": "dashboard_data.js",
    "/*CORE*/": "core.js",
    "/*APP*/": "app.js",
}


def build():
    html = (ROOT / "src/index.html").read_text(encoding="utf-8")
    for marker, filename in SOURCES.items():
        if html.count(marker) != 1:
            raise ValueError(f"Expected exactly one {marker} in src/index.html")
        content = (ROOT / "src" / filename).read_text(encoding="utf-8")
        if filename.endswith(".js") and "</script" in content.lower():
            raise ValueError(f"Unsafe inline script closing tag in {filename}")
        html = html.replace(marker, content, 1)
    out = ROOT / "docs/index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"Built {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes); fully offline")
    return out


if __name__ == "__main__":
    build()
