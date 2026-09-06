# Security Policy

## Supported code

Security fixes are made against the current `main` release line. Historical
branches and old deployment snapshots are not supported release lines.

## Report a vulnerability

GitHub private vulnerability reporting is not currently enabled for this
repository. Do not put exploit details, credentials, customer data, provider
tokens, or details about a live customer deployment in a public issue.

Until a private reporting channel is enabled, use this safe fallback:

1. Open a GitHub issue containing only the title `Security contact requested`.
2. Mention `@itzSlomz` and ask the maintainer to establish a private channel.
3. Share technical details only after that private channel has been confirmed.

If a credential may already be exposed, revoke or rotate it before beginning
the report. Do not test against a customer instance, the Watchtower production
service, its database, or its media bucket.

Once a private channel is available, include the affected commit or version,
impact, minimal reproduction steps, and any suggested mitigation. Redact all
secrets and personal or customer data from screenshots and logs.

## Disclosure

Please allow the maintainer time to investigate and coordinate a fix before
publishing technical details. No response or remediation deadline is promised
until the report has been received and its scope confirmed.
