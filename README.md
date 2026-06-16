# pq-sync VS Code Extension

Sync Power Query M code between Excel workbooks and `.pq` files directly from VS Code.

> **Windows only.** The sync scripts depend on COM automation for Excel open-file detection.

---

## Install

Search **pq-sync** in the VS Code Extensions sidebar, or:

```
ext install ricardodiaz.pq-sync
```

---

## What it does

- **`pq-sync: Pull from Excel`** — extracts Power Query M code from the configured workbook into `.pq` files.
- **`pq-sync: Push to Excel`** — imports `.pq` files back into the configured workbook.
- **`pq-sync: Configure`** — interactively pick the workbook and mcode folder; stored in workspace settings.
- Right-click a `.pq` file → **Push this query** to push a single named query.
- Right-click the mcode folder → **Pull from Excel** / **Push to Excel** for the whole folder.

Routes through COM when the workbook is open in Excel; falls back to direct XLSX read/write when closed.

---

## Quick start

1. Open the command palette (`Ctrl+Shift+P`).
2. Run **`pq-sync: Configure`** — pick your `.xlsx` workbook, then the folder containing `.pq` files.
3. Run **`pq-sync: Pull from Excel`** or **`pq-sync: Push to Excel`**.

Output appears in the **pq-sync** Output Channel. Status bar shows sync state.

---

## Configuration

| Setting | Description |
|---------|-------------|
| `pqSync.workbookPath` | Absolute path to the Excel workbook (`.xlsx`) |
| `pqSync.mcodePath` | Absolute path to the folder containing `.pq` files |
| `pqSync.scriptsRoot` | Optional: path to external script overrides (advanced) |

---

## Development

```bash
npm install
npm run build     # bundles extension + sync scripts into dist/
npm run package   # produces a .vsix installer
```

Install the `.vsix` in VS Code via **Extensions → ··· → Install from VSIX**.

Run tests:

```bash
npm test
```

---

## License

MIT
