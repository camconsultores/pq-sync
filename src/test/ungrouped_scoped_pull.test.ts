import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteOrphans, matchesGroupFilter, resolveOutputPath, SENTINEL_FILE } from '../../scripts/extract_mcode';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Reproduces the call-site routing logic added in issue 009.
 * Returns true when the query should be skipped (not written).
 */
function shouldSkip(groupRelPath: string, groupFilter: string): boolean {
    const isUngrouped = !groupRelPath;
    const inScope = matchesGroupFilter(groupRelPath, groupFilter);
    return !inScope && !isUngrouped;
}

/**
 * Resolves where an ungrouped query is written during a scoped pull.
 * Must bypass resolveOutputPath() to avoid nameToPath contamination.
 */
function ungroupedOutPath(outputRoot: string, name: string): string {
    return path.resolve(outputRoot, `${name}.pq`);
}

// ── AC: include/exclude gate ──────────────────────────────────────────────────

describe('scoped pull — ungrouped query gate', () => {
    it('matchesGroupFilter unchanged: ungrouped excluded by non-empty filter', () => {
        // matchesGroupFilter itself still returns false for ungrouped + non-empty filter
        expect(matchesGroupFilter('', 'Staging')).toBe(false);
    });

    it('ungrouped query is NOT skipped by compound condition (fix)', () => {
        // groupRelPath='' means isUngrouped=true → bypass filter
        expect(shouldSkip('', 'Staging')).toBe(false);
    });

    it('ungrouped query is NOT skipped even without a filter', () => {
        expect(shouldSkip('', '')).toBe(false);
    });

    it('in-scope grouped query is NOT skipped', () => {
        expect(shouldSkip('Staging', 'Staging')).toBe(false);
    });

    it('nested in-scope grouped query is NOT skipped', () => {
        expect(shouldSkip(path.join('Staging', 'Sub'), 'Staging')).toBe(false);
    });

    // AC: group A→group B — query in different group IS skipped during scoped pull on old group
    it('grouped query in a different group IS skipped (group A→B, scoped pull on A)', () => {
        expect(shouldSkip('Transforms', 'Staging')).toBe(true);
    });

    it('grouped query in sibling group IS skipped', () => {
        expect(shouldSkip('Other', 'Staging')).toBe(true);
    });
});

// ── AC: ungrouped path routing ─────────────────────────────────────────────────

describe('scoped pull — ungrouped query path routing', () => {
    const ROOT = 'C:\\mcode';

    it('ungrouped query resolves to outputRoot (not scopeDir)', () => {
        const result = ungroupedOutPath(ROOT, 'MyQuery');
        expect(result).toBe(path.resolve(ROOT, 'MyQuery.pq'));
    });

    it('resolveOutputPath also routes ungrouped queries to root (regression)', () => {
        // Confirms the resolveOutputPath fallback is unchanged
        const result = resolveOutputPath('MyQuery', ROOT, new Map(), {}, {});
        expect(result).toBe(path.resolve(ROOT, 'MyQuery.pq'));
    });

    it('ungrouped path is independent of the active group filter scope dir', () => {
        // If groupFilter='Staging', scopeDir = ROOT/Staging — root path must NOT be under it
        const scopeDir = path.join(ROOT, 'Staging');
        const outPath = ungroupedOutPath(ROOT, 'MovedQuery');
        expect(outPath.startsWith(scopeDir)).toBe(false);
        expect(outPath).toBe(path.resolve(ROOT, 'MovedQuery.pq'));
    });
});

// ── AC: group→root filesystem — writes root file, deletes old scoped file ──────

describe('scoped pull — group→root with sentinel: root file written, old scoped file deleted', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-ungrouped-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('orphan deletion removes old scoped file while root file is untouched', () => {
        // Setup: sentinel in Staging/, stale Staging/RawData.pq exists
        const stagingDir = path.join(tmpDir, 'Staging');
        fs.mkdirSync(stagingDir);
        fs.writeFileSync(path.join(stagingDir, SENTINEL_FILE), '');
        const oldScopedFile = path.join(stagingDir, 'RawData.pq');
        fs.writeFileSync(oldScopedFile, 'old formula');

        // The pull wrote RawData.pq to root (query is now ungrouped)
        const rootFile = path.join(tmpDir, 'RawData.pq');
        fs.writeFileSync(rootFile, 'new formula');

        // existingPqFiles: only scoped dir (Staging/) was collected
        const existing = new Set([oldScopedFile]);
        // writtenFiles: root path (ungrouped routing), NOT the scoped path
        const written = new Set([rootFile]);

        const result = deleteOrphans(existing, written, tmpDir, true);

        expect(result.deletedCount).toBe(1);
        expect(fs.existsSync(oldScopedFile)).toBe(false);  // deleted: was orphan in scope
        expect(fs.existsSync(rootFile)).toBe(true);        // untouched: not in existingPqFiles
    });

    it('orphan deletion scope: root files are never in existingPqFiles for scoped pull', () => {
        // Only files under scopeDir are candidates for orphan deletion.
        // Root file must survive regardless of writtenFiles.
        const stagingDir = path.join(tmpDir, 'Staging');
        fs.mkdirSync(stagingDir);
        fs.writeFileSync(path.join(stagingDir, SENTINEL_FILE), '');

        const rootFile = path.join(tmpDir, 'UnrelatedQuery.pq');
        fs.writeFileSync(rootFile, 'formula');

        // existingPqFiles collected from Staging/ only — root file not included
        const existing = new Set<string>();  // empty: nothing in Staging/ except sentinel
        const written = new Set<string>();   // nothing written this pull

        deleteOrphans(existing, written, tmpDir, true);

        expect(fs.existsSync(rootFile)).toBe(true);  // root file untouched
    });
});

// ── AC: group A→group B scoped pull on old group ──────────────────────────────

describe('scoped pull on old group — group A→B: old file deleted, new group file not created', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-grouptransfer-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('query moved Staging→Transforms: Staging/Query.pq deleted, Transforms/Query.pq not created', () => {
        // Setup: Staging/ with sentinel and RawData.pq
        const stagingDir = path.join(tmpDir, 'Staging');
        fs.mkdirSync(stagingDir);
        fs.writeFileSync(path.join(stagingDir, SENTINEL_FILE), '');
        const oldFile = path.join(stagingDir, 'RawData.pq');
        fs.writeFileSync(oldFile, 'formula');

        // Scoped pull on Staging: RawData now has groupRelPath='Transforms'
        // shouldSkip('Transforms', 'Staging') === true → query not written anywhere
        expect(shouldSkip('Transforms', 'Staging')).toBe(true);

        // deleteOrphans sees Staging/RawData.pq as orphan (written set is empty)
        const existing = new Set([oldFile]);
        const written = new Set<string>();
        const result = deleteOrphans(existing, written, tmpDir, true);

        expect(result.deletedCount).toBe(1);
        expect(fs.existsSync(oldFile)).toBe(false);

        // Transforms/ should NOT exist — no file written there
        expect(fs.existsSync(path.join(tmpDir, 'Transforms'))).toBe(false);
    });
});
