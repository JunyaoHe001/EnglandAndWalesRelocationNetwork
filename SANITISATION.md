# Sanitisation and public-data boundary

The deployment package was rebuilt from the web-ready aggregate output. Only fields needed by the interactive atlas were retained.

## Excluded

- Raw ONS Excel workbooks
- Row-level workbook data
- Processing caches and QA previews
- Local filesystem and cloud-storage paths
- Source workbook filenames and worksheet names
- Dependency/bootstrap logs
- Any individual or record-level migration information

## Retained

- Simplified 2023 LAD display geometry
- LAD codes and names
- Aggregate year–age-group node metrics
- The 4,000 strongest directed flows per layer
- Aggregate network summaries
- Aggregate LAD time series

The public data are aggregate spatial-network estimates. No personal identifiers are present.
