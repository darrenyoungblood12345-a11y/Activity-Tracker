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
