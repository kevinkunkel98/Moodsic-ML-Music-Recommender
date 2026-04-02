# Moodsic-Sentimentizer v2 — Agent Guidelines

## Project Overview

Full-stack ML music mood recommender. Python 3.13 FastAPI backend with `all-mpnet-base-v2`
sentence-transformer embeddings + Spotify API integration. React 18 + Vite + Three.js frontend
with a psychedelic deep-space aesthetic (morphing MoodBlob, satellite orbs, glassmorphism cards,
Web Audio API waveform previews). Two-service Docker Compose deployment.

```
Moodsic-Sentimentizer/
├── backend/
│   ├── main.py           # FastAPI app, CORS, POST /recommend endpoint
│   ├── recommender.py    # ML core: all-mpnet-base-v2 embeddings, cosine similarity, TTL cache
│   ├── spotify.py        # Spotify OAuth client credentials + track search
│   ├── requirements.txt  # Fully-pinned Python deps
│   └── Dockerfile        # python:3.13-slim + uvicorn
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Root component: state, query form, scene wiring
│   │   ├── Scene.jsx         # Three.js Canvas: stars, blob, orbs, post-processing
│   │   ├── MoodBlob.jsx      # Perlin-noise vertex shader blob (forwardRef + punch())
│   │   ├── SatelliteOrbs.jsx # Orbiting result spheres with hover tooltip + click
│   │   ├── ResultCard.jsx    # Glassmorphism card: album art, score bar, AudioPlayer
│   │   ├── AudioPlayer.jsx   # Web Audio API waveform visualizer + play/pause
│   │   ├── moodClassifier.js # Keyword → mood config pure function
│   │   └── styles.css        # CSS custom properties, global reset, .glass, .neon-text
│   ├── index.html        # Space Grotesk font, root div
│   ├── package.json      # React 18, Three.js, @react-three/*, gsap, axios
│   ├── vite.config.js    # Vite (port 5173)
│   ├── nginx.conf        # SPA fallback + asset cache headers
│   └── Dockerfile        # Multi-stage: node:20-alpine build → nginx:alpine serve
├── docker-compose.yml    # backend + frontend services
├── .env.example          # SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
└── docs/superpowers/
    ├── specs/2026-04-02-moodsic-v2-design.md
    └── plans/2026-04-02-moodsic-v2.md
```

---

## Build & Run Commands

### Python Backend

```bash
# Install dependencies (use the .venv at repo root)
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Start the API server (dev)
cd backend && uvicorn main:app --reload --port 8000

# Run recommender standalone (smoke test — falls back to DEFAULT_SONGS without Spotify creds)
cd backend && source ../.venv/bin/activate && python recommender.py
```

### Frontend

```bash
cd frontend

# Install
npm install --legacy-peer-deps

# Dev server (port 5173)
npm run dev

# Production build (outputs to frontend/dist/)
npm run build

# Preview production build
npm run preview
```

Note: npm scripts call `node node_modules/vite/bin/vite.js` directly (workaround for npm ESM
bin stub issue on Node v25+).

### Docker (full stack)

```bash
# Copy and fill in Spotify credentials
cp .env.example .env
# Edit .env with real SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET

# Build and start both services
docker compose up --build

# Open http://localhost:5173
```

If Spotify credentials are not set, the backend falls back to `DEFAULT_SONGS` (3 placeholder
tracks). The UI still renders fully — satellite orbs appear, click shows ResultCard without
album art or audio preview.

---

## Testing

**No automated test suite is currently configured.**

### Manual smoke tests

```bash
# Backend endpoint test (with server running)
curl -s -X POST "http://127.0.0.1:8000/recommend?query=rainy+night&top_k=3" | python -m json.tool

# Recommender module (no server needed)
cd backend && source ../.venv/bin/activate && python recommender.py

# Frontend build verification (catches import/syntax errors)
cd frontend && npm run build
```

### Adding automated tests (recommended path)

Use **pytest** for Python and **Vitest** for the frontend.

```bash
# Python
pip install pytest pytest-asyncio httpx
pytest                        # run all tests
pytest tests/test_main.py -v  # single file

# Frontend
npm install -D vitest @testing-library/react
npx vitest run
```

---

## Python Code Style

### Formatter: Black

All Python files must be Black-compatible. Run before committing:

```bash
black .
```

Black defaults: 88-character line length, double quotes, trailing commas in multi-line structures.

### Imports

Follow stdlib → third-party → local order, one blank line between groups:

```python
# stdlib
import time
from os import getenv

# third-party
import requests
from sentence_transformers import SentenceTransformer

# local
from recommender import recommend
```

### Naming Conventions

| Construct | Convention | Example |
|-----------|-----------|---------|
| Functions / variables | `snake_case` | `get_model`, `search_tracks` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_SONGS`, `CACHE_TTL` |
| Private helpers / module-level cache | `_snake_case` prefix | `_token_cache`, `_query_cache` |
| Classes | `PascalCase` | `RecommenderError` |

### Type Annotations

Prefer annotations for all public interfaces. Python 3.13 union syntax (`str | None`) is valid.

### Error Handling

- Use `response.raise_for_status()` after every `requests` call.
- `search_tracks` catches `requests.RequestException` and returns `[]` (graceful).
- Provide graceful fallbacks for missing env vars (`DEFAULT_SONGS` when Spotify creds absent).
- Do not swallow exceptions silently.

### Caching Patterns

- `@lru_cache(maxsize=1)` for expensive singleton init (e.g., `get_model()`).
- Plain dict with TTL for per-query result cache (`_query_cache`, `CACHE_TTL = 300`).
- Plain dict for Spotify token cache (`_token_cache` in `spotify.py`).

### Secrets / Environment Variables

Read all secrets from env via `os.getenv`. Required:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

---

## JavaScript / React Code Style

### Language

Plain JavaScript (`.js` / `.jsx`) — **no TypeScript**.

### Formatting

2-space indentation, single quotes, no semicolons.

### React Patterns

- Functional components + hooks only.
- `forwardRef` for components that expose imperative handles (e.g., `MoodBlob`).
- `useImperativeHandle` for exposing methods (e.g., `punch()`, `flash()`).
- `async/await` with `try/catch/finally` for all async operations.
- No global state manager — local `useState` throughout.

### Three.js / R3F Patterns

- All R3F hook usage (e.g., `useFrame`) must be inside a `<Canvas>` descendant.
- Uniforms object built with `useMemo(()=>({...}), [])` (empty dep array) — update values
  inside `useFrame` to avoid re-creating shader materials.
- Post-processing via `@react-three/postprocessing` + `postprocessing` (direct peer dep).

### Naming Conventions

| Construct | Convention | Example |
|-----------|-----------|---------|
| Components | `PascalCase` | `MoodBlob`, `ResultCard` |
| Functions / variables | `camelCase` | `classifyMood`, `flashRef` |
| CSS | Raw CSS custom properties | `var(--color-blob-1)` |

### Styling

Raw CSS with custom properties in `frontend/src/styles.css`. No Tailwind. Inline `style` props
for component-specific styles. `.glass` and `.neon-text` utility classes available globally.

---

## API Contract

| Method | Path | Query Params | Response |
|--------|------|-------------|----------|
| `POST` | `/recommend` | `query: str`, `top_k: int = 5` | `list[TrackDict]` |

**TrackDict fields:**

| Field | Type | Notes |
|-------|------|-------|
| `title` | `str` | Track name |
| `artist` | `str` | Comma-joined artist names |
| `album` | `str` | Album name |
| `album_art_url` | `str \| null` | 300×300 image URL from Spotify |
| `preview_url` | `str \| null` | 30s MP3 preview (may be null even with Spotify) |
| `spotify_url` | `str \| null` | Open-in-Spotify link |
| `score` | `float` | Cosine similarity (0–1 range typically) |

---

## Dependency Management

- Python: **fully-pinned** `requirements.txt`. Update pins deliberately.
- Node: `package.json` uses `^` ranges. Commit `package-lock.json`. Install with
  `--legacy-peer-deps` (required for `postprocessing` peer dep resolution).
- Do not add heavy new ML dependencies without verifying macOS CPU/MPS compatibility.

---

## Environment

- Python 3.13 (runtime); `.venv/` is at repo root.
- Node via npm (no yarn/pnpm). Node v25 / npm 11 on dev machine.
- IDE: PyCharm / JetBrains (`.idea/` committed); Black formatter active.
- Backend: `http://127.0.0.1:8000` (dev) / port 8000 (Docker).
- Frontend dev server: `http://localhost:5173` / port 5173 (Docker maps 5173→80).
