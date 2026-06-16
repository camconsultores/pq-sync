import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteOrphans, SENTINEL_FILE } from '../../scripts/extract_mcode';

describe('deleteOrphans', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-sentinel-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('skips deletions and returns skipped=true when sentinel absent', () => {
        const stale = path.join(tmpDir, 'stale.pq');
        fs.writeFileSync(stale, 'let x = 1');

        const existing = new Set([stale]);
        const written = new Set<string>();

        const result = deleteOrphans(existing, written, tmpDir, false);

        expect(result.skipped).toBe(true);
        expect(result.deletedCount).toBe(0);
        expect(fs.existsSync(stale)).toBe(true);
    });

    it('deletes orphaned files when sentinel present', () => {
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        const stale = path.join(tmpDir, 'stale.pq');
        fs.writeFileSync(stale, 'let x = 1');

        const existing = new Set([stale]);
        const written = new Set<string>();

        const result = deleteOrphans(existing, written, tmpDir, true);

        expect(result.skipped).toBe(false);
        expect(result.deletedCount).toBe(1);
        expect(fs.existsSync(stale)).toBe(false);
    });

    it('does not delete files that were written in current sync', () => {
        fs.writeFileSync(path.join(tmpDir, SENTINEL_FILE), '');
        const kept = path.join(tmpDir, 'kept.pq');
        fs.writeFileSync(kept, 'let x = 1');

        const existing = new Set([kept]);
        const written = new Set([kept]);

        const result = deleteOrphans(existing, written, tmpDir, true);

        expect(result.deletedCount).toBe(0);
        expect(fs.existsSync(kept)).toBe(true);
    });

    it('SENTINEL_FILE constant is .pq-sync', () => {
        expect(SENTINEL_FILE).toBe('.pq-sync');
    });
});
