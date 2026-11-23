"""Shared PNG renderer for the About asset and its local adjustment workbench."""

from copy import deepcopy
import json
import math
from pathlib import Path
import re
import struct
import zlib


SETTINGS_PATH = Path(__file__).resolve().parents[1] / 'assets/about.settings.json'
DEFAULT_SETTINGS = json.loads(SETTINGS_PATH.read_text(encoding='utf-8'))['settings']


class SettingsError(ValueError):
    def __init__(self, field, message):
        super().__init__(message)
        self.field = field


def clamp(value):
    return min(1.0, max(0.0, value))


def radial_fade(radius, core):
    t = clamp((radius - core) / (1 - core))
    return 1 - t * t * (3 - 2 * t)


def number(value, field, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise SettingsError(field, 'Enter a finite number.')
    if (minimum is not None and value < minimum) or (maximum is not None and value > maximum):
        raise SettingsError(field, f'Use a value from {minimum} to {maximum}.')
    return value


def layout(canvas_units, diameters, bottom_gaps):
    if isinstance(bottom_gaps, (int, float)):
        bottom_gaps = [bottom_gaps, bottom_gaps]
    radii = [diameter / 2 for diameter in diameters]
    centers = [(canvas_units / 2, canvas_units / 2)]
    for index, (parent, child, gap) in enumerate(zip(radii, radii[1:], bottom_gaps)):
        maximum = 2 * (parent - child)
        if not 0 <= gap <= maximum:
            raise SettingsError(f'bottom_gaps.{index}', f'Keep this bottom inset between 0 and {maximum:g} units so the disc stays inside its parent.')
        x, y = centers[-1]
        centers.append((x, y + parent - child - gap))
    return list(zip(centers, radii))


def normalize_settings(value):
    if not isinstance(value, dict):
        raise SettingsError('settings', 'Settings must be a JSON object.')
    exported = 'settings' in value
    if exported:
        if 'formatVersion' in value and (type(value['formatVersion']) is not int or value['formatVersion'] != 1):
            raise SettingsError('settings', 'This settings format is not supported. Use formatVersion 1.')
        value = value['settings']
        if not isinstance(value, dict):
            raise SettingsError('settings', 'Settings must be a JSON object.')
    value = deepcopy(value)
    if exported:
        # Earlier complete exports predate this optional effect. Their appearance
        # must not change when the project's new starting values enable it.
        value.setdefault('magenta_fade', False)
        value.setdefault('magenta_core', 0)
        value.setdefault('transparent_background', False)
    elif 'background' in value and 'transparent_background' not in value:
        # A legacy raw settings document with an explicit background is opaque.
        value['transparent_background'] = False
    if 'bottom_gap' in value:
        gaps = [value.pop('bottom_gap')] * 2
        if 'bottom_gaps' in value and value['bottom_gaps'] != gaps:
            raise SettingsError('bottom_gaps', 'Use bottom_gaps or the legacy bottom_gap, with matching values.')
        value['bottom_gaps'] = gaps
    unknown = set(value) - set(DEFAULT_SETTINGS)
    if unknown:
        raise SettingsError('settings', f'Unknown setting: {sorted(unknown)[0]}.')
    settings = deepcopy(DEFAULT_SETTINGS)
    settings.update(value)
    for field, length in [('diameters', 3), ('opacities', 3), ('bottom_gaps', 2), ('dot_phase', 2)]:
        if not isinstance(settings[field], list) or len(settings[field]) != length:
            raise SettingsError(field, f'Provide {length} values.')
        for index, item in enumerate(settings[field]):
            number(item, f'{field}.{index}')
    for field in ['canvas_units', 'dot_diameter', 'dot_gap', 'dot_angle', 'stripe_width', 'stripe_gap', 'stripe_angle', 'stripe_phase', 'cyan_core', 'magenta_core']:
        number(settings[field], field)
    number(settings['canvas_units'], 'canvas_units', 8, 512)
    diameters = settings['diameters']
    if not settings['canvas_units'] >= diameters[0] > diameters[1] > diameters[2] > 0:
        raise SettingsError('diameters', 'Use three decreasing positive diameters that fit inside the canvas.')
    for index, opacity in enumerate(settings['opacities']):
        number(opacity, f'opacities.{index}', 0, 1)
    for field in ['dot_diameter', 'stripe_width']:
        number(settings[field], field, 0.1, 512)
    for field in ['dot_gap', 'stripe_gap']:
        number(settings[field], field, 0, 512)
    for field in ['dot_angle', 'stripe_angle']:
        number(settings[field], field, -360, 360)
    number(settings['stripe_phase'], 'stripe_phase', -512, 512)
    for index, offset in enumerate(settings['dot_phase']):
        number(offset, f'dot_phase.{index}', -512, 512)
    number(settings['cyan_core'], 'cyan_core', 0, 0.99)
    number(settings['magenta_core'], 'magenta_core', 0, 0.99)
    if not isinstance(settings['magenta_fade'], bool):
        raise SettingsError('magenta_fade', 'Enable or disable the magenta edge fade with true or false.')
    if not isinstance(settings['transparent_background'], bool):
        raise SettingsError('transparent_background', 'Choose a transparent or opaque background with true or false.')
    if not isinstance(settings['colors'], list) or len(settings['colors']) != 3:
        raise SettingsError('colors', 'Provide three ink colors.')
    for field, color in [('background', settings['background']), *[(f'colors.{i}', c) for i, c in enumerate(settings['colors'])]]:
        if not isinstance(color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
            raise SettingsError(field, 'Use a six-digit hex color, such as #FF00FF.')
    settings['colors'] = [c.upper() for c in settings['colors']]
    settings['background'] = settings['background'].upper()
    if settings['blend'] not in ['multiply', 'normal']:
        raise SettingsError('blend', 'Choose multiply or normal blending.')
    layout(settings['canvas_units'], diameters, settings['bottom_gaps'])
    return settings


def geometry(settings):
    return [{'center': center, 'diameter': radius * 2} for center, radius in layout(settings['canvas_units'], settings['diameters'], settings['bottom_gaps'])]


def chunk(kind, data):
    payload = kind + data
    return struct.pack('>I', len(data)) + payload + struct.pack('>I', zlib.crc32(payload) & 0xFFFFFFFF)


def png_bytes(size, rgba):
    stride = size * 4
    rows = b''.join(b'\x00' + rgba[y * stride:(y + 1) * stride] for y in range(size))
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'sRGB', b'\x00') + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


def rgb_color(color):
    return tuple(int(color[i:i + 2], 16) for i in [1, 3, 5])


def render(size, settings):
    if isinstance(size, bool) or not isinstance(size, int) or not 16 <= size <= 4096:
        raise SettingsError('size', 'Use an integer output size from 16 to 4096 pixels.')
    settings = normalize_settings(settings)
    outer_circle, middle_circle, inner_circle = layout(settings['canvas_units'], settings['diameters'], settings['bottom_gaps'])
    (cx, my), mr = outer_circle
    (_, yy), yr = middle_circle
    (_, cy), cr = inner_circle
    unit_per_pixel = settings['canvas_units'] / size
    scale = 1 / unit_per_pixel
    dot_radius = settings['dot_diameter'] / 2
    dot_pitch = settings['dot_diameter'] + settings['dot_gap']
    stripe_half = settings['stripe_width'] / 2
    stripe_pitch = settings['stripe_width'] + settings['stripe_gap']
    angle = math.radians(settings['stripe_angle'])
    sin_angle, cos_angle = math.sin(angle), math.cos(angle)
    dot_angle = math.radians(settings['dot_angle'])
    ds, dc = math.sin(dot_angle), math.cos(dot_angle)
    phase_x, phase_y = settings['dot_phase']
    magenta_opacity, yellow_opacity, cyan_opacity = settings['opacities']
    core = settings['cyan_core']
    background = rgb_color(settings['background'])
    inks = [tuple(c / 255 for c in rgb_color(color)) for color in settings['colors']]
    transparent = settings['transparent_background']
    initial_alpha = 0 if transparent else 1
    initial_rgb = [c / 255 * initial_alpha for c in background]
    rgba = bytearray(bytes([0, 0, 0, 0] if transparent else [*background, 255]) * (size * size))
    for py in range(size):
        y = (py + 0.5) * unit_per_pixel
        if abs(y - my) > mr + unit_per_pixel:
            continue
        for px in range(size):
            x = (px + 0.5) * unit_per_pixel
            outer_distance = math.hypot(x - cx, y - my)
            outer = clamp((mr - outer_distance) * scale + 0.5)
            if outer == 0:
                continue
            local_x, local_y = x - cx - phase_x, y - my - phase_y
            dx = (dc * local_x + ds * local_y + dot_pitch / 2) % dot_pitch - dot_pitch / 2
            dy = (-ds * local_x + dc * local_y + dot_pitch / 2) % dot_pitch - dot_pitch / 2
            dots = clamp((dot_radius - math.hypot(dx, dy)) * scale + 0.5)
            magenta = magenta_opacity * outer * dots
            if settings['magenta_fade']:
                magenta *= radial_fade(outer_distance / mr, settings['magenta_core'])
            middle = clamp((yr - math.hypot(x - cx, y - yy)) * scale + 0.5)
            normal = -(x - cx) * sin_angle + (y - yy) * cos_angle - settings['stripe_phase']
            stripe_distance = abs((normal + stripe_pitch / 2) % stripe_pitch - stripe_pitch / 2)
            yellow = yellow_opacity * middle * clamp((stripe_half - stripe_distance) * scale + 0.5)
            radius = math.hypot(x - cx, y - cy) / cr
            cyan = cyan_opacity * radial_fade(radius, core)
            # Premultiplied source-over with alpha-aware multiply blending.
            # Uncovered backdrop contributes no ink; never matte against white.
            pixel, coverage = initial_rgb[:], initial_alpha
            for ink, alpha in zip(inks, [magenta, yellow, cyan]):
                for channel in range(3):
                    source = ink[channel]
                    blended = ((1 - coverage) * source + pixel[channel] * source
                               if settings['blend'] == 'multiply' else source)
                    pixel[channel] = pixel[channel] * (1 - alpha) + alpha * blended
                coverage = alpha + coverage * (1 - alpha)
            encoded = [round(255 * clamp(c / coverage)) for c in pixel] if coverage else [0, 0, 0]
            offset = (py * size + px) * 4
            rgba[offset:offset + 4] = bytes([*encoded, round(255 * coverage)])
    return png_bytes(size, rgba)
