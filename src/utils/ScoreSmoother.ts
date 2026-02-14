/**
 * Exponential moving average smoother for pose comparison scores.
 * Prevents flickering by smoothing scores over multiple frames.
 */
export class ScoreSmoother {
  private smoothedRegions: Record<string, number> = {};
  private smoothedOverall: number = 0;
  private hasData: boolean = false;
  private readonly alpha: number;

  /**
   * @param alpha Smoothing factor 0-1. Lower = smoother but laggier. 
   *              0.12 ≈ smooth over ~8 frames at 30fps
   */
  constructor(alpha: number = 0.12) {
    this.alpha = alpha;
  }

  update(
    regionScores: Record<string, number>,
    overallScore: number
  ): { regions: Record<string, number>; overall: number } {
    if (!this.hasData) {
      // First frame — initialize directly
      this.smoothedRegions = { ...regionScores };
      this.smoothedOverall = overallScore;
      this.hasData = true;
    } else {
      // EMA: smoothed = alpha * new + (1 - alpha) * previous
      for (const key of Object.keys(regionScores)) {
        const prev = this.smoothedRegions[key] ?? regionScores[key];
        this.smoothedRegions[key] = this.alpha * regionScores[key] + (1 - this.alpha) * prev;
      }
      this.smoothedOverall = this.alpha * overallScore + (1 - this.alpha) * this.smoothedOverall;
    }

    return {
      regions: { ...this.smoothedRegions },
      overall: this.smoothedOverall,
    };
  }

  reset(): void {
    this.smoothedRegions = {};
    this.smoothedOverall = 0;
    this.hasData = false;
  }
}
