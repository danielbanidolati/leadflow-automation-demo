# Security

## Supported scope

This repository contains a sanitized development demonstration. It must not contain credentials, private webhook URLs, client records, internal execution evidence, or live resource identifiers.

## Reporting a problem

Use GitHub's private vulnerability reporting feature for this repository. Do not place secrets, personal data, exploit details, or live system identifiers in a public issue.

## Safe use

- Import blueprints only into a development workspace.
- Bind only test resources during review.
- Use synthetic identities under reserved domains such as `example.test`.
- Keep customer credentials in client-owned connections, never in blueprint files.
- Do not retry an uncertain CRM write until the destination and ledger have been reconciled.
