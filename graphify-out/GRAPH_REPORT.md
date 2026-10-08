# Graph Report - contentful  (2026-10-08)

## Corpus Check
- 104 files · ~55,271 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 3)

## Summary
- 714 nodes · 2762 edges · 12 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.84)
- Token cost: 83,760 input · 0 output

## Community Hubs (Navigation)
- Lógica de migración (core)
- Textos, tablas y reportes
- Contexto y flujo de comandos
- Lectura de entries y preguntas
- Seguridad, sesión y respaldo
- CLI: comandos y flags
- Versiones y garantías (docs)
- Apariencia del editor
- Dependencias (package.json)
- Configuración de Biome
- Decisiones de diseño (docs)
- Configuración de TypeScript

## God Nodes (most connected - your core abstractions)
1. `migrate()` - 49 edges
2. `steps()` - 33 edges
3. `migrateModel()` - 32 edges
4. `AbortError` - 31 edges
5. `picocolors` - 25 edges
6. `withStatus()` - 25 edges
7. `clip()` - 25 edges
8. `restore()` - 24 edges
9. `Entry` - 24 edges
10. `ContentType` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Erasable-syntax-only TypeScript rules` --references--> `Action`  [EXTRACTED]
  README.md → src/core/plan.ts
- `How to extend cfm` --references--> `classifyTree()`  [EXTRACTED]
  README.md → src/core/plan.ts
- `Parent/child entry tree` --references--> `classifyTree()`  [EXTRACTED]
  README.md → src/core/plan.ts
- `How to extend cfm` --references--> `COMMANDS`  [EXTRACTED]
  README.md → src/cli-args.ts
- `How to extend cfm` --references--> `FLAGS`  [EXTRACTED]
  README.md → src/cli-args.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **cfm commands (initial menu)** — readme_migrate_command, readme_migrate_model_command, readme_migrate_assets_command, readme_compare_models_command, readme_compare_entry_command, readme_status_command, readme_history_command, readme_restore_command [EXTRACTED 1.00]
- **Terminal UI library evaluation** — readme_clack_prompts, readme_commander, readme_ink, readme_consola, readme_listr2 [EXTRACTED 1.00]
- **Write safety guarantees** — readme_single_writer_module, readme_token_host_restriction, readme_assets_cdn_only, readme_production_confirmation, readme_pre_write_recheck, readme_never_publish_never_delete, readme_backup [EXTRACTED 1.00]

## Communities (12 total, 0 thin omitted)

### Community 0 - "Lógica de migración (core)"
Cohesion: 0.05
Nodes (110): ref_node_assert, ref_node_test, Analysis, Loaders, Report, TreeAnalysis, Backup, Asset (+102 more)

### Community 1 - "Textos, tablas y reportes"
Cohesion: 0.06
Nodes (75): @clack/prompts, picocolors, summarizeValue(), ValueStatus, EditorDiffs, CT_INFO, CtInfoPart, FieldRow (+67 more)

### Community 2 - "Contexto y flujo de comandos"
Cohesion: 0.09
Nodes (75): changesSinceAnalysis(), completeAnalysis(), defaultLoaders(), withActions(), CliArgs, repeatCommand(), compareModelsCommand(), buildContext() (+67 more)

### Community 3 - "Lectura de entries y preguntas"
Cohesion: 0.07
Nodes (68): ref_node_events, analyzeTree(), compareEntry(), LIMITS, chunk(), fetchEntries(), fetchInBatches(), IdQuery (+60 more)

### Community 4 - "Seguridad, sesión y respaldo"
Cohesion: 0.05
Nodes (58): entry, srcDir, buildIsStale(), newestSourceTime(), Contentful session / CMA token, Test isolation (no network, temporary HOME), Token sent only to Contentful API hosts, contentful-management (+50 more)

### Community 5 - "CLI: comandos y flags"
Cohesion: 0.08
Nodes (41): Version bump policy (minor = feature/behavior, patch = fix), How to extend cfm, ref_node_util, APP_NAME, pkg, VERSION, BETWEEN_ENVS, Command (+33 more)

### Community 6 - "Versiones y garantías (docs)"
Cohesion: 0.08
Nodes (41): 0.10.0 — content-type data, exact entry diff, preserved translations/tags, 0.11.0 — back navigation, environment order, Repetir everywhere, 0.12.1 — editor appearance ignores widget default settings, 0.2.0 — parent/children, backups and restore, security, 0.4.0 — menu, commands, selection methods, Markdown reports, 0.6.0 — multiple Contentful accounts per machine, 0.6.1 — model question distinguishes new content types, 0.7.0 — editor appearance migration (+33 more)

### Community 7 - "Apariencia del editor"
Cohesion: 0.08
Nodes (36): copiedControl(), DEFAULT_SETTINGS, DEFAULT_WIDGET, EDITOR_PART, EditorFieldDiff, EditorPart, effectiveSettings(), fieldEditorDiff() (+28 more)

### Community 8 - "Dependencias (package.json)"
Cohesion: 0.06
Nodes (31): bin, cfm, cfm-dev, dependencies, @clack/prompts, contentful-management, picocolors, description (+23 more)

### Community 9 - "Configuración de Biome"
Cohesion: 0.09
Nodes (22): source, assist, actions, formatter, indentStyle, indentWidth, lineWidth, quoteStyle (+14 more)

### Community 10 - "Decisiones de diseño (docs)"
Cohesion: 0.16
Nodes (19): @inquirer/prompts (replaced), 0.12.0 — faster startup (single-file build, early connection), 0.1.0 — first version (interactive entry migration in draft), 0.3.0 — build/dev commands, clack UI, isolated tests, 0.5.0 — command renamed to cfm, pnpm allowBuilds / onlyBuiltDependencies for esbuild, cfm (Contentful entry migration CLI), cfm-dev (source-code command) (+11 more)

### Community 11 - "Configuración de TypeScript"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, allowJs, checkJs, erasableSyntaxOnly, lib, module, moduleResolution (+10 more)

## Ambiguous Edges - Review These
- `Minimal pinned dependencies policy` → `pnpm allowBuilds / onlyBuiltDependencies for esbuild`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **130 isolated node(s):** `entry`, `srcDir`, `$schema`, `enabled`, `clientKind` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 152 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Minimal pinned dependencies policy` and `pnpm allowBuilds / onlyBuiltDependencies for esbuild`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `picocolors` connect `Textos, tablas y reportes` to `Lógica de migración (core)`, `Contexto y flujo de comandos`, `Lectura de entries y preguntas`, `Seguridad, sesión y respaldo`, `CLI: comandos y flags`, `Dependencias (package.json)`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `@clack/prompts (chosen terminal UI)` connect `Decisiones de diseño (docs)` to `Textos, tablas y reportes`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `migrate()` (e.g. with `pickKey()` and `registry.ts`) actually correct?**
  _`migrate()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `migrateModel()` (e.g. with `pickKey()` and `registry.ts`) actually correct?**
  _`migrateModel()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `entry`, `srcDir`, `$schema` to the rest of the system?**
  _130 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lógica de migración (core)` be split into smaller, more focused modules?**
  _Cohesion score 0.050213675213675216 - nodes in this community are weakly interconnected._