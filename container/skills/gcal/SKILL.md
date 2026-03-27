# Google Calendar

Read and manage the user's Google Calendar via the `gcal` CLI tool.

## Usage

```bash
gcal today              # Today's events
gcal list               # Next 7 days
gcal list 14            # Next 14 days
gcal get <eventId>      # Event details
gcal create '<json>'    # Create event
gcal delete <eventId>   # Delete event
```

## Creating Events

```bash
gcal create '{"summary":"Team sync","start":{"dateTime":"2026-03-27T14:00:00-07:00"},"end":{"dateTime":"2026-03-27T15:00:00-07:00"}}'
```

With location and attendees:
```bash
gcal create '{"summary":"Lunch","location":"Palo Alto","start":{"dateTime":"2026-03-27T12:00:00-07:00"},"end":{"dateTime":"2026-03-27T13:00:00-07:00"},"attendees":[{"email":"user@example.com"}]}'
```

## Notes
- Default calendar is "primary"
- Use ISO 8601 datetime with timezone offset (e.g. `-07:00` for PDT)
- The tool auto-refreshes OAuth tokens
