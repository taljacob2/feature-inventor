/**
 * Runtime-neutral feature-prioritization primitives.
 *
 * Agent runtimes may propose candidates and estimate collision risk, but the
 * arithmetic that chooses their execution order belongs in ordinary tested
 * TypeScript so every runtime reaches the same result.
 */

export interface IceInputs {
  impact: number;
  confidence: number;
  ease: number;
}

/** A candidate must have a stable title because collision pairs refer to it. */
export interface PrioritizableFeature extends IceInputs {
  title: string;
}

export interface FeatureCollision {
  featureA: string;
  featureB: string;
  /** 0 = unrelated; 100 = near-total predicted overlap. */
  collisionRate: number;
}

/**
 * Computes an ordinary ICE composite. Validation is intentionally separate:
 * callers may decide whether malformed agent-provided data is rejected,
 * repaired, or logged before the candidate reaches this deterministic layer.
 */
export function computeIceScore(feature: IceInputs): number {
  return (feature.impact + feature.confidence + feature.ease) / 3;
}

/** Places a score in a 0.5-wide ICE tier, preserving the historical policy. */
export function iceTier(feature: IceInputs): number {
  return Math.round(computeIceScore(feature) * 2) / 2;
}

/**
 * Looks up a collision estimate without assuming a particular pair order.
 * Missing estimates are treated as no known collision risk so an incomplete
 * estimate cannot prevent a run from being planned.
 */
export function collisionRateBetween(
  collisionPairs: readonly FeatureCollision[],
  titleA: string,
  titleB: string,
): number {
  const found = collisionPairs.find(
    (pair) =>
      (pair.featureA === titleA && pair.featureB === titleB) ||
      (pair.featureA === titleB && pair.featureB === titleA),
  );
  return found ? found.collisionRate : 0;
}

/**
 * Orders candidates by descending ICE tier. Within a tier, it greedily selects
 * the candidate with the lowest predicted collision rate against the feature
 * placed immediately before it. The input list is never mutated.
 */
export function orderByIceTierThenMinimalCollision<T extends PrioritizableFeature>(
  features: readonly T[],
  collisionPairs: readonly FeatureCollision[],
): T[] {
  const tiers = new Map<number, T[]>();
  for (const feature of features) {
    const key = iceTier(feature);
    const current = tiers.get(key) ?? [];
    current.push(feature);
    tiers.set(key, current);
  }

  const ordered: T[] = [];
  let previous: T | null = null;

  for (const tier of [...tiers.keys()].sort((a, b) => b - a)) {
    const remaining = [...(tiers.get(tier) ?? [])];
    while (remaining.length > 0) {
      let bestIndex = 0;
      if (previous) {
        let bestRate = Infinity;
        for (const [index, feature] of remaining.entries()) {
          const rate = collisionRateBetween(collisionPairs, previous.title, feature.title);
          if (rate < bestRate) {
            bestRate = rate;
            bestIndex = index;
          }
        }
      }

      const [next] = remaining.splice(bestIndex, 1);
      if (!next) break;
      ordered.push(next);
      previous = next;
    }
  }

  return ordered;
}
