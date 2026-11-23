#!/usr/bin/env python3
"""Serve the development-only About icon workbench on the local loopback interface."""

import argparse
import base64
from collections import OrderedDict
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
from urllib.parse import urlsplit

from icon_artwork import DEFAULT_SETTINGS, SettingsError, geometry, normalize_settings, render


ROOT = Path(__file__).resolve().parents[1]
STATIC = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/workbench.css': ('workbench.css', 'text/css; charset=utf-8'),
    '/workbench.mjs': ('workbench.mjs', 'text/javascript; charset=utf-8'),
}


def encoded_png(data):
    return 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')


def fingerprint(settings):
    return sha256(json.dumps(settings, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


class WorkbenchServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port):
        super().__init__(('127.0.0.1', port), WorkbenchHandler)
        self.origin = f'http://127.0.0.1:{self.server_port}'
        self.render_lock = threading.Lock()
        self.cache = OrderedDict()


class WorkbenchHandler(BaseHTTPRequestHandler):
    # Whitelisted static routes only: never expose the checkout or write assets.
    def log_message(self, _format, *_args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def respond(self, status, data, content_type='application/json; charset=utf-8'):
        if isinstance(data, dict):
            data = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def trusted_host(self):
        return self.headers.get('Host') == self.server.origin.removeprefix('http://')

    def same_origin(self):
        return (self.trusted_host()
                and self.headers.get('Origin', self.server.origin) == self.server.origin
                and self.headers.get('Sec-Fetch-Site', 'same-origin') in ['same-origin', 'none'])

    def do_GET(self):
        path = urlsplit(self.path).path
        # A link from another site may open the public workbench document.
        # API calls and embedded resources still require this local origin.
        navigation = (path == '/' and self.trusted_host()
                      and self.headers.get('Sec-Fetch-Mode') == 'navigate'
                      and self.headers.get('Sec-Fetch-Dest') == 'document')
        if not (self.same_origin() or navigation):
            self.respond(403, {'error': 'Open the workbench using its local URL.'})
            return
        if path in STATIC:
            filename, content_type = STATIC[path]
            self.respond(200, (ROOT / 'tools/icon-workbench' / filename).read_bytes(), content_type)
        elif path == '/api/state':
            self.respond(200, {
                'formatVersion': 1, 'settings': DEFAULT_SETTINGS,
                'fingerprint': fingerprint(DEFAULT_SETTINGS),
                'reference': encoded_png((ROOT / 'assets/about.png').read_bytes()),
                'referenceSha256': sha256((ROOT / 'assets/about.png').read_bytes()).hexdigest(),
            })
        else:
            self.respond(404, {'error': 'This workbench route does not exist.'})

    def do_POST(self):
        if not self.same_origin():
            self.respond(403, {'error': 'Render from the workbench at its local URL.'})
            return
        if self.path != '/api/render':
            self.respond(404, {'error': 'This workbench route does not exist.'})
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.respond(415, {'error': 'Send settings as application/json.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 32768:
                self.respond(413, {'error': 'Settings must fit within 32 KiB.'})
                return
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise SettingsError('settings', 'Send a settings object.')
            settings = normalize_settings(request.get('settings'))
            size = request.get('size', 512)
            if isinstance(size, bool) or not isinstance(size, int) or not 16 <= size <= 2048:
                raise SettingsError('size', 'Choose an integer PNG size from 16 to 2048 pixels.')
            visible = request.get('visible', [True, True, True])
            if not isinstance(visible, list) or len(visible) != 3 or not all(isinstance(v, bool) for v in visible):
                raise SettingsError('visible', 'Provide three layer visibility flags.')
        except (ValueError, UnicodeDecodeError) as error:
            self.respond(422, {'error': str(error), 'field': getattr(error, 'field', 'settings')})
            return
        if not self.server.render_lock.acquire(blocking=False):
            self.respond(409, {'error': 'A PNG is still rendering. Try again when it finishes.'})
            return
        try:
            started = time.monotonic()
            key = (fingerprint(settings), size, tuple(visible))
            cached = self.server.cache.get(key)
            if cached is None:
                preview = dict(settings, opacities=[a if v else 0 for a, v in zip(settings['opacities'], visible)])
                cached = encoded_png(render(size, preview))
                self.server.cache[key] = cached
                if len(self.server.cache) > 12:
                    self.server.cache.popitem(last=False)
            else:
                self.server.cache.move_to_end(key)
            self.respond(200, {
                'png': cached, 'settings': settings, 'geometry': geometry(settings),
                'fingerprint': key[0], 'size': size, 'visible': visible,
                'duration_ms': round((time.monotonic() - started) * 1000),
            })
        finally:
            self.server.render_lock.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766, help='loopback port; use 0 to select a free port')
    args = parser.parse_args()
    try:
        server = WorkbenchServer(args.port)
    except (OSError, OverflowError) as error:
        parser.exit(1, f'Icon workbench could not start: {error}. Choose another --port.\n')
    print(f'Icon workbench: {server.origin}\nDrafts stay in this browser. Export settings to share your preferred values.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
