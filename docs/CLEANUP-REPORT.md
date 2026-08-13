# Repository cleanup record

Completed locally on 2026-08-12. This cleanup did not publish or change the
production site.

## Result

| Public web root | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Files | 3,554 | 2,950 | 604 |
| Disk use | 277,708 KB | 180,964 KB | 96,744 KB (about 94.5 MiB) |

## Removed

- 414 byte-identical Fairmont files with Finder copy suffixes.
- The unreferenced `various-assorted-images` collection.
- Superseded previews, QA probes, prototypes, 3D demos, and one-time scripts.
- Duplicate font kits, hotel and airline logos, source archives, and source
  formats that had deployable web equivalents.
- Stale patch notes, manual inventories, and the broken package-publishing
  workflow.
- Developer tools, tests, and Worker source from the public web root; useful
  files were moved to repository-only folders instead of discarded.

## Kept deliberately

- Airline and aircraft filename aliases that the live renderer may construct
  from flight data.
- Active layered display styles and the shared renderer, even where they need
  later restructuring.
- Original artwork when it is the only working asset for a live brand.

Every deleted tracked file remains recoverable from Git history.

## Safeguards added

- A generated asset manifest replaces the stale hand-maintained inventory.
- Automated checks reject developer debris, Finder-copy names, hidden control
  characters, unsupported root pages, and broken literal local references.
- The root README and file map identify the public site, tests, tools,
  documentation, streaming helpers, and Worker source.
