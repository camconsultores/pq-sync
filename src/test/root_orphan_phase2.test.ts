import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectRootPqFiles, deleteOrphans, SENTINEL_FILE } from '../../scripts/extract_mcode';

// ── collectRootPqFiles ────────────────────────────────────────────────────────

describe('collectRootPqFiles', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-rootfiles-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns [] for non-existent directory', () => {
        expect(collectRootPqFiles(path.join(tmpDir, 'nonexistent'))).toEqual([]);
    });

    it('returns direct .pq children as resolved absolute paths', () => {
        fs.writeFileSync(path.join(tmpDir, 'Query.pq'), '');
        fs.writeFileSync(path.join(tmpDir, 'Other.pq'), '');
        const result = collectRootPqFiles(tmpDir);
        expect(result).toHaveLength(2);
        expect(result).toContain(path.resolve(tmpDir, 'Query.pq'));
        expect(result).toContain(path.resolve(tmpDir, 'Other.pq'));
    });

    it('excludes .pq files nested inside subdirectories', () => {
        const sub = path.join(tmpDir, 'Staging');
        fs.mkdirSync(sub);
        fs.writeFileSync(path.join(sub, 'Nested.pq'), '');
        fs.writeFileSync(path.join(tmpDir, 'Root.pq'), '');
        const result = collectRootPqFiles(tmpDir);
        expect(result).toHaveLength(1);
        expect(result).toContain(path.resolve(tmpDir, 'Root.pq'));
    });

    it('excludes non-.pq files', () => {
        fs.writeFileSync(path.join(tmpDir, 'file.txt'), '');
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        fs.writeFileSync(path.join(tmpDir, 'Query.pq'), '');
        const result = collectRootPqFiles(tmpDir);
        expect(result).toEqual([path.resolve(tmpDir, 'Query.pq')]);
    });

    it('returns [] for empty directory', () => {
        expect(collectRootPqFiles(tmpDir)).toEqual([]);
    });
});

// ── Phase 2 orphan deletion via deleteOrphans ─────────────────────────────────

describe('Phase 2 — root orphan deletion during scoped pull', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-phase2-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('deletes stale root file when root sentinel exists and file not in writtenFiles', () => {
        // Setup: root sentinel + stale root file (query moved to group)
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        const staleRoot = path.join(tmpDir, 'OldQuery.pq');
        fs.writeFileSync(staleRoot, 'formula');

        const result = deleteOrphans(
            new Set([path.resolve(staleRoot)]),
            new Set<string>(),
            tmpDir,
            true  // rootSentinelExisted
        );

        expect(result.deletedCount).toBe(1);
        expect(fs.existsSync(staleRoot)).toBe(false);
    });

    it('preserves root file when root sentinel is absent', () => {
        const rootFile = path.join(tmpDir, 'Query.pq');
        fs.writeFileSync(rootFile, 'formula');

        const result = deleteOrphans(
            new Set([path.resolve(rootFile)]),
            new Set<string>(),
            tmpDir,
            false  // rootSentinelExisted = false → skip
        );

        expect(result.deletedCount).toBe(0);
        expect(result.skipped).toBe(true);
        expect(fs.existsSync(rootFile)).toBe(true);
    });

    it('preserves root file that is in writtenFiles (still ungrouped)', () => {
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        const rootFile = path.resolve(tmpDir, 'ActiveQuery.pq');
        fs.writeFileSync(rootFile, 'formula');

        const result = deleteOrphans(
            new Set([rootFile]),
            new Set([rootFile]),  // in writtenFiles → preserved
            tmpDir,
            true
        );

        expect(result.deletedCount).toBe(0);
        expect(fs.existsSync(rootFile)).toBe(true);
    });

    it('Phase 2 does not affect scoped-dir files (they are not in its existingPqFiles)', () => {
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        const stagingDir = path.join(tmpDir, 'Staging');
        fs.mkdirSync(stagingDir);
        const scopedFile = path.join(stagingDir, 'GroupedQuery.pq');
        fs.writeFileSync(scopedFile, 'formula');
        const staleRoot = path.resolve(tmpDir, 'StaleRoot.pq');
        fs.writeFileSync(staleRoot, 'formula');

        // Phase 2 only gets root files as existingPqFiles
        const result = deleteOrphans(
            new Set([staleRoot]),          // root file only
            new Set<string>(),             // nothing written
            tmpDir,
            true
        );

        expect(result.deletedCount).toBe(1);
        expect(fs.existsSync(staleRoot)).toBe(false);
        expect(fs.existsSync(scopedFile)).toBe(true);  // untouched
    });

    it('full pull scenario: Phase 2 not needed (no groupFilter → single pass covers root)', () => {
        // On full pull, scopeDir === outputRoot, so Phase 1 already covers root files.
        // This test confirms deleteOrphans on root existingPqFiles with sentinel works normally.
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        const file = path.resolve(tmpDir, 'Query.pq');
        fs.writeFileSync(file, 'formula');

        const result = deleteOrphans(new Set([file]), new Set<string>(), tmpDir, true);
        expect(result.deletedCount).toBe(1);
    });

    it('combined delete count: Phase 1 + Phase 2 both delete', () => {
        // Simulates: Phase 1 deletes 1 scoped file, Phase 2 deletes 1 root file
        const stagingDir = path.join(tmpDir, 'Staging');
        fs.mkdirSync(stagingDir);
        fs.writeFileSync(path.join(stagingDir, SENTINEL_FILE), '');
        const scopedFile = path.resolve(stagingDir, 'OldGrouped.pq');
        fs.writeFileSync(scopedFile, 'formula');
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        const rootFile = path.resolve(tmpDir, 'OldRoot.pq');
        fs.writeFileSync(rootFile, 'formula');

        const phase1 = deleteOrphans(new Set([scopedFile]), new Set<string>(), tmpDir, true);
        const phase2 = deleteOrphans(new Set([rootFile]), new Set<string>(), tmpDir, true);
        const totalDeleted = phase1.deletedCount + phase2.deletedCount;

        expect(totalDeleted).toBe(2);
        expect(fs.existsSync(scopedFile)).toBe(false);
        expect(fs.existsSync(rootFile)).toBe(false);
    });
});
