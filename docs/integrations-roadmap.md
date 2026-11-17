# Integrations Roadmap

## GitHub

Current phase:

- Sync BMAD epics and stories into GitHub Issues, one way (BMAD → GitHub); BMAD remains the source of truth
- Preserve BMAD identity through hidden HTML markers in issue bodies and `bmad:*` labels
- Status is represented with labels such as `bmad:status:review`; done items are closed
- Create or reuse a GitHub Project board and add synced issues into it
- Project board status is mapped into GitHub Project `Status` values
- Preview a sync in the dashboard (create / update / close) before applying it
- Manual sync from the dashboard (Sync Now, Sync Project Board), plus auto-sync of the moved story and its epic on every board drag when GitHub is connected
- All Project items are paged (boards over 100 items no longer re-add issues or rewrite their status)
- A stored Project is replaced only when GitHub reports it NOT_FOUND; network, auth and 5xx errors surface instead of creating a duplicate Project
- Token from an environment variable (`tokenEnvVar` in `.bmad-viewer/integrations.json`) or pasted into the dashboard

Next GitHub TODOs:

- Harden token storage: a pasted token is saved in plain text in `<project>/.bmad-viewer/integrations.json`. Move it to the OS keychain or similar, offer the environment-variable option in the UI, and add `.bmad-viewer/` to the user's `.gitignore` automatically
- Support richer BMAD-specific project columns instead of only GitHub default `Todo / In Progress / Done`
- Support issue types or parent/sub-issue relationships where the target org enables them
- Add selective sync by epic
- Add conflict detection when GitHub issues changed since the last sync
- Add an option to pull status changes back into BMAD

## Jira TODO

- Add Jira connection flow with site URL, project key and token
- Discover valid issue types and workflow transitions from the target project
- Map BMAD epic/story/task to Jira issue types
- Use transitions instead of direct state assignment
- Store external IDs so sync can update instead of recreate
- Add manual sync preview and apply flow
- Define delete policy as archive/close instead of hard delete

## Azure DevOps TODO

- Add Azure DevOps connection flow with organization, project and PAT
- Detect process template to map work item types correctly
- Map BMAD epic/story/task to Epic, Feature, User Story/PBI and Task
- Sync parent/child relations
- Map BMAD statuses to valid `System.State` values for the target process
- Add manual sync preview and apply flow
- Define delete policy as close/remove from board instead of hard delete
