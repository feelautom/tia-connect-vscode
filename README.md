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

### SCL / STL Editing

Double-click any SCL or STL block to open it in VS Code with full syntax highlighting. Edit the code, press **Ctrl+S**, and it's automatically reimported into TIA Portal.

- **SCL** syntax highlighting with TextMate grammar
- **STL** syntax highlighting with TextMate grammar
- Auto-reimport on save (`onDidSaveTextDocument`)
- Optional auto-compile after reimport
- 15 SCL snippets (FB, FC, OB, DB, IF, FOR, CASE, TON, R_TRIG...)
- Compilation diagnostics in the editor (errors and warnings)

### Compile

Compile a single block or an entire device directly from VS Code, with progress notifications and detailed error/warning output.

### Source Control (VCS)

Version your TIA Portal project using the native VS Code Source Control panel. Each commit exports the project (blocks, tags, UDTs, hardware) and creates a Git commit.

- Commit with message (async export + git commit)
- Push / Pull to remote repositories
- Branch operations: create, switch, delete, merge
- Commit log with diff viewer
- Auto-refresh status every 30 seconds

### Test Explorer

Run PLC tests against PLCSim directly from the VS Code Test Explorer.

- Discover tests from the T-IA Connect test harness
- Run individual tests or the entire suite
- Pass/fail results with detailed assertion messages
- Step-level breakdown in the test tree

### Pipelines (CI/CD)

Define and run CI/CD pipelines for your TIA Portal projects.

- List, view, and run saved pipelines
- Create pipelines from built-in templates
- Execution history with step-level details
- Async execution with progress tracking

## Requirements

- **T-IA Connect** server running (v2.0+) — [t-ia-connect.com](https://t-ia-connect.com)
- **TIA Portal** V17-V21 installed on the same machine as the server
- Network access to the server (default: `http://localhost:9000`)

## Getting Started

1. Install the extension
2. Open VS Code Settings (`Ctrl+,`) and search for `tiaConnect`
3. Set the **Server URL** (default: `http://localhost:9000`)
4. Set your **API Key** (configured in T-IA Connect)
5. Click the T-IA Connect icon in the Activity Bar
6. Click the **Connect** button in the panel toolbar

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tiaConnect.serverUrl` | `http://localhost:9000` | T-IA Connect server URL |
| `tiaConnect.apiKey` | *(empty)* | API key for authentication |
| `tiaConnect.autoReimportOnSave` | `true` | Reimport SCL/STL blocks on save |
| `tiaConnect.autoCompileOnReimport` | `false` | Compile after reimport |

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| T-IA Connect: Connect to Server | Connect to T-IA Connect |
| T-IA Connect: Compile Device | Compile all software on a device |
| T-IA Connect: Compile Block | Compile a single block |
| T-IA Connect: Export Block to File | Export block as SimaticML XML |
| T-IA Connect VCS: Commit | Export project and create a Git commit |
| T-IA Connect VCS: Branch Operations | Create, switch, delete, or merge branches |
| T-IA Connect VCS: Show Commit Log | View commit history with diffs |
| T-IA Connect Pipelines: Run Pipeline | Select and run a CI/CD pipeline |
| T-IA Connect Pipelines: Pipeline History | View past pipeline executions |

## How It Works

```
VS Code Extension (this)          T-IA Connect Server          TIA Portal
   TypeScript/REST  ──HTTP──>   C# / .NET Framework 4.8  ──Openness──>  V17-V21
```

The extension is a **lightweight REST client**. All the heavy lifting (Openness API calls, block compilation, PLCSim simulation) happens in the T-IA Connect server. This means:

- **No TIA Portal dependency** in VS Code itself
- **Multi-client**: VS Code + Cursor + scripts can connect simultaneously
- **Remote-capable**: the server can run on a different machine or VM

## Compatibility

| Editor | Supported |
|--------|-----------|
| VS Code | Yes |
| Cursor | Yes |
| Windsurf | Yes |

## License

MIT -- [FEELAUTOM](https://feelautom.com)

The extension is free and open-source. The T-IA Connect server requires a commercial license.
