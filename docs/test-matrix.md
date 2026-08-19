# Synthetic test matrix

These are expected behaviors for a configured development import. They are not claims that every case has passed in a production environment.

| Case | Input shape | Expected outcome | CRM write |
| --- | --- | --- | --- |
| Valid lead | Required fields valid | `APPROVED` | One new row |
| Review lead | Provided phone normalizes outside 7 to 15 digits | `NEEDS_REVIEW` | One new row |
| Missing name | Name blank | `MISSING_DATA` | None |
| Invalid email | Malformed email | `INVALID_INPUT` | None |
| Exact replay | Same request ID and normalized payload | Prior result, `replayed: true` | None |
| Request conflict | Same request ID, changed normalized payload | `INVALID_INPUT` with conflict reason | None |
| Duplicate identity | New request ID, existing normalized email | `DUPLICATE` | None |
| Unfinished prior request | Matching incomplete ledger claim | `RECOVERY_REQUIRED` | None |
| Formula-like text | Text begins with formula characters | Normal classification, stored literally | At most one RAW row |
| Uncertain destination | Create may have succeeded but response is not confirmed | `RECOVERY_REQUIRED` | No automatic retry |
