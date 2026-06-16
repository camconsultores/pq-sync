# pq-sync VS Code Extension

Sync Power Query M code between Excel workbooks and `.pq` files directly from VS Code.

## What it does

- `pq-sync: Pull from Excel` extracts query code from the configured workbook into the configured `.pq` folder.
- `pq-sync: Push to Excel` imports `.pq` files back into the configured workbook.
- `pq-sync: Configure` lets you choose the workbook and `mcode` folder interactively.
- Supports right-click context menus on `.pq` files and the selected folder.
- Uses bundled self-contained sync scripts in `dist/scripts/` by default.

## Installation

1. Run `npm install` to install the extension dependencies and script dependencies (`adm-zip`, `@xmldom/xmldom`).
2. Run `npm run build` to bundle the extension and the real `scripts/*.ts` sync scripts into `dist/`.
3. Run `npm run package` to create a `.vsix` installer.
4. Install the generated `.vsix` in VS Code.

## Configuration

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run `pq-sync: Configure`.
3. Select your Excel workbook (`.xlsx`).
4. Select the folder where `.pq` files are stored.

## Notes

- The repository now includes the real Power Query sync script sources in `scripts/`.
- The extension is self-contained and uses bundled `dist/scripts/extract_mcode.js` and `dist/scripts/import_mcode.js` by default.
- `pqSync.scriptsRoot` is optional and only needed if you want to override the default bundled script source.
- The scripts support COM-based Excel sync when the workbook is open, or direct XLSX updates when it is closed.
