# Evergreen Workspace

Evergreen Workspace brings meeting notes, daily report review and RFI consolidation into one project account. Open it from the Team 2 homepage. The signed-in dashboard has an entry point for each workflow.

Class materials are available as an editable [Demo 3 writeup](<../../documents/demo-3/Demo 3 Write Up.docx>) and [six-slide presentation](<../../documents/demo-3/Demo 3 Presentation.pptx>). The slide notes contain short speaking prompts, and the interface illustrations use fictional examples.

## Use a project account

Choose **General contractor** to create a project and invite a subcontractor. Enter the subcontractor's email and trade, then give them the one-time invitation code through your normal project channel. They choose **Subcontractor** and enter the same email and code. A subcontractor can also create a private workspace without an invite. A project name alone grants no access. Each account belongs to one project.

| Who is signed in | What they can see and do |
| --- | --- |
| General contractor | See and review their own runs and runs an invited subcontractor explicitly shares. Create invitations for their project. |
| Subcontractor | See and review their own runs. Choose whether to share an eligible run with their GC before processing. Private analysis stays in a separate task history. |
| A different project | See only that project's permitted records. A direct link to someone else's run returns unavailable. |

Create your own unique password. Sessions use an HTTP-only cookie. The demo does not send verification emails or provide automatic password recovery. An invitation proves access to the invite code, so send it privately. There are no shared default user passwords in this repository.

## Queue and review a run

1. Select **RFI consolidation**, **Meeting notes**, or **Daily reports**. Add the corresponding source material and confirm that it is fictional or authorized for this team and processing PC.
2. Queue the run. The project PC's manual Capstone app processes one job at a time with Qwen 3.5 27B when **On**. Open the Windows app and turn it On for a planned session. **Off** or Close stops its owned model and queue polling. The website and jobs remain available.
3. Open the result to compare the draft with the source. Record **Accept** or **Needs changes** and any measured evaluation values. Accepting your own RFI proposal can update your saved task history. A human still decides whether to submit a formal RFI.

Fictional material is the default for class evaluation. Project membership controls client access. The designated processing PC receives claimed source material and retains its local audit. Use records cleared for that destination and workflow.

## Run the local workspace

From the repository root, start `node demo-3/cloud/dev-server.mjs` and open `http://127.0.0.1:4188/client/`. Use a test account and synthetic records. Ctrl+C closes the local development server. It stores its SQLite file and credentials in ignored `desktop-build/demo3/.private/`. This server tests the client and queue without touching Cloudflare. Its local test queue uses an explicit test runner instead of the normal Windows app's hosted pairing.

For an isolated account, queue and real-model acceptance check, close the preview and run `node demo-3/runner/check-client-workflow.mjs --run-synthetic` from the repository root on the configured RTX 5080 PC. It creates fictional accounts in a temporary database, tests what a GC, subcontractor and separate project can see, then runs all three queued jobs. It stops the model and companion afterward and saves results under ignored `desktop-build/demo3/`.

The Worker reuses the same D1 database through additive tables. The deployment helper requires a short-lived account-owned key scoped to the isolated Capstone account. It deploys only the Capstone Worker after Free plan verification. The account configuration and database do not rely on Supabase or a hosted GPU service. Keep `.capstone-local/`, model weights, run audits, login material and the source archive out of Git.

The hosted client becomes available at `/client/` on the Capstone Worker after publishing the updated code and schema. Until then the Team 2 button opens the public workspace introduction and evaluation on GitHub Pages.

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
