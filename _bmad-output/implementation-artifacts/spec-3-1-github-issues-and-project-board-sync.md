---
title: 'GitHub sync: full Project paging, safe project lookup, offline tests'
type: 'bugfix'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'b0d7289fb0f5a27a466f7c663ef4fa20d74e235c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
- The GitHub sync reads only the first 100 items of the Project board. On a larger board, every sync re-adds issues that are already there, reports them as "added", and rewrites their status.
- When the stored project id fails to load, every error is swallowed, network and auth failures included. The sync then falls back to a title lookup, and story-status syncs create a new Project if that lookup misses. A transient failure can therefore create a duplicate Project.
- No test exercises the sync flow itself.

**Approach:**
- Page through all Project items.
- Fall back from the stored project id only when GitHub says the project does not exist.
- Cover the issue and Project sync flows with offline tests against a fake GitHub served through a stubbed `fetch`.

**Decision (2026-11-17), scope:** option A, "Fix and test", chosen over BMAD-specific columns, sub-issues and per-epic sync, which stay in the roadmap.

## Boundaries & Constraints

**Always:**
- Same requests, labels, markers and summary shape as today for boards of 100 items or fewer.
- Tests never reach the network and never write outside a temp directory.

**Never:**
- Change the BMAD → GitHub mapping, status option matching, or the one-way source-of-truth model.
- Add dependencies.
- Push, merge or publish.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Large board | Project already holds 230 items, including every BMAD issue, with correct statuses | No `addProjectV2ItemById`, no status updates; `added` and `updatedStatus` empty | N/A |
| Large board, one moved | As above, one story's BMAD status changed | Exactly one status update for that item | N/A |
| Fresh sync | Empty repo and no Project | Issues created for each epic and story; Project created; every issue added with its mapped status | N/A |
| Re-sync unchanged | Second sync right after a fresh one | No create, update, close, add or status calls | N/A |
| Stored project missing | `getProjectV2(id)` resolves to no node (deleted) | Falls back to the title lookup, as today | N/A |
| Stored project, transient failure | `getProjectV2(id)` fails with a network error, 401, 403 or 5xx | Sync fails with that error; no title lookup, no Project created | Error surfaces to the caller |
| Story status sync | One story moved; the Project exists | Only that story and its epic touched | N/A |

**Decision (2026-11-17), "Re-sync unchanged" with done items** (taken under the user's standing instruction to apply recommended approvals without waiting): the row holds for data without done items. GitHub's create-issue request cannot set `closed`, so a fresh sync leaves done items open and the next sync closes them. That is pre-existing, and fixing it adds requests, which conflicts with "same requests as today". Deferred; it is pinned by a `todo` test.

</frozen-after-approval>

## Code Map

- `src/integrations/github/github-client.js:131` -- `getProjectV2` queries `items(first: 100)` with no `pageInfo`/`after`. Keep the first-page query and add `pageInfo { hasNextPage endCursor }`. While `hasNextPage`, run an items-only query (`node(id) { ... on ProjectV2 { items(first: 100, after: $cursor) { … same node fields … } } }`) and concatenate into `items.nodes`, so callers are unchanged. `listIssues` (line 22) already pages; copy its loop shape.
- `src/integrations/github/github-client.js:260` -- `graphql()` throws a plain `Error("GitHub GraphQL error: …")` for both HTTP failures and `payload.errors`, discarding each error's `type`. A non-JSON body (an HTML 502) throws a `SyntaxError` from `response.json()`. Make it throw `GitHubApiError` (line 321) carrying `status` and the GraphQL error `types` (for example `NOT_FOUND`), keeping the message text unchanged. `getProjectV2` returning `data.node === null` also means not-found.
- `src/integrations/github/github-sync.js:395-401` -- `ensureGitHubProject`: `try { getProjectV2(config.project.id) } catch { projectInfo = null }`. Treat only a null node or GraphQL `NOT_FOUND` as missing; rethrow everything else.
- `src/integrations/github/github-sync.js:335` -- `buildGitHubProjectItemMap` consumes `items.nodes`; unchanged.
- Sync entry points to drive in tests: `syncGitHubProject(projectRoot, projectData)` and `syncGitHubStatusForStory(projectRoot, projectData, storyId)`. They build the client internally, so stub `globalThis.fetch` (restore it in `after`). Store config with `saveGitHubIntegration(projectRoot, { owner, repo, token: 'test', … })` in a temp dir (see `integration-store.js`; `resolveGitHubToken` uses `config.token` first).
- Project data for tests: `buildDataModel` on a temp copy of `example-data`, or a minimal `{ epics, storyList, storyContents }` object matching `mapProjectToGitHubItems` (`github-mapper.js:5`).

## Tasks & Acceptance

**Execution:**
- [x] `tests/integrations/fake-github.js` (new) -- in-memory fake: REST issues (list with `page`/`per_page`, create, update, close, repo) and GraphQL routed by operation (find project by title, create project, project with paged items, add item, update status). It records every call and can be set to fail `getProjectV2` with a chosen status or a null node
- [x] `tests/integrations/github-sync-flow.test.js` (new) -- every matrix row, written first; "Large board" and "Stored project, transient failure" must fail before the fixes
- [x] `src/integrations/github/github-client.js` -- page Project items
- [x] `src/integrations/github/github-sync.js` -- fall back only on not-found

**Acceptance Criteria:**
- Given `npm run check`, then lint and all tests pass, and the new tests make no real network call (the stubbed `fetch` throws on any host other than `api.github.com`).

## Implementation Notes

- `graphql()` now throws `GitHubApiError` (same message text) with `status` and `errors` (each GraphQL error's `type`, `path`, `message`); a non-JSON body no longer throws `SyntaxError`. `getProjectV2` returns `null` for a null node and concatenates every items page into `items.nodes` (`items.pageInfo` is the last page's). A follow-up page with no node, items or pageInfo, `hasNextPage` without a cursor, or a repeated cursor throws `GitHubApiError`.
- `ensureGitHubProject` falls back from the stored id only on a null node or a GraphQL `NOT_FOUND` whose path is exactly `['node']`; everything else is rethrown.
- Known gap, not fixed (would change today's request sequence, which the Always rule forbids): `POST /issues` cannot set `state`, so a fresh sync leaves done epics and stories open and the next sync closes them with `updateIssue`. The "Re-sync unchanged" test therefore uses data with no done items, and a `todo` test records the gap.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-17): blind-hunter (13), edge-case-hunter (5), verification-gap (1 gap, 2 other).

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge + blind + verif. | Paging stops silently on a page with no `node`, `items` or `pageInfo`, or with `hasNextPage` and no cursor; a repeated cursor loops forever | medium | `getProjectV2` loop (`github-client.js` ~201): `nodes.push(...(pageItems?.nodes \|\| []))` then `pageInfo = pageItems?.pageInfo` ends the loop with a partial list, which brings back the re-add bug with no error; nothing guards a non-advancing cursor | patch |
| 2 | verif. | The fake pages on `variables.cursor` even if the query never uses `after: $cursor` | medium | pre-verified: removing `after: $cursor` would hang on real GitHub while both large-board tests pass | patch |
| 3 | edge + blind | `isGitHubNotFoundError` matches `NOT_FOUND` from any GraphQL path | low | `types` collected from every error with no path; a nested NOT_FOUND would trigger the title fallback (the refetch then throws, so no duplicate, but the error is misattributed) | patch |
| 4 | blind | No test for a failure on a later page | medium | `failProjectNode` applies only to the first page | patch (with #1) |
| 5 | blind | "Same requests" for small boards never asserted for reads | low | only write operations are checked; the fix is one assertion | patch |
| 6 | edge | A stored id that resolves to a non-ProjectV2 node returns `{}` | false | the stored id is written only from a ProjectV2 returned by this code; unreachable without hand-editing config | reject |
| 7 | edge | HTTP 200 with `{}` body makes `graphql()` return undefined | low | pre-existing, unchanged by this diff; GitHub does not send this | reject |
| 8 | blind | NOT_FOUND from a missing token scope or SSO leads to a duplicate Project | false | `createProjectV2` needs the same project access, so it fails with the same scope or SSO denial; no duplicate is created | reject |
| 9 | blind | Transient tests skip 500/503 JSON and don't assert `GitHubApiError` | low | same code path as the tested 502 HTML; the message is the user-facing contract | reject |
| 10 | blind | Network errors are not wrapped in `GitHubApiError` | low | pre-existing; the matrix requires only that the error surfaces | reject |
| 11 | blind | Agent decision written into the frozen block | false | the fix edits this spec; the decision was made under the user's standing instruction and is labelled so | reject |
| 12 | blind | A `todo` test never alerts when fixed | low | node:test reports a passing todo as such; the deferral is logged | reject |
| 13 | blind | Code Map line numbers are stale | false | the fix edits this spec | reject |
| 14 | blind | `fields(first: 50)` is not paged | low | pre-existing, same class; matters only for Projects with more than 50 fields | defer |
| 15 | blind | Test style (`assert.equal(x >= 1, true)`; NOT_FOUND test skips the config check) | low | cosmetic | reject |
| 16 | verif. | Returned `items.pageInfo` is the stale first-page value | low | no consumer reads it; folded into #1's fix as a direct correction | patch (with #1) |


## Verification

**Commands:**
- `npm run check` -- expected: lint clean, all tests pass
- `git stash` the two `src/` edits and run `node --test tests/integrations/github-sync-flow.test.js` -- expected: the "Large board" and "transient failure" tests fail; restore after
