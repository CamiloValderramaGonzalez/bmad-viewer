# Epic 2 Context: Real BMAD Board Workflow

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the project dashboard from a passive status display into a real working board for BMAD status management. The board should fill itself automatically from the project's real planning and implementation files, let users move cards between BMAD states with the change written back to `sprint-status`, and stay compact and comfortable during daily use, with clear feedback when saves and syncs happen. This matters because the product exists to keep local BMAD state visible, editable and truthful without the cost of asking an agent for project status. (Note: no PRD, architecture or UX spec exists in the planning artifacts. This context comes from the epics file, the product brief and the research notes.)

## Stories

- Story 2.1: Load Planning And Implementation Artifacts
- Story 2.2: Drag And Drop Local Status Persistence
- Story 2.3: Board UX Polish And Status Feedback

## Requirements & Constraints

- The board must reflect real BMAD files with no extra setup. Planning artifacts, epic/story structure, sprint status and implementation story docs fill it automatically.
- Local BMAD state must stay editable and truthful. A card moved on the board must be saved to `sprint-status`, and the board must match the file afterwards.
- The interface must stay compact and uncluttered, even as project metadata and platform integration controls grow.
- Save and sync results must be visible to the user, so it is clear whether a status change was saved locally and synced outward.
- The viewer currently depends on the local BMAD folder structure being present. Some UX flows still need refinement for real production-sized projects.

## Technical Decisions

- **The filesystem is the database.** No separate persistence layer for core BMAD state. Board state is read from and written to `sprint-status`.
- **Convention over schema.** Loading depends on the standard BMAD layout: the module catalog in `_bmad/`, project context in `_bmad-output/planning-artifacts`, epics/stories from `epics.md`, board state from `sprint-status`, and story docs from implementation artifacts. Artifact naming and folder layout must stay consistent.
- **One central aggregation point.** All loading flows through the data model module, which builds an in-memory model. The server renders a single HTML dashboard, and the browser client handles routing and interactions.
- **Live refresh.** File watchers rebuild the model when project files change and push updates to the browser over websocket. Board writes will trigger this refresh, so the client must handle it without UI flicker or a conflicting state.
- **BMAD is canonical for sync.** External platforms (currently GitHub) receive changes from BMAD and are not read back by default. Drag updates on the board can trigger an automatic outward sync, so status feedback must cover both the local save and the sync result.
- **Test expectations.** Sprint status update behavior already has automated tests. State-transition correctness is a core quality baseline and must be kept.

## UX & Interaction Patterns

- The dashboard has two lenses: a wiki lens (methodology browsing) and a project lens (metrics, kanban, artifacts). It also has a search modal and an integration modal. Routing is hash-based.
- Cards move between BMAD states by drag-and-drop. Counters and progress update live after a move.
- The local BMAD board stays the primary operating surface. Platform integration controls should feel secondary, compact and contextual, never competing with the board.
- Platform connection and sync actions happen in modals.

## Cross-Story Dependencies

- 2.2 depends on 2.1: cards and states must load from real artifacts before moves can be saved.
- 2.3 builds on 2.2's save path and on the GitHub sync from Epic 3 (automatic sync on drag) to show save and sync feedback.
- Epic 4 (test coverage, release/lint quality) covers board behavior. Epic 5 (VS Code extension) will host this same board in a webview, so board UI and client logic should stay reusable.
