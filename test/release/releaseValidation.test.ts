import { describe, expect, it } from 'vitest';
// The release validator is an executable ESM module shared with GitHub Actions.
// @ts-expect-error JavaScript release tooling intentionally has no declaration file.
import {
    compareVersions,
    parseArguments,
    parseVersion,
    resolveInsideRoot,
    validateReleaseState,
    validateVsix,
} from '../../scripts/release/validate-release.mjs';

function readyState(): any {
    return {
        plan: {
            schemaVersion: 1,
            releaseStatus: 'ready',
            publishedExtensionVersion: '1.0.3',
            candidate: {
                extensionVersion: '1.0.4',
                channel: 'stable',
                desktop: {
                    status: 'ready',
                    requiredVersion: '2.3.0',
                    validatedVersion: '2.3.0',
                    sourceCommit: 'a'.repeat(40),
                    securityContract: 'desktop-websetup-v2',
                },
                website: {
                    status: 'ready',
                    sourceCommit: 'b'.repeat(40),
                    protocol: 'websetup-v2',
                },
                blockingConditions: [],
            },
            assets: {
                'resources/icons/icon.png': 'c'.repeat(64),
                'resources/icons/tia-portal.svg': 'd'.repeat(64),
            },
            marketplace: {
                currentPublicationMode: 'manual',
                recommendedAuthentication: 'microsoft-entra-workload-identity-federation',
            },
        },
        packageJson: { version: '1.0.4' },
        lockJson: { version: '1.0.4', packages: { '': { version: '1.0.4' } } },
        changelog: '## [1.0.4] - 2026-07-20\n',
        assetHashes: {
            'resources/icons/icon.png': 'c'.repeat(64),
            'resources/icons/tia-portal.svg': 'd'.repeat(64),
        },
        gitStatus: '',
        tag: 'v1.0.4',
    };
}

describe('release validation', () => {
    it('compares strict release versions without accepting ambiguous forms', () => {
        expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
        expect(parseVersion('01.2.3')).toBeNull();
        expect(parseVersion('1.2.3-beta')).toBeNull();
        expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    });

    it('accepts a fully coordinated Extension, Desktop and Website release plan', () => {
        expect(validateReleaseState(readyState())).toEqual([]);
    });

    it('blocks version reuse and an unvalidated Desktop release', () => {
        const state = readyState();
        state.plan.publishedExtensionVersion = '1.0.4';
        state.plan.candidate.desktop.status = 'blocked';
        state.plan.candidate.desktop.validatedVersion = '2.2.0';

        expect(validateReleaseState(state).map((problem: any) => problem.code)).toEqual(expect.arrayContaining([
            'version_reused',
            'desktop_not_ready',
            'desktop_version_unvalidated',
        ]));
    });

    it('blocks dirty worktrees, active blockers and modified approved assets', () => {
        const state = readyState();
        state.gitStatus = ' M package.json\n';
        state.plan.candidate.blockingConditions = ['end-to-end-validation-complete'];
        state.assetHashes['resources/icons/icon.png'] = 'e'.repeat(64);

        expect(validateReleaseState(state).map((problem: any) => problem.code)).toEqual(expect.arrayContaining([
            'worktree_dirty',
            'blocking_conditions_active',
            'asset_hash_mismatch',
        ]));
    });

    it('rejects malformed VSIX input instead of attempting extraction', () => {
        expect(validateVsix(Buffer.from('not a zip'), '1.0.4', []).map((problem: any) => problem.code)).toEqual([
            'vsix_invalid',
        ]);
    });

    it('rejects missing argument values instead of silently bypassing a gate', () => {
        expect(() => parseArguments(['--tag'])).toThrow('--tag requires a value.');
        expect(() => parseArguments(['--vsix', '--sha-output', 'SHA256SUMS.txt'])).toThrow('--vsix requires a value.');
        expect(() => parseArguments(['--skip-clean'])).toThrow('Unknown argument: --skip-clean');
    });

    it('keeps release artifact reads and writes inside the repository root', () => {
        const root = process.cwd();
        expect(resolveInsideRoot(root, 'artifacts/candidate.vsix')).toContain('artifacts');
        expect(() => resolveInsideRoot(root, '../outside.txt')).toThrow('must stay inside the repository root');
    });
});
