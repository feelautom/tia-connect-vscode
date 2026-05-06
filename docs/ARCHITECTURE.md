# Architecture — T-IA Connect for VS Code

## Vue d'ensemble

L'extension est un **client REST + SignalR** qui communique avec le serveur T-IA Connect (C#/.NET) via HTTP et SignalR (push notifications). Toute la logique metier (Openness API, compilation, simulation) reste cote serveur. L'extension se concentre sur l'UX dans VS Code.

```
VS Code Extension (TypeScript)     T-IA Connect Server (C#)        TIA Portal
   REST client ──── HTTP ────>   .NET Framework 4.8 / OWIN  ──Openness──>  V17-V21
              <── SignalR ────  (real-time job status push)
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
│   │   ├── project.ts              # GET /api/projects/overview, open, close, retrieve
│   │   ├── blocks.ts               # Blocs: tree, content, compile, export, reimport
│   │   ├── sourceControl.ts        # VCS: status, commit, diff, branches, push/pull
│   │   ├── testHarness.ts          # Tests PLCSim: list, run, results
│   │   ├── pipelines.ts            # Pipelines CI/CD: list, run, templates, history
│   │   ├── tags.ts                 # Tag tables, tags, UDTs: list, details
│   │   ├── jobs.ts                 # Job monitoring (SignalR push + HTTP polling fallback)
│   │   └── signalr.ts             # Client SignalR legacy (ASP.NET SignalR, longPolling)
│   ├── auth/
│   │   ├── authService.ts          # OAuth : login/register, JWT SecretStorage, polling, session
│   │   └── uriHandler.ts           # URI callback handler (vscode://...auth-callback)
│   ├── install/
│   │   └── serverDetector.ts       # Detection serveur (exe + running) + auto-fetch API key
│   ├── providers/
│   │   ├── projectTreeProvider.ts  # TreeDataProvider (explorateur projet TIA)
│   │   ├── scmProvider.ts          # SourceControl provider (QuickDiff gutter)
│   │   ├── vcsTreeProvider.ts      # TreeDataProvider (Source Control dans la sidebar)
│   │   ├── vcsContentProvider.ts   # TextDocumentContentProvider (scheme tia-vcs, diff viewer)
│   │   ├── originalContentProvider.ts # QuickDiff pour blocs en cours d'edition
│   │   └── testTreeProvider.ts     # TreeDataProvider (PLC Tests dans la sidebar)
│   ├── editors/
│   │   ├── blockEditor.ts          # Ouverture, sauvegarde, reimport, prechargement blocs SCL/STL
│   │   ├── blockFileManager.ts     # Fichiers temporaires + metadata .tia-meta.json + cache
│   │   ├── crossRefWebview.ts      # Webview cross-references (sources, objets, locations)
│   │   └── testResultWebview.ts   # Webview resultats de tests (steps, assertions, pass/fail)
│   ├── commands/
│   │   ├── projectCommands.ts      # connect, disconnect, refresh, switch, browse, launch server
│   │   ├── blockCommands.ts        # openBlock, compileDevice, compileBlock, exportBlock, crossRefs
│   │   └── pipelineCommands.ts     # list, run, history, createFromTemplate
│   ├── views/
│   │   ├── statusBar.ts            # Barre de statut (Connected/Disconnected/Error)
│   │   ├── outputChannel.ts        # Canal de logs "T-IA Connect"
│   │   ├── diagnostics.ts          # DiagnosticCollection (erreurs compilation dans l'editeur)
│   │   └── projectDashboard.ts     # Webview dashboard projet (stats, devices, tags)
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
- **Prechargement** : apres le chargement d'un projet, tous les blocs SCL/STL sont telecharges en arriere-plan. A l'ouverture, le bloc est servi depuis le cache si disponible (TTL 10 min).
- **Cache** : `blockFileManager.hasCachedBlock()` verifie l'existence du fichier + age via metadata `exportedAt`.

### 4. Source Control (`providers/vcsTreeProvider.ts` + `vcsContentProvider.ts`)

Panel dedie **Source Control** dans la sidebar T-IA Connect (pas le SCM natif de VS Code).

**Workflow :**
1. Export Preview (bouton oeil) → exporte le projet sans commiter
2. Les fichiers changes apparaissent dans le tree (Added/Modified/Removed)
3. Clic sur un fichier → diff side-by-side read-only
4. Commit (bouton checkmark) → export + git commit

**Composants :**
- `vcsTreeProvider.ts` — TreeDataProvider : affiche les changements, verification licence `hasVcs`, auto-export periodique (1 min), export initial a la connexion
- `vcsContentProvider.ts` — TextDocumentContentProvider pour le scheme `tia-vcs`. Recupere le contenu d'un fichier a un commit donne (HEAD, HEAD~1, WORKING) via `GET /api/source-control/file-content`
- `scmProvider.ts` — QuickDiff gutter decorations pour les blocs en cours d'edition

**Fonctionnalites :**
- Diff side-by-side read-only au clic (Modified = diff, Added = contenu, Removed = ancien)
- Export Preview sans commit (detecte les vrais changements)
- Auto-export silencieux toutes les minutes
- Commit (export projet + git commit, via job asynchrone)
- Push / Pull vers remote
- Branches : switch, create, delete, merge
- Log de commits avec diff
- Auto-refresh status toutes les 30 secondes
- Verification licence `hasVcs` (cadenas si pas inclus)

### 5. PLC Tests (`providers/testTreeProvider.ts`)

`TreeDataProvider` integre dans la sidebar T-IA Connect (sous le Project Explorer).

**Pre-requis verifies automatiquement :**
- Feature `hasTestHarness` activee dans la licence (sinon affiche icone cadenas)
- PLCSim Advanced disponible via `/api/simulation/status` (sinon affiche icone warning)

**Fonctionnalites :**
- Decouverte des tests depuis le backend T-IA Connect
- Arborescence : Test → Steps
- Execution individuelle (bouton inline) ou globale (Run All)
- Resultats pass/fail avec icones colorees et messages d'assertion detailles
- **Webview detaillee** (`editors/testResultWebview.ts`) : panel HTML avec badges pass/fail, step cards colorees, tableau d'assertions (Tag, Expected, Actual, Message), duree, timestamps. S'ouvre automatiquement apres execution, recliquable sur un test termine.
- Progression via SignalR (temps reel) ou polling de jobs (fallback)
- Messages d'erreur explicites quand PLCSim n'est pas disponible
- Nodes de message (lock, warning, info) quand les pre-requis ne sont pas remplis

### 5b. Cross-References (`editors/crossRefWebview.ts`)

Webview panel pour afficher les references croisees d'un bloc.

**Fonctionnalites :**
- Sources avec badges de type (OB, FB, FC, DB)
- Objets references avec indicateur Read/Write
- Theme sombre integre
- Loading spinner pendant le chargement

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

Deux niveaux d'authentification independants :

1. **Token OAuth (cloud)** — `auth/authService.ts`
   - Login via navigateur externe (`t-ia-connect.com/auth/vscode`)
   - Token JWT stocke dans `vscode.SecretStorage` (keyring OS)
   - Polling silencieux (`/api/auth/vscode-poll`) en fallback si URI callback bloque
   - Validation en arriere-plan au demarrage (fast startup : confiance immediate, validation async)
   - Gere les context keys `tiaConnect.authenticated` pour les welcome views

2. **Cle API (serveur local)** — header `X-API-Key` sur chaque requete
   - Auto-recuperee depuis `GET /api/auth/local-key` (cle DPAPI du serveur local)
   - L'endpoint `/api/health` est accessible sans cle (ping)
   - Fallback : prompt interactif si la cle n'est pas detectee automatiquement
   - **Important** : le token OAuth cloud ne remplace jamais la cle API locale

### Jobs asynchrones

Les operations longues (commit VCS, execution pipeline, tests) retournent un `JobId`.

**Mode principal : SignalR push** (`api/signalr.ts`)
- Client SignalR legacy compatible ASP.NET SignalR (pas Core)
- Transport `longPolling` (negotiate → start → poll loop)
- Authentification via query string `?apiKey=xxx`
- Recoit `jobStatusChanged(jobId, status, result, description)` et `jobProgressChanged(jobId, percent, message)` en temps reel
- Reconnexion automatique en cas de perte de connexion
- Se connecte au hub `jobHub` a la connexion au serveur

**Fallback : HTTP polling** (`api/jobs.ts`)
- Si SignalR n'est pas connecte, `pollJob()` bascule automatiquement sur le polling HTTP classique (`GET /api/jobs/{id}` toutes les secondes)
- Transparent pour l'appelant : meme interface `pollJob(jobId, onProgress)`

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
- **T-IA Connect** v2.1.617+ (serveur)
- **TIA Portal** V17-V21 (via le serveur)
