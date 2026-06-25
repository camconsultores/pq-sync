# pq-sync — Manual Test Fixtures

Local test assets for the pq-sync VS Code extension.  
Run the extension in debug mode with **F5** before executing any test case.

---

## Setup

### 1. Generate sample workbooks

Run once to create the `.xlsx` files (requires Excel installed):

```powershell
cd test-fixtures
.\create-workbook.ps1
```

### 2. Open a workspace

Point VS Code at this folder (`test-fixtures/`) as the workspace root,  
or use the root of the repo and configure paths manually via **pq-sync: Configure**.

### 3. Configure the extension

Run **pq-sync: Configure** from the Command Palette and set:

| Setting | Value |
|---|---|
| `pqSync.workbookPath` | `test-fixtures/workbooks/simple.xlsx` |
| `pqSync.mcodePath` | `test-fixtures/mcode/` |

---

## Test Cases

### TC-01 — Pull: Direct Route (workbook closed)

**Precondition:** `simple.xlsx` closed in Excel, `mcode/` folder empty or absent.

1. Run **pq-sync: Pull** from Command Palette.
2. Verify `mcode/` created with:
   - `SalesData.pq`
   - `Products.pq`
   - `Summary.pq`
   - `.pq-sync` sentinel file
3. Compare content with `mcode-expected/simple/`.

**Pass:** all three `.pq` files match expected, sentinel present.  
**Fail:** error message, missing files, or wrong M code.

---

### TC-02 — Pull: COM Route (workbook open)

**Precondition:** `simple.xlsx` open and **unsaved** with an edit to any query formula.

1. Run **pq-sync: Pull**.
2. Verify the unsaved formula change is reflected in the output `.pq` file.

**Pass:** unsaved formula appears in `.pq`.  
**Fail:** pull reads stale on-disk version instead.

---

### TC-03 — Push: Direct Route (workbook closed)

**Precondition:** `simple.xlsx` closed. Edit `mcode/SalesData.pq` to change any formula.

1. Run **pq-sync: Push**.
2. Open `simple.xlsx` in Excel → Power Query Editor.
3. Verify `SalesData` reflects the edited formula.

**Pass:** Excel shows updated formula.  
**Fail:** workbook unchanged or error.

---

### TC-04 — Pull with Groups (subfolders)

**Precondition:** configure workbook to `workbooks/with-groups.xlsx`, mcode to fresh `mcode-groups/`.

1. Run **pq-sync: Pull**.
2. Verify folder structure:
   ```
   mcode-groups/
   ├── .pq-sync
   ├── Staging/
   │   ├── .pq-sync
   │   └── RawData.pq
   └── Transforms/
       ├── .pq-sync
       └── CleanData.pq
   ```
3. Compare with `mcode-expected/with-groups/`.

**Pass:** subfolder hierarchy matches groups in workbook.  
**Fail:** all files flat in root, or wrong group assignment.

---

### TC-05 — Orphan Deletion

**Precondition:** TC-01 done (sentinel exists). Manually add a stale file:

```
mcode/OrphanQuery.pq
```

1. Run **pq-sync: Pull** again.
2. Verify `OrphanQuery.pq` deleted.

**Pass:** orphan removed, real queries intact.  
**Fail:** orphan survives, or real queries deleted.

---

### TC-06 — Ignore List

**Precondition:** `mcode/` from TC-01 exists. Create `mcode/.pqignore`:

```
Summary
```

1. Run **pq-sync: Pull**.
2. Verify `Summary.pq` is NOT overwritten (or not created if absent).
3. Run **pq-sync: Push** with a change to `Summary.pq`.
4. Verify Excel's `Summary` query is NOT updated.

**Pass:** ignored query left untouched in both directions.  
**Fail:** `.pqignore` has no effect.

---

### TC-07 — Configure: Auto-Detect

**Precondition:** empty workspace with `simple.xlsx` at root and a folder named `mcode/`.

1. Run **pq-sync: Configure**.
2. Verify it proposes the detected paths without manual input.

**Pass:** auto-detect fills both paths correctly.  
**Fail:** prompts for manual paths or detects wrong file.

---

### TC-08 — Scoped Pull (subfolder right-click)

**Precondition:** `with-groups.xlsx` configured, `mcode-groups/` populated from TC-04.

1. In Explorer, right-click `mcode-groups/Staging/`.
2. Run **pq-sync: Pull from Folder**.
3. Verify only `Staging/*.pq` updated; `Transforms/` untouched.

**Pass:** scoped to `Staging` group only.  
**Fail:** full pull runs, or error thrown.

---

### TC-09 — Status Bar States

During any pull or push:

- Status bar shows `⟳ syncing` while running.
- Shows `✓ pq-sync` on success.
- Shows `✗ pq-sync` on failure (try with invalid workbook path).

---

## Reporting a Bug

Create a file in `bugs/` named `BUG-<short-description>.md` using this template:

```markdown
## Bug: <title>

**Date:** YYYY-MM-DD  
**Extension version:** (check Extensions panel)  
**OS:** Windows 11  
**Excel version:** (e.g. Microsoft 365, v2406)  
**Workbook:** simple.xlsx / with-groups.xlsx / other  
**Route:** Direct (closed) / COM (open) / unknown  

### Steps to reproduce

1. 
2. 
3. 

### Expected

<!-- What should have happened -->

### Actual

<!-- What happened instead — paste the Output panel content -->

```
[pq-sync] ...
```

### Severity

- [ ] Blocker — data loss or crash  
- [ ] High — feature broken  
- [ ] Medium — wrong output, workaround exists  
- [ ] Low — cosmetic / UX  

### Notes

<!-- Screenshots, .pq file diffs, anything else -->
```

---

## Suggesting an Improvement

Create a file in `bugs/` named `IMPROVE-<short-description>.md`:

```markdown
## Improvement: <title>

**Date:** YYYY-MM-DD  

### Current behavior

### Desired behavior

### Why it matters

### Acceptance criteria

- [ ] 
- [ ] 
```
