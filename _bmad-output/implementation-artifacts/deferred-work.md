- source_spec: none
  summary: Story 2-3 board UX polish and status feedback.
  evidence: Split from a multi-story delegation on 2026-11-17; 4-3 lint and CI goes first so later stories land on a green baseline.
- source_spec: none
  summary: Story 3-1 GitHub Issues and Project board sync, remaining UX and BMAD-specific representation.
  evidence: Split from a multi-story delegation on 2026-11-17; queued after 2-3.
- source_spec: none
  summary: Story 5-3 VS Code UX, settings and distribution.
  evidence: Split from a multi-story delegation on 2026-11-17; queued after 3-1.
- source_spec: none
  summary: Story 4-2 documentation and onboarding refresh.
  evidence: Split from a multi-story delegation on 2026-11-17; queued late so the docs describe what shipped.
- source_spec: none
  summary: Stories 3-2 Jira and 3-3 Azure DevOps connectors.
  evidence: Split from a multi-story delegation on 2026-11-17; new connectors that need real accounts to verify.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-release-quality-and-lint-stability.md`
  summary: The pending-items regex in `parseSprintStatusMarkdown` lets `\s*` cross a newline, so a `- [x] item` with no ` - detail` swallows the next `- [ ]` line as its detail.
  evidence: Found while writing the 4-3 parsing test; pre-existing behaviour, kept unchanged because 4-3 must not change runtime behaviour.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-release-quality-and-lint-stability.md`
  summary: CI installs without a lockfile because the root `package-lock.json` is gitignored, so dependency resolution can drift between runs.
  evidence: `.gitignore` ignores `package-lock.json` at baseline; fixing it means committing the lockfile and switching CI to `npm ci`, which is a repo policy decision.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-release-quality-and-lint-stability.md`
  summary: `npm publish` would ship the local BMAD skills, because `package.json` `files` includes all of `.claude` and the BMAD install added `.claude/skills/`.
  evidence: `npm pack --dry-run` on 2026-11-17 lists 214 `.claude/skills/` files; narrowing `files` to `.claude/commands` would publish only the `/viewer` command.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-release-quality-and-lint-stability.md`
  summary: No release smoke check starts the CLI, generates static output or runs `npm pack` before a release.
  evidence: The epic 4 context lists release smoke checks as a quality gap; 4-3 added only lint and unit tests to the gate.
