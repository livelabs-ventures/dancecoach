import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { usePoseDetector } from "../hooks/usePoseDetector";
import { drawSkeleton } from "../utils/SkeletonRenderer";
import { comparePoses } from "../utils/PoseComparison";
import type { PoseComparisonResult } from "../utils/PoseComparison";
import { ScoreSmoother } from "../utils/ScoreSmoother";
import { LandmarkSmoother } from "../utils/LandmarkSmoother";

type CameraState = "idle" | "requesting" | "active" | "error";

interface CameraFeedProps {
  isRunning: boolean;
  onFpsUpdate?: (fps: number) => void;
  referenceLandmarks?: NormalizedLandmark[] | null;
  onComparisonUpdate?: (result: PoseComparisonResult | null) => void;
}

export default function CameraFeed({
  isRunning,
  onFpsUpdate,
  referenceLandmarks,
  onComparisonUpdate,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(0);
  const fpsFrames = useRef<number[]>([]);
  const refLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const scoreSmootherRef = useRef(new ScoreSmoother(0.12));
  const landmarkSmootherRef = useRef(new LandmarkSmoother(0.35));

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const { isLoading: modelLoading, error: modelError, detect } = usePoseDetector();

  // Keep ref landmarks in a ref for the animation loop to avoid re-creating the loop
  useEffect(() => {
    refLandmarksRef.current = referenceLandmarks ?? null;
  }, [referenceLandmarks]);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    setCameraState("requesting");
    setErrorMessage("");

    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState("active");
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraState("error");
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setErrorMessage("Camera permission denied. Please allow camera access.");
        } else if (err.name === "NotFoundError") {
          setErrorMessage("No camera found on this device.");
        } else {
          setErrorMessage(`Camera error: ${err.message}`);
        }
      } else {
        setErrorMessage("Failed to access camera.");
      }
    }
  }, []);

  // Start camera when session starts
  useEffect(() => {
    if (isRunning) {
      startCamera(facingMode);
    } else {
      // Stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraState("idle");
      scoreSmootherRef.current.reset();
      landmarkSmootherRef.current.reset();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isRunning, facingMode, startCamera]);

  // Detection loop
  useEffect(() => {
    if (cameraState !== "active" || !isRunning) return;

    let running = true;

    const loop = () => {
      if (!running) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      // Sync canvas size with video display size
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const now = performance.now();
      // Avoid sending duplicate timestamps
      const timestamp = now > lastTimestampRef.current ? now : lastTimestampRef.current + 1;
      lastTimestampRef.current = timestamp;

      const result = detect(video, timestamp);

      const ctx = canvas.getContext("2d");
      if (ctx && result && result.landmarks.length > 0) {
        // Smooth landmark positions to reduce jitter
        const rawLandmarks = result.landmarks[0];
        const userLandmarks = landmarkSmootherRef.current.smooth(rawLandmarks);

        // Compare with reference if available
        let regionScores: Record<string, number> | undefined;
        const refLm = refLandmarksRef.current;
        if (refLm) {
          const comparison = comparePoses(refLm, userLandmarks);
          if (comparison) {
            // Smooth scores over frames to prevent flickering
            const smoothed = scoreSmootherRef.current.update(
              comparison.regionScores,
              comparison.overallScore
            );
            regionScores = smoothed.regions;
            onComparisonUpdate?.({
              ...comparison,
              regionScores: smoothed.regions,
              overallScore: smoothed.overall,
            });
          } else {
            onComparisonUpdate?.(null);
          }
        } else {
          onComparisonUpdate?.(null);
        }

        drawSkeleton(ctx, userLandmarks, canvas.width, canvas.height, {}, regionScores, "camera");
      } else if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onComparisonUpdate?.(null);
      }

      // FPS calculation
      fpsFrames.current.push(now);
      const oneSecAgo = now - 1000;
      fpsFrames.current = fpsFrames.current.filter((t) => t > oneSecAgo);
      onFpsUpdate?.(fpsFrames.current.length);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraState, isRunning, detect, onFpsUpdate, onComparisonUpdate]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  return (
    <div className="relative w-full h-full bg-dark-card overflow-hidden">
      {/* Video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
      />

      {/* Skeleton overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
      />

      {/* Camera toggle button — glassmorphism */}
      {cameraState === "active" && (
        <button
          onClick={toggleCamera}
          className="absolute top-3 right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-90 border border-white/15"
          style={{
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
          aria-label="Toggle camera"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
        </button>
      )}

      {/* Status overlays */}
      {cameraState === "idle" && !isRunning && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center" style={{ animation: "slide-up 0.6s ease-out 0.2s both" }}>
            <div className="text-4xl mb-3 opacity-40">🎭</div>
            <p
              className="text-white/25 text-xs tracking-[0.2em] font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              YOUR STAGE
            </p>
          </div>
        </div>
      )}

      {cameraState === "requesting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark/80">
          <div className="text-center">
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: "rgba(255,45,120,0.6)", borderTopColor: "transparent" }}
            />
            <p className="text-white/50 text-xs tracking-wider"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Accessing camera...
            </p>
          </div>
        </div>
      )}

      {modelLoading && cameraState === "active" && (
        <div
          className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-full border border-white/10"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <p className="text-xs flex items-center gap-2" style={{ color: "#ff2d78" }}>
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#ff2d78", animation: "dot-pulse 1.5s ease-in-out infinite" }}
            />
            Loading pose model...
          </p>
        </div>
      )}

      {(modelError || cameraState === "error") && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark/90">
          <div className="text-center px-6 max-w-sm" style={{ animation: "slide-up 0.4s ease-out" }}>
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm" style={{ color: "#ffd700" }}>
              {errorMessage || modelError}
            </p>
            {cameraState === "error" && (
              <button
                onClick={() => startCamera(facingMode)}
                className="mt-4 px-5 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 border border-white/10"
                style={{
                  fontFamily: "var(--font-display)",
                  background: "rgba(255,45,120,0.15)",
                  color: "#ff2d78",
                  letterSpacing: "0.05em",
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
