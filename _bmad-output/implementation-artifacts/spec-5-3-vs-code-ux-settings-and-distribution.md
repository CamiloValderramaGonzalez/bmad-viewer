---
title: 'VS Code extension honours its settings and the editor theme'
type: 'bugfix'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '21a5d9f18b6d43375679f93f0dbd737ae756daeb'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The extension's two settings and its theme do not behave as a VS Code user expects.
- `bmadViewer.openOnStartup` never fires. No activation event runs at startup, so `activate` only runs once the user opens the view or a command. When it does fire, it opens the panel in any workspace with folders, BMAD or not.
- Changing `bmadViewer.preferredPort` has no effect until VS Code restarts, because the running server is reused.
- The embedded dashboard picks its theme from `localStorage` or the **OS** colour scheme, so a light VS Code theme on a dark OS shows a dark dashboard.
- `deactivate()` returns nothing, so VS Code does not wait for the viewer server to close.

**Approach:**
- Activate on `onStartupFinished` and open the panel at startup only when the setting is on and a BMAD project is detected.
- Restart the server when `preferredPort` changes.
- Pass VS Code's theme to the dashboard and follow theme changes live.
- Await server shutdown in `deactivate`.

**Decisions (2026-11-17, recommended options applied under the user's standing instruction):**
- `onStartupFinished` is preferred over `workspaceContains`: it is cheap, deferred, and catches nested `_bmad/`.
- The theme passed by the extension is not written to `localStorage`, so the standalone browser dashboard keeps its own saved choice.

## Boundaries & Constraints

**Always:**
- The browser dashboard without a `theme` parameter behaves exactly as today: saved choice, then OS scheme.
- A manual theme toggle inside the embedded dashboard still works for that session.
- `npm run check` passes.

**Never:**
- Change the publish workflow, the extension `version`, `publisher` or packaging scripts.
- Add dependencies.
- Push, merge or publish.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Startup, BMAD workspace | `openOnStartup` true; workspace has `_bmad/` | Panel opens after startup | N/A |
| Startup, non-BMAD workspace | `openOnStartup` true; no `_bmad/` | Nothing opens | N/A |
| Startup, setting off | `openOnStartup` false | Nothing opens | N/A |
| Light editor, dark OS | VS Code theme kind Light or HighContrastLight | Dashboard renders `data-theme="light"` | N/A |
| Dark editor | Dark or HighContrast | `data-theme="dark"` | N/A |
| URL param, browser | Dashboard opened with `?theme=dark` and `localStorage` holding `light` | Renders dark; `localStorage` still `light` | Invalid values ignored |
| Storage blocked | `localStorage` throws in the inline script | Theme still applied from the parameter or OS | No uncaught error |

</frozen-after-approval>

## Code Map

- `apps/vscode-extension/package.json` -- `activationEvents`: add `onStartupFinished`; leave the others and the rest of the manifest alone.
- `apps/vscode-extension/extension.cjs`:
  - `activate` (~828): the startup open must also require `state.bmadDir` from `serverManager.getWorkspaceState()`.
  - `onDidChangeConfiguration` (~869): when `affectsConfiguration('bmadViewer.preferredPort')`, call `serverManager.stopServer()` before refreshing.
  - Add `vscode.window.onDidChangeActiveColorTheme` to refresh the panel and sidebar.
  - `renderEditorViewer` (~640) builds the iframe from `serverUrl`; pass it the URL from the new helper.
  - `deactivate` (~899) must return the server manager's `dispose()` promise. Keep a module-level reference set in `activate`.
- `apps/vscode-extension/lib/viewer-url.cjs` (new) -- pure, no `vscode` import:
  - `themeForKind(kind)` maps `ColorThemeKind` numbers (Light 1, Dark 2, HighContrast 3, HighContrastLight 4) to `'light' | 'dark'`.
  - `withTheme(serverUrl, theme)` appends `?theme=`.
  - `shouldOpenOnStartup({ openOnStartup, bmadDir })`.
  - `extension.cjs` requires it. `.vscodeignore` does not exclude `lib/`; confirm the VSIX includes it.
- `src/templates/inline-theme-script.js` -- read `theme` from `location.search` (`light`/`dark` only) first, then `localStorage` (guarded with try/catch), then OS. Never write the parameter to storage.
- `public/client.js` `toggleTheme` (~236) is unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `apps/vscode-extension/lib/viewer-url.cjs` + `extension.cjs` + `package.json` -- helpers and wiring per the Code Map
- [x] `src/templates/inline-theme-script.js` -- `theme` parameter first; guarded storage
- [x] `tests/vscode/viewer-url.test.js` (new) -- every theme kind; URL building with and without an existing query; `shouldOpenOnStartup` for the three startup rows; `package.json` lists `onStartupFinished`
- [x] `tests/templates/inline-theme-script.test.js` (new) -- runs the script in `node:vm` with stub `location`, `localStorage` (including throwing) and `matchMedia`: parameter beats storage and is not persisted; invalid parameter ignored; fallbacks unchanged

**Acceptance Criteria:**
- Given `npm run check` and `cd apps/vscode-extension && npm run check`, then both pass.
- Given a running panel, when `preferredPort` changes, then the server restarts on the new port (the port-finder picks the next free one if it is busy); and when the VS Code theme changes, then the panel reloads with the matching theme. There is no VS Code test harness here, so this is confirmed by reading `extension.cjs` and by the manual check.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-17): blind-hunter (9), edge-case-hunter (10), verification-gap (1 gap, 3 other). Triage under the user's standing instruction.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | all three | A manual theme toggle in the embedded dashboard is reverted by the next live reload | medium | `location.reload()` keeps `?theme=`, which wins over the saved toggle; this breaks the frozen "Always" rule. Direct fix: drop `theme` from the URL with `history.replaceState` on toggle (`client.js` toggleTheme; deviates from the Code Map note that `client.js` is unchanged) | patch |
| 2 | verif. | No test loads `extension.cjs`; a bad `require('./lib/...')` path fails only at activation | medium | pre-verified: `node --check` does not resolve requires, and no test references the entrypoint | patch |
| 3 | blind + edge | A port change only stops the server; no restart if no panel is open; rejections are unhandled | medium | the handler `void (async…)` has no catch; "Open in browser" users lose the server until the next panel action | patch |
| 4 | blind | Startup open swallows errors silently | low | `.catch(() => undefined)`; the fix is a log line | patch |
| 5 | blind + edge | A stored theme value is not validated | low | pre-existing, but the line was rewritten here; a direct `light`/`dark` check | patch |
| 6 | blind | Setting description and README still say "with a workspace" | low | `package.json` and `apps/vscode-extension/README.md:42` | patch |
| 7 | blind + edge | Test paths depend on cwd | low | `resolve('apps/…')` in `viewer-url.test.js`; the fix uses `import.meta.url` | patch |
| 8 | blind | Server cleanup only runs through `deactivate` | low | the `{ dispose }` subscription was removed; `dispose` is idempotent, so restoring it is a free safety net | patch |
| 9 | edge + blind | Overlapping stop/start on rapid port changes; `deactivate` during an in-flight start leaks a server | low | `ensureServer` has no lock; rapid changes are rare | defer |
| 10 | edge + blind | Multi-root workspace: only the preferred or first folder is checked | low | pre-existing workspace-selection semantics (`selectWorkspaceFolder` exists) | reject |
| 11 | edge + blind | A workspace under an ancestor with `_bmad/` counts as BMAD; the "nested" rationale is wrong | low | `detectBmadDir` walks up; that is pre-existing detection the sidebar already uses; correcting the rationale edits this spec | reject |
| 12 | blind | A theme change reloads the whole panel and rebuilds the sidebar | low | follows the approved approach (refresh on theme change); theme switches are rare | reject |
| 13 | blind | `onStartupFinished` activates in every workspace | low | recorded decision; `activate` only registers handlers when the setting is off | reject |
| 14 | blind | No CHANGELOG entry | low | the repo keeps no extension changelog | reject |
| 15 | blind | No recorded verification evidence | false | recorded at presentation; not a code defect | reject |


## Verification

**Commands:**
- `npm run check` -- expected: lint clean, all tests pass
- `cd apps/vscode-extension && npm install && npm run check` -- expected: manifest and entrypoint check passes (it vendors the viewer first)

**Manual checks:**
- In VS Code with a light theme on a dark OS: the dashboard is light; switch the theme and it follows; change `preferredPort` and the panel moves to the new port; with `openOnStartup` on, the panel opens only in a BMAD workspace.
