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

Teste en conditions reelles le 2026-05-04 avec :
- VCS : commit, diff, branches, checkout inline
- Tests PLCSim : Motor_Start_Stop (PASSED), Speed_Check (PASSED)
- Cross-references : fonctionne sur tous types de blocs

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

## Phase 4 — V2 (Futur)

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Language Server SCL (autocompletion, go-to-definition) | DONE | Signature help, cross-file go-to-def, diagnostics, rename |
| Webview LAD (visualisation graphique lecture seule) | DONE | Rendering SVG des reseaux LADDER (contacts, coils, boxes, wires, branches) |
| Multi-projet (switch entre projets) | DONE | QuickPick avec historique + projets disponibles, close/open via jobs |
| QuickDiff pour VCS (diff inline dans editeur) | DONE | VcsContentProvider + VcsTreeProvider |
| Webview pour resultats de test detailles | DONE | Steps, assertions, pass/fail badges, duree, timestamps |
| Notifications push (SignalR) | DONE | Client SignalR legacy (longPolling), fallback HTTP polling auto |
| Server launch depuis VS Code | DONE | Sidebar buttons Headless/GUI, auto-connect, Stop Server, loading spinner |
| Hover documentation avec fallback API | DONE | System blocks (TON, CTU...) + server docs fallback |
| Creation de blocs (FB, FC, OB, DB) | DONE | Clic droit device, choix type + langage (SCL/STL/LAD/FBD/GRAPH) + nom |
| Loading spinner sidebar | DONE | Toutes les operations longues (compile, export, import, xref, open block) |
| Publication Marketplace | TODO | Quand la v1 sera stable |
| Localisation (i18n) | DONE | package.nls.json (EN/FR) + vscode.l10n (runtime FR) |

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
