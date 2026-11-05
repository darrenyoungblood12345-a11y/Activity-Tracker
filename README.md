# Time Tracker

A small static site for tracking time on tasks. Each task has its own stopwatch that you can pause and resume, plus a goal. The goal can be set per day, on a weekly schedule, such as "Reading: 30 minutes a day", "Gym: 45 minutes on Mon, Wed and Fri" or "Guitar: 20 minutes on weekdays, 1 hour on Saturday". It can also be one total per week or per month, such as "Piano: 5 hours a week" or "Side project: 20 hours a month". There's no framework, no build step and no backend: just HTML, CSS and vanilla JavaScript, with data saved in your browser's `localStorage`.

| Page | What it does |
|---|---|
| **Activities** (`/index.html`) | One task at a time, full size: its stopwatch, goal and progress, with Start or Pause, Edit and Delete. Only one stopwatch runs at a time, and while it runs the page fills with that task's color. Choose a task from the list, or add one with **Add a task**: a goal per day (with the days it happens and each day's goal), per week or per month. Weekly and monthly tasks show this week's or this month's total. |
| **Analytics** (`/analytics/`) | Today's total, goals met, per-task progress toward the current day, week or month, and a 7-day goal table. Days a task isn't scheduled don't count against it. |
| **Calendar** (`/calendar/`) | A week view with one block per tracked session. |
| **Settings** (`/settings/`) | Choose the Light theme, the Dark theme or Match device, and see an estimate of how much browser storage the tracker uses. |

Every page has the same task list down the left side (or below the stopwatch on Activities on a phone), split into **Today** and **Not today**. Each task shows its time so far and a Start/Pause button, so you can switch tasks from any page, and its name opens it on the Activities page. On a phone the pages are listed in a bar along the bottom, and whatever is running sits just above it.

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

## How data is stored

All tracked data is stored under one `localStorage` key, `timeTracker.v1`. The key keeps its name across upgrades, and the `version` field inside it tracks the shape:

```js
{
  version: 3,
  tasks:    [{ id, name, color, goalPeriod, weekdayGoals, periodGoalMinutes, createdAt }],
  sessions: [{ id, taskId, start, end }],   // epoch ms, one per start→pause stretch
  active:   { taskId, start } | null        // the running timer, if any
}
```

- **`goalPeriod`** is `"day"`, `"week"` or `"month"`. It picks which of the two goals below the task uses.
- **`weekdayGoals`** is used when `goalPeriod` is `"day"`. It holds 7 goals in minutes, indexed like `Date#getDay()` (`[0]` is Sunday). `0` means the task isn't scheduled that day. For example, `[0, 60, 60, 60, 60, 60, 20]` means an hour on weekdays, 20 minutes on Saturday and off on Sunday.
- **`periodGoalMinutes`** is used when `goalPeriod` is `"week"` or `"month"`. It's the total in minutes to track that week or month, up to 7 × 24 hours for a week or 31 × 24 hours for a month. Weeks run Sunday to Saturday, like the Calendar, and months are calendar months. Both goals are always kept, so switching a task between periods and back doesn't lose its old goal.
- **Older data upgrades automatically.** Version 1's `dailyGoalMinutes` becomes the same goal every day. Version 1 and 2 tasks become daily tasks (`goalPeriod: "day"`) with their schedule unchanged. Imported backups are upgraded the same way.
- **Saved data is rewritten in the new shape once.** On the first load after an upgrade, older data in `timeTracker.v1` is converted and saved back, so the stored copy matches the current version. The original text is kept under `timeTracker.v1.pre-upgrade` in case anything needs to be recovered, and Settings shows it in the storage breakdown. Later loads see the data is current and leave it alone. Data saved by a newer version is never downgraded. If you have tabs open from before the upgrade, reload them.

- **Elapsed time always comes from timestamps** (`now - start`), never from counting timer ticks. Background tabs, sleep and refreshes can't make the clock drift.
- **The running timer is stored**, so it survives refreshes, moving between pages and closing the tab.
- **Sessions that cross midnight** are stored once, as-is. They're split at local midnight only when totals are calculated or blocks are drawn (`splitByDay` in `js/time.js`), so they count toward both days.
- **Multiple tabs stay in sync** through the browser's `storage` event. Each change holds a [Web Lock](https://developer.mozilla.org/docs/Web/API/Web_Locks_API) shared by every tab while it re-reads the latest saved state, applies the change and saves it, so two tabs changing data at the same moment can't overwrite each other. Web Locks need a secure address (`https://` or `localhost`); elsewhere, changes are saved without the lock.
- **Corrupt data** is replaced with an empty state instead of crashing the app. The unreadable original is kept under `timeTracker.v1.corrupt`, and a banner explains what happened.
- **If storage is full or read-only**, your saved data still loads, new changes are kept in memory, and a warning banner says so. If storage is blocked entirely, the tracker starts empty and works the same way. Every page is a separate document, so changes kept in memory last only until you reload the page or open another one. Once there are any, the browser asks before you leave, so you can Export a copy first.
- **The theme** is saved separately under `timeTracker.theme` (`"light"`, `"dark"` or `"system"`, and Light when unset). It's a preference for this browser, so Export and Import leave it alone. It syncs across open tabs like everything else.
- **The storage estimate** on the Settings page adds up the characters of every key and value saved at this address and compares the total with the roughly 5 MB that browsers allow per site. Browsers don't report localStorage usage, so it's an estimate. Keys from other apps served from the same address, such as other `localhost` projects, count against the same limit and appear on a separate line.

### Backup, restore and reset

- **Export JSON** at the bottom of every page downloads a backup of all your data.
- **Import JSON** asks for confirmation, then *replaces* all current data with the file's contents. Invalid entries in the file are dropped.
- **To start over**, run `localStorage.removeItem('timeTracker.v1')` in the browser console and reload the page.
- **To remove the pre-upgrade copy** once you're happy with the upgrade, run `localStorage.removeItem('timeTracker.v1.pre-upgrade')`.

## Project layout

```
index.html              Activities page (home)
analytics/index.html    Analytics page
calendar/index.html     Calendar page
settings/index.html     Settings page
css/styles.css          Shared styles
fonts/                  Barlow and Barlow Condensed (SIL Open Font License), served from the site itself
js/theme.js             Applies the saved theme before the first paint
js/time.js              Pure date/duration helpers (no DOM)
js/storage.js           Data model, validation, load/save, cross-tab sync
js/ui.js                Shared page chrome: DOM helper, ticker, icons, the task list, banner, export/import
js/activities.js        Activities page: the selected task, and the add and edit forms
js/analytics.js         Analytics page
js/calendar.js          Calendar page
js/settings.js          Settings page
```

Scripts are classic `<script defer>` tags that load in this order: `time.js`, `storage.js`, `ui.js`, then the page script. Each script adds its part to one global, `window.TimeTracker`. The exception is `theme.js`, a plain blocking `<script>` placed before the stylesheet in `<head>`, so the page never flashes the wrong theme while it loads.

## Notes

- Days, weeks and midnights use your computer's current timezone. If you change timezones, past sessions are regrouped into the new timezone's days, but their durations don't change.
- Calendar blocks are placed by wall-clock time, so they line up with the hour labels even on days when DST starts or ends. Their labels still show real elapsed time.
- Goals and schedules have no history. Editing either recalculates progress for every day, including the 7-day table.
- In the 7-day table, weekly and monthly tasks show the time tracked each day rather than a percentage, since their goal isn't met on any single day.
- Text on a task color switches between white and dark by contrast, so light colors such as White stay readable on buttons and calendar blocks.
- The task shown on Activities is kept in the address, as `#task-<id>` (or `#add` for the add form), so the task list's links work from every page and a reload keeps your place. Starting a task shows it.
- No fonts or other files are loaded from other sites; the fonts in `fonts/` come with the site.
- Task colors fill the same way in both themes. In the dark theme, outlines and text drawn in a task's color use a lighter tint of it (`darkEdge` in `js/storage.js`), so dark colors such as Charcoal stay visible. The switch uses CSS `light-dark()` (Chrome 123+, Safari 17.5+, Firefox 120+), so changing themes restyles the page without a reload.
