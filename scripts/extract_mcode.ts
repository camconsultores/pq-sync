import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { spawnSync } from 'child_process';
import { loadIgnoreList } from './ignore_list';

export const SENTINEL_FILE = '.pq-sync';

// --- FUNCIONES AUXILIARES ---
function cleanName(name: string): string {
    return name.replace(/[\\/*?:"<>|]/g, '_');
}

function getFullGroupPath(groupId: string, groupsDict: Record<string, any>): string {
    if (!groupsDict[groupId]) return '';
    const group = groupsDict[groupId];
    let currentPath = cleanName(group.name);
    if (group.parentId) {
        const parentPath = getFullGroupPath(group.parentId, groupsDict);
        currentPath = path.join(parentPath, currentPath);
    }
    return currentPath;
}

export function matchesGroupFilter(groupRelPath: string, filter: string): boolean {
    if (!filter) return true;
    return groupRelPath === filter || groupRelPath.startsWith(filter + path.sep);
}

function decodeXmlBuffer(buffer: Buffer): string {
    const cleanXmlStart = (value: string): string =>
        value.replace(/^[﻿\x00\s]+(?=<\?xml|<)/, '');

    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return cleanXmlStart(buffer.toString('utf16le'));
    }

    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        const swapped = Buffer.alloc(buffer.length - 2);
        for (let i = 2; i + 1 < buffer.length; i += 2) {
            swapped[i - 2] = buffer[i + 1];
            swapped[i - 1] = buffer[i];
        }
        return cleanXmlStart(swapped.toString('utf16le'));
    }

    return cleanXmlStart(buffer.toString('utf8'));
}

function getFirstZipFromMashup(payload: Buffer): Buffer {
    const zipStart = payload.indexOf(Buffer.from('504b0304', 'hex'));
    if (zipStart < 0) {
        throw new Error('El DataMashup no contiene una cabecera ZIP PK.');
    }

    const eocdSignature = Buffer.from('504b0506', 'hex');
    const eocdStart = payload.indexOf(eocdSignature, zipStart);
    if (eocdStart < 0) {
        return payload.subarray(zipStart);
    }

    const commentLength = payload.readUInt16LE(eocdStart + 20);
    const zipEnd = eocdStart + 22 + commentLength;
    return payload.subarray(zipStart, zipEnd);
}

function getMashupBase64FromXml(xml: string): string | null {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const root = doc.documentElement;
    if (root && root.localName === 'DataMashup') {
        return root.textContent?.trim() || null;
    }

    const nodes = doc.getElementsByTagName('DataMashup');
    if (nodes.length > 0) {
        return nodes.item(0)?.textContent?.trim() || null;
    }

    const fallback = xml.match(/<[^>]*DataMashup[^>]*>([\s\S]*?)<\/[^>]*DataMashup>/);
    return fallback?.[1]?.trim() || null;
}

function guidFromBuffer(buffer: Buffer, offset: number): string {
    const part1 = buffer.readUInt32LE(offset).toString(16).padStart(8, '0');
    const part2 = buffer.readUInt16LE(offset + 4).toString(16).padStart(4, '0');
    const part3 = buffer.readUInt16LE(offset + 6).toString(16).padStart(4, '0');
    const part4 = buffer.subarray(offset + 8, offset + 10).toString('hex');
    const part5 = buffer.subarray(offset + 10, offset + 16).toString('hex');
    return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function readInt64AsNumber(buffer: Buffer, offset: number): number {
    return Number(buffer.readBigInt64LE(offset));
}

function parseQueryGroups(encodedValue: string): Record<string, any> {
    const value = encodedValue.startsWith('s') ? encodedValue.slice(1) : encodedValue;
    const buffer = Buffer.from(value, 'base64');
    const groups: Record<string, any> = {};
    let offset = 0;
    const count = readInt64AsNumber(buffer, offset);
    offset += 8;

    for (let index = 0; index < count && offset < buffer.length; index++) {
        const id = guidFromBuffer(buffer, offset);
        offset += 16;

        const nameLength = buffer[offset];
        offset += 1;
        const name = buffer.subarray(offset, offset + nameLength).toString('utf8');
        offset += nameLength;

        if (buffer[offset] === 0) offset += 1;

        const hasParent = buffer[offset] === 1;
        offset += 1;

        let parentId: string | null = null;
        if (hasParent) {
            parentId = guidFromBuffer(buffer, offset);
            offset += 16;
        }

        let sortOrder = index;
        if (offset + 8 <= buffer.length) {
            sortOrder = readInt64AsNumber(buffer, offset);
            offset += 8;
        } else if (offset + 4 <= buffer.length) {
            sortOrder = buffer.readInt32LE(offset);
            offset += 4;
        }

        groups[id] = { name, parentId, sortOrder };
    }

    return groups;
}

function parseMetadataGroups(mashupPayload: Buffer): {
    queryGroups: Record<string, any>;
    queryToGroup: Record<string, string>;
} {
    const metadata = mashupPayload.toString('utf8');
    const queryGroups: Record<string, any> = {};
    const queryToGroup: Record<string, string> = {};

    const groupsMatch = metadata.match(/<Entry Type="QueryGroups" Value="([^"]+)"/);
    if (groupsMatch?.[1]) {
        Object.assign(queryGroups, parseQueryGroups(groupsMatch[1]));
    }

    const itemRegex = /<Item><ItemLocation><ItemType>Formula<\/ItemType><ItemPath>Section1\/([^<]+)<\/ItemPath><\/ItemLocation><StableEntries>([\s\S]*?)<\/StableEntries><\/Item>/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(metadata)) !== null) {
        const queryName = itemMatch[1];
        const entries = itemMatch[2];
        const groupMatch = entries.match(/<Entry Type="QueryGroupID" Value="s?([^"]+)"/);
        if (groupMatch?.[1]) {
            queryToGroup[queryName] = groupMatch[1];
        }
    }

    return { queryGroups, queryToGroup };
}

export function resolveOutputPath(
    name: string,
    outputRoot: string,
    nameToPath: Map<string, string>,
    queryToGroup: Record<string, string>,
    queryGroups: Record<string, any>
): string {
    const existing = nameToPath.get(name);
    if (existing) return existing;

    const groupId = queryToGroup[name];
    if (groupId) {
        const groupPath = getFullGroupPath(groupId, queryGroups);
        if (groupPath) {
            return path.resolve(outputRoot, groupPath, `${cleanName(name)}.pq`);
        }
    }

    // Fallback: mcode root — known limitation when .xlsx unreadable; see #13
    return path.resolve(outputRoot, `${cleanName(name)}.pq`);
}

export function collectPqFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...collectPqFiles(fullPath));
        else if (entry.name.endsWith('.pq')) results.push(path.resolve(fullPath));
    }
    return results;
}

export function collectRootPqFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() && entry.name.endsWith('.pq')) {
            results.push(path.resolve(path.join(dir, entry.name)));
        }
    }
    return results;
}

export function collectSiblingGroupDirs(outputRoot: string, scopeDir: string): string[] {
    if (!fs.existsSync(outputRoot)) return [];
    const resolvedScope = path.resolve(scopeDir);
    const results: string[] = [];
    for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.resolve(path.join(outputRoot, entry.name));
        if (fullPath === resolvedScope) continue;
        results.push(fullPath);
    }
    return results;
}

export function stripMetadata(formula: string): string {
    const trimmed = formula.trim();
    const lastSemi = trimmed.lastIndexOf(';');
    if (lastSemi >= 0) {
        const afterSemi = trimmed.slice(lastSemi + 1);
        // If everything after the last ';' is whitespace + [ ... ] annotation blocks, strip them
        if (/^\s*(\[[^\]]*\]\s*)*$/.test(afterSemi)) {
            return trimmed.slice(0, lastSemi).trim();
        }
    }
    // Also strip trailing Excel metadata annotations without a preceding ';'
    // e.g. `in result\n[Query="QueryName"]` — the [Query=...] block changes on rename
    // causing false content-mismatch in rename detection. Safe to strip: valid M does
    // not append bare [key=value] blocks after the `in` expression.
    return trimmed.replace(/(\s*\[[^\]]*\]\s*)+$/, '').trim();
}

function normalizeForCompare(s: string): string {
    return s.trim().replace(/;$/, '').trim().replace(/\r\n?/g, '\n');
}

function removeEmptyDirs(dir: string, root: string): void {
    if (path.resolve(dir) === path.resolve(root)) return;
    try {
        if (fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
            removeEmptyDirs(path.dirname(dir), root);
        }
    } catch {}
}

function getPS(): string {
    return process.env.SystemRoot
        ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe';
}

function isWorkbookOpenInExcel(workbookPath: string): boolean {
    const absPath = path.resolve(workbookPath).replace(/'/g, "''");
    const result = spawnSync(getPS(), [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        `try { $xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application'); ` +
        `if (@($xl.Workbooks) | Where-Object { try { [IO.Path]::GetFullPath($_.FullName) -eq [IO.Path]::GetFullPath('${absPath}') } catch { $false } } | Select-Object -First 1) { 'open' } } catch {}`
    ], { encoding: 'utf8' });
    return result.stdout?.trim() === 'open';
}

// --- RUTA COM (Excel abierto, sin guardar) ---
function extractMCodeViaCom(xlsxPath: string, outputRoot: string, groupFilter: string = ''): void {
    console.log(`\n📂 Procesando (COM): ${xlsxPath}`);

    const scriptPath = path.join(os.tmpdir(), `extract-mcode-com-${process.pid}.ps1`);
    fs.writeFileSync(scriptPath, `
param([Parameter(Mandatory=$true)][string]$WorkbookPath)
$ErrorActionPreference = "Stop"
trap { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }

if (-not (Get-Process -Name EXCEL -ErrorAction SilentlyContinue)) {
    throw "Excel no esta abierto. Guarda el archivo y usa --direct."
}

$TargetPath = [System.IO.Path]::GetFullPath($WorkbookPath)
$Excel = $null
try { $Excel = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application") }
catch { throw "No se pudo conectar a Excel: $_" }

$Workbook = $null
foreach ($Candidate in @($Excel.Workbooks)) {
    try {
        if ([string]::Equals([System.IO.Path]::GetFullPath($Candidate.FullName), $TargetPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            $Workbook = $Candidate; break
        }
    } catch {}
}
if ($null -eq $Workbook) { throw "El libro no esta abierto en Excel: $TargetPath" }

$Workbook.Save()

$Result = @()
foreach ($Query in @($Workbook.Queries)) {
    $formulaBytes = [System.Text.Encoding]::UTF8.GetBytes([string]$Query.Formula)
    $formulaB64   = [System.Convert]::ToBase64String($formulaBytes)
    $Result += [PSCustomObject]@{ name = [string]$Query.Name; formula = $formulaB64 }
}

if ($Result.Count -eq 0) { Write-Output '[]'; exit 0 }
ConvertTo-Json -InputObject ([array]$Result) -Compress
`, 'utf8');

    let jsonOutput = '';
    try {
        const result = spawnSync(getPS(), [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, path.resolve(xlsxPath)
        ], { encoding: 'utf8', cwd: process.cwd() });

        if (result.status !== 0) {
            throw new Error(result.stderr?.trim() || `PowerShell exited with status ${result.status}`);
        }
        jsonOutput = result.stdout.trim();
    } finally {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
    }

    type ComQuery = { name: string; formula: string };
    const comQueries: ComQuery[] = JSON.parse(jsonOutput).map(
        (q: ComQuery) => ({ name: q.name, formula: Buffer.from(q.formula, 'base64').toString('utf8') })
    );

    if (!fs.existsSync(outputRoot)) fs.mkdirSync(outputRoot, { recursive: true });

    const scopeDir = groupFilter ? path.join(outputRoot, groupFilter) : outputRoot;
    const sentinelPath = path.join(scopeDir, SENTINEL_FILE);
    const sentinelExisted = fs.existsSync(sentinelPath);
    const rootSentinelExisted = groupFilter ? fs.existsSync(path.join(outputRoot, SENTINEL_FILE)) : sentinelExisted;

    const existingPqFiles = new Set(collectPqFiles(scopeDir));
    const nameToPath = new Map<string, string>();
    for (const pqPath of existingPqFiles) {
        nameToPath.set(path.basename(pqPath, '.pq'), pqPath);
    }

    // Read group metadata from saved .xlsx for correct subfolder placement of new queries.
    // Formulas come from COM (unsaved changes); group assignments come from disk (saved state).
    let queryToGroup: Record<string, string> = {};
    let queryGroups: Record<string, any> = {};
    try {
        const excelZip = new AdmZip(xlsxPath);
        for (const entry of excelZip.getEntries()) {
            if (entry.entryName.startsWith('customXml/') && entry.entryName.endsWith('.xml')) {
                const content = decodeXmlBuffer(entry.getData());
                const b64 = getMashupBase64FromXml(content);
                if (b64) {
                    const meta = parseMetadataGroups(Buffer.from(b64, 'base64'));
                    queryToGroup = meta.queryToGroup;
                    queryGroups = meta.queryGroups;
                    break;
                }
            }
        }
    } catch {
        // .xlsx unreadable (e.g. write-locked): fall back to nameToPath placement.
        // New queries with no saved metadata land in mcode root — known limitation, see #13.
    }

    const ignore = loadIgnoreList(outputRoot);
    const writtenFiles = new Set<string>();
    // Protect ignored files from orphan deletion
    for (const pqPath of existingPqFiles) {
        if (ignore(path.basename(pqPath, '.pq'))) writtenFiles.add(path.resolve(pqPath));
    }

    // Build content → path map for existing non-root .pq files.
    // Used to recover group placement when a query was renamed in the PQ Editor:
    // the mashup binary still maps the old name to its group, so the new name
    // has no group entry and would otherwise land at root.
    const contentToExistingGroupedPath = new Map<string, string>(); // '' = ambiguous match
    for (const pqPath of collectPqFiles(outputRoot)) {
        const rel = path.relative(outputRoot, pqPath);
        if (!rel.includes(path.sep)) continue; // skip root-level files
        try {
            const content = normalizeForCompare(stripMetadata(fs.readFileSync(pqPath, 'utf8')));
            contentToExistingGroupedPath.set(content, contentToExistingGroupedPath.has(content) ? '' : pqPath);
        } catch {}
    }

    let changedCount = 0;
    let unchangedCount = 0;
    let rootUngroupedCount = 0;
    for (const { name, formula } of comQueries) {
        if (ignore(name)) continue;
        const groupId = queryToGroup[name];
        const groupRelPath = groupId ? getFullGroupPath(groupId, queryGroups) : '';
        const normalized = normalizeForCompare(stripMetadata(formula));

        let outPath: string;
        if (groupRelPath) {
            if (!matchesGroupFilter(groupRelPath, groupFilter)) continue;
            outPath = resolveOutputPath(name, outputRoot, nameToPath, queryToGroup, queryGroups);
        } else {
            // No group metadata — three-step fallback:
            // (1) same-name file already exists in a non-root subfolder (user placed it / prior pull)
            // (2) content match for rename detection (query renamed in PQ Editor, formula unchanged)
            // (3) mcode root (genuinely ungrouped or unresolvable)
            const existingByName = nameToPath.get(cleanName(name));
            const existingByNameRel = existingByName ? path.relative(outputRoot, existingByName) : null;
            const existingByNameIsGrouped = existingByNameRel ? existingByNameRel.includes(path.sep) : false;

            if (existingByNameIsGrouped) {
                const groupRelOfExisting = path.relative(outputRoot, path.dirname(existingByName!));
                if (!matchesGroupFilter(groupRelOfExisting, groupFilter)) continue;
                outPath = existingByName!;
            } else {
                const existingMatch = contentToExistingGroupedPath.get(normalized);
                if (existingMatch) {
                    const recoveredGroupRelPath = path.relative(outputRoot, path.dirname(existingMatch));
                    if (!matchesGroupFilter(recoveredGroupRelPath, groupFilter)) continue;
                    outPath = path.resolve(path.dirname(existingMatch), `${cleanName(name)}.pq`);
                } else {
                    rootUngroupedCount++;
                    outPath = path.resolve(outputRoot, `${cleanName(name)}.pq`);
                }
            }
        }

        const dir = path.dirname(outPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const resolvedPath = path.resolve(outPath);
        writtenFiles.add(resolvedPath);
        const existingContent = fs.existsSync(outPath)
            ? normalizeForCompare(stripMetadata(fs.readFileSync(outPath, 'utf8')))
            : null;
        if (existingContent === normalized) { unchangedCount++; continue; }
        fs.writeFileSync(outPath, normalized, 'utf8');
        changedCount++;
    }

    const rootWarning = buildUngroupedRootWarning(rootUngroupedCount);
    if (rootWarning) console.warn(rootWarning);

    if (!sentinelExisted) {
        fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
        fs.writeFileSync(sentinelPath, '');
    }

    const { deletedCount: phase1Count } = deleteOrphans(existingPqFiles, writtenFiles, outputRoot, sentinelExisted);

    let phase2Count = 0;
    if (groupFilter) {
        const rootPqFiles = collectRootPqFiles(outputRoot);
        for (const pqPath of rootPqFiles) {
            if (ignore(path.basename(pqPath, '.pq'))) writtenFiles.add(pqPath);
        }
        const { deletedCount } = deleteOrphans(new Set(rootPqFiles), writtenFiles, outputRoot, rootSentinelExisted);
        phase2Count = deletedCount;
    }

    let phase3Count = 0;
    if (groupFilter) {
        const writtenNames = new Set([...writtenFiles].map(p => path.basename(p, '.pq')));
        for (const siblingDir of collectSiblingGroupDirs(outputRoot, scopeDir)) {
            const siblingFiles = collectPqFiles(siblingDir);
            for (const pqPath of siblingFiles) {
                if (ignore(path.basename(pqPath, '.pq'))) writtenFiles.add(pqPath);
            }
            if (!fs.existsSync(path.join(siblingDir, SENTINEL_FILE))) continue;
            // Only delete files whose query was written elsewhere this pull (moved out of sibling group)
            const stale = new Set(siblingFiles.filter(
                p => writtenNames.has(path.basename(p, '.pq')) && !writtenFiles.has(p)
            ));
            const { deletedCount } = deleteOrphans(stale, writtenFiles, outputRoot, true);
            phase3Count += deletedCount;
        }
    }

    const deletedCount = phase1Count + phase2Count + phase3Count;
    console.log(`✅ ¡Éxito! Exportados: ${changedCount} modificados, ${unchangedCount} sin cambios → ${outputRoot}`);
    if (deletedCount > 0) console.log(`🗑️ Se eliminaron ${deletedCount} archivos obsoletos.`);
}

// --- RUTA DIRECTA (ZIP desde disco) ---
function extractMCode(xlsxPath: string, outputRoot: string, groupFilter: string = ''): void {
    console.log(`\n📂 Procesando: ${xlsxPath}`);

    try {
        const excelZip = new AdmZip(xlsxPath);
        let mashupB64: string | null = null;

        // Búsqueda robusta del DataMashup. Excel suele guardar este XML como UTF-16.
        for (const entry of excelZip.getEntries()) {
            if (entry.entryName.startsWith('customXml/') && entry.entryName.endsWith('.xml')) {
                const content = decodeXmlBuffer(entry.getData());
                const found = getMashupBase64FromXml(content);
                if (found) {
                    mashupB64 = found;
                    break;
                }
            }
        }

        if (!mashupB64) {
            console.error("❌ Error: No se encontró el nodo DataMashup. Asegúrate de que el archivo tenga consultas y guárdalo.");
            return;
        }

        const mashupPayload = Buffer.from(mashupB64, 'base64');
        const mashupZip = new AdmZip(getFirstZipFromMashup(mashupPayload));
        const mCodeEntry = mashupZip.getEntry('Formulas/Section1.m');
        const packageEntry = mashupZip.getEntry('Config/Package.xml');

        if (!mCodeEntry) {
             console.error("❌ Error: Se encontró el DataMashup pero no contiene 'Section1.m'.");
             return;
        }

        // Parseo de estructura de carpetas
        const metadataGroups = parseMetadataGroups(mashupPayload);
        const queryGroups: Record<string, any> = { ...metadataGroups.queryGroups };
        const queryToGroup: Record<string, string> = { ...metadataGroups.queryToGroup };

        if (packageEntry) {
            const pkgXml = decodeXmlBuffer(packageEntry.getData());
            const pkgDoc = new DOMParser().parseFromString(pkgXml, 'text/xml');

            const groups = pkgDoc.getElementsByTagName('QueryGroup');
            for (let i = 0; i < groups.length; i++) {
                const node = groups.item(i)!;
                queryGroups[node.getAttribute('Id')!] = {
                    name: node.getAttribute('Name'),
                    parentId: node.getAttribute('ParentId')
                };
            }

            const items = pkgDoc.getElementsByTagName('Item');
            for (let i = 0; i < items.length; i++) {
                const item = items.item(i)!;
                if (item.getAttribute('Type') === 'Formula') {
                    const qName = item.getAttribute('Path')!.replace('Section1/', '');
                    const props = item.getElementsByTagName('Property');
                    for (let j = 0; j < props.length; j++) {
                        const p = props.item(j)!;
                        if (p.getAttribute('Name') === 'QueryGroupId') queryToGroup[qName] = p.getAttribute('Value')!;
                    }
                }
            }
        }

        // Extracción de código
        if (!fs.existsSync(outputRoot)) fs.mkdirSync(outputRoot, { recursive: true });

        const scopeDir = groupFilter ? path.join(outputRoot, groupFilter) : outputRoot;
        const sentinelPath = path.join(scopeDir, SENTINEL_FILE);
        const sentinelExisted = fs.existsSync(sentinelPath);
        const rootSentinelExisted = groupFilter ? fs.existsSync(path.join(outputRoot, SENTINEL_FILE)) : sentinelExisted;

        const existingPqFiles = new Set(collectPqFiles(scopeDir));
        const ignore = loadIgnoreList(outputRoot);
        const writtenFiles = new Set<string>();
        // Protect ignored files from orphan deletion
        for (const pqPath of existingPqFiles) {
            if (ignore(path.basename(pqPath, '.pq'))) writtenFiles.add(path.resolve(pqPath));
        }

        let mCodeRaw = mCodeEntry.getData().toString('utf8').replace(/^section\s+Section1;\s*/i, '').trim();
        const queries = mCodeRaw.replace(/^shared\s+/i, '').split(/\r?\nshared\s+/);

        let changedCount = 0;
        let unchangedCount = 0;
        for (let q of queries) {
            if (!q.trim()) continue;
            const parts = q.split('=');
            if (parts.length < 2) continue;

            let name = parts[0].trim().replace(/^#"/, '').replace(/"$/, '');
            if (ignore(name)) continue;
            const normalized = normalizeForCompare(stripMetadata(parts.slice(1).join('=')));

            const qGroupId = queryToGroup[name];
            const groupRelPath = qGroupId ? getFullGroupPath(qGroupId, queryGroups) : '';
            const isUngrouped = !groupRelPath;
            const inScope = matchesGroupFilter(groupRelPath, groupFilter);
            if (!inScope && !isUngrouped) continue;
            const outPath = isUngrouped
                ? path.resolve(outputRoot, `${cleanName(name)}.pq`)
                : path.resolve(path.join(outputRoot, groupRelPath), `${cleanName(name)}.pq`);
            const folderPath = path.dirname(outPath);

            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
            writtenFiles.add(outPath);

            const existingContent = fs.existsSync(outPath)
                ? normalizeForCompare(stripMetadata(fs.readFileSync(outPath, 'utf8')))
                : null;
            if (existingContent === normalized) { unchangedCount++; continue; }
            fs.writeFileSync(outPath, normalized, 'utf8');
            changedCount++;
        }

        if (!sentinelExisted) {
            fs.mkdirSync(path.dirname(sentinelPath), { recursive: true });
            fs.writeFileSync(sentinelPath, '');
        }

        const { deletedCount: phase1Count } = deleteOrphans(existingPqFiles, writtenFiles, outputRoot, sentinelExisted);

        let phase2Count = 0;
        if (groupFilter) {
            const rootPqFiles = collectRootPqFiles(outputRoot);
            for (const pqPath of rootPqFiles) {
                if (ignore(path.basename(pqPath, '.pq'))) writtenFiles.add(pqPath);
            }
            const { deletedCount } = deleteOrphans(new Set(rootPqFiles), writtenFiles, outputRoot, rootSentinelExisted);
            phase2Count = deletedCount;
        }

        let phase3Count = 0;
        if (groupFilter) {
            const writtenNames = new Set([...writtenFiles].map(p => path.basename(p, '.pq')));
            for (const siblingDir of collectSiblingGroupDirs(outputRoot, scopeDir)) {
                const siblingFiles = collectPqFiles(siblingDir);
                for (const pqPath of siblingFiles) {
                    if (ignore(path.basename(pqPath, '.pq'))) writtenFiles.add(pqPath);
                }
                if (!fs.existsSync(path.join(siblingDir, SENTINEL_FILE))) continue;
                // Only delete files whose query was written elsewhere this pull (moved out of sibling group)
                const stale = new Set(siblingFiles.filter(
                    p => writtenNames.has(path.basename(p, '.pq')) && !writtenFiles.has(p)
                ));
                const { deletedCount } = deleteOrphans(stale, writtenFiles, outputRoot, true);
                phase3Count += deletedCount;
            }
        }

        const deletedCount = phase1Count + phase2Count + phase3Count;
        console.log(`✅ ¡Éxito! Exportados: ${changedCount} modificados, ${unchangedCount} sin cambios → ${outputRoot}`);
        if (deletedCount > 0) console.log(`🗑️ Se eliminaron ${deletedCount} archivos obsoletos.`);

    } catch (e) { console.error("❌ Error fatal:", e); }
}

export function buildUngroupedRootWarning(count: number): string | null {
    if (count === 0) return null;
    const noun = count === 1 ? 'query' : 'queries';
    return `⚠ ${count} ${noun} placed at mcode root — save the workbook before pulling to honour group placement.`;
}

export function deleteOrphans(
    existingPqFiles: Set<string>,
    writtenFiles: Set<string>,
    outputRoot: string,
    sentinelExistedAtStart: boolean
): { deletedCount: number; skipped: boolean } {
    if (!sentinelExistedAtStart) {
        console.error(
            `mcodePath '${outputRoot}' has not been initialized by pq-sync. ` +
            `Run pull on the correct directory first, or check your pqSync.mcodePath setting.`
        );
        return { deletedCount: 0, skipped: true };
    }
    let deletedCount = 0;
    for (const existing of existingPqFiles) {
        if (!writtenFiles.has(existing)) {
            fs.unlinkSync(existing);
            removeEmptyDirs(path.dirname(existing), outputRoot);
            deletedCount++;
        }
    }
    return { deletedCount, skipped: false };
}

// --- INTERFAZ ---
if (require.main === module) {
    const rawArgs = process.argv.slice(2);
    const comFlag = rawArgs.includes('--com');
    const directFlag = rawArgs.includes('--direct');
    const groupIdx = rawArgs.indexOf('--group');
    const groupFilter = groupIdx >= 0 ? (rawArgs[groupIdx + 1] ?? '') : '';
    const positional = rawArgs.filter((a, i) => !a.startsWith('--') && rawArgs[i - 1] !== '--group');
    const [cliExcelInput, cliOutputInput] = positional;

    function runExtract(excelInput: string, outputInput: string): void {
        const xlsxPath = path.resolve(process.cwd(), excelInput);
        const outputRoot = path.resolve(process.cwd(), outputInput);

        let useCom = comFlag;
        if (!comFlag && !directFlag) {
            useCom = isWorkbookOpenInExcel(xlsxPath);
            if (useCom) console.log('📡 Excel abierto detectado — extrayendo sin guardar (COM).');
        }

        if (useCom) {
            extractMCodeViaCom(xlsxPath, outputRoot, groupFilter);
        } else {
            extractMCode(xlsxPath, outputRoot, groupFilter);
        }
    }

    if (cliExcelInput || cliOutputInput) {
        runExtract(
            cliExcelInput || 'ShopifyMetrics/Metrics.xlsx',
            cliOutputInput || 'ShopifyMetrics/MCode_Export/'
        );
        process.exit(0);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    async function iniciar() {
        const excelInput = await new Promise<string>(r => rl.question('Archivo Excel [ShopifyMetrics/Metrics.xlsx]: ', r)) || 'ShopifyMetrics/Metrics.xlsx';
        const outputInput = await new Promise<string>(r => rl.question('Carpeta destino [ShopifyMetrics/MCode_Export/]: ', r)) || 'ShopifyMetrics/MCode_Export/';
        rl.close();
        runExtract(excelInput, outputInput);
    }
    iniciar().catch(e => {
        console.error("❌ Error fatal:", e);
        process.exit(1);
    });
}
