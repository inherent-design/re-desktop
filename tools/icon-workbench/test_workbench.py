"""Exercise renderer parity, editable geometry, and the loopback HTTP boundary."""

from copy import deepcopy
import http.client
import importlib.util
import json
from pathlib import Path
import struct
import sys
import threading
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from icon_artwork import DEFAULT_SETTINGS, SettingsError, geometry, normalize_settings, render

spec = importlib.util.spec_from_file_location('icon_workbench', ROOT / 'scripts/icon-workbench.py')
workbench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workbench)

# Controlled geometry and solid textures keep pixel checks independent of art direction.
FLAT_INKS = {
    'canvas_units': 64, 'diameters': [50, 35.5, 31.5], 'bottom_gaps': [0, 0],
    'opacities': [1, 1, 1], 'colors': ['#FF00FF', '#FFFF00', '#00FFFF'],
    'background': '#FFFFFF', 'blend': 'multiply',
    'dot_diameter': 512, 'dot_gap': 0, 'dot_angle': 0, 'dot_phase': [0, 0],
    'stripe_width': 512, 'stripe_gap': 0, 'stripe_angle': 0, 'stripe_phase': 0,
    'magenta_fade': False, 'magenta_core': 0, 'cyan_core': .9,
}


def pixels(png, alpha=False):
    assert png[:8] == b'\x89PNG\r\n\x1a\n'
    cursor, compressed, size = 8, bytearray(), None
    while cursor < len(png):
        length = struct.unpack('>I', png[cursor:cursor + 4])[0]
        kind = png[cursor + 4:cursor + 8]
        data = png[cursor + 8:cursor + 8 + length]
        crc = struct.unpack('>I', png[cursor + 8 + length:cursor + 12 + length])[0]
        assert crc == zlib.crc32(kind + data) & 0xFFFFFFFF
        if kind == b'IHDR':
            width, height, depth, color, *_ = struct.unpack('>IIBBBBB', data)
            assert width == height and depth == 8 and color == 6
            size = width
        if kind == b'IDAT':
            compressed.extend(data)
        cursor += length + 12
    rows = zlib.decompress(compressed)
    assert len(rows) == size * (size * 4 + 1)
    assert all(rows[y * (size * 4 + 1)] == 0 for y in range(size))
    def pixel(x, y):
        offset = y * (size * 4 + 1) + 1 + x * 4
        return tuple(rows[offset:offset + (4 if alpha else 3)])
    return size, pixel


class ArtworkTests(unittest.TestCase):
    def test_reviewed_settings_reproduce_asset(self):
        self.assertEqual(render(1024, DEFAULT_SETTINGS), (ROOT / 'assets/about.png').read_bytes())
        self.assertEqual(render(32, DEFAULT_SETTINGS), render(32, DEFAULT_SETTINGS))
        size, pixel = pixels(render(32, DEFAULT_SETTINGS), alpha=True)
        self.assertEqual(size, 32)
        self.assertEqual(pixel(0, 0), (0, 0, 0, 0))

    def test_independent_bottom_insets_control_geometry(self):
        base = {'canvas_units': 64, 'diameters': [42, 28, 20]}
        settings = normalize_settings(dict(base, bottom_gaps=[2, 1]))
        circles = geometry(settings)
        self.assertEqual([c['center'] for c in circles], [(32, 32), (32, 37), (32, 40)])
        self.assertEqual(normalize_settings(dict(base, bottom_gap=6))['bottom_gaps'], [6, 6])
        with self.assertRaises(SettingsError) as rejected:
            normalize_settings(dict(base, bottom_gaps=[6, 9]))
        self.assertEqual(rejected.exception.field, 'bottom_gaps.1')

    def test_blending_and_background_are_visible_in_pixels(self):
        ink = FLAT_INKS
        _, multiply = pixels(render(64, ink))
        _, normal = pixels(render(64, dict(ink, blend='normal')))
        self.assertEqual(multiply(32, 31), (0, 0, 0))
        self.assertEqual(normal(32, 31), (0, 255, 255))
        _, background = pixels(render(32, dict(ink, background='#123456', opacities=[0, 0, 0])))
        self.assertEqual(background(16, 16), (18, 52, 86))

    def test_magenta_edge_fade_uses_the_shared_radial_profile(self):
        settings = dict(FLAT_INKS, opacities=[1, 0, 0], magenta_fade=True, magenta_core=0)
        _, faded = pixels(render(128, settings))
        _, solid = pixels(render(128, dict(settings, magenta_fade=False)))
        _, core = pixels(render(128, dict(settings, magenta_core=.8)))
        # Magenta removes green. A falling opacity restores green toward the edge.
        self.assertLess(faded(64, 64)[1], faded(88, 64)[1])
        self.assertLess(faded(88, 64)[1], faded(112, 64)[1])
        self.assertGreater(faded(112, 64)[1], 240)
        self.assertEqual(solid(112, 64)[1], 0)
        self.assertEqual(core(88, 64)[1], 0)
        self.assertEqual(render(64, dict(settings, magenta_fade=False, magenta_core=0)),
                         render(64, dict(settings, magenta_fade=False, magenta_core=.8)))

    def test_earlier_exports_keep_their_original_unfaded_appearance(self):
        legacy = deepcopy(DEFAULT_SETTINGS)
        legacy.pop('magenta_fade')
        legacy.pop('magenta_core')
        document = {'formatVersion': 1, 'settings': legacy}
        restored = normalize_settings(document)
        self.assertIs(restored['magenta_fade'], False)
        self.assertEqual(restored['magenta_core'], 0)
        self.assertNotIn('magenta_fade', document['settings'])
        self.assertEqual(render(128, restored), render(128, dict(DEFAULT_SETTINGS, magenta_fade=False, magenta_core=0)))

    def test_invalid_inputs_are_rejected_without_mutating_defaults(self):
        before = deepcopy(DEFAULT_SETTINGS)
        invalid = [
            {'diameters': [42, 50, 20]}, {'canvas_units': float('nan')},
            {'opacities': [.32, True, .88]}, {'dot_diameter': 0},
            {'colors': ['red', '#FFFF00', '#00FFFF']}, {'cyan_core': 1},
            {'unknown': 1}, {'dot_phase': [0]},
            {'formatVersion': True, 'settings': {}},
            {'magenta_fade': 'yes'}, {'magenta_core': 1},
            {'transparent_background': 'yes'},
        ]
        for settings in invalid:
            with self.subTest(settings=settings), self.assertRaises(SettingsError):
                normalize_settings(settings)
        self.assertEqual(DEFAULT_SETTINGS, before)

    def test_transparent_inks_have_real_coverage_without_a_white_matte(self):
        ink = dict(FLAT_INKS, transparent_background=True, opacities=[.5, .5, 0])
        _, rgba = pixels(render(64, ink), alpha=True)
        self.assertEqual(rgba(0, 0), (0, 0, 0, 0))
        # Two half-opaque magenta/yellow inks: 3/4 coverage, straight RGB 1,1/3,1/3.
        self.assertEqual(rgba(32, 31), (255, 85, 85, 191))
        _, normal = pixels(render(64, dict(ink, blend='normal')), alpha=True)
        self.assertEqual(normal(32, 31), (255, 170, 85, 191))
        _, empty = pixels(render(32, dict(ink, opacities=[0, 0, 0])), alpha=True)
        self.assertEqual(empty(16, 16), (0, 0, 0, 0))

    def test_transparent_fade_changes_alpha_instead_of_lightening_ink(self):
        ink = dict(FLAT_INKS, transparent_background=True, opacities=[1, 0, 0], magenta_fade=True, magenta_core=0)
        _, rgba = pixels(render(128, ink), alpha=True)
        self.assertEqual(rgba(88, 64)[:3], (255, 0, 255))
        self.assertEqual(rgba(112, 64)[:3], (255, 0, 255))
        self.assertGreater(rgba(64, 64)[3], rgba(88, 64)[3])
        self.assertGreater(rgba(88, 64)[3], rgba(112, 64)[3])
        self.assertLess(rgba(112, 64)[3], 15)

    def test_legacy_backgrounds_stay_opaque_and_new_transparency_round_trips(self):
        legacy = dict(DEFAULT_SETTINGS)
        legacy.pop('transparent_background')
        for document in [legacy, {'formatVersion': 1, 'settings': legacy}]:
            restored = normalize_settings(document)
            self.assertFalse(restored['transparent_background'])
            _, rgba = pixels(render(32, restored), alpha=True)
            self.assertEqual(rgba(0, 0), (255, 255, 255, 255))
        exported = {'formatVersion': 1, 'settings': DEFAULT_SETTINGS}
        self.assertEqual(normalize_settings(exported), DEFAULT_SETTINGS)
        self.assertTrue(normalize_settings({})['transparent_background'])


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = workbench.WorkbenchServer(0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        options = {'Content-Type': 'application/json', **(headers or {})}
        connection.request(method, path, json.dumps(body) if body is not None else None, options)
        response = connection.getresponse()
        data = response.read()
        status, mime = response.status, response.getheader('Content-Type')
        connection.close()
        return status, json.loads(data) if mime.startswith('application/json') else data

    def test_exported_settings_round_trip_and_preview_visibility(self):
        status, initial = self.request('GET', '/api/state')
        self.assertEqual(status, 200)
        payload = {'settings': {'formatVersion': 1, 'settings': initial['settings']}, 'size': 32}
        status, result = self.request('POST', '/api/render', payload)
        self.assertEqual(status, 200)
        self.assertEqual(result['settings'], initial['settings'])
        self.assertEqual(result['fingerprint'], initial['fingerprint'])
        self.assertTrue(result['png'].startswith('data:image/png;base64,'))
        status, hidden = self.request('POST', '/api/render', dict(payload, visible=[False, False, False]))
        self.assertEqual(status, 200)
        self.assertEqual(hidden['settings'], result['settings'])
        self.assertNotEqual(hidden['png'], result['png'])

    def test_no_checkout_routes_or_asset_writes(self):
        for path in ['/.git/config', '/../../package.json', '/assets/about.settings.json', '/api/apply']:
            self.assertEqual(self.request('GET', path)[0], 404)
        self.assertEqual(self.request('POST', '/api/apply', {'settings': DEFAULT_SETTINGS})[0], 404)
        status, html = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'About icon workbench', html)

    def test_cross_origin_and_invalid_render_requests(self):
        self.assertEqual(self.request('GET', '/api/state', headers={'Origin': 'https://example.org'})[0], 403)
        self.assertEqual(self.request('POST', '/api/render', {}, {'Host': 'example.org'})[0], 403)
        self.assertEqual(self.request('POST', '/api/render', {}, {'Content-Type': 'text/plain'})[0], 415)
        for payload in [[], {'settings': {} , 'size': 4096}, {'settings': {}, 'visible': [1, 1, 1]}]:
            self.assertEqual(self.request('POST', '/api/render', payload)[0], 422)

    def test_external_link_can_open_the_document_without_opening_the_api(self):
        navigation = {'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document'}
        self.assertEqual(self.request('GET', '/', headers=navigation)[0], 200)
        self.assertEqual(self.request('GET', '/api/state', headers=navigation)[0], 403)
        self.assertEqual(self.request('GET', '/', headers=dict(navigation, Host='example.org'))[0], 403)
        self.assertEqual(self.request('POST', '/api/render', {'settings': {}}, navigation)[0], 403)

    def test_busy_renderer_reports_recovery(self):
        with self.server.render_lock:
            status, result = self.request('POST', '/api/render', {'settings': {}})
        self.assertEqual(status, 409)
        self.assertIn('finishes', result['error'])


if __name__ == '__main__':
    unittest.main()
