import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

type Region = "leftArm" | "rightArm" | "leftLeg" | "rightLeg" | "torso";

export interface AngleComparison {
  name: string;
  refAngle: number;
  userAngle: number;
  diff: number;
  score: number;
  region: Region;
}

export interface PoseComparisonResult {
  angles: AngleComparison[];
  overallScore: number;
  regionScores: Record<string, number>;
}

/**
 * Calculate the angle at joint B given three points A, B, C (in degrees).
 */
function calculateAngle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark
): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };

  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Calculate torso lean angle relative to vertical.
 */
function calculateTorsoLean(landmarks: NormalizedLandmark[]): number {
  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lHip = landmarks[23];
  const rHip = landmarks[24];

  if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

  const midShoulderX = (lShoulder.x + rShoulder.x) / 2;
  const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
  const midHipX = (lHip.x + rHip.x) / 2;
  const midHipY = (lHip.y + rHip.y) / 2;

  const dx = midShoulderX - midHipX;
  const dy = midShoulderY - midHipY;

  // Angle from vertical (straight up is 0°)
  return Math.abs(Math.atan2(dx, -dy) * (180 / Math.PI));
}

// Angle definitions: [name, landmark indices A→B→C, region]
const ANGLE_DEFINITIONS: Array<{
  name: string;
  indices: [number, number, number];
  region: Region;
}> = [
  // Elbow angles (shoulder → elbow → wrist)
  { name: "Left Elbow", indices: [11, 13, 15], region: "leftArm" },
  { name: "Right Elbow", indices: [12, 14, 16], region: "rightArm" },
  // Shoulder angles (elbow → shoulder → hip)
  { name: "Left Shoulder", indices: [13, 11, 23], region: "leftArm" },
  { name: "Right Shoulder", indices: [14, 12, 24], region: "rightArm" },
  // Knee angles (hip → knee → ankle)
  { name: "Left Knee", indices: [23, 25, 27], region: "leftLeg" },
  { name: "Right Knee", indices: [24, 26, 28], region: "rightLeg" },
  // Hip angles (shoulder → hip → knee)
  { name: "Left Hip", indices: [11, 23, 25], region: "leftLeg" },
  { name: "Right Hip", indices: [12, 24, 26], region: "rightLeg" },
];

/**
 * Score an angular difference.
 * diff < 15° → 1.0
 * 15–30° → linear 1.0→0.5
 * 30–60° → linear 0.5→0.0
 * > 60° → 0.0
 */
export function scoreAngle(diff: number): number {
  if (diff < 15) return 1.0;
  if (diff < 30) return 1.0 - ((diff - 15) / 15) * 0.5; // 1.0 → 0.5
  if (diff < 60) return 0.5 - ((diff - 30) / 30) * 0.5; // 0.5 → 0.0
  return 0.0;
}

const MIN_VISIBILITY = 0.5;

function landmarkVisible(lm: NormalizedLandmark | undefined): boolean {
  return lm !== undefined && (lm.visibility ?? 0) >= MIN_VISIBILITY;
}

/**
 * Compare two pose landmark sets and produce a comparison result.
 * Returns null if either set is too small / not detected.
 */
export function comparePoses(
  refLandmarks: NormalizedLandmark[],
  userLandmarks: NormalizedLandmark[]
): PoseComparisonResult | null {
  if (refLandmarks.length < 33 || userLandmarks.length < 33) return null;

  const angles: AngleComparison[] = [];

  for (const def of ANGLE_DEFINITIONS) {
    const [a, b, c] = def.indices;
    const refA = refLandmarks[a];
    const refB = refLandmarks[b];
    const refC = refLandmarks[c];
    const userA = userLandmarks[a];
    const userB = userLandmarks[b];
    const userC = userLandmarks[c];

    // Skip if any landmark has low visibility
    if (
      !landmarkVisible(refA) ||
      !landmarkVisible(refB) ||
      !landmarkVisible(refC) ||
      !landmarkVisible(userA) ||
      !landmarkVisible(userB) ||
      !landmarkVisible(userC)
    ) {
      continue;
    }

    const refAngle = calculateAngle(refA, refB, refC);
    const userAngle = calculateAngle(userA, userB, userC);
    const diff = Math.abs(refAngle - userAngle);

    angles.push({
      name: def.name,
      refAngle,
      userAngle,
      diff,
      score: scoreAngle(diff),
      region: def.region,
    });
  }

  // Torso lean comparison
  const refLean = calculateTorsoLean(refLandmarks);
  const userLean = calculateTorsoLean(userLandmarks);
  const leanDiff = Math.abs(refLean - userLean);
  angles.push({
    name: "Torso Lean",
    refAngle: refLean,
    userAngle: userLean,
    diff: leanDiff,
    score: scoreAngle(leanDiff),
    region: "torso",
  });

  if (angles.length === 0) return null;

  // Per-region scores
  const regionBuckets: Record<string, number[]> = {};
  for (const a of angles) {
    if (!regionBuckets[a.region]) regionBuckets[a.region] = [];
    regionBuckets[a.region].push(a.score);
  }

  const regionScores: Record<string, number> = {};
  for (const [region, scores] of Object.entries(regionBuckets)) {
    regionScores[region] = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  // Overall score (average of all angle scores, as percentage)
  const overallScore =
    (angles.reduce((sum, a) => sum + a.score, 0) / angles.length) * 100;

  return { angles, overallScore, regionScores };
}
