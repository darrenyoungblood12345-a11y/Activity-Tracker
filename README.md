# Time Tracker

A small static site for tracking time on daily tasks. Each task has its own stopwatch that you can pause and resume, plus a weekly schedule of goals such as "Reading: 30 minutes a day", "Gym: 45 minutes on Mon, Wed and Fri" or "Guitar: 20 minutes on weekdays, 1 hour on Saturday". There's no framework, no build step and no backend: just HTML, CSS and vanilla JavaScript, with data saved in your browser's `localStorage`.

| Page | What it does |
|---|---|
| **Activities** (`/index.html`) | Create tasks, choose the days they happen and each day's goal, and start or pause each stopwatch. Only one runs at a time. Tasks that aren't scheduled today are listed separately and can still be started. |
| **Analytics** (`/analytics/`) | Today's total, goals met, per-task progress and a 7-day goal table. Days a task isn't scheduled don't count against it. |
| **Calendar** (`/calendar/`) | A Google Calendar–style week view with one block per tracked session. |
| **Settings** (`/settings/`) | Choose the Light theme, the Dark theme or Match device, and see an estimate of how much browser storage the tracker uses. |

## Run it locally

Serve the folder with any static file server, then open the printed URL:

```bash
npx serve .
```

```bash
python3 -m http.server 8000
```

Use a server instead of opening the files with `file://`. Some browsers give every `file://` page its own separate storage, so the pages wouldn't see each other's data.

To deploy, upload the folder as-is to GitHub Pages, Netlify or any static host. All paths are relative, so it also works from a sub-path such as `username.github.io/time-tracker/`.

## Tests

Open **`/tests.html`** on the same server. It runs assertions against `js/time.js`, covering midnight splitting, today's total with a running timer, duration formatting, overlap layout, DST-safe day math and weekly schedules. It also tests the pure reducers, the version 1 → 2 migration, the text-contrast and dark-theme color helpers, and the storage-estimate helpers in `js/storage.js`. Results appear on the page, and the tab title shows the pass count. The tests never write your saved data.

## How data is stored

All tracked data is stored under one `localStorage` key, `timeTracker.v1`. The key keeps its name across upgrades, and the `version` field inside it tracks the shape:

```js
{
  version: 2,
  tasks:    [{ id, name, color, weekdayGoals, createdAt }],
  sessions: [{ id, taskId, start, end }],   // epoch ms, one per start→pause stretch
  active:   { taskId, start } | null        // the running timer, if any
}
```

- **`weekdayGoals`** holds 7 goals in minutes, indexed like `Date#getDay()` (`[0]` is Sunday). `0` means the task isn't scheduled that day. For example, `[0, 60, 60, 60, 60, 60, 20]` means an hour on weekdays, 20 minutes on Saturday and off on Sunday.
- **Version 1 data upgrades automatically.** A task's old `dailyGoalMinutes` becomes the same goal every day, both for saved data and for imported backups.

- **Elapsed time always comes from timestamps** (`now - start`), never from counting timer ticks. Background tabs, sleep and refreshes can't make the clock drift.
- **The running timer is stored**, so it survives refreshes, moving between pages and closing the tab.
- **Sessions that cross midnight** are stored once, as-is. They're split at local midnight only when totals are calculated or blocks are drawn (`splitByDay` in `js/time.js`), so they count toward both days.
- **Multiple tabs stay in sync** through the browser's `storage` event. Each change re-reads the latest saved state before writing, so one tab can't overwrite another tab's changes.
- **Corrupt data** is replaced with an empty state instead of crashing the app. The unreadable original is kept under `timeTracker.v1.corrupt`, and a banner explains what happened.
- **If storage is blocked or full**, the app keeps working in memory and shows a warning banner. Use Export to save a copy of your data.
- **The theme** is saved separately under `timeTracker.theme` (`"light"`, `"dark"` or `"system"`, and Light when unset). It's a preference for this browser, so Export and Import leave it alone. It syncs across open tabs like everything else.
- **The storage estimate** on the Settings page adds up the characters of every key and value saved at this address and compares the total with the roughly 5 MB that browsers allow per site. Browsers don't report localStorage usage, so it's an estimate. Keys from other apps served from the same address, such as other `localhost` projects, count against the same limit and appear on a separate line.

### Backup, restore and reset

- **Export JSON** in the footer downloads a backup of all your data.
- **Import JSON** asks for confirmation, then *replaces* all current data with the file's contents. Invalid entries in the file are dropped.
- **To start over**, run `localStorage.removeItem('timeTracker.v1')` in the browser console and reload the page.

## Project layout

```
index.html              Activities page (home)
analytics/index.html    Analytics page
calendar/index.html     Calendar page
settings/index.html     Settings page
css/styles.css          Shared styles
js/theme.js             Applies the saved theme before the first paint
js/time.js              Pure date/duration helpers (no DOM)
js/storage.js           Data model, validation, load/save, cross-tab sync
js/ui.js                Shared page chrome: DOM helper, ticker, banner, export/import
js/activities.js        Activities page
js/analytics.js         Analytics page
js/calendar.js          Calendar page
js/settings.js          Settings page
tests.html              In-browser test runner
```

Scripts are classic `<script defer>` tags that load in this order: `time.js`, `storage.js`, `ui.js`, then the page script. Each script adds its part to one global, `window.TimeTracker`. The exception is `theme.js`, a plain blocking `<script>` placed before the stylesheet in `<head>`, so the page never flashes the wrong theme while it loads.

## Notes

- Days, weeks and midnights use your computer's current timezone. If you change timezones, past sessions are regrouped into the new timezone's days, but their durations don't change.
- Calendar blocks are placed by wall-clock time, so they line up with the hour labels even on days when DST starts or ends. Their labels still show real elapsed time.
- Goals and schedules have no history. Editing either recalculates progress for every day, including the 7-day table.
- Text on a task color switches between white and dark by contrast, so light colors such as White stay readable on buttons and calendar blocks.
- Task colors fill the same way in both themes. In the dark theme, outlines and text drawn in a task's color use a lighter tint of it (`darkEdge` in `js/storage.js`), so dark colors such as Charcoal stay visible. The switch uses CSS `light-dark()` (Chrome 123+, Safari 17.5+, Firefox 120+), so changing themes restyles the page without a reload.
