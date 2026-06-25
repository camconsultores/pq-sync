## What to fix

Two related edge cases where queries are silently dropped or deleted during a scoped pull
(right-click Pull from Folder / `--group <filter>`):

---

### Case A — Query moved out of a group is deleted instead of relocated

**Steps to reproduce:**
1. `mcode/Staging/RawData.pq` exists (sentinel present in `Staging/`).
2. In Excel Power Query Editor, move `RawData` from the `Staging` group to no group (root).
3. Run a scoped pull on `Staging/`.

**Current behaviour:**
- `RawData` now has `groupRelPath = ''`.
- `matchesGroupFilter('', 'Staging')` → `false` → query not written.
- `deleteOrphans` sees `Staging/RawData.pq` with no matching write → **deletes it**.
- `RawData.pq` at root is **never created**.
- Net result: query disappears from mcode entirely even though it still exists in the workbook.

**Root cause (`extract_mcode.ts`):**
```
// scoped pull — only writes queries whose groupRelPath matches the filter
if (!matchesGroupFilter(groupRelPath, groupFilter)) continue;
// ↑ ungrouped query (groupRelPath='') silently skipped
// orphan deletion then removes the old file at Staging/RawData.pq
```

**Expected behaviour:**
- `Staging/RawData.pq` is deleted (correct — query left that group).
- `RawData.pq` is created at mcode root (query is now ungrouped).

A full pull would already handle this correctly. The scoped pull must not drop
queries that moved *outside* the filter scope — it should write them to their new
canonical location regardless of the active group filter.

---

### Case B — New ungrouped query (unsaved) not synced via scoped pull

**Steps to reproduce:**
1. Open the workbook in Excel.
2. Create a new query in Power Query Editor, assign **no group**, do **not save**.
3. Run a scoped pull on any subfolder (e.g., right-click `Staging/` → Pull from Folder).

**Current behaviour:**
- COM route reads the new query formula ✓
- `queryToGroup` is populated from the **saved** xlsx on disk — the new query has no entry.
- `groupRelPath = ''` (ungrouped).
- `matchesGroupFilter('', 'Staging')` → `false` → query skipped.
- Query **never appears** in any mcode file.

**Also affected — full pull with unsaved group assignment:**
- User creates a new query in a group, does NOT save, then runs a full pull.
- Formula: read from COM (correct). Group metadata: read from disk (group assignment
  absent because unsaved) → query placed at mcode root instead of the group subfolder.

**Root cause:** COM route comment confirms the hybrid design:
```
// Formulas come from COM (unsaved changes);
// group assignments come from disk (saved state).
```
This is intentional for group placement but creates a gap for ungrouped queries in scoped pulls.

**Expected behaviour (scoped pull):**
- Ungrouped queries are written to mcode root during any pull, full or scoped.
- OR: scoped pull explicitly warns that ungrouped queries were skipped.

---

## Proposed fix

### Case A
In the scoped pull loop, when `!matchesGroupFilter(groupRelPath, groupFilter)` AND
`groupRelPath === ''` (ungrouped), do NOT skip — write the file to `outputRoot`.
The orphan deletion of the old scoped path then correctly removes only the
relocated file.

```typescript
// Proposed change in extract_mcode.ts (both COM and direct routes):
const isUngrouped = !groupRelPath;
const inScope = matchesGroupFilter(groupRelPath, groupFilter);

if (!inScope && !isUngrouped) continue;   // skip queries in other groups
// ungrouped queries always write to root, even during scoped pull
const outPath = isUngrouped
    ? path.resolve(outputRoot, `${cleanName(name)}.pq`)
    : resolveOutputPath(name, outputRoot, nameToPath, queryToGroup, queryGroups);
```

### Case B (scoped pull)
Same fix as Case A covers the scoped-pull scenario — ungrouped queries are no
longer excluded.

For the full-pull + unsaved group assignment case: document the known limitation
that group placement reflects the **last saved** state of the workbook; users must
save before pulling if they want correct subfolder placement of newly grouped queries.

---

## Acceptance criteria

- [ ] Query moved from a group to root: scoped pull deletes `GroupName/Query.pq` AND
      creates `Query.pq` at mcode root.
- [ ] Query moved between groups: scoped pull on old group removes the old file;
      full pull (or scoped pull on new group) creates file in new location.
- [ ] New ungrouped unsaved query: full pull writes it to mcode root.
- [ ] New ungrouped unsaved query: scoped pull also writes it to mcode root
      (not silently skipped).
- [ ] Regression: existing scoped pull behaviour for in-scope queries unchanged.
- [ ] Regression: orphan deletion still works correctly in all above cases.

## Blocked by

- 002-pull-command
- 006-folder-context-commands
