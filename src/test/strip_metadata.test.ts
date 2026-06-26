import { stripMetadata } from '../../scripts/extract_mcode';

const BODY = 'let\n    Source = 1\nin\n    Source';

describe('stripMetadata — trailing [Query=...] annotation', () => {
    it('no annotation: formula unchanged', () => {
        expect(stripMetadata(BODY)).toBe(BODY);
    });

    it('strips [Query="Name"] appended without semicolon', () => {
        expect(stripMetadata(`${BODY}\n[Query="MyQuery"]`)).toBe(BODY);
    });

    it('strips [Query="Name"] with extra whitespace', () => {
        expect(stripMetadata(`${BODY}  [Query="MyQuery"]  `)).toBe(BODY);
    });

    it('rename: OldName and NewName annotations both strip to same body', () => {
        const old = stripMetadata(`${BODY}\n[Query="OldName"]`);
        const new_ = stripMetadata(`${BODY}\n[Query="NewName"]`);
        expect(old).toBe(new_);
        expect(old).toBe(BODY);
    });

    it('strips multiple trailing annotation blocks', () => {
        expect(stripMetadata(`${BODY}\n[Query="A"]\n[Type=1]`)).toBe(BODY);
    });

    it('semicolon-prefixed annotation: still stripped', () => {
        expect(stripMetadata(`${BODY}; [Query="MyQuery"]`)).toBe(BODY);
    });

    it('record literal result without Query key: stripped (accepted trade-off)', () => {
        const withRecord = 'let Source = 1 in [A=Source]';
        // [A=Source] is the result, not metadata — but our regex strips any trailing [...]
        // This is an accepted trade-off: record-literal results are uncommon and comparison
        // is still consistent (both old and new formula strip identically).
        expect(stripMetadata(withRecord)).toBe('let Source = 1 in');
    });
});
