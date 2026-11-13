# Retrieval eval

`npm run eval` runs every query below through `findApis()` against the 68 bundled entries and reports top-1 accuracy, top-3 accuracy and the must-not violation rate, separately for each set. It prints every failure.

| File | Queries | Purpose |
|------|---------|---------|
| `dev.json` | 26 | Tuning set: the 20 queries the v0.5.0 weights were tuned on, the reviewer-reported failures, and 2 from the tests. |
| `holdout.json` | 42 | Held-out set: new, realistic developer queries. Written and committed before any scorer change. **Never tune on it.** |

Each query has:
- `acceptableTop1`: one or more slugs that count as a correct rank-1 answer.
- `mustNotTop3` (optional): slugs that must not appear anywhere in the top 3.

Labels come from the entries' own `bestFor`, `useCases` and `qualityJustification`, not from scorer output.

## Rules
- Change weights, synonyms or gating only in response to **dev** failures.
- Holdout failures are reported as they are. Don't fix them one by one. If a holdout query is mislabelled, fix the label in a separate commit that says why, and re-run the baseline.
- Saved runs live in `results/`. `baseline.md` is the v0.5.0 scorer. `after-fix.md` is the relevance-gated scorer.

```bash
npm run eval
npm run eval -- --out tests/eval/results/after-fix.md --title "After fix 2"
```
