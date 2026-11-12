# Evergreen Workspace

Evergreen Workspace brings meeting notes, daily report review and RFI consolidation into one project account. Open it from the Team 2 homepage. The signed-in dashboard has an entry point for each workflow.

Class materials are available as an editable [Demo 3 writeup](<../../documents/demo-3/Demo 3 Write Up.docx>) and [presentation](<../../documents/demo-3/Demo 3 Presentation.pptx>). The slide notes contain short speaking prompts.

## Use a project account

Choose **General contractor** to create a project and invite a subcontractor. Enter the subcontractor's email and trade, then give them the one-time invitation code through your normal project channel. They choose **Subcontractor** and enter the same email and code. A subcontractor can also create a private workspace without an invite. A project name alone grants no access. Each account belongs to one project.

| Who is signed in | What they can see and do |
| --- | --- |
| General contractor | See and review their own runs and runs an invited subcontractor explicitly shares. Create invitations for their project. |
| Subcontractor | See and review their own runs. Choose whether to share an eligible run with their GC before processing. Private analysis stays in a separate task history. |
| A different project | See only that project's permitted records. A direct link to someone else's run returns unavailable. |

Create your own unique password. Sessions use an HTTP-only cookie. The demo does not send verification emails or provide automatic password recovery. An invitation proves access to the invite code, so send it privately. There are no shared default user passwords in this repository.

## Queue and review a run

1. Select **RFI coordination**, **Meeting notes**, or **Daily reports**. Add the source material. Choose **Test records** for generated examples or confirm permission when submitting **Authorized project records**.
2. Queue the run. The project PC's manual Capstone app processes one job at a time with Qwen 3.5 27B when **On**. Open the Windows app and turn it On for a planned session. **Off** or Close stops its owned model and queue polling. The website and jobs remain available.
3. Open the result to compare the draft with the source. Record **Accept** or **Needs changes** and any measured evaluation values. Accepting your own RFI proposal can update your saved task history. A human still decides whether to submit a formal RFI.
4. After reviewing your own completed RFI run, you can save an instruction for future reviews. Choose **Use saved guidance** when you want a new RFI draft to follow those instructions. Each run records the exact version it used. Private guidance and guidance for runs you share with your GC stay in separate lists. Archiving an instruction affects future runs.

The class evaluation uses generated test records. Project membership controls client access. The designated processing PC receives claimed source material and retains its local audit. Use records cleared for that destination and workflow.

## Run the local workspace

From the repository root, start `node demo-3/cloud/dev-server.mjs` and open `http://127.0.0.1:4188/client/`. Use a test account and synthetic records. Ctrl+C closes the local development server. It stores its SQLite file and credentials in ignored `desktop-build/demo3/.private/`. This server tests the client and queue without touching Cloudflare. Its local test queue uses an explicit test runner instead of the normal Windows app's hosted pairing.

For an isolated account, queue and real-model acceptance check, close the preview and run `node demo-3/runner/check-client-workflow.mjs --run-synthetic` from the repository root on the configured RTX 5080 PC. It creates fictional accounts in a temporary database, tests what a GC, subcontractor and separate project can see, then runs all three queued jobs. It stops the model and companion afterward and saves results under ignored `desktop-build/demo3/`.

The Worker reuses the same D1 database through additive tables. The deployment helper requires a short-lived account-owned key scoped to the isolated Capstone account. It deploys only the Capstone Worker after Free plan verification. The account configuration and database do not rely on Supabase or a hosted GPU service. Keep `.capstone-local/`, model weights, run audits, login material and the source archive out of Git.

The Team 2 button opens the [live Evergreen Workspace](https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/client/). Hosted checks with fictional accounts verified signup, login, logout, single-use invitations, and project isolation on the Capstone Free deployment. The project PC processes queued reviews during manually enabled sessions.

## Hosted RFI comparison

On November 11, 2026, the Capstone Free site queued a generated Mezzanine M2 batch and the manually enabled RTX 5080 desktop returned a draft. The batch contained three requests, an approved door schedule, its superseded draft, and an approved QA plan. A test reviewer recorded a review, left the board empty, and saved one instruction about preserving exact deadline wording. The second submission reused the identical canonical input, Qwen 3.5 27B model digest, V12 engine and empty board (version 0), with saved guidance version 1 enabled. The checklist was frozen before either run and stayed outside the prompt.

| Condition | Requirements passed | Deadline wording defects | Model workflow | Queue to draft |
| --- | ---: | ---: | ---: | ---: |
| No saved guidance | 3/3 | 0 | 283.46 s | 299.53 s |
| Saved guidance | 3/3 | 0 | 189.25 s | 193.36 s |

Both drafts used the approved 910 mm door clearance, kept the W4 primer release open without a signed passing record, and kept the W5 retest owner as separate open work. Both preserved **before 07:30**, **before 06:45**, and **by 10:15**. The baseline mentioned the QA-plan prerequisite without showing the plan excerpt on the item. The guided draft displayed the exact excerpt in a warning while its formal citation list stayed empty. The paired checklist tied. The second run used an already-loaded model (0.02 s loading versus 9.88 s on the first), and one ordered pair cannot establish a timing benefit from the guidance.

After review, we applied the guided draft and submitted two new requests through the live form with guidance selected. In 136.57 seconds of model workflow, the system linked the repeat W4 primer-release request to the existing open task and created a separate open task for W5 probe location. Both follow-up checks passed. Accepting the follow-up kept the original **before 06:45** and the updated **before 06:15** deadlines on the same W4 task and kept the W5 owner and probe location on separate tasks. This was an incremental board check using a new input and starting board.

This trial used generated records and AI-assisted scoring. It verifies that the hosted queue runs on the project GPU and that a future run can use a saved review instruction. It measures neither human review time nor field RFI reduction.

## Evaluation

The prior V12 evaluation passed 18/18 labeled development requirements, 18/18 requirements on the former holdout after tuning, and 12/12 original transfer requirements. The November 11 repeat used the same four known synthetic transfer cases and passed 12/12 labeled requirements and 7/7 separation checks. Grouping was unassessed in that set. The four repeat runs took 520.4 seconds of model workflow time in total, including model loading. Earlier timing comparisons and limitations are in [the benchmark report](consolidation-results.txt).

All three synthetic client runs queued before the processing host started and completed locally with the RTX 5080. Signup, invitation, sign-in, and separation between GC, subcontractor, and a separate project were exercised during the run. Each result remained pending review.

| Workflow | Model workflow time | Result |
| --- | ---: | --- |
| RFI consolidation | 67.0 s | Two distinct tasks in one group with exact source quotes |
| Meeting notes | 40.0 s | Four draft notes |
| Daily report review | 183.3 s | Two draft findings |

These are individual local software acceptance runs. The times include recorded model loading and exclude queue waiting and human review. The four-case benchmark remains the separate quality check. Its roof-sheet result retained the required **before 15:00** in the requirement while the title and rationale used **by 15:00**. A report supported the rationale's flood-test completion claim but did not appear in the displayed item citations.

The thesis requires matched manual and assisted comparisons with authorized source records and a pre-labeled expected decision. Count actual avoidable submissions, incorrectly closed questions, missed requirements, and total time including human review and correction. If the manual group submits zero avoidable RFIs, percentage reduction is undefined. The synthetic checks measure the draft and its routing. No field RFI-reduction estimate or new stakeholder evaluation has been recorded.
