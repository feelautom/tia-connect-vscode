# Release runbook

This checklist is blocking. A green build or a private release candidate does not authorize publication.

## Sources of truth

- `package.json` and `package-lock.json` define the extension version.
- `CHANGELOG.md` must contain the exact version and release date.
- `release/release-plan.json` records the coordinated Extension, Desktop, and Website candidate.
- `desktop-websetup-v2` is the public Desktop/WebSetup v2 coordination contract.
- BugTrace records the remaining blockers and validation evidence.

The plan remains `blocked` until the Desktop and WebSetup v2 implementations are integrated and validated. Any currently installed Desktop is only a local test baseline, not the future coordinated candidate.

## Local and release-candidate validation

Never reuse a published version. Before creating a release candidate, choose a newer version and update `package.json`, `package-lock.json`, `CHANGELOG.md`, and `candidate.extensionVersion` in the release plan.

```powershell
npm run release:dry-run
npm run release:validate
```

The dry run reports every NO-GO condition but exits successfully so the gate can be inspected before the other products are ready. The strict validation exits with an error while any blocker remains.

## Coordinated candidate gate

Publication requires all of the following:

- the extension candidate version is exact, strictly newer than the published version, and matches the package, lockfile, changelog, and tag;
- Desktop status is `ready`, its required and validated versions match exactly, its source commit is recorded, and `securityContract` is exactly `desktop-websetup-v2`;
- Website status is `ready`, its source commit is recorded, and its protocol is exactly `websetup-v2`;
- the blocking ticket list is empty only after the supporting evidence has been recorded;
- validation and packaging run from a clean main worktree;
- the PNG and SVG Marketplace icons match their approved SHA-256 pins.

## GitHub Actions behavior

A manual `workflow_dispatch` validates, tests, builds, packages, inspects, and checksums a candidate, then stores it as a private workflow artifact. It does not create a GitHub Release and does not publish to the Marketplace.

The workflow also proves that the candidate commit belongs to `origin/main`, and its external actions are pinned to full commit SHAs. An exact `v<package-version>` tag runs the same gates and can create a GitHub Release containing the inspected VSIX and its SHA-256 file. The VSIX inspection rejects repository internals, source files, tests, maps, release metadata, scripts, and nested VSIX files.

## Marketplace publication

Marketplace publication is a separate operation requiring explicit approval after the coordinated gate is green. The GitHub workflow intentionally does not perform it.

The target design is a protected Azure Pipeline environment using Microsoft Entra workload identity federation or a managed identity with `vsce publish --azure-credential`. Do not store a Marketplace PAT in this repository, an artifact, or logs.

After an authorized publication, verify the Marketplace listing, CDN artifact, checksum, and installation path. Then update `publishedExtensionVersion`; a published version is never reused.
