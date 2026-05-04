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
| SCM Provider natif (panel Source Control) | DONE | `vscode.scm` API |
| Status des changements (Added/Modified/Removed) | DONE | Icones diff |
| Commit avec message (export projet + git) | DONE | Job asynchrone avec polling |
| Push vers remote | DONE | |
| Pull depuis remote | DONE | |
| Branches : switch, create, delete, merge | DONE | QuickPick menu |
| Log de commits avec diff | DONE | QuickPick + vue diff |
| Auto-refresh status (30s) | DONE | Timer configurable |
| Init repository | DONE | Commande dediee |

### Test Explorer

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| TestController natif (Test Explorer) | DONE | `vscode.tests` API |
| Decouverte des tests | DONE | Depuis backend T-IA Connect |
| Arborescence Test → Steps | DONE | `resolveHandler` |
| Execution individuelle | DONE | Polling job |
| Execution globale (Run All) | DONE | |
| Resultats pass/fail avec assertions | DONE | Messages detailles par step |

**Statut global Phase 2 : CODE EN PLACE, A TESTER**

Le code VCS et Tests est implemente mais n'a pas encore ete teste en conditions reelles avec un serveur T-IA Connect. Il faut valider :
- Connexion VCS avec un projet reel
- Commit + export + diff
- Execution de tests PLCSim
- Gestion des erreurs et edge cases

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
| Tag tables dans le TreeView (sous chaque device) | TODO | Liste tables + tags en lecture seule |
| UDTs dans le TreeView (sous chaque device) | TODO | Liste UDTs en lecture seule |
| Detail tag table au clic (webview ou output) | TODO | Nom, type, adresse, commentaire |
| Detail UDT au clic | TODO | Structure et membres |

### Polish UX

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Icones custom SVG par type de bloc | TODO | Remplacer ThemeIcon par icones custom |
| Rafraichir tree apres reimport | TODO | Mettre a jour l'etat de coherence |
| Detection conflit (bloc modifie dans TIA en parallele) | TODO | Comparer ModifiedDate avant reimport |
| Keybinding pour compiler (ex: Ctrl+Shift+B) | TODO | |
| Notification groupee pour multi-erreurs | TODO | |
| Setting pour desactiver auto-reimport par bloc | TODO | |

**Statut global Phase 3 : PIPELINES DONE, POLISH A FAIRE**

---

## Phase 4 — V2 (Futur)

| Fonctionnalite | Statut | Notes |
|----------------|--------|-------|
| Language Server SCL (autocompletion, go-to-definition) | TODO | LSP protocol, necessite un serveur dedie |
| Webview LAD (visualisation graphique lecture seule) | TODO | Rendering SVG/Canvas des reseaux LADDER |
| Multi-projet (switch entre projets) | TODO | Quand T-IA Connect supportera multi-projet |
| Publication Marketplace | TODO | Quand la v1 sera stable |
| QuickDiff pour VCS (diff inline dans editeur) | TODO | `quickDiffProvider` |
| Webview pour resultats de test detailles | TODO | Plus lisible qu'un QuickPick |
| Notifications push (SignalR/WebSocket) | TODO | Au lieu de polling |
| Localisation (i18n) | TODO | Francais + Anglais |

---

## Bugs connus

| Bug | Statut | Notes |
|-----|--------|-------|
| *(aucun bug connu pour le moment)* | | A remplir lors des tests |

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
| Tests list | `GET /api/testharness/tests` | 2 |
| Test details | `GET /api/testharness/tests/{name}` | 2 |
| Test run | `POST /api/testharness/run` | 2 |
| Test run all | `POST /api/testharness/run-all` | 2 |
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
