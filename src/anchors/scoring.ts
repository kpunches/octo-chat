namespace WGU.Anchors.Scoring {
  export interface CandidateScoreInput { exact?: boolean; structural?: boolean; prefixSuffix?: boolean; sameHeading?: boolean; rareTokenOverlap?: number; }
  export function scoreCandidate(input: CandidateScoreInput): number {
    let score = 0;
    if (input.structural) score += 100;
    if (input.exact) score += 70;
    if (input.prefixSuffix) score += 50;
    if (input.sameHeading) score += 25;
    if (input.rareTokenOverlap) score += Math.min(30, input.rareTokenOverlap * 5);
    return score;
  }
}
