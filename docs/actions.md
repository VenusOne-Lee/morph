# Actions and undo

Every change in Morph follows the same four steps, in the component and over MCP.

1. **Preview.** `morph_preview_action` runs the UPDATE as the viewer inside a transaction and rolls it back. You see each row's before and after, the side effects, how the report will look afterwards, and the checks: your policy allowed it, the bulk limit, that no one changed the rows, and where the audit entry goes. Nothing is written.
2. **Apply.** `morph_apply_action` checks every row's version against the preview, makes the change in one transaction and writes one `morph_audit` row. If any row changed, nothing is applied and you get a fresh preview.
3. **See it land.** The report refreshes, the changed rows flash, and a toast offers Undo.
4. **Undo.** `morph_undo` puts every field back for up to 30 days. If someone changed a row since, it stops and says who. "Undo the rest" restores the rows that are untouched and leaves the others.

## In the component

Row buttons (Move, Reassign), the bulk bar, the kanban, the owner balancer, the stuck queue and the KPI fix all open the same preview. Drag and drop always has a click alternative: click a card, then "Move here".

Listen for results with `onAction`:

```tsx
<MorphProvider onAction={(e) => console.log(e.type, e.action, e.rows.length)} ...>
```

Show the history with `<MorphAuditLog />`. RLS on `morph_audit` decides which entries each viewer sees: in v0.1, only their own. A setting for team leads to see everyone's is on the list for v0.2.

## Limits

- 25 rows per action by default (`bulkMax`, hard cap 200)
- Undo window: `undoDays` in `actions.json` (default 30)
- Preview ids over MCP expire after 10 minutes and work once
