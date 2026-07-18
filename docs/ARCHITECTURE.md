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
│   │   └── testProvider.ts         # TestController natif VS Code (PLC Tests)
│   ├── editors/
│   │   ├── blockEditor.ts          # Ouverture, sauvegarde, reimport, prechargement blocs SCL/STL
│   │   ├── blockFileManager.ts     # Fichiers temporaires + metadata .tia-meta.json + cache
│   │   ├── crossRefWebview.ts      # Webview cross-references (sources, objets, locations)
│   │   ├── ladRenderer.ts         # Rendu LAD/FBD en SVG (contacts, bobines, branches OR)
│   │   ├── ladWebview.ts          # Webview lecture seule pour blocs LAD/FBD
│   │   ├── tagTableWebview.ts     # Webview tag tables (noms, adresses, types)
│   │   ├── udtWebview.ts          # Webview detail UDT (membres, types)
│   │   └── watchTableWebview.ts   # Webview watch tables (noms, adresses, formats)
│   ├── chat/
│   │   ├── languageModelTools.ts   # 30 Language Model Tools (VS Code LM API)
│   │   └── tiaParticipant.ts       # @tia chat participant (GitHub Copilot Chat)
│   ├── commands/
│   │   ├── projectCommands.ts      # connect, disconnect, refresh, switch, browse, launch server
│   │   ├── blockCommands.ts        # openBlock, compileDevice, compileBlock, exportBlock, crossRefs
│   │   ├── pipelineCommands.ts     # list, run, history, createFromTemplate
│   │   ├── exportImportCommands.ts # Export/import tags (CSV/XLSX/XML), UDTs, watch tables, Export All
│   │   ├── hmiCommands.ts          # Export/import ecrans HMI, tags HMI, connexions HMI
│   │   ├── hwConfigCommands.ts     # Export/import configuration materielle
│   │   ├── orphanCleanup.ts        # Detection elements orphelins (TIA vs VCS)
│   │   └── workspaceCommands.ts    # Scaffolding workspace (.gitignore, copilot-instructions, CLAUDE.md)
│   ├── views/
│   │   ├── statusBar.ts            # Barre de statut (Connected/Disconnected/Error)
│   │   ├── outputChannel.ts        # Canal de logs "T-IA Connect"
│   │   ├── diagnostics.ts          # DiagnosticCollection (erreurs compilation dans l'editeur)
│   │   └── projectDashboard.ts     # Webview dashboard projet (stats, devices, tags)
│   ├── utils/
│   │   ├── config.ts               # Lecture/ecriture settings VS Code
│   │   ├── jobPoller.ts            # Polling async avec callback progression
│   │   ├── mcpConfig.ts            # Auto-config MCP pour GitHub Copilot Chat
│   │   ├── constants.ts            # IDs, noms, langages editables
│   │   ├── smartComparison.ts      # Comparaison XML normalisee (IDs, timestamps, whitespace)
│   │   ├── dependencySort.ts       # Tri topologique pour import ordonne (UDT→FB→FC→OB→DB)
│   │   └── diagnosticMapper.ts     # Resolution erreurs compilation → lignes source
└── docs/
    ├── ARCHITECTURE.md             # Ce fichier
    └── ROADMAP.md                  # Roadmap par phases
```

## Composants principaux

### 1. Client HTTP (`api/client.ts`)

Singleton `TiaClient` utilisant l'API `fetch` native.

**Particularites :**
- Headers `X-API-Key` depuis `SecretStorage` et `X-Client-Id: vscode/<version-extension>`
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

### 5. PLC Tests (`providers/testProvider.ts`)

`TestController` integre dans le Test Explorer natif de VS Code. L'extension ne contribue plus de TreeView PLC parallele.

**Pre-requis verifies automatiquement :**
- Workspace approuve ; les tests restent bloques en Restricted Mode
- Feature exacte `hasTestHarness` activee dans la licence
- PLCSim Advanced disponible via `/api/simulation/status`
- Un item de statut natif et non executable expose le blocage quand un pre-requis manque

**Fonctionnalites :**
- Decouverte des tests depuis le backend T-IA Connect
- Arborescence native : Test → Steps, resolue a l'expansion ou avant execution
- Execution globale, selectionnee (test ou step), exclusions et deduplication parent/enfant
- Le backend ne sait executer qu'un test complet : exclure un step exclut donc son test parent
- Resultats natifs pass/fail/error/skipped, duree du test et messages d'assertion detailles (Tag, Expected, Actual, Message)
- Progression via SignalR (temps reel) ou polling de jobs (fallback)
- L'annulation VS Code interrompt immediatement l'attente SignalR ou le delai de polling et ignore le resultat tardif. Elle n'annule pas le job deja lance cote Desktop, faute d'API backend dediee.

Les noms de tests sont des textes humains transmis au backend sans trim, changement de casse ni normalisation Unicode. Les identifiants opaques du Test Explorer sont derives avec `encodeURIComponent`, ce qui evite les collisions avec les separateurs internes tout en preservant l'identite exacte utilisee par l'API.

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

### 7. Diagnostics (`views/diagnostics.ts` + `utils/diagnosticMapper.ts`)

`DiagnosticCollection` pour afficher les erreurs/warnings de compilation TIA Portal directement dans l'editeur VS Code (soulignement rouge/jaune).

**Mapping vers les lignes source :**
Le `diagnosticMapper` resout les messages d'erreur TIA Portal vers des positions precises dans le code source, en 3 strategies (par priorite) :
1. **Extraction regex** — detecte `Line 42, Column 5`, `(Line: 12; Col: 3)`, `Line 7:` dans le message
2. **Recherche de symbole** — extrait les noms entre quotes (`'Running'`, `"Stop"`) et cherche la premiere occurrence dans le source
3. **Fallback** — ligne 0 si aucune info disponible

### 7a. Diagnostic support (`diagnostics/supportDiagnostic.ts`)

La commande `tiaConnect.diagnostic` ouvre un document Markdown temporaire et propose une copie explicite dans le presse-papiers.

- Etats couverts : versions extension/VS Code/Desktop, OAuth, cle API configuree, installation Desktop, REST, SignalR, MCP et licence.
- La latence REST est bornee et les erreurs sont converties en codes normalises.
- Les chemins, projets, emails, identifiants de compte, tokens, cles, reponses brutes et messages utilisateur sont exclus par construction.
- Les URLs loopback sont reduites a `scheme://host:port`; les hotes distants deviennent `<remote-host>` et les credentials rendent la configuration invalide.
- Un `mcp.json` contenant une cle en clair est signale par l'etat `unsafe_secret_detected`, sans lire ni afficher sa valeur.

### 7b. Smart Comparison (`utils/smartComparison.ts`)

Comparaison structuree de blocs XML exportes depuis TIA Portal.

**Normalisation :**
- Supprime les elements non-significatifs : IDs, UIds, timestamps, `DocumentInfo`, `Engineering`
- Normalise les espaces et tri alphabetique des attributs XML
- Extrait les sections (Interface, Networks, Attributes) pour un diff granulaire

**Usage :** Compare les blocs avant/apres export pour detecter les vrais changements (ignore les modifications cosmetiques de TIA Portal).

### 7c. Dependency Sort (`utils/dependencySort.ts`)

Tri topologique des blocs pour un import dans le bon ordre (les dependances avant les dependants).

**Algorithme :**
- Construction du graphe de dependances via les cross-references
- Kahn's algorithm avec tiebreaking par priorite de type : UDT(0) → FB(1) → FC(2) → OB(3) → DB(4) → InstanceDB(5)
- Detection de cycles (DFS) avec rapport des blocs impliques
- Fallback `sortByTypePriority()` sans cross-references

### 7d. Orphan Cleanup (`commands/orphanCleanup.ts`)

Detection des elements orphelins : blocs supprimes dans TIA Portal mais encore presents dans le VCS.

- Compare la liste des blocs TIA (live) avec les fichiers VCS exportes
- Comparaison case-insensitive des noms
- QuickPick multi-selection pour marquer les orphelins a nettoyer au prochain commit

### 8. GitHub Copilot Integration (`chat/`)

Deux mecanismes independants pour l'IA dans VS Code :

**a) Language Model Tools (`chat/languageModelTools.ts`)**

30 outils enregistres via `vscode.lm.registerTool()` (VS Code 1.96+). Chaque outil est une classe implementant `vscode.LanguageModelTool<InputType>` qui appelle l'API REST T-IA Connect.

- **Verification licence AI** : check cache (TTL 5 min) avant chaque appel d'outil. Si la licence AI n'est pas activee, retourne une erreur sans consommer de tokens.
- **safeCall()** : wrapper qui catch les erreurs et retourne un `LanguageModelToolResult` JSON structure (`{ success, data }` ou `{ success: false, error }`).
- Les outils sont declares dans `package.json` > `contributes.languageModelTools` avec `inputSchema` (JSON Schema) pour que le modele sache quels parametres fournir.

**b) Chat Participant (`chat/tiaParticipant.ts`)**

Participant `@tia` dans GitHub Copilot Chat via `vscode.chat.createChatParticipant('tia.connect', handler)`.

- **Pre-checks** : verifie (1) projet connecte, (2) licence AI, (3) outils disponibles avant d'envoyer quoi que ce soit au modele.
- **Contexte projet** : injecte automatiquement le nom du projet et la liste des devices dans le prompt systeme.
- **Boucle agentique** : le handler gere les `LanguageModelToolCallPart` en boucle (max 10 tours) :
  1. Envoie la requete au modele avec les outils
  2. Streame le texte vers l'utilisateur
  3. Si le modele demande un outil → execute via `vscode.lm.invokeTool()`
  4. Renvoie les resultats au modele → retour a l'etape 1
  5. Quand le modele ne demande plus d'outil → fin

**c) MCP Auto-configuration (`utils/mcpConfig.ts`)**

A la connexion d'un projet, l'extension genere automatiquement `.vscode/mcp.json` avec l'entree T-IA Connect (SSE endpoint + API key). Cela permet a GitHub Copilot Chat d'utiliser aussi les 100+ outils MCP du serveur.

**d) Copilot Sidebar (`providers/copilotViewProvider.ts`)**

Webview dans la sidebar secondaire connectee a l'API assistant du serveur (multi-provider : OpenAI, Anthropic, Google, Mistral, Ollama). Independant de GitHub Copilot — utilise le LLM configure cote serveur.

### 9. Export/Import (`commands/exportImportCommands.ts`)

Commandes pour exporter et importer les donnees du projet :
- **Tag tables** : export CSV/XLSX/XML, import CSV/XLSX
- **UDTs** : export/import XML
- **Watch tables** : export/import
- **Export All** : exporte tags + UDTs + watch tables d'un device en une seule commande

### 10. HMI (`commands/hmiCommands.ts` + `api/hmi.ts`)

Gestion des ecrans IHM (HMI) :
- Export/import individuel d'ecrans HMI
- Export bulk (ecrans + tags HMI + connexions HMI) vers un dossier
- Import de fichiers HMI (ecrans, tags, connexions)

### 11. Hardware Config (`commands/hwConfigCommands.ts` + `api/hardware.ts`)

Export/import de la configuration materielle (rack, modules, adresses) au format AML.

### 12. Workspace Scaffolding (`commands/workspaceCommands.ts`)

Commande `tiaConnect.initWorkspace` qui genere les fichiers de base pour un projet TIA versionne :
- `.gitignore` avec patterns TIA Portal (*.ap*, *.zap*, .tia-temp/)
- `.github/copilot-instructions.md` (contexte pour GitHub Copilot)
- `CLAUDE.md` (contexte pour Claude Code)
- Ne touche pas aux fichiers existants (pas d'ecrasement)

### 13. LAD Renderer (`editors/ladRenderer.ts`)

Moteur de rendu SVG pour les blocs LAD/FBD en lecture seule :
- Contacts (NO, NC), bobines, blocs fonctionnels (TON, CTU, MOVE...)
- Branches OR avec connecteur vertical aux points de fusion
- Detection des merge gates (O, AND implicites) pour le tracage des fils
- Layout en grille (colonnes par profondeur, lignes par branche)

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

### Telemetrie privee et correlation

- `api/clientIdentity.ts` centralise l'identite `vscode/<version-extension>` utilisee par REST, SignalR, detection Desktop, authentification cloud et configuration MCP.
- `telemetry/telemetry.ts` envoie en best-effort vers `POST /api/telemetry/client-events`. Le recepteur Desktop est suivi par `TKT-999815`.
- Seuls les noms d'evenements et champs allowlistes sont serialises : versions, succes, duree bornee, mode, categorie et code d'erreur normalise.
- Les contenus PLC/SCL/STL, chemins, messages, tokens, cles API et reponses brutes ne sont jamais ajoutes au corps de telemetrie.
- Une panne reseau est ignoree. Un statut `404`, `405` ou `501` desactive les envois pour la session afin de rester compatible avec les anciennes versions Desktop.

### Jobs asynchrones

Les operations longues (commit VCS, execution pipeline, tests) retournent un `JobId`.

**Mode principal : SignalR push** (`api/signalr.ts`)
- Client SignalR legacy compatible ASP.NET SignalR (pas Core)
- Transport `longPolling` (negotiate → start → poll loop)
- Authentification via header `X-API-Key`; la cle n'apparait jamais dans la query string
- Correlation via header `X-Client-Id`
- Recoit `jobStatusChanged(jobId, status, result, description)` et `jobProgressChanged(jobId, percent, message)` en temps reel
- Reconnexion automatique en cas de perte de connexion
- Se connecte au hub `jobHub` a la connexion au serveur

**Fallback : HTTP polling** (`api/jobs.ts`)
- Si SignalR n'est pas connecte, `pollJob()` bascule automatiquement sur le polling HTTP classique (`GET /api/jobs/{id}` toutes les secondes)
- Transparent pour l'appelant : meme interface `pollJob(jobId, onProgress)`
- Un token d'annulation optionnel interrompt immediatement l'attente SignalR ou le delai entre deux polls, sans utiliser `client.cancelAll()`.

## Settings VS Code

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tiaConnect.serverUrl` | string | `http://localhost:9000` | URL du serveur T-IA Connect |
| Cle API locale | secret | *(vide)* | Stockee dans `vscode.SecretStorage`, jamais dans les settings/workspace |
| `tiaConnect.autoReimportOnSave` | boolean | `true` | Reimporter dans TIA sur Ctrl+S |
| `tiaConnect.autoCompileOnReimport` | boolean | `false` | Compiler apres reimport |
| `tiaConnect.autoSaveInterval` | number | `5` | Auto-save securite (0/5/10/15 min) |

## Compatibilite

- **VS Code** 1.85+
- **Cursor**, **Windsurf** (meme API d'extension)
- **T-IA Connect** v2.1.617+ (serveur)
- **TIA Portal** V17-V21 (via le serveur)

## Workspace Trust

L'extension declare un support `limited` des workspaces non approuves. En Restricted Mode, l'authentification, les reglages, le diagnostic expurge et les fonctions de langage restent disponibles. Les commandes industrielles, le lancement Desktop, les imports/exports, les ecritures de fichiers, VCS, les tests et la configuration MCP sont desactives dans l'interface et bloques a l'execution. Les requetes REST mutantes disposent d'un second garde runtime. La confiance accordee relance automatiquement la detection Desktop et l'auto-connexion.

La CI execute des tests Extension Host distincts en mode trusted et untrusted sur VS Code 1.85.2 et Stable. Le profil untrusted est isole et conserve Workspace Trust actif ; il ne doit jamais utiliser `--disable-workspace-trust`.

## Notifications et localisation

- Les textes runtime utilisent les chaînes sources anglaises de `vscode.l10n` et le bundle `l10n/bundle.l10n.fr.json`.
- Un test d'inventaire TypeScript vérifie que chaque clé littérale possède une traduction française et qu'aucun texte humain n'est transmis directement aux notifications VS Code.
- Les erreurs et avertissements strictement identiques sont dédupliqués pendant 10 secondes. Le message reste exact et aucune donnée utilisateur supplémentaire n'est journalisée.
- Les succès de fond fréquents, notamment la réimportation automatique et les tests PLC réussis, utilisent la barre d'état pendant 5 secondes. Les confirmations d'actions explicites et les erreurs bloquantes restent des notifications.
- `npm run test:integration:fr` exécute l'Extension Host en français lorsqu'un pack de langue français est disponible dans le profil de test isolé.
