# NextRole interface fonts

- **Nunito** by Vernon Adams, Cyreal and Jacques Le Bailly: rounded Latin UI text. Source: https://github.com/google/fonts/tree/main/ofl/nunito (`Nunito[wght].ttf`). License: [OFL-Nunito.txt](OFL-Nunito.txt).
- **LXGW WenKai GB Screen v1.530**: Chinese headings, buttons and navigation in the soft themes. Source: https://github.com/lxgw/LxgwWenKai-Screen/releases/tag/v1.530 (`LXGWWenKaiGBScreen.ttf`). License and webfont-subsetting permission: [OFL-WenKai.txt](OFL-WenKai.txt).

Both files are self-hosted WOFF2 web subsets. Browsing NextRole does not request fonts from an external server. The Chinese subset covers text in `app/` and `lib/`; missing characters fall back to the device's Chinese sans-serif font. Body copy, input values and tables use the reading font stack. Generated resume PDFs are unaffected.

Regenerate with `python scripts/subset-ui-fonts.py <Nunito.ttf> <LXGWWenKaiGBScreen.ttf>` after installing `fonttools[woff]` and obtaining the source fonts. Keep both license files with the font assets. Font files are licensed under OFL, separately from the application's MIT license.
