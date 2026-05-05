# T-IA Connect for VS Code

Explore, edit, and compile Siemens TIA Portal projects directly from VS Code, Cursor, or Windsurf.

This extension connects to a running [T-IA Connect](https://t-ia-connect.com) server and provides a full development workflow for PLC programming — without leaving your editor.

![SCL Editing](https://img.shields.io/badge/SCL-Syntax_Highlighting-blue)
![STL Editing](https://img.shields.io/badge/STL-Syntax_Highlighting-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

### Project Explorer

Browse your TIA Portal project structure directly in VS Code: devices, program blocks, data blocks, UDTs — all in a familiar tree view.

- Lazy-loaded device and block tree
- Block type icons (OB, FB, FC, DB)
- Language and consistency indicators
- Folder structure preserved

### SCL / STL Editing

Double-click any SCL or STL block to open it in VS Code with full syntax highlighting. Edit the code, press **Ctrl+S**, and it's automatically reimported into TIA Portal.

- **SCL** syntax highlighting with TextMate grammar
- **STL** syntax highlighting with TextMate grammar
- **Autocompletion** for keywords, types, variables, and built-in functions
- **Signature Help** — parameter hints for 30+ SCL functions (math, string, conversion)
- **Hover documentation** — type info for variables, docs for keywords/functions
- **Go-to-Definition** — Ctrl+click on variables (local) or block names (cross-file via API)
- **Rename Symbol** (F2) — rename variables across the file
- **SCL Diagnostics** — detects unclosed sections, missing END_ keywords, unmatched parentheses
- **Document Outline** — hierarchical view of blocks, sections, and variables
- Reimport on **manual save only** (Ctrl+S) — VS Code auto-save is ignored
- Safety auto-save timer (configurable: 5/10/15 minutes, saves to disk without reimporting)
- Optional auto-compile after reimport
- 15 SCL snippets (FB, FC, OB, DB, IF, FOR, CASE, TON, R_TRIG...)
- Compilation diagnostics in the editor (errors and warnings from TIA Portal)
- **LAD/FBD/GRAPH Webview** — graphical SVG rendering of LADDER networks (contacts, coils, boxes, wires, parallel branches) in a read-only webview panel

### Create Blocks

Create new blocks directly from VS Code — right-click any device in the Project Explorer and select **Create Block**.

- Choose block type: **FB**, **FC**, **OB**, or **DB**
- Choose language: **SCL**, **STL**, **LAD**, **FBD**, or **GRAPH**
- Enter a name — the block is automatically created in TIA Portal
- SCL/STL blocks get a ready-to-use code template; LAD/FBD/GRAPH are created via XML generation
- The project tree refreshes to show the new block immediately

### Compile

Compile a single block or an entire device directly from VS Code, with progress notifications and detailed error/warning output.

### Source Control (VCS)

Version your TIA Portal project with a dedicated **Source Control** panel in the T-IA Connect sidebar. Track changes to blocks, tags, UDTs, and hardware configuration with Git-based versioning.

#### Workflow

1. **Export Preview** — Click the eye icon to export the current project state and detect changes since the last commit
2. **Review changes** — Changed files appear in the panel with status icons (Added, Modified, Removed). Click any file to open a **read-only side-by-side diff** showing exactly what changed
3. **Commit** — Click the checkmark icon and enter a commit message to save the current state

#### Features

- **Diff viewer**: side-by-side comparison of XML exports (blocks, tags, UDTs, hardware) — read-only, no accidental edits
- **Export Preview**: exports the project without committing, so you can review before saving
- Push / Pull to remote repositories
- Branch operations: create, switch, delete, merge
- Commit log with unified diff viewer
- Auto-export every minute + on connect (keeps the panel up to date automatically)
- Auto-refresh status every 30 seconds
- License check: shows lock icon if VCS is not included in your license

### PLC Tests

Run PLC tests against PLCSim Advanced directly from the T-IA Connect sidebar.

- **License and PLCSim checks**: verifies the Test Harness feature is enabled and PLCSim Advanced is available before showing tests
- Discover tests from the T-IA Connect test harness
- Run individual tests or the entire suite
- **Detailed results webview**: pass/fail badges, step cards with colored borders, assertions table (Tag, Expected, Actual, Message), duration and timestamps
- Step-level breakdown in the test tree
- Clear error messages when PLCSim instance is not available

### Server Launch

Launch the T-IA Connect server directly from VS Code when it's not running.

- **Sidebar prompt**: when the server is unreachable, the sidebar offers "Launch Headless" or "Launch with GUI" buttons
- **Headless mode**: runs silently in the background (no window), auto-shuts down after 5 minutes of inactivity
- **GUI mode**: opens the full T-IA Connect desktop application
- **Auto-connect**: waits for the server to start, then connects automatically
- **Stop Server**: available from the Disconnect menu — shuts down the server remotely
- Configurable executable path (`tiaConnect.executablePath`)

### Cross-References

View cross-references for any block (SCL, STL, LAD, FBD, GRAPH) in a dedicated webview panel.

- Source and target references with type badges
- Read/Write access indicators
- Dark-theme styled panel alongside the editor

### Pipelines (CI/CD)

Define and run CI/CD pipelines for your TIA Portal projects.

- List, view, and run saved pipelines
- Create pipelines from built-in templates
- Execution history with step-level details
- Async execution with progress tracking

## Requirements

- **T-IA Connect** server running (v2.1.620+) — [t-ia-connect.com](https://t-ia-connect.com) (or let the extension launch it for you)
- **TIA Portal** V17-V21 installed on the same machine as the server
- Network access to the server (default: `http://localhost:9000`)

## Getting Started

1. Install the extension
2. Click the **T-IA Connect** icon in the Activity Bar (left sidebar)
3. If the server is not running, click **Launch Headless** or **Launch with GUI** in the sidebar
4. Otherwise, click the **Connect** button in the panel toolbar
5. Enter the **API Key** when prompted (configured in T-IA Connect server)
6. The project tree loads automatically once connected

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tiaConnect.serverUrl` | `http://localhost:9000` | T-IA Connect server URL |
| `tiaConnect.apiKey` | *(empty)* | API key for authentication |
| `tiaConnect.autoReimportOnSave` | `true` | Reimport SCL/STL blocks on manual save (Ctrl+S) |
| `tiaConnect.autoCompileOnReimport` | `false` | Compile after reimport |
| `tiaConnect.autoSaveInterval` | `5` | Safety auto-save interval in minutes (0 = disabled, 5/10/15) |
| `tiaConnect.excludeFromReimport` | `[]` | Block names to exclude from auto-reimport (e.g. `["Main", "FB_Legacy"]`) |
| `tiaConnect.executablePath` | `C:\Program Files\...` | Path to the T-IA Connect server executable |

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| T-IA Connect: Connect to Server | Connect and authenticate |
| T-IA Connect: Disconnect from Server | Disconnect or stop the server |
| T-IA Connect: Launch Server (Headless) | Start server in background |
| T-IA Connect: Launch Server (GUI) | Start server with desktop UI |
| T-IA Connect: Refresh Project Tree | Reload project structure |
| T-IA Connect: Compile Device | Compile all software on a device |
| T-IA Connect: Compile Block | Compile a single block |
| T-IA Connect: Export Block to File | Export block as SimaticML XML |
| T-IA Connect: Create Block | Create a new FB/FC/OB/DB in SCL or STL |
| T-IA Connect: Switch Project | Open a different project (recent + available) |
| T-IA Connect VCS: Initialize VCS | Initialize source control repository |
| T-IA Connect VCS: Export Preview | Export project and show changed files (without committing) |
| T-IA Connect VCS: Commit Changes | Export project and create a Git commit |
| T-IA Connect VCS: Show Changes | Open a side-by-side diff for a changed file |
| T-IA Connect VCS: Push | Push to remote repository |
| T-IA Connect VCS: Pull | Pull from remote repository |
| T-IA Connect VCS: Branch Operations | Create, switch, delete, or merge branches |
| T-IA Connect VCS: Show Commit Log | View commit history with diffs |
| T-IA Connect Pipelines: List Pipelines | View defined pipelines |
| T-IA Connect Pipelines: Run Pipeline | Select and run a CI/CD pipeline |
| T-IA Connect Pipelines: Pipeline History | View past pipeline executions |
| T-IA Connect Pipelines: Create Pipeline from Template | Create pipeline from template |
| T-IA Connect: Show Cross-References | Show cross-references for a block |
| T-IA Connect: Import SCL/STL File | Import an external source file |
| T-IA Connect Tests: Refresh PLC Tests | Refresh PLC test discovery |
| T-IA Connect Tests: Run All PLC Tests | Run all discovered tests |
| T-IA Connect Tests: Run Test | Run a single test |

## How It Works

```
VS Code Extension (this)          T-IA Connect Server          TIA Portal
   TypeScript/REST  ──HTTP──>   C# / .NET Framework 4.8  ──Openness──>  V17-V21
              <──SignalR──  (push notifications for job status)
```

The extension is a **lightweight REST + SignalR client**. All the heavy lifting (Openness API calls, block compilation, PLCSim simulation) happens in the T-IA Connect server. This means:

- **No TIA Portal dependency** in VS Code itself
- **Multi-project**: switch between projects without leaving VS Code
- **Multi-client**: VS Code + Cursor + scripts can connect simultaneously
- **Remote-capable**: the server can run on a different machine or VM

## Localisation

The extension is fully translated in **French**. It automatically displays in French when VS Code is configured with `"locale": "fr"`. English is the default language.

## Compatibility

| Editor | Supported |
|--------|-----------|
| VS Code | Yes |
| Cursor | Yes |
| Windsurf | Yes |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Structure du code, composants, flux de donnees
- [Roadmap](docs/ROADMAP.md) — Etat d'avancement par phase, fonctionnalites a venir

## License

MIT -- [FEELAUTOM](https://feelautom.com)

The extension is free and open-source. The T-IA Connect server requires a commercial license.
