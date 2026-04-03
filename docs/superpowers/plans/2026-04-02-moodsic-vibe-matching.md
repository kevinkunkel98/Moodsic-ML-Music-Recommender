# Moodsic Vibe-Matching Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace semantic title-similarity ranking with genuine vibe-matching by enriching track embeddings with Spotify audio features + Genius lyric snippets, and expand the Spotify candidate pool using mood-keyword query expansion.

**Architecture:** New `backend/enricher.py` handles all track enrichment (audio features via Spotify batch API + lyric snippets via `lyricsgenius`). `backend/recommender.py` gains `expand_query()` for better Spotify search pool construction, `extract_spotify_id()` for ID parsing, and a reworked `recommend()` that calls the enricher in parallel before embedding. The frontend gains a 4-phase loading state machine (`idle -> loading -> revealing -> done`) with a cycling status overlay and a new `ResultsList` Wrapped-style reveal component. `Scene.jsx` multiplies blob speed by a per-phase factor.

**Tech Stack:** Python 3.13, FastAPI, sentence-transformers (`all-mpnet-base-v2`), lyricsgenius 3.0.1, concurrent.futures.ThreadPoolExecutor, React 18, Vite, GSAP, Docker Compose

---

## File Map

### Backend
| File | Role |
|------|------|
| `backend/enricher.py` | **CREATE** — `get_audio_features()`, `get_lyric_snippet()`, `build_embed_string()` |
| `backend/recommender.py` | **MODIFY** — add `expand_query()`, `extract_spotify_id()`, rework `recommend()` |
| `backend/requirements.txt` | **MODIFY** — add `lyricsgenius==3.0.1` |

### Frontend
| File | Role |
|------|------|
| `frontend/src/ResultsList.jsx` | **CREATE** — Wrapped-style ranked list with GSAP reveal sequence |
| `frontend/src/App.jsx` | **MODIFY** — `phase` state machine, loading overlay, render `ResultsList` |
| `frontend/src/Scene.jsx` | **MODIFY** — accept `phase` prop, apply speed multiplier |

### Config
| File | Role |
|------|------|
| `.env.example` | **MODIFY** — add `GENIUS_ACCESS_TOKEN=your_genius_token_here` |
| `docker-compose.yml` | No change needed — `env_file: .env` already passes all keys to the backend container |

---

## Task 1: `backend/requirements.txt` — add lyricsgenius

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add lyricsgenius to requirements.txt**

Append this line to `backend/requirements.txt`:
```
lyricsgenius==3.0.1
```

- [ ] **Step 2: Install into .venv and verify**

```bash
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer
source .venv/bin/activate
pip install lyricsgenius==3.0.1
python -c "import lyricsgenius; print('lyricsgenius OK:', lyricsgenius.__version__)"
```
Expected output: `lyricsgenius OK: 3.0.1`

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add lyricsgenius==3.0.1 to requirements"
```

---

## Task 2: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add GENIUS_ACCESS_TOKEN to .env.example**

Replace the contents of `.env.example` with:
```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
GENIUS_ACCESS_TOKEN=your_genius_token_here
```

- [ ] **Step 2: Verify .env has GENIUS_ACCESS_TOKEN set**

```bash
grep GENIUS_ACCESS_TOKEN /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/.env
```
If the line is absent or empty, the user must add it before lyric tests will work.
Get a free token at https://genius.com/api-clients — create an app, copy the Client Access Token.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add GENIUS_ACCESS_TOKEN to .env.example"
```

---

## Task 3: `backend/enricher.py` — audio features + lyric snippets

**Files:**
- Create: `backend/enricher.py`

This module is completely independent. It imports nothing from `recommender.py` or `main.py`.

- [ ] **Step 1: Create `backend/enricher.py`**

```python
import logging
import os
import re

import requests

logger = logging.getLogger(__name__)

SPOTIFY_AUDIO_FEATURES_URL = "https://api.spotify.com/v1/audio-features"

# Lazy-init genius client (avoids import cost at module load)
_genius_client = None


def _get_genius():
    global _genius_client
    if _genius_client is None:
        import lyricsgenius

        token = os.getenv("GENIUS_ACCESS_TOKEN")
        if not token:
            logger.warning("GENIUS_ACCESS_TOKEN not set — lyric snippets disabled")
            return None
        _genius_client = lyricsgenius.Genius(
            token,
            timeout=5,
            retries=1,
            verbose=False,
            remove_section_headers=True,
        )
    return _genius_client


def get_audio_features(track_ids: list[str], token: str) -> dict[str, dict]:
    """
    Batch-fetch Spotify audio features for up to 100 track IDs.
    Returns {track_id: features_dict}. Missing IDs map to None.
    Any network / API failure returns {}.
    """
    if not track_ids or not token:
        return {}
    valid_ids = [tid for tid in track_ids if tid]
    if not valid_ids:
        return {}
    try:
        response = requests.get(
            SPOTIFY_AUDIO_FEATURES_URL,
            headers={"Authorization": f"Bearer {token}"},
            params={"ids": ",".join(valid_ids)},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Spotify audio-features fetch failed: %s", exc)
        return {}

    features_list = response.json().get("audio_features", [])
    result = {}
    for feat in features_list:
        if feat and feat.get("id"):
            result[feat["id"]] = feat
    return result


def get_lyric_snippet(title: str, artist: str) -> str:
    """
    Fetch first ~200 chars of lyrics from Genius for the given track.
    Returns "" on any failure (rate limit, not found, network error, no token).
    """
    genius = _get_genius()
    if not genius:
        return ""
    try:
        song = genius.search_song(title, artist, get_full_info=False)
        if song and song.lyrics:
            raw = song.lyrics.strip()
            # Remove "SongTitle Lyrics" header line lyricsgenius sometimes prepends
            raw = re.sub(r"^.*?Lyrics\n", "", raw, count=1, flags=re.IGNORECASE)
            return raw[:200].strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Genius lyric fetch failed for '%s' by '%s': %s", title, artist, exc)
    return ""


def build_embed_string(track: dict, features: dict | None, snippet: str) -> str:
    """
    Assemble a rich natural-language embed string from track metadata,
    Spotify audio features, and a Genius lyric snippet.

    Format: "{title} by {artist}. {audio_prose}. Lyrics: {snippet}"
    Minimum (no features, no lyrics): "{title} by {artist}"
    """
    title = track.get("title", "Unknown")
    artist = track.get("artist", "Unknown")
    base = f"{title} by {artist}"

    if not features:
        if snippet:
            return f"{base}. Lyrics: {snippet}"
        return base

    parts = []

    energy = features.get("energy", 0.5)
    if energy > 0.7:
        parts.append("high energy")
    elif energy < 0.3:
        parts.append("low energy")
    else:
        parts.append("moderate energy")

    dance = features.get("danceability", 0.5)
    if dance > 0.7:
        parts.append("very danceable")
    elif dance < 0.3:
        parts.append("not danceable")

    valence = features.get("valence", 0.5)
    if valence > 0.6:
        parts.append(f"upbeat (valence {valence:.2f})")
    elif valence < 0.3:
        parts.append(f"melancholic (valence {valence:.2f})")
    else:
        parts.append("neutral mood")

    tempo = features.get("tempo", 120)
    parts.append(f"{tempo:.0f}bpm")

    acousticness = features.get("acousticness", 0.5)
    if acousticness > 0.6:
        parts.append("mostly acoustic")
    elif acousticness < 0.2:
        parts.append("electric")

    speechiness = features.get("speechiness", 0.0)
    instrumentalness = features.get("instrumentalness", 0.0)
    if speechiness > 0.4:
        parts.append("lyrical/spoken")
    elif instrumentalness > 0.5:
        parts.append("instrumental")

    audio_prose = ", ".join(parts)
    result = f"{base}. {audio_prose}"
    if snippet:
        result += f". Lyrics: {snippet}"
    return result


if __name__ == "__main__":
    # Smoke test — requires SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, GENIUS_ACCESS_TOKEN in env
    import sys

    sys.path.insert(0, ".")
    from spotify import get_access_token, search_tracks

    print("--- Audio features test ---")
    token = get_access_token()
    if token:
        tracks = search_tracks("chill lo-fi acoustic", limit=3)
        ids = [t["spotify_url"].split("/")[-1] for t in tracks if t.get("spotify_url")]
        features_map = get_audio_features(ids, token)
        for tid, feat in features_map.items():
            print(f"  {tid}: energy={feat.get('energy'):.2f}, valence={feat.get('valence'):.2f}")
    else:
        print("  No Spotify token — skipping")

    print("\n--- Lyric snippet test ---")
    snippet = get_lyric_snippet("Bohemian Rhapsody", "Queen")
    print(f"  snippet ({len(snippet)} chars): {snippet[:80]}...")

    print("\n--- build_embed_string test ---")
    fake_track = {"title": "Test Song", "artist": "Test Artist"}
    fake_features = {
        "energy": 0.8, "danceability": 0.75, "valence": 0.9,
        "tempo": 128, "acousticness": 0.1, "speechiness": 0.05,
        "instrumentalness": 0.0,
    }
    print(build_embed_string(fake_track, fake_features, "I feel alive tonight"))
    print(build_embed_string(fake_track, None, ""))
    print(build_embed_string(fake_track, None, "Some lyrics here"))
```

- [ ] **Step 2: Run `enricher.py` standalone smoke test**

```bash
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/backend
source ../.venv/bin/activate
python enricher.py
```
Expected:
- Audio features test: prints energy/valence for 3 tracks (or "No Spotify token" if creds absent)
- Lyric snippet test: prints first ~80 chars of Bohemian Rhapsody lyrics (or empty string if no Genius token)
- build_embed_string test: prints 3 embed strings — full, bare, and lyrics-only variants

- [ ] **Step 3: Commit**

```bash
git add backend/enricher.py
git commit -m "feat: add enricher module — Spotify audio features, Genius lyrics, embed string builder"
```

---

## Task 4: `backend/recommender.py` — query expansion + enriched pipeline

**Files:**
- Modify: `backend/recommender.py`

Replace the entire file. The new version imports from `enricher` and adds `expand_query()`, `extract_spotify_id()`, and updates `recommend()`.

- [ ] **Step 1: Rewrite `backend/recommender.py`**

```python
import re
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from enricher import build_embed_string, get_audio_features, get_lyric_snippet
from spotify import get_access_token, search_tracks

DEFAULT_SONGS = [
    {
        "title": "Song A",
        "artist": "Artist A",
        "album": "Album A",
        "album_art_url": None,
        "preview_url": None,
        "spotify_url": None,
        "desc": "dreamy indie, nostalgic, sunset vibes",
    },
    {
        "title": "Song B",
        "artist": "Artist B",
        "album": "Album B",
        "album_art_url": None,
        "preview_url": None,
        "spotify_url": None,
        "desc": "energetic party, loud, hype",
    },
    {
        "title": "Song C",
        "artist": "Artist C",
        "album": "Album C",
        "album_art_url": None,
        "preview_url": None,
        "spotify_url": None,
        "desc": "melancholic, slow, emotional",
    },
]

# Per-query cache: {query: {"results": [...], "expires_at": float}}
_query_cache: dict = {}
CACHE_TTL = 300  # 5 minutes

# Mood buckets: list of (bucket_name, keywords, spotify_search_terms)
_MOOD_BUCKETS = [
    ("melancholic", ["sad", "cry", "lonely", "heartbreak", "lost", "numb", "dark", "empty"], "sad indie slow"),
    ("energetic",   ["hype", "gym", "workout", "pump", "energy", "rage", "fire"],             "energetic high tempo"),
    ("romantic",    ["love", "crush", "date", "tender", "warm", "soft"],                       "romantic pop slow"),
    ("dreamy",      ["dream", "float", "clouds", "hazy", "nostalgic", "golden"],               "dreamy ambient indie"),
    ("euphoric",    ["party", "dance", "rave", "club", "festival", "happy"],                   "dance electronic upbeat"),
    ("dark",        ["night", "insomnia", "overthink", "anxiety", "alone", "3am"],             "dark alternative lo-fi"),
    ("chill",       ["chill", "relax", "afternoon", "coffee", "sunday", "calm"],               "chill lo-fi acoustic"),
    ("aggressive",  ["angry", "aggressive", "metal", "scream", "intense"],                     "metal hard rock aggressive"),
]


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    return SentenceTransformer("all-mpnet-base-v2")


def expand_query(query: str) -> str:
    """
    Map a natural language vibe description to Spotify-searchable genre/mood terms.
    Scans query against 8 mood buckets; returns deduplicated search terms joined by space.
    Returns raw query unchanged if no buckets match.
    """
    lower = query.lower()
    matched_terms: list[str] = []
    seen: set[str] = set()
    for _bucket, keywords, search_terms in _MOOD_BUCKETS:
        if any(kw in lower for kw in keywords):
            for term in search_terms.split():
                if term not in seen:
                    seen.add(term)
                    matched_terms.append(term)
    if not matched_terms:
        return query
    return " ".join(matched_terms)


def extract_spotify_id(track: dict) -> str | None:
    """
    Parse the Spotify track ID from the spotify_url field.
    e.g. "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh" -> "4iV5W9uYEdYUVa79Axb7Rh"
    Returns None if the URL is absent or unparseable.
    """
    url = track.get("spotify_url")
    if not url:
        return None
    match = re.search(r"/track/([A-Za-z0-9]+)", url)
    return match.group(1) if match else None


def recommend(query: str, top_k: int = 5) -> list[dict]:
    """
    Returns top_k track dicts ranked by cosine similarity to `query`.
    Each dict: title, artist, album, album_art_url, preview_url, spotify_url, score.
    Falls back to DEFAULT_SONGS if Spotify unavailable.

    Pipeline:
    1. expand_query -> better Spotify search terms
    2. search_tracks (50 candidates)
    3. batch-fetch audio features (1 API call)
    4. parallel lyric fetch (ThreadPoolExecutor, max 10 workers)
    5. build rich embed strings
    6. encode query + embed strings -> cosine similarity -> rank
    """
    now = time.time()
    cached = _query_cache.get(query)
    if cached and cached["expires_at"] > now:
        all_results = cached["results"]
    else:
        expanded = expand_query(query)
        songs = search_tracks(expanded, limit=50) or DEFAULT_SONGS

        token = get_access_token()
        track_ids = [extract_spotify_id(s) for s in songs]
        features_map = get_audio_features(track_ids, token) if token else {}

        with ThreadPoolExecutor(max_workers=10) as ex:
            snippets = list(
                ex.map(lambda s: get_lyric_snippet(s["title"], s["artist"]), songs)
            )

        embed_strings = [
            build_embed_string(s, features_map.get(extract_spotify_id(s)), snip)
            for s, snip in zip(songs, snippets)
        ]

        model = get_model()
        query_embedding = model.encode(query)  # embed original query, not expanded
        song_embeddings = model.encode(embed_strings)
        scores = cosine_similarity([query_embedding], song_embeddings)[0]

        ranked = sorted(
            zip(songs, scores),
            key=lambda x: x[1],
            reverse=True,
        )
        all_results = [{**song, "score": float(score)} for song, score in ranked]
        _query_cache[query] = {"results": all_results, "expires_at": now + CACHE_TTL}

    return all_results[:top_k]


if __name__ == "__main__":
    queries = ["overthinking at 3am", "late summer evening, nostalgic", "gym pump rage"]
    for q in queries:
        expanded = expand_query(q)
        print(f"\nQuery:    {q}")
        print(f"Expanded: {expanded}")
        for r in recommend(q, top_k=3):
            print(f"  {r['title']} by {r['artist']} ({r['score']:.3f})")
```

- [ ] **Step 2: Run recommender standalone smoke test**

```bash
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/backend
source ../.venv/bin/activate
python recommender.py
```
Expected:
- For each query: prints expanded query string, then 3 results with scores
- "overthinking at 3am" expands to "dark alternative lo-fi" terms
- "gym pump rage" expands to "energetic high tempo metal hard rock aggressive" terms
- No Python exceptions

- [ ] **Step 3: Run full API endpoint smoke test**

```bash
# Terminal 1
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/backend
source ../.venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2
curl -s -X POST "http://127.0.0.1:8000/recommend?query=overthinking+at+3am&top_k=3" | python -m json.tool
```
Expected: JSON array of 3 tracks with `title`, `artist`, `score`. Tracks should be mood-aligned (dark/introspective), NOT tracks literally named "overthinking at 3am".

- [ ] **Step 4: Commit**

```bash
git add backend/recommender.py
git commit -m "feat: add query expansion and enriched embed pipeline to recommender"
```

---

## Task 5: `frontend/src/Scene.jsx` — accept `phase` prop

**Files:**
- Modify: `frontend/src/Scene.jsx`

Minimal change: accept `phase` prop and multiply `moodConfig.speed` by a per-phase factor before passing to `MoodBlob`.

Phase speed multipliers: `idle` = 1x, `loading` = 3x, `revealing` = 5x, `done` = 1x

- [ ] **Step 1: Modify `frontend/src/Scene.jsx`**

Add the multiplier constant above `SceneInner`, add `phase` to its props, compute `speedMultiplier`, and apply it:

```diff
+const PHASE_SPEED_MULTIPLIER = { idle: 1, loading: 3, revealing: 5, done: 1 }
+
-function SceneInner({ moodConfig, results, onSelectTrack, aberrationRef }) {
+function SceneInner({ moodConfig, results, onSelectTrack, aberrationRef, phase }) {
+  const speedMultiplier = PHASE_SPEED_MULTIPLIER[phase] ?? 1
   // ... existing body ...
```

Replace the `<MoodBlob ... />` usage:
```diff
       <MoodBlob
-        speed={moodConfig.speed}
+        speed={moodConfig.speed * speedMultiplier}
         intensity={moodConfig.intensity}
```

Update the outer `Scene` component signature and `SceneInnerWithRef` render call:
```diff
-export default function Scene({ moodConfig, results, onSelectTrack, onFlashRef }) {
+export default function Scene({ moodConfig, results, onSelectTrack, onFlashRef, phase }) {
```

```diff
       <SceneInnerWithRef
         ref={aberrationRef}
         moodConfig={moodConfig}
         results={results}
         onSelectTrack={onSelectTrack}
+        phase={phase}
       />
```

(`SceneInnerWithRef` already spreads all props via `{...props}`, so no change needed there.)

- [ ] **Step 2: Build check**

```bash
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/frontend
npm run build 2>&1 | grep -i error
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/Scene.jsx
git commit -m "feat: Scene accepts phase prop, applies speed multiplier to MoodBlob"
```

---

## Task 6: `frontend/src/ResultsList.jsx` — Wrapped-style reveal

**Files:**
- Create: `frontend/src/ResultsList.jsx`

Receives `tracks` (array), `visible` (bool), `onSelect` (callback), and `flashScene` (callback that calls the Scene's aberration flash). When `visible` flips true, fires the full 5-step reveal sequence specified:

1. Three rapid full-screen color pulses (chromatic aberration × 3 via `flashScene` + CSS color flash, 150ms each)
2. `#1` card slides up centered on screen, large (album art blur bg, "BEST MATCH" badge, title, artist, score bar). Holds 1.5s.
3. `#2` and `#3` slide in staggered at 80% size, 0.3s apart
4. `#4` and `#5` fade in at 60% opacity, 0.2s apart
5. All cards animate into the persistent left-side panel layout

Each list item shows: rank number, album art thumbnail, title, artist, similarity score bar. Click fires `onSelect(track)`.

- [ ] **Step 1: Create `frontend/src/ResultsList.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

const ORB_COLORS = ['#ff0080', '#00ffcc', '#7b2fff', '#ffd700', '#00ff88']

function ScoreBar({ score }) {
  const pct = Math.round(score * 100)
  return (
    <div style={{ marginTop: '4px' }}>
      <div style={{
        height: '3px',
        borderRadius: '2px',
        background: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        width: '100%',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(to right, var(--color-blob-1), var(--color-neon-cyan))',
          boxShadow: '0 0 6px var(--color-neon-cyan)',
          borderRadius: '2px',
        }} />
      </div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
        {pct}% match
      </div>
    </div>
  )
}

function TrackRow({ track, rank, onSelect, isBig }) {
  const isBest = rank === 1
  const accentColor = ORB_COLORS[(rank - 1) % ORB_COLORS.length]
  const size = isBig ? 'big' : (rank <= 3 ? 'mid' : 'small')
  const artSize = size === 'big' ? 72 : size === 'mid' ? 52 : 40
  const fontSize = size === 'big' ? '16px' : size === 'mid' ? '14px' : '13px'
  const padding = size === 'big' ? '18px 20px' : size === 'mid' ? '14px 16px' : '10px 14px'

  return (
    <div
      onClick={() => onSelect(track)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding,
        borderRadius: '16px',
        background: isBest ? 'rgba(123,47,255,0.18)' : 'rgba(10,0,30,0.45)',
        border: `1px solid ${isBest ? 'rgba(123,47,255,0.5)' : 'rgba(123,47,255,0.2)'}`,
        backdropFilter: 'blur(16px)',
        cursor: 'pointer',
        marginBottom: '8px',
        opacity: rank >= 4 ? 0.6 : 1,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = isBest ? 'rgba(123,47,255,0.28)' : 'rgba(123,47,255,0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = isBest ? 'rgba(123,47,255,0.18)' : 'rgba(10,0,30,0.45)'
      }}
    >
      <div style={{
        minWidth: size === 'big' ? '36px' : size === 'mid' ? '32px' : '24px',
        height: size === 'big' ? '36px' : size === 'mid' ? '32px' : '24px',
        borderRadius: '50%',
        background: accentColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size === 'big' ? '16px' : size === 'mid' ? '14px' : '11px',
        fontWeight: 700,
        color: '#000',
        flexShrink: 0,
        boxShadow: `0 0 12px ${accentColor}`,
      }}>
        {rank}
      </div>

      {track.album_art_url ? (
        <img
          src={track.album_art_url}
          alt={track.album}
          style={{
            width: `${artSize}px`,
            height: `${artSize}px`,
            borderRadius: '10px',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div style={{
          width: `${artSize}px`,
          height: `${artSize}px`,
          borderRadius: '10px',
          background: 'rgba(123,47,255,0.3)',
          flexShrink: 0,
        }} />
      )}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {isBest && (
          <div style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: accentColor,
            textTransform: 'uppercase',
            marginBottom: '2px',
          }}>
            Best Match
          </div>
        )}
        <div style={{
          fontWeight: isBest ? 600 : 500,
          fontSize,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {track.title}
        </div>
        <div style={{
          color: 'var(--color-text-dim)',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {track.artist}
        </div>
        <ScoreBar score={track.score} />
      </div>
    </div>
  )
}

// Full-screen color flash overlay for pulse step
function ColorFlash({ flashRef }) {
  return (
    <div
      ref={flashRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 25,
        background: 'var(--color-blob-1)',
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

export default function ResultsList({ tracks = [], visible, onSelect, flashScene }) {
  const containerRef = useRef(null)
  const rowRefs = useRef([])
  const flashOverlayRef = useRef(null)
  const [phase, setPhase] = useState('hidden') // 'hidden' | 'pulsing' | 'hero' | 'panel'

  // Reset when hidden
  useEffect(() => {
    if (!visible) setPhase('hidden')
  }, [visible])

  useEffect(() => {
    if (!visible || !tracks.length) return

    setPhase('pulsing')

    // Step 1: Three rapid color pulses (150ms each) + aberration flashes
    const pulseTimeline = gsap.timeline({
      onComplete: () => setPhase('hero'),
    })

    for (let i = 0; i < 3; i++) {
      pulseTimeline
        .to(flashOverlayRef.current, { opacity: 0.4, duration: 0.07, ease: 'power2.in' }, i * 0.15)
        .to(flashOverlayRef.current, { opacity: 0, duration: 0.08, ease: 'power2.out' }, i * 0.15 + 0.07)
        .call(() => flashScene?.(), [], i * 0.15)
    }
  }, [visible, tracks])

  useEffect(() => {
    if (phase !== 'hero' || !tracks.length || !containerRef.current) return

    // Step 2: #1 card slides in centered, large, holds 1.5s
    const heroEl = rowRefs.current[0]
    if (!heroEl) return

    gsap.fromTo(
      heroEl,
      { y: 60, opacity: 0, scale: 1 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(1.2)',
        onComplete: () => {
          // After 1.5s hold, reveal #2 and #3
          gsap.delayedCall(1.5, () => {
            // Step 3: #2 and #3 at 80% size, 0.3s apart
            ;[1, 2].forEach((idx, i) => {
              const el = rowRefs.current[idx]
              if (!el) return
              gsap.fromTo(
                el,
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.4, delay: i * 0.3, ease: 'back.out(1.4)' }
              )
            })

            // Step 4: #4 and #5 fade in at 60% opacity, 0.2s apart
            ;[3, 4].forEach((idx, i) => {
              const el = rowRefs.current[idx]
              if (!el) return
              gsap.fromTo(
                el,
                { opacity: 0 },
                { opacity: 0.6, duration: 0.35, delay: 0.6 + i * 0.2, ease: 'power2.out' }
              )
            })

            // Step 5: After all cards are in (~1s), slide panel in from left and settle
            gsap.delayedCall(1.2, () => setPhase('panel'))
          })
        },
      }
    )
  }, [phase, tracks])

  useEffect(() => {
    if (phase !== 'panel' || !containerRef.current) return

    // Slide the whole panel into its final left-side position
    gsap.fromTo(
      containerRef.current,
      { x: 0 },
      { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }
    )
    // Ensure the container itself is visible
    gsap.set(containerRef.current, { opacity: 1 })
  }, [phase])

  if (!visible || !tracks.length) return null

  // During 'hero' phase, #1 card is centered on screen; others are in the panel
  const isHeroPhase = phase === 'pulsing' || phase === 'hero'

  return (
    <>
      <ColorFlash flashRef={flashOverlayRef} />

      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: '50%',
          left: '1.5rem',
          transform: 'translateY(-50%)',
          zIndex: 15,
          width: 'min(340px, 90vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '16px',
          opacity: phase === 'panel' ? 1 : 0,
        }}
      >
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          marginBottom: '12px',
        }}>
          Top Vibes
        </div>
        {tracks.map((track, i) => (
          <div
            key={track.spotify_url || i}
            ref={el => (rowRefs.current[i] = el)}
            style={{
              opacity: 0,
              // During hero phase, #1 is positioned absolutely center-screen
              ...(isHeroPhase && i === 0 ? {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(400px, 85vw)',
                zIndex: 20,
              } : {}),
            }}
          >
            <TrackRow
              track={track}
              rank={i + 1}
              onSelect={onSelect}
              isBig={isHeroPhase && i === 0}
            />
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/frontend
npm run build 2>&1 | grep -i error
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/ResultsList.jsx
git commit -m "feat: add ResultsList with GSAP Wrapped-style staggered reveal"
```

---

## Task 7: `frontend/src/App.jsx` — phase state machine + loading overlay

**Files:**
- Modify: `frontend/src/App.jsx`

Replace `loading: bool` with `phase: 'idle' | 'loading' | 'revealing' | 'done'`. Add full-screen loading overlay with GSAP-cycling status text. Wire `ResultsList` and pass `phase` to `Scene`.

- [ ] **Step 1: Rewrite `frontend/src/App.jsx`**

```jsx
import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'
import { gsap } from 'gsap'
import Scene from './Scene'
import ResultCard from './ResultCard'
import ResultsList from './ResultsList'
import { classifyMood } from './moodClassifier'

const DEFAULT_MOOD = { speed: 1.0, intensity: 1.0, color1: '#7b2fff', color2: '#00ffcc', mood: 'default' }
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const STATUS_MESSAGES = [
  'scanning your vibe...',
  'fetching tracks...',
  'analysing audio features...',
  'reading lyrics...',
  'ranking by feel...',
]

export default function App() {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('idle') // 'idle' | 'loading' | 'revealing' | 'done'
  const [results, setResults] = useState([])
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [moodConfig, setMoodConfig] = useState(DEFAULT_MOOD)
  const [error, setError] = useState(null)
  const flashRef = useRef(null)
  const statusRef = useRef(null)
  const statusTweenRef = useRef(null)
  const statusIndexRef = useRef(0)

  // Cycle status messages during loading phase
  useEffect(() => {
    if (phase !== 'loading') {
      statusTweenRef.current?.kill()
      return
    }
    if (!statusRef.current) return

    statusIndexRef.current = 0
    statusRef.current.textContent = STATUS_MESSAGES[0]
    gsap.set(statusRef.current, { opacity: 1 })

    const cycle = () => {
      if (!statusRef.current) return
      gsap.to(statusRef.current, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => {
          statusIndexRef.current = (statusIndexRef.current + 1) % STATUS_MESSAGES.length
          if (statusRef.current) {
            statusRef.current.textContent = STATUS_MESSAGES[statusIndexRef.current]
          }
          gsap.to(statusRef.current, { opacity: 1, duration: 0.3 })
        },
      })
    }

    statusTweenRef.current = gsap.delayedCall(2, function tick() {
      cycle()
      statusTweenRef.current = gsap.delayedCall(2, tick)
    })

    return () => statusTweenRef.current?.kill()
  }, [phase])

  const submit = useCallback(async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setPhase('loading')
    setError(null)
    setSelectedTrack(null)
    setResults([])

    flashRef.current?.current?.flash?.()

    const mood = classifyMood(query)
    setMoodConfig(mood)

    try {
      const res = await axios.post(`${API_BASE}/recommend`, null, {
        params: { query: query.trim(), top_k: 5 },
      })
      setResults(res.data)
      setPhase('revealing')
      // Transition to done after reveal animation completes (~1.5s for all rows)
      setTimeout(() => setPhase('done'), 1600)
    } catch (err) {
      setError('Could not reach the server. Is the backend running?')
      setResults([])
      setPhase('idle')
    }
  }, [query])

  return (
    <>
      <Scene
        moodConfig={moodConfig}
        results={results}
        onSelectTrack={setSelectedTrack}
        onFlashRef={flashRef}
        phase={phase}
      />

      {/* Loading overlay */}
      {phase === 'loading' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,8,0.55)',
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}>
          <div
            ref={statusRef}
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.4rem)',
              fontWeight: 500,
              color: 'var(--color-blob-2)',
              textShadow: '0 0 20px var(--color-blob-2)',
              letterSpacing: '0.04em',
            }}
          />
        </div>
      )}

      {/* UI overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', pointerEvents: 'none',
      }}>
        <div style={{
          marginTop: '2.5rem',
          fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
          fontWeight: 700,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--color-blob-2)',
          textShadow: '0 0 20px var(--color-blob-2), 0 0 40px rgba(0,255,204,0.4)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          Moodsic
        </div>

        <div style={{ flex: 1 }} />

        {/* Search form — visible in idle and done phases */}
        {(phase === 'idle' || phase === 'done') && (
          <form
            onSubmit={submit}
            style={{
              marginBottom: '3.5rem',
              width: 'min(480px, 90vw)',
              pointerEvents: 'all',
            }}
          >
            <div style={{
              display: 'flex',
              gap: '10px',
              background: 'rgba(10,0,30,0.6)',
              border: '1px solid rgba(123,47,255,0.5)',
              borderRadius: '50px',
              padding: '10px 10px 10px 20px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 0 30px rgba(123,47,255,0.2)',
            }}>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="describe your mood..."
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--color-text)',
                  fontSize: '15px',
                  fontFamily: 'var(--font-main)',
                }}
              />
              <button
                type="submit"
                disabled={!query.trim()}
                style={{
                  background: 'var(--color-blob-1)',
                  border: 'none',
                  borderRadius: '40px',
                  padding: '8px 20px',
                  color: '#fff',
                  fontSize: '14px',
                  fontFamily: 'var(--font-main)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)',
                  boxShadow: '0 0 15px rgba(123,47,255,0.6)',
                }}
              >
                →
              </button>
            </div>

            {error && (
              <p style={{
                marginTop: '8px',
                textAlign: 'center',
                color: 'var(--color-neon-pink)',
                fontSize: '13px',
              }}>
                {error}
              </p>
            )}
          </form>
        )}
      </div>

      {/* Wrapped-style results panel */}
      <ResultsList
        tracks={results}
        visible={phase === 'revealing' || phase === 'done'}
        onSelect={setSelectedTrack}
        flashScene={() => flashRef.current?.current?.flash?.()}
      />

      {/* Detail card */}
      {selectedTrack && (
        <ResultCard track={selectedTrack} onClose={() => setSelectedTrack(null)} />
      )}
    </>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/frontend
npm run build 2>&1 | grep -i error
```
Expected: no errors.

- [ ] **Step 3: Full end-to-end manual test**

```bash
# Terminal 1
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/backend
source ../.venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/frontend
npm run dev
```

Open http://localhost:5173. Verify:
1. Idle: form visible, blob at 1x speed
2. Submit "overthinking at 3am": loading overlay appears, status text cycles every 2s, blob at 3x
3. Results arrive: overlay gone, blob jumps to 5x, 3 rapid chromatic aberration flashes fire
4. #1 card appears centered on screen large with "Best Match" badge, holds ~1.5s
5. #2 and #3 slide in staggered; #4 and #5 fade in at lower opacity
6. All cards settle into the left-side panel
7. After ~1.6s from revealing: blob at 1x, form reappears at bottom
8. Click a row in ResultsList: ResultCard detail view slides up
9. Satellite orbs in 3D scene correspond to all returned tracks

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: phase state machine, loading overlay with cycling status, ResultsList wiring"
```

---

## Task 8: Docker rebuild and final smoke test

**Files:**
- No new files

- [ ] **Step 1: Verify .env has GENIUS_ACCESS_TOKEN**

```bash
grep GENIUS_ACCESS_TOKEN /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer/.env
```
If missing or empty, add it before continuing (free token at https://genius.com/api-clients).

- [ ] **Step 2: Docker Compose rebuild**

```bash
cd /Users/macbook/Documents/Dev/ML/Moodsic-Sentimentizer
docker compose down
docker compose up -d --build
```

- [ ] **Step 3: Verify backend is healthy**

```bash
# Wait ~30s for cold start, then:
curl -s http://127.0.0.1:8000/health | python -m json.tool
```
Expected:
```json
{
  "spotify_token_present": true,
  "spotify_tracks_found": 2,
  "cache_keys": []
}
```

- [ ] **Step 4: Full pipeline curl test**

```bash
curl -s -X POST "http://127.0.0.1:8000/recommend?query=overthinking+at+3am&top_k=3" | python -m json.tool
```
Expected: 3 tracks with `title`, `artist`, `score`. Tracks should feel dark/introspective — not literally named "overthinking at 3am".

- [ ] **Step 5: Frontend smoke test in browser**

Open http://localhost:5173. Run full flow: submit query, watch loading overlay, see ResultsList reveal, click a result.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: vibe-matching upgrade complete — enriched embeddings, query expansion, Wrapped reveal UI"
```

---

## Done

Full verification commands:
```bash
# Dev mode
cd backend && uvicorn main:app --reload --port 8000  # terminal 1
cd frontend && npm run dev                            # terminal 2
# open http://localhost:5173

# Docker mode
docker compose up --build
# open http://localhost:5173

# Backend standalone tests
cd backend && python enricher.py    # tests all three enricher functions
cd backend && python recommender.py # tests query expansion + full pipeline
```
