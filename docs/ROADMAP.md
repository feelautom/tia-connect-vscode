# Roadmap — T-IA Connect for VS Code

## Phase 1 — MVP (Edition SCL/STL + Compilation)

**Objectif :** Explorer un projet TIA Portal, editer du SCL/STL, compiler — le tout depuis VS Code.

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Connexion serveur (URL + API key) | DONE | Prompt interactif, validation, re-prompt |
| Status bar (Connected/Disconnected/Error) | DONE | Affiche le nom du projet |
| Welcome message (panel vide) | DONE | Guide l'utilisateur vers Connect/Settings |
| TreeView projet (devices, blocs, dossiers) | DONE | Lazy loading, cache par device |
| Detection type de noeud (Folder, Block, BlockInfo) | DONE | Compatible formats API |
| Icones par type de bloc (OB, FB, FC, DB) | DONE | ThemeIcon VS Code |
| Double-clic bloc SCL/STL → ouvrir dans editeur | DONE | SourceText via GenerateSource |
| Coloration syntaxique SCL (TextMate grammar) | DONE | Keywords, types, operateurs, commentaires |
| Coloration syntaxique STL (TextMate grammar) | DONE | Instructions, registres, commentaires |
| Snippets SCL (15 snippets) | DONE | FB, FC, OB, DB, IF, FOR, CASE, TON, R_TRIG... |
| Reimport sur Ctrl+S (save manuel uniquement) | DONE | Auto-save VS Code ignore, detection TextDocumentSaveReason |
| Auto-save de securite (5/10/15 min) | DONE | Timer configurable dans settings |
| Compilation device (clic droit) | DONE | Progress notification, errors/warnings |
| Compilation bloc (clic droit) | DONE | Progress notification |
| Export bloc XML (clic droit) | DONE | Save dialog, SimaticML XML |
| Blocs LAD/FBD/GRAPH en lecture seule (XML) | DONE | Ouverts en preview |
| DiagnosticCollection (erreurs dans editeur) | DONE | Errors, warnings, info |
| Output channel (logs) | DONE | Canal "T-IA Connect" |
| Fichiers temporaires + metadata | DONE | `.tia-temp/` + `.tia-meta.json` |
| Normalisation reponse API (PascalCase, double enveloppe) | DONE | Recursif dans client.ts |

**Statut global Phase 1 : TERMINEE**

---

## Phase 2 — VCS + Tests

**Objectif :** Panel Source Control natif + Test Explorer natif pour VS Code.

### Source Control (VCS)

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Panel Source Control dedie (sidebar T-IA Connect) | DONE | TreeDataProvider custom (remplace le SCM natif) |
| Export Preview (detecter les changements) | DONE | Export sans commit, bouton oeil dans title bar |
| Auto-export periodique (1 min) | DONE | Silencieux, met a jour le panneau automatiquement |
| Export initial a la connexion | DONE | Lance automatiquement quand le projet se charge |
| Diff side-by-side au clic (read-only) | DONE | `vscode.diff` via VcsContentProvider (scheme `tia-vcs`) |
| Gestion Added/Modified/Removed | DONE | Added = contenu, Modified = diff, Removed = ancien contenu |
| Verification licence `hasVcs` | DONE | Icone cadenas si pas inclus dans la licence |
| Status des changements (Added/Modified/Removed) | DONE | Icones diff |
| Commit avec message (export projet + git) | DONE | Job asynchrone avec polling |
| Push vers remote | DONE | |
| Pull depuis remote | DONE | |
| Branches : switch, create, delete, merge | DONE | QuickPick menu |
| Log de commits avec diff | DONE | QuickPick + vue diff |
| Auto-refresh status (30s) | DONE | Timer configurable |
| Init repository | DONE | Commande dediee |

### PLC Tests (sidebar)

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| TreeDataProvider dans la sidebar T-IA Connect | DONE | Sous le Project Explorer, pas un onglet separe |
| Verification licence (hasTestHarness) | DONE | Affiche icone cadenas si pas disponible |
| Verification PLCSim Advanced disponible | DONE | Affiche icone warning si pas disponible |
| Decouverte des tests | DONE | Depuis backend T-IA Connect |
| Arborescence Test → Steps | DONE | getChildren avec lazy loading |
| Execution individuelle (bouton inline) | DONE | Polling job, icones pass/fail/running |
| Execution globale (Run All) | DONE | Sequentiel |
| Resultats pass/fail avec assertions | DONE | Messages detailles par step |

### Cross-References

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Webview cross-references par bloc | DONE | Panel a cote de l'editeur |
| Tous types de blocs (SCL, STL, LAD, FBD, GRAPH) | DONE | Clic droit dans le tree |
| Badges type + indicateurs Read/Write | DONE | Theme sombre |

**Statut global Phase 2 : TERMINEE ET TESTEE**

---

## Phase 3 — Pipelines + Polish

**Objectif :** CI/CD + ameliorations UX.

### Pipelines

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Lister les pipelines | DONE | QuickPick |
| Executer une pipeline | DONE | Job asynchrone + progression |
| Historique des executions | DONE | Details par etape |
| Creer depuis template | DONE | QuickPick templates |

### TreeView — Tags & UDTs

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Tag tables dans le TreeView (sous chaque device) | DONE | Liste tables + tags en lecture seule |
| UDTs dans le TreeView (sous chaque device) | DONE | Liste UDTs en lecture seule |
| Detail tag (type + adresse dans description) | DONE | DataType + LogicalAddress inline |
| Detail UDT au clic | DONE | Structure et membres (webview) |

### Polish UX

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Icones custom SVG par type de bloc | DONE | OB (bleu), FB (vert), FC (orange), DB (violet) |
| Rafraichir tree apres reimport | DONE | Event onBlockReimported → tree refresh |
| Detection conflit (bloc modifie dans TIA en parallele) | DONE | Compare ModifiedDate, avertit avant ecrasement |
| Keybinding pour compiler (Ctrl+Shift+B) | DONE | Auto-pick device si un seul, QuickPick sinon |
| Notification groupee pour multi-erreurs | DONE | Resume + 3 premieres erreurs inline + bouton Show Output |
| Setting pour desactiver auto-reimport par bloc | DONE | `tiaConnect.excludeFromReimport` — liste de noms de blocs |

**Statut global Phase 3 : TERMINEE**

---

## Phase 4 — V2 (Language Server, Webview LAD, Multi-projet)

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Language Server SCL (autocompletion, go-to-definition) | DONE | Signature help, cross-file go-to-def, diagnostics, rename |
| Webview LAD (visualisation graphique lecture seule) | DONE | Rendering SVG des reseaux LADDER |
| Multi-projet (switch entre projets) | DONE | QuickPick avec historique + projets disponibles |
| QuickDiff pour VCS (diff inline dans editeur) | DONE | VcsContentProvider + VcsTreeProvider |
| Webview pour resultats de test detailles | DONE | Steps, assertions, pass/fail badges, duree, timestamps |
| Notifications push (SignalR) | DONE | Client SignalR legacy (longPolling), fallback HTTP polling |
| Server launch depuis VS Code | DONE | Sidebar buttons Headless/GUI, auto-connect, Stop Server |
| Hover documentation avec fallback API | DONE | System blocks (TON, CTU...) + server docs fallback |
| Creation de blocs (FB, FC, OB, DB) | DONE | Clic droit device, choix type + langage + nom |
| Loading spinner sidebar | DONE | Toutes les operations longues |
| Localisation (i18n) | DONE | package.nls.json (EN/FR) + vscode.l10n (runtime FR) |

**Statut global Phase 4 : TERMINEE**

---

## Phase 5 — Authentification, onboarding et UX avancee

**Objectif :** Un utilisateur installe l'extension depuis le Marketplace et peut se connecter, telecharger, installer T-IA Connect et commencer a travailler sans quitter VS Code.

### Phase 5a — Welcome view + detection serveur

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Welcome view multi-etats (non auth, auth, serveur absent, serveur arrete) | DONE | Context keys conditionnels dans package.json |
| Bouton "Se connecter" → ouvre navigateur t-ia-connect.com | DONE | `vscode.env.openExternal` |
| Bouton "Creer un compte" → ouvre navigateur | DONE | Lien direct vers page inscription |
| Detection serveur T-IA Connect (ping + fichier + registre) | DONE | `serverDetector.ts` — detection exe + running |
| Message guide si serveur absent + lien telechargement | DONE | Welcome view conditionnel |
| Brider l'extension si pas connecte (context keys) | DONE | Toutes les vues cachees sauf welcome |

### Phase 5b — OAuth + gestion de session

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| URI handler `vscode://feelautom.tia-connect-vscode/auth-callback` | DONE | `vscode.window.registerUriHandler` |
| Polling token (fallback si URI callback bloque) | DONE | Poll `/api/auth/vscode-poll` toutes les 3s, silencieux |
| Stockage token JWT dans SecretStorage | DONE | Keyring OS (Windows Credential Manager) |
| Verification session au demarrage | DONE | Fast startup : trust stored token, validate in background |
| Bouton "Se deconnecter" | DONE | Supprime token + reset context keys |
| Auto-fetch API key depuis serveur local | DONE | `GET /api/auth/local-key` (DPAPI), pas d'ecrasement par token cloud |
| Separation cle API locale / token cloud | DONE | Le token OAuth ne remplace pas la cle API du serveur local |

### Phase 5c — UX avancee

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Dashboard projet (webview) | DONE | Stats (devices, blocs, tags), table devices, s'ouvre au chargement projet |
| Prechargement blocs SCL/STL en arriere-plan | DONE | Cache 10 min, ouverture quasi-instantanee |
| Browse fichiers projet (dialog natif) | DONE | Dossier par defaut `Documents/Automation`, filtres .ap17-21/.zap17-21 |
| Ouverture archives .zap (retrieve + extract) | DONE | Demande dossier cible, appel `retrieveProject` |
| Logs intelligents (INFO vs ERROR) | DONE | "Not connected" n'est plus affiche comme erreur |
| Tree view : etat connected/disconnected | DONE | `setConnected(false)` vide le cache et la vue |

### Phase 5d — Auto-installation T-IA Connect

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Endpoint `/api/downloads/latest` (site web) | TODO | Pre-requis cote site web |
| Telechargement MSI avec barre de progression VS Code | TODO | `fetch` stream + `progress.report` |
| Lancement installeur silencieux (`msiexec /quiet`) | TODO | UAC popup Windows automatique |
| Detection post-installation | TODO | Retry ping apres installation |
| Demarrage automatique apres installation | TODO | Enchaine avec server launch existant |
| Flow complet zero-config | TODO | Install extension → login → download → install → ready |

### Pre-requis cote site web (t-ia-connect.com)

| Endpoint | Methode | Statut | Description |
|----------|---------|--------|-------------|
| `/auth/vscode` | GET | DONE | Page login avec redirect vers callback URI |
| `/api/auth/vscode-poll` | GET | DONE | Polling token pendant le flow OAuth |
| `/api/auth/validate-token` | GET | DONE | Verification JWT |
| `/api/account/profile` | GET | DONE | Infos compte (nom, email, licence) |
| `/api/downloads/latest` | GET | TODO | URL + version + taille derniere release |

### Pre-requis cote serveur local (T-IA Connect)

| Endpoint | Methode | Statut | Description |
|----------|---------|--------|-------------|
| `/api/auth/local-key` | GET | DONE | Recuperation de la cle API locale (DPAPI) |

**Statut global Phase 5 : EN COURS** (5a, 5b, 5c terminees — 5d en attente de l'endpoint download)

---

## Action Plan v0.5 — GitHub Copilot, Export/Import, Tooling avancé

### Sprint 1 — @tia Participant + 30 Language Model Tools

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| @tia chat participant (GitHub Copilot Chat) | DONE | `vscode.chat.createChatParticipant('tia.connect', handler)` |
| 30 Language Model Tools | DONE | `vscode.lm.registerTool()` (VS Code 1.96+) |
| Boucle agentique (max 10 tours) | DONE | ToolCallPart → invokeTool → résultats → retour modèle |
| Vérification licence AI avant chaque appel | DONE | Cache 5 min TTL |
| MCP auto-config (.vscode/mcp.json) | DONE | SSE endpoint + API key |
| Copilot sidebar (webview multi-provider) | DONE | API assistant serveur (OpenAI, Anthropic, Google, Mistral, Ollama) |

### Sprint 2 — Export/Import Tags, UDTs, Watch Tables

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Export tag tables (CSV, XLSX, XML) | DONE | Clic droit sur tag table dans tree |
| Import tag tables (CSV, XLSX) | DONE | Dialog fichier, sélection device |
| Export UDTs (XML) | DONE | Clic droit sur UDT |
| Import UDTs (XML) | DONE | Dialog fichier |
| Export watch tables | DONE | Clic droit sur watch table |
| Import watch tables | DONE | Dialog fichier |
| Export All (tags + UDTs + watch tables) | DONE | Commande globale par device |
| Dashboard avec compteur UDTs | DONE | 4 stat boxes avec couleurs distinctes |

### Sprint 3 — Smart Comparison, Dependency Sort, Orphan Cleanup

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Comparaison XML normalisée (smartComparison) | DONE | Strip IDs, timestamps, DocumentInfo; tri attributs |
| Extraction de sections (Interface, Networks, Attributes) | DONE | Diff structuré par section |
| Tri topologique des dépendances (dependencySort) | DONE | Kahn's algorithm, priorité UDT→FB→FC→OB→DB |
| Détection de cycles dans le graphe | DONE | DFS-based |
| Détection éléments orphelins (TIA vs VCS) | DONE | Commande `tiaConnect.detectOrphans` + QuickPick |

### Sprint 4 — HMI, Hardware Config, Diagnostics, Workspace

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Export/import écrans HMI | DONE | Individuel ou bulk (écrans + tags + connexions) |
| Export/import configuration matérielle | DONE | AML format |
| Mapping diagnostics vers lignes source | DONE | 3 stratégies : regex line/col → symbol search → fallback |
| Scaffolding workspace TIA | DONE | .gitignore, copilot-instructions.md, CLAUDE.md |
| LAD renderer : barre verticale branches OR | DONE | Merge gate detection + vertical connector |
| Copilot sidebar : localisation FR | DONE | vscode.l10n.t() dans template HTML |
| Copilot sidebar : icône robot SVG | DONE | SVG inline (remplace emoji) |

**Statut global Action Plan v0.5 : TERMINÉ (4/4 sprints)**

---

## Phase 6 — Publication et futures ameliorations

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Publication Marketplace | TODO | Quand la v1 sera stable |
| Validation licence/compte (matching local vs cloud) | TODO | Nice to have — verifier coherence entre les comptes |

---

## Bugs connus

| Bug | Statut | Notes |
|-----|--------|-------|
| Output channel ne scroll pas automatiquement vers le bas | KNOWN | Limitation VS Code API — `outputChannel.show()` ne force pas le scroll |

---

## Endpoints REST utilises

| Fonction | Endpoint | Phase |
|----------|----------|-------|
| Health check | `GET /api/health` | 1 |
| Projet overview | `GET /api/projects/overview` | 1 |
| Arbo blocs | `GET /api/devices/{d}/blocks/tree` | 1 |
| Contenu bloc | `GET /api/devices/{d}/blocks/{b}/content` | 1 |
| Reimport SCL | `POST /api/devices/{d}/external-sources/import-and-generate` | 1 |
| Compiler device | `POST /api/devices/{d}/actions/compile-sync` | 1 |
| Compiler bloc | `POST /api/devices/{d}/blocks/{b}/actions/compile` | 1 |
| Export XML | `GET /api/devices/{d}/blocks/{b}/export-xml` | 1 |
| Poll job | `GET /api/jobs/{id}` | 1 |
| VCS status | `GET /api/source-control/status` | 2 |
| VCS commit | `POST /api/source-control/commit` | 2 |
| VCS diff | `POST /api/source-control/diff` | 2 |
| VCS log | `GET /api/source-control/log` | 2 |
| VCS branches | `GET/POST /api/source-control/branches` | 2 |
| VCS push/pull | `POST /api/source-control/push` / `pull` | 2 |
| VCS init | `POST /api/source-control/init` | 2 |
| VCS export preview | `POST /api/source-control/export-preview` | 2 |
| VCS file content | `GET /api/source-control/file-content` | 2 |
| Tests list | `GET /api/testharness/tests` | 2 |
| Test details | `GET /api/testharness/tests/{name}` | 2 |
| Test run | `POST /api/testharness/run` | 2 |
| Test run all | `POST /api/testharness/run-all` | 2 |
| License features | `GET /api/license/features` | 2 |
| PLCSim status | `GET /api/simulation/status` | 2 |
| Cross-references | `GET /api/devices/{d}/blocks/{b}/cross-references` | 2 |
| Pipelines list | `GET /api/pipelines` | 3 |
| Pipeline details | `GET /api/pipelines/{name}` | 3 |
| Pipeline run | `POST /api/pipelines/{name}/run` | 3 |
| Pipeline history | `GET /api/pipelines/executions` | 3 |
| Pipeline templates | `GET /api/pipelines/templates` | 3 |
| Pipeline from template | `POST /api/pipelines/templates/{id}/instantiate` | 3 |
| Tag tables list | `GET /api/devices/{d}/tag-tables` | 3 |
| Tags list | `GET /api/devices/{d}/tag-tables/{t}/tags` | 3 |
| UDTs list | `GET /api/devices/{d}/udts` | 3 |
| UDT details | `GET /api/devices/{d}/udts/{u}` | 3 |
| SignalR jobHub | `/signalr` (longPolling) | 4 |
| Project files list | `GET /api/projects/files` | 4 |
| Project history | `GET /api/projects/history` | 4 |
| Open project | `POST /api/projects/actions/open` | 4 |
| Close project | `POST /api/projects/actions/close` | 4 |
| Server shutdown | `POST /api/health/shutdown` | 4 |
| Docs search | `GET /api/docs/search` | 4 |
| Block source gen | `GET /api/devices/{d}/blocks/{b}/source` | 4 |
| Retrieve (archive) | `POST /api/projects/actions/retrieve` | 5 |
| Auth page (site web) | `GET /auth/vscode` | 5 |
| Auth poll (site web) | `GET /api/auth/vscode-poll` | 5 |
| Validate token (site web) | `GET /api/auth/validate-token` | 5 |
| Account profile (site web) | `GET /api/account/profile` | 5 |
| Local API key (serveur) | `GET /api/auth/local-key` | 5 |
| Download latest (site web) | `GET /api/downloads/latest` | 5 |
| Tag table export CSV | `GET /api/devices/{d}/tag-tables/{t}/export/csv` | v0.5 |
| Tag table export XLSX | `GET /api/devices/{d}/tag-tables/{t}/export/xlsx` | v0.5 |
| Tag table export XML | `GET /api/devices/{d}/tag-tables/{t}/export/xml` | v0.5 |
| Tag table import CSV | `POST /api/devices/{d}/tag-tables/import/csv` | v0.5 |
| Tag table import XLSX | `POST /api/devices/{d}/tag-tables/import/xlsx` | v0.5 |
| UDT export | `GET /api/devices/{d}/udts/{u}/export` | v0.5 |
| UDT import | `POST /api/devices/{d}/udts/import` | v0.5 |
| Watch tables list | `GET /api/devices/{d}/watch-tables` | v0.5 |
| Watch table details | `GET /api/devices/{d}/watch-tables/{w}` | v0.5 |
| Watch table export | `GET /api/devices/{d}/watch-tables/{w}/export` | v0.5 |
| Watch table import | `POST /api/devices/{d}/watch-tables/import` | v0.5 |
| HMI screens list | `GET /api/devices/{d}/hmi/screens` | v0.5 |
| HMI screen export | `GET /api/devices/{d}/hmi/screens/{s}/export` | v0.5 |
| HMI screen import | `POST /api/devices/{d}/hmi/screens/import` | v0.5 |
| HMI tags list | `GET /api/devices/{d}/hmi/tags` | v0.5 |
| HMI tags export | `GET /api/devices/{d}/hmi/tags/export` | v0.5 |
| HMI connections list | `GET /api/devices/{d}/hmi/connections` | v0.5 |
| HMI connections export | `GET /api/devices/{d}/hmi/connections/export` | v0.5 |
| HW config export | `GET /api/devices/{d}/hardware/export` | v0.5 |
| HW config import | `POST /api/devices/{d}/hardware/import` | v0.5 |
