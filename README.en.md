# Lv Cards
### Full-Lifecycle Local-First Flashcard Memory Engine for SiYuan

**Current Version: v0.223.0** ｜ [Changelog](./CHANGELOG.md) ｜ [中文](./README.md) ｜ [English](./README.en.md)

**Turn your notes into long-term knowledge you can actually remember, apply, trace, revise, afford, and own.**

Built on SiYuan's native FSRS algorithm · Block-level bi-directional context tracing · Multi-modal interactive recall · R54 Modern Design System · Auditable, governed AI assistance

---

## 🎯 What Problem Does This Solve?

Knowledge workers and students often struggle with three universal learning pains: **"notes are forgotten once written, cards are made but abandoned, and backlog reviews accumulate like an insurmountable debt."**

Lv Cards (`siyuan-lv-cards`) solves this by treating **SiYuan's native FSRS间隔重复 (Free Spaced Repetition Scheduler)** as the single source of truth. It establishes a complete, closed-loop learning journey: from ambient reading material capture and atomic authoring, to multi-sensory active recall testing, leech card quarantine, and loss-free cross-platform export.

---

## 🆕 What's New

### v0.223.0 (Latest)
* **Relocated Hub sub-navigation by task**: Moved Maintenance under Library, Material Inbox under Studio, and Recovery into Today's action section—leaving Learning focused purely on Goals/Recap and Exam Sprints while keeping all legacy route IDs compatible.
* **Slimmed Today deep-stats & promoted deck actions**: Placed deck rename, `.lvcards` share export, and delete directly on first-screen deck rows; trimmed duplicate deck/forecast tables from folded deep-stats to keep only Heatmap, Calendar, Retention, Leeches, and Error Reasons.
* **Refined Onboarding & topbar landing**: Moved persona selection cards to the top of Onboarding Step 1, clarified QA card copy, and ensured clicking the topbar icon always lands cleanly on Today—completing Stage B (Usability).

<details>
<summary>📜 View Historical Releases (v0.222.0 ~ v0.210.0)</summary>

* **v0.222.0**: Streamlined review toolbar to 5 core buttons, unified Session Preferences and the 3-way Remove from Review modal, fixed cloze focus hijack, and kept the rating bar above the fold at 1024px and 150% zoom.
* **v0.221.0**: Fixed SuperBlock QA authoring & Maintenance false positives; archived 42 unreachable experimental core modules and aligned bilingual docs.
* **v0.220.0**: Fixed second-card "document path is ambiguous" errors, onboarding sample-card empty false positives, image-occlusion target/opacity/edit-readback bugs, review settings forwarding, scoped custom card CSS, timed-challenge answer masking, version-acceptance refresh, and `.lvcards` conflict strategy selection.
* **v0.219.0**: Undo no longer rolls back historical revlog entries for skipped/requeued/Cram cards; `Ctrl+D` dismissal can be undone; Cram sessions isolated from formal daily state; starred-card persistence, dismissed-card filtering and done-screen targeted Cram.
* **v0.218.0**: Added Leech card warning banner, H-key graded cueing, breadcrumb block locator, sibling card dispersal, 7-day workload forecast bar chart, Cram quick review, and R54 design system refinement.
* **v0.217.0**: Landed 22-slot immutable snapshot persistence queue, cross-tab deck scope propagation, incremental revlog rollback, and global command registration.
* **v0.212.4**: Added presentation privacy mode, review card source breadcrumbs, and `.lvcards` diff inspector (unwired experimental modules such as scalar numeric policy have been moved to `archive/`).
* See [CHANGELOG.md](./CHANGELOG.md) for full details.

</details>

---

## ⚡ Core Feature List

### 1. In-Depth Note Authoring & Bi-Directional Tracing
* **Native Block-Level Tracing**: Cards are strongly tied to SiYuan's underlying `block_id`. The card header displays an interactive breadcrumb trail, allowing one-click navigation back to the original source note.
* **Context Slide-Out Drawer**: Encountering doubt during review? Press a shortcut or click to slide out a drawer revealing the 2 preceding and 2 succeeding blocks of the source note—clarifying context without leaving the review flow.
* **Highlight Cloze & Heading Tree Masking**: Highlight key text with `==` to instantly generate cloze cards. Supports multi-level heading tree clozes and sequential cloze reveals.
* **SuperBlock Structured QA**: The first block acts as the question, with nested child blocks serving as multi-point answers—physically masked until reveal to prevent spoiler leaks.
* **Bi-Directional Memo Synchronization**: Jot down personal mnemonic cues or insights during review; memos automatically sync back to the original block attribute.

### 2. Scientific Retention Review & Multi-Modal Recall
* **Native FSRS Algorithm**: Built directly upon SiYuan's native FSRS-5 algorithm. Replaces crude SM-2 multipliers by accurately fitting memory retention curves.
* **4-Level Hint Ladder**: Staggered assistance when stuck (press `h`): Recall Target $\to$ Core Keywords $\to$ Context Clues $\to$ Full Answer. Eliminates binary pass/fail frustration.
* **Same-Session Requeue**: Cards rated as *Again* are seamlessly reintroduced minutes later within the same session for immediate reinforcement.
* **LCS Dynamic-Programming Typing Verification**: Type answers on keyboard with character-level diff highlighting via Longest Common Subsequence (LCS) algorithm.
* **Real-Deck Distractor Choice Practice**: Dynamically extracts genuine candidate answers from other cards in the same deck to form multiple-choice drills, gracefully falling back to free recall when distractors are sparse.
* **Image Occlusion & Excalidraw Canvas Integration**: Mask regions on diagrams and schematics. Direct 1-click jump into SiYuan's native Excalidraw whiteboard editor.
* **Local Web Speech TTS**: 100% offline speech synthesis for hands-free audio listening and pronunciation drills.

### 3. Asset Governance, Pace Control & Interoperability
* **Leech Card Quarantine & Remediation**: Automatically tags and warns cards failing past the lapse threshold (default 8 lapses), guiding users to break down complex cards.
* **7 Cognitive Error Reason Tags**: Categorize lapses on the fly (concept confusion, misread question, unfamiliar material, defective card) for targeted remediation.
* **Session Budget & Pomodoro Timer**: Set 15/25/30 minute study budgets. Gentle completion alerts prevent cognitive exhaustion.
* **Exam Sprint (Cram Mode)**: Review cards ahead of schedule for upcoming exams without corrupting your daily FSRS schedule.
* **Future 30-Day Load Forecast Calendar**: Visualizes predicted review peaks over the next 7 to 30 days.
* **Open Ecosystem**: Local parsing and import of Anki (`.apkg`) packages, bi-directional lossless sync with Obsidian Spaced Repetition (SR) Markdown, and `.lvcards` structured bundle sharing.

### 4. R54 Modern Design System & Dual-Tone Order
* **Two-Layer Floating Architecture**: Subtle tinted canvas (`#F7F7FA`) anchoring pure white floating cards (`#FFFFFF`) with a 2.5% lightness delta and multi-layer downward soft diffuse shadows (Elevation 1/2/3).
* **Two-Color Semantic Separation**: Periwinkle Purple (`#5E59CB`) governs interactive actions and navigation; Cyan Sky Blue (`#0284C7`) exclusively governs positive performance metrics, streaks, review counts, and retention rates.
* **Dark Contrast Accent Card**: The streak card adopts a deep periwinkle-tinted near-black tone (`#171723`, lightness 12%) with high-contrast text to introduce rhythm.
* **4× Extreme Typography Contrast Ratio**: Key numbers scale to 44px (`--lv-type-display-hero`) in tabular numerals, creating a 4.0× visual contrast against 11px auxiliary captions.
* **Touch Target & Line Width Protection**: Automatic touch expansion ($\ge 44\text{px} \times 44\text{px}$) on coarse pointer devices and 48em maximum line-width protection for CJK reading comfort.

---

## 📥 Installation

### Method 1: SiYuan Official Bazaar (Recommended)
1. In SiYuan, navigate to: **Settings → Bazaar → Plugins**;
2. Search for `小驴闪卡` or `siyuan-lv-cards`;
3. Click "Install" and enable the plugin.

### Method 2: Manual Package Import
1. Download the latest `package.zip` from [GitHub Releases](https://github.com/ai68298100/siyuan-lv-cards/releases/latest);
2. In SiYuan, open: **Settings → Bazaar → Downloaded → Import Package**;
3. Select the downloaded `package.zip` and enable the plugin.

---

## 🚀 Quick Start (3 Steps)

```text
[ Select Note Text ] ──(== Cloze / Block Menu)──> [ Press Alt+K to Review ] ──(Space to Reveal / 1-4 Rating)──> [ Native FSRS Scheduling ]
```

1. **Step 1: Notes as Cards**
   * Highlight key terms in any SiYuan document and type `==` to make a cloze card (e.g., `Paris is the capital of ==France==`);
   * Or click the icon to the left of any block and select **"Add to Deck"**.
2. **Step 2: Enter Focus Review**
   * Press **`Alt+K`** (or click the topbar icon). If you have cards due today, the immersive review workbench launches immediately.
3. **Step 3: Active Recall & Rating**
   * Recall the hidden answer, then press **Space** to reveal;
   * Rate your recall using number keys:
     * **`1` (Again)**: Complete lapse; requeues card for same-session practice;
     * **`2` (Hard)**: Recalled with effort;
     * **`3` (Good)**: Normal, correct recall;
     * **`4` (Easy)**: Instant, effortless recall;
   * Native FSRS calculates the optimal next review interval automatically.

---

## 🧭 Main Workspace Panels

| Workspace Panel | Purpose & Capabilities |
| :--- | :--- |
| **Today's Action (Today)** | Daily launchpad: Displays cards due today, goal ring, dark streak card, weekly activity grid, deck quick access, and dormant uncarded knowledge block discovery. |
| **Card Library (Library)** | Full-library search, status filters (New/Review/Due), card-type filters (QA/Cloze/SuperBlock), starred flags, batch add/move/delete, and CSV/Obsidian export. |
| **Card Detail Drawer** | Slides out from any card: Content preview & real-time markdown editing, source block jump with diff comparison, review history log, version snapshots, knowledge object (KO) inspection, and relation graphs. |
| **Authoring Studio (Studio)** | **Manual Authoring**: QA/Cloze/SuperBlock templates with live card face rendering;<br>**AI Wizard**: Material import, preflight consent modal, academic prompt templates, per-candidate vetting, and flashcard quality gates;<br>**Repair Drill**: Interactive tutorial teaching how to repair ambiguous cards. |
| **Learning & Calendar** | **Recap**: 7-day trend charts and recent logs;<br>**Goals**: Exam target dates and daily quotas;<br>**Calendar**: Monthly heatmaps, future 30-day forecast load calendar, and date-level drilldowns. |
| **Recovery Center** | Consolidates interrupted review sessions, pending inbox items, unfinished AI jobs, and suspended cards with 1-click restore. |

---

## ⚙️ Settings Reference (Defaults & Impact)

| Category | Option | Label | Default | Description & Impact |
| :--- | :--- | :--- | :---: | :--- |
| **Modules** | Core Module Toggles | `Stats` / `Review` / `Library` / `Inbox` / `Goals` / `Exam` / `Maintenance` / `XP` | All Enabled | Controls navigation visibility without deleting data. Deep links display friendly enable cards. |
| **Rhythm** | Daily New Target | `Daily New Target` | **10** | Quota of new cards introduced per day. Set to `0` for unlimited. |
| **Rhythm** | Daily Review Target | `Daily Review Target` | **20** | Goal used to calculate the completion ring. Set to `0` for unlimited. |
| **Rhythm** | Direct Review on Topbar Click | `Direct Review on Click` | **Enabled** | When cards are due, left-clicking the topbar icon opens review directly; otherwise opens Hub. |
| **Rhythm** | Random Review Order | `Random Order` | **Disabled** | Shuffles the review queue. When disabled, cards appear in logical document sequence. |
| **Rhythm** | Sibling Card Dispersal | `Bury Siblings` | **Enabled** | Delays brother/sister cards from the same block to prevent consecutive spoilers. |
| **Grading** | Rating Mode | `Rating Style` | **Four-Button** | Choose between `Four-Button` (Again/Hard/Good/Easy) or `Three-Button` (Again/Hard/Good). |
| **Grading** | Timeout Action | `Timeout Mode` | **Off** | Options: `Off`, `Auto Reveal`, `Auto Again`. Ideal for timed mock exams. |
| **Grading** | Timeout Seconds | `Answer Time Limit` | **60s** | Per-card active recall countdown timer (range 5s ~ 3600s). |
| **Grading** | Leech Threshold | `Leech Threshold` | **8** | Flags cards as leeches when total lapses reach this number. |
| **Speech** | Text-to-Speech (TTS) | `TTS Speech` | **Disabled** | Automatically speaks the answer on flip using local system voices. |
| **Appearance** | Card Font Scale | `Card Font Scale` | **1.0×** | Scaler (0.85× ~ 1.25×) with live in-situ card preview in settings. |
| **Appearance** | Custom Card CSS | `Custom Card CSS` | Empty | User-defined CSS injected directly into the card reading viewport. |
| **Appearance** | Rating Density | `Rating Density` | **Cozy** | Toggles between cozy and compact rating button heights. |
| **Appearance** | Heatmap Span | `Heatmap Span` | **26 Weeks** | Span of weeks displayed in dashboard heatmap (17 / 26 / 52 weeks). |
| **AI Provider** | Provider Mode | `AI Mode` | **SiYuan Native** | Choose between `SiYuan Native AI`, `Custom Endpoint`, or `Disabled`. |
| **AI Provider** | API Endpoint | `API Endpoint` | Empty | Custom OpenAI-compatible endpoint URL (e.g. DeepSeek, Ollama). |
| **AI Provider** | Connectivity Test | `Test AI Connection` | — | Sends test ping and displays status code and response diagnostics. |
| **AI Provider** | Prompt Template | `System Prompt` | **Academic QA** | Select built-in academic distillation templates or enter custom prompt. |
| **AI Provider** | Emergency Killswitch | `Emergency Killswitch` | **Active** | 1-click pause and revoke for pending AI requests; local cards unaffected. |
| **AI Provider** | Monthly Token Budget | `Monthly Token Cap` | **Disabled** | Sets hard token ceiling; halts outbound generation when exceeded. |

---

## ⌨️ Shortcut Reference

All shortcuts can be customized in SiYuan under **Settings → Shortcuts**:

### 1. Global & Navigation Shortcuts
* **`Alt+K`**: **Open Command Palette** (search actions, jump to pages, quick operations)
* **`Space`**: Start review or continue active session (on Today dashboard)
* **`==`**: Wrap highlighted selection into cloze card (in editor)

### 2. Review Workbench Shortcuts
* **`Space`**: **Reveal answer** / Reveal next cloze segment
* **`Shift+Space`**: Reveal all cloze segments at once
* **`1`**: Rate **Again** (lapse)
* **`2`**: Rate **Hard**
* **`3`**: Rate **Good**
* **`4`**: Rate **Easy** (in 4-button mode)
* **`p` / `q`**: **Undo last action** (rolls back queue, counters, dismissal state, and returns to previous card)
* **`*`**: **Star / unstar current card** (syncs with Card Library starred filter)
* **`x` / `0`**: **Skip current card** (excluded from current session without rating)
* **`s`**: **Suspend for today** (postpones until tomorrow)
* **`e` / `E`**: **Jump to source** (opens original note block in SiYuan editor)
* **`m`**: Edit mnemonic memo for current card (syncs back to source block)
* **`f`**: Open quick reschedule modal (postpone due date)
* **`Ctrl+D` / `⌘+D`**: Dismiss / archive current card immediately (undoable via `p`/`q`)
* **`h` / `H`**: Advance Hint Ladder (Target $\to$ Keyword $\to$ Context $\to$ Answer)
* **`[`**: Peek at the previously answered card

### 3. Library & List Shortcuts
* **`↑` / `↓`**: Navigate and highlight card rows
* **`Enter`**: Open detail drawer for highlighted card
* **`Delete`**: Prompt to delete highlighted card
* **`Esc`**: Close card detail drawer or cancel batch selection

---

## ❓ Frequently Asked Questions (FAQ)

### Q1: I misrated or dismissed a card by accident. How do I undo?
* **Answer**: Press **`p` or `q`** or click the "Undo" button on the top toolbar. The previous card is immediately restored to your screen, dismissal state and counter statistics roll back, and your session resumes seamlessly. Note that because SiYuan's native kernel API does not provide a rating cancellation endpoint, re-rating will apply your corrected score.

### Q2: If I switch computers or reinstall SiYuan, will my cards and logs survive?
* **Answer**: Yes, completely. Lv Cards is **local-first**:
  1. Card scheduling data is stored directly in SiYuan's native `riff` database and synchronizes alongside your notebooks;
  2. Plugin settings, review logs, and goals live in `data/storage/petal/siyuan-lv-cards/` within your workspace;
  3. When moving devices, syncing your workspace directory automatically restores all data. You can also export a full JSON backup under **Settings → Data & Backup**.

### Q3: Why does "Pairing Game" say "Not enough cards"?
* **Answer**: The pairing game requires at least 4 cloze pairs. The engine first looks for cards due today; if you have finished all due cards, it gracefully falls back to pulling random cloze cards from your entire library. If your library contains zero cloze cards (`==cloze==`), author a few cloze cards first to play.

---

## 🔒 Data Storage & Privacy

> **Zero Telemetry · Zero Tracking · No Private Cloud · Absolute Data Ownership**

Lv Cards contains zero third-party analytics or telemetry SDKs. Aside from explicit outbound AI generation requests you actively confirm, **all functionality runs completely offline in your local environment**.

### Local Data Files (stored in `data/storage/petal/siyuan-lv-cards/`):
* `settings.json`: User preferences, module toggles, and algorithm options.
* `revlog.json`: Local review history logs (timestamps, card IDs, ratings, duration).
* `exam-plans.json`: Sprint goals, target scopes, and review quotas.
* `learning-goals.json`: Personal learning goals and progress records.
* `inbox.json`: Unprocessed material blocks in the inbox queue.
* `source-health.json`: Block validity checks and source fingerprint history.
* `ai-deny-list.json`: Outbound AI blacklists and whitelists.
* `ai-killswitch.json`: Emergency killswitch state and safety event audit logs.

---

## 💻 Compatibility & Environment

* **Minimum SiYuan Version**: **$\ge 3.8.4$**
* **Supported Platforms**: Windows, macOS (Intel & Apple Silicon), Linux, iOS, iPadOS, Android, HarmonyOS, Docker Web
* **Responsive Layouts**: Designed for 1280px+ desktop workstations, tablet splits, and 320px~390px mobile screens with touch target expansion ($\ge 44\text{px}$).

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE). Open source and community-driven.
