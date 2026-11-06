DEMO 3 CONSOLIDATION BENCHMARK — VERSION 1

Purpose
Test extraction, duplicate linking, grouping of distinct work, incremental task
routing, authority checks, conflict handling, and retention of new details.
This is a synthetic development benchmark, not field validation or proof of
30% fewer unnecessary RFIs. Human review time is not measured by this runner.

Fixtures
- dev.inputs.json: 6 development scenarios / 18 expected atomic requirements.
- holdout.inputs.json: 6 separate scenarios / 18 expected atomic requirements.
- *.references.json: separate expected actions, targets, detail concepts,
  exact-source requirements, grouping and separation checks. Never infer on
  these files or put these labels into a prompt, approved lesson, or project doc.
- validation.inputs.json: exact replay, conflicting source ID, and no-request
  boundary cases for deterministic validation, not costly model inference.
- freeze.json: SHA-256 checksums written before any inference.
- transfer.inputs.json / transfer.references.json: 4 additional scenarios /
  12 expected requirements, using terser requests and fewer explicit hints.
  These were authored separately after development review but before any
  transfer inference; their separate transfer.freeze.json preserves the
  original dev/holdout freeze unchanged. Keep their contents outside tuning.

The holdout set changes trade, location, wording, and document details while
covering the same failure families. It is agent-authored and therefore not
independently human-labeled. It must remain outside tuning until the selected
development version is frozen. If results are used to tune, label subsequent
runs as holdout-informed development and author a fresh transfer set before
claiming an untouched evaluation. Never replace an unfavorable reference after
seeing its model output. Any justified rubric correction needs a new version,
the original result retained, and all compared versions rescored consistently.

Run instructions (root owns model/app lifetime)
  node demo-3/consolidation-bench/run.cjs --run-local --split dev --label v1-baseline --output desktop-build/demo3/consolidation-v1-dev
  node demo-3/consolidation-bench/run.cjs --run-local --split holdout --label selected-version --output desktop-build/demo3/consolidation-selected-holdout
  node demo-3/consolidation-bench/run.cjs --run-local --split transfer --label selected-version --output desktop-build/demo3/consolidation-selected-transfer
  node demo-3/consolidation-bench/run.cjs --score-only --split dev --output desktop-build/demo3/consolidation-v1-dev

An optional --cases DEV-01,DEV-02 selects a subset; report the subset explicitly.
--engine can point to another frozen engine entry within the app.
--lessons accepts a JSON array of approved general lessons, logged and hashed.
The default uses no lessons. Record the same hardware, model, quantization,
sampling, lesson setting, and timing boundaries for baseline/tuned comparisons.

No model or service is started by the runner. It calls the existing local-only
engine only with --run-local. Runtime shutdown remains the caller's obligation.
Output must be inside Capstone and an inference run requires an empty output
directory. Prior runs are never overwritten. The source snapshot, fixture
hashes, raw model calls, original output, input hashes, timing, and failures are
retained. Reference labels are opened for scoring after generation completes.

Interpretation
Action-and-target accuracy uses ALL expected requirements as its denominator;
omissions and unnecessary abstentions do not improve the score. Extraction,
retained detail completeness, grouping, separation, exact citations, incorrect
duplicate merges, and incorrectly answered requests are reported separately.
One extracted item cannot cover multiple expected independent requirements.
Grouping distinct tasks does not count as avoided RFIs. Merely matching the
same subject or short title does not establish a duplicate.

Automated fact checks recognize predefined wording alternatives. They do not
fully assess every possible unsupported assertion. Inspect source quotes,
reasoning, and retained requirements manually before making quality claims.
Do not present this benchmark as a measured human comparison or general
better-than-human result. Zero observed incorrect merges applies only to the
evaluated examples. Human decisions and actual submission outcomes are needed
for the thesis's unnecessary-RFI reduction metric.

Run scorer checks without inference:
  node --test demo-3/consolidation-bench/score.test.cjs

build-fixtures.cjs is retained as an authorship record. Do not rerun or edit
the frozen data after inference begins unless intentionally creating and
documenting a new benchmark version. It never launches inference itself.
The same rule applies to build-transfer.cjs and the separate transfer bundle.

Development closure boundary (authored after original holdout review)
- closure-dev.inputs.json: one fictional batch / two requirements testing an
  approved definitive rejection and a pure specification question alongside
  unrelated pending installation acceptance.
- closure-dev.references.json: separate expected descriptions and scoring
  labels; never sent to the engine. closure-dev.freeze.json is independent.
- This is an explicit development check, not a new held-out evaluation.
  node demo-3/consolidation-bench/run.cjs --run-local --split closure-dev --label "Closure development boundary" --output desktop-build/demo3/consolidation-closure-boundary

PUBLIC AGGREGATE PUBLICATION
After final runs are explicitly selected and their semantic reviews completed:
  node demo-3/consolidation-bench/publish-results.cjs --run desktop-build/demo3/consolidation-v1-dev --label "Initial baseline" --run desktop-build/demo3/consolidation-selected-dev --label "Selected development version" --output demo-3/public/benchmark-results.json --report "desktop-build/demo3/Consolidation benchmark results.txt"

Repeat --run for any selected completed holdout run. --label and --phase apply
to the preceding --run. Repeat --limitation up to four times to add concise,
public-safe semantic-review findings after reviewing selected outputs.
The utility refuses unfinished/inconsistent run or
score records and checks the site's public benchmark schema. It publishes
only aggregate measurements; no fixture text, references, generated items,
raw calls, diagnostics, credentials, or local run paths appear in public JSON.
The readable report is local and cannot be placed in the public site folder.
Publication also requires semantic-review.json with status "complete", an
explicit AI-agent reviewer (independentHumanValidation:false), reviewedCaseIds
matching every selected case, and sourceRunEngineVersion matching the run.
These fields identify AI-agent review, never independent human validation.
Use evaluationStatusAtGeneration to state whether generation was development,
untouched evaluation, or informed development. Former-holdout reviews/labels
marked informed default to "Informed development (former holdout)" and the
utility rejects labeling them as untouched/unseen evaluation.

All-attempt totals and medians include failures. The local report also compares
matched successful cases when source inputs, model digest, runtime, hardware,
model settings and lesson version match. It shows timing both with and without
recorded model loading, while retaining the number of excluded failed cases.
This is a model-workflow comparison, not a human-reviewed completion-time claim.

Publication guard tests:
  node --test demo-3/consolidation-bench/publish-results.test.cjs

DETERMINISTIC SAVED-RESPONSE REPLAY (NOT FRESH INFERENCE)
The command below records the historical v9 audit against saved v8 responses;
it is not a final selected-run command. For a new authorized replay, freeze the
candidate/dependencies and choose its exact version, permitted source runs, and
a new output directory. Never replay transfer responses for candidate selection.
  node demo-3/consolidation-bench/replay.cjs --replay-only --engine demo-3/engine/consolidation-engine-v9.cjs --source-run desktop-build/demo3/consolidation-v8-dev --source-run desktop-build/demo3/consolidation-v8-informed-regression --output desktop-build/demo3/consolidation-v9-replay-audit

This injects the original saved responses through the candidate's adapter
interface, with fetch and the real model adapter disabled. Transfer sources
are forbidden. Exact raw-response/input hashes and candidate source snapshots
are retained. Original runs and scores remain unchanged. Replay results use
replay-manifest.json/replay-score.json, never a fresh-run manifest or score.
No runtime or speed measurement is applicable. This tests deterministic
normalization/validation effects on known replies, not how changed prompts
affect fresh model output or generalization.
  node --test demo-3/consolidation-bench/replay.test.cjs
