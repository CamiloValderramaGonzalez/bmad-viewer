---
title: 'README and roadmap describe the product as it is'
type: 'chore'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '22f8ab9d98128d8ff215427f4d3b3be208557e49'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The README is wrong about today's product. Verified against the code on 2026-11-17:
- CLI options:
  - The default port is 4000, not 3000 (`src/server/port-finder.js:3`).
  - `--install-skill` and the short flags `-p`, `-o`, `-v`, `-h` are missing.
- The board:
  - It has five columns (Backlog, Ready for Dev, In Progress, Review, Done), not "Pending → In Progress → Done".
  - It is editable: dragging writes `sprint-status`, which can be `.yaml` or a markdown table.
  - The README says "no data entry, no sync".
- GitHub sync:
  - It exists, is one-way and optional, and runs on manual preview/sync and on every board drag. None of this is documented.
  - The pasted token is stored in plain text in `<project>/.bmad-viewer/integrations.json`, and nothing tells users to keep it out of git.
- "Try without a BMAD project" uses `./node_modules/bmad-viewer/example-data`, which does not exist after a bare `npx`.
- `docs/integrations-roadmap.md`:
  - It says "Manual sync only" and lists "sync preview UI" as a TODO, though both auto-sync and preview exist.
  - It omits the 3-1 paging and duplicate-Project fixes.

**Approach:** Correct every inaccuracy above and add short sections for the editable board and GitHub sync, with the token warning. Keep the README's voice and length roughly the same. Add a test that pins the README's CLI options to `--help`, so they cannot drift again.

**Decisions (2026-11-17, recommended options under the user's standing instruction):**
- Document the token storage honestly and recommend the environment-variable option. Changing storage, or auto-adding `.bmad-viewer/` to the user's `.gitignore`, is code work and is deferred.
- The VS Code extension keeps its own README (already updated in 5-3); the root README links to it with one line on what it adds.

## Boundaries & Constraints

**Always:**
- Every factual claim added is checked against the code.
- `npm run check` passes.

**Never:**
- Change runtime code.
- Promise Jira or Azure DevOps (backlog only).
- Overstate token security.
- Push, merge or publish.

</frozen-after-approval>

## Code Map

- `README.md` -- sections to correct:
  - Quick start: the `/viewer` command is installed into `.claude/commands/` on launch, or with `--install-skill`.
  - What you get: the board (five columns, drag to save, markdown or YAML `sprint-status`) and live reload.
  - CLI options: copy the flags and defaults from `node bin/cli.js --help`.
  - How it works: replace "no data entry, no sync" with what is actually written (`sprint-status`, `.bmad-viewer/integrations.json`).
  - New `## GitHub sync (optional)`:
    - BMAD → GitHub only; issues are labelled `bmad:*` and carry hidden id markers.
    - It can create or reuse a GitHub Project board.
    - Board drags sync the moved story.
    - Token by environment variable (recommended) or pasted, stored in plain text, so add `.bmad-viewer/` to `.gitignore`.
    - Required token access: issues read/write; Projects for the board.
  - Try without a BMAD project: use a path that works (`npx bmad-viewer --path <clone>/example-data`, or install locally first).
  - Theme: VS Code follows the editor theme.
- `src/server/port-finder.js:3`, `bin/cli.js` (switch at lines 25–47 and the help text) -- source of truth for CLI facts.
- `src/server/renderer.js:106-131` -- the board columns.
- `src/integrations/integration-store.js:4-31` and `src/integrations/github/github-sync.js:15-40` and `:488` -- token storage and the env-var path.
- `src/server/renderer.js:267` -- the token input field.
- `docs/integrations-roadmap.md` -- GitHub "Current phase" and TODOs: auto-sync on drag; the preview exists; all items paged; no duplicate Project on transient errors; the token-storage hardening TODO.

## Tasks & Acceptance

**Execution:**
- [x] `README.md` -- corrections and the two new sections per the Code Map
- [x] `docs/integrations-roadmap.md` -- current phase and TODOs brought up to date
- [x] `tests/docs/readme-cli.test.js` (new) -- runs `node bin/cli.js --help`; asserts that every long flag in it appears in the README's `## CLI options` block, and that the README states the same default port as `DEFAULT_PORT`

**Acceptance Criteria:**
- Given the README, when each statement listed in the Problem is checked against the code, then none of them is still wrong.
- Given `npm run check`, then lint and all tests pass, including the README CLI test.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-17): blind-hunter (12), edge-case-hunter (12), verification-gap (1 gap, 2 other). The implementation subagent ended at the session limit, so the orchestrator applied the patches directly, as the workflow allows.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | all three | The README CLI test checks one direction only; short flags are unchecked; heading lookups are unguarded; the last-section regex fails | medium | `tests/docs/readme-cli.test.js` built its list only from `--help`. It now compares long+short flag sets both ways, asserts the headings, and allows end-of-file; adding a README-only flag fails it | patch (applied) |
| 2 | blind + edge | Port fallback vague | low | `MAX_ATTEMPTS = 10` in `port-finder.js:4`, and it applies to `--port` too | patch (applied) |
| 3 | blind + edge | `/viewer` install lands in the cwd on any launch, not "first launch from your project" | low | `bin/cli.js:131-134` uses `process.cwd()` | patch (applied) |
| 4 | blind + edge | "It writes only in these cases" omits `--output`, `--install-skill` and GitHub's enable-Issues side effect | low | `bin/cli.js`; `github-sync.js` `connectGitHubIntegration` calls `enableIssues` | patch (applied) |
| 5 | blind | Projects permission described as a repository permission; classic scopes missing | low | Projects v2 is owner-level; classic tokens need `repo` and `project` | patch (applied) |
| 6 | blind | BMAD statuses are squeezed into Todo/In Progress/Done, undocumented | low | `pickGitHubProjectStatusOption` candidate lists | patch (applied) |
| 7 | blind + edge | `<project>` undefined; env var read from the server process; switching back from a pasted token not possible in the UI; invalid JSON silently means "not connected" | low | `detectBmadDir`; `resolveGitHubToken`; `connectGitHubIntegration` merge; `loadIntegrationsConfig` catch | patch (applied) |
| 8 | edge | A board drag also rewrites the epic status | low | `sprint-status-updater.js` `deriveEpicStatus` | patch (applied) |
| 9 | blind | The try-it path edits files inside `node_modules` | low | the README now copies the example first | patch (applied) |
| 10 | blind | Board is read-only in `--output` | low | the static generator strips `client.js` | patch (applied) |
| 11 | verif. + blind | The CLI's no-`_bmad` hint and the in-app token note still contradict the README | low | `bin/cli.js:160`, `renderer.js:276`; runtime strings are out of scope for this docs story | defer |
| 12 | edge | The test reads `DEFAULT_PORT` from source text | low | it is also cross-checked against the live `--help` output | reject |
| 13 | blind + edge | Spec and sprint status disagree; no recorded evidence | false | workflow sequencing; results recorded at presentation | reject |
| 14 | blind | Markdown `sprint-status.md` table format not documented | low | format-level docs are beyond this refresh | reject |


## Verification

**Commands:**
- `npm run check` -- expected: lint clean, all tests pass

**Manual checks:**
- Read the rendered README top to bottom. Every command shown runs as written, from a fresh shell and a cloned repo.
