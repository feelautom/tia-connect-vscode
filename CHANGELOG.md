# Changelog

All notable changes to the T-IA Connect for VS Code extension will be documented in this file.

## [0.4.27] - 2026-05-06

### Added
- **GitHub Copilot Chat `@tia` participant**: type `@tia` in GitHub Copilot Chat to interact with your TIA Portal project using natural language. The participant auto-injects project context and uses the registered tools to answer queries and perform actions.
- **30 Language Model Tools**: registered via VS Code Language Model Tools API (`vscode.lm.registerTool`), usable by GitHub Copilot Chat and any VS Code chat participant. Tools cover:
  - **Project** (3): `tia_get_project_overview`, `tia_list_devices`, `tia_save_project`
  - **Blocks** (7): `tia_list_blocks`, `tia_get_block_content`, `tia_get_block_source`, `tia_create_block`, `tia_import_scl`, `tia_export_block`, `tia_delete_block`
  - **Compilation** (2): `tia_compile_device`, `tia_compile_block`
  - **Tags** (3): `tia_list_tag_tables`, `tia_list_tags`, `tia_create_tag`
  - **UDTs** (1): `tia_list_udts`
  - **Cross-references** (1): `tia_get_cross_references`
  - **Online/Download** (3): `tia_download_to_plc`, `tia_go_online`, `tia_go_offline`
  - **PLCSim** (3): `tia_plcsim_status`, `tia_plcsim_read_tag`, `tia_plcsim_write_tag`
  - **Tests** (1): `tia_run_tests`
  - **VCS** (3): `tia_vcs_status`, `tia_vcs_commit`, `tia_vcs_diff`
  - **Pipelines** (2): `tia_pipeline_list`, `tia_pipeline_run`
  - **Hardware** (2): `tia_search_catalog`, `tia_add_device`
- **AI license check**: the `@tia` participant and all 30 LM Tools verify the AI license feature before execution. Prevents wasting GitHub Copilot tokens on calls that would be rejected by the server. Cache with 5-minute TTL.
- **Agentic tool loop**: the `@tia` participant handles multi-turn tool calls — invokes tools, feeds results back to the model, up to 10 turns per interaction.

### Fixed
- `@tia` participant now properly executes tools (was only streaming text without handling `LanguageModelToolCallPart`)
- Use `LanguageModelChatMessage.Assistant(toolCalls)` / `.User(toolResults)` constructors instead of deprecated `content2` property

## [0.4.0] - 2026-05-06

### Added
- **OAuth Authentication**: login/register via browser (t-ia-connect.com), JWT stored in OS keyring (SecretStorage). Silent background polling for token retrieval. Session validation on startup (fast: trust stored token, validate async).
- **Welcome Views**: multi-state sidebar — not authenticated, server not installed, server not running, connected. Context keys drive conditional UI.
- **Server Detection**: auto-detect T-IA Connect installation (exe path + running status) on startup and after auth.
- **Auto API Key**: automatically fetches the local server API key via `GET /api/auth/local-key` (DPAPI-encrypted). No manual copy-paste needed.
- **Project Dashboard**: webview panel showing project stats (devices, blocks, tags), device table with details. Opens automatically on project load, re-openable via tree click.
- **Block Preloading**: SCL/STL blocks are preloaded in background after project load. Cache-first opening (10min TTL) — blocks open near-instantly.
- **Browse Project Files**: file dialog with default folder (`Documents/Automation`), supports .ap17-21 and .zap17-21 (archives).
- **Archive Support**: .zap files prompt for extraction folder, use `retrieveProject` API.
- **Smart Logging**: "not connected" / "not available" messages logged as INFO instead of ERROR when no project is open.
- **Tree State Management**: tree view properly clears on disconnect/stop server, re-populates on connect.

### Changed
- Disconnect menu now properly resets tree view state (`setConnected(false)`)
- API client distinguishes expected "not ready" responses from real errors in logs
- Phase 5 auth does NOT overwrite local API key with cloud profile token

## [0.3.0] - 2026-05-05

### Added
- **Server Launch from VS Code**: when the server is not running, the sidebar offers "Launch Headless" or "Launch with GUI" buttons. Auto-connects after server starts. Loading spinner in sidebar shows real-time progress.
- **Stop Server**: Disconnect menu now offers "Disconnect" (keep server) or "Stop Server" (shut down remotely)
- **Create Block**: right-click a device to create a new block (FB, FC, OB, DB) in any language (SCL, STL, LAD, FBD, GRAPH). SCL/STL use code templates, LAD/FBD/GRAPH use XML generation.
- **LAD/FBD/GRAPH Webview**: graphical SVG rendering of LADDER networks — contacts, coils, boxes (TON, CTU, MOVE, CMP...), wires, parallel branches, interface table
- **Hover documentation fallback**: unknown symbols query the T-IA Connect documentation API, results cached
- **System function blocks**: autocompletion and hover docs for TON, TOF, TP, R_TRIG, F_TRIG, CTU, CTD, CTUD, MOVE, NORM_X, SCALE_X, SEL, MUX with pin tables and code examples
- **Loading spinner**: sidebar shows animated loading spinner for all operations (server launch, project open, block load, compile, export, import, cross-references)
- **Localisation (i18n)**: full French translation — `package.nls.fr.json` for UI and `l10n/bundle.l10n.fr.json` for runtime messages. All user-facing strings are translatable.
- Configurable server executable path (`tiaConnect.executablePath`)
- SignalR connected early in connect() flow (fixes polling fallback during Switch Project)

### Changed
- Requires T-IA Connect server v2.1.620+ (new endpoint: `POST /api/health/shutdown`)
- LicenseGate logs reduced to verbose-only (removes 20+ lines at startup)

## [0.2.2] - 2026-05-05

### Added
- **Multi-project**: switch between TIA Portal projects from VS Code via `T-IA Connect: Switch Project` command. Shows recent projects (history) and available project files. Closes current project, opens selected one, refreshes everything automatically.
- **Switch Project button** in the Project Explorer title bar (folder icon)
- **SCL Signature Help**: shows function parameters when typing `(` — covers all 30+ built-in functions (math, string, conversion, bit operations)
- **SCL Rename Symbol** (F2): rename a local variable across the entire file, handles `#prefix` references
- **SCL Diagnostics**: lightweight syntax checking — detects unclosed VAR sections, missing END_IF/END_FOR/END_WHILE/END_CASE/END_REPEAT, unmatched parentheses, missing block END
- **Cross-file Go-to-Definition**: Ctrl+click on a quoted block name (`"FB_Motor"`) opens that block via the T-IA Connect API

## [0.2.1] - 2026-05-05

### Added
- **SignalR push notifications**: real-time job status updates via SignalR instead of HTTP polling. Automatic fallback to polling if SignalR is unavailable.
- **Test result webview**: detailed test results panel with pass/fail badges, step cards, assertions table, duration, and timestamps. Opens automatically after test execution, re-openable by clicking on a completed test.
- **Auto-export VCS**: automatic silent export every minute + on connect, keeps the Source Control panel up to date without manual action
- **VCS license check**: Source Control panel verifies `hasVcs` license feature (shows lock icon if not licensed)

### Changed
- Job monitoring now uses SignalR (push) with HTTP polling fallback — faster response, less network traffic
- Test failures now show explicit error messages (PLCSim not running, no instance, etc.)

## [0.2.0] - 2026-05-05

### Added
- **Source Control panel**: dedicated tree view in the T-IA Connect sidebar (replaces the native SCM panel)
- **Export Preview**: export project state without committing to detect changes first
- **Diff viewer**: click any changed file to open a read-only side-by-side diff (XML blocks, tags, UDTs, hardware)
- Handles Added (view content), Modified (side-by-side diff), and Removed (view previous content) files
- Title bar actions: Export Preview (eye), Commit (checkmark), Refresh (arrows)

### Changed
- Source Control now uses a custom tree view instead of VS Code's native SCM panel
- Requires T-IA Connect server v2.1.617+ (new endpoints: `export-preview`, `file-content`)

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
