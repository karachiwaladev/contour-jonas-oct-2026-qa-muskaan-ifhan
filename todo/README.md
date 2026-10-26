# Todo

A simple todo app that runs entirely in the browser and stores tasks in **IndexedDB**.
Ticket #3.

## Features
- Add a task (Enter or **Add**); blank tasks are rejected
- Tick a task to mark it done, untick to undo
- Double-click a task's text to edit it (Enter saves, Esc cancels)
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
`tasks` store, `keyPath: id` (auto-increment), index on `createdAt`:

```js
{ id, title, done, createdAt, updatedAt }
```

To add fields or indexes (due dates, tags, recurrence), bump `DB_VERSION` in `db.js`
and add an `oldVersion < N` step in `upgrade()`.
