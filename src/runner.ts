import { spawnSync } from 'child_process';

export interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export function run(command: string, args: string[], cwd: string): RunResult {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        cwd,
        shell: false,
    });
    if (result.error) {
        throw result.error;
    }
    return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.status ?? 1,
    };
}
