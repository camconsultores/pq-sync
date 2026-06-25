# Creates sample .xlsx workbooks with Power Query queries for pq-sync local testing.
# Requires Excel to be installed. Run from the test-fixtures/ directory.
#
# Output:
#   workbooks/simple.xlsx      — 3 queries, no groups
#   workbooks/with-groups.xlsx — 2 queries in 2 named groups (Staging, Transforms)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workbooksDir = Join-Path $scriptDir 'workbooks'

function Add-Query {
    param($Queries, [string]$Name, [string]$Formula)
    return $Queries.Add($Name, $Formula)
}

Write-Host "Starting Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    # ── simple.xlsx ─────────────────────────────────────────────────────────────
    Write-Host "Creating simple.xlsx..."
    $wb = $excel.Workbooks.Add()

    Add-Query $wb.Queries 'SalesData' @'
let
    Source = Table.FromRows(
        {
            {1, "Product A", 100},
            {2, "Product B", 200},
            {3, "Product C", 150}
        },
        type table [ID = Int64.Type, Product = text, Amount = Int64.Type]
    )
in
    Source
'@

    Add-Query $wb.Queries 'Products' @'
let
    Source = Table.FromRows(
        {
            {"Product A", "Category 1"},
            {"Product B", "Category 2"},
            {"Product C", "Category 1"}
        },
        type table [Product = text, Category = text]
    )
in
    Source
'@

    Add-Query $wb.Queries 'Summary' @'
let
    Sales = SalesData,
    Prods = Products,
    Joined = Table.Join(Sales, "Product", Prods, "Product"),
    Grouped = Table.Group(Joined, {"Category"}, {{"Total", each List.Sum([Amount]), Int64.Type}})
in
    Grouped
'@

    $simplePath = Join-Path $workbooksDir 'simple.xlsx'
    $wb.SaveAs($simplePath, 51)   # 51 = xlOpenXMLWorkbook
    $wb.Close($false)
    Write-Host "  -> $simplePath"

    # ── with-groups.xlsx ────────────────────────────────────────────────────────
    Write-Host "Creating with-groups.xlsx..."
    $wb2 = $excel.Workbooks.Add()

    # Power Query groups are stored as metadata on the query object via the
    # undocumented QueryGroup property. We set it through the query's Category
    # property which maps to the group name shown in the Power Query Editor.
    # If your Excel version exposes WorkbookQuery.Category use that; otherwise
    # the group assignment must be done manually in the Power Query Editor after
    # the file is created (see NOTE below).

    $q1 = Add-Query $wb2.Queries 'RawData' @'
let
    Source = Table.FromRows(
        {
            {1, "2024-01-01", "Product A", 100},
            {2, "2024-01-02", "Product B", 200},
            {3, "2024-01-03", "Product A", 50}
        },
        type table [ID = Int64.Type, Date = text, Product = text, Qty = Int64.Type]
    )
in
    Source
'@

    $q2 = Add-Query $wb2.Queries 'CleanData' @'
let
    Source = RawData,
    Typed = Table.TransformColumnTypes(Source, {{"Date", type date}}),
    Filtered = Table.SelectRows(Typed, each [Qty] > 0)
in
    Filtered
'@

    # Attempt to set group via Category (Excel 365 / 2021+)
    try {
        $q1.Category = 'Staging'
        $q2.Category = 'Transforms'
        Write-Host "  Groups assigned via Category property."
    } catch {
        Write-Warning "  Could not set query groups automatically."
        Write-Warning "  NOTE: Open with-groups.xlsx in Excel, open Power Query Editor,"
        Write-Warning "  and manually move RawData -> Staging group, CleanData -> Transforms group."
    }

    $groupsPath = Join-Path $workbooksDir 'with-groups.xlsx'
    $wb2.SaveAs($groupsPath, 51)
    $wb2.Close($false)
    Write-Host "  -> $groupsPath"

} finally {
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Host ""
Write-Host "Done. Workbooks ready in: $workbooksDir"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Press F5 in VS Code to launch the extension in debug mode."
Write-Host "  2. Follow test cases in README.md."
