# Architecture — T-IA Connect for VS Code

## Vue d'ensemble

L'extension est un **client REST leger** qui communique avec le serveur T-IA Connect (C#/.NET) via HTTP. Toute la logique metier (Openness API, compilation, simulation) reste cote serveur. L'extension se concentre sur l'UX dans VS Code.

```
VS Code Extension (TypeScript)     T-IA Connect Server (C#)        TIA Portal
   REST client ──── HTTP ────>   .NET Framework 4.8 / OWIN  ──Openness──>  V17-V21
```

## Structure des fichiers

```
tia-connect-vscode/
├── package.json                    # Manifest VS Code (commands, settings, views, menus)
├── tsconfig.json                   # Config TypeScript
├── esbuild.mjs                     # Bundler (production build)
├── resources/icons/                # Icone activity bar + extension
├── syntaxes/
│   ├── scl.tmLanguage.json         # Coloration syntaxique SCL (TextMate)
│   └── stl.tmLanguage.json         # Coloration syntaxique STL (TextMate)
├── language-configuration/
│   ├── scl-language-configuration.json  # Brackets, comments, auto-close
│   └── stl-language-configuration.json
├── snippets/
│   └── scl.json                    # 15 snippets SCL (FB, FC, IF, FOR, CASE, TON...)
├── src/
│   ├── extension.ts                # Point d'entree (activate/deactivate)
│   ├── api/
│   │   ├── client.ts               # Client HTTP (fetch, X-API-Key, PascalCase normalization)
│   │   ├── types.ts                # Types TypeScript (miroir DTOs C#)
│   │   ├── project.ts              # GET /api/projects/overview
│   │   ├── blocks.ts               # Blocs: tree, content, compile, export, reimport
│   │   ├── sourceControl.ts        # VCS: status, commit, diff, branches, push/pull
│   │   ├── testHarness.ts          # Tests PLCSim: list, run, results
│   │   ├── pipelines.ts            # Pipelines CI/CD: list, run, templates, history
│   │   └── jobs.ts                 # Polling jobs asynchrones
│   ├── providers/
│   │   ├── projectTreeProvider.ts  # TreeDataProvider (explorateur projet TIA)
│   │   ├── scmProvider.ts          # SourceControl provider (panel SCM natif)
│   │   └── testProvider.ts         # TestController provider (Test Explorer natif)
│   ├── editors/
│   │   ├── blockEditor.ts          # Ouverture, sauvegarde, reimport blocs SCL/STL
│   │   └── blockFileManager.ts     # Fichiers temporaires + metadata .tia-meta.json
│   ├── commands/
│   │   ├── projectCommands.ts      # connect, disconnect, refresh (+ API key prompt)
│   │   ├── blockCommands.ts        # openBlock, compileDevice, compileBlock, exportBlock
│   │   └── pipelineCommands.ts     # list, run, history, createFromTemplate
│   ├── views/
│   │   ├── statusBar.ts            # Barre de statut (Connected/Disconnected/Error)
│   │   ├── outputChannel.ts        # Canal de logs "T-IA Connect"
│   │   └── diagnostics.ts          # DiagnosticCollection (erreurs compilation dans l'editeur)
│   └── utils/
│       ├── config.ts               # Lecture/ecriture settings VS Code
│       ├── jobPoller.ts            # Polling async avec callback progression
│       └── constants.ts            # IDs, noms, langages editables
└── docs/
    ├── ARCHITECTURE.md             # Ce fichier
    └── ROADMAP.md                  # Roadmap par phases
```

## Composants principaux

### 1. Client HTTP (`api/client.ts`)

Singleton `TiaClient` utilisant l'API `fetch` native.

**Particularites :**
- Header `X-API-Key` automatique depuis les settings
- **Double enveloppe** : le serveur retourne `{ status, response: { success, data } }`. Le client extrait `response.data` automatiquement.
- **Normalisation PascalCase** : le serveur retourne du camelCase, le client convertit recursivement en PascalCase pour correspondre aux interfaces TypeScript.
- `AbortController` pour annuler les requetes en cours (deconnexion)
- Methode `ping()` pour verifier la connexion (endpoint `/api/health`, sans auth)

### 2. Project Tree (`providers/projectTreeProvider.ts`)

`TreeDataProvider` pour le panel lateral "Project Explorer".

**Hierarchie :**
```
Project Name
  └── Device (PLC_1, HMI_1...)
       └── Program blocks (dossier)
            ├── Main [OB | SCL]
            ├── FB_Motor [FB | LAD]
            └── User folder
                 └── FC_Calc [FC | SCL]
```

- Lazy loading : les blocs sont charges au deplier du device
- Cache par device (`blockTreeCache`)
- Gere les noeuds `Folder` et `Block` avec detection automatique (`IsFolder`, `NodeType`)
- Icones par type de bloc (OB, FB, FC, DB)
- Description : type + langage + etat de coherence

### 3. Block Editor (`editors/blockEditor.ts`)

Gere le cycle de vie de l'edition des blocs SCL/STL.

**Workflow :**
1. Double-clic sur un bloc SCL/STL dans le tree
2. `GET /api/devices/{d}/blocks/{b}/content` → recupere `SourceText`
3. Ecrit dans un fichier temporaire `.scl` ou `.stl` dans `.tia-temp/`
4. Fichier metadata `.tia-meta.json` a cote (deviceName, blockName, language)
5. Ouvre le fichier dans l'editeur VS Code avec coloration syntaxique
6. L'utilisateur edite le code
7. **Ctrl+S** (save manuel uniquement) → reimport dans TIA Portal :
   - `POST /api/devices/{d}/external-sources/import-and-generate`
   - Notification de succes/echec
   - Compilation optionnelle automatique

**Points cles :**
- Seul le **save manuel** (Ctrl+S) declenche le reimport. L'auto-save de VS Code est ignore grace a `onWillSaveTextDocument` qui detecte `TextDocumentSaveReason.Manual`.
- **Auto-save de securite** : timer configurable (5/10/15 min) qui sauvegarde les fichiers modifies sur disque sans reimporter.
- Verrou `reimportInProgress` pour eviter les reimports concurrents sur le meme fichier.
- Blocs LAD/FBD/GRAPH : ouverts en lecture seule (export XML).

### 4. Source Control (`providers/scmProvider.ts`)

Utilise l'API native `vscode.scm` pour le panel Source Control.

**Fonctionnalites :**
- Status des changements (fichiers ajoutes/modifies/supprimes)
- Commit (export projet + git commit, via job asynchrone)
- Push / Pull vers remote
- Branches : switch, create, delete, merge
- Log de commits avec diff
- Auto-refresh toutes les 30 secondes

### 5. Test Explorer (`providers/testProvider.ts`)

Utilise l'API native `vscode.tests` (TestController).

**Fonctionnalites :**
- Decouverte des tests depuis le backend T-IA Connect
- Arborescence : Test → Steps
- Execution individuelle ou globale
- Resultats pass/fail avec messages d'assertion detailles
- Progression via polling de jobs

### 6. Pipelines (`commands/pipelineCommands.ts`)

Gestion CI/CD via QuickPick.

**Fonctionnalites :**
- Lister les pipelines definies
- Executer une pipeline avec progression (polling job)
- Historique des executions avec details par etape
- Creation depuis templates

### 7. Diagnostics (`views/diagnostics.ts`)

`DiagnosticCollection` pour afficher les erreurs/warnings de compilation TIA Portal directement dans l'editeur VS Code (soulignement rouge/jaune).

## Communication avec le serveur

### Format de reponse

Le serveur T-IA Connect retourne toujours :
```json
{
  "status": 200,
  "response": {
    "success": true,
    "message": "...",
    "data": { ... },
    "timestamp": "..."
  }
}
```

Le client normalise ca en :
```typescript
interface ApiResponse<T> {
  Success: boolean;
  Message: string;
  Data: T;
  Timestamp: string;
}
```

### Authentification

- Header `X-API-Key` sur chaque requete
- L'endpoint `/api/health` est accessible sans cle (ping)
- A la connexion : prompt interactif si pas de cle, validation, re-prompt si invalide

### Jobs asynchrones

Les operations longues (commit VCS, execution pipeline, tests) retournent un `JobId`. Le client poll `GET /api/jobs/{id}` jusqu'a completion.

## Settings VS Code

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tiaConnect.serverUrl` | string | `http://localhost:9000` | URL du serveur T-IA Connect |
| `tiaConnect.apiKey` | string | *(vide)* | Cle API (header X-API-Key) |
| `tiaConnect.autoReimportOnSave` | boolean | `true` | Reimporter dans TIA sur Ctrl+S |
| `tiaConnect.autoCompileOnReimport` | boolean | `false` | Compiler apres reimport |
| `tiaConnect.autoSaveInterval` | number | `5` | Auto-save securite (0/5/10/15 min) |

## Compatibilite

- **VS Code** 1.85+
- **Cursor**, **Windsurf** (meme API d'extension)
- **T-IA Connect** v2.0+ (serveur)
- **TIA Portal** V17-V21 (via le serveur)
