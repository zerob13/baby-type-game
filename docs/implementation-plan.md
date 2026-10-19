# Keybud implementation plan

Build a static, single-player browser game for learning English typing. The product and curriculum contract is [the game design](game-design.md). This document defines the implementation boundaries, reproducible rules, delivery order, and verification needed to make that design playable.

## 1. Scope and stack

Use TypeScript, Vite's vanilla TypeScript setup, Canvas 2D for the map, and native HTML/CSS for controls, prompts, dialogs, keyboard diagrams, and editable tasks. Do not introduce a game engine, UI framework, router, state-management package, backend, database, or service worker for the first playable map.

Vite supports a `vanilla-ts` template and produces static build output. Select a supported Node.js LTS satisfying the installed Vite release's engine requirement, record its major version in the repository when scaffolding, and commit one npm lockfile. Do not scaffold over the existing README or documentation. See [Vite's getting-started guide](https://vite.dev/guide/).

The campaign contains 32 implemented lessons across eight chapters. `grassland-01` is the fixed introductory map; later lessons add seeded terrain, curated content, native editor tasks, and different opponent schedules.

The repository contains the playable application, runtime portraits, concept references, behavioral and browser tests, publication checks, and GitHub Actions deployment. Cloudflare setup is specified in the [deployment guide](deployment.md).

## 2. Source organization

The source has these responsibilities:

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Application screens, semantic DOM events, focus, pause/resume, and application lifecycle |
| `src/game.ts` | Game state and exported types; pure input, energy, territory, metrics, enemy, and victory rules |
| `src/lessons.ts` | Typed lesson data, fixed maps, allowed characters, curated prompts, and seeded generation |
| `src/render.ts` | Canvas drawing and visual interpolation; no ownership of game rules or scores |
| `src/editor.ts` | Native editing tasks and success validation |
| `src/save.ts` | Snapshot validation, local storage, writer ownership, backups, import, and export |
| `src/styles.css` | Layout, accessible UI states, character presentation, and responsive sizing |
| `src/assets/` | Actual runtime tiles, sprites, portraits, and audio used by the application |
| `tests/game.test.ts` | Observable game-rule scenarios using real deterministic state |
| `tests/save.test.ts` | Save validation and recovery behavior |
| `tests/browser/adventure.spec.ts` | Complete campaign, native gestures, reload, import/export, and cross-tab ownership |

Keep functions and types exported from the owning module rather than adding an event bus, service container, entity/component system, or a generic plugin interface. Concept PNGs under `docs/concepts/` are documentation references, not a full-screen runtime background or production sprite sheet.

## 3. Application states

Use explicit screen and run states. A run can be `ready`, `playing`, `paused`, or `won`. Dialogs and teaching overlays cannot keep the simulation running underneath them.

```text
Home -> Lesson selection -> Teaching / Ready -> Playing -> Won -> Results
  |                             ^               |
  +-> Continue saved run -> Paused <-------------+
                               |
                               +-> Resume -> Ready
                               +-> Save and return -> Home
                               +-> Confirm restart -> New ready run
```

- A new run starts timing on its first valid target character, not on screen entry or dialogue dismissal.
- The first valid target character also counts as an accepted character and grants energy. The speed display stays unavailable until elapsed time is positive.
- Other keys in `ready` only show a hand-position hint; they do not start the clock or increment errors.
- Resume is explicit. Restore focus and enter `ready`; the next valid target character resumes timing and is processed once.
- Hidden pages, window blur, focus leaving the practice area, overlays, and settings pause the run.
- Starting another lesson or changing mode with an unfinished run requires choosing to keep or replace that run. One profile stores one unfinished run.
- A restart changes only the current run. A profile reset is a separate, confirmed action.
- `won` is terminal. Persist progression and clear the active run in the same snapshot before exposing the next-lesson action. Failed persistence remains visible and exportable.

## 4. Deterministic gameplay contract

### 4.1 State and time

Keep the complete gameplay state as plain serializable data. Inject semantic actions and elapsed active time; do not read the DOM, `Date.now()`, local storage, or unseeded randomness from rule functions.

Use a monotonic clock for active duration. Rendering can use `requestAnimationFrame`; simulation results must be independent of refresh rate. Advance timers at fixed 50 ms steps and retain the remainder. Split processing at input timestamps so a key is not moved earlier or later by the render frame rate.

If a foreground frame gap exceeds 250 ms, pause at the last processed active time and discard the unprocessed gap. Require explicit resume rather than delivering an invisible burst of attacks after a stall. Paused and offline wall-clock duration never enters the game clock.

For events with the same active timestamp, settle the player's input and expansion before resolving an enemy attack. Check victory immediately after ownership changes. Stop all later processing once the run is won.

Store and advance a single seeded PRNG state for gameplay decisions. Cosmetic particles may use separate randomness but cannot change prompts, ownership, scores, or attack timing. Seed zero must be valid or normalized consistently.

### 4.2 Input actions

Ordinary drills receive one printable character at a time. Match `KeyboardEvent.key` to the exact expected character; the training layout is English QWERTY. `KeyboardEvent.code` may position the physical-key diagram but does not replace the actual produced character.

- Handle input only while the focused practice control owns a playing or ready run.
- Ignore `event.repeat`. Consecutive identical targets require release and another keydown. See [KeyboardEvent.repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat).
- Ignore standalone modifiers and navigation keys for character scoring. Preserve Ctrl, Command, and Alt combinations unless a specific editing task owns the action.
- Treat composition, dead keys, and IME processing as an input-mode interruption, not as wrong characters. Resume after the learner switches back to English input.
- A matching printable key advances the cursor and increments correct attempts once.
- A wrong printable key increments wrong attempts and resets combo; it does not advance or insert text.
- Ordinary paste does not grant energy or advance the prompt. Do not process both keydown and input events as separate successful characters.
- Never install a global key handler that prevents normal menus, browser shortcuts, or keyboard navigation.

Early lessons visually group letters without inserting unlearned spaces into target strings. Learned spaces have an explicit visible indicator and are ordinary scorable characters.

### 4.3 Energy, pressure, and metrics

The normative numeric rules are in sections 5 and 6 of the game design. Implement them directly in `game.ts`:

1. Correct input grants 1 energy, increments combo, and grants 1 extra energy on every tenth consecutive success.
2. While energy is at least 2 and a legal frontier exists, spend 2 and claim one tile.
3. In challenge mode, a wrong input spends 1 available energy or, when none is available, adds 1 pressure. It does not do both. In learning mode it only changes accuracy and combo.
4. Cap total fractional pressure at 3. Guard all counters and accumulated time against negative values and non-finite input.
5. Enable low-speed pressure only with a full 15-second active window followed by 5 continuous seconds below target. Use `0.25 * max(0, 1 - recentCPM / targetCPM)` pressure per active second. Reset the continuous-low-speed counter at or above target.
6. Ordinary attacks require at least 1 pressure, a 2-second visible warning, and at least 2 seconds since the previous attack resolved. Consume 1 pressure and attempt one legal capture. An attack with no legal target still consumes its pressure.
7. Pause freezes pressure, telegraphs, cooldowns, and combo. Resume clears the rolling-speed samples and low-speed streak; collect a fresh 15-second window. Preserve other timers without wall-clock catch-up.
8. Clear pressure and pending attacks once the enemy has no owned tiles. Do not respawn it during the run.

Calculate accuracy from correct and wrong printable attempts, not from the prompt cursor. Calculate final CPM from total correct attempts and active duration, including ordinary hesitation. Keep recent-window CPM separate from final CPM. Empty denominators display an unavailable value rather than `NaN`, infinity, or a fabricated perfect score.

Attribute per-key mistakes to the expected target. Unattempted keys cannot appear in the weak-key ranking. Cap weak-key weighting at twice the ordinary weight and preserve the lesson's allowed-character set.

### 4.4 Territory and victory

Store terrain and owner arrays separately. Each tile is blocked or claimable; each claimable tile is neutral, player-owned, or enemy-owned. The protected player home is a claimable tile with an immutable player owner.

- Use four-neighbor adjacency for movement and expansion.
- Validate that all claimable cells are reachable from player home through claimable terrain, regardless of current owner.
- A player capture must border a player tile. Prefer candidates with smaller static claimable-path distance from home; break ties using the seeded generator.
- An enemy capture must border an enemy tile. Prefer proximity to player-owned terrain and use seeded ties. Reject player home and any capture disconnecting remaining player tiles from home.
- Player captures may split enemy land. Such pockets remain enemy-owned, can supply their own adjacent frontiers, and are not automatically deleted. The enemy flag relocates when captured.
- Recompute a small board's frontier directly after a capture. Avoid caching multiple competing ownership representations.
- Victory is `playerOwnedCount === claimableCount`, not rounded percentage, rival elimination, elapsed duration, or an animation callback.
- Emit and persist the outcome once. Final input, animation completion, repeated clicks, and reloads cannot duplicate rewards.

For M1, use a fixed 12 by 8 board with exactly 72 connected claimable cells and 24 blocked cells. Player and enemy start on different claimable cells. Production seeds vary prompts and tie-breaking before variable terrain is introduced.

Use this exact initial mask. Coordinates are zero-based `(column, row)`; player home is `(1, 1)`, enemy flag is `(10, 6)`. `#` is blocked, `.` is neutral claimable land, and `P`/`E` are owned claimable land. Additional surrounding water and cliffs are decorative.

```text
############
.P..........
............
............
............
............
..........E.
############
```

### 4.5 Editor tasks

Use native text inputs and textareas. A task is successful only when its expected text, selection, focus, and required native action conditions are satisfied. Clipboard tasks must observe a real copy/cut/paste action and the correct resulting text, not merely the modifier key combination.

Each editor lesson contains six tasks, each successful task grants 12 energy exactly once, and the board has 36 claimable tiles. Do not also grant per-character or combo energy. Editor lessons use learning mode only and score task mistakes and hint use instead of CPM.

Count one task mistake for a required native action attempted without its prerequisites, or for an unsuccessful explicit check. Ordinary intermediate typing states and exploratory navigation are not per-key errors. Check for success automatically after relevant native events; the check button can validate but cannot award a completed task again. Record hint use separately.

Prepare undo/redo exercises with actual user edits so the browser has a native undo history. Do not set a value programmatically and then assume it can be undone. On macOS, explain that the key labelled Delete normally performs backward deletion; forward Delete may require Fn+Delete.

Browser undo history is not serializable. Checkpoint editor runs at the beginning of the current task; resuming restarts that task's instructions and native history while preserving prior task rewards and territory. A checkpoint cannot re-award a completed task.

Use normal Tab order and native clipboard behavior. Safari on macOS may need Option+Tab to include buttons, depending on keyboard-navigation settings; the task explains this native alternative. See [Apple's keyboard shortcuts](https://support.apple.com/guide/safari/cpsh003/mac). Do not require `navigator.clipboard.readText()` permission or attempt to catch close-tab, refresh, or application-switching shortcuts. Platform labels can be manually corrected in settings. Browser automation exercises real native editing gestures. Separate physical Windows keyboard and observed child play sessions remain release-calibration checks.

## 5. Lesson and content data

Use stable identifiers, for example `grassland-01` through `grassland-04`. A lesson record contains its chapter, order, title, kind, prerequisite, allowed characters, new characters, content source, map, target CPM when applicable, tutorial steps, opponent behavior, and data revision.

The syllabus and challenge targets live in section 9 of the game design and typed records in `src/lessons.ts`. No generic course engine or runtime content service is used.

- Complete learning mode to unlock the next lesson. Challenge or star requirements never block the curriculum.
- Unlock challenge only after completing that ordinary lesson's learning mode. Editor lessons have no separate challenge mode.
- Store stars from a single completed run. Never combine accuracy from one run with speed from another to manufacture three stars.
- Ordinary record speed requires at least 30 printable attempts. Individual best metrics retain the sample size and duration that produced them.
- Use a shuffled character bag for letter drills, then a bounded weak-key weight. Do not generate four identical targets in a row unless that drill explicitly teaches repetition.
- Curate words and sentences locally. Check allowed characters, spaces, capitalization, and punctuation against the lesson before accepting content.
- Keep prose, prompts, maps, and rules in repository files. No runtime generative API or remote content dependency is required.

## 6. Save format and data safety

### 6.1 Snapshot contents

Use the storage keys `keybud.save` and `keybud.save.backup`. Export the same validated profile as UTF-8 JSON, using a filename such as `keybud-save-2026-10-19.json` generated from the user's local date.

| Field | Contents |
| --- | --- |
| `schemaVersion` | Save structure version, initially `1` |
| `revision` | Write counter; Web Locks provide exclusive writer ownership |
| `savedAt` | Wall-clock timestamp used for display, never for battle catch-up |
| `settings` | Audio, reduced motion, hints, view mode, and shortcut platform |
| `progress` | Stable lesson IDs, completion per supported mode, same-run stars, and bounded aggregate records |
| `keyStats` | Bounded totals by supported target character |
| `activeRun` | A paused-compatible snapshot, or `null` |

An active snapshot includes lesson and map IDs and their data revisions; the terrain variant or its validated mask; owners; protected home; enemy flag; seed and current PRNG state; prompt, cursor, and generator bag; energy, combo, pressure, pending attack and cooldown state; total active time, step remainder, counters, key statistics, and tutorial state. Editor snapshots also include current task index and task-start checkpoint.

Always restore into `paused`, clear the recent-speed window, and require readiness before play. Reject a snapshot whose lesson/map revision cannot be interpreted; keep completed curriculum and offer to restart that lesson rather than guessing new tile ownership.

### 6.2 Validation and recovery

Treat local storage and imported JSON as untrusted input. Enforce a 1 MiB import limit, the exact seeded 12 by 8 board, exact mask/owner lengths, a legal home and enemy flag, valid enum values, bounded strings, known lesson references, nonnegative finite times, safe integer counters, and valid pressure/energy ranges. Ordinary prompts must satisfy allowed-character rules; editor content must satisfy its task definition.

Reconstruct known fields explicitly. Do not spread arbitrary imported objects into live state or render imported strings with `innerHTML`. Confirm that terrain and ownership are consistent, all claimable cells are statically connected, and player ownership remains connected to home. Use the same validator for local reads, backups, and imports.

For a normal write:

1. Build and validate the complete next profile snapshot in memory.
2. Preserve the current valid primary as backup before replacement. If primary is corrupt, do not overwrite a valid backup with it.
3. Replace the primary with one `localStorage.setItem` call. Surface success only after that call succeeds.
4. Catch storage access, quota, and serialization failures. Keep the in-memory run and expose an export action.

On read, distinguish no data, malformed data, unsupported future schema, and inaccessible storage. A future schema is read-only; no reset or automatic migration can overwrite it. A corrupt primary remains available for export while a valid backup can supply recovery. If neither primary nor backup is readable, block routine writes until an explicit import or confirmed reset. Never invoke `localStorage.clear()`.

Imported data must be validated before confirmation or writes. Show the incoming completion summary, confirm replacement, and preserve the current valid profile as backup. Cancel or failure leaves the current profile intact. Successful replacement discards the superseded run without firing an unconditional page-exit save of stale state.

### 6.3 Single writer and save timing

Acquire one origin-scoped exclusive Web Lock named `keybud.writer` before permitting shared-profile writes. Request it without waiting indefinitely; a second tab becomes read-only and directs the learner to the active game tab. Hold the lock for the app's write-enabled lifetime and release it when the page closes. A read-only tab can retry after the active tab is closed, then reload the latest profile before becoming a writer. See [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

If Web Locks or persistent storage is unavailable, clearly enter memory-only play with JSON export rather than allowing multiple uncoordinated writers. Never take over another live tab's lock or merge two active battles.

Throttle routine writes to at most one every two active seconds; save immediately after pause, completion, explicit navigation, and page-hidden events. Use the page-hidden event as a best effort, not as a guarantee that termination will run cleanup code. A normal abrupt close may lose at most the unsaved interval, not the last valid profile. Avoid routine before-unload confirmation dialogs.

Keep profile snapshots below 256 KiB under expected campaign use. Store summaries rather than an unlimited event log. Local storage is origin-specific and can throw when unavailable; privacy browsing and cleared site data affect persistence. Explain this next to export/import. See [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

## 7. Rendering, interface, and assets

The ASCII layouts, cast, and visual rules in sections 2 and 10 of the game design define the UI. Implement map rendering separately from real HTML controls so keyboard navigation and text remain usable.

- Render tiles at integer logical sizes, scale pixel assets with image smoothing disabled, and account for device pixel ratio without stretching hit targets.
- Keep prompts, buttons, progress summaries, keyboard diagrams, hand hints, and task editors in the DOM. Provide a text equivalent of ownership and enemy warnings outside Canvas.
- Reserve a stable input panel. Territory animation must not move the prompt or steal focus.
- Use visible focus, accessible labels, readable contrast, and color-independent outlines and symbols. Do not announce every animation or keystroke through a live region.
- Default to a 1024 by 700 CSS-pixel target layout; preserve the input panel and navigation at smaller sizes and under browser zoom.
- Respect reduced-motion preferences and the saved override. Audio starts after a user gesture and has separate music/effects controls.
- Use one transparent portrait atlas and code-drawn pixel environments. The initial production output is approximately 1.22 MiB, within the 3 MiB transfer budget; concept boards are excluded from the application bundle.
- Missing optional art or audio must not prevent input, saving, or completing a run. Essential asset failures need a retry path.

The detailed concept images are not a promise to reproduce every decorative object in the first milestone. Runtime art starts with one grass tile set, blocked terrain, a bridge where required, small white-dumpling sprites, portraits, and clear ownership borders. Add scene decorations without changing the underlying rules.

## 8. Delivery milestones

### M1: One complete grassland lesson

- [x] Create the Vite/TypeScript application and one lockfile without replacing existing documentation.
- [x] Add the `grassland-01` map, f/j lesson, hand-position tutorial, seeded groups, and a real input panel.
- [x] Implement energy, combo, four-neighbor expansion, protected home, metrics, and terminal victory.
- [x] Ship learning mode first; unlock the same lesson's steady challenge after completion.
- [x] Implement rolling-speed pressure, mistake penalties, warning/cooldown, and pause/resume.
- [x] Add home, current lesson entry, game, pause, settings, and results screens. Do not display unusable campaign controls.
- [x] Implement local save/resume, writer ownership, backups, import/export, and visible save errors.
- [x] Use a coherent grassland and white-dumpling presentation, including reduced motion and muted feedback.
- [x] Pass the rule and browser scenarios below and play from a new profile through victory.

M1 is complete only when a learner can begin, understand the prompt, grow territory, pause, reload, continue, finish, and replay. A static mockup, an input field without territory rules, or a battle without persistence is incomplete.

### M2: Foundational fingering curriculum

- [x] Implement chapters 1 to 3, the chapter route, lesson unlocks, per-mode records, and same-run stars.
- [x] Add allowed-character validation, weak-key reporting, controlled prompt weighting, and an unlocked practice entry.
- [x] Teach the full home row, upper and lower rows, learned spaces, and basic punctuation in syllabus order.
- [x] Add connected terrain variants and test seeds against reachability and valid spawn rules.

### M3: Words, punctuation, and native editing

- [x] Implement chapters 4 to 6 with curated words and short sentences.
- [x] Teach opposite-hand Shift, digits, punctuation, backward/forward deletion, and editing keys.
- [x] Add selection, focus, real clipboard, undo, and redo tasks with task-start checkpoints.
- [ ] Verify physical Windows keyboard behavior and browser-specific system accessibility settings; do not simulate a successful native action when a gesture is unavailable.

### M4: Complete adventure

- [x] Implement chapters 7 and 8, charge and periodic opponents, the final battle, and the ending.
- [x] Complete chapter restoration scenes, runtime pixel art, portraits, and restrained audio.
- [x] Verify all 32 lessons, every map variant, content restrictions, unlock paths, and victory conditions.
- [ ] Run observed child play sessions and adjust map workload, prompts, and pressure according to the design's order of priorities.

### M5: Publish the static game

- [x] Configure the Cloudflare account/token repository secrets and create the Direct Upload project using the deployment workflow.
- [x] Activate the configured clean install, type check, behavioral tests, and production build by completing the M1 scaffold and scripts.
- [x] Deploy the verified `dist` artifact from GitHub Actions after successful `main` checks; do not enable a second automatic Pages Git build.
- [x] Serve a root `index.html`; keep application navigation in the client without introducing deep-path routing requirements.
- [x] Verify the production build and selected production domain, save/resume, asset loading, and editor capabilities over HTTPS.
- [x] Explain export/import when switching from a preview origin to the production domain. Do not imply shared saves across those origins.

Direct Upload from CI is supported by [Cloudflare Pages](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/). No Cloudflare Worker, database, or account service is required for the planned runtime.

## 9. Verification contracts

Add a small behavioral test runner with M1; use Vitest for the TypeScript rules unless the installed project already provides an equivalent. Prefer a few scenario tests with real maps, state, and seeded generation over mocks of internal helper calls. Add browser automation when exercising actual DOM, native editing, and cross-tab behavior; do not build an end-to-end framework solely to assert static document text.

### Verified runtime

The production application is [baby-type-game.pages.dev](https://baby-type-game.pages.dev). [CI run 39238413864](https://github.com/zerob13/baby-type-game/actions/runs/39238413864) verifies application commit `e953221` and its successful Cloudflare deployment.

| Check | Result |
| --- | --- |
| Rules, curriculum, native task predicates, and persistence | 27 behavioral tests passed |
| Chromium and Firefox on Linux CI | Complete 32-lesson campaign, native editor tasks, challenge attacks, save/import/export, and single-writer scenarios passed |
| Chromium and WebKit on macOS | The same scenarios passed against the production build and the public HTTPS production origin |
| Production assets and headers | Runtime resources loaded; cache policy, content security policy, and origin-specific saves verified |
| Publication checks | Publishable history, tracked files, PNG metadata, and static output checks passed |

Physical Windows keyboards and observed child play sessions remain human calibration work. Browser automation validates native editing results and progression, but cannot establish age suitability, physical finger placement, or comfortable lesson pacing for a particular child.

### 9.1 Required rule scenarios

| Scenario | Required result |
| --- | --- |
| Two accepted characters | Two energy produces exactly one legal captured tile |
| Ten-character combo | Ten ordinary energy plus one bonus; error resets the combo boundary |
| Mistake with/without energy | Spend one energy or add one pressure in challenge, never both; neither penalty in learning |
| Speed boundary | No low-speed pressure during the first 15 active seconds or first 5 continuous low seconds; target equality resets the streak |
| Known low-speed rate | Target 30 CPM and recent 15 CPM produce 0.125 pressure per active second after qualification |
| Pause and resume | No time, pressure, ownership, or prompt changes while paused; resumed speed window starts fresh |
| Held key and paste | No repeated rewards; adjacent equal targets need separate key presses |
| Invalid input mode | Composition/dead-key interruption does not change accuracy or energy |
| Frontier and home | No diagonal capture, blocked capture, protected-home loss, or enemy-induced player disconnection |
| Enemy has no target | Pressure is consumed; no infinite loop or attack backlog |
| Exact victory | All claimable tiles, including the enemy flag, can be claimed; victory and rewards occur once |
| Same seed and actions | Equivalent state after deterministic timing and a serialized pause/resume |
| Content progression | No unlearned spaces, uppercase, digits, punctuation, or unknown task IDs |
| Stars and metrics | No zero-denominator scores, tiny-sample speed records, or cross-run three-star combinations |
| Editor reward | Six completed task IDs award once each and finish a 36-tile map; restored tasks cannot duplicate rewards |

### 9.2 Required persistence scenarios

- Round-trip an unfinished run and resume into paused state with the same map, cursor, counters, and PRNG state.
- Keep the last valid profile when serialization, quota, permissions, import confirmation, or validation fails.
- Recover a malformed primary from a valid backup without overwriting that backup with malformed data.
- Refuse to overwrite a future schema; reject mismatched map revisions for active runs without deleting completed lessons.
- Reject oversized files, impossible board shapes, invalid owners, unsafe strings, non-finite numbers, impossible cursors, and inconsistent progression.
- Prevent a second tab from writing while the first owns the Web Lock; release and reload safely before transferring ownership.
- Clear an active run and record its completion in one snapshot; reload cannot replay completion rewards.
- Keep completed editor tasks while restarting only the in-progress native-editing task on resume.

### 9.3 Browser and human checks

Before M1 is called playable, exercise the complete loop in an available Chromium browser, test keyboard navigation and reduced motion, and verify a production build locally. Before release, run the browser checks in current Chrome, Edge, Firefox, and Safari, with Windows and macOS input where applicable. Report unavailable combinations rather than presenting them as passed.

Exercise blur, tab switching, hidden pages, frame stalls, refresh during play, double-clicked result actions, a second game tab, blocked storage, save export/import, browser zoom, a small window, muted audio, and return from settings. Native editing lessons require actual clipboard and undo/redo checks on their supported platforms.

Use observed child play to assess whether instructions teach the intended hand placement and whether the workload is appropriate. Automated key tests establish rule correctness, not physical fingering or educational effectiveness.

## 10. Acceptance commands

Use Node.js 24 and the committed lockfile:

| Command | Contract |
| --- | --- |
| `npm ci` | Reproducible installation from the committed lockfile |
| `npm run dev` | Local development server |
| `npm run typecheck` | TypeScript validation without emitting application output |
| `npm test` | Non-watch behavioral checks that exit with a result |
| `npm run test:browser` | Build and exercise the production application in Chromium, Firefox, and WebKit |
| `npm run build` | Type validation and optimized static output in `dist` |
| `npm run preview` | Serve the production build for local verification |

Run the affected rule and persistence checks, type validation, and a production build before delivering gameplay changes. Broaden testing when mechanics, storage, native editing, or browser integration change. Keep test assertions tied to the contracts above rather than exact private function names or decorative UI structure.
