import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config';
import { run } from '../runner';
import { PqSyncStatusBar } from '../statusBar';
import { workspaceRoot, lastLine, getScriptInvocation } from './_shared';

export async function pullFromFolderCommand(
    uri: vscode.Uri,
    output: vscode.OutputChannel,
    statusBar: PqSyncStatusBar,
): Promise<void> {
    const config = readConfig();
    if (!config) {
        vscode.window.showErrorMessage('pq-sync: No config found. Run pq-sync: Configure first.');
        return;
    }

    const rel = path.relative(config.mcodePath, uri.fsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        vscode.window.showErrorMessage('pq-sync: Selected folder is not inside the configured mcode folder.');
        return;
    }

    statusBar.setState('syncing');
    output.show();
    output.appendLine(`[pq-sync] Pull started — ${new Date().toLocaleTimeString()}`);

    let result;
    try {
        const script = getScriptInvocation('extract_mcode.ts');
        const groupArgs = rel ? ['--group', rel] : [];
        result = run(script.command, [...script.args, config.workbookPath, config.mcodePath, ...groupArgs], workspaceRoot());
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        statusBar.setState('error');
        output.appendLine(`[pq-sync] ERROR: ${msg}`);
        vscode.window.showErrorMessage(`pq-sync Pull failed: ${msg}`);
        return;
    }

    if (result.stdout) output.appendLine(result.stdout.trimEnd());
    if (result.stderr) output.appendLine(result.stderr.trimEnd());

    if (result.exitCode === 0) {
        statusBar.setState('success');
        vscode.window.showInformationMessage(`pq-sync: ${lastLine(result.stdout) || 'Pull complete'}`);
    } else {
        statusBar.setState('error');
        vscode.window.showErrorMessage(`pq-sync Pull failed: ${lastLine(result.stderr) || 'non-zero exit'}`);
    }
}
