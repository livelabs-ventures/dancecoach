import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// BlazePose 33-landmark connection map
// Each pair is [startIndex, endIndex]
const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12],
  [11, 23], [12, 24],
  [23, 24],
  // Left arm
  [11, 13], [13, 15],
  [15, 17], [15, 19], [15, 21],
  [17, 19],
  // Right arm
  [12, 14], [14, 16],
  [16, 18], [16, 20], [16, 22],
  [18, 20],
  // Left leg
  [23, 25], [25, 27],
  [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28],
  [28, 30], [28, 32], [30, 32],
];

// Default neon color scheme per region (used when no comparison scores provided)
const DEFAULT_REGION_COLORS: Record<string, { start: string; end: string }> = {
  face: { start: "rgba(255,45,120,0.15)", end: "rgba(255,45,120,0.15)" },
  torso: { start: "rgba(255,255,255,0.7)", end: "rgba(255,255,255,0.5)" },
  leftArm: { start: "rgba(0,212,255,0.8)", end: "rgba(255,45,120,0.6)" },
  rightArm: { start: "rgba(0,212,255,0.8)", end: "rgba(255,45,120,0.6)" },
  leftLeg: { start: "rgba(0,212,255,0.7)", end: "rgba(255,45,120,0.5)" },
  rightLeg: { start: "rgba(0,212,255,0.7)", end: "rgba(255,45,120,0.5)" },
};

// Map landmark index to its body region for comparison coloring
function getLandmarkRegion(idx: number): string {
  if (idx <= 10) return "face";
  if ([11, 13, 15, 17, 19, 21].includes(idx)) return "leftArm";
  if ([12, 14, 16, 18, 20, 22].includes(idx)) return "rightArm";
  if ([23, 25, 27, 29, 31].includes(idx)) return "leftLeg";
  if ([24, 26, 28, 30, 32].includes(idx)) return "rightLeg";
  return "torso";
}

function getConnectionRegion(start: number, end: number): string {
  if (start <= 10 && end <= 10) return "face";
  if ([11, 12, 23, 24].includes(start) && [11, 12, 23, 24].includes(end)) return "torso";
  if ([11, 13, 15, 17, 19, 21].includes(start) || [11, 13, 15, 17, 19, 21].includes(end)) {
    if (start >= 11 && end >= 11 && start <= 21 && end <= 21 && (start % 2 !== 0 || start === 11)) return "leftArm";
  }
  if ([12, 14, 16, 18, 20, 22].includes(start) || [12, 14, 16, 18, 20, 22].includes(end)) {
    if (start >= 12 && end >= 12 && start <= 22 && end <= 22 && (start % 2 === 0 || start === 12)) return "rightArm";
  }
  if (start >= 23 && end >= 23) {
    if ([23, 25, 27, 29, 31].includes(start) && [23, 25, 27, 29, 31].includes(end)) return "leftLeg";
    if ([24, 26, 28, 30, 32].includes(start) && [24, 26, 28, 30, 32].includes(end)) return "rightLeg";
  }
  return "torso";
}

/**
 * Get comparison-based color from a region score (0–1).
 *  >= 0.8  → green  #00ff88
 *  0.5–0.8 → yellow #ffaa00
 *  < 0.5   → red    #ff2d44
 */
function scoreToColor(score: number): string {
  if (score >= 0.8) return "#00ff88";
  if (score >= 0.5) return "#ffaa00";
  return "#ff2d44";
}

function scoreToRgba(score: number, alpha: number): string {
  if (score >= 0.8) return `rgba(0,255,136,${alpha})`;
  if (score >= 0.5) return `rgba(255,170,0,${alpha})`;
  return `rgba(255,45,68,${alpha})`;
}

export interface SkeletonStyle {
  jointColor?: string;
  jointRadius?: number;
  boneWidth?: number;
  minVisibility?: number;
}

const DEFAULT_STYLE: Required<SkeletonStyle> = {
  jointColor: "#ff2d78",
  jointRadius: 5,
  boneWidth: 2.5,
  minVisibility: 0.5,
};

// Trail buffer — stores last N frames of landmark positions
// Use a Map keyed by canvas id to avoid cross-component contamination
const TRAIL_BUFFER_SIZE = 3;
const trailBuffers = new Map<string, Array<{ x: number; y: number }[]>>();

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  style: SkeletonStyle = {},
  regionScores?: Record<string, number>,
  trailId: string = "default"
): void {
  const s = { ...DEFAULT_STYLE, ...style };
  const hasComparison = regionScores !== undefined && Object.keys(regionScores).length > 0;

  ctx.clearRect(0, 0, width, height);

  // Get or create trail buffer for this instance
  if (!trailBuffers.has(trailId)) {
    trailBuffers.set(trailId, []);
  }
  const trailBuffer = trailBuffers.get(trailId)!;

  // Compute pixel positions for current frame
  const currentPositions = landmarks.map((lm) => ({
    x: lm.x * width,
    y: lm.y * height,
  }));

  // Push current frame into trail buffer
  trailBuffer.push(currentPositions);
  if (trailBuffer.length > TRAIL_BUFFER_SIZE) {
    trailBuffer.shift();
  }

  // Draw trail (previous frames at decreasing opacity)
  const majorJoints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  for (let frameIdx = 0; frameIdx < trailBuffer.length - 1; frameIdx++) {
    const trailFrame = trailBuffer[frameIdx];
    const trailOpacity = ((frameIdx + 1) / trailBuffer.length) * 0.15;

    for (const idx of majorJoints) {
      const lm = landmarks[idx];
      if (!lm || (lm.visibility ?? 0) < s.minVisibility) continue;

      const pos = trailFrame[idx];
      if (!pos) continue;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, s.jointRadius + 2, 0, Math.PI * 2);

      if (hasComparison) {
        const region = getLandmarkRegion(idx);
        const score = regionScores[region] ?? 1;
        ctx.fillStyle = scoreToRgba(score, trailOpacity);
      } else {
        ctx.fillStyle = `rgba(255, 45, 120, ${trailOpacity})`;
      }
      ctx.fill();
    }
  }

  // Draw bones with gradient
  for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];

    if (!start || !end) continue;
    if ((start.visibility ?? 0) < s.minVisibility || (end.visibility ?? 0) < s.minVisibility) continue;

    const sx = start.x * width;
    const sy = start.y * height;
    const ex = end.x * width;
    const ey = end.y * height;

    const region = getConnectionRegion(startIdx, endIdx);

    if (hasComparison) {
      const score = regionScores[region] ?? 1;
      const color = scoreToColor(score);
      const rgbaGlow = scoreToRgba(score, 0.3);

      // Glow layer
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = rgbaGlow;
      ctx.lineWidth = s.boneWidth + 4;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.4;
      ctx.filter = "blur(3px)";
      ctx.stroke();

      // Reset
      ctx.globalAlpha = 1;
      ctx.filter = "none";

      // Main bone
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = color;
      ctx.lineWidth = s.boneWidth;
      ctx.lineCap = "round";
      ctx.stroke();
    } else {
      const colors = DEFAULT_REGION_COLORS[region] ?? DEFAULT_REGION_COLORS.torso;

      // Create gradient along bone
      const gradient = ctx.createLinearGradient(sx, sy, ex, ey);
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(1, colors.end);

      // Glow layer
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = colors.start;
      ctx.lineWidth = s.boneWidth + 4;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.15;
      ctx.filter = "blur(3px)";
      ctx.stroke();

      // Reset
      ctx.globalAlpha = 1;
      ctx.filter = "none";

      // Main bone
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = s.boneWidth;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  // Draw joints (skip minor face landmarks)
  for (const idx of majorJoints) {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility ?? 0) < s.minVisibility) continue;

    const x = lm.x * width;
    const y = lm.y * height;

    if (hasComparison) {
      const region = getLandmarkRegion(idx);
      const score = regionScores[region] ?? 1;
      const color = scoreToColor(score);

      // Outer glow
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius + 6, 0, Math.PI * 2);
      ctx.fillStyle = scoreToRgba(score, 0.08);
      ctx.fill();

      // Mid glow
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = scoreToRgba(score, 0.2);
      ctx.fill();

      // Core joint
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // White hot center
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fill();
    } else {
      // Outer neon glow
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius + 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 45, 120, 0.08)";
      ctx.fill();

      // Mid glow
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 45, 120, 0.2)";
      ctx.fill();

      // Core joint
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius, 0, Math.PI * 2);
      ctx.fillStyle = s.jointColor;
      ctx.fill();

      // White hot center
      ctx.beginPath();
      ctx.arc(x, y, s.jointRadius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fill();
    }
  }
}

export { POSE_CONNECTIONS };
