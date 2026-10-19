#!/usr/bin/env python3
"""
Nachbearbeitung der KI-Rohbilder (Grafik-Spezifikation v2, Kap. 6 und 7.3): Zuschnitt, Größe,
Ankerpunkt, nahtlose Texturen, WebP-Export nach public/assets und Eintrag ins Manifest.

    python3 scripts/art-postprocess.py               alle Einträge aus art/scenario/selection.json
    python3 scripts/art-postprocess.py prop/rock_1   nur diese Schlüssel

Typen:
- texture:  mittiges Quadrat, 512 × 512, durch Überblenden mit der halb versetzten Kopie nahtlos
- object:   freigestelltes Bild auf die Deckkraft-Box zuschneiden, Fußpunkt unten mittig (anchorY 0,95),
            quadratisch, Kantenlänge "size" (256 oder 512)
- portrait: 512 × 512, deckend
Benötigt Pillow (mit WebP-Unterstützung).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SELECTION = ROOT / 'art/scenario/selection.json'
OUT = ROOT / 'public/assets'
MANIFEST = OUT / 'manifest.json'
FOOT = 0.95  # Fußpunkt der Objekte (Anteil der Bildhöhe), entspricht dem Standard-anchorY für prop


def center_square(im: Image.Image) -> Image.Image:
    s = min(im.size)
    x, y = (im.width - s) // 2, (im.height - s) // 2
    return im.crop((x, y, x + s, y + s))


def seamless(im: Image.Image) -> Image.Image:
    """Überblendet das Bild mit seiner um die halbe Kantenlänge versetzten Kopie.

    Am Rand stammt das Ergebnis aus der Bildmitte der versetzten Kopie (kachelt dadurch nahtlos),
    in der Mitte aus dem Original (verdeckt die Naht der Kopie)."""
    w, h = im.size
    shifted = ImageChops.offset(im, w // 2, h // 2)
    ramp_x = Image.linear_gradient('L').rotate(90).resize((w, h))  # 0 links … 255 rechts
    tent_x = ImageChops.subtract(Image.new('L', (w, h), 255), ImageChops.difference(ramp_x, Image.new('L', (w, h), 128)).point(lambda v: min(255, v * 2)))
    tent_y = tent_x.rotate(90)
    mask = ImageChops.multiply(tent_x, tent_y).point(lambda v: min(255, int(v * 1.6)))
    return Image.composite(im, shifted, mask)


def process_texture(im: Image.Image) -> Image.Image:
    return seamless(center_square(im.convert('RGB')).resize((512, 512), Image.LANCZOS))


def process_object(im: Image.Image, size: int) -> Image.Image:
    im = im.convert('RGBA')
    alpha = im.getchannel('A').point(lambda v: 255 if v > 12 else 0)
    box = alpha.getbbox()
    if not box:
        raise ValueError('leeres Bild')
    obj = im.crop(box)
    side = max(obj.width, obj.height / FOOT)
    scale = size / side
    obj = obj.resize((max(1, round(obj.width * scale)), max(1, round(obj.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(obj, ((size - obj.width) // 2, round(size * FOOT) - obj.height))
    return canvas


def process_portrait(im: Image.Image) -> Image.Image:
    return center_square(im.convert('RGB')).resize((512, 512), Image.LANCZOS)


def main() -> None:
    selection = json.loads(SELECTION.read_text())['assets']
    keys = sys.argv[1:] or list(selection)
    manifest = json.loads(MANIFEST.read_text())
    for key in keys:
        entry = selection[key]
        src = Image.open(ROOT / entry['from'])
        kind = entry['type']
        if kind == 'texture':
            out, quality = process_texture(src), 82
        elif kind == 'object':
            out, quality = process_object(src, entry.get('size', 256)), 85
        elif kind == 'portrait':
            out, quality = process_portrait(src), 82
        else:
            raise SystemExit(f'{key}: unbekannter Typ {kind}')
        rel = f'{key}.webp'
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, 'WEBP', quality=quality, method=6)
        sprite = {'file': rel}
        sprite.update({k: entry[k] for k in ('anchorX', 'anchorY', 'scale') if k in entry})
        manifest['sprites'][key] = sprite
        print(f'{key:28} {out.width}×{out.height}  {dest.stat().st_size // 1024} KB')
    manifest['sprites'] = dict(sorted(manifest['sprites'].items()))
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
