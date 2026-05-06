import { describe, it, expect } from 'vitest';

// Test the generated content templates (pure functions, no vscode dependency)

describe('workspace scaffolding content', () => {
    const TIA_GITIGNORE = `# TIA Portal project files (binary, not for VCS)
*.ap*
*.zap*
*.tiap
*.tmp
*.bak

# TIA Portal temp folders
/UserFiles/
/System/
/AdditionalFiles/

# VS Code extension temp
.tia-temp/

# OS
Thumbs.db
Desktop.ini
.DS_Store
`;

    it('gitignore contains TIA patterns', () => {
        expect(TIA_GITIGNORE).toContain('*.ap*');
        expect(TIA_GITIGNORE).toContain('*.zap*');
        expect(TIA_GITIGNORE).toContain('.tia-temp/');
    });

    it('gitignore excludes OS junk', () => {
        expect(TIA_GITIGNORE).toContain('Thumbs.db');
        expect(TIA_GITIGNORE).toContain('.DS_Store');
    });
});
