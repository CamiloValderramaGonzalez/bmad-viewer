# Integrations Roadmap

## GitHub

Current phase:

- Sync BMAD epics and stories into GitHub Issues
- Create or reuse a GitHub Project board and add synced issues into it
- Preserve BMAD identity through HTML markers in issue bodies
- Manual sync only
- BMAD remains the source of truth
- Status is represented with labels such as `bmad:status:review`
- Project board status is mapped into GitHub Project `Status` values

Next GitHub TODOs:

- Support richer BMAD-specific project columns instead of only GitHub default `Todo / In Progress / Done`
- Support issue types or parent/sub-issue relationships where the target org enables them
- Add sync preview UI in the dashboard
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
