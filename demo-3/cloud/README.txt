Capstone Team 2 — Demo 3 cloud service

Purpose
The public site queues document batches for the local PC to consolidate into
a living task board. It preserves originals, duplicate links, distinct tasks,
human-reviewed changes and approved lesson releases. Legacy RFI triage jobs
remain available. Cloudflare performs no inference and never closes an RFI
automatically.

Local development (Node 24+)
  node dev-server.mjs
Open http://127.0.0.1:4188/. State is local SQLite under the ignored
app/desktop-build/demo3/.private directory. The owner-token file contains the
local owner key; never publish, log, or include it in screenshots. Owner access
can create separate operator/reviewer keys and one-use PC pairing codes.
Health truthfully reports accountVerifiedFree=false in local development.

Validation
  node --test tests/*.test.mjs
  node --test tests/worker.runtime.mjs
  node build.mjs
The first suite uses Node SQLite with actual SQL and transactional batches.
The second uses Wrangler's installed local Workers/D1 runtime, with a temporary
local database; it does not contact an account. On Windows it may need permission
to launch the local runtime and access loopback. build.mjs only dry-runs Wrangler,
disables telemetry, strips inherited cloud credentials and isolates CLI state.
Wrangler 4.156.0 is pinned in package.json/pnpm-lock.yaml. It is a local build
dependency, not a cloud subscription. Compatibility date matches its runtime.

Deployment controls
wrangler.jsonc deliberately contains invalid account/database placeholders.
prepare-deployment.mjs accepts only explicitly supplied verified-Free Capstone
identifiers. It rejects the existing paid account and unrelated account names.
It writes ignored deployment configuration but does not create resources,
deploy, or set secrets. Deploy only the separate verified Workers Free account.
Required bindings: CAPSTONE_DB (D1 Free), ASSETS (static files), and secret
CAPSTONE_OWNER_TOKEN. No AI, R2, queues, containers, paid plan or paid fallback.
Apply schema.sql to the Capstone database before the first deployment.
entry.mjs is the deployed entry; worker.mjs also exports local testing helpers.

Experiment protections
Jobs have a 300-item project cap and a bounded 3-attempt lease/recovery cycle.
Hidden evaluation labels never enter runner claims. Baseline has no lessons;
holdout freezes a release when queued; learning freezes one on its first claim.
Retries keep that snapshot. Reviews append without replacing the model draft.
Unknown metrics remain unknown. Neither retained lessons nor raw RFI-avoidance
counts establish improvement or the thesis's 30% reduction without a matched
baseline and independent human assessment. Full model call audits stay local.

See api-contract.txt for endpoint and payload details.

Approved one-time deployment helper
Run from app only AFTER the scoped short-lived token has been approved:
  node demo-3/cloud/deploy-capstone.mjs --execute
Without --execute it prints instructions and makes no cloud calls.
The helper reads .capstone-local/cloudflare-deploy-token. It requires an active
token expiring no later than the exact approved November 9 Pacific deadline,
2026-11-10T07:59:59Z. Cloudflare's seven-day UI choice rounds to that calendar
day's end; this guard is a fixed approved deadline, not a rolling eight-day limit.
The token must still be unexpired at execution and must have been
created under the approved Capstone account
14b0eb074438a736ff74584493df40b7 (Capstone - INFO 492 Team 2). The existing paid
account is forbidden. The separately verified Workers Free screenshot at
desktop-build/demo3/capstone-free-plan.png is hashed into deployment evidence.

Before any mutation it verifies the account-owned token using the exact
/accounts/{Capstone-account-id}/tokens/verify endpoint, then checks an existing
clearly Capstone-named workers.dev subdomain. Account identity comes from the
already verified dashboard. It does not request account-listing, account-detail,
or user-token access or expand the approved permissions. Missing registration is
a clear stop, not an automatic name choice. It lists/creates only the database
capstone-team2-demo3, verifies its UUID, applies schema.sql remotely to that exact
binding, creates/reuses .capstone-local/cloud-owner-token, sends the owner secret
to Wrangler on stdin, and deploys only this Worker and its static assets.
The first secret upload can create a placeholder Worker under this same name.
All inherited Cloudflare credentials/endpoint overrides are removed. Wrangler
state is isolated under .capstone-local/cloudflare-deployment, telemetry and raw
debug logs are disabled, and step logs redact both secrets. Nonsecret account,
database, URL and deployment-step evidence is written there. A missing/stale
deployment.lock requires checking the previous attempt before manual recovery.
Public health verification tolerates initial HTML/HTTP responses during rollout,
with at most 15 attempts spaced two seconds apart and a 30-second total deadline.
Identity or free-policy mismatches fail immediately. A health timeout calls for
another read-only health check before any decision to redeploy.
The script never changes plans, subscriptions, billing, domains, or unrelated
services. Free plan status comes from the independent dashboard verification;
the limited token is not granted billing permissions to re-query that plan.

Official references consulted for this helper:
https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/
https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/
https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/
https://developers.cloudflare.com/d1/wrangler-commands/
https://developers.cloudflare.com/workers/wrangler/commands/workers/

Living task-board update
The primary new workflow consolidates incoming RFI/request documents against a
versioned board. Distinct related issues become separate tasks under shared
groups; essential duplicates link existing work; approved answers retain exact
citations; new conflicts remain open. The local model proposes all decisions.
An owner/reviewer applies them with a checked board version. Source originals,
changed decisions, rejected items, task moves/splits and last-change undo remain
traceable. Human source-state updates preserve original text and reopen answers
whose evidence is no longer current or approved. Existing triage jobs remain
readable and their original pipeline still works.

Reapply schema.sql for the additive board-table migration before publishing this
version. No original tables are dropped or rewritten. Local SQL integration
coverage includes stale/concurrent apply, idempotent retry, retained deadlines
and source quotes, frozen snapshots, incorrect-resolution guards, task cycles,
source lifecycle correction, and undo without losing original documents.
