"""Serve the bundled app locally. Run: python start.py [port]."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import webbrowser

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    root = Path(__file__).resolve().parent / "docs"
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(SimpleHTTPRequestHandler, directory=str(root)))
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"AEROCORE: {url}\nPress Ctrl+C to stop. Files stay on this device.", flush=True)
    try:
        webbrowser.open(url)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
