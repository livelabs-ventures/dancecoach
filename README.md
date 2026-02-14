# DanceCoach 🕺

**Real-time dance choreography learning app — learn moves by matching your body to a reference video with AI-powered pose comparison.**

🔗 **Live:** [dancecoach.vercel.app](https://dancecoach.vercel.app)

---

## What It Does

DanceCoach uses your phone's camera and AI pose detection to help you learn dance choreography in real-time. It runs entirely in the browser — no app install needed.

1. **Split-screen view** — Reference choreography video on top, your camera feed on the bottom
2. **Real-time pose detection** — MediaPipe BlazePose tracks 33 body landmarks at 60fps on both feeds simultaneously
3. **Live comparison** — Compares joint angles between you and the reference dancer, not absolute positions (works regardless of body size or distance from camera)
4. **Color-coded feedback** — Your skeleton turns green (matching), yellow (close), or red (off) per body region
5. **Match score** — Live percentage showing how closely you're matching the choreography

## How Comparison Works

The app compares **joint angles** rather than raw positions. This means it doesn't matter if you're a different size or distance from the camera than the reference dancer.

**9 angles compared per frame:**
- Left/right elbow (shoulder→elbow→wrist)
- Left/right shoulder (elbow→shoulder→hip)
- Left/right knee (hip→knee→ankle)
- Left/right hip (shoulder→hip→knee)
- Torso lean (midpoint shoulders → midpoint hips vs vertical)

**Scoring:**
- < 15° difference → perfect match (green)
- 15-30° → close (yellow)
- 30-60° → off (red)
- \> 60° → way off

**Smoothing:**
- Landmark positions are interpolated between frames (lerp α=0.35) to reduce skeleton jitter
- Scores use exponential moving average (α=0.12, ~8 frame window) for smooth color transitions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Build** | Vite 6 |
| **Pose Detection** | MediaPipe BlazePose Lite (GPU delegate, WASM) |
| **Hosting** | Vercel (auto-deploys from main) |

## Project Structure

```
dancecoach/
├── index.html
├── public/
│   └── reference.mp4              # Reference choreography video (H.264)
└── src/
    ├── App.tsx                     # Main layout, score display, session control
    ├── index.css                   # Tailwind v4 theme, custom animations
    ├── components/
    │   ├── CameraFeed.tsx          # Camera + pose detection + comparison loop
    │   └── ReferenceVideo.tsx      # Reference video + pose detection + skeleton overlay
    ├── hooks/
    │   └── usePoseDetector.ts      # MediaPipe PoseLandmarker initialization
    └── utils/
        ├── PoseComparison.ts       # Joint angle calculation + scoring
        ├── SkeletonRenderer.ts     # Skeleton drawing with glow, trails, color-coding
        ├── ScoreSmoother.ts        # EMA smoother for comparison scores
        └── LandmarkSmoother.ts     # Lerp smoother for landmark positions
```

## Design

**Aesthetic:** "Neon Club meets Editorial Dance Magazine"

- Dark base (#0a0a0a) with hot magenta (#ff2d78) primary accent
- Electric cyan (#00d4ff) for reference skeleton, comparison colors for user skeleton
- Gold (#ffd700) highlights
- **Syne** display font, **DM Sans** body font
- Glassmorphism UI elements, glow effects, noise texture overlay
- CSS animations: pulse-glow, shimmer, ring-pulse, countdown-pop

## Running Locally

```bash
git clone https://github.com/livelabs-ventures/dancecoach.git
cd dancecoach
npm install
npm run dev
```

Open on your phone (same network) using the Network URL shown in terminal. HTTPS is required for camera access on mobile — use a tunnel like `cloudflared` for testing:

```bash
cloudflared tunnel --url http://localhost:5173
```

## Changing the Reference Video

Replace `public/reference.mp4` with any choreography video. Requirements:
- **H.264 codec** (VP9 doesn't work on iOS Safari)
- Portrait orientation (1080x1920) works best for mobile split-screen
- Re-encode if needed: `ffmpeg -i input.mp4 -c:v libx264 -c:a aac -movflags +faststart reference.mp4`

## Roadmap

- [ ] Beat-synced timing comparison (audio beat detection)
- [ ] Move-by-move scoring and replay
- [ ] Slow-mo loop for tricky sections
- [ ] Content library — multiple songs/choreos
- [ ] Multimodal AI coaching ("your left arm should be higher")
- [ ] Social features — share progress, side-by-side comparisons
- [ ] Difficulty progression and skill tracking

## Built With

Built in a single afternoon session (Feb 14, 2026) by [Armand du Plessis](https://github.com/armanddp) and [Badgeroo](https://github.com/openclaw/openclaw) 🦡

---

**LiveLabs Ventures** — Building at the intersection of real-time video and multimodal AI.
