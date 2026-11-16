"""Logo „Červená niť" — wordmark, ikona, favicon a OG obrázok.

    python3 packages/web/scripts/logo.py <priečinok so zdrojovými TTF>

Text loga sa prevedie na krivky z Bricolage Grotesque 800. Logo potom
nezávisí od toho, či sa webfont stihol načítať, a favicon, apple-touch-icon aj
OG obrázok (ktoré prehliadač ani sociálne siete s webfontom nevykreslia)
vyzerajú rovnako ako hlavička.

Výstup:
  src/components/logo-paths.js   krivky pre komponent Logo
  public/favicon.svg
  public/apple-touch-icon.png    180 × 180   (cez rsvg-convert)
  public/og-image.png            1200 × 630  (cez rsvg-convert)

Geometria je prevzatá z `design_handoff_cervena_nit/navrh.html`, sekcia Logo.
"""

import os
import subprocess
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(__file__)
WEB = os.path.join(HERE, "..")

# Niť a špendlíky wordmarku (viewBox 260 × 56).
THREAD = "M14 44 C 60 54, 110 34, 150 46 S 205 40, 222 30"
PINS = [(14, 44), (222, 30)]
# Niť ikony (viewBox 52 × 52).
ICON_THREAD = "M10 44 C 22 50, 34 30, 44 14"
ICON_PINS = [(10, 44), (44, 14)]

DARK = "#151312"
ACCENT_ON_DARK = "#ff4a40"


def text_path(font, text, x, y, size, tracking):
    """Krivky textu v súradniciach SVG (y rastie nadol)."""
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    pen = SVGPathPen(glyphs)
    cursor = x
    for char in text:
        name = cmap[ord(char)]
        glyph = glyphs[name]
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
        cursor += glyph.width * scale + tracking
    return pen.getCommands(), cursor - tracking


def round_path(d):
    """Dve desatinné miesta stačia — logo sa nikdy nezväčší na tisíce px."""
    out, number = [], ""
    for ch in d + " ":
        if ch.isdigit() or ch in ".-" and (ch != "-" or not number):
            number += ch
            continue
        if number:
            out.append(f"{float(number):.2f}".rstrip("0").rstrip("."))
            number = ""
        out.append(ch)
    return "".join(out).strip()


def main(src):
    font = TTFont(os.path.join(src, "BricolageGrotesque[opsz,wdth,wght].ttf"))
    font = instancer.instantiateVariableFont(font, {"wdth": 100, "wght": 800, "opsz": 31})

    word, word_end = text_path(font, "dosleduj.to", 2, 34, 31, -1.4)
    word = round_path(word)
    icon, _ = text_path(font, "d", 7, 36, 34, 0)
    icon = round_path(icon)

    with open(os.path.join(WEB, "src", "components", "logo-paths.js"), "w") as out:
        out.write(
            "// Vygenerované skriptom packages/web/scripts/logo.py — needitovať ručne.\n"
            "// Krivky textu „dosleduj.to\" a „d\" z Bricolage Grotesque 800.\n\n"
            f'export const WORDMARK = "{word}";\n'
            f'export const WORDMARK_THREAD = "{THREAD}";\n'
            f"export const WORDMARK_PINS = {PINS!r};\n".replace("(", "[").replace(")", "]")
            + f'export const ICON = "{icon}";\n'
            f'export const ICON_THREAD = "{ICON_THREAD}";\n'
            f"export const ICON_PINS = {ICON_PINS!r};\n".replace("(", "[").replace(")", "]")
        )

    pins = "".join(f'<circle cx="{x}" cy="{y}" r="4" fill="{ACCENT_ON_DARK}"/>' for x, y in ICON_PINS)
    icon_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">'
        f'<rect width="52" height="52" rx="6" fill="{DARK}"/>'
        f'<path d="{icon}" fill="#fff"/>'
        f'<path d="{ICON_THREAD}" fill="none" stroke="{ACCENT_ON_DARK}" stroke-width="2.6" stroke-linecap="round"/>'
        f"{pins}</svg>\n"
    )
    public = os.path.join(WEB, "public")
    with open(os.path.join(public, "favicon.svg"), "w") as out:
        out.write(icon_svg)

    # OG: wordmark na tmavom podklade, s poslaním pod ním.
    word_pins = "".join(f'<circle cx="{x}" cy="{y}" r="4.5" fill="{ACCENT_ON_DARK}"/>' for x, y in PINS)
    og_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
        f'<rect width="1200" height="630" fill="{DARK}"/>'
        '<g transform="translate(160 190) scale(3.4)">'
        f'<path d="{word}" fill="#fff"/>'
        f'<path d="{THREAD}" fill="none" stroke="{ACCENT_ON_DARK}" stroke-width="2.4" stroke-linecap="round"/>'
        f"{word_pins}</g></svg>\n"
    )
    og_path = os.path.join(public, "og-image.svg.tmp")
    with open(og_path, "w") as out:
        out.write(og_svg)
    icon_path = os.path.join(public, "favicon.svg")

    subprocess.run(["rsvg-convert", "-w", "1200", "-h", "630", og_path, "-o",
                    os.path.join(public, "og-image.png")], check=True)
    subprocess.run(["rsvg-convert", "-w", "180", "-h", "180", icon_path, "-o",
                    os.path.join(public, "apple-touch-icon.png")], check=True)
    os.remove(og_path)
    print(f"wordmark šírka {word_end:.1f} z 260")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
