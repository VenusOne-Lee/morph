# Security policy

Morph runs every read and every change as the signed-in user, through your Supabase row level security (RLS) policies. A way around that is the most serious bug Morph can have.

## Report a vulnerability

Please report privately through [GitHub security advisories](https://github.com/VenusOne-Lee/morph/security/advisories/new). Don't open a public issue.

Include what you did, what you could read or change that RLS should have blocked, and the output of `npx morph-reports doctor` if you can.

## What we commit to

- Any RLS bypass is a P0 bug. We aim to ship a fix within 72 hours of confirming it.
- We reply to every report within two working days.
- We credit reporters in the release notes unless you'd rather we didn't.

## The rules Morph holds itself to

- Never uses a service-role or secret key. The CLI, the components and the MCP server refuse to start with one.
- Report views are `security_invoker`, so they run with the viewer's rights. They are granted to `authenticated` only.
- Actions run in `SECURITY INVOKER` functions with an empty `search_path`. Table and column names come from an allow-list baked into the migration, never from the request.
- Every applied action writes one row to `morph_audit`. Clients can't write audit rows directly.
- Tables with RLS off are blocked from reports. Columns that look like personal data are off until you turn them on.

See [docs/security.md](docs/security.md) for the full threat model.
