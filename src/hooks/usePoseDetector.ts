import { useCallback, useEffect, useRef, useState } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const VISION_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

export type PoseResult = PoseLandmarkerResult;

interface UsePoseDetectorReturn {
  isLoading: boolean;
  error: string | null;
  detect: (video: HTMLVideoElement, timestamp: number) => PoseResult | null;
  landmarker: PoseLandmarker | null;
}

export function usePoseDetector(): UsePoseDetectorReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load PoseLandmarker:", err);
          setError(
            err instanceof Error ? err.message : "Failed to load pose model"
          );
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
    };
  }, []);

  const detect = useCallback(
    (video: HTMLVideoElement, timestamp: number): PoseResult | null => {
      if (!landmarkerRef.current) return null;
      if (video.readyState < 2) return null;

      try {
        return landmarkerRef.current.detectForVideo(video, timestamp);
      } catch (err) {
        console.warn("Pose detection error:", err);
        return null;
      }
    },
    []
  );

  return {
    isLoading,
    error,
    detect,
    landmarker: landmarkerRef.current,
  };
}
