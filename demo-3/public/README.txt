CAPSTONE TEAM 2 — DEMO 3 LIVING TASK BOARD

The website maintains reviewed project tasks, shared groups, original documents,
and an immutable account of why each change was made. New batches are compared
with a frozen board snapshot. The AI proposes changes; an owner or reviewer
must explicitly review every item before the board changes.

Main workflow
- Living task board: distinct tasks, shared groups, sources, and open/resolved state.
- Add documents: PDF, DOCX, TXT, JSON, or pasted source text.
- Processing & review: local processing status and explained per-item actions.
- Change history: applied decisions, corrections, source-state updates, and undo.
- Reviewed lessons, experiment results, and project access remain available.
Earlier single-question RFI reviews remain accessible in processing history.

Document intake
PDF.js 6.5.438 and Mammoth 1.13.0 are vendored from official npm packages.
Their license notices, exact versions, package integrity, and file hashes are
under vendor/. No CDN, paid model, OCR service, analytics, or external font is used.
Binary documents are read in temporary browser workers that terminate after
completion, failure, cancellation, or a 25-second timeout. The website submits
only the displayed text and metadata when the user queues the batch; original
PDF/DOCX binaries are never automatically uploaded.

Limits: 10 MB per file, 50 PDF pages, 12 documents, and 30,000 combined extracted
characters per batch. Word archives are bounded before decompression. PDF pages
are labeled in extracted text. Scanned/image-only files, password-protected
PDFs, older .doc files, drawings, handwritten annotations, and OCR are not
supported. Mixed PDF pages without readable text produce an explicit warning.
Users must check extracted PDF/Word text against the originals before submission.

Imported filenames never imply authority. New file imports default to informal,
not-current, and unverified revision; the displayed date must be verified.
Incoming requests and supporting reference records are separate roles.
Evaluation labels, expected answers, and externally supplied board state are
rejected. The server repeats input validation. Original text is preserved.

Review controls
Each item retains its exact source passage, distinct requirement, proposed
placement, and explanation. Reviewers can accept, change action/target/group,
reject with a reason, or supply a reviewed answer with exact quotations from
current approved reference records. The original model proposal is immutable.
Task changes support moving, splitting, resolving, and reopening; groups are
organization only and cannot be resolved as if they were a question. A split
retains the original task and source links. Only the latest eligible change can
be undone, as a new revision, without erasing source documents or audit history.
Stale proposals cannot be applied to a changed board.

Source library
All applied originals remain accessible, including unlinked or rejected items.
A reviewer can change a source's current/approval state with a reason; the text,
ID, and revision remain unchanged. Removing authority from evidence reopens
resolved tasks that relied on it. Prior decisions remain in history.

Metrics and lessons
Consolidation metrics separate duplicate links, grouped distinct requirements,
answered requests, human corrections, omissions, incorrect merges, and review
time. Unassessed values remain unassessed. Counts of tasks/groups are not an RFI
reduction percentage. Matched manual and assisted decisions are needed to test
the 30% unnecessary-RFI thesis. A board review updates the project record; its
review receipt can separately create a reusable lesson proposal. Saving a
proposal does not activate it. Only the owner can publish selected proposals
as a versioned release. Eligible later runs receive those approved instructions;
baselines use no lessons and separate evaluations freeze their chosen version.
This does not train model weights or learn passively from website visits.
Improvement must be tested on later independent cases.

Operation and access
This interface talks only to its own /api/capstone/v1 service. Project keys stay
in session storage. The paired PC processes only when the visible manual app is
On; website activity cannot turn it on. The online queue, reviewed board, and
history remain available while the PC app is Off; new model processing waits.
No paid feature or cloud inference is used.
No action submits or closes an official RFI or grants construction authorization.

Deployment and validation
Serve the public assets together. .assetsignore excludes tests, test fixtures,
maintainer download tooling, and this README from the hosted website.
node --test app/demo-3/public/*.test.mjs
node --check app/demo-3/public/app.js
node --check app/demo-3/public/board-ui.mjs
Browser integration must verify real PDF/DOCX extraction, proposal review/apply,
source evidence, correction, stale-board handling, and readable task layouts.
