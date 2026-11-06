DEMO 3 CURRENT WORKFLOW — DOCUMENT CONSOLIDATION

The primary interface now uses consolidation-engine.cjs. The older RFI triage
engine described below remains available for existing question/history records.

The consolidation engine extracts atomic requirements, proposes how they fit
the frozen task board, and performs a separate evidence/coverage verification.
All three passes use the same local Qwen3.5:27b model. The separate verification
pass is a model self-check, not independent human validation. Deterministic
checks validate exact quotations, source authority, source identities and
task/group pointers. Model proposals
never alter the board until an authorized person explicitly applies a review.

Decisions distinguish new tasks, related subtasks, duplicate open work, genuinely
answered requests, conflicting evidence, and uncertain items needing review.
Grouping preserves distinct requirements. An open task is not an approved answer.
Current approved reference text is required for an answer; requests themselves
are not answer authority. A person's source-status updates override stale incoming
metadata without rewriting the original text.

Input, result and board API contract: ../consolidation-contract.txt.
Frozen development and holdout benchmarks: ../consolidation-bench/README.txt.
Raw calls, versioned source snapshots, hashes, timings and evaluation results are
kept in desktop-build/demo3. No model calls are made by ordinary software tests.
Only aggregate benchmark counters are published to the website.

The visible PC app must be opened and explicitly switched On. No model service,
cloud inference, paid fallback or automatic startup is introduced by this engine.
Human-approved lessons are bounded, attributed guidance; they do not train model
weights, turn project claims into authority, or demonstrate improvement by themselves.

OLDER SINGLE-QUESTION RFI ENGINE

Demo 3 local RFI inference engine
Version: rfi-triage-2

Exports from rfi-engine.cjs
  VERSION
  LIMITS
  validateInput(payload) -> normalized cloned payload; throws INVALID_INPUT with statusCode 400
  generate(payload, options) -> Promise containing result, audit and run provenance

Input
  { question, documents: [{ id, title, revision, issuedAt, approval, current, text }] }
  approval: approved | draft | superseded
  current: boolean; a superseded record cannot also be current
  issuedAt: ISO date or ISO timestamp
  1–12 unique document IDs; at most 30,000 combined document-text characters;
  question at most 2,000 characters. Unknown fields are rejected, including hidden answer keys.
  Source text is preserved exactly for quote validation.

Options
  signal: AbortSignal
  progress(event): synchronous callback receiving {phase,message,completed,total}; phases draft,
    verification, complete; total is 2. Completion means a proposal is ready, not approval.
  record(event): synchronous callback for the underlying model call with added phase field.
    Events contain request, content, usage, elapsedMs and doneReason/error from the native adapter.
    Keep these audit records in private Capstone storage; they contain source text and outputs.
  lessons: defaults to [] (baseline); at most 8 approved, versioned general lessons with 4,000
    combined text characters. Each requires {id,version,text,approved:true,approvedBy,approvedAt}.
    version may be a nonempty string or positive integer; each text is at most 1,000 characters.
    The service must establish reviewer identity/authority before setting approved:true.
  adapterFactory: test injection matching the existing native adapter factory. Omit in production.

Result contract
  result: {outcome,draftAnswer,rationale,uncertainties,citations,humanDecision}
    outcome: answer_from_records | formal_clarification | needs_review
    draftAnswer: populated only if the answer passes the verification gate; otherwise empty
    citations: [{documentId,quote}], exact contiguous substrings of the identified source
    humanDecision: always pending, including answers from approved records
  audit: {draft,verification,validation,lessonVersions,requiresHumanDecision:true}
    validation retains accepted/rejected citations, rejection reasons and outcome changes.
    Rejected or unsafe answer text is retained only in audit.draft, not the displayable draftAnswer.
  calls, trace, model, backend, policy, engineVersion, contextWindow, sampling, seed, reasoning,
  totalMs, loadMs, elapsedMs, sourceHashes, inputSha256, documentHashes
  Model errors/cancellation reject; diagnostics include phase, calls, trace and elapsed time.
  A failed generation must not be silently replaced with a successful answer by the caller.

Local configuration
  Imports ../../demo-1/native-engine.cjs solely as its existing adapter; no Demo 1/2 files modified.
  Qwen3.5:27b; quality policy; seed 42; 16,384 context; reasoning disabled; two sequential passes.
  Uses the existing loopback Ollama endpoint 127.0.0.1:11435. No hosted inference or paid API.
  Model and context are checked against the expected fixed values. The adapter's source hashes,
  sampling policy and this engine's hash are returned with every completed run.

Authority and verification
  Pass 1 drafts a source-linked proposal; pass 2 independently examines evidence and the draft.
  Only current approved documents can support an answer. Drafts and superseded records may
  appear as context for a clarification, never as authority for proceeding.
  Document instructions are explicitly treated as untrusted data in separate JSON content.
  Deterministic checks enforce exact quote membership, IDs, metadata, bounded input and output.
  No authority, absent answer citations, conflicting authority, or missing formal authority
  require formal clarification. Other failed support checks route to needs_review.
  Verification cannot turn an initial formal clarification into an accepted answer.
  No method submits RFIs, authorizes construction work, or changes a human final decision.

Limitations
  Exact quotation validation does NOT prove semantic correctness. Contradiction detection and
  answer-support interpretation still depend on the model; the same model provides both passes.
  The verifier is not independent human ground truth. Human review and independent evaluation
  remain necessary. Prompt-injection instructions plus deterministic gates reduce exposure but
  do not establish a general guarantee against all malicious source text.
  Approval/current metadata is supplied by the caller. This engine cannot authenticate a real
  signature, establish document permission, or prove that an uploaded record is actually current.
  The service must enforce access controls and document provenance outside this module.
  Lessons are bounded general guidance, not model training. A reviewer must reject case-specific
  answer keys or project facts offered as lessons. Arbitrary feedback is not automatically used.
  Input size is bounded by characters, not an exact model tokenizer. Highly token-dense input
  may still exceed context; the native adapter rejects context exhaustion or truncated output.
  Passing stub tests proves contract/guard behavior only, not model quality or RFI reduction.
  The initial v1 live development run matched 8/8 frozen proposal outcomes, but agent review
  identified wording weaknesses. See desktop-build/demo3/rfi-initial/connected-run/observations.txt.
  Version 2 changes prompt wording only and removes a redundant internal flag from model input.
  Its three familiar-case regressions matched 3/3 frozen outcomes with no unsafe answer proposal;
  see desktop-build/demo3/rfi-initial/wording-v2-regression/observations.txt. These are not unseen
  validation, and the initial v1 eight-case score must not be labeled as a v2 full-suite result.

Fixtures
  ../fixtures/inputs.json: {version,synthetic,cases:[{id,payload}]}; submit only payload.
  ../fixtures/references.json: separate author-written evaluation labels; NEVER send to model.
  ../fixtures/freeze.json: SHA256 of input and reference files frozen before any inference.
  Eight cases cover an exact approved answer; unapproved substitution; replaced revision;
  missing design detail; resolved task ownership; inspection requested versus passed;
  conflicting approved records; and a draft carrying a malicious embedded instruction.
  These are DEVELOPMENT examples. Repeated tuning on them does not create held-out validation.
  references.requiredFacts / forbiddenClaims are human-review guidance, not safe naive substring
  graders (for example, 'not approved' contains 'approved'). Keep negative statements in context.

Tests (stub adapter; no model traffic)
  node --test app/demo-3/engine/rfi-engine.test.cjs
  Tests cover input limits, labels, exact evidence, authority, disagreement, call provenance,
  untrusted-data boundaries, retained lesson approval, malformed output, cancellation and hashes.
  To explicitly run local fixtures: node app/demo-3/engine/run-fixtures.cjs --run-local
    --output desktop-build/demo3/<new-run-directory> [--cases RFI-T01,RFI-T06,RFI-T08]
  Use a new output directory each time. The driver refuses to overwrite an existing manifest.
  Results contain proposal outcomes only; no human RFI submission/closure decision is counted.

Grounded project direction
  Source review: source-materials/2026-11-02-update/Demo 3 source review.txt
  Thesis docs/INFO 492 Thesis.docx, P0311–P0320: RFI triage; 30% fewer avoidable RFIs;
    maintain/improve accuracy; zero necessary questions incorrectly closed.
  Mid-Quarter Analysis.docx, P0019–P0020/P0031/P0033/P0035: current authorized evidence,
    source/revision/approval visibility, human authority, total workflow time, unseen evaluations.
  Evaluation Lab 2.docx, P0071–P0114: distinguish prerequisites, formal authorization,
    physical completion and administrative evidence gaps.
  Original user Pasted text.txt: roles, interface transparency, several-day feedback loop;
    specific learning mechanism remains exploratory rather than an official rubric requirement.
  P#### refers to extracted paragraph index, not a printed page number.
