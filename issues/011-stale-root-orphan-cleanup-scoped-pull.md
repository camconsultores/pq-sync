## Problem Statement

After the fix in issue 009, ungrouped queries are written to the mcode root during
any pull — including scoped pulls. This creates a new gap: when a user later assigns
a previously-ungrouped query to a group in Excel and runs a scoped pull on that
group, the grouped file is correctly created in the subfolder, but the old root-level
`.pq` file is never deleted. The user is left with two copies of the same query:
the up-to-date grouped file in `GroupName/Query.pq` and a stale `Query.pq` at the
mcode root.

The root cause is that `existingPqFiles` in both route loops collects files only
from `scopeDir` (the group subfolder), never from `outputRoot` itself. Root-level
files are therefore invisible to `deleteOrphans` during any scoped pull.

## Solution

When a scoped pull is active, run a second orphan-deletion pass over root-level
`.pq` files (direct children of `outputRoot`, not files inside any subfolder) after
the main pass over `scopeDir`. The root pass uses the root sentinel
(`outputRoot/.pq-sync`) independently of the scoped sentinel, so the safety
guarantee is preserved: root files are never deleted until a full pull (or a
previous scoped pull that wrote to root) has initialized the root sentinel.

## User Stories

1. As a pq-sync user, I want stale root-level `.pq` files to be automatically
   removed when I assign a query to a group and run a pull, so that my mcode
   folder does not accumulate orphan files.

2. As a pq-sync user, I want the root-file cleanup to respect the root `.pq-sync`
   sentinel, so that I am not at risk of losing files I created manually before
   ever running a pull.

3. As a pq-sync user, I want a scoped pull (right-click Pull from Folder) to clean
   up root orphans just as a full pull would, so I can use scoped pulls confidently
   without needing to follow up with a full pull.

4. As a pq-sync user, I want the cleanup to only remove root files that correspond
   to queries now living in a group, not files that are still ungrouped, so that
   ungrouped queries are never accidentally deleted.

5. As a pq-sync user, I want the deleted-file count in the output message to
   include root orphans, so I can see that cleanup happened.

6. As a pq-sync user, I want the behavior to be identical between the COM route
   (workbook open) and the direct route (workbook closed), so results are
   consistent regardless of whether Excel is running.

## Implementation Decisions

### New helper: `collectRootPqFiles(dir)`

Introduce a helper alongside the existing `collectPqFiles` that returns only the
direct `.pq` children of `dir` — not files nested inside subfolders. This isolates
the root-level scope without touching `collectPqFiles`.

### Two-phase orphan deletion during scoped pull

When `groupFilter` is active, run `deleteOrphans` twice after the main write loop:

- **Phase 1 (existing):** scoped dir orphan pass — `existingPqFiles` = files under
  `scopeDir`, `sentinelExistedAtStart` = scoped sentinel status. No change from
  current behavior.

- **Phase 2 (new):** root-level orphan pass — `existingPqFiles` = root-level `.pq`
  files only (direct children of `outputRoot`), `sentinelExistedAtStart` = root
  sentinel status (`outputRoot/.pq-sync`). Uses the same `writtenFiles` set, which
  already contains the paths written to root in this pull (ungrouped queries). Any
  root file not in `writtenFiles` whose query is now grouped is therefore an orphan
  and is deleted.

Phase 2 is only executed when `groupFilter` is non-empty. Full pulls (no filter)
already scan `outputRoot` in Phase 1, so no change is needed for that path.

### `deleteOrphans` interface: unchanged

`deleteOrphans` already accepts `outputRoot`, `existingPqFiles`, `writtenFiles`, and
`sentinelExistedAtStart`. Phase 2 calls it with the same interface, passing root-
level files and the root sentinel status. No signature change needed.

### Root sentinel semantics

The root sentinel (`outputRoot/.pq-sync`) is written by any full pull that
initializes `outputRoot`. A scoped pull that only writes ungrouped files to root
does not write the root sentinel (root is not `scopeDir` in a scoped pull). This
means the Phase 2 root orphan pass is a no-op until at least one full pull has
completed — which is the correct safety behavior. Users who have only ever run
scoped pulls will not have stale root files deleted until they run a full pull first.

### Apply identically to COM and direct routes

Both `extractMCodeViaCom` and `extractMCode` must receive the Phase 2 pass. The
logic is the same in both cases.

## Testing Decisions

A good test exercises observable filesystem state (files created, files deleted,
sentinel presence) through the exported `deleteOrphans` function and the
`collectRootPqFiles` helper, not through internal loop details.

**Modules to test:**

- `collectRootPqFiles`: returns only direct `.pq` children, excludes files in
  subdirectories, handles non-existent dir gracefully.

- Phase 2 orphan pass via `deleteOrphans`:
  - Root file is deleted when root sentinel exists and the file is not in
    `writtenFiles` (query moved root → group).
  - Root file is preserved when root sentinel is absent (uninitialized root).
  - Root file in a subfolder is NOT collected (Phase 2 is root-only).
  - Phase 2 does not affect scoped-dir files (Phase 1 handles those).
  - Scoped pull with no root sentinel: Phase 2 skips silently (no ENOENT, no
    deletion).

**Prior art:** `src/test/extract_mcode.test.ts` uses temp dirs with sentinel
placement to test `deleteOrphans` in isolation. The new tests follow the same
pattern.

## Out of Scope

- Cleaning up stale files in non-root, non-scoped group subfolders during a scoped
  pull on a different group. Example: query moves from `GroupA` to `GroupB`; a
  scoped pull on `GroupB` does not clean `GroupA/Query.pq`. This requires tracking
  all group subfolders, not just root. It is a separate issue.

- Changes to `deleteOrphans` signature or semantics beyond what Phase 2 requires.

- Changes to the push (`import_mcode`) path. Push is additive-only and does not
  perform orphan deletion.

- Changes to sentinel write behavior for root during scoped pulls. The root sentinel
  continues to be written only by full pulls.

## Further Notes

This PRD directly addresses the deferred "Bug 2" finding from the Codex adversarial
review of PR #21 (issue 009). The finding was: `existingPqFiles` for a scoped pull
never includes root-level files, so stale root ungrouped `.pq` files accumulate
indefinitely.

The two-phase approach keeps Phase 1 and Phase 2 independent and avoids any change
to the `deleteOrphans` interface, making it easy to test each phase in isolation.
