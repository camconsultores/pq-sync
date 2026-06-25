## Parent

[008-ungroup-move-and-unsaved-ungrouped-query.md](008-ungroup-move-and-unsaved-ungrouped-query.md)

## What to build

Address the known limitation of the COM hybrid route: when a user creates a new
query inside a group in Excel and runs a pull **without saving first**, the formula
is read from COM (correct) but the group assignment is read from the saved disk
state (absent) — so the query is placed at mcode root instead of the intended
group subfolder.

Two paths forward (decision required):

**Option A — Document only (AFK)**
Add a note to the Output channel message when ungrouped queries are written during
a pull that used COM route and at least one query had no group metadata on disk.
Example: `⚠ 1 query written to mcode root (group metadata not saved — save the
workbook before pulling to honour group placement)`.
This requires no product/UX decision beyond accepting that CLI-level output warnings
are consistent with existing project conventions.

**Option B — Toast/UX warning (HITL)**
Surface the same warning as a VS Code `showWarningMessage` toast, ensuring it is
visible even if the Output channel is not open. Requires a decision on when to
show vs. suppress repeated warnings.

## Acceptance criteria

- [ ] Pulling with unsaved group assignment: user receives visible feedback that
      group placement may not match Power Query Editor's current state.
- [ ] Warning appears only when the COM route is active AND at least one query was
      placed at root due to absent disk metadata (not on every pull).
- [ ] No warning shown if all queries have group metadata on disk (normal full-save
      workflow).
- [ ] Existing pull output and status-bar behaviour unchanged.

## Blocked by

Sequenced after [009-fix-ungrouped-query-scoped-pull.md](009-fix-ungrouped-query-scoped-pull.md)
(not a hard dependency, but 009 should land first to avoid noise in this issue's
scope).

Decision owner: product/spec. If existing convention treats CLI `console.log`
warnings as sufficient, this becomes AFK and Option A can be implemented without
further approval.
