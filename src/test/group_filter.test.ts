import * as path from 'path';
import { matchesGroupFilter } from '../../scripts/extract_mcode';

describe('matchesGroupFilter', () => {
    it('no filter: includes all groups', () => {
        expect(matchesGroupFilter('Shared', '')).toBe(true);
        expect(matchesGroupFilter('', '')).toBe(true);
        expect(matchesGroupFilter(path.join('Shared', 'Params'), '')).toBe(true);
    });

    it('exact match: includes query at that group', () => {
        expect(matchesGroupFilter('Shared', 'Shared')).toBe(true);
    });

    it('direct child: includes nested group', () => {
        expect(matchesGroupFilter(path.join('Shared', 'Params'), 'Shared')).toBe(true);
    });

    it('deeper descendant: includes multi-level nesting', () => {
        expect(matchesGroupFilter(path.join('Shared', 'Shopify', 'Sub'), 'Shared')).toBe(true);
    });

    it('sibling group: excluded', () => {
        expect(matchesGroupFilter('Other', 'Shared')).toBe(false);
    });

    it('path-boundary: SharedOther does not match Shared filter', () => {
        expect(matchesGroupFilter('SharedOther', 'Shared')).toBe(false);
    });

    it('path-boundary: SharedOther/Sub does not match Shared filter', () => {
        expect(matchesGroupFilter(path.join('SharedOther', 'Sub'), 'Shared')).toBe(false);
    });

    it('root query (no group) excluded by non-empty filter', () => {
        expect(matchesGroupFilter('', 'Shared')).toBe(false);
    });

    it('nested filter: Shared/Params includes its descendants', () => {
        const filter = path.join('Shared', 'Params');
        expect(matchesGroupFilter(path.join('Shared', 'Params'), filter)).toBe(true);
        expect(matchesGroupFilter(path.join('Shared', 'Params', 'Sub'), filter)).toBe(true);
    });

    it('nested filter: Shared/Params excludes Shared/Shopify', () => {
        const filter = path.join('Shared', 'Params');
        expect(matchesGroupFilter(path.join('Shared', 'Shopify'), filter)).toBe(false);
        expect(matchesGroupFilter('Shared', filter)).toBe(false);
    });
});
