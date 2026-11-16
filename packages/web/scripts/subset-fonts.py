"""Zúžené písma pre verejný web (dizajn „Červená niť").

Spúšťa sa ručne, keď sa mení rodina, rez alebo rozsah znakov:

    pip install "fonttools[woff]"
    python3 packages/web/scripts/subset-fonts.py <priečinok so zdrojovými TTF>

Zdrojové TTF sú variabilné písma z repozitára google/fonts (`ofl/…`), nie
z Google Fonts CSS API — to s moderným User-Agentom vracia rozdelené subsety
(latin, latin-ext) a z písma by vypadli znaky z iného slice.

- Bricolage Grotesque zostáva variabilná v osi `opsz` (optical size je súčasť
  dizajnu: veľké nadpisy majú užšie medzery a ostrejšie tvary). Os `wght` sa
  zúži na 700–800 a `wdth` sa zafixuje na 100.
- Source Sans 3 a Geist Mono sa rozpadnú na statické rezy — sú menšie než
  variabilný súbor a potrebujeme len pár hrúbok.
"""

import os
import sys

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Latinka, Latin-1 (nemecké prehlásky, § ©, ×), Latin Extended-A (slovenská
# a česká diakritika), typografické úvodzovky a pomlčky, €, šípky a trojuholníky
# pre trend (▲ ▼), mínus.
UNICODES = [
    *range(0x20, 0x7F),
    *range(0xA0, 0x100),
    *range(0x100, 0x180),
    0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
    0x2022, 0x2026, 0x2032, 0x20AC, 0x2190, 0x2191, 0x2192, 0x2193,
    0x2212, 0x25B2, 0x25BC, 0x2009, 0x202F,
]

FEATURES = ["kern", "liga", "calt", "tnum", "pnum", "lnum", "case"]

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "fonts")


def subset(font):
    """Podmnožina sa robí pred inštancovaním — opačné poradie padá na lenivo
    načítanej tabuľke `gvar` (fontTools 4.6x)."""
    options = Options()
    options.layout_features = FEATURES
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    return font


def write(font, name):
    path = os.path.join(OUT, name)
    font.flavor = "woff2"
    font.save(path)
    print(f"{name:32} {os.path.getsize(path) / 1024:6.1f} kB")


def main(src):
    os.makedirs(OUT, exist_ok=True)

    bricolage = subset(TTFont(os.path.join(src, "BricolageGrotesque[opsz,wdth,wght].ttf")))
    bricolage = instancer.instantiateVariableFont(bricolage, {"wdth": 100, "wght": (700, 800)})
    write(bricolage, "bricolage-grotesque-var.woff2")

    for weight in (400, 600):
        font = subset(TTFont(os.path.join(src, "SourceSans3[wght].ttf")))
        write(instancer.instantiateVariableFont(font, {"wght": weight}), f"source-sans-3-{weight}.woff2")

    for weight in (400, 500, 600):
        font = subset(TTFont(os.path.join(src, "GeistMono[wght].ttf")))
        write(instancer.instantiateVariableFont(font, {"wght": weight}), f"geist-mono-{weight}.woff2")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
