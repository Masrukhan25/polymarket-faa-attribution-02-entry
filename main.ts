// main.ts — forecaster for polymarket-faa-attribution-02.
//
// For each market of each case it forecasts the Yes price at every minute of
// the 240 minutes after the checkpoint, as five quantiles (5%, 25%, 50%, 75%,
// 95%). The forecast is a normal-quantile band around the market's last price:
//
//   q_tau(h) = clamp(x + z_tau * sigma * sqrt(h), 0, 1), rounded to 6 decimals
//
// where x is the price at the checkpoint, h = 1..240, and z_tau is the
// standard normal's quantile at each level. The one thing this entry changes
// against the house baseline is sigma: instead of the baseline's fixed 0.0025
// for every market, sigma is estimated per market from that market's own
// recent one-minute price changes, so a market that has been moving gets a
// wider band and a quiet market a sharper one.
//
// Sigma estimation (per market, per case):
//   - Take the last 240 one-minute changes (fewer if the market has fewer
//     prices). Prices move in steps with occasional big jumps, so a plain
//     standard deviation is inflated by the jumps and a median is degenerate
//     (more than half the minutes often do not move at all). The mean absolute
//     change is robust to both: it uses every move but no single jump
//     dominates it. For a normal move, E|change| = sigma * sqrt(2/pi), so
//     sigma = mean(|change|) * sqrt(pi/2) ~= mean(|change|) * 1.2533.
//   - Clamp sigma to [0.0005, 0.02]. The floor keeps a flat market from
//     getting a degenerate zero-width band; the cap keeps a market that just
//     jumped from getting an absurdly wide one.
//   - A market with fewer than 2 prices has no change to measure; it takes
//     the baseline's 0.0025.
//
// Drift: none (0). The price is treated as a martingale: the best forecast
// of the future price is the current price. Every drift I tested — a shrunk
// recent trend over 30, 60 or 120 minutes, shrink 0.1 to 0.25 — made the
// practice loss worse on both halves of the practice (p00-p02 and p03-p05),
// so the drift is set to 0. The house baseline also uses drift 0.
//
// The program reads every <id>.in in the input directory (the grader runs
// one case at a time, with only that case's file there) and writes
// <id>.out to the output directory. Standard library only, no network, no
// dependencies. Deterministic: the same input writes the same bytes.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

/** The quantile levels the contest scores, in the order each row lists them. */
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level, to 6 decimals. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** How many recent one-minute changes feed the sigma estimate. */
const SIGMA_WINDOW = 240;
/** sqrt(pi / 2): converts a mean absolute normal move into its sigma. */
const MEAN_ABS_TO_SIGMA = 1.2533141373155001;
/** Sigma is clamped to this range (price units per square-root minute). */
const SIGMA_LO = 0.0005;
const SIGMA_HI = 0.02;
/** Fallback sigma when a market has fewer than 2 prices (the baseline's). */
const SIGMA_DEFAULT = 0.0025;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

/** x clamped to [0, 1] and rounded to 6 decimals (0, never -0). */
const price6 = (x: number): number =>
  Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/**
 * A market's per-minute sigma from its recent one-minute changes.
 * Mean absolute change, scaled to a normal sigma, clamped to a sane range.
 */
function estimateSigma(prices: number[]): number {
  const n = prices.length;
  if (n < 2) return SIGMA_DEFAULT;
  const w = Math.min(SIGMA_WINDOW, n - 1);
  let sumAbs = 0;
  for (let i = n - 1 - w; i < n - 1; i++) {
    sumAbs += Math.abs(prices[i + 1]! - prices[i]!);
  }
  const sigma = (sumAbs / w) * MEAN_ABS_TO_SIGMA;
  return Math.min(SIGMA_HI, Math.max(SIGMA_LO, sigma));
}

/** One market's forecast: horizon rows of the five quantiles around its last price. */
function forecast(m: CaseMarket, horizon: number): number[][] {
  // Ignore any non-finite price (a corrupt tick): the forecast uses the
  // market's finite prices only, and fails loudly if there are none.
  const prices = m.prices.filter((p) => Number.isFinite(p));
  if (prices.length === 0) {
    throw new Error(`market ${m.id} has no finite prices`);
  }
  const x = prices[prices.length - 1] as number;
  const sigma = estimateSigma(prices);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const spread = sigma * Math.sqrt(h);
    rows.push(Z.map((z) => price6(x + z * spread)));
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR)
  .filter((f) => f.endsWith(".in"))
  .sort();
for (const file of inputs) {
  const id = file.slice(0, -".in".length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), "utf8")) as Case;
  if (
    c.quantiles.length !== QUANTILES.length ||
    c.quantiles.some((t, j) => t !== QUANTILES[j])
  ) {
    throw new Error(
      `${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`,
    );
  }
  const forecasts = c.markets.map((m) => ({
    id: m.id,
    q: forecast(m, c.horizon_minutes),
  }));
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
