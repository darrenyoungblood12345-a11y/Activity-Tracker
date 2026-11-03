# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person tracking their own time on recurring personal activities, such as reading, practice, exercise and side projects. They open it on a laptop or phone, start a stopwatch when they begin, pause it when they stop, and glance at how close they are to the day's, week's or month's goal. (Inferred from the README and sample goals; not confirmed in an interview.)

## Product Purpose

A pausable stopwatch per task, each measured against a goal set per day on a weekly schedule, per week, or per month. Success is knowing at a glance what is running, how much is left today, and whether the week is on track.

## Positioning

Only one timer runs at a time, and every goal can follow a weekly rhythm ("Guitar: 20 minutes on weekdays, 1 hour on Saturday"). It is a personal practice log, not a team timesheet or billing tool.

## Operating Context

- Short, frequent visits: start, pause, check progress, often from another page or tab.
- Runs as a static site with no backend; several tabs can be open and stay in sync.
- Used in both light and dark settings; the user chooses Light, Dark or Match device.

## Capabilities and Constraints

- Static HTML, CSS and vanilla JavaScript; no framework and no build step. Scripts are classic deferred tags sharing one `window.TimeTracker` global.
- All data lives in the browser's `localStorage`; Export and Import JSON are the only backup.
- Pages: Activities (home), Analytics, Calendar (week view of sessions), Settings (theme and storage estimate).
- Task colors come from a fixed 10-color palette; text on a task color switches between white and dark by contrast.
- Paths are relative so the site works from a sub-path.
- Not yet possible: editing or adding tracked time by hand, keyboard shortcuts.

## Brand Commitments

- Name: "Time Tracker".
- Copy is plain and honest ("It just won't count toward a goal today.").
- No hosted fonts or third-party requests: the data stays in the browser, and the page should too.

## Evidence on Hand

No real user data, testimonials or brand assets exist. Screens are reviewed with synthetic sample tasks seeded into `localStorage`.

## Product Principles

1. The running timer is the most important thing on any screen.
2. Setting up a task should never crowd out using one.
3. Time always comes from timestamps, so the display can be trusted.
4. Nothing leaves the browser.

## Accessibility & Inclusion

WCAG AA contrast for text and controls, full keyboard operation, screen-reader labels and live announcements, reduced-motion and forced-colors support. These are already built in and must be kept.
