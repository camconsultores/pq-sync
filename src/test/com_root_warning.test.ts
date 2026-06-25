import { buildUngroupedRootWarning } from '../../scripts/extract_mcode';

describe('buildUngroupedRootWarning', () => {
    it('returns null when no queries placed at root', () => {
        expect(buildUngroupedRootWarning(0)).toBeNull();
    });

    it('returns singular warning for exactly 1 query', () => {
        const msg = buildUngroupedRootWarning(1);
        expect(msg).toMatch(/^⚠ 1 query placed at mcode root/);
        expect(msg).toContain('save the workbook before pulling');
    });

    it('returns plural warning for 2+ queries', () => {
        const msg = buildUngroupedRootWarning(2);
        expect(msg).toMatch(/^⚠ 2 queries placed at mcode root/);
    });

    it('count matches the number of affected queries', () => {
        expect(buildUngroupedRootWarning(5)).toMatch(/^⚠ 5 queries placed at mcode root/);
    });

    it('COM route with all queries having disk group metadata: no warning (count=0)', () => {
        // When all queries are grouped on disk, rootUngroupedCount stays 0
        expect(buildUngroupedRootWarning(0)).toBeNull();
    });

    it('COM route with one ungrouped-by-missing-metadata query: warning emitted', () => {
        // When one query lands at root due to absent disk metadata
        const msg = buildUngroupedRootWarning(1);
        expect(msg).not.toBeNull();
        expect(msg).toContain('1 query');
    });
});
