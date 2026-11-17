---
title: 'Board save and sync feedback survives live reload'
type: 'bugfix'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
context: []
baseline_commit: '23d3fd5bdf67297e69923851215cfe4e09c8fc74'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dropping a card saves `sprint-status`. The file watcher sees that write and broadcasts `file-changed`, and every tab, including the one that saved, runs `location.reload()` straight away. Measured on example data: the save responds in 34 ms and the reload broadcast arrives at 859 ms. The tab that saved loses its "Saved…" message, and a GitHub sync slower than that is cut off mid-request, so its success or error is never shown. Failures that are not JSON (an HTML 500, a dropped connection) surface as raw parser text such as "Unexpected token <".

**Approach:** A reload that arrives while this tab's save or sync is in flight waits until the operation finishes, then happens once. The final status message is stored first and shown again after that reload. Non-JSON and network failures show plain, accurate messages.

**Decision (2026-11-17), stale views:** the saving tab reloads once after its operation finishes (option "Reload after the message"). That keeps story detail pages and every other server-rendered view in step with `sprint-status`. No per-tab attribution of broadcasts and no background content refresh.

## Boundaries & Constraints

**Always:**
- Tabs with nothing in flight reload on `file-changed` exactly as today.
- If `window.BmadBoardFeedback` is absent (page HTML older than the server), save, sync and reload behave as before this story, with no TypeError after a successful write.
- `public/client.js` and the new helper stay ES5 (Biome override in place); `npm run check` passes.

**Never:**
- Change the watcher's polling, debounce or watched paths, the websocket message format, or the sprint-status write logic.
- Push, merge or publish.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Own write, slow sync | A's save is done and its GitHub sync is still running when A's own `file-changed` arrives | A defers; the sync finishes and its result is set; A reloads once; the result is shown again after the reload | N/A |
| Own write, fast | A's save and sync finish before the broadcast arrives | A reloads on the broadcast; the stored final message is shown after the reload | N/A |
| Other tab | Tab B has nothing in flight while A saves | B reloads as today | N/A |
| Several broadcasts in flight | Two `file-changed` messages arrive during one operation | Exactly one reload after the operation finishes | N/A |
| Message is one-shot | The page is reloaded again, by the user or another change, after the message was restored | The message is not shown again | N/A |
| New drag | A drag starts while a stored message exists | The stored message is cleared | N/A |
| Storage blocked | `sessionStorage` is missing or throws | The reload still happens; there is just no restored message | Never throws |
| Non-JSON failure | Save or sync returns HTML or an empty body with status ≥ 400 | "Could not save the new status (HTTP 500)" or "Could not sync the status to GitHub (HTTP 502)" | Card restored for a failed save, as today |
| Server unreachable | `fetch` rejects | "Could not reach the bmad-viewer server" | Card restored for a failed save |

</frozen-after-approval>

## Code Map

- `public/board-feedback.js` (new) -- ES5 classic script, no DOM access; assigns `BmadBoardFeedback` on `window`, or `globalThis` when `window` is absent. Pure functions:
  - `reloadDecision(message, inFlight)` → `'skip' | 'defer' | 'reload'`
  - `failureMessage(action, { status } | { network: true })`
  - `readJsonResponse(response, action)`: non-JSON bodies use `failureMessage`; a JSON `{ ok: false }` uses the server's `error`
  - `storeStatus(storage, msg, kind, now)`: an empty `msg` removes the stored message
  - `takeStoredStatus(storage, now)`: reads the stored message, then removes it; it expires after 15 s; never throws
- `public/client.js`:
  - `handleBoardDrop` (about line 502) and `syncConnectedPlatformsForStory`: go through one `postBoardJson`. When the helper is missing, use the old plain `response.json()` path.
  - In `finally`: store the final message, then reload once if a reload is pending.
  - `handleBoardDragStart`: clear the stored message.
  - `initWebSocket` (about line 757): use `reloadDecision` with `boardSaveInFlight`.
  - On init, restore the message with `takeStoredStatus`.
- `src/templates/base-layout.js` -- add `<script src="/board-feedback.js"></script>` before `/client.js`.
- `src/server/static-generator.js` -- its regex strips the `client.js` tag; strip the new tag too.
- `biome.json` -- add `public/board-feedback.js` to the existing `client.js` override.
- The server, websocket and watcher are unchanged.
- KEEP from iteration 0 (backed up in the session scratchpad as `keep-2-3/`): the `node:vm` loading pattern and Response-based tests; the static-output test; the reported message texts.

## Tasks & Acceptance

**Execution:**
- [x] `public/board-feedback.js` -- pure helpers -- testable decision and message logic
- [x] `public/client.js` -- wire helpers, defer then a single reload, one-shot restore, clear on drag start, fallback when the helper is missing -- client behaviour
- [x] `src/templates/base-layout.js`, `src/server/static-generator.js`, `biome.json` -- load and strip the script; lint override
- [x] `tests/client/board-feedback.test.js` (new) -- every matrix row through the helpers in `node:vm`: defer vs reload vs skip; several broadcasts make one pending reload; store/take round trip and one-shot; clear on empty message; 15 s expiry; blocked storage; HTML 500, empty 502, JSON `{ ok: false }`, network failure
- [x] `tests/server/http-server.test.js` -- the dashboard HTML contains `/board-feedback.js`, and it comes before `/client.js`
- [x] `tests/server/static-output.test.js` (new) -- static HTML references neither script

**Acceptance Criteria:**
- Given a GitHub sync that takes longer than 1 s, when a card is dragged, then the sync completes, the page reloads once, and its result or error is shown after the reload.
- Given a card dragged to Done, when its story page is opened after the reload, then it shows Done.
- Given `npm run check`, then lint and all tests pass.

## Implementation Notes

## Spec Change Log

- 2026-11-17, loop 1 (intent_gap): the approved design skipped the saving tab's own reload, which left server-rendered story pages stale (triage #1). The human chose "Reload after the message". The intent, constraints and matrix were renegotiated; server-side attribution (`clientId`, `boardWrites`, `sourceClientId`) was dropped as unnecessary. This avoids stale detail views, and it makes triage #5, #6 and #10 moot. Triage #2, #4, #8 and #9 are folded in as matrix rows and tasks.
  KEEP: the pure-helper file plus `node:vm` testing; the `Response`-based `readJsonResponse` tests; the static-output test; the error message texts.

## Review Triage Log

Pass 1 (2026-11-17): blind-hunter (10), edge-case-hunter (9), verification-gap (2 gaps, 1 other), plus 1 found by the orchestrator during diff verification.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | orchestrator | Saving tab shows stale story detail pages after skipping its own reload | medium | `renderer.js` ~352 bakes each story's status badge into `window.__BMAD_CONTENT__` at render; after a drag to Done, opening the card still shows the old status. The frozen premise "the saving tab's DOM already reflects the write it made" holds only for the board | intent_gap |
| 2 | verif. | No test asserts the dashboard loads `/board-feedback.js` before `/client.js` | medium | pre-verified: removing the tag disables the feature with every test green | patch (moot this pass) |
| 3 | verif. + blind | `client.js` wiring (defer → reload in `finally`, restore on load, rejected fetch) untested | low | pre-verified; the repo has no harness for the DOM-bound IIFE | defer (filed disposition) |
| 4 | blind + edge + verif. | `postBoardJson` has no null guard for `BmadBoardFeedback` | low | only if the helper fails to load after HTML that lacks the tag (server upgraded under an open tab); the save writes, then a TypeError restores the card | patch (moot this pass) |
| 5 | blind + edge | Two tabs saving in one batch: last writer wins | medium | `boardWrites` keyed by path; A and B within ~1 s both write; the batch is attributed to B, so B misses A's change | patch (moot this pass) |
| 6 | blind + edge ×2 | Record not consumed; an external sprint-status edit within 5 s is attributed to the saver | low | `attributeBoardWrite` never deletes the matched record | patch (moot this pass) |
| 7 | edge | No-op save leaves a lingering record | false | same-column drops return before any request (`nextStatus === previousStatus`), so the UI cannot send a no-op save | reject |
| 8 | blind + edge | Restored message reappears on every reload within 15 s | low | `restoreBoardStatus` reads without removing | patch (moot this pass) |
| 9 | edge | Drag start clears the visible message but not storage | low | `setBoardStatus('')` on drag start leaves sessionStorage intact | patch (moot this pass) |
| 10 | edge | Clock moving backwards keeps a record attributable | low | negative `now - at` passes the window check; the fix is one condition | patch (moot this pass) |
| 11 | blind | Sync failures lose GitHub context; double period | false | the server's `error` text was shown the same way before; the new fallback names GitHub ("Could not sync the status to GitHub") | reject |
| 12 | blind | `clientId` is unbounded | low | localhost-only server, one map entry per path, echoed only to local tabs | reject (low, not met in practice) |
| 13 | blind | Live attribution tests depend on timing and message order | maybe-false (medium if true) | three consecutive passes locally; would need a slow-CI run to settle | defer |
| 14 | blind | Spec tasks unticked in the reviewed diff | false | ticked after the diff was staged, per workflow | reject |
| 15 | blind | Static strip regex is fragile | false | `static-output.test.js` asserts the reference is absent, so a changed tag fails the test | reject |
| 16 | edge | `readJsonResponse` claim mismatch (server error vs failureMessage) | false | the matrix requires failureMessage only for non-JSON bodies; JSON errors show the server's message by design | reject |

Pass 2 (2026-11-17, after loop 1): blind-hunter (12), edge-case-hunter (4), verification-gap (1 gap).

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 17 | verif. + blind ×2 | `client.js` wiring (defer, reload in `finally`, restore, clear on drag, fallback) is untested; the "one reload" test mirrors the logic | low | carried #3: same root cause, no harness for the DOM-bound IIFE; already in deferred-work.md | defer (carried) |
| 18 | blind + edge | A failed save stores its error, which reappears on an unrelated reload within 15 s | low | `finally` always calls `storeBoardStatus`; a failed save writes nothing, so no reload follows. Fix: store only when the save wrote or a reload is pending, otherwise clear | patch |
| 19 | blind | "(HTTP 200)" suffix on a failure | low | the server sends every `ok: false` with 400 (8 sites), so only a non-JSON 2xx body reaches it; the fix is a direct `status >= 400` condition | patch |
| 20 | blind | Stale deferred-work entry about attribution tests | low | #13 is moot after loop 1; the fix would edit an existing deferred-work entry, which the workflow forbids. Recorded here instead | reject |
| 21 | blind | Restored message taken when the status element is absent | false | `#board-save-status` exists whenever the board is editable, even on the wiki route (the view is hidden, not removed); read-only boards never store a message | reject |
| 22 | blind | Acceptance criteria have no recorded evidence | false | the manual checks are surfaced to the human at presentation; not a code defect | reject |
| 23 | blind | KEEP note points at the session scratchpad | false | the fix edits this build's spec | reject |
| 24 | blind | Test hard-codes port 4301 | false | `findAvailablePort` tries the next ports when one is taken (`port-finder.js:13`) | reject |
| 25 | blind | A broadcast mid-drag reloads and drops the drag | low | pre-existing: before this story every broadcast reloaded immediately, mid-drag included | defer (pre-existing) |
| 26 | blind | `epic-2-context.md` has outdated statements | low | compiled from planning docs that say the same; the fix edits planning context | reject |
| 27 | blind | Helper input-validation branches untested | low | cosmetic fallbacks (unknown action, non-number status); not met in use | reject |
| 28 | edge | Unrelated broadcast in flight, then own broadcast after the reload, loses the message | low | needs an outside change inside a sub-second window; the fix needs broadcast identity, which loop 1 removed by decision | reject |
| 29 | edge | A connection drop after the server wrote restores the card | low | pre-existing: a rejected fetch restored the card before this story too; a live server's broadcast reloads to the true state | defer (pre-existing) |
| 30 | edge | Sync failure text has the suffix ". Local status is already updated." | false | the matrix text is shown in full; the suffix is the existing local-save-succeeded framing | reject |

## Verification

**Commands:**
- `npm run check` -- expected: lint clean, all tests pass

**Manual checks:**
- On a temp project, drag a card: the message shows, the page reloads once, and the message is shown again. Open the story and it shows the new status. Stop the server and drag: the unreachable message appears and the card returns to its column.
