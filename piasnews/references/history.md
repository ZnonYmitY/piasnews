# Piasnews History

Use this file when maintaining `data/history.json` or deciding whether to show "On This Day" / "去年今日" in fan-daily reports.

## Purpose

Historical context is optional fan flavor. It is not part of latest-news collection and must not expand live searches beyond the latest 3 days.

The maintained source of truth is:

- Local file: `data/history.json`
- Pages endpoint: https://znonymity.github.io/piasnews/data/history.json
- Raw fallback: https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json

## When to show history

- Match the report date's `MM-DD` against event `month_day`.
- Use the user's/local report timezone when deciding the day.
- Include only important events by default: `importance >= 4`.
- Show at most one or two events.
- Omit the section when no meaningful event exists.
- Do not fill the section with trivia, old search results, weak media claims, or unrelated race facts.

## Event schema

```json
{
  "id": "piastri-2024-07-21-first-grand-prix-win",
  "date": "2024-07-21",
  "month_day": "07-21",
  "year": 2024,
  "title": "Oscar Piastri wins his first Formula 1 Grand Prix in Hungary",
  "summary": "Short factual summary.",
  "type": "milestone",
  "importance": 5,
  "source": "Formula 1 results",
  "url": "https://www.formula1.com/en/results/2024/races/1239/hungary/race-result",
  "tags": ["Oscar Piastri", "McLaren", "Hungarian Grand Prix"]
}
```

## Maintenance rules

- Prefer official Formula 1, McLaren, Oscar Piastri, FIA, or race-result sources.
- Store metadata, short summaries, and links only.
- Use exact event dates. If the date is uncertain, do not add the event.
- Keep summaries factual and short.
- Use stable event IDs: `piastri-YYYY-MM-DD-short-slug`.
- Use `importance` from 1 to 5. Normal fan daily reports should only surface 4 or 5.
- Suggested `type` values: `race_win`, `podium`, `milestone`, `contract`, `team`, `interview`, `fan`, `other`.
