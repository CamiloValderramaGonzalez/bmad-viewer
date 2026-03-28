# GitHub Sync Architecture

## Current Capability

GitHub is the first external platform supported by `bmad-viewer`.

## Implemented Pieces

- local integration storage
- GitHub API client
- BMAD to GitHub issue mapping
- manual preview and sync
- automatic sync on local board drag updates
- GitHub Project board creation and reuse

## Source Of Truth

BMAD local files remain canonical. GitHub is synchronized from BMAD, not the other way around by default.

## Remaining Gaps

- richer BMAD-specific project fields
- conflict detection
- selective sync
- pull-back sync rules
- safer secret storage if the product moves toward marketplace distribution
