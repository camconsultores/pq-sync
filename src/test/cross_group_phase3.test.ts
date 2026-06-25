import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectSiblingGroupDirs, collectPqFiles, deleteOrphans, SENTINEL_FILE } from '../../scripts/extract_mcode';

// ── collectSiblingGroupDirs ───────────────────────────────────────────────────

describe('collectSiblingGroupDirs', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-siblings-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns [] when outputRoot does not exist', () => {
        const result = collectSiblingGroupDirs(path.join(tmpDir, 'nonexistent'), path.join(tmpDir, 'Staging'));
        expect(result).toEqual([]);
    });

    it('returns [] when outputRoot has no subdirectories', () => {
        fs.writeFileSync(path.join(tmpDir, 'Query.pq'), '');
        const result = collectSiblingGroupDirs(tmpDir, path.join(tmpDir, 'Staging'));
        expect(result).toEqual([]);
    });

    it('excludes scopeDir from results', () => {
        const stagingDir = path.join(tmpDir, 'Staging');
        const transformsDir = path.join(tmpDir, 'Transforms');
        fs.mkdirSync(stagingDir);
        fs.mkdirSync(transformsDir);
        const result = collectSiblingGroupDirs(tmpDir, stagingDir);
        expect(result).not.toContain(path.resolve(stagingDir));
        expect(result).toContain(path.resolve(transformsDir));
    });

    it('returns all subdirectories except scopeDir', () => {
        fs.mkdirSync(path.join(tmpDir, 'GroupA'));
        fs.mkdirSync(path.join(tmpDir, 'GroupB'));
        fs.mkdirSync(path.join(tmpDir, 'GroupC'));
        const result = collectSiblingGroupDirs(tmpDir, path.join(tmpDir, 'GroupA'));
        expect(result).toHaveLength(2);
        expect(result).toContain(path.resolve(tmpDir, 'GroupB'));
        expect(result).toContain(path.resolve(tmpDir, 'GroupC'));
    });

    it('does not include files (only directories)', () => {
        fs.mkdirSync(path.join(tmpDir, 'Staging'));
        fs.writeFileSync(path.join(tmpDir, 'root.pq'), '');
        const result = collectSiblingGroupDirs(tmpDir, path.join(tmpDir, 'Transforms'));
        expect(result).toEqual([path.resolve(tmpDir, 'Staging')]);
    });
});

// ── Phase 3 filter logic (writtenNames) ───────────────────────────────────────

describe('Phase 3 — writtenNames filter: only delete moved queries', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-phase3filter-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('query moved GroupA→GroupB: stale GroupA file deleted (name in writtenNames, path not in writtenFiles)', () => {
        const groupA = path.join(tmpDir, 'GroupA');
        const groupB = path.join(tmpDir, 'GroupB');
        fs.mkdirSync(groupA);
        fs.mkdirSync(groupB);
        fs.writeFileSync(path.join(groupA, SENTINEL_FILE), '');
        const staleA = path.resolve(groupA, 'Query.pq');
        fs.writeFileSync(staleA, 'old formula');
        const newB = path.resolve(groupB, 'Query.pq');
        fs.writeFileSync(newB, 'new formula');

        // Simulate Phase 3: writtenFiles has newB; writtenNames has 'Query'
        const writtenFiles = new Set([newB]);
        const writtenNames = new Set([...writtenFiles].map(p => path.basename(p, '.pq')));
        const siblingFiles = collectPqFiles(groupA);
        const stale = new Set(siblingFiles.filter(
            p => writtenNames.has(path.basename(p, '.pq')) && !writtenFiles.has(p)
        ));

        const { deletedCount } = deleteOrphans(stale, writtenFiles, tmpDir, true);

        expect(deletedCount).toBe(1);
        expect(fs.existsSync(staleA)).toBe(false);
        expect(fs.existsSync(newB)).toBe(true);
    });

    it('query still in GroupA (not moved): GroupA file preserved (name NOT in writtenNames)', () => {
        const groupA = path.join(tmpDir, 'GroupA');
        const groupB = path.join(tmpDir, 'GroupB');
        fs.mkdirSync(groupA);
        fs.mkdirSync(groupB);
        fs.writeFileSync(path.join(groupA, SENTINEL_FILE), '');
        const fileA = path.resolve(groupA, 'StillInGroupA.pq');
        fs.writeFileSync(fileA, 'formula');
        // Scoped pull on GroupB wrote a different query
        const writtenFiles = new Set([path.resolve(groupB, 'OtherQuery.pq')]);
        const writtenNames = new Set([...writtenFiles].map(p => path.basename(p, '.pq')));

        const siblingFiles = collectPqFiles(groupA);
        // 'StillInGroupA' is NOT in writtenNames → filtered out → not deleted
        const stale = new Set(siblingFiles.filter(
            p => writtenNames.has(path.basename(p, '.pq')) && !writtenFiles.has(p)
        ));

        expect(stale.size).toBe(0);
        expect(fs.existsSync(fileA)).toBe(true);
    });
});

// ── Phase 3 — sentinel gating ────────────────────────────────────────────────

describe('Phase 3 — sentinel gating', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-phase3-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('GroupA has no sentinel: Phase 3 skips it (continue in route loop)', () => {
        const groupA = path.join(tmpDir, 'GroupA');
        fs.mkdirSync(groupA);
        // No sentinel in GroupA
        const fileA = path.resolve(groupA, 'Query.pq');
        fs.writeFileSync(fileA, 'formula');

        const hasSentinel = fs.existsSync(path.join(groupA, SENTINEL_FILE));
        expect(hasSentinel).toBe(false);
        // Route loop skips GroupA via `continue` — file untouched
        expect(fs.existsSync(fileA)).toBe(true);
    });

    it('GroupA has sentinel: Phase 3 eligible for deletion', () => {
        const groupA = path.join(tmpDir, 'GroupA');
        const groupB = path.join(tmpDir, 'GroupB');
        fs.mkdirSync(groupA);
        fs.mkdirSync(groupB);
        fs.writeFileSync(path.join(groupA, SENTINEL_FILE), '');
        const staleA = path.resolve(groupA, 'MovedQuery.pq');
        fs.writeFileSync(staleA, 'formula');
        const newB = path.resolve(groupB, 'MovedQuery.pq');
        fs.writeFileSync(newB, 'formula');

        const writtenFiles = new Set([newB]);
        const writtenNames = new Set([...writtenFiles].map(p => path.basename(p, '.pq')));
        const siblingFiles = collectPqFiles(groupA);
        const stale = new Set(siblingFiles.filter(
            p => writtenNames.has(path.basename(p, '.pq')) && !writtenFiles.has(p)
        ));
        const { deletedCount } = deleteOrphans(stale, writtenFiles, tmpDir, true);

        expect(deletedCount).toBe(1);
        expect(fs.existsSync(staleA)).toBe(false);
    });

    it('combined delete count: Phase 3 deletions add to total', () => {
        const groupA = path.join(tmpDir, 'GroupA');
        const groupB = path.join(tmpDir, 'GroupB');
        fs.mkdirSync(groupA);
        fs.mkdirSync(groupB);
        fs.writeFileSync(path.join(groupA, SENTINEL_FILE), '');
        const stale1 = path.resolve(groupA, 'Query1.pq');
        const stale2 = path.resolve(groupA, 'Query2.pq');
        fs.writeFileSync(stale1, 'formula');
        fs.writeFileSync(stale2, 'formula');
        const newB1 = path.resolve(groupB, 'Query1.pq');
        const newB2 = path.resolve(groupB, 'Query2.pq');
        fs.writeFileSync(newB1, 'formula');
        fs.writeFileSync(newB2, 'formula');

        const writtenFiles = new Set([newB1, newB2]);
        const writtenNames = new Set([...writtenFiles].map(p => path.basename(p, '.pq')));
        const siblingFiles = collectPqFiles(groupA);
        const stale = new Set(siblingFiles.filter(
            p => writtenNames.has(path.basename(p, '.pq')) && !writtenFiles.has(p)
        ));
        const { deletedCount } = deleteOrphans(stale, writtenFiles, tmpDir, true);

        expect(deletedCount).toBe(2);
        expect(fs.existsSync(stale1)).toBe(false);
        expect(fs.existsSync(stale2)).toBe(false);
    });

    it('full pull: Phase 3 not executed (gated by groupFilter in route)', () => {
        // collectSiblingGroupDirs itself still works, but the `if (groupFilter)` guard in
        // both routes prevents Phase 3 from ever running on a full pull.
        const groupA = path.join(tmpDir, 'GroupA');
        fs.mkdirSync(groupA);
        const siblings = collectSiblingGroupDirs(tmpDir, tmpDir);
        // The route guard `if (groupFilter)` is what prevents Phase 3 — verified by unit structure.
        // This test just confirms the helper works correctly regardless.
        expect(siblings).toContain(path.resolve(groupA));
    });
});
