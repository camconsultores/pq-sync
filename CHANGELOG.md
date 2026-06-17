# Changelog

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
