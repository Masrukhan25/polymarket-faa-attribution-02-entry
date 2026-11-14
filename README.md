# FAA outage attribution forecaster — polymarket-faa-attribution-02 entry

Entry for the make.fun bounty **"Forecast Polymarket's FAA outage
attribution prices minute by minute, 4 hours ahead"**
(`polymarket-faa-attribution-02`). For each market of a case it forecasts
the Yes price at every minute of the 240 minutes after the checkpoint, as
five quantiles (5%, 25%, 50%, 75%, 95%).

## Method

A normal-quantile band around the market's last price:

```
q_tau(h) = clamp(x + z_tau * sigma * sqrt(h), 0, 1), rounded to 6 decimals
```

`x` is the price at the checkpoint, `h = 1..240`, and `z_tau` is the
standard normal's quantile at each level. The one change against the house
baseline is **sigma**: instead of the baseline's fixed 0.0025 for every
market, sigma is estimated per market from that market's own recent
one-minute price changes, so a market that has been moving gets a wider
band and a quiet market a sharper one.

**Sigma estimation (per market, per case).** Take the last 240 one-minute
changes (fewer if the market has fewer prices). Prices move in steps with
occasional big jumps, so a plain standard deviation is inflated by the
jumps and a median is degenerate (more than half the minutes often do not
move at all). The mean absolute change is robust to both: it uses every
move but no single jump dominates it. For a normal move,
E|change| = sigma * sqrt(2/pi), so
`sigma = mean(|change|) * sqrt(pi/2) ~= mean(|change|) * 1.2533`.
Sigma is clamped to [0.0005, 0.02]. A market with fewer than 2 prices
takes the baseline's 0.0025.

**Drrift: none (0).** The price is treated as a martingale: the best
forecast of the future price is the current price. Every drift I tested —
a shrunk recent trend over 30, 60 or 120 minutes, shrink 0.1 to 0.25 —
made the practice loss worse on both halves of the practice, so the drift
is set to 0. The house baseline also uses drift 0.

## Validation (practice, 6 cases from the NVIDIA CEO event)

Local pinball-loss scorer (same formula as RULES.txt), answers from the
next case's prices for p00–p04 and from Polymarket's public price history
for p05. Item-weighted mean over every case/market/minute/quantile.

| | loss |
|---|---|
| House baseline | **0.363589** |
| This entry | **0.283325** |

Per case (baseline → this entry): p00 0.536138 → 0.471152, p01 0.380352 →
0.320080, p02 0.408408 → 0.358240, p03 0.368599 → 0.280173, p04 0.298794 →
0.210591, p05 0.238232 → 0.121981. It beats the baseline on every case.

**Held-out check.** Tune on p00–p02 → mean-abs window 240 (best there,
0.383157); on p03–p05 it scores 0.203178 vs baseline 0.300935 (win).
Tune on p03–p05 → mean-abs window 120 (best there, 0.193653); on
p00–p02 it scores 0.399174 vs baseline 0.441632 (win). The final method
(mean-abs, window 240, drift 0) wins on both held-out halves.

**Edge cases.** A market with 1–3 prices, a market flat at 0 or 1, and a
market that just jumped all produce valid output (240 rows, 5
non-decreasing numbers in [0,1], correct market ids, < 1 MiB). Two runs
on the same input write byte-identical files.

## Run locally

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
# -> out/p00.out .. out/p05.out
```

`main.ts` is Node 22, standard library only, no network, no dependencies.
