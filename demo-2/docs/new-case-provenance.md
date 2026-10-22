# Additional synthetic evaluation cases

Authored on October 22, 2026 by a separate Codex agent. These are fictional construction records, with no personal information, real project records, or external dataset content. Case D contains nine chronological daily reports and nine reference concerns. Case E contains three routine daily reports and an empty reference issue list.

The author inspected the existing 18-field report schema and case A for format compatibility. The author inherited the project context and prior evaluation discussion. These cases therefore are described as independently authored agent test cases, not independently validated held-out data. Independent human review remains pending.

Case D uses a pumping-station equipment setting and grouting scenario. Case E uses routine workshop ventilation installation and handoff. Report JSON and CSV contain only daily-record inputs; expected interpretations are stored separately in the corresponding reference JSON. Both cases include ordinary completed work and scheduled activities to support assessment of unsupported alerts as well as issue detection.

The main implementation agent received only file locations, counts, and SHA-256 digests before freezing the revised analysis pipeline. The author must not supply the reference details to that agent before the freeze. Evaluation after the freeze should preserve the generated outputs and original references. Any later reference or input correction must be recorded, and affected runs must be distinguished from runs on the original files.

These are small, synthetic development checks rather than evidence of accuracy on real construction projects or of human productivity improvements. Do not combine their scores with prior prompt-development cases without showing the dataset and pipeline version separately.

## Additional case F

Case F was authored by the same separate case-authoring agent on October 22, 2026 after the v12 D/E evaluation. It contains nine chronological synthetic daily reports and eight separate reference issues, using a chilled-water valve replacement scenario. Its inputs include routine completed preparation and delivery work as precision checks. The original A-E inputs and references were not changed.

D results informed the implementing agent's subsequent generic v13 pipeline revision, so D must now be treated as development-informed data. The case F author inherited that discussion and the requested domain/coverage themes. F's reference contents and interpretations were withheld from the implementing agent before its next pipeline freeze; only filenames, counts, input validation results and hashes were supplied. This procedural separation does not make F an independent human-validated holdout. Preserve the frozen input/reference hashes, the untouched generated output and the provisional adjudication, and disclose any later use of F to guide changes.

## Evaluation sequence and interpretation

A, B and D informed implementation or prompt changes. C and E serve as narrow routine-work controls. D/E were withheld for the initial v12 freeze, but D's later feedback makes D development data for v13 onward. Do not describe a later D run as an untouched test of those revisions. Reference definitions and source inputs were retained.

V13 A returned a supported decision with a null replacement and was rejected before findings were accepted. V14 D was rejected when exact duplicate evidence had conflicting states. V15 added bounded duplicate adjudication. Its staged D replay scored 7/9 fully found, zero unsupported findings and one duplicate in provisional agent review; it remained below the pre-existing 8/9 target. V16 adds focused historical-work and opposing-release retrieval. Staged replays are quality-development observations and are excluded from continuous latency summaries; final v16 quality is not asserted in this provenance record.

The v15 F attempt was canceled before completed predictions and before reference exposure to the implementing agent. Cancellation does not constitute a completed F evaluation. A new freeze must record the selected revision's source/configuration and F input/reference hashes before the first completed F run. V16 development feedback identified context loss; v17 uses independent retrieval and context preservation, with its actual freeze and outcomes recorded below. The case-authoring agent's inherited context and agent-based adjudication remain limitations even with this separation. These cases do not replace independent human review or a real-project study.

The selected v17 source/configuration and unchanged F source/reference hashes were frozen in `freeze-v17.json` before the first completed F run. The retained F17 run and provisional scoring are `final-v17-native27-f.json` and `scoring-v17-native27-f.json`. F subsequently scored 7/8 fully found with zero unsupported distinct findings and seven duplicates; no F-based source/prompt/reference changes were made within that revision-17 evaluation. F subsequently informed the consolidation work, while its source and reference files remained unchanged. Across A–F there are 40 synthetic reports and 37 reference issues.
