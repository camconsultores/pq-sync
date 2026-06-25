## Parent

[008-ungroup-move-and-unsaved-ungrouped-query.md](008-ungroup-move-and-unsaved-ungrouped-query.md)

## What to build

Fix `extract_mcode.ts` (both COM and direct routes) so that ungrouped queries
(`groupRelPath === ''`) are always written to `outputRoot` root during a scoped
pull, instead of being silently skipped.

The fix lives at the call site — not inside `matchesGroupFilter`.
`matchesGroupFilter('', 'Shared') === false` stays correct and unchanged.

Call-site pattern (apply identically in both route loops):

```typescript
const isUngrouped = !groupRelPath;
const inScope    = matchesGroupFilter(groupRelPath, groupFilter);

if (!inScope && !isUngrouped) continue;   // skip queries in other groups only

// IMPORTANT: do NOT call resolveOutputPath() for ungrouped queries during a
// scoped pull. resolveOutputPath() preserves nameToPath, which for a scoped
// pull only contains files under the filtered subfolder (e.g. Staging/RawData.pq).
// Calling it would wrongly rewrite to the old scoped path instead of root.
const outPath = isUngrouped
    ? path.resolve(outputRoot, `${cleanName(name)}.pq`)
    : resolveOutputPath(name, outputRoot, nameToPath, queryToGroup, queryGroups);
```

## Acceptance criteria

- [ ] **group→root, scoped pull, sentinel exists:** `Staging/Query.pq` deleted;
      `Query.pq` written to mcode root. Orphan deletion still scoped to the filtered
      subfolder (`Staging/`) only — root files are unaffected by orphan scan.

- [ ] **new ungrouped unsaved query, COM route, scoped pull:** query written to
      mcode root even though the scoped folder filter is active.

- [ ] **in-scope query, scoped pull:** existing behaviour unchanged — query in the
      filtered group is written to its group subfolder as before.

- [ ] **group A→group B, scoped pull on old group:** `GroupA/Query.pq` deleted (orphan
      in old scope). `GroupB/Query.pq` is NOT created — query is in a different group,
      not ungrouped; the new file is created only by a full pull or a scoped pull on
      `GroupB`.

- [ ] **orphan deletion scope:** orphan scan for a scoped pull still only considers
      files inside the filtered subfolder; root-level files are never touched by a
      scoped-pull orphan deletion.

- [ ] All existing `group_filter.test.ts` assertions pass unchanged.

- [ ] New unit tests cover the five scenarios above in `src/test/`.

## Blocked by

None — can start immediately.
