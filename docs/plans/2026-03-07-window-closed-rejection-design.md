# Design: Reject Applications When Lottery Window Not Open

## Summary

Model an explicit open/close lifecycle for the application window. Volunteers trigger both transitions. Applications submitted when the window is not open are rejected with reason `window_closed`.

## Lottery Aggregate State Machine

```
initial → open → closed → drawn
```

| From | Command | Event | To |
|------|---------|-------|-----|
| `initial` | `OpenApplicationWindow` | `ApplicationWindowOpened` | `open` |
| `open` | `CloseApplicationWindow` | `ApplicationWindowClosed` | `closed` |
| `closed` | `DrawLottery` | `LotteryDrawn` | `drawn` |

## Projection: Lottery Window Status

New projection tracking `{ monthCycle, status }` per lottery stream. Queryable by `checkEligibility`.

## Eligibility Check Changes

`checkEligibility` gains a new check **before** duplicate/cooldown:

1. Query lottery window projection for the application's month cycle
2. If status is not `open` → return `{ status: 'window_closed' }`

## Application Decider Changes

Add `window_closed` to rejection reasons. When eligibility returns `window_closed`, emit `ApplicationSubmitted` + `ApplicationRejected(reason: window_closed)` — same pattern as cooldown/duplicate.

## Tests

- Unit: lottery decider transitions (`initial→open`, `open→closed`, illegal transitions)
- Unit: `checkEligibility` returns `window_closed` when window not open
- Integration: full flow — submit before open, submit while open, submit after close
