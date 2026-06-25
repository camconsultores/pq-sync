## GitHub

https://github.com/camconsultores/pq-sync/issues/23

## Parent

[011-stale-root-orphan-cleanup-scoped-pull.md](011-stale-root-orphan-cleanup-scoped-pull.md)

## What to build

Add a second orphan-deletion pass (Phase 2) that runs after the existing scoped-dir
pass (Phase 1) whenever a group filter is active. Phase 2 collects root-level `.pq`
files — direct children of `outputRoot` only — and deletes any that were not written
in the current pull, subject to the root sentinel safety gate.

Introduce and export `collectRootPqFiles(dir)` to isolate the root-only collection
logic. The rest of the change is wiring Phase 2 into both the COM and direct route
loops using the shared `writtenFiles` set and a separately captured
`rootSentinelExisted` flag.

**Key decisions (confirmed):**

- `rootSentinelExisted = fs.existsSync(path.join(outputRoot, SENTINEL_FILE))` is
  captured at the start of each route function, independently of `sentinelExisted`
  (scoped).
- Phase 2 passes `rootSentinelExisted` to `deleteOrphans`. If the root sentinel
  is absent, `deleteOrphans` returns `{ deletedCount: 0, skipped: true }` — no
  root deletions occur. This matches the existing delete safety contract.
- Phase 2 uses the same `writtenFiles` set as Phase 1. Root-ungrouped writes
  already land in `writtenFiles`, so live root queries are never touched.
- Before Phase 2, root-level ignored files (`.pqignore` matches) must be added to
  `writtenFiles` — otherwise they would be treated as deletable orphans. The `ignore`
  function is already in scope; iterate over `collectRootPqFiles(outputRoot)` and
  add any ignored file to `writtenFiles`.
- Total delete count = `phase1.deletedCount + phase2.deletedCount`. Output format
  unchanged; the existing single-line count message reports the combined value.
- Apply identically to COM (`extractMCodeViaCom`) and direct (`extractMCode`) routes.

## Acceptance criteria

- [ ] `collectRootPqFiles(dir)` exported from `extract_mcode`; returns resolved
      absolute paths of direct `.pq` children of `dir`; returns `[]` when `dir`
      does not exist.

- [ ] Scoped pull, root sentinel exists, query moved root → group: root `.pq` file
      deleted; grouped file in subfolder untouched by Phase 2.

- [ ] Scoped pull, root sentinel absent: zero root deletions; no error thrown.

- [ ] Scoped pull, root `.pq` file in `writtenFiles` (query is still ungrouped):
      file preserved — not treated as orphan.

- [ ] Scoped pull, root `.pq` file matches `.pqignore`: file preserved regardless
      of sentinel or `writtenFiles` state.

- [ ] Full pull (no group filter): Phase 2 not executed; behavior identical to
      current.

- [ ] Output delete count is sum of Phase 1 and Phase 2 deletions; format unchanged.

- [ ] Phase 2 applied identically in COM and direct routes.

- [ ] All existing tests pass.

## Blocked by

[009-fix-ungrouped-query-scoped-pull.md](009-fix-ungrouped-query-scoped-pull.md)
(PR #21 must be merged before this can land — Phase 2 only makes sense once
ungrouped queries can reach the root via a scoped pull).
