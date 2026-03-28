# Epics And Stories: bmad-viewer

## Epic 1: Viewer Foundation

Deliver the baseline product experience for launching, rendering and navigating a BMAD project locally.

### Story 1.1: CLI Detection And Local Server Startup

As a developer, I want the CLI to detect a BMAD project and start the viewer quickly so I can open the dashboard with minimal setup.

### Story 1.2: Wiki Navigation And Search Experience

As a user, I want to browse BMAD modules and search artifacts from the dashboard so I can recover context without spending tokens.

### Story 1.3: Static Output Generation

As a maintainer, I want the viewer to generate static output so project snapshots can be shared without a running local server.

---

## Epic 2: Real BMAD Board Workflow

Turn the project dashboard into a true working board for BMAD status management.

### Story 2.1: Load Planning And Implementation Artifacts

As a project owner, I want planning and implementation artifacts to populate the dashboard automatically so the board reflects real BMAD files.

### Story 2.2: Drag And Drop Local Status Persistence

As a user, I want to move cards between BMAD states and save the result into `sprint-status` so the board becomes an actual operating surface.

### Story 2.3: Board UX Polish And Status Feedback

As a daily user, I want a compact and clear board interface with visible save and sync feedback so the dashboard stays comfortable during active work.

---

## Epic 3: External Platform Sync

Allow BMAD to remain the source of truth while synchronizing work outward to engineering platforms.

### Story 3.1: GitHub Issues And Project Board Sync

As a developer, I want BMAD epics and stories to sync into GitHub so external execution can stay aligned with the local methodology.

### Story 3.2: Jira Connector And State Mapping

As a team using Jira, I want BMAD work mapped to Jira issue types and workflow transitions so planning stays consistent across systems.

### Story 3.3: Azure DevOps Connector And State Mapping

As a team using Azure DevOps, I want BMAD work mapped into work items and valid states so delivery status can be synchronized safely.

---

## Epic 4: Product Quality And Adoption

Improve trust, onboarding and maintainability around the viewer as a product.

### Story 4.1: Test Coverage For Board And Integrations

As a maintainer, I want automated tests around the board and integrations so behavior can evolve without breaking trust.

### Story 4.2: Documentation And Onboarding Refresh

As a new user, I want clear setup and usage guidance so I can adopt the viewer without reverse engineering the repo.

### Story 4.3: Release Quality And Lint Stability

As a maintainer, I want the repo to pass a stable quality baseline so packaging and releases stay predictable.

---

## Epic 5: VS Code Extension Experience

Turn the viewer into a first-class Visual Studio Code experience so BMAD context can be opened from the editor without relying on a separate browser workflow.

### Story 5.1: Extension Scaffold And Embedded Viewer Host

As a VS Code user, I want an extension container that can host the viewer in the editor so I can open BMAD visually from within my workspace.

### Story 5.2: Workspace BMAD Detection And Local Actions

As a developer, I want the extension to detect the current BMAD workspace and trigger refresh, open and sync actions from VS Code so the editor becomes the main operating surface.

### Story 5.3: VS Code UX, Settings And Distribution

As a maintainer, I want a polished extension UX with settings, activation behavior and packaging strategy so the extension can be adopted and published safely.
