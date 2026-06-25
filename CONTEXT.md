# pq-sync Domain Glossary

## Query
A named Power Query M formula stored inside an Excel workbook. Query names are **globally unique** across the workbook — two queries cannot share the same name regardless of which group they belong to.

## Group
A named container for Queries in Power Query. Groups can be nested (a Group can have a parent Group). A query belongs to at most one Group. Groups map 1-to-1 to subfolders in the MCode Folder — nested groups become nested subfolders.

## Workbook
The single `.xlsx` Excel file configured per workspace. Contains all Queries via the DataMashup payload.

## MCode Folder
The local directory that mirrors the workbook's Query structure as `.pq` files. Subfolders mirror Group hierarchy. Configured via `pqSync.mcodePath`.

## Pull
The operation that reads Queries from the Workbook and writes them as `.pq` files into the MCode Folder. Preserves Group structure as subfolders. Can operate on the full MCode Folder or a single Subfolder (scoped to that Group path).

## Push
The operation that reads `.pq` files from the MCode Folder and writes them into the Workbook. Additive/update only — never deletes Queries from the Workbook. Can operate on the full MCode Folder or a single Subfolder.

## Sentinel File
A `.pq-sync` marker file written at the root of the MCode Folder (or a Subfolder) after the first Pull. Its presence signals that orphan deletion is safe on subsequent Pulls. Each Subfolder has its own Sentinel File independent of the root.

## Orphan
A `.pq` file in the MCode Folder that has no corresponding Query in the Workbook (or in the targeted Group during a scoped Pull). Orphans are deleted on Pull only when a Sentinel File exists in that scope.

## Ignore List
A `.pqignore` file placed in the MCode Folder. Contains filename patterns (one per line, no `.pq` extension, supports `*` wildcards) that match Query names to exclude. Applies to both Push and Pull. Ignored files are never written, updated, or deleted during sync — they are left as-is locally and skipped in Excel.

## COM Route
The Pull/Push path taken when the Workbook is open in Excel. Uses PowerShell COM automation to read/write Queries directly, capturing unsaved formula changes. Group metadata is read from the saved `.xlsx` file on disk as a hybrid (groups rarely change without saving).

## Direct Route
The Pull/Push path taken when the Workbook is closed. Reads/writes the `.xlsx` file as a ZIP archive, parsing the DataMashup payload directly.
