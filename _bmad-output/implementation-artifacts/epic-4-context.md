# Epic 4 Context: Product Quality And Adoption

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make bmad-viewer more trustworthy, easier to adopt, and easier to maintain as a product. This covers three things: broader automated test coverage around the board and the external integrations, refreshed setup and usage documentation so new users can get started without reverse engineering the repo, and a stable lint and release baseline so packaging and releases stay predictable. This matters because the viewer has become an editable operating surface (board writes to `sprint-status`, auto-syncs to GitHub), and regressions there directly damage trust. Note: no PRD, architecture, or UX documents exist in the planning artifacts. This context comes from the epics file, the product brief, and the research notes.

## Stories

- Story 4.1: Test Coverage For Board And Integrations
- Story 4.2: Documentation And Onboarding Refresh
- Story 4.3: Release Quality And Lint Stability

## Requirements & Constraints

- Behavior must be able to change without breaking user trust. Tests should protect board state transitions and sync planning, which already have a meaningful correctness baseline.
- Known quality gaps to close:
  - more end-to-end UI confidence
  - coverage of integration failure paths
  - lint that passes reliably across the whole repo
  - smoke checks aimed at releases
- Existing tests cover sprint-status updates, GitHub issue mapping, GitHub sync config normalization, integration persistence, and core parsing utilities. Extend these; do not duplicate them.
- Onboarding docs must let a new user set up and use the viewer without reading the source. They should cover:
  - launching via the CLI (auto-detects the BMAD project)
  - wiki and project dashboard views, plus search
  - live reload
  - the editable board backed by `sprint-status`
  - optional GitHub sync
- Documentation must be accurate about current limits:
  - The viewer depends on the local BMAD folder structure (`_bmad/`, `_bmad-output/`) being present and following naming conventions.
  - GitHub is the only implemented external integration. Jira and Azure DevOps are planned, not available.
- The repo must pass a stable quality baseline (lint, tests) so that packaging and releases are predictable.

## Technical Decisions

- The filesystem is the database. There is no separate persistence layer for core BMAD state, so tests should use fixture BMAD directory structures rather than mocking a store.
- Runtime pipeline: the CLI resolves the target directory, BMAD detection runs, an in-memory data model is built from `_bmad/` and `_bmad-output/`, the server renders one HTML dashboard, and the browser client handles hash-based routing and interactions. File watchers and a websocket trigger rebuilds and refreshes.
- Central aggregation lives in the data model module. It loads:
  - the module catalog
  - planning artifacts
  - `epics.md`
  - `sprint-status`
  - story docs
  - research and analysis artifacts

  It is the main seam for parsing and loading tests.
- BMAD local files are canonical. GitHub is synchronized from BMAD, not the other way around. Tests and docs must preserve that one-way source-of-truth model. Sync triggers:
  - manual preview and sync
  - automatic sync on board drag updates
  - Project board creation and reuse
- Integration settings are stored locally. Secret storage is a known area that is not yet hardened. Docs should not overstate how securely tokens are stored.

## UX & Interaction Patterns

- The interactions that need confidence-oriented test coverage:
  - dragging cards between BMAD states, with the result persisted to `sprint-status`
  - live counters and progress updates
  - save and sync feedback
  - modal-driven platform connect and sync flows
- In docs, present the local board as the primary surface. Present platform integrations as secondary and optional.

## Cross-Story Dependencies

- Story 4.3 (lint/release baseline) and Story 4.1 (tests) both feed the same quality gate. Tests added in 4.1 must pass under the 4.3 baseline.
- Story 4.2's documentation should match the board (Epic 2) and GitHub sync (Epic 3) behavior that 4.1 verifies.
- Epic 5 (VS Code extension) will reuse the viewer core, data model and renderer. A stable test and lint baseline here lowers the risk of extracting that core later.
