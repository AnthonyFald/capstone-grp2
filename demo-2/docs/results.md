# Demo 2 results and limitations

The daily-report workflow runs locally on the RTX 5080. The final implementation uses core `daily-reports-v8` and prompt `daily-review-8`. The measured quality gate was **not met**. This is a working assisted-review prototype, not a validated autonomous reviewer.

See the [comparison table](evaluation-summary.csv), [results page](../research.html), [original predictions](final-trials.json) and [explicit annotations](scoring.json). Scores are provisional Codex-assisted judgments; independent team adjudication remains outstanding.

## Final matched-prompt measurements

| Profile | Case | Trials | Fully found | Partial issues | Unsupported findings | Processing time |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Native Qwen 3.5 9B, thorough reasoning | A | 1 | 4/12 | 8 | 5 | 598.9 s |
| Native Qwen 3.5 9B, thorough reasoning | B | 1 | 3/8 | 5 | 2 | 616.4 s |
| Browser Qwen 3.5 9B, thorough | A | 1 | 4/12 | 7 | 7 | 277.3 s |
| Browser Qwen 3.5 9B, one pass | A | 3 | 0–1/12 | See annotations | 5–6 | 72.4 s median; 69.4–76.0 s |
| Browser Qwen 3 4B, one pass | A | 3 | 1/12 | See annotations | 4 | 63.9 s median; 63.2–68.3 s |

Times exclude initial setup/download. Models also change quantization, runtime and reasoning; these are not controlled estimates of parameter-count effects. One observation has no meaningful variance estimate. Three repetitions describe only this small pilot.

Thorough profiles covered more concerns but still introduced material errors. Native A included useful water-cause, acceptance and trade-notification findings; other findings overstated RFI status, implied unsupported document-transmission timing, or cited the wrong field. Native B correctly captured product resolution and the quantity discrepancy, but added unsupported cure-completion and delivery-cause claims. Original outputs preserve these errors.

Whole-finding scoring is conservative: a useful observation is still unsupported if it adds a material false assertion or cites the wrong field. Partial coverage counts as missed in strict recall, not half credit. Unsupported findings count output alerts; reference issues count concerns, so the units differ. Independent reviewers may adjudicate borderline wording differently; notes identify those judgments explicitly.

## Hypothesis outcomes

- **H1: untested.** No controlled human participants or productivity observations were collected. The 25% lower total assisted review time, 20% fewer misses and no additional false alarms targets remain open. Human verification/correction time cannot be replaced by inference latency.
- **H2: not met.** No final A condition reached at least 10 of 12 fully supported reference issues with at most one unsupported finding.
- **H3: not met.** Thorough browser analysis improved strict issue coverage over one pass but increased unsupported findings.
- **H4: descriptive support only.** The 4B one-pass median was about 12% shorter than the browser 9B one-pass median. This is a small timing observation, not evidence that the smaller model is more useful or statistically superior.

## Development and controls

The keyword baseline runs in under 0.1 seconds but fails to reconcile later resolutions. It is neither an AI condition nor a human-only baseline. It produced no alerts on routine C. An earlier native core-v7/prompt-v7 C run also produced no alerts in 105.4 seconds; C was not rerun with the final core/prompt, so that result is not pooled into the final comparison.

Native Qwen 3.5 27B one-pass reasoning completed A in 666.6 seconds using prompt v3, finding 3/12 issues with two unsupported findings. It remains an explicitly experimental higher-capacity option. Its earlier prompt makes it a developmental observation, not a matched model-size comparison or evidence that larger is better.

The [development log](development-log.json) and older raw files retain superseded and failed attempts. Names beginning `final-v5`, `final-v6`, `final-v7` and `final-v8` are historical filenames, not acceptance labels. Failures included invalid quotations, a timeout fixed by streaming, context exhaustion, excessive repeated candidates and summaries discarding distinct concerns. The v5 resume is staged timing, not continuous latency. Final results are selected explicitly in [evaluation-files.json](evaluation-files.json). A separate [cancellation check](ui-cancellation-check.json) records a real canceled run; it is not a quality or latency observation.

## Data and limits

All cases are synthetic. A and B informed development; neither is held out. C is a narrow negative control. They are not calibrated human-study pairs. The [data review](data-review.md) records provenance, missing fields and reference corrections. The [environment record](environment.json) preserves hardware and native model digests. Early `gpu-telemetry.csv` samples whole-device utilization, not per-process memory or final-run peak usage.

Apple silicon browser and local-runtime paths remain available, but no Mac inference benchmark was conducted. The user's approximate Demo 1 times of 14 minutes on M1 Max and one minute on RTX 5080 are contextual observations, not controlled evidence of a 14× hardware improvement. Original private archive documents, recordings and model binaries are not published.

## Verification and next study

The app supports imports, local model choices, cancellation, source-text retrieval, original-output preservation, corrections, reference scoring, timers and JSON/CSV exports. Automated checks cover the website, Demo 1 regressions, packaging, local companion and scoring logic; [verification.json](verification.json) records scope. Actual browser and native inference were exercised on the RTX 5080.

Use the [collection guide](collection-guide.md) for independent reference review, comparable unseen cases and human-only/assisted observations. The blank human-study template is intentionally blank. Preserve original predictions, corrected findings and participant timing separately in the eventual write-up and presentation. Supplied documents and slide decks were not rewritten.
