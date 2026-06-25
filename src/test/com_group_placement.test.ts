import * as path from 'path';
import { resolveOutputPath } from '../../scripts/extract_mcode';

const ROOT = 'C:\\mcode';

const GROUPS: Record<string, any> = {
    'group-shared': { name: 'Shared', parentId: null },
    'group-params': { name: 'Params', parentId: 'group-shared' },
};

const QUERY_TO_GROUP: Record<string, string> = {
    ParamShopName: 'group-params',
    SharedHelper: 'group-shared',
};

describe('resolveOutputPath', () => {
    it('existing query: preserves its current path regardless of group', () => {
        const nameToPath = new Map([['ParamShopName', path.join(ROOT, 'Shared', 'Params', 'ParamShopName.pq')]]);
        const result = resolveOutputPath('ParamShopName', ROOT, nameToPath, QUERY_TO_GROUP, GROUPS);
        expect(result).toBe(path.join(ROOT, 'Shared', 'Params', 'ParamShopName.pq'));
    });

    it('new query with nested group: places in correct subfolder', () => {
        const result = resolveOutputPath('ParamShopName', ROOT, new Map(), QUERY_TO_GROUP, GROUPS);
        expect(result).toBe(path.resolve(ROOT, 'Shared', 'Params', 'ParamShopName.pq'));
    });

    it('new query with top-level group: places in group subfolder', () => {
        const result = resolveOutputPath('SharedHelper', ROOT, new Map(), QUERY_TO_GROUP, GROUPS);
        expect(result).toBe(path.resolve(ROOT, 'Shared', 'SharedHelper.pq'));
    });

    it('new query with no group assignment: falls back to mcode root', () => {
        const result = resolveOutputPath('UnknownQuery', ROOT, new Map(), QUERY_TO_GROUP, GROUPS);
        expect(result).toBe(path.resolve(ROOT, 'UnknownQuery.pq'));
    });

    it('xlsx unreadable fallback: empty queryToGroup/queryGroups → root', () => {
        const result = resolveOutputPath('NewQuery', ROOT, new Map(), {}, {});
        expect(result).toBe(path.resolve(ROOT, 'NewQuery.pq'));
    });

    it('query name with chars illegal on Windows: cleaned in filename', () => {
        const nameToPath = new Map<string, string>();
        const result = resolveOutputPath('My:Query', ROOT, nameToPath, {}, {});
        expect(result).toBe(path.resolve(ROOT, 'My_Query.pq'));
    });
});
