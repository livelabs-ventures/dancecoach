import { useState, useCallback, useRef, useEffect } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import CameraFeed from "./components/CameraFeed";
import ReferenceVideo from "./components/ReferenceVideo";
import type { PoseComparisonResult } from "./utils/PoseComparison";

function getScoreColor(score: number): string {
  if (score >= 80) return "#00ff88";
  if (score >= 50) return "#ffaa00";
  return "#ff2d44";
}

function getScoreGlow(score: number): string {
  if (score >= 80) return "0 0 20px rgba(0,255,136,0.4), 0 0 40px rgba(0,255,136,0.15)";
  if (score >= 50) return "0 0 20px rgba(255,170,0,0.4), 0 0 40px rgba(255,170,0,0.15)";
  return "0 0 20px rgba(255,45,68,0.4), 0 0 40px rgba(255,45,68,0.15)";
}

function getScoreBorderColor(score: number): string {
  if (score >= 80) return "rgba(0,255,136,0.3)";
  if (score >= 50) return "rgba(255,170,0,0.3)";
  return "rgba(255,45,68,0.3)";
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [fps, setFps] = useState(0);
  const [refLandmarks, setRefLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [displayScore, setDisplayScore] = useState<number | null>(null);

  // Smoothed score using lerp
  const targetScoreRef = useRef<number | null>(null);
  const displayScoreRef = useRef<number | null>(null);
  const lerpFrameRef = useRef<number>(0);

  const handleFpsUpdate = useCallback((value: number) => {
    setFps(value);
  }, []);

  const handleLandmarksUpdate = useCallback((landmarks: NormalizedLandmark[] | null) => {
    setRefLandmarks(landmarks);
  }, []);

  const handleComparisonUpdate = useCallback((result: PoseComparisonResult | null) => {
    targetScoreRef.current = result ? result.overallScore : null;
  }, []);

  // Smooth score lerp animation
  useEffect(() => {
    let running = true;

    const lerpLoop = () => {
      if (!running) return;

      const target = targetScoreRef.current;
      const current = displayScoreRef.current;

      if (target === null) {
        if (current !== null) {
          displayScoreRef.current = null;
          setDisplayScore(null);
        }
      } else if (current === null) {
        displayScoreRef.current = target;
        setDisplayScore(Math.round(target));
      } else {
        // Lerp towards target
        const newVal = current + (target - current) * 0.15;
        displayScoreRef.current = newVal;
        setDisplayScore(Math.round(newVal));
      }

      lerpFrameRef.current = requestAnimationFrame(lerpLoop);
    };

    lerpFrameRef.current = requestAnimationFrame(lerpLoop);

    return () => {
      running = false;
      cancelAnimationFrame(lerpFrameRef.current);
    };
  }, []);

  // Reset score when not running
  useEffect(() => {
    if (!isRunning) {
      targetScoreRef.current = null;
      displayScoreRef.current = null;
      setDisplayScore(null);
    }
  }, [isRunning]);

  const scoreColor = displayScore !== null ? getScoreColor(displayScore) : "#ff2d78";
  const scoreGlow = displayScore !== null ? getScoreGlow(displayScore) : "none";
  const scoreBorder = displayScore !== null ? getScoreBorderColor(displayScore) : "transparent";

  return (
    <div className="h-full w-full flex flex-col relative bg-dark" style={{ zIndex: 1 }}>
      {/* Edge gradient overlays */}
      <div
        className="absolute inset-0 z-20 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(10,10,10,0.3) 0%, transparent 8%, transparent 92%, rgba(10,10,10,0.3) 100%)",
        }}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-2.5 pointer-events-none">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full bg-neon-pink"
            style={{ animation: "dot-pulse 2s ease-in-out infinite" }}
          />
          <h1
            className="text-xs font-bold tracking-[0.25em] text-white/80"
            style={{ fontFamily: "var(--font-display)" }}
          >
            DANCECOACH
          </h1>
        </div>
        {/* FPS Counter — glassmorphism pill */}
        {isRunning && (
          <div className="px-2.5 py-1 rounded-full border border-white/10"
            style={{
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <span className="text-[10px] font-mono text-white/40">{fps} FPS</span>
          </div>
        )}
      </div>

      {/* Top half: Reference video */}
      <div className="flex-1 min-h-0">
        <ReferenceVideo
          isRunning={isRunning}
          onLandmarksUpdate={handleLandmarksUpdate}
        />
      </div>

      {/* Glowing divider with score display */}
      <div className="relative z-10 flex items-center justify-center"
        style={{ height: "2px" }}
      >
        {/* Glow line */}
        <div
          className="absolute inset-x-0 h-[2px]"
          style={{
            background: displayScore !== null
              ? `linear-gradient(to right, transparent, ${scoreBorder} 30%, ${scoreBorder} 70%, transparent)`
              : "linear-gradient(to right, transparent, rgba(255,45,120,0.5) 30%, rgba(0,212,255,0.5) 70%, transparent)",
            animation: "glow-line 3s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-x-0 h-[6px] -top-[2px] blur-sm"
          style={{
            background: displayScore !== null
              ? `linear-gradient(to right, transparent, ${scoreBorder} 30%, ${scoreBorder} 70%, transparent)`
              : "linear-gradient(to right, transparent, rgba(255,45,120,0.3) 30%, rgba(0,212,255,0.3) 70%, transparent)",
          }}
        />

        {/* Score pill — shown when comparison is active */}
        {displayScore !== null ? (
          <div
            className="relative z-10 flex flex-col items-center"
            style={{ animation: "slide-up 0.3s ease-out" }}
          >
            <div
              className="px-4 py-1.5 rounded-full flex items-baseline gap-0.5"
              style={{
                background: "rgba(20,20,20,0.92)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: `1px solid ${scoreBorder}`,
                boxShadow: scoreGlow,
                transition: "border-color 0.5s ease, box-shadow 0.5s ease",
              }}
            >
              <span
                className="font-extrabold"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "26px",
                  lineHeight: 1,
                  color: scoreColor,
                  transition: "color 0.5s ease",
                }}
              >
                {displayScore}
              </span>
              <span
                className="font-bold"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "14px",
                  color: scoreColor,
                  opacity: 0.7,
                  transition: "color 0.5s ease",
                }}
              >
                %
              </span>
            </div>
            <span
              className="text-[8px] font-semibold mt-0.5"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.25em",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              MATCH
            </span>
          </div>
        ) : (
          /* Default label when no comparison */
          <div
            className="relative z-10 px-3 py-0.5 rounded-full text-[9px] tracking-[0.2em] font-semibold border border-white/10"
            style={{
              background: "rgba(20,20,20,0.95)",
              backdropFilter: "blur(8px)",
              color: "rgba(255,255,255,0.5)",
              fontFamily: "var(--font-display)",
            }}
          >
            MIRROR
          </div>
        )}
      </div>

      {/* Bottom half: Camera feed */}
      <div className="flex-1 min-h-0">
        <CameraFeed
          isRunning={isRunning}
          onFpsUpdate={handleFpsUpdate}
          referenceLandmarks={refLandmarks}
          onComparisonUpdate={handleComparisonUpdate}
        />
      </div>

      {/* Start/Stop button */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
        {isRunning ? (
          <button
            onClick={() => setIsRunning(false)}
            className="group relative w-16 h-16 rounded-full transition-all duration-300 active:scale-90"
          >
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border-2 border-red-500/40" />
            {/* Glass bg */}
            <div
              className="absolute inset-[3px] rounded-full flex items-center justify-center"
              style={{
                background: "rgba(20,5,5,0.85)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
              }}
            >
              {/* Stop square icon */}
              <div className="w-5 h-5 rounded-sm bg-red-500" />
            </div>
          </button>
        ) : (
          <button
            onClick={() => setIsRunning(true)}
            className="group relative w-20 h-20 rounded-full transition-all duration-300 active:scale-90"
          >
            {/* Animated glow ring */}
            <div
              className="absolute -inset-1 rounded-full opacity-60"
              style={{
                background: "linear-gradient(135deg, #ff2d78, #ff6b9d, #ff2d78)",
                filter: "blur(8px)",
                animation: "pulse-glow 3s ease-in-out infinite",
              }}
            />
            {/* Outer ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(135deg, #ff2d78 0%, #ff6b9d 50%, #ff2d78 100%)",
                padding: "2px",
              }}
            >
              <div className="w-full h-full rounded-full bg-dark flex items-center justify-center">
                {/* Inner gradient fill */}
                <div
                  className="absolute inset-[3px] rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #ff2d78 0%, #d4246a 100%)",
                  }}
                />
                {/* Play triangle */}
                <svg viewBox="0 0 24 24" className="w-8 h-8 relative z-10 ml-1" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
