import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_VSIX_PATHS = [
    /^extension\/(?:\.codex|\.git|src|test|internal)\//,
    /^extension\/.*\.map$/,
    /^extension\/.*\.vsix$/,
];

const REQUIRED_VSIX_PATHS = [
    'extension/package.json',
    'extension/dist/extension.js',
    'extension/resources/icons/icon.png',
    'extension/resources/icons/tia-portal.svg',
    'extension/l10n/bundle.l10n.fr.json',
];

const APPROVED_ASSET_PATHS = [
    'resources/icons/icon.png',
    'resources/icons/tia-portal.svg',
];

function issue(code, message) {
    return { code, message };
}

export function parseVersion(value) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value ?? '');
    return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b) { throw new Error('Versions must use strict major.minor.patch format.'); }
    for (let index = 0; index < 3; index++) {
        if (a[index] !== b[index]) { return a[index] - b[index]; }
    }
    return 0;
}

export function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function validateReleaseState(state) {
    const problems = [];
    const { plan, packageJson, lockJson, changelog, assetHashes, gitStatus = '', tag } = state;
    const candidate = plan?.candidate ?? {};
    const desktop = candidate.desktop ?? {};
    const website = candidate.website ?? {};

    if (plan?.schemaVersion !== 1) {
        problems.push(issue('plan_schema_invalid', 'release-plan.json must use schemaVersion 1.'));
    }
    if (plan?.releaseStatus !== 'ready') {
        problems.push(issue('release_status_blocked', 'The coordinated release plan is not marked ready.'));
    }
    if (!parseVersion(packageJson?.version)) {
        problems.push(issue('package_version_invalid', 'package.json version must use strict major.minor.patch format.'));
    }
    if (lockJson?.version !== packageJson?.version || lockJson?.packages?.['']?.version !== packageJson?.version) {
        problems.push(issue('lock_version_mismatch', 'package-lock.json root versions must equal package.json.'));
    }
    if (candidate.extensionVersion !== packageJson?.version) {
        problems.push(issue('candidate_version_mismatch', 'Candidate extension version must equal package.json.'));
    }
    try {
        if (parseVersion(packageJson?.version) && compareVersions(packageJson.version, plan?.publishedExtensionVersion) <= 0) {
            problems.push(issue('version_reused', 'Candidate version must be greater than the last published extension version.'));
        }
    } catch {
        problems.push(issue('published_version_invalid', 'Published extension version is invalid.'));
    }
    if (candidate.channel !== 'stable' && candidate.channel !== 'pre-release') {
        problems.push(issue('channel_invalid', 'Candidate channel must be stable or pre-release.'));
    }
    if (parseVersion(packageJson?.version)) {
        const escaped = packageJson.version.replaceAll('.', '\\.');
        if (!new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm').test(changelog ?? '')) {
            problems.push(issue('changelog_missing', 'CHANGELOG.md needs a dated section for the exact candidate version.'));
        }
    }
    if (tag !== undefined && tag !== `v${packageJson?.version}`) {
        problems.push(issue('tag_version_mismatch', 'Git tag must equal v followed by the exact package version.'));
    }
    if (desktop.status !== 'ready') {
        problems.push(issue('desktop_not_ready', 'Desktop release is not marked ready.'));
    }
    if (!parseVersion(desktop.requiredVersion) || desktop.requiredVersion !== desktop.validatedVersion) {
        problems.push(issue('desktop_version_unvalidated', 'Desktop required and validated versions must be the same strict version.'));
    }
    if (!/^[0-9a-f]{40}$/.test(desktop.sourceCommit ?? '')) {
        problems.push(issue('desktop_commit_missing', 'Desktop source commit must be a full lowercase Git SHA.'));
    }
    if (desktop.securityContract !== 'desktop-websetup-v2') {
        problems.push(issue('desktop_security_contract_missing', 'Desktop coordination must use the public desktop-websetup-v2 contract.'));
    }
    if (website.status !== 'ready') {
        problems.push(issue('website_not_ready', 'Website/WebSetup release is not marked ready.'));
    }
    if (!/^[0-9a-f]{40}$/.test(website.sourceCommit ?? '')) {
        problems.push(issue('website_commit_missing', 'Website source commit must be a full lowercase Git SHA.'));
    }
    if (website.protocol !== 'websetup-v2') {
        problems.push(issue('website_protocol_invalid', 'Website protocol must remain websetup-v2.'));
    }
    if (!Array.isArray(candidate.blockingConditions) || candidate.blockingConditions.length > 0) {
        problems.push(issue('blocking_conditions_active', 'The coordinated release plan still contains blocking conditions.'));
    }
    if (gitStatus.trim() !== '') {
        problems.push(issue('worktree_dirty', 'Release validation requires a clean main worktree.'));
    }
    const configuredAssetPaths = Object.keys(plan?.assets ?? {});
    if (configuredAssetPaths.length !== APPROVED_ASSET_PATHS.length
        || APPROVED_ASSET_PATHS.some(assetPath => !Object.hasOwn(plan?.assets ?? {}, assetPath))) {
        problems.push(issue('asset_manifest_invalid', 'The release plan must pin exactly the approved Marketplace and Activity Bar assets.'));
    }
    for (const assetPath of APPROVED_ASSET_PATHS) {
        const expectedHash = plan?.assets?.[assetPath];
        const actualHash = assetHashes?.[assetPath];
        if (!/^[0-9a-f]{64}$/.test(expectedHash) || actualHash !== expectedHash) {
            problems.push(issue('asset_hash_mismatch', `${assetPath} does not match its approved SHA-256.`));
        }
    }
    if (plan?.marketplace?.currentPublicationMode !== 'manual') {
        problems.push(issue('marketplace_publication_mode_invalid', 'Marketplace publication must remain a separate manual approval step.'));
    }
    if (plan?.marketplace?.recommendedAuthentication !== 'microsoft-entra-workload-identity-federation') {
        problems.push(issue('marketplace_auth_invalid', 'Marketplace automation must use the approved federated identity method.'));
    }

    return problems;
}

export function readZipEntries(buffer) {
    const minimumEocdSize = 22;
    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocd = -1;
    for (let offset = buffer.length - minimumEocdSize; offset >= searchStart; offset--) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) { throw new Error('VSIX end-of-central-directory record not found.'); }

    const entryCount = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    const entries = new Map();
    for (let index = 0; index < entryCount; index++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) { throw new Error('Invalid VSIX central directory.'); }
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replaceAll('\\', '/');
        entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

export function extractZipEntry(buffer, entry) {
    const offset = entry.localOffset;
    if (buffer.readUInt32LE(offset) !== 0x04034b50) { throw new Error('Invalid VSIX local header.'); }
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);
    const content = entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed) : null;
    if (!content || content.length !== entry.uncompressedSize) { throw new Error('Unsupported or invalid VSIX entry.'); }
    return content;
}

export function validateVsix(buffer, expectedVersion, approvedAssets) {
    const problems = [];
    let entries;
    try {
        entries = readZipEntries(buffer);
    } catch (error) {
        return [issue('vsix_invalid', error instanceof Error ? error.message : 'Invalid VSIX.')];
    }
    for (const required of REQUIRED_VSIX_PATHS) {
        if (!entries.has(required)) { problems.push(issue('vsix_required_file_missing', `${required} is missing from the VSIX.`)); }
    }
    for (const name of entries.keys()) {
        if (FORBIDDEN_VSIX_PATHS.some(pattern => pattern.test(name))) {
            problems.push(issue('vsix_internal_file', `${name} must not be included in the VSIX.`));
        }
    }
    const packageEntry = entries.get('extension/package.json');
    if (packageEntry) {
        try {
            const manifest = JSON.parse(extractZipEntry(buffer, packageEntry).toString('utf8'));
            if (manifest.version !== expectedVersion) {
                problems.push(issue('vsix_version_mismatch', 'Embedded package.json version does not match the candidate.'));
            }
        } catch {
            problems.push(issue('vsix_package_invalid', 'Embedded package.json is invalid.'));
        }
    }
    for (const [sourcePath, expectedHash] of Object.entries(approvedAssets ?? {})) {
        const entry = entries.get(`extension/${sourcePath}`);
        if (entry && sha256(extractZipEntry(buffer, entry)) !== expectedHash) {
            problems.push(issue('vsix_asset_hash_mismatch', `${sourcePath} hash changed inside the VSIX.`));
        }
    }
    return problems;
}

export function collectRepositoryState(root, options = {}) {
    const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    const plan = readJson('release/release-plan.json');
    const assetHashes = Object.fromEntries(APPROVED_ASSET_PATHS.map(relativePath => [
        relativePath,
        sha256(fs.readFileSync(path.join(root, relativePath))),
    ]));
    const git = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    if (git.status !== 0) { throw new Error('Unable to inspect Git worktree state.'); }
    return {
        plan,
        packageJson: readJson('package.json'),
        lockJson: readJson('package-lock.json'),
        changelog: fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'),
        assetHashes,
        gitStatus: git.stdout,
        tag: options.tag,
    };
}

export function parseArguments(argv) {
    const result = { allowNoGo: false };
    const nextValue = (flag, index) => {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) { throw new Error(`${flag} requires a value.`); }
        return value;
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--allow-no-go') { result.allowNoGo = true; }
        else if (arg === '--tag') { result.tag = nextValue(arg, index++); }
        else if (arg === '--vsix') { result.vsix = nextValue(arg, index++); }
        else if (arg === '--sha-output') { result.shaOutput = nextValue(arg, index++); }
        else { throw new Error(`Unknown argument: ${arg}`); }
    }
    return result;
}

export function resolveInsideRoot(root, requestedPath) {
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(resolvedRoot, requestedPath);
    const relativePath = path.relative(resolvedRoot, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Release artifact paths must stay inside the repository root.');
    }
    return resolvedPath;
}

export function runCli(argv, root = process.cwd()) {
    const options = parseArguments(argv);
    const state = collectRepositoryState(root, options);
    const problems = validateReleaseState(state);
    let vsixBuffer;
    if (options.vsix) {
        const vsixPath = resolveInsideRoot(root, options.vsix);
        const expectedName = `tia-connect-vscode-${state.packageJson.version}.vsix`;
        if (path.basename(vsixPath) !== expectedName) {
            problems.push(issue('vsix_filename_mismatch', `VSIX filename must be ${expectedName}.`));
        } else {
            vsixBuffer = fs.readFileSync(vsixPath);
            problems.push(...validateVsix(vsixBuffer, state.packageJson.version, state.plan.assets));
        }
    }
    if (options.shaOutput && !options.vsix) {
        problems.push(issue('checksum_source_missing', '--sha-output requires an inspected --vsix artifact.'));
    }
    if (options.shaOutput && vsixBuffer && problems.length === 0) {
        const line = `${sha256(vsixBuffer)}  ${path.basename(options.vsix)}\n`;
        fs.writeFileSync(resolveInsideRoot(root, options.shaOutput), line, { encoding: 'utf8', flag: 'wx' });
    }

    if (problems.length === 0) {
        process.stdout.write(`GO: extension ${state.packageJson.version}, Desktop ${state.plan.candidate.desktop.validatedVersion}, Website ${state.plan.candidate.website.sourceCommit}.\n`);
        return 0;
    }
    process.stdout.write('NO-GO: coordinated release validation failed.\n');
    for (const problem of problems) { process.stdout.write(`- ${problem.code}: ${problem.message}\n`); }
    return options.allowNoGo ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        process.exitCode = runCli(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`Release validation error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 2;
    }
}
