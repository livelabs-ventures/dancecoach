import { useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { usePoseDetector } from "../hooks/usePoseDetector";
import { drawSkeleton } from "../utils/SkeletonRenderer";

interface ReferenceVideoProps {
  isRunning: boolean;
  onLandmarksUpdate?: (landmarks: NormalizedLandmark[] | null) => void;
}

// Cyan-tinted style for reference skeleton
const REF_SKELETON_STYLE = {
  jointColor: "#00d4ff",
  jointRadius: 4,
  boneWidth: 2,
  minVisibility: 0.5,
};

export default function ReferenceVideo({ isRunning, onLandmarksUpdate }: ReferenceVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const { isLoading: modelLoading, detect } = usePoseDetector();

  // Countdown when starting
  useEffect(() => {
    if (isRunning && countdown === null) {
      setCountdown(3);
      setPlaying(false);
    }
    if (!isRunning) {
      setCountdown(null);
      setElapsed(0);
      setPlaying(false);
      setIsMuted(true);
      onLandmarksUpdate?.(null);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        videoRef.current.muted = true;
      }
    }
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setPlaying(true);
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.currentTime = 0;
        videoRef.current.play().then(() => {
          // Try unmuting — if browser blocks it, user can tap the unmute button
          try {
            if (videoRef.current) {
              videoRef.current.muted = false;
              setIsMuted(false);
            }
          } catch {
            // Stay muted, user can tap to unmute
          }
        }).catch((e) => console.warn("Video play failed:", e));
      }
      const start = Date.now();
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return;
    }

    const timer = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Pose detection loop on reference video
  useEffect(() => {
    if (!playing || modelLoading) return;

    let running = true;

    const loop = () => {
      if (!running) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.paused || video.ended) {
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
      const timestamp = now > lastTimestampRef.current ? now : lastTimestampRef.current + 1;
      lastTimestampRef.current = timestamp;

      const result = detect(video, timestamp);

      const ctx = canvas.getContext("2d");
      if (ctx && result && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        drawSkeleton(ctx, landmarks, canvas.width, canvas.height, REF_SKELETON_STYLE, undefined, "reference");
        onLandmarksUpdate?.(landmarks);
      } else if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onLandmarksUpdate?.(null);
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, modelLoading, detect, onLandmarksUpdate]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative w-full h-full bg-dark-card overflow-hidden">
      {/* Video element — start muted for iOS compatibility */}
      <video
        ref={videoRef}
        src="/reference.mp4"
        playsInline
        muted
        preload="auto"
        loop
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
          playing ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Skeleton overlay canvas */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500 ${
          playing ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Overlay content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {!isRunning ? (
          /* Hero idle state — album cover vibe */
          <div className="text-center z-10" style={{ animation: "slide-up 0.6s ease-out" }}>
            <div className="relative inline-flex items-center justify-center mb-5">
              <div
                className="absolute w-28 h-28 rounded-full border border-neon-pink/20"
                style={{ animation: "ring-pulse 3s ease-in-out infinite" }}
              />
              <div
                className="absolute w-20 h-20 rounded-full border border-neon-pink/10"
                style={{ animation: "ring-pulse 3s ease-in-out infinite 0.5s" }}
              />
              <div className="text-5xl relative z-10">💃</div>
            </div>

            <h2
              className="text-2xl font-extrabold text-white/95 mb-1.5 tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              FATE OF OPHELIA
            </h2>
            <p className="text-white/35 text-sm font-light tracking-wide">Taylor Swift</p>

            <div
              className="mt-4 mx-auto h-[1px] w-16"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,45,120,0.5), transparent)",
                backgroundSize: "200% 100%",
                animation: "shimmer 3s linear infinite",
              }}
            />
          </div>
        ) : countdown !== null && countdown > 0 ? (
          <div className="text-center z-10">
            <div
              key={countdown}
              className="text-8xl font-black"
              style={{
                fontFamily: "var(--font-display)",
                color: "#ff2d78",
                textShadow: "0 0 40px rgba(255,45,120,0.4), 0 0 80px rgba(255,45,120,0.15)",
                animation: "countdown-pop 0.5s ease-out",
              }}
            >
              {countdown}
            </div>
            <p className="text-white/40 text-sm mt-4 tracking-wider"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.15em" }}
            >
              GET READY
            </p>
          </div>
        ) : null}
      </div>

      {/* Controls overlay when playing */}
      {playing && (
        <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between">
          {/* Sound toggle */}
          <button
            onClick={toggleMute}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 active:scale-90 transition-transform"
            style={{
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <span className="text-sm">{isMuted ? "🔇" : "🔊"}</span>
          </button>

          {/* Timer */}
          <div
            className="rounded-full px-3 py-1 border border-white/10"
            style={{
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <p className="font-mono text-xs" style={{ color: "#ff2d78" }}>
              {formatTime(elapsed)}
            </p>
          </div>
        </div>
      )}

      {/* Pose model loading indicator */}
      {modelLoading && playing && (
        <div
          className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-full border border-white/10"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <p className="text-xs flex items-center gap-2" style={{ color: "#00d4ff" }}>
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#00d4ff", animation: "dot-pulse 1.5s ease-in-out infinite" }}
            />
            Loading ref model...
          </p>
        </div>
      )}

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-dark to-transparent" />
    </div>
  );
}
