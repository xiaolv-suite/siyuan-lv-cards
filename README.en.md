<div align="center">

# Lv Cards (Beta) · 小驴闪卡（内测版）

**Turn your notes into long-term knowledge you can actually use.**

The full-lifecycle flashcard learning platform for SiYuan — local-first, native FSRS scheduling, auditable AI assistance

中文 ｜ [English](./README.en.md)

[![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-lv-cards)](https://github.com/ai68298100/siyuan-lv-cards/releases/latest)
[![CI](https://github.com/ai68298100/siyuan-lv-cards/actions/workflows/ci.yml/badge.svg)](https://github.com/ai68298100/siyuan-lv-cards/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![SiYuan >= 3.8.0](https://img.shields.io/badge/SiYuan-%3E%3D%203.8.0-blue)](https://b3log.org/siyuan/)

![Lv Cards preview](preview.png)

</div>

> **Note**: The primary README and all design docs are in Chinese. This page covers the essentials; see [docs/](./docs/README.md) for full design material.

Lv Cards turns blocks worth remembering into traceable flashcards, scheduled by SiYuan's native FSRS algorithm with optional, auditable AI assistance. The current version is **v0.217.0** (2026-10-29), delivering quality hardening, critical bug fixes, accessibility enhancements, and large-library scalability optimizations. See [GitHub Release](https://github.com/ai68298100/siyuan-lv-cards/releases/tag/v0.217.0) for the package and publishing status.

## What's New in v0.217.0 (2026-10-29)

- **Critical Bug Fixes**:
  - Fixed rating submission deadlock and requeue exception handling in `ui/review.svelte`.
  - Fixed `undo` (`p`/`q`) shortcut to respond directly on question-face without forcing flip to answer.
  - Corrected review accuracy and retention formula in `core/review-queue-pipeline.ts` and `ReviewDonePanel.svelte`.
  - Fixed reschedule target timestamp timezone drift in `core/reschedule-preview.ts`.
  - Fixed scoped `dueCache` query routing in `api/due-shared.ts`.
  - Cleaned up Anki import temporary SQLite directory upon close in `api/anki-host.ts`.
  - Fixed `isSuspended` rollover across calendar days.
- **UI & Accessibility Improvements**:
  - Scoped `.lv-drawer` inside design token inheritance in `index.scss`.
  - Calibrated dark mode WCAG AA 4.5:1 contrast and resolved missing design tokens.
  - Implemented WAI-ARIA modal dialog focus trapping via Svelte action `use:trapFocus`.
  - Cleaned up nested interactive buttons in `ReviewCardBreadcrumbs.svelte`.
- **Large-Library Performance Optimizations**:
  - Eliminated redundant deep cloning passes during review rating in `index.ts`.
  - Reduced `knownCards` lookup complexity from $O(N)$ to $O(1)$ with `WeakMap` set caching in `core/revlog.ts`.
  - Added adaptive candidate window pre-truncation before SQLite quality queries in `ui/review.svelte`.
  - Pre-cached stripped plain text and decoupled derived sets in `ui/manager.svelte`.
- **Quality Gates**:
  - 2315 tests across 289 test suites 100% passing; 0 TypeScript errors; 0 Svelte diagnostics; distribution smoke tests green.

<details>
<summary>📜 View Historical Release Notes (v0.216.3 and earlier)</summary>

### v0.216.3 (2026-10-29)
- **Queue Exclusion & Active Session Filtering Decoupled (`core/review-queue-pipeline.ts`)**: Extracted `combineExcludedCardIDs`, `filterActiveSessionCards`, and `mergeQualityExcludedCardIDs`.
- **Countdown Resume Guard Decoupled (`core/review-countdown.ts`)**: Extracted `shouldRestartCountdownOnResume`.
- **Verification**: 289 test files, 2314 tests passing.

### v0.216.2 (2026-10-29)
- **CanRate Guard & Rating Haptics (`core/card-actions.ts` & `core/haptic.ts`)**: Extracted `canRateCurrentCard` and `getRatingHapticPattern` for unified rating pre-check and vibration patterns.
- **Review Root Focus Controller (`core/card-interactions.ts`)**: Extracted `focusReviewRootOrCard` for standardized focus restoration.

### v0.216.1 (2026-10-29)
- **Container Event Boundary Guard (`core/card-interactions.ts`)**: Extracted `isEventInsideContainer` for unified container target detection.
- **Reset Session Progress Payload (`core/session-state.ts`)**: Extracted `createResetSessionProgress` for normalized state reset.

### v0.216.0 Milestone (2026-10-29)
- **Card Face Ready & Scope Normalization (`core/card-face.ts` & `core/scope-preset.ts`)**: Extracted `isCardFaceReady` and `normalizeScopeKey`.
- **HPath Query SQL Builder (`core/review-breadcrumbs.ts`)**: Extracted `buildHPathQuerySql` with SQL injection defense.
- **Verification**: Over 2300 unit tests passing.

### v0.215.0 Milestone (2026-10-29)
- **Queue Slicing & Last Answered Snapshot (`core/card-actions.ts`)**: Extracted `createLastAnsweredSnapshot` and `sliceQueueAfterCurrent`.
- **I18n Path Resolution (`core/return-check.ts`)**: Safe nested path dictionary reading.

### v0.214.0 Milestone (2026-10-29)
- **Main Review Component Lines Reduced from 3412 to 2342 Lines (-1070 lines)**.
- **8 Dedicated Subcomponents Extracted**: `ReviewReadyDashboard`, `ReviewToolbar`, `ReviewRatingBar`, `ReviewErrorTagBar`, `ReviewCountdownBanner`, `ReviewRescheduleModal`, `ReviewSessionPrefs`, `ReviewContextDrawer`.

### v0.212.4 (2026-10-28)
- **ReviewReadyDashboard Component Modularization (`ReviewReadyDashboard.svelte`)**: Scope quick-switch pill, quality exclusion alerts, bento grid (cram, authoring, deck management).

### v0.211.0 Milestone (2026-10-28)
- **Two-tier Progressive Learning Scheduling (SuperMemo philosophy)**: `shouldBypassFsrs` protocol separating raw extracts from FSRS, `Ctrl+D` dismiss archive.
- **SuperBlock Flashcards 100% Aligned**: First block as question, remaining blocks as answer with answer-side masking.
- **SVG / Excalidraw Canvas Direct Editing**: Double-click canvas to zoom into native Protyle editor.
- **Design Token Coverage Reached 97.4%**.

> For complete historical release notes, please see [CHANGELOG.md](./CHANGELOG.md).
</details>

## 📸 Screenshots

| Overview — pick up where you left off | Review — recall first, check, then grade |
|---|---|
| ![Overview](./asset/screenshots/overview.png) | ![Review](./asset/screenshots/review.png) |
| **Manager** — back to content, with source & history | **Rating bar** — 4-button grading with interval preview |
| ![Manager](./asset/screenshots/manager.png) | ![Rating](./asset/screenshots/review-rating.png) |

## ✨ Features

| Module | Highlights & Purpose |
|---|---|
| 🃏 **Active Recall & FSRS** | Native FSRS scheduling with next-due preview · source-context preview & drawer · hierarchical breadcrumbs · hint ladder (4 levels) · forgotten-card short loop requeue · undo · session resume |
| ✍️ **Deep Note Authoring** | Block-level card creation (multi-select) · cloze deletion (`==`) · outline tree cloze · SuperBlock Q/A · syntax scanner (`term :: definition`) · AI batch generation with 12 prompt templates |
| 🎯 **Interactive Question Types** | Type-in grading with LCS character diff · TTS dictation & read-aloud · local distractor multiple-choice & true/false · image & canvas occlusion · double-click SVG/Excalidraw canvas editing · mixed rotation |
| ⏱️ **Flow & Anti-Fatigue** | Session duration budget with countdown HUD · 25-minute Pomodoro alert · timeout modes · 4-branch interruption recovery · long-return checkup & load relief choices |
| 🗂 **Card Management & Debt Governance** | Paged browsing with multi-filter · 4-facet detail drawer (content/source/history/diagnostics) · leech warning & debt queue · private memo notes · one-click dismiss (`Ctrl+D`) & archive |
| 📊 **Stats & Goal Tracking** | Study calendar with load forecast · deck dashboard with due/retention ranking · retention & interval curves · streak celebration · automated weekly review report |
| 🛡 **Auditable AI** | Works offline or without AI · 4-gate safety chain (zero-token preflight, prompt injection sandbox, context budget truncation, emergency kill-switch) · manual card-by-card approval |
| 📦 **Ecosystem & Data Mobility** | Seamless Lv ecosystem bridge (Speed Switch, Checkin, Glean, Contacts) · two-way Obsidian SR import/export with deck mapping · Anki `.apkg` import · full CSV/JSON log export |

## 🚀 Install

SiYuan ≥ 3.8.0. Desktop is the core experience; mobile and browser are narrow-screen adapted (390px structural walkthrough recorded), while the full Android SiYuan host matrix remains pending.

1. Download `package.zip` from the [latest release](https://github.com/ai68298100/siyuan-lv-cards/releases/latest) (do **not** unzip)
2. SiYuan → Settings → Marketplace → Download → "Import package" → pick the zip
3. Enable "Lv Cards (Beta)" under Downloaded

## ⌨️ Quick start

1. Select a block → block icon → **Add to deck**
2. Press **Ctrl+K** for the command palette, or click the **donkey badge** in the top bar
3. In review: **Space** flips, **1-4** rates, `?` shows all shortcuts

## 📚 Docs

Full design docs in [docs/](./docs/README.md) (Chinese). The [R54 interactive prototype](./docs/prototypes/lv-cards-r54.html) is the single source of truth for UI structure, visual language, copy, interaction states, and responsive breakpoints; compare implementation evidence in the [R54 acceptance ledger](./docs/45-R54实现对照与验收台账.md) and component APIs in the [component catalogue](./docs/46-组件目录与状态契约.md). [R53 design spec](./docs/42-UI设计规范-R53.md) is retained as a historical reference. See also [product positioning](./docs/41-竞品调研与定位强化.md) · [user guide](./docs/21-用户上手指南.md) · [FAQ](./docs/20-FAQ与故障排查.md) · [privacy](./docs/PRIVACY.md). For development, see [CONTRIBUTING](./CONTRIBUTING.md); report bugs through [Issues](https://github.com/ai68298100/siyuan-lv-cards/issues) and security problems through [SECURITY](./SECURITY.md).

## 🗺 Roadmap

| Priority | Item | Status |
|---|---|---|
| P0 | ⌘K command palette | ✅ v0.206.3 |
| P0 | Learning calendar & load forecast | ✅ v0.206.4 |
| P1 | Weekly report | ✅ v0.206.7 |
| P1 | Deck dashboard | ✅ v0.206.8 |
| P1 | Share pack (deck-level Obsidian SR export) | ✅ v0.206.9 |
| P2 | 390px narrow-screen structural walkthrough | ✅ v0.206.10 |
| P1 | Starline UI overhaul (page heads / complete states / micro-motion / narrow screen / review polish) | ✅ v0.208.0 |
| P2 | Full Android SiYuan host matrix | Pending |
| P2 | Templates & fields | Deferred |

## 🤝 Lv Ecosystem Plugins

Each plugin in the Lv series is standalone and can be used independently or in concert:

| Plugin | Brief Description | GitHub Repo |
|---|---|---|
| [Lv Speed Switch](https://github.com/ai68298100/siyuan-speed-switch) | Unified workspace navigation and context platform connecting tabs, snippets, and workspaces. | [ai68298100/siyuan-speed-switch](https://github.com/ai68298100/siyuan-speed-switch) |
| [Lv Checkin](https://github.com/ai68298100/siyuan-checkin) | Local-first habit and goal check-in workbench with statistics, reminders, and note linking. | [ai68298100/siyuan-checkin](https://github.com/ai68298100/siyuan-checkin) |
| [Lv Contacts](https://github.com/ai68298100/siyuan-contacts) | Contact and relationship management in SiYuan with organization groups and birthday reminders. | [ai68298100/siyuan-contacts](https://github.com/ai68298100/siyuan-contacts) |
| [Lv Glean](https://github.com/ai68298100/siyuan-glean) | Web clipper and inbox organizer with read-later triage and progressive extraction. | [ai68298100/siyuan-glean](https://github.com/ai68298100/siyuan-glean) |
| [Lv Exam (Beta)](https://github.com/ai68298100/siyuan-exam) | Exam preparation workbench supporting question bank import, practice, recitation, and mock exams. | [ai68298100/siyuan-exam](https://github.com/ai68298100/siyuan-exam) |
| [Lv Home (Beta)](https://github.com/ai68298100/siyuan-home) | Household and family inventory, member records, warranties, and expiration tracking. | [ai68298100/siyuan-home](https://github.com/ai68298100/siyuan-home) |
| [Lv Cards (Beta)](https://github.com/ai68298100/siyuan-lv-cards) | Full-lifecycle flashcard memory engine with native FSRS scheduling and auditable AI. | [ai68298100/siyuan-lv-cards](https://github.com/ai68298100/siyuan-lv-cards) |
| [Lv Common (Beta)](https://github.com/ai68298100/xiaolv-common) | Fast insertion of reusable text, templates, code snippets, and variable expansion. | [ai68298100/xiaolv-common](https://github.com/ai68298100/xiaolv-common) |

QQ Group: **871707735**

## 🙏 Credits

- Built on [plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte)
- Scheduling: SiYuan kernel's native [go-fsrs](https://github.com/open-spaced-repetition/go-fsrs)
- Research: Anki, Obsidian Spaced Repetition, RemNote, Mochi, Quizlet, Knowt, and SiYuan community plugins — see [docs/41](./docs/41-竞品调研与定位强化.md)

## License

[MIT](./LICENSE) © ai68298100
