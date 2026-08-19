# Public data notes

## Source-derived structure

The uploaded pipeline harmonises annual ONS detailed internal-migration estimates to a common December 2023 Local Authority District geography and produces 14 years (2012–2025) × five age-group layers.

The age groups are Teenagers (15–20), Young adults (20–40), Prime working age (30–50), Older working age (50–65), and Elderly (65+). The 20–40 and 30–50 layers overlap at ages 30–39 by design.

## Network definition

Each layer is a directed origin–destination network. Nodes are 318 LADs in England and Wales. Directed edges represent estimated migration from an origin LAD to a destination LAD for the selected age group and year ending June.

## Public edge coverage

Each layer contains the 4,000 strongest directed edges from the complete processed network. The interface reports the retained share of total layer flow. Summary statistics refer to the complete layer.

## Main metrics

- Inflow and outflow strengths
- Total migration activity
- Net migration
- In- and out-degree
- Migration balance index `(inflow - outflow) / (inflow + outflow)`
- Flow-weighted mean inbound and outbound distance
- Network reciprocity, distance and inequality summaries
