# Epic 3 Context: External Platform Sync

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let teams push BMAD epics and stories outward to the engineering platforms they deliver on (GitHub first, then Jira and Azure DevOps), while the local BMAD files stay the single source of truth. Sync is optional and opt-in. It exists so external execution stays aligned with the local methodology without making the viewer depend on any external system. Note: there is no formal PRD, architecture or UX spec for this project. This context is distilled from the product brief and the project research notes, so sync behavior for Jira and Azure DevOps is only lightly specified.

## Stories

- Story 3.1: GitHub Issues And Project Board Sync
- Story 3.2: Jira Connector And State Mapping
- Story 3.3: Azure DevOps Connector And State Mapping

## Requirements & Constraints

- BMAD local files (`epics.md`, `sprint-status`, story docs) are canonical. External platforms are synchronized *from* BMAD. By default nothing is pulled back.
- Sync must be optional: the viewer has to work fully with no integration configured.
- Each platform must map BMAD work onto its own model:
  - GitHub: issues plus a GitHub Project board that is created or reused.
  - Jira: issue types and valid workflow transitions.
  - Azure DevOps: work items and valid states. Status changes must be safe, so invalid state moves must not be attempted.
- Users must be able to preview a sync before running it manually. Moving a card on the local board can also trigger a sync automatically.
- Known open gaps, not yet required unless a story says otherwise: richer BMAD-specific project fields, conflict detection, selective sync, pull-back sync rules, and safer secret storage (this matters if the product is distributed through a marketplace).
- Quality: mapping logic, config normalization and integration persistence need automated tests. Coverage of integration failure paths is a known weak spot, so add tests for it where you can.

## Technical Decisions

- The filesystem is the database. Do not add a separate persistence layer for core BMAD state. Integration settings live in local integration storage.
- Keep the sync pipeline layered: a platform API client, a mapper from BMAD to the platform, a sync planner that produces the preview, and a sync executor. New connectors (Jira, Azure DevOps) should follow the shape the GitHub implementation already uses.
- Epic and story structure comes from the central data model, which parses `epics.md` and `sprint-status`. Connectors consume that model and do not re-parse files.
- Board status writes go to `sprint-status` first. Auto-sync runs only after that local write.
- Changes to project files trigger file watchers and a websocket live reload. Sync feedback must survive the reload.

## UX & Interaction Patterns

- The local BMAD board stays the main operating surface. Platform integrations should feel secondary, compact and contextual.
- Connecting a platform and running sync both happen in the integration modal, which has a preview step before a manual sync.
- Save and sync status must stay visible on the board. Keep the board uncluttered as more platforms and metadata are added.

## Cross-Story Dependencies

- Story 3.1 (GitHub) is the reference implementation. Stories 3.2 and 3.3 should reuse its storage, mapping and preview/sync abstractions rather than build parallel ones.
- Depends on Epic 2: data loading, writable `sprint-status` from drag and drop (auto-sync hooks in here), and save/sync feedback in the board UX.
- Epic 4.1 adds test coverage for integrations. Epic 5.2 exposes a sync action from VS Code, so the sync entry points should stay callable without the browser UI.
