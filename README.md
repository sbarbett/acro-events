# Acropolis (MUD) Events Calendar

A small, static web calendar to display in-game events for Acropolis. It reads a simple `events.json` file and renders a rolling calendar (today + 60 days). Designed to be hosted on GitHub Pages.

## Event data format
Events are provided in `docs/events.json` as an array of objects. Timestamps are UNIX seconds.

```json
[
  {
    "id": "68956be9-0006-0001-6895-68936be90006",
    "type": "quadruple_xp",
    "start_time": 1754622953,
    "end_time": 1754624753,
    "recurring": false,
    "recurrence_type": "none"
  },
  {
    "id": "68956b53-0005-0001-6895-68906b530005",
    "type": "triple_xp",
    "start_time": 1754622900,
    "end_time": 1754624700,
    "recurring": true,
    "recurrence_type": "weekly"
  },
  {
    "id": "68956ada-0003-0001-6895-68966ada0003",
    "type": "double_xp",
    "start_time": 1754622900,
    "end_time": 1754624700,
    "recurring": true,
    "recurrence_type": "monthly"
  }
]
```

- `type`: free-form string used for labeling and styling (e.g., `double_xp`, `triple_xp`, `quadruple_xp`).
- `start_time` / `end_time`: UNIX epoch seconds (local time is used for display).
- `recurring`: `true` or `false`.
- `recurrence_type`: one of `none`, `daily`, `weekly`, `monthly`.

Notes:
- Recurring events repeat from their original `start_time` at the same local time.
- Monthly recurrence clamps to the last day when a month is shorter (e.g., Jan 31 -> Feb 28/29).
- Events are shown on their start day in the grid.

## Run locally
You can serve the `docs/` directory with any static server. Example using Python:

```bash
python3 -m http.server 8090 --directory docs
```
Then open `http://localhost:8090/`.

## Deploy on GitHub Pages
1. Commit and push the repository.
2. In the repository settings, set Pages source to the `docs/` folder.
3. Visit the Pages URL after it builds; the calendar will load `events.json` directly from `docs/`.

## License
MIT
