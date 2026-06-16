import { run } from '../runner';

jest.mock('child_process');

import { spawnSync } from 'child_process';
const mockSpawn = spawnSync as jest.Mock;

describe('runner.run', () => {
    afterEach(() => jest.clearAllMocks());

    it('returns stdout, stderr, exitCode on success', () => {
        mockSpawn.mockReturnValue({ stdout: 'hello\n', stderr: '', status: 0, error: undefined });
        expect(run('npx', ['tsx', 'foo.ts'], '/cwd')).toEqual({
            stdout: 'hello\n',
            stderr: '',
            exitCode: 0,
        });
    });

    it('throws when spawnSync sets error (e.g. ENOENT)', () => {
        mockSpawn.mockReturnValue({ stdout: '', stderr: '', status: null, error: new Error('spawn ENOENT') });
        expect(() => run('bad-cmd', [], '/cwd')).toThrow('spawn ENOENT');
    });

    it('uses shell: false so args bypass cmd.exe', () => {
        mockSpawn.mockReturnValue({ stdout: '', stderr: '', status: 0, error: undefined });
        run('npx', ['tsx'], '/cwd');
        expect(mockSpawn).toHaveBeenCalledWith('npx', ['tsx'], expect.objectContaining({ shell: false }));
    });

    it('passes args with spaces verbatim without quoting', () => {
        mockSpawn.mockReturnValue({ stdout: '', stderr: '', status: 0, error: undefined });
        run('node', ['C:\\path with spaces\\file.js'], '/cwd');
        expect(mockSpawn).toHaveBeenCalledWith(
            'node',
            ['C:\\path with spaces\\file.js'],
            expect.objectContaining({ shell: false }),
        );
    });

    it('passes cmd.exe metacharacters verbatim, not expanded', () => {
        mockSpawn.mockReturnValue({ stdout: '', stderr: '', status: 0, error: undefined });
        run('node', ['%TEMP%', '^', '&'], '/cwd');
        expect(mockSpawn).toHaveBeenCalledWith(
            'node',
            ['%TEMP%', '^', '&'],
            expect.objectContaining({ shell: false }),
        );
    });

    it('falls back exitCode 1 when status is null and no error', () => {
        mockSpawn.mockReturnValue({ stdout: '', stderr: 'oops', status: null, error: undefined });
        const result = run('npx', [], '/cwd');
        expect(result.exitCode).toBe(1);
    });
});
