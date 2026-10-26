# Todo

A simple todo app that runs entirely in the browser and stores tasks in **IndexedDB**.
Tickets #3, #4 and #5.

## Features
- Add a task (Enter or **Add**); blank tasks are rejected
- Optional **due date**; tasks sort by due date (undated last); overdue tasks are red
- Optional **tags** (`work, urgent`): trimmed, lowercased, de-duplicated, shown as chips
- **Filters:** All / Active / Completed, a tag dropdown, or click any tag chip; *Clear filters* resets
- **Recurring tasks:** repeat daily, weekly, monthly or every N days (default due date: today).
  Ticking one keeps it as done and creates the next occurrence; monthly keeps its day,
  clamped to short months (Jan 31 → Feb 28 → Mar 31). Unticking never deletes the copy,
  and re-ticking never duplicates it.
- Tick a task to mark it done, untick to undo
- Double-click a task's text to edit its title, due date and tags (Enter saves, Esc cancels)
- **×** deletes a task after confirmation
- **Clear completed** removes all done tasks after confirmation
- "N tasks left" counter
- Tasks persist across reloads

## Run
No build step: open `todo/index.html` in a browser. To serve it over HTTP instead:

```bash
"C:/Program Files/nodejs/npx" -y http-server todo -p 8080 -c-1
```

## Structure
| File | Role |
|------|------|
| `index.html` | Markup |
| `styles.css` | Layout; light/dark follows the OS setting |
| `db.js` | IndexedDB wrapper: DB `factory-todo`, store `tasks` |
| `app.js` | Rendering and event handling |
| `docs/screenshots/` | Browser verification screenshots per ticket |

## Data model
`tasks` store, `keyPath: id` (auto-increment), indexes on `createdAt`, `dueDate` and
`tags` (multiEntry):

```js
{ id, title, done, dueDate /* 'YYYY-MM-DD' or null */, tags /* string[] */,
  repeat /* null or { unit: 'day'|'week'|'month', every, day? } */,
  nextId /* id of the occurrence created when this one was completed */,
  createdAt, updatedAt }
```

`repeat` and `nextId` need no index, so #5 didn't bump the version.

| Version | Ticket | Change |
|---------|--------|--------|
| 1 | #3 | `tasks` store |
| 2 | #4 | `dueDate` + `tags` indexes; existing tasks migrated (`dueDate: null`, `tags: []`) |

To add fields or indexes (due dates, tags, recurrence), bump `DB_VERSION` in `db.js`
and add an `oldVersion < N` step in `upgrade()`.
