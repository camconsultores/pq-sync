import * as fs from 'fs';
import * as path from 'path';

export const IGNORE_FILE = '.pqignore';

function patternToRegex(pattern: string): RegExp {
    // Strip accidental .pq extension so users can write either form
    const normalized = pattern.endsWith('.pq') ? pattern.slice(0, -3) : pattern;
    // Escape all regex metacharacters except *, then replace * with .*
    const escaped = normalized.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
    return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$', 'i');
}

export function loadIgnoreList(mcodeRoot: string): (name: string) => boolean {
    const ignorePath = path.join(mcodeRoot, IGNORE_FILE);
    if (!fs.existsSync(ignorePath)) return () => false;

    const patterns = fs.readFileSync(ignorePath, 'utf8')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('#'))
        .map(patternToRegex);

    if (patterns.length === 0) return () => false;
    return (name: string) => patterns.some(re => re.test(name));
}
