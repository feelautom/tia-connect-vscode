# Changelog

All notable changes to the T-IA Connect for VS Code extension will be documented in this file.

## [0.1.0] - 2026-05-04

### Added
- Project Explorer: browse TIA Portal project structure (devices, blocks, folders)
- SCL/STL editing with syntax highlighting and TextMate grammars
- Auto-reimport SCL/STL blocks into TIA Portal on save
- Optional auto-compile after reimport
- SCL code snippets (FB, FC, OB, DB, IF, FOR, CASE, TON, R_TRIG...)
- Compile device or individual block with progress UI
- Compilation diagnostics displayed in the editor
- Export blocks as SimaticML XML
- Source Control (VCS) integration: commit, push, pull, branch, merge, log
- PLC Tests panel in the T-IA Connect sidebar with license and PLCSim checks
- Run individual tests or entire suite with pass/fail results and step-level details
- Cross-references webview panel for any block type (SCL, STL, LAD, FBD, GRAPH)
- CI/CD Pipelines: list, run, create from templates, execution history
- Tag Tables in Project Explorer: browse tag tables and individual tags with type/address display
- UDTs in Project Explorer: browse User-Defined Types under each device
- Device tree now shows 3 sections: Program Blocks, Tag Tables, UDTs
- Status bar with connection state and project name
- API key authentication with interactive prompt

- Keybinding Ctrl+Shift+B to compile device (auto-picks single device or shows QuickPick)
- Project tree auto-refreshes after successful block reimport
- Conflict detection: warns before reimporting if block was modified in TIA Portal
- Custom SVG icons for block types: OB (blue), FB (green), FC (orange), DB (purple)

### Fixed
- PascalCase normalization for license features and PLCSim status types
- PLCSim status endpoint URL (`/api/simulation/status` instead of `/api/plcsim/status`)
- Job polling log no longer shows `undefined` when server message is empty
