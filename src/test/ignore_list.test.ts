import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadIgnoreList, IGNORE_FILE } from '../../scripts/ignore_list';

describe('loadIgnoreList', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sync-ignore-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function write(content: string): void {
        fs.writeFileSync(path.join(tmpDir, IGNORE_FILE), content, 'utf8');
    }

    it('returns no-op when .pqignore is absent', () => {
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('AnyQuery')).toBe(false);
        expect(ignore('fnHelper')).toBe(false);
    });

    it('returns no-op for empty .pqignore', () => {
        write('');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('AnyQuery')).toBe(false);
    });

    it('exact name match', () => {
        write('StagingQuery\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('StagingQuery')).toBe(true);
        expect(ignore('OtherQuery')).toBe(false);
    });

    it('prefix glob: fn*', () => {
        write('fn*\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('fnShopifyQL')).toBe(true);
        expect(ignore('fnHelper')).toBe(true);
        expect(ignore('qShopify')).toBe(false);
    });

    it('suffix glob: *test', () => {
        write('*test\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('StagingTest')).toBe(true);
        expect(ignore('testQuery')).toBe(false);
        expect(ignore('StagingQuery')).toBe(false);
    });

    it('contains glob: *staging*', () => {
        write('*staging*\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('MyStagingQuery')).toBe(true);
        expect(ignore('StagingOnly')).toBe(true);
        expect(ignore('OtherQuery')).toBe(false);
    });

    it('comment lines starting with # are ignored', () => {
        write('# this is a comment\nfn*\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('fnHelper')).toBe(true);
        expect(ignore('# this is a comment')).toBe(false);
    });

    it('blank lines are ignored', () => {
        write('\n\nfn*\n\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('fnHelper')).toBe(true);
        expect(ignore('')).toBe(false);
    });

    it('multiple patterns: any match returns true', () => {
        write('fn*\n*test\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('fnHelper')).toBe(true);
        expect(ignore('StagingTest')).toBe(true);
        expect(ignore('StagingQuery')).toBe(false);
    });

    it('matching is case-insensitive', () => {
        write('fn*\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('FnHelper')).toBe(true);
        expect(ignore('FNHELPER')).toBe(true);
    });

    it('pattern with .pq extension still matches (defensive strip)', () => {
        write('StagingQuery.pq\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('StagingQuery')).toBe(true);
        expect(ignore('OtherQuery')).toBe(false);
    });

    it('literal ? in pattern matches literal ? not optional quantifier', () => {
        write('A?B\n');
        const ignore = loadIgnoreList(tmpDir);
        expect(ignore('A?B')).toBe(true);
        expect(ignore('AB')).toBe(false);
        expect(ignore('B')).toBe(false);
    });

    it('IGNORE_FILE constant is .pqignore', () => {
        expect(IGNORE_FILE).toBe('.pqignore');
    });
});
