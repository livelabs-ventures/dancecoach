import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Smooths landmark positions between frames using linear interpolation.
 * Prevents jittery skeleton movement.
 */
export class LandmarkSmoother {
  private previous: NormalizedLandmark[] | null = null;
  private readonly alpha: number;

  /**
   * @param alpha Interpolation factor 0-1. Lower = smoother but laggier.
   *              0.35 gives a nice balance between responsiveness and smoothness.
   */
  constructor(alpha: number = 0.35) {
    this.alpha = alpha;
  }

  smooth(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    if (!this.previous || this.previous.length !== landmarks.length) {
      this.previous = landmarks.map((lm) => ({ ...lm }));
      return landmarks;
    }

    const smoothed: NormalizedLandmark[] = landmarks.map((lm, i) => {
      const prev = this.previous![i];
      return {
        x: this.alpha * lm.x + (1 - this.alpha) * prev.x,
        y: this.alpha * lm.y + (1 - this.alpha) * prev.y,
        z: this.alpha * lm.z + (1 - this.alpha) * prev.z,
        visibility: lm.visibility,
      };
    });

    this.previous = smoothed.map((lm) => ({ ...lm }));
    return smoothed;
  }

  reset(): void {
    this.previous = null;
  }
}
