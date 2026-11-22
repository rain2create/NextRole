"""Build local UI webfonts. Requires fonttools[woff] and the two upstream TTF files.

Usage: python scripts/subset-ui-fonts.py /path/to/Nunito.ttf /path/to/LXGWWenKaiGBScreen.ttf
Run again after adding Chinese UI copy. Fonts are used by the interface, never resume PDFs.
"""
import hashlib
from pathlib import Path
import sys
from fontTools import subset

root = Path(__file__).resolve().parents[1]
out = root / "public" / "fonts"
out.mkdir(exist_ok=True)
text = "".join(p.read_text(encoding="utf-8") for folder in ("app", "lib")
               for p in (root / folder).rglob("*") if p.suffix in (".tsx", ".ts"))
characters = set(map(ord, text)) | set(range(32, 256)) | set(range(0x3000, 0x3040))

def build(source, destination, unicodes):
    options = subset.Options()
    options.flavor = "woff2"
    options.name_IDs = ["*"]
    font = subset.load_font(source, options)
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    subset.save_font(font, str(out / destination), options)
    digest = hashlib.sha256(Path(source).read_bytes()).hexdigest()
    print(f"{destination}: {(out / destination).stat().st_size:,} bytes; source SHA256 {digest}")

build(sys.argv[1], "nunito-latin.woff2", set(range(32, 0x250)) | set(range(0x2000, 0x2070)))
build(sys.argv[2], "wenkai-ui.woff2", characters)
