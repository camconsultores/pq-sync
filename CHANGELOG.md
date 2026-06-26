# Changelog

## [0.3.0] - 2026-06-25

### Fixed
- Rename detection: renaming a query in the Power Query Editor now keeps the `.pq` file in its group subfolder instead of moving it to the MCode root. Detection uses a three-step fallback — group metadata lookup, same-name file lookup, content match — so it survives stale mashup binaries
- `stripMetadata` now strips trailing `[Query="Name"]` annotations appended without a preceding semicolon, which is the standard format in current Excel versions. Previously these annotations differed between old and new query names, causing false content mismatches on rename
- Disk `.pq` files are now read through `stripMetadata` before comparison so old files written with embedded annotations compare correctly against freshly extracted formulas

### Known Limitation
- Rename detection does not work while the **Power Query Editor UI is open** in Excel. The PQ Editor holds the mashup binary in memory and prevents the group metadata from being flushed to the `.xlsx` during pull. Workaround: close the PQ Editor, then pull

## [0.2.0] - 2026-06-25

### Added
- `.pqignore` file support: place filename patterns (with `*` wildcard) in the MCode Folder root to exclude queries from push and pull. Ignored files are never written, overwritten, or deleted as orphans
- Subdirectory push: right-click any Group subfolder → Push from Folder syncs only `.pq` files in that subtree to Excel
- Subdirectory pull: right-click any Group subfolder → Pull from Folder extracts only queries belonging to that Group (and nested Groups), with scoped sentinel and orphan deletion

### Fixed
- COM route (Excel open): new queries are now placed in their correct Group subfolder instead of always landing in the MCode Folder root. Group metadata is read from the saved `.xlsx`; formulas still come from the live COM session

## [0.1.1] - 2026-06-17

### Fixed
- COM extraction (`extractMCodeViaCom`): base64-encode formula strings before `ConvertTo-Json` so M code containing unescaped double-quotes or special Unicode characters (e.g. in comments) no longer causes `SyntaxError: Expected ',' or '}'` on `JSON.parse`

## [0.1.0] - 2026-06-16

### Added
- Pull Power Query M code from Excel workbooks (`.xlsx`) into `.pq` files via ZIP extraction or live COM when Excel is open
- Push `.pq` files back into the workbook's DataMashup, preserving query group folder structure
- Auto-detect workbook and mcode folder from workspace root (one level deep)
- `pq-sync: Configure` command to set paths manually
- Context menu commands: pull/push from folder, push single `.pq` file
- Status bar indicator showing current config state
- `.pq-sync` sentinel file guards against accidental deletion of pre-existing `.pq` files on first pull
- Bundled scripts (`extract_mcode`, `import_mcode`) compiled into `dist/scripts/` — no external dependencies required at runtime

### Security
- Script runner uses `shell: false` — cmd.exe metacharacters cannot escape argument handling
- `pqSync.scriptsRoot` override removed — single hardened code path for script invocation
- `esbuild` bumped to `^0.28.1` — resolves high-severity CVE in dev toolchain
