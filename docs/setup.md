# Development setup

This guide is for a synthetic development workspace. It is not a production deployment runbook.

## Prerequisites

- A Make.com workspace where you can import blueprint JSON files.
- A dedicated development Data Store.
- A Google account that can authorize a test spreadsheet.
- A spreadsheet with one tab named `LEADS` and the columns in `examples/crm-lite-template.csv`.

Do not paste passwords, API keys, OAuth tokens, recovery codes, or private webhook URLs into the blueprints or this repository.

## 1. Import the adapter

Import `blueprints/crm-adapter-google-sheets-v2.blueprint.json` into a blank scenario.

Configure the fixed values:

- `CLIENT_KEY`: a stable lowercase test identifier such as `portfolio-demo`.
- `ENVIRONMENT`: keep this as `DEV` during review.
- `CLIENT_SPREADSHEET_ID`: select or enter the test spreadsheet.

Authorize a Google Sheets connection owned by the person or organization controlling the spreadsheet. Bind the same connection to all three Google Sheets modules.

## 2. Create the request ledger

Create a dedicated Make Data Store with these fields:

| Field | Type | Required |
| --- | --- | --- |
| `status` | Text | Yes |
| `payload_sha256` | Text | Yes |
| `outcome` | Text | No |
| `reason` | Text, multiline | No |
| `mode` | Text | Yes |
| `input_row_number` | Number | No |
| `crm_row_number` | Number | No |
| `claimed_at` | Date | Yes |
| `completed_at` | Date | No |
| `schema_version` | Number | Yes |

Do not add raw identity or message fields to the ledger.

## 3. Import the Core

Import `blueprints/lead-intake-core-v2.blueprint.json` into another blank scenario.

Configure the same fixed `CLIENT_KEY` and `ENVIRONMENT` values used by the adapter. Bind every Data Store module to the dedicated development ledger. Bind the Core's subscenario call to the imported adapter.

## 4. Use confidential development settings

- Enable confidential-data handling.
- Disable storage of incomplete executions where available.
- Keep sequential processing enabled for this demonstration.
- Do not add automatic retry or resume directives around destination writes.

## 5. Run synthetic tests

Start with the requests in `examples/sample-leads.json`. Compare the returned outcomes with `examples/expected-outcomes.json`.

At minimum, verify:

1. A valid unique lead creates one row.
2. Missing name or email creates no row.
3. A malformed email creates no row.
4. An exact replay creates nothing new.
5. A changed payload under the same request ID returns a conflict.
6. A second request with the same normalized email returns a duplicate result.
7. Formula-like text is stored literally and the workbook formula count remains zero.
8. An uncertain destination result is held for recovery, not automatically retried.

## Production boundary

Do not activate this demonstration against real customer data based only on import success or the local validator. A real deployment requires access review, client-specific mapping, synthetic acceptance evidence, recovery testing, privacy and retention decisions, and written activation approval.
