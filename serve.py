"""開発用ローカルサーバー（キャッシュ無効）。
ブラウザが古い game.js / style.css をキャッシュして変更が反映されない問題を防ぐ。
使い方: python serve.py  → http://localhost:8123/
ポートは 8123 固定（ブラウザのブックマーク用）。
"""
import functools
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8123


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    # どこから起動してもこのフォルダを配信する
    handler = functools.partial(NoCacheHandler, directory=os.path.dirname(os.path.abspath(__file__)))
    with ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"No-cache server running: http://localhost:{PORT}/")
        httpd.serve_forever()
