# Moodsic-Sentimentizer v2 — Design Spec

**Date:** 2026-04-02  
**Status:** Approved

---

## 1. Overview

Rebuild Moodsic-Sentimentizer into a gold-standard ML music mood recommender with:

- Upgraded ML pipeline (better embeddings, real Spotify song pool)
- Psychedelic Three.js frontend — Cosmic/Deep Space + Acid/Rave aesthetic
- Mood-reactive central blob scene with glitch effects
- Immersive result cards with inline 30s audio preview
- Full Docker Compose deployment

---

## 2. Repository Structure

```
Moodsic-Sentimentizer/
├── backend/
│   ├── main.py              # FastAPI entrypoint, CORS, /recommend endpoint
│   ├── recommender.py       # ML core: model loading, embedding, cosine similarity
│   ├── spotify.py           # Spotify API client: auth token, search, metadata fetch
│   ├── requirements.txt     # Fully-pinned Python deps
│   └── Dockerfile           # Python 3.13-slim image
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Root component: query input overlay, state management
│   │   ├── Scene.jsx        # Three.js/R3F canvas: star field, blob, satellite orbs
│   │   ├── ResultCard.jsx   # Immersive result card: album art, preview player, score
│   │   └── styles.css       # Global CSS variables, neon palette, glassmorphism
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile           # Node build + nginx serve
├── docker-compose.yml       # Wires backend + frontend, injects env vars
├── .env.example             # SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-02-moodsic-v2-design.md
```

**Migration:** Existing `main.py`, `recommender.py`, `web/` are refactored in-place then reorganized into `backend/` and `frontend/`.

---

## 3. ML Layer

### 3.1 Model

Replace `all-MiniLM-L6-v2` with `all-mpnet-base-v2` (sentence-transformers).

- Same dependency, no new packages
- Significantly better semantic quality for mood/emotion text matching
- 420MB vs 90MB — acceptable for a production ML service
- Still CPU-friendly; works on MPS (Apple Silicon) automatically

### 3.2 Song Pool

Dynamic Spotify-sourced pool instead of static `DEFAULT_SONGS`:

1. User submits mood query (e.g. `"late summer evening, nostalgic"`)
2. Backend always fetches `limit=50` tracks from `GET /v1/search?q={query}&type=track&limit=50`
3. Each track's embed string = `"{track_name} {artist_name} {album_name}"`
4. All 50 embeddings computed, ranked by cosine similarity to query embedding
5. Top `top_k` results returned with full metadata

**Rationale for embedding approach:** `all-mpnet-base-v2` is trained on diverse text and generalizes well across both conversational mood descriptions and music metadata strings. The semantic proximity between e.g. "nostalgic sunset vibes" and "Norah Jones Come Away With Me Blue Note" is meaningful in this embedding space. Implementers should not deviate toward audio-feature-based similarity — that is out of scope.

**Fallback:** If Spotify credentials absent or API fails, fall back to `DEFAULT_SONGS` (existing behavior).

### 3.3 Caching

- `@lru_cache(maxsize=1)` on model load (unchanged)
- Per-query Spotify results: cache keyed by `query` (Spotify always fetches 50; `top_k` is applied after ranking) with 5-minute TTL using a dict + timestamp
- Spotify access token: cached until expiry (token response includes `expires_in`)

### 3.4 API Contract

```
POST /recommend
Query params (not request body — intentional, matches existing contract):
  query: str       — mood description
  top_k: int = 5   — number of results to return (Spotify always fetches 50 internally)

Response: JSON array
[
  {
    "title": "Track Name",
    "artist": "Artist Name",
    "album": "Album Name",
    "album_art_url": "https://...",   # 300x300 Spotify image
    "preview_url": "https://...",     # 30s MP3, nullable
    "spotify_url": "https://...",
    "score": 0.847                    # float cosine similarity
  }
]
```

---

## 4. Frontend

### 4.1 Tech Stack

Current: React 18, Vite, Tailwind, axios  
Added:
- `three` — WebGL renderer
- `@react-three/fiber` — React renderer for Three.js
- `@react-three/drei` — helpers (Stars, shaders, post-processing)
- `@react-three/postprocessing` — chromatic aberration, glitch, bloom
- `gsap` — glitch animation timeline

Tailwind retained for utility classes on non-3D UI elements.

### 4.2 Scene.jsx — Three.js Canvas

Full-screen fixed WebGL background, always rendering.

**Idle / ambient state:**
- 10,000-particle star field slowly drifting (Drei `<Stars>`)
- Neon nebula: two large, low-opacity `MeshStandardMaterial` spheres with emissive purple/cyan, heavily blurred
- Central **MoodBlob**: `IcosahedronGeometry` (detail=6) with custom vertex shader displacing vertices using Perlin noise. Uniforms: `uTime`, `uSpeed`, `uIntensity`, `uColor1`, `uColor2`. Default: purple → cyan, slow pulse.

**Mood mapping (applied after query returns):**
| Mood type | Blob speed | Color pair | Noise intensity |
|-----------|-----------|------------|-----------------|
| Happy / upbeat | Fast | Gold → Orange | High |
| Sad / melancholy | Slow | Deep blue → Indigo | Low |
| Energetic / hype | Very fast | Neon green → Hot pink | Very high |
| Calm / chill | Very slow | Teal → Soft purple | Low |
| Default / unknown | Medium | Purple → Cyan | Medium |

Mood classification: simple keyword matching on the query string (client-side), no extra API call. Reference keyword sets per bucket:

| Mood bucket | Example keywords |
|-------------|-----------------|
| Happy / upbeat | happy, joy, sunshine, bright, summer, upbeat, fun, dance, party |
| Sad / melancholy | sad, cry, lonely, melancholy, miss, heartbreak, loss, dark, rainy |
| Energetic / hype | energy, hype, pump, workout, fast, rage, intense, run, power |
| Calm / chill | chill, calm, relax, peaceful, sleep, ambient, soft, gentle, slow |

If no keywords match → default (purple/cyan, medium speed).

**On submit animation (GSAP timeline):**
1. Chromatic aberration post-processing ramps up (0 → 5, 200ms)
2. Scanline flash overlay fades in/out (100ms)
3. Blob scale punches up 1.4x then snaps to 1.0 (300ms spring)
4. Aberration fades back to 0.5 ambient level
5. Blob color lerps to mood-matched palette (800ms)
6. Satellite orbs spawn (staggered, 100ms apart)

**Result satellite orbs:**
- Each track = `SphereGeometry` with `MeshStandardMaterial` emissive color
- Orbit radius proportional to result rank (closest = best match)
- Orb scale proportional to similarity score
- Hover: orb glows brighter, shows track title + artist tooltip (intentionally minimal — full metadata is in the ResultCard)
- Click: opens `ResultCard` for that track

### 4.3 ResultCard.jsx

Glassmorphism panel, slides up from bottom on track selection. Dismisses on click outside or escape.

Layout:
```
┌─────────────────────────────────────┐
│  [blurred album art background]     │
│  ┌─────────────────────────────┐    │
│  │ [album art 80x80]           │    │
│  │ Track Title                 │    │
│  │ Artist · Album              │    │
│  │ ████████░░░░ 84% match      │    │  ← neon score bar
│  │                             │    │
│  │  ▶  ████ ▄▄█▄▄▄█ ▄▄█▄      │    │  ← waveform visualizer
│  │     00:12 / 00:30           │    │
│  │                             │    │
│  │  [Open in Spotify ↗]        │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

Audio preview player:
- Uses `Web Audio API` (`AudioContext`, `AnalyserNode`) to drive a real-time waveform bar visualizer
- Play/pause toggle; auto-pauses when another card opens
- Graceful degradation: if `preview_url` is null, shows "No preview available" and only Spotify link

### 4.4 App.jsx

Minimal overlay on top of Three.js canvas:

```
[full-screen Three.js scene]
         ↑ z-index 0

[overlay — z-index 10]
  ┌────────────────────────────────┐
  │        MOODSIC                 │  ← glowing wordmark, top center
  │                                │
  │                                │
  │   ┌──────────────────────┐     │
  │   │ describe your mood...│ [→] │  ← centered input + submit
  │   └──────────────────────┘     │
  │                                │
  └────────────────────────────────┘
```

State managed in `App.jsx`:
- `query: string`
- `loading: boolean`
- `results: Track[]`
- `selectedTrack: Track | null`
- `error: string | null`

Results passed down to `Scene.jsx` as props to spawn satellite orbs.  
`selectedTrack` passed to `ResultCard.jsx`.

### 4.5 CSS / Design Tokens

Raw CSS with custom properties (no Tailwind for visual-heavy elements):

```css
:root {
  --color-bg: #000008;
  --color-blob-1: #7b2fff;
  --color-blob-2: #00ffcc;
  --color-neon-pink: #ff0080;
  --color-neon-green: #00ff88;
  --color-neon-yellow: #ffff00;
  --color-text: rgba(255, 255, 255, 0.92);
  --color-glass-bg: rgba(10, 0, 30, 0.55);
  --color-glass-border: rgba(123, 47, 255, 0.35);
  --blur-glass: blur(20px);
  --font-main: 'Space Grotesk', system-ui, sans-serif;
}
```

Google Font: `Space Grotesk` (futuristic, clean, fits the aesthetic).

---

## 5. Docker

### 5.1 backend/Dockerfile

```
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 5.2 frontend/Dockerfile

Multi-stage:
1. `node:20-alpine` build stage: `npm ci && npm run build`
2. `nginx:alpine` serve stage: copy `dist/` → nginx html root

### 5.3 docker-compose.yml

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env

  frontend:
    build: ./frontend
    ports: ["5173:80"]
    depends_on: [backend]
```

### 5.4 .env.example

```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

---

## 6. Error Handling

- Spotify API down → fall back to `DEFAULT_SONGS`, surface warning in UI ("Using offline song pool")
- `preview_url` null (common for some markets) → hide player, show Spotify link only
- Model load failure → 500 with clear message
- Network error in frontend → error state below input, Three.js scene continues running

---

## 7. What Is NOT In Scope

- User accounts / history
- Playlist creation
- Mobile-specific layout (desktop-first)
- TypeScript migration
- Redis / persistent caching
- Automated tests (deferred)
