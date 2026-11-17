---
title: 'Release quality and lint stability'
type: 'chore'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '6c675a54230e643d768d55e67a35aa069918630f'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `npm run lint` fails with 455 Biome errors, so lint cannot gate anything. No CI job runs the root tests or lint; the only workflow packages and publishes the VS Code extension. `package.json` also depends on its own published package (`bmad-viewer: ^0.3.4`).

**Approach:** Make `npm run lint` pass on the repository's own code without changing runtime behaviour, add a root CI workflow that runs lint and tests on every push and pull request, and remove the self-dependency.

## Boundaries & Constraints

**Always:**
- `npm test` stays at 36/36 or better.
- Lint passes with Biome's `recommended` rules. Any rule turned off is scoped to named files and has a reason in the config or spec.
- Formatting follows the code's existing style: single quotes, tabs, line width 100.

**Never:**
- Push, merge or publish. A push to master that touches `src/**` or `package.json` runs `publish-marketplace` in `vscode-extension.yml`; merging is the user's decision.
- Edit `_bmad/`, `_bmad-output/` content other than this story's tracking, or `.claude/skills/`.
- Weaken the extension workflow or change its publish job.

**Decision (2026-11-17), `public/client.js`:** the file stays ES5, with a Biome `overrides` entry scoped to `public/client.js` only. That entry turns off the legacy-style rules: `noVar`, `useArrowFunction`, `useTemplate`, `noForEach`, `useOptionalChain` and `noInnerDeclarations` (the `var`-in-block pattern). It also turns off `noRedundantUseStrict`: the browser loads the file as a classic `<script>`, where its `'use strict'` is active, so the safe fix would put it into sloppy mode. `noRedeclare` (`el` ×3 in `initPathConfig`) is fixed by hand. Modernising the file is out of scope.

</frozen-after-approval>

## Code Map

- `biome.json` -- add `javascript.formatter.quoteStyle: 'single'` (this alone clears most format errors); extend `files.ignore` with `_bmad`, `_bmad-output`, `.claude`, `apps/vscode-extension/vendor`, `apps/vscode-extension/node_modules` (lint currently scans generated BMAD files).
- `public/client.js` -- per the decision. Redeclared `el` is at lines 1216–1218 (`initPathConfig`); give each its own name. Format the file only for whitespace.
- `src/data/data-model.js` -- 7× `while ((match = re.exec(raw)) !== null)` (lines 609–800). Replace with `for (const match of raw.matchAll(re))`. All seven regexes have `g` and nothing reads `lastIndex`, so behaviour is identical. The parsers are private; test them through the exported `buildDataModel(bmadDir, options)` with a temp fixture directory.
- `apps/vscode-extension/extension.cjs` -- one `noUnusedTemplateLiteral`.
- About 40 other `src/`, `tests/`, `bin/` and `apps/` files -- whitespace formatting and import order only, applied with `biome check --write` (safe fixes only, never `--unsafe`).
- `package.json` -- remove the `bmad-viewer` dependency (nothing imports it); add `"check": "npm run lint && npm test"` and `"prepublishOnly": "npm run check"`.
- `.github/workflows/ci.yml` (new) -- push and pull_request on all branches; Node 18, 20 and 22 to match `engines >=18`; `npm install` (the root lockfile is gitignored); `npm run lint`; `npm test`.
- Do not touch: `.github/workflows/vscode-extension.yml`, `apps/vscode-extension/package*.json`.

## Tasks & Acceptance

**Execution:**
- [x] `biome.json` -- single quotes and ignores -- matches code style; stops linting generated files
- [x] repo-wide -- `npx biome check --write .` -- safe mechanical fixes; review the diff for non-whitespace changes
- [x] `src/data/data-model.js` -- `matchAll` loops -- clears `noAssignInExpressions`
- [x] `apps/vscode-extension/extension.cjs` -- plain string -- clears the last non-client error
- [x] `biome.json` override + `public/client.js` -- scoped rule override; rename the redeclared `el` -- per the decision; the file keeps its `'use strict'`
- [x] `package.json` -- drop the self-dependency, add `check` and `prepublishOnly`
- [x] `.github/workflows/ci.yml` -- lint and test matrix
- [x] `tests/data/data-model-parsing.test.js` (new) -- written and passing **before** the `matchAll` rewrite, then passing after: through `buildDataModel`, a fixture with several epics, story rows, bugs and pending items parses all of them, and one with none yields empty lists

**Acceptance Criteria:**
- Given a clean checkout with `npm install`, when `npm run lint` runs, then it exits 0 with no errors.
- Given the same checkout, when `npm test` runs, then every test passes, including the new parsing tests.
- Given the repo, when `npm run check` runs, then it runs lint then tests and fails if either fails.
- Given `ci.yml`, when it is validated with `actionlint` (or parsed as YAML if actionlint is unavailable), then it reports no errors.
- Given the dashboard served by `npx bmad-viewer --path .`, when the wiki, search, board drag and theme toggle are used, then no console errors appear and the behaviour is unchanged.

## Implementation Notes

- `biome.json` overrides, each scoped to one named file:
  - `public/client.js`: `noVar`, `useTemplate`, `useArrowFunction`, `noForEach`, `useOptionalChain`, `noInnerDeclarations`, `noRedundantUseStrict` off -- per the 2026-11-17 decision (file stays ES5; `'use strict'` must stay because the file loads as a classic script). The three redeclared `el` in `initPathConfig` are now `outputEl`, `epicsEl`, `sprintEl`.
  - `public/styles.css`: formatter disabled (linter stays on). The CSS is deliberately written one rule per line; Biome's CSS formatter would expand it from 264 to ~1,480 lines. Not a lint rule, so the Boundaries rule-off constraint is unaffected.
- `apps/vscode-extension/package.json` and `package-lock.json`: formatter disabled via a scoped override (linter stays on). The spec forbids touching them and the formatter would otherwise reflow their arrays.
- `biome check --write` (safe fixes only) was reviewed token by token: changes are whitespace, import ordering, quote-props, redundant parentheses, trailing commas and multi-line `return (...)` parentheses. Template literal contents are unchanged. Static output (`--output`) from HEAD and from this branch is byte-identical.
- Pre-existing behaviour kept, not fixed (out of scope): the pending-items regex in `parseSprintStatusMarkdown` lets `\s*` cross a newline, so an item without a ` - detail` that is followed by another `- [ ]` line swallows that next line as its detail. The new parsing test avoids that layout; it should be logged as deferred work.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-17): blind-hunter (14 findings), edge-case-hunter (1), verification-gap (0 gaps, 1 other).

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind | CI matrix lacks Node 24 (active LTS); 18 and 20 are EOL | medium | `ci.yml` matrix is `[18, 20, 22]`; most users run current LTS and a break there would go uncaught | patch: add 24 |
| 2 | blind | No lockfile, so CI installs are not reproducible | low | root `package-lock.json` is gitignored at baseline; committing it is a repo policy change | defer (pre-existing) |
| 3 | blind | Push + PR both trigger; stale runs not cancelled | low | frozen intent requires every push and PR, so the double run stays; a `concurrency` group with `cancel-in-progress` is a direct addition | patch: concurrency |
| 4 | blind | `npm publish` would ship `.claude/skills/` | medium | `npm pack --dry-run` lists 214 `.claude/skills/` files; `files` included `.claude` at baseline, so this predates the change | defer (pre-existing) |
| 5 | blind | No release smoke checks (start CLI, static output, `npm pack`) | medium | the epic lists it as a gap; nothing this change did removed a check | defer (pre-existing gap) |
| 6 | blind | Pending-items regex bug has no test | low | already logged in deferred-work.md; the test belongs with its fix | reject (covered by existing deferral) |
| 7 | blind | Parsing tests skip the `options` custom paths | false | `loadCustomEpicsFile` and the custom sprint path call the same parser functions the new tests already exercise; every rewritten regex is covered | reject |
| 8 | blind | Reformatted `client.js` and the `el` rename are unchecked | false | a token comparison against baseline (whitespace stripped) shows only trailing commas, unquoted keys, redundant parentheses (precedence unchanged), `return (…)` and the rename, each used only in its own block. The manual browser criterion stays open for the human in step 5 | reject |
| 9 | blind | Spec `in-review` vs sprint `in-progress`; empty logs | false | workflow sequencing: this log is pass 1, and sprint status moves at presentation | reject |
| 10 | blind + edge | `_bmad/` modified and `epic-4-context.md` added, breaking the boundary | false | the `_bmad/` changes were present before this story began (BMAD install, recorded before implementation) and are outside the reviewed diff; `epic-4-context.md` is created by Build step 1 for this story | reject |
| 11 | blind | deferred-work.md format and backlog entries | false | the format and the split entries are what the Build workflow prescribes | reject |
| 12 | blind | `files.ignore` on the extension's `package*.json` also disables lint | low | ignore removes both lint and format; a formatter-only override, as used for `styles.css`, is a direct swap | patch |
| 13 | blind | `npm run check` not mentioned to contributors | low | README Contributing section is one line with no checks | patch: one sentence |
| 14 | blind | Rule-off reasons live only in the spec | false | the Always rule allows "in the config or spec"; the spec's Implementation Notes record each reason | reject |
| 15 | verif. | Regex bug should be logged | false | already in deferred-work.md | reject |

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0
- `npm test` -- expected: all pass
- `git diff --stat` -- expected: no `_bmad/`, `.claude/skills/` or extension workflow changes

**Manual checks:**
- Load the local dashboard and exercise wiki, search, board drag and theme. Expect no console errors.
