# Capstone — INFO 492 Team 2 — Demo 3

Demo 3 maintains a living construction task board from incoming RFIs, field requests, and coordination documents. It proposes shared groups for related work, links essential duplicates, preserves distinct requirements, checks approved answers, and flags new conflicts. Each proposal explains its source evidence and how it would change the existing board. A person reviews and applies the changes. The project PC runs Qwen 3.5 27B locally; no cloud model or paid fallback is configured.

Live website: https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/

The [Evergreen Workspace guide](docs/client-workspace.md) covers client signup, project sharing, the new queue for all three workflows, local verification, and release status.

Start with the [one-page quick start](docs/quick-start.txt). The sanitized [consolidation benchmark report](docs/consolidation-results.txt) contains the final V12 fresh results, timing comparison, residual wording issues, and all preserved development history. The final hosted aggregate was separately deployed and checked. Raw run evidence stays local; the repository report preserves a sanitized history and the limitations.

V12 passed 18/18 labeled requirements in development, 18/18 in informed regression, and 12/12 in reserved transfer. Development and informed regression each passed 2/2 shared-group checks; transfer did not assess shared grouping. These synthetic, agent-authored checks are separate from independent human validation, RFI reduction, and learning gains, none of which has been established. The report records the remaining explanation/citation issues despite the passing labeled scores.

Pairing is saved, but the PC processes work only while the manually opened Capstone app is **On**. Earlier triage jobs and reviews are retained. Their historical 27.28-second online setup check does not measure the new consolidation workflow, RFI reduction, or human accuracy. Fresh consolidation benchmarks retain their own model outputs, source snapshots, input hashes, timing, and separately frozen reference labels.

## Document-to-board workflow

1. Import PDF, DOCX, TXT, or a prepared JSON batch, or paste source excerpts. PDF/Word text extraction happens in the browser. Review the extracted text and metadata before queueing; original binary files are not uploaded. Scans, handwriting, and diagrams need verified text because OCR is not included.
2. Each new batch is analyzed against a frozen revision of the existing board. The model extracts atomic requirements, proposes placements, and checks the decisions in a separate pass for missing details, false matches, and unsupported answers. All three passes use the same model; the check is not independent human validation.
3. Review every item: create a task, add a distinct subtask, link a duplicate, retain an approved answer, flag a conflict, or keep an uncertain request open for review. Correct or reject a recommendation with a reason. Grouping alone never resolves a question.
4. Apply the reviewed batch. Original submitted text, added deadlines, exact quotes, proposed decisions, corrected decisions, and reasons remain traceable. A stale proposal cannot overwrite newer work; rerun it against the latest board.
5. Move or split tasks, record an answer with current approved evidence, reopen work, or undo the latest change. Undo creates another board revision and retains documents and history. Reviewed source-status changes reopen answers that relied on evidence no longer current or approved.

Incoming batches allow 12 documents and 30,000 source characters, with 24 extracted requirements. The stored demonstration board is bounded to 120 tasks, 120 documents, and 120,000 source characters; the model also checks its smaller context capacity and refuses oversized analysis rather than silently dropping source text. Use focused excerpts and small batches. A source ID cannot silently acquire different content or a different revision.

## Run a demo session

Open `Open Demo 3.cmd` at the repository root (the existing Capstone workspace shortcut also remains supported). For a new clone or PC, follow [Windows setup](docs/setup.txt); runtime/model files and access keys are deliberately excluded from Git. It opens a visible Windows application, initially **Off**. Opening the app does not start the model, load the GPU, or poll the online queue.

Click **On** when you want to run the project demo. The app starts its local model and companion, then checks the website for queued document batches and earlier questions. Its visible status distinguishes **Starting**, **On**, **Stopping**, and **Off**. Each fresh app launch starts Off, even when pairing is already saved.

Click **Off** to stop queue processing and interrupt any active local analysis. The app stops the model and companion it started, releasing their hardware use. Close the application to stop its owned processes and exit. There is no tray-only mode, automatic startup, scheduled background launch, or browser page that silently keeps the PC model running. The website browser and the Windows app are separate: the Windows app controls local processing.

The app does not adopt or terminate another demo's already-running model service. If its required local ports are occupied, it stays Off and reports the conflict. Close the other demo deliberately before trying On again.

For a newly paired PC, the website owner creates a one-time code in **Connection & access**. Pairing checks the project identity and verified Free status. Saved pairing is only connection information; it does not authorize processing automatically. A connection change is an explicit action, and the app stays Off until On is selected.

The original project PC was paired during setup; a fresh clone is not paired. For another browser, obtain an authorized project key from the project owner and use **Connect workspace** on this exact website. Give teammates separate operator/reviewer keys through **Connection & access**. Credentials stay in protected local storage and are not included in this repository. The runner cannot retrieve or display the owner key.

The website remains reachable while the app is Off or closed and while the PC is off. Questions wait for an explicitly enabled demo session. An interrupted claim is returned for retry where possible, or becomes recoverable after its lease expires. A question can require attention if its retry limit has been reached; an unfinished answer is not presented as a completed result. Record the actual periods during which the app is On for any multi-day experiment. Merely leaving the website open does not improve the model.

On November 2, the old hidden runner, companion, and Capstone model processes were stopped at the user's request. A read-only Windows audit found no Capstone entries in Run/RunOnce, the user or common Startup folders, scheduled tasks, or Windows services. The manual application replaces the previous persistent background launch behavior.

## Free account isolation

The account **Capstone - INFO 492 Team 2** was created with explicit user approval on November 2, 2026. The dashboard displayed **Workers Free — Current plan**. The original paid account is explicitly blocked by the deployment configuration generator.

Only Workers Free, static assets, D1 Free, and the provided `workers.dev` address are part of this design. No payment details, paid subscription, custom domain, R2, Workers AI, paid queues, or paid fallback are required. Reaching free limits should interrupt service until capacity resets; do not upgrade automatically. Re-check the plan before any later deployment or billing change. The plan verification flag records a check; it is not a live billing monitor or a promise that Cloudflare policies never change.

The original Capstone-only deployment key expired November 9 Pacific (`2026-11-10T07:59:59Z`). Publishing a new release requires a fresh, short-lived Capstone account-owned key with Workers Admin and D1 Write. The deployed website and PC pairing use separate credentials. Deployment evidence and sanitized logs are local under `app/.capstone-local/cloudflare-deployment/`.

The deployment publishes only the files in `public/` and the Worker. Do not publish the source archive, the old demo repository, model weights, local audits, access tokens, or evaluation answer keys. Source excerpts submitted by the team are stored in the hosted database, so use synthetic material or material explicitly authorized for this destination. The real-project restriction against recording and AI note-taking still applies.

## What counts as evidence

- Consolidation quality is measured by correct action and target, retention of essential requirements, exact quotations, duplicate detection, incorrect merges, inappropriate answered classifications, and preservation of distinct tasks within shared groups. A lower card count is not a quality score.
- Frozen development and separate evaluation cases are synthetic and agent-authored. Once an evaluation informs tuning, later runs on it are informed development, not untouched tests. A fresh transfer set must retain its actual exposure status. Preserve failed runs and perform semantic review beyond automatic phrase checks. These are not independently verified field results or a human baseline.
- Thesis target: at least **30% fewer unnecessary RFI submissions**, compared with a matched manual baseline. An answerable question is not automatically a measured avoided RFI.
- Safety target: **zero incorrectly closed questions that actually require formal clarification**. The system never closes or submits an official RFI automatically.
- Answer quality: at least manual accuracy, with correct / incorrect / missing facts and exact source quotations reviewed separately.
- Provisional process targets: **25% lower total review time** and **20% fewer missed issues**. Record generation plus human checking/correction, not just model speed.
- Retained feedback: review a failure, propose a general lesson, explicitly publish its immutable version, and test on later unseen questions. This changes supplied guidance; it does not train the model weights.
- Baseline jobs always use no lessons. Holdout jobs freeze a lesson version when queued. Learning jobs freeze the latest approved version on their first claim; retries keep it.
- Keep hardware, model, quantization, sampling, input, rubric, and measured timing boundaries fixed across comparisons. Preserve original outputs and failed adjustments.

For a learning experiment, also freeze the processing code and prompts: vary only the approved lesson release. A person must review the result and explicitly approve/publish a reusable lesson; editing a task alone does not teach later runs. The website and saved feedback persist while the PC is Off, but passive uptime does not improve the model. Automatic self-training or automatic approval of lessons is not implemented, and a learning gain has not yet been demonstrated. Current tuning benchmarks measure changes to the base workflow, not learning from published lessons.

The thesis remains **partly supported** until actual RFI and matched manual results exist. Familiar synthetic fixtures demonstrate development behavior, not independent validation. Original Demo 1 item checklists/raw exports were unavailable; reconstructed scoring must remain labeled. Demo 2's reported 209-second result has a source conflict (3 versus 10 reports), so do not turn the older 3.5-versus-56/57-minute claims into a controlled result without reconciling the raw run.

The supplied materials support a multi-day running feedback workflow for the later demos. They do not clearly specify that every earlier demo must run continuously, nor a confirmed uptime/volume requirement. The user's explicit operating constraint takes precedence: run local processing only during manually enabled demo sessions. Demo 1 and Demo 2 remain frozen comparison systems.

## Data and access

The cloud keeps compact results, source excerpts, reviews, timings, hashes and lesson versions. Raw model calls and complete local audit files stay in `app/.capstone-local/`, protected for the Windows user by the launcher and excluded from Git. Never put Cloudflare deployment keys in the website or runner. The runner uses a separate project token scoped to claim/heartbeat/complete operations. Browser project keys stay in session storage.

The queue uses expiring claims and heartbeats. Canceled or expired claims cannot publish stale results. A completed local result is saved before upload and can be retried from disk during the next enabled session if the connection fails. The companion processes one run at a time. The runner starts with RFI capability and adds client meeting and daily report workflows after the upgraded Worker advertises support.

## Development and verification

Run `node demo-3/cloud/dev-server.mjs` only for an intentionally started local development session at port 4188. It performs no cloud operations, truthfully reports that no cloud account has been verified for that local service, and stores its owner key under `desktop-build/demo3/.private/`. Stop that development server when finished. Automated tests may explicitly permit loopback connections; the normal user flow is the manually opened Windows app. The old port-4186 browser control panel is retired and must not be used to restore unattended background behavior.

Tests: `node --test demo-3/cloud/tests/*.test.mjs demo-3/engine/*.test.cjs demo-3/runner/*.test.mjs demo-3/public/*.test.mjs demo-3/consolidation-bench/*.test.cjs`. Existing regression checks: `node --test demo-1/tests/*.test.cjs demo-2/tests/*.test.cjs tests/*.test.cjs`. Windows restricted execution may deny local networking and atomic file renames; use the authorized local runtime context for those checks rather than interpreting access denial as a model failure.

Current consolidation inputs, separate references, and frozen bundle hashes are documented in `consolidation-bench/README.txt`. The older triage `fixtures/inputs.json`, `fixtures/references.json`, and `fixtures/freeze.json` remain historical fixtures; they do not benchmark the current consolidation workflow. Never send reference labels or spreadsheet ground-truth columns into inference. The November 2 source review and source archive remain private local material. See the [proposed evaluation checklist](docs/evaluation-checklist.txt) for the still-uncompleted human comparison and learning study.
