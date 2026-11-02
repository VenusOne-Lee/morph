# Report spec reference

Morph describes your app in three JSON files, all committed to your repo. JSON Schemas live in [`packages/spec/schema`](../packages/spec/schema) and editors pick them up from each file's `$schema`.

## `morph/model.json`

What reports may see: tables (`entities`), their fields, enums and joins. `morph scan` writes it; you edit labels, `exposed` and `pii`.

Each field has a `semantic` type (`money`, `status_enum`, `owner_ref`, `datetime`...) with the classifier's `confidence` and `reason`, so you can check every call.

## `morph/reports/<id>.json`

```json
{
  "specVersion": 0,
  "id": "deals-by-stage",
  "title": "Pipeline by stage",
  "why": "Open deals by stage, with what's stuck.",
  "source": "deals",
  "joins": ["deals.owner_id -> users.id"],
  "fields": ["deals.name", "deals.stage", "deals.value_zar", "users.name as owner", "days_in_stage"],
  "derived": { "days_in_stage": { "days_since": "deals.stage_changed_at" } },
  "filters": [{ "field": "deals.stage", "op": "not_in", "value": ["won", "lost"] }],
  "groupBy": ["deals.stage"],
  "groupByOptions": ["owner"],
  "measures": [{ "fn": "count" }, { "fn": "sum", "field": "deals.value_zar" }],
  "sort": [{ "field": "days_in_stage", "dir": "desc" }],
  "widgets": [
    { "type": "bar", "view": "report" },
    { "type": "kanban", "view": "combined", "options": { "threshold": 14 } }
  ],
  "actions": ["deals.stage", "deals.owner_id"]
}
```

| Key | Meaning |
| --- | --- |
| `source` | The entity rows come from. Must have RLS on. |
| `joins` | `from -> to`, each one hop along a foreign key in the model. |
| `fields` | `entity.field`, optionally `as alias`, or a key from `derived`. |
| `derived` | `days_since` (whole days since a timestamp), `bucket` (number into ranges), `date_trunc` (day, week, month, quarter). |
| `filters` | `=`, `!=`, `in`, `not_in`, `>`, `>=`, `<`, `<=`, `between`, `is_null`, `not_null`, `contains`, `last_n_days`, `this_month`, `this_quarter`. |
| `groupBy` | Up to two levels. Enum groups follow the enum's order. |
| `widgets` | `bar`, `column`, `funnel`, `workload`, `heatmap`, `kpi`, `table`, `kanban`, `balancer`, `queue`, `kpi-fix`. `view` is `report`, `act` or `combined`. |
| `actions` | Action ids from `actions.json` this report may use. |

Widget options: `threshold` (days before a row counts as stuck, default 14), `cap` (open rows per owner, default 5), `idleDays` (default 30), `buckets` (heatmap edges), `months` and `target` (column chart), `topN`.

`morph scan` sets `broken: { reason }` on a report whose fields no longer exist, instead of deleting it.

## `morph/actions.json`

```json
{
  "specVersion": 0,
  "undoDays": 30,
  "actions": [
    { "id": "deals.stage", "kind": "set_enum", "table": "deals", "column": "stage",
      "values": ["lead", "qualified", "proposal", "negotiation", "won", "lost"], "terminal": ["won", "lost"],
      "sideEffects": [{ "set": "stage_changed_at", "to": "now()" }], "bulkMax": 25, "enabled": true },
    { "id": "deals.owner_id", "kind": "set_fk", "table": "deals", "column": "owner_id",
      "target": { "entity": "users", "field": "id", "display": "name" }, "bulkMax": 25, "enabled": true }
  ]
}
```

v0.1 has two kinds: `set_enum` (move a status) and `set_fk` (reassign an owner). An action is only enabled when the scan found an UPDATE policy on the table. After you edit actions, run `npx morph-reports migrate` and apply the new migration: the allow-list lives in the database.
