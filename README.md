# makefun-csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Unceuh/makefun-csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Unceuh/makefun-csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in replacement for csv-reader 1.0.0: a single-pass CSV parser in plain Node 22 (no dependencies, no WASM, no native code) that returns byte-identical answers to the reference on broken files — BOM, LF/CRLF, stray CRs, quote junk, unterminated quotes, short/long rows — at ~2.9x the baseline's end-to-end CPU time on the practice set (parse-only ~4.4x).

How it stays fast: bulk `indexOf` delimiter scans instead of per-character reads, a cached next-CR position so CR handling is amortised O(n), whole clean lines split at once with `String.split`, and a quoted-field scanner that only falls back to per-character work when a field actually contains `""` escapes or embedded line breaks.

## Run it

```sh
node /bot/main.ts
```

`main.ts` reads `/input/cases.json`, answers each case with `run()` from `solve.js`, and writes `/output/answers.json`. Outside a container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
