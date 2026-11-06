CAPSTONE DEMO 3 — MANUAL PC APPLICATION

Open: Open Demo 3.cmd at the repository root. Existing workspace shortcuts
remain supported. New clones need the runtime/model layout and their own
pairing described in ../docs/setup.txt; no keys or weights are included.

The visible Windows app always opens Off. Saved website pairing does not turn
processing on. While Off, the app does not load the model, use the GPU for AI,
or check the website queue. Only the small visible app/controller is open.

On starts the app's local Qwen 3.5 27B runtime and companion, then processes
queued document batches and legacy RFI questions. Status shows Starting, On,
Stopping, or Off.

Off stops queue processing, interrupts current local analysis, and stops the
model/companion processes owned by this application. Closing the application
also stops its owned processes and exits. The native host uses a Windows Job
Object so its child processes are terminated if the app closes unexpectedly.
There is no tray-only mode or automatic launch at sign-in.

The app refuses to adopt another demo's services if its required local ports
are already occupied. It does not stop unrelated software or those other demo
sessions on the user's behalf. Close the other session intentionally first.

The website remains online separately:
https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/

Document batches and questions wait while the PC app is Off, closed, asleep,
or disconnected. An interrupted claim is retried where possible or becomes
recoverable after its lease expires; it may need attention if its retry limit was reached. Saved,
completed outputs can be sent during the next On session.
Unfinished work is never marked completed merely because the app was closed.
Invalid or oversized input remains visible as needing attention; the app
does not repeatedly run the same unchanged input. Temporary runtime failures
still use the bounded retry queue.

To pair a different PC, create a one-time code in the website's owner settings
and use the application's pairing controls. Pairing is an explicit network
action, separate from enabling model processing. The owner key is not exposed
by a local web endpoint. Normal operation has no port-4186 control website.

The user explicitly rejected a permanently running background worker. Do not
restore automatic queue polling on launch, keep a hidden model alive after
Off/Close, register a startup task/service, or treat the multi-day experiment
notes as authorization for unattended PC operation.

Startup audit — November 2, 2026
No Capstone-related Run/RunOnce registry entries, user/common Startup-folder
items, scheduled tasks, or Windows services were found. The earlier runner,
companion, and Capstone Ollama processes were stopped before this redesign.

Cloudflare remains on the separately verified Capstone Free account. No new
paid features, account permissions, or changes to other projects are involved
in the manual-control redesign.
