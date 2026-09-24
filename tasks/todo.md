# Time Tracker: build checklist

Plan: `~/.claude/plans/users-darren-desktop-time-tracker-promp-vast-russell.md`

## Build
- [x] `js/time.js`: pure date/duration helpers
- [x] `js/storage.js`: model, normalize, reducers, persistence, cross-tab sync
- [x] `js/ui.js`: `el()`, aligned ticker, storage banner, export/import footer
- [x] `css/styles.css`
- [x] `index.html` + `js/timers.js`
- [x] `analytics/index.html` + `js/analytics.js`
- [x] `calendar/index.html` + `js/calendar.js`
- [x] `tests.html`
- [x] `README.md`

## Verify
- [x] tests.html all green (39/39)
- [x] Timers flow: add, start, switch (pauses the other), refresh keeps it running, edit goal, delete the running task
- [x] Today's totals match across Timers, Analytics and Calendar (11:35:30 on all three)
- [x] Seeded edge cases: overnight active timer, overlapping blocks, 20s session, corrupt JSON, failed storage write
- [x] Cross-tab sync (paused in tab B, and the calendar in tab A re-rendered)
- [x] 375px layout on all pages (no page-level horizontal scroll; calendar and table scroll inside their own boxes)
- [x] Import confirm flow and round trip. Export was checked via `exportJSON()` rather than by triggering a real download.
- [x] No console errors on any page

## Review
Bugs found and fixed during verification:
1. **Calendar grid was empty.** `replaceChildren()` doesn't flatten arrays, so the headers and columns were never added. Fixed by spreading the arrays.
2. **Running-block popover jumped to the top of the window.** It was anchored to the block's real top, which can sit hours above the visible area. It now anchors to the visible part of the block.
3. **Popover vanished when a block got keyboard focus.** The browser scrolls a focused block into view, and the scroll handler hid the popover. The popover now follows its block while scrolling instead.
4. **Analytics page scrolled sideways at 375px.** The table's absolutely positioned screen-reader text escaped its scroll box. `.table-scroll` now has `position: relative`.
5. **Sub-pixel seam above the sticky calendar header** let blocks peek through. Covered with an upward surface-colored shadow.
6. **Mobile 7-day table opened on the oldest day.** It now opens scrolled to today, after the cells are filled.

Palette: validated with the dataviz skill's checker. It passes adjacent-pair colorblind separation in default-assignment order, and white text meets WCAG AA on all 8 colors. No 8-color set passes all-pairs, so the task name is always shown next to its color.

---

# Charcoal/White colors + per-weekday schedules

Plan: `~/.claude/plans/system-reminder-you-are-operating-streamed-reddy.md`

## Build
- [x] `js/storage.js`: Charcoal + White swatches, `needsDarkText`, `weekdayGoals` model + v1 migration
- [x] `js/time.js`: `weekdayName`, `weekdayGoal`, `describeSchedule`
- [x] `js/ui.js`: `taskColorVars` / `setTaskColor`
- [x] `css/styles.css`: `--task-ink` / `--task-edge`, schedule editor, off-today styles
- [x] `js/timers.js` + `index.html`: schedule editor, "Not scheduled today" section, midnight re-render
- [x] `js/analytics.js` + `analytics/index.html`: per-day goals, off days
- [x] `js/calendar.js`: color vars
- [x] `tests.html`: updated fixtures + new cases
- [x] `README.md`

## Verify
- [x] tests.html all green (51/51)
- [x] v1 data migrates to "Every day"
- [x] White and Charcoal readable on Timers, Analytics, Calendar
- [x] Weekday/weekend/custom schedules, validation, edit round trip
- [x] Analytics goals met + 7-day table off days
- [x] Midnight rollover moves cards between sections
- [x] 375px layout, no console errors

## Review
- White works because every task-color surface now reads `--task-ink` (text on the fill) and `--task-edge` (lines and text against the page) from `ui.taskColorVars`. For the eight hues and Charcoal both resolve to the old values, so existing tasks look identical.
- Timers `render` used to be passed straight to `store.subscribe`, which calls listeners with the state. Once `render` took a `now` parameter, that would have passed the state object in as the time, so it's wrapped as `() => render()` (the same as Analytics).
- `.claude/launch.json` now uses `autoPort` because another session's server held port 5173.
- Screenshots in the Browser pane sometimes lag a repaint behind, so DOM state was confirmed with `javascript_tool` before trusting a screenshot.

---

# Settings page: themes + storage estimate

Plan: `~/.claude/plans/system-reminder-you-are-operating-twinkly-token.md`

## Build
- [x] `css/styles.css`: split color tokens into light/dark scopes, new `--accent-text` / `--danger-text` / `--placeholder` / `--today-bg` / `--shadow-pop`
- [x] `js/storage.js`: `DARK_SURFACE_MUTED`, `darkEdge`, `measureEntries`, `estimateUsage`, `formatSize`
- [x] `js/ui.js`: `--task-edge` via `light-dark()`
- [x] `js/theme.js`: pre-paint theme apply, system + cross-tab sync
- [x] `settings/index.html` + `js/settings.js` + settings CSS
- [x] Settings nav link on every page, nav wraps on narrow screens
- [x] `tests.html`: new cases
- [x] `README.md`

## Verify
- [x] tests.html all green (56/56), in both themes
- [x] Dark theme on Timers, Analytics, Calendar, Settings (Charcoal/White tasks, running states, popover, met cells, banner)
- [x] No flash of light theme on reload in dark
- [x] Match device follows OS scheme live; light unchanged from `main` (0 computed-style diffs across every element on Timers, Analytics and Calendar)
- [x] Cross-tab theme sync
- [x] Storage figures match real sizes; conditional rows appear/disappear
- [x] Dark token contrast passes AA
- [x] 320/375px layouts, no console errors

## Review
- The dark theme uses a lighter `*-text` sibling for tokens that were doing two jobs: `--accent-strong` and `--danger` were both text on the page and fills under white text. The light values are identical, so the light theme is unchanged. That was checked by swapping `main`'s stylesheet in at runtime and diffing computed styles.
- Task colors keep their fills. On dark, `--task-edge` comes from `light-dark(light edge, darkEdge(color))`, so the other tabs restyle live when the theme changes, with no re-render. `darkEdge` targets `--surface-muted`, not `--surface`, because the running button's hover puts task-colored text on it. Against `--surface` it only reached about 4.0:1.
- The storage estimate is measured in characters (key + value) against 5 MiB. It's labelled as an estimate because no browser reports localStorage usage. Other apps' keys at the same origin (e.g. localhost) share the quota, so they're shown on their own line.
- Found while verifying: Settings only re-measured on tracker or theme changes, so a key removed in another tab (the corrupt backup, other apps) went stale. It now also listens to every `storage` event.
- Also found while verifying: `replaceAll` over still-corrupt stored data re-creates `timeTracker.v1.corrupt`, because `update()` re-reads before writing. That's existing behavior, and the breakdown reports it accurately.
- Mobile: stacked theme cards were mostly preview, so at ≤ 600px the preview sits beside the label and shrinks with the card. The nav wraps to two rows at 320px.
- The seeded test data was removed afterwards. This origin's storage is empty again, as it was before.

---

# Naming continuity + cleanup

## Build
- [x] Site name is **Time Tracker** everywhere: `index.html` (title + brand), `settings/index.html` and `tests.html` titles said "Activity Tracker"
- [x] Home page is **Activities** everywhere: `tests.html` back link, `README.md` page table and layout, CSS section comment
- [x] `js/timers.js` → `js/activities.js`, so each page script is named after its page, like `analytics.js`, `calendar.js` and `settings.js`
- [ ] Remove the merged `settings-dark-theme-a2fb97` and `time-tracking-dark-scheduling-92dcbe` worktrees and their branches (blocked by a permission check, so the user will run it)

## Verify
- [x] tests.html all green (56/56)
- [x] Activities page loads `js/activities.js` (schedule editor, swatches and footer render)
- [x] `git grep -i -E "activity tracker|timers"` finds nothing outside this log
- [x] All four pages show "Time Tracker" in the tab title and header, with the matching page heading

## Review
- Swept for dead code: every helper exported from `time.js`, `storage.js`, `ui.js` and `theme.js` is used by another file, every class in `styles.css` is used, and there are no `console.log`, `debugger` or TODO leftovers. So nothing else needed removing.
- `tests.html` stays. It's the project's only automated coverage, and no app page loads it.
- "Timer" is still used where it means the running stopwatch (`toggleTimer`, `role="timer"`, "the running timer"). Only the page's name changed.
- Earlier sections of this log still say "Timers page", because that's what the page was called when they were written.
