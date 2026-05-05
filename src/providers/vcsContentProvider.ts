import * as vscode from 'vscode';
import { vcsGetFileContent } from '../api/sourceControl';

export const VCS_SCHEME = 'tia-vcs';

/**
 * Provides file content from the VCS repository at a given commit.
 * URI format: tia-vcs:/commit/{sha}/{filePath}
 */
export class VcsContentProvider implements vscode.TextDocumentContentProvider {
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // URI path: /commit/{sha}/{filePath...}
        const path = uri.path; // e.g. /commit/HEAD/blocks/PLC_1/FB_Motor.xml
        const match = path.match(/^\/commit\/([^/]+)\/(.+)$/);
        if (!match) {
            return `// Invalid VCS URI: ${uri.toString()}`;
        }

        const [, commitSha, filePath] = match;
        const content = await vcsGetFileContent(commitSha, filePath);
        return content ?? '';
    }

    static toUri(commitSha: string, filePath: string): vscode.Uri {
        return vscode.Uri.parse(`${VCS_SCHEME}:/commit/${encodeURIComponent(commitSha)}/${filePath}`);
    }
}
