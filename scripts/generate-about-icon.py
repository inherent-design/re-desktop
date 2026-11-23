#!/usr/bin/env python3
"""Generate the re:desktop About PNG from reviewed settings, using only Python's standard library."""

import argparse
import json
from pathlib import Path

from icon_artwork import DEFAULT_SETTINGS, geometry, normalize_settings, render


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--settings', type=Path, help='exported workbench settings; defaults to assets/about.settings.json')
    parser.add_argument('--size', type=int, default=1024)
    parser.add_argument('--metadata', type=Path)
    for name in ['canvas-units', 'background-corner-radius', 'dot-diameter', 'dot-gap', 'dot-angle', 'stripe-width', 'stripe-gap', 'stripe-angle', 'stripe-phase', 'cyan-core', 'magenta-core']:
        parser.add_argument('--' + name, type=float)
    parser.add_argument('--magenta-fade', action=argparse.BooleanOptionalAction, default=None)
    for name, count in [('diameters', 3), ('opacities', 3), ('bottom-gaps', 2), ('dot-phase', 2)]:
        parser.add_argument('--' + name, type=float, nargs=count)
    parser.add_argument('--bottom-gap', type=float, help='legacy shortcut: set both bottom insets')
    parser.add_argument('--colors', nargs=3)
    parser.add_argument('--background')
    parser.add_argument('--transparent-background', action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument('--blend', choices=['multiply', 'normal'])
    args = parser.parse_args()
    try:
        base = json.loads(args.settings.read_text(encoding='utf-8')) if args.settings else DEFAULT_SETTINGS
        settings = normalize_settings(base)
        overrides = {key: value for key, value in vars(args).items()
                     if key not in {'output', 'size', 'metadata', 'settings'} and value is not None}
        if args.background is not None and args.transparent_background is None:
            overrides['transparent_background'] = False
        if 'bottom_gap' in overrides:
            if 'bottom_gaps' in overrides:
                parser.error('choose --bottom-gap or --bottom-gaps')
            overrides['bottom_gaps'] = [overrides.pop('bottom_gap')] * 2
        settings = normalize_settings(dict(settings, **overrides))
        image = render(args.size, settings)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(image)
    if args.metadata:
        metadata = {'formatVersion': 1, 'size_px': args.size, 'settings': settings, 'circles': geometry(settings)}
        args.metadata.write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'size_px': args.size,
                      'bottom_gaps': settings['bottom_gaps'], 'bytes': len(image)}))


if __name__ == '__main__':
    main()
