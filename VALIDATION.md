# Validation — polymarket-faa-attribution-02

Forecaster: per-market sigma from the mean absolute one-minute change
over the last 240 minutes, scaled by sqrt(pi/2) ≈ 1.2533, clamped to
[0.0005, 0.02]; drift 0. `q_tau(h) = clamp(x + z_tau*sigma*sqrt(h), 0, 1)`,
rounded to 6 decimals. See `main.ts` and `README.md`.

## Scorer

Local pinball loss, same formula as RULES.txt:
`100 * max(tau*(y-q), (tau-1)*(y-q))`, mean over every case, market,
minute and quantile (item-weighted, not a simple average of per-case
losses). Answers: for p00–p04 the next case's last 240 prices (matched by
market id; the checkpoint price was verified to match the next case's
price 240 minutes before its end, 19/19, 23/23 and 24/24 markets); for
p05 the 240 minutes after its checkpoint fetched from Polymarket's public
price history (`GET https://clob.polymarket.com/prices-history`, 24/24
markets fetched, put on the 1-minute grid).

Scorer validated by reproducing the house baseline exactly:
baseline item-weighted loss over all 6 practice cases = **0.363589**,
matching the RULES.txt figure.

## Practice losses (item-weighted mean over all 6 cases)

| Method | Loss |
|---|---|
| House baseline (fixed sigma 0.0025, drift 0) | 0.363589 |
| **This entry (mean-abs sigma, window 240, drift 0)** | **0.283325** |

Per-case loss (baseline → this entry):

| Case | Markets | Baseline | This entry |
|---|---|---|---|
| p00 | 19 | 0.536138 | 0.471152 |
| p01 | 19 | 0.380352 | 0.320080 |
| p02 | 19 | 0.408408 | 0.358240 |
| p03 | 23 | 0.368599 | 0.280173 |
| p04 | 24 | 0.298794 | 0.210591 |
| p05 | 24 | 0.238232 | 0.121981 |

This entry beats the baseline on every case. Item-weighted half means:
p00–p02 baseline 0.441632 → this entry 0.383157; p03–p05 baseline
0.300935 → this entry 0.203178.

## Held-out check (mandatory)

Parameters were chosen by comparing sigma estimators and windows. The
choice must win on a half it was not tuned on.

- **Tune on p00–p02.** Best there: mean-abs, window 240 (0.383157).
  Evaluate it on p03–p05: **0.203178 vs baseline 0.300935 — WIN.**
- **Tune on p03–p05 (swap).** Best there: mean-abs, window 120
  (0.193653). Evaluate it on p00–p02: **0.399174 vs baseline
  0.441632 — WIN.**
- **Final method** (mean-abs, window 240, drift 0) wins on both held-out
  halves: p00–p02 0.383157 < 0.441632, p03–p05 0.203178 < 0.300935.

## What was rejected (and why)

- **Drift.** Every drift tested hurt on both halves: mean-abs w240 with
  shrink 0.1/0.15/0.25 (lookback 60) gave 0.296039 / 0.306266 / 0.329332
  overall vs 0.283325 with drift 0; the same pattern held for lookback
  30 and 120 and for window 120. Prices behave like a martingale here;
  drift is set to 0.
- **MAD sigma** (median |change| * 1.4826): 0.327284 overall — worse
  than mean-abs (0.283325), because more than half the minutes do not
  move and the median collapses toward 0.
- **Plain std / RMS sigma**: badly inflated by jumps (std, all history:
  1.050112 overall). Winsorized std (0.289264 at window 120) was
  competitive but worse than mean-abs.
- **Sigma clamp variants**: [0.0005, 0.01] gave 0.282772 and [0.0002,
  0.02] gave 0.280901 vs [0.0005, 0.02] at 0.283325 — differences under
  0.003, treated as noise, not tuned on. Kept the suggested [0.0005,
  0.02].

## Edge cases (synthetic, all valid)

| Case | Market | Result |
|---|---|---|
| e1 | 1 price (0.5) | Valid; fallback sigma 0.0025 |
| e2 | 3 prices | Valid |
| e3 | flat at 0.0 (121 prices) | Valid; quantiles in [0,1], non-decreasing |
| e4 | flat at 1.0 (121 prices) | Valid |
| e5 | flat then a jump 0.5 → 0.275 at the end | Valid; sigma widens |
| e6 | one 2-price market + one 121-price market | Valid; both ids present |

Every output: exactly 240 rows, 5 finite numbers in [0,1] per row,
non-decreasing, correct market ids, < 1 MiB.

## Determinism and size

Two runs of `main.ts` on the 6 practice cases produce byte-identical
`.out` files (SHA-256 matched on all 6). Output sizes: p00 174,520 B,
p01 182,841 B, p02 181,286 B, p03 221,894 B, p04 239,466 B, p05 234,271 B
— all under the 1 MiB cap. Runtime is well under the 8 s per-case cap
(the whole 6-case run finishes in ~2.5 s).

## Final parameter values

- `SIGMA_WINDOW = 240` (recent one-minute changes)
- `MEAN_ABS_TO_SIGMA = 1.2533141373155001` (sqrt(pi/2))
- `SIGMA_LO = 0.0005`, `SIGMA_HI = 0.02`
- `SIGMA_DEFAULT = 0.0025` (fewer than 2 prices)
- Drift = 0 (no drift term)
- `Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854]`

## Caveat

The practice is cut from the NVIDIA CEO event, not the FAA family, and
the final is scored on 48 hours of FAA prices nobody had seen when
entries closed. The practice loss is therefore not a prediction of the
final loss — the held-out check above is the guard against overfitting
to the practice, and the method was kept to 2–4 parameters with no
event-specific tuning.
