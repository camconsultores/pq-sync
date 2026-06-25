## GitHub

https://github.com/camconsultores/pq-sync/issues/24

## Parent

[011-stale-root-orphan-cleanup-scoped-pull.md](011-stale-root-orphan-cleanup-scoped-pull.md)

## What to build

When a query moves from GroupA to GroupB and the user runs a scoped pull on GroupB,
the extension correctly creates `GroupB/Query.pq` but leaves `GroupA/Query.pq` stale.
Phase 1 (scoped to GroupB) and Phase 2 (root-only, issue 012 / #23) do not touch GroupA.

Add a Phase 3 orphan pass that, during a scoped pull, walks sibling group
subdirectories (not the active `scopeDir`, not root) and deletes `.pq` files for
queries that now belong elsewhere — gated by each sibling subfolder's own sentinel.

Phase 3 must only consider direct group subfolders already initialised by pq-sync
(sentinel present). Must not recurse into unrelated directories or delete files in
uninitialised folders.

## Acceptance criteria

- [ ] Scoped pull on GroupB, query moved GroupA→GroupB: `GroupA/Query.pq` deleted;
      `GroupB/Query.pq` created; GroupA sentinel must have existed at pull start.
- [ ] GroupA subfolder has no sentinel: no deletions in GroupA; no error.
- [ ] Query still in GroupA (not moved): `GroupA/Query.pq` preserved.
- [ ] Query matches `.pqignore`: `GroupA/Query.pq` preserved.
- [ ] Full pull (no group filter): Phase 3 not executed.
- [ ] Output delete count includes Phase 3 deletions.
- [ ] Phase 3 applied identically in COM and direct routes.
- [ ] All existing tests pass.

## Blocked by

[012-root-orphan-phase2-scoped-pull.md](012-root-orphan-phase2-scoped-pull.md) (#23)
