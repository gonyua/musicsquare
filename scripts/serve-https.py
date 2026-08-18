#!/usr/bin/env python3
"""在局域网用 HTTPS 托管本目录的静态文件，让 iPhone 能注册 Service Worker 并离线打开。"""
from __future__ import annotations

import os
import socket
import ssl
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / ".certs"
CERT_FILE = CERT_DIR / "lan.pem"
KEY_FILE = CERT_DIR / "lan-key.pem"
PORT = int(os.environ.get("PORT", "8443"))


def lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def ensure_cert(ip: str) -> None:
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    if CERT_FILE.exists() and KEY_FILE.exists():
        return
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-sha256",
            "-days",
            "825",
            "-nodes",
            "-keyout",
            str(KEY_FILE),
            "-out",
            str(CERT_FILE),
            "-subj",
            f"/CN={ip}",
            "-addext",
            f"subjectAltName=IP:{ip},DNS:localhost,IP:127.0.0.1",
        ],
        check=True,
    )


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main() -> None:
    ip = lan_ip()
    ensure_cert(ip)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), QuietHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    url = f"https://{ip}:{PORT}/"
    print(f"HTTPS 已启动: {url}")
    print()
    print("iPhone 离线打开步骤：")
    print("1. 关掉旧的 HTTP 主屏幕图标（那个打不开是正常的）")
    print("2. Safari 打开上面这个 https 地址，点「高级」继续访问")
    print("3. 看到页面后再「分享 → 添加到主屏幕」")
    print("4. 有网时打开一次新图标，等到提示「应用外壳已缓存」")
    print("5. 之后没网也能显示 HTML/CSS 界面；搜歌、播放仍需要网络")
    print()
    print("证书是自签的，iOS 会报警。若无法继续访问，可改用 GitHub Pages 的 https 地址安装。")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
