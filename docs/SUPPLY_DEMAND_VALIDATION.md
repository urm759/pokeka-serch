# Supply / Demand Shadow Validation

Version: `supply-demand-shadow-1`. Production evaluation/limits/GO remain unchanged.

## Pipeline

`finalize_update_status.js` captures actual domestic PSA10 receipt evidence into daily, per-card immutable snapshots in `data/research-supply-demand/days/`. A repeated old receipt is not a new daily observation. Same-card identity, price, source hash and individual observation time must match. Feature availability is capture time, never backdated to the price/POP date. Historical features cannot be reconstructed with current population or buyback values. Files are preserved; none are loaded by initial search.

The existing non-AI daily/finalization workflows perform capture. Every seven elapsed days, validation is eligible only if saved observations/outcomes changed; algorithm changes trigger an explicit candidate recheck. Identical input skips retraining even after a calendar interval. `execution` records process attempts, new observations, newly available non-overlapping labels and skipped/executed validation separately. `learning.established`, `trainedAt` and `learning.improved` are distinct: zero outcomes never gets a fitted model or a training timestamp. A candidate fit needs at least 30 non-overlapping rows from 10 physical identities, while validation/adoption gates below remain stricter. Empty legacy archives are retained for recovery but no longer described as trained models. No new AI scheduled task is created. Summary and model input hashes, model archives, and fold-level predictions are persisted through the existing validated data publication path; scheduled publication receipts also attest the shadow summary/details. A process success is not proof of a new receipt or a scheduled publication.

New daily files use lossless gzip/base64 inside a JSON envelope, with uncompressed SHA256 and byte-length validation; legacy plain JSON remains readable and is retained. `unpackDay` reproduces the original evidence exactly. The recovery/archive pipeline still sees valid JSON. Neither form is an initial browser dependency. Multi-year training/storage capacity is not yet demonstrated by the initial one-day capture.

## Temporal Validation

The [official TimeSeriesSplit explanation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) motivates training only on the past and testing later data with a gap. This implementation is Node.js, not an invocation of scikit-learn: calendar-time cutoffs handle irregular observations, not equally spaced row-index splits.

- Outcome: the first confirmed same-specification/source domestic PSA10 price at or after feature-availability plus the target horizon, at most two days late. Missing outcomes are not interpolated.
- Train labels must have become available at least 30 calendar days before the test block, leaving the maximum feature-lookback embargo. Same-card label intervals are non-overlapping within train and within test; test-origin blocks are disjoint. No randomized card-row split.
- Separate 7, 30, 91, 119 and 147-day validations. Short-term results never stand in for return-period validation.
- Candidate: fixed price/POP/trade/support/age/context strata, shrunk toward the overall training return with a 30-example prior. Missing features remain missing. Store-ratio features use gross quotes, not net proceeds. An observed trading-volume class is not a claim of character popularity.
- Compare flat current price and pooled historical-return baselines. Report absolute error, negative-outcome error, optimistic/downside error, and missed falls of at least 10%.
- At least three disjoint temporal folds, 100 test examples, 30 cards and 10 falling outcomes per horizon, better absolute error and no worse downside/missed falls are necessary, not sufficient, for adoption. Explicit model approval, all-card candidate/GO impact audit and a separately saved production rollback are still required. There is no automatic production adoption.

POP is worldwide grading population, not market listings; domestic trades include potential resales, not proven absorption of newly graded cards. New mappings, recovered data and specification corrections never become dated new supply. All provenance checks from `psa10_trade_statistics` apply.

## Incomplete Inputs / Validation

The initial capture is one day; there are no future labels. It is not a completed backtest or evidence of return-time net profitability. Verified popularity, historical reprint metadata and same-cohort market regime are not connected yet and remain null. Release dates use the official-evidence catalog master for subsequent captures; the first snapshot is not silently rewritten. Card-level price-change feature capture and return-time fee-inclusive realized-loss validation remain tasks. Synthetic temporal tests exercise leakage controls; they are not real-market performance.

The older quantile/evaluation-model candidate is a different model and is not validated by this shadow pipeline. Production candidate impacts are not simulated until adoption is proposed; actual production impacts of the shadow pipeline are zero by construction. Model archives and exact code version/input hashes permit reproducible replay.
