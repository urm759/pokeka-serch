# PokeDATA Internal Analysis

## Cancelled By User

2026-10-21: the user withdrew overseas price acquisition, contracts, inquiries, matching expansion, private analysis, price-gap comparison and the 90% matching target. This document is historical implementation evidence, not a pending task or recommendation. Do not run the commands or send the draft below. Saved data stays private and unchanged. PSA official price development stays stopped; PSA POP/rate remains a separate permission-wait item. Only a new explicit user instruction can reconsider this policy; a key, contract or private permission file cannot override cancellation.

## Current Status

- 2026-10-20: user confirmed no API subscription; purchase and inquiry delivery remain on hold.
- Official PRO page describes Personal API access under PLATINUM, USD20/month. This is not evidence that sourcing/resale analysis is licensed. No account, purchase, API call or outbound inquiry was made.
- PSA price development stays stopped. PSA POP permissions/checkpoints are separate and unchanged.
- The local pipeline is implemented and tested with synthetic data. Real comparison coverage remains unverified/blocked. An undated provider aggregate is not an individual sale or a current dated price.

Sources: [Official API documentation](https://documenter.getpostman.com/view/16115980/2sA3JF9iWW), [PRO](https://www.pokedata.io/pro), [Terms](https://www.pokedata.io/termsandconditions).

## Local-Only Pipeline

Run from the repository root:

```powershell
node work/run_private_pokedata.js
node work/serve_private_overseas.js
```

The first command writes only under ignored `.private/overseas/`. Without confirmed use rights, a subscription and an approved credit budget, it records a waiting checkpoint and makes zero requests. The second binds only to `127.0.0.1:8879`, exposes one HTML page, denies other hosts/origins, uses no-store/CSP and does not expose files, secrets, API endpoints or directories. Stop with Ctrl+C. No cloud deployment, AI automation or PC startup task was added.

The official API client is reused with its daily credit reservation, access interval, source/URL retry separation and persisted raw responses. The private queue reserves ordinary discovery positions, saves each batch/card, skips recently acquired cards and holds ambiguous identities. Acquisition and report rebuilding are separate. If an existing authenticated response lacks date/count/period, rebuilding cannot create them.

Permission evidence belongs in ignored `.private/overseas/api/permission.json`, not public policy or Git. Required fields: `version:1`, `internalAnalysisAllowed:true`, `apiSubscriptionConfirmed:true`, `permissionEvidence`, `reviewedAt`, and optional `expiresAt`. Do not populate these merely because the dashboard is private. API configuration belongs in `.private/overseas/api/config.json`: approved daily `approvedCredits`, bounded `timeBudgetMs` and evidence-backed FX if available. `POKEDATA_API_TOKEN` is read from the environment, never saved in outputs. Do not paste it into chat or a command line. No configuration granting access was created.

Saved matched prices feed private reports. Evidence-backed comparisons can additionally use `.private/overseas/analysis-input.json`; do not attach invented timestamps/counts to API aggregates. Both sides require matching Japanese set/number/rarity/variant/grade, comparable raw condition, price type, HTTPS provenance, positive count, price-confirmation/capture dates and a checked period. Foreign currency also requires dated FX provenance. Current comparison defaults are 48h age, 24h maximum timing skew and a neutral band of ±5%; these are explicit comparison conventions, not validated predictions or changed public safety limits.

Gap = `(foreign JPY / domestic JPY - 1) * 100`. Positive means foreign high, negative domestic high. Raw mixed-condition prices cannot be called domestic mint equivalents. Estimate/listing prices, low grades, stale/unknown dates and held identities cannot become comparable. Domestic gross buyback support uses the existing same-spec summary, independently from comparison labels and net-profit calculations. No costs are subtracted from demand ratios. No gap or demand label changes public GO/limits.

Supported-set/specification denominator is not yet proven from a complete permitted roster. Report exact saved metadata mappings separately; never divide by only acquired/matched cards to claim 90% coverage.

## Publication Boundary

`.private/` is ignored. Reports, raws, decisions and gap percentages stay there; no public builder imports them. Publication verification rejects tracked private paths, private report schemas/markers, gap outputs and API-key fields even under renamed JSON. Generated private HTML is rejected if accidentally staged. Source code and synthetic tests contain no real overseas prices or secrets. Existing archived originals/checkpoints are retained. This does not erase older Git history; historical removal remains a separately approved operation.

## Inquiry Draft (Not Sent)

> I would like to use your official API locally for personal Japanese Pokemon-card sourcing and resale analysis. The tool compares PokeDATA Raw/PSA10 prices with domestic prices, and computes private derived price gaps. No API prices, raws, derived gaps, labels, keys or authenticated responses would be redistributed, published or committed. Does Personal API access permit this use, including local storage/history and derived analysis? If not, which license and budget apply? Does the API provide price observation dates, covered periods, sample counts and individual sale identifiers/dates, or only undated provider aggregates? Please also confirm permitted retention and rate/credit limits. No purchase or data access is requested by this inquiry draft.

Sending this text or accepting a paid license requires separate user approval. Other permitted domestic acquisition continues while this is held.
