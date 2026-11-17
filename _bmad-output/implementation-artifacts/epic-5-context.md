# Epic 5 Context: VS Code Extension Experience

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make bmad-viewer a first-class Visual Studio Code experience, so developers can open, browse and operate their BMAD project from inside the editor instead of switching to a separate browser workflow. The epic covers three things: an extension that hosts the existing viewer dashboard in the editor, workspace-aware BMAD detection with open, refresh and sync actions, and a polished UX with settings, activation behavior and a safe packaging and publishing strategy. Editor embedding is the product's next frontier. It reduces the cost of recovering context for developers by putting the visual BMAD board where they already work. Note: there are no PRD, architecture or UX documents in the planning artifacts. This context comes from the epics file, the product brief and the research notes.

## Stories

- Story 5.1: Extension Scaffold And Embedded Viewer Host
- Story 5.2: Workspace BMAD Detection And Local Actions
- Story 5.3: VS Code UX, Settings And Distribution

## Requirements & Constraints

- The extension must show the BMAD board and dashboard inside VS Code, in a webview or sidebar view. Users must not need the separate browser workflow.
- BMAD local files (`_bmad/`, `_bmad-output/`, `sprint-status`) remain the primary source of truth. The extension is a view and operating surface over them, not a new store.
- The extension must detect the BMAD project in the current workspace and expose commands for open, refresh and sync.
- The extension must ship with user-facing settings, sensible activation behavior and a packaging strategy, so it can be adopted and published to a marketplace safely.
- Current product limits still apply:
  - The viewer depends on the local BMAD folder structure and naming conventions being present.
  - GitHub is the only implemented external integration. Jira and Azure DevOps are planned, not available.
- Secret storage for integration tokens is not hardened yet. Safer secret storage is an explicit gap to address before marketplace distribution.

## Technical Decisions

- Build the extension as a project inside this repository. Do not create a separate repo.
- Reuse the current viewer core, or extract it into a shared module. The CLI and the extension should share one core. Don't fork it. The reusable pieces are:
  - the data model that aggregates `_bmad/` and `_bmad-output/`
  - the renderer that emits HTML
  - the client-side interaction layer
- The filesystem is intentionally the database. Don't add a persistence layer for core BMAD state.
- The existing runtime pipeline works like this:
  1. The CLI resolves the target directory.
  2. BMAD detection runs.
  3. An in-memory data model is built.
  4. The server renders one HTML dashboard.
  5. The browser client handles hash-based routing and interactions.
  6. File watchers and a websocket trigger rebuilds and refreshes.

  The extension needs equivalents for the detection, rendering, refresh and interaction-transport steps inside the VS Code host.
- Sync stays one-way from BMAD to GitHub. That covers manual preview and sync, automatic sync after board updates, and Project board creation and reuse. Extension-triggered sync must preserve this model.

## UX & Interaction Patterns

- The embedded dashboard should keep the existing interactions:
  - wiki and project lenses
  - search modal
  - drag and drop between BMAD states, persisted to `sprint-status`
  - live counters and progress
  - save and sync feedback
  - modal-driven integration flows
- The local BMAD board stays the primary operating surface. Platform integrations should feel secondary, compact and contextual. This avoids clutter, which matters more in the narrower editor panes.

## Cross-Story Dependencies

- 5.1 provides the host that 5.2's detection and commands target. 5.3 polishes, configures and packages what 5.1 and 5.2 deliver.
- The epic depends on the board (Epic 2) and GitHub sync (Epic 3) behaving the same way when embedded. It also relies on the test and lint baseline from Epic 4, which makes extracting the shared core safer.
