# PATCH NOTES — v218.77 AIRPORT NAMES ONLY

## Scope
Airport/city label fix only. No ads, aircraft, logos, or layout changes.

## Fixed
- Removed the v218.63 city normalizer that was rewriting mobile/desktop labels.
- Fixed normalizeDisplayCity so it never strips a bare code from inside a city word.
- Fixed code-only labels:
  - YYZ(YYZ) -> Toronto (YYZ)
  - PDX(PDX) -> Portland (PDX)
  - (SEA) -> Seattle (SEA)
- Fixed duplicated explicit labels:
  - Toronto (ytz) (YTZ) -> Toronto (YTZ)
- Fixed top banner code stripping so it no longer removes the whole city.
