# England and Wales Age-Specific Migration Network Atlas

Interactive atlas of age-specific inter-local-authority migration networks in England and Wales for year ending June 2012–2025, harmonised to the December 2023 LAD geography.

## Public website

`https://junyaohe001.github.io/EnglandAndWalesRelocationNetwork/`

## Public data boundary

The repository contains only aggregate LAD-level estimates and simplified geography required by the visualisation. It does not contain individual or record-level migration data, raw ONS workbooks, local file paths, processing caches, or source workbook filenames.

## Interaction

- Switch year and age group.
- Compare migration balance, net flow, inflow, outflow and total activity.
- Display the strongest directed OD flows.
- Search and select LADs.
- Inspect published inbound and outbound connections.
- View LAD-level 2012–2025 trends.

## Compact deployment

The published browser data are stored in 34 Base64 text parts registered by `data/package-manifest.json`. The package contains a gzip-compressed map payload and a gzip-compressed numeric network bundle. This avoids publishing processing intermediates while keeping the static GitHub Pages site self-contained.
