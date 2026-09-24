# Time Tracker

A small static site for tracking time on daily tasks. Each task has its own stopwatch that you can pause and resume, plus a daily goal such as "Reading: 30 minutes a day". There's no framework, no build step and no backend: just HTML, CSS and vanilla JavaScript, with data saved in your browser's `localStorage`.

| Page | What it does |
|---|---|
| **Timers** (`/index.html`) | Create tasks and start or pause each stopwatch. Only one runs at a time. |
| **Analytics** (`/analytics/`) | Today's total, goals met, per-task progress and a 7-day goal table. |
| **Calendar** (`/calendar/`) | A Google Calendar–style week view with one block per tracked session. |

## Run it locally

Serve the folder with any static file server, then open the printed URL:

```bash
npx serve .
```

```bash
python3 -m http.server 8000
```

Use a server instead of opening the files with `file://`. Some browsers give every `file://` page its own separate storage, so the three pages wouldn't see each other's data.

To deploy, upload the folder as-is to GitHub Pages, Netlify or any static host. All paths are relative, so it also works from a sub-path such as `username.github.io/time-tracker/`.

## Tests

Open **`/tests.html`** on the same server. It runs assertions against `js/time.js`, covering midnight splitting, today's total with a running timer, duration formatting, overlap layout and DST-safe day math. It also tests the pure reducers in `js/storage.js`. Results appear on the page, and the tab title shows the pass count. The tests never write your saved data.

## How data is stored

Everything is stored under one versioned `localStorage` key, `timeTracker.v1`:

```js
{
  version: 1,
  tasks:    [{ id, name, color, dailyGoalMinutes, createdAt }],
  sessions: [{ id, taskId, start, end }],   // epoch ms, one per start→pause stretch
  active:   { taskId, start } | null        // the running timer, if any
}
```

- **Elapsed time always comes from timestamps** (`now - start`), never from counting timer ticks. Background tabs, sleep and refreshes can't make the clock drift.
- **The running timer is stored**, so it survives refreshes, moving between pages and closing the tab.
- **Sessions that cross midnight** are stored once, as-is. They're split at local midnight only when totals are calculated or blocks are drawn (`splitByDay` in `js/time.js`), so they count toward both days.
- **Multiple tabs stay in sync** through the browser's `storage` event. Each change re-reads the latest saved state before writing, so one tab can't overwrite another tab's changes.
- **Corrupt data** is replaced with an empty state instead of crashing the app. The unreadable original is kept under `timeTracker.v1.corrupt`, and a banner explains what happened.
- **If storage is blocked or full**, the app keeps working in memory and shows a warning banner. Use Export to save a copy of your data.

### Backup, restore and reset

- **Export JSON** in the footer downloads a backup of all your data.
- **Import JSON** asks for confirmation, then *replaces* all current data with the file's contents. Invalid entries in the file are dropped.
- **To start over**, run `localStorage.removeItem('timeTracker.v1')` in the browser console and reload the page.

## Project layout

```
index.html              Timers page (home)
analytics/index.html    Analytics page
calendar/index.html     Calendar page
css/styles.css          Shared styles
js/time.js              Pure date/duration helpers (no DOM)
js/storage.js           Data model, validation, load/save, cross-tab sync
js/ui.js                Shared page chrome: DOM helper, ticker, banner, export/import
js/timers.js            Timers page
js/analytics.js         Analytics page
js/calendar.js          Calendar page
tests.html              In-browser test runner
```

Scripts are classic `<script defer>` tags that load in this order: `time.js`, `storage.js`, `ui.js`, then the page script. Each script adds its part to one global, `window.TimeTracker`.

## Notes

- Days, weeks and midnights use your computer's current timezone. If you change timezones, past sessions are regrouped into the new timezone's days, but their durations don't change.
- Calendar blocks are placed by wall-clock time, so they line up with the hour labels even on days when DST starts or ends. Their labels still show real elapsed time.
- Goals have no history. Editing a goal recalculates progress for every day, including the 7-day table.
