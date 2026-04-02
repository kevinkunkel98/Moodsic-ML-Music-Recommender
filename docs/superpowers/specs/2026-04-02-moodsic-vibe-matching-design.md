# Moodsic Vibe-Matching Upgrade — Design Spec
**Date:** 2026-04-02  
**Status:** Approved

---

## Problem

The current recommender matches queries to tracks using only `title + artist + album` as the embed string. This means:

1. The Spotify candidate pool is seeded by passing the raw vibe query (e.g. "overthinking at 3am") directly to Spotify search, which returns tracks *named* "Rainy Night" rather than tracks that *feel* like that vibe.
2. The embedding comparison has almost no emotional signal — track metadata contains no mood, tempo, energy, or lyrical content.

Result: ranking is essentially semantic title similarity, not vibe matching.

---

## Goal

Return tracks that genuinely match the emotional/sonic vibe of the user's natural language description, using Spotify audio features + Genius lyric snippets as the enrichment signal.

---

## Approach

**Approach B: Genius lyrics + Spotify audio features**

Two enrichment signals per track:
- **Spotify Audio Features API** — valence, energy, danceability, tempo, acousticness, speechiness, instrumentalness (batch endpoint, 1 request per 50 tracks)
- **Genius lyric snippet** — first ~200 chars of lyrics via the `lyricsgenius` library (free API key tier)

Both are combined into a rich natural-language embed string, which is then compared against the user query using `all-mpnet-base-v2`.

---

## Backend Design

### `backend/enricher.py` (new file)

Three public functions:

```python
def get_audio_features(track_ids: list[str], token: str) -> dict[str, dict]:
    """
    Batch-fetch Spotify audio features for up to 100 track IDs.
    Returns {track_id: features_dict}. Missing IDs map to None.
    Endpoint: GET /audio-features?ids=...
    """

def get_lyric_snippet(title: str, artist: str) -> str:
    """
    Fetch first ~200 chars of lyrics from Genius.
    Returns "" on any failure (rate limit, not found, network error).
    Uses lyricsgenius library with search_song(title, artist).
    """

def build_embed_string(track: dict, features: dict | None, snippet: str) -> str:
    """
    Assemble the rich embed string from track metadata + features + lyrics.
    
    Format:
    "{title} by {artist}. {audio_prose}. Lyrics: {snippet}"
    
    audio_prose examples:
    - "high energy, very danceable, upbeat (valence 0.82), 128bpm, electric"
    - "low energy, melancholic (valence 0.12), slow 68bpm, mostly acoustic, lyrical"
    
    Audio features → prose conversion:
    - energy > 0.7 → "high energy" | < 0.3 → "low energy" | else "moderate energy"
    - valence > 0.6 → "upbeat (valence {v:.2f})" | < 0.3 → "melancholic (valence {v:.2f})" | else "neutral mood"
    - danceability > 0.7 → "very danceable" | < 0.3 → "not danceable"
    - tempo → "{tempo:.0f}bpm"
    - acousticness > 0.6 → "mostly acoustic" | < 0.2 → "electric"
    - speechiness > 0.4 → "lyrical/spoken" | instrumentalness > 0.5 → "instrumental"
    
    Fallback: if features is None, omit audio_prose section.
    Fallback: if snippet is "", omit "Lyrics:" section.
    Minimum: "{title} by {artist}" (current behavior).
    """
```

### `backend/recommender.py` (modified)

**`expand_query(query: str) -> str`** — new function

Maps natural language vibe descriptions to Spotify-searchable genre/mood terms. Uses a keyword scan over ~8 mood buckets:

| Bucket | Keywords | Spotify search terms appended |
|--------|----------|-------------------------------|
| melancholic | sad, cry, lonely, heartbreak, lost, numb, dark, empty | `"sad indie slow"` |
| energetic | hype, gym, workout, pump, energy, rage, fire | `"energetic high tempo"` |
| romantic | love, crush, date, tender, warm, soft | `"romantic pop slow"` |
| dreamy | dream, float, clouds, hazy, nostalgic, golden | `"dreamy ambient indie"` |
| euphoric | party, dance, rave, club, festival, happy | `"dance electronic upbeat"` |
| dark | night, insomnia, overthink, anxiety, alone, 3am | `"dark alternative lo-fi"` |
| chill | chill, relax, afternoon, coffee, sunday, calm | `"chill lo-fi acoustic"` |
| aggressive | angry, aggressive, metal, scream, intense | `"metal hard rock aggressive"` |

Multiple buckets can match. Result is deduplicated and joined. If no buckets match, raw query is returned unchanged.

**`recommend()` pipeline changes:**

```python
def recommend(query: str, top_k: int = 5) -> list[dict]:
    expanded = expand_query(query)
    songs = search_tracks(expanded, limit=50) or DEFAULT_SONGS
    
    # Batch-fetch audio features (1 Spotify API call for all 50)
    token = get_access_token()
    track_ids = [extract_spotify_id(s) for s in songs]
    features_map = get_audio_features(track_ids, token) if token else {}
    
    # Parallel lyric fetch (ThreadPoolExecutor, max 10 workers)
    with ThreadPoolExecutor(max_workers=10) as ex:
        snippets = list(ex.map(
            lambda s: get_lyric_snippet(s['title'], s['artist']),
            songs
        ))
    
    # Build rich embed strings
    embed_strings = [
        build_embed_string(s, features_map.get(extract_spotify_id(s)), snip)
        for s, snip in zip(songs, snippets)
    ]
    
    model = get_model()
    query_embedding = model.encode(query)  # embed original query, not expanded
    song_embeddings = model.encode(embed_strings)
    scores = cosine_similarity([query_embedding], song_embeddings)[0]
    # ... rank and return as before
```

Note: `query` (original, unexpanded) is embedded for ranking. `expanded` is only used for Spotify search pool construction.

**`extract_spotify_id(track: dict) -> str | None`** — parses the track ID from `spotify_url`.

### `backend/requirements.txt`

Add: `lyricsgenius==3.0.1`

### Graceful degradation matrix

| Spotify features | Genius lyrics | Embed string |
|-----------------|---------------|--------------|
| ✓ | ✓ | Full rich string |
| ✓ | ✗ | Features prose only |
| ✗ | ✓ | Lyrics only |
| ✗ | ✗ | title + artist (current behavior) |

---

## Frontend Design

### Loading State Machine (`App.jsx`)

```
idle → loading → revealing → done
```

- **idle:** Normal search form visible
- **loading:** Full-screen overlay active; blob animates at 3× speed; cycling status text
- **revealing:** Results have arrived; Wrapped-style reveal sequence plays (~3s total)
- **done:** Ranked list panel visible; normal interactive state

`status` string cycles during loading (GSAP crossfade, 2s per phase):
1. `"scanning your vibe..."`
2. `"fetching tracks..."`
3. `"analysing audio features..."`
4. `"reading lyrics..."`
5. `"ranking by feel..."`

### `frontend/src/ResultsList.jsx` (new component)

Wrapped-style ranked list panel. Receives `tracks: []` and `visible: bool`.

**Reveal sequence (triggered when `visible` flips true):**
1. Three rapid full-screen color pulses via GSAP (chromatic aberration to max + blob punch ×3, 150ms each)
2. `#1` card slides in from bottom, centered, large (album art blur BG, "BEST MATCH" badge, title, artist, score bar). Holds 1.5s.
3. `#2`, `#3` slide in staggered below/beside at 80% size, 0.3s apart
4. `#4`, `#5` fade in at 60% opacity at bottom, 0.2s apart
5. Full list settles into a persistent left-side glassmorphism panel

Each list item shows: rank number, album art thumbnail, title, artist, similarity score bar. Click opens existing `ResultCard` detail view.

**Satellite orbs** spawn simultaneously with each card's reveal (existing `SatelliteOrbs` component; `results` prop is populated incrementally as each reveal step fires).

### `frontend/src/App.jsx` changes

- Add `phase` state: `'idle' | 'loading' | 'revealing' | 'done'`
- Pass `phase` to `Scene` (blob speed multiplier: idle=1×, loading=3×, revealing=5×, done=1×)
- Render `ResultsList` when `phase === 'revealing' || phase === 'done'`
- Loading overlay rendered inline in App (not a separate component — it's just a fixed div with GSAP-animated text)

### `frontend/src/Scene.jsx` changes

- Accept `phase` prop; multiply `moodConfig.speed` by phase multiplier before passing to `MoodBlob`
- No other changes

---

## API Contract

No changes to the `/recommend` endpoint signature. The response shape is identical — enrichment is purely internal. Latency increases from ~1s to ~5-15s depending on Genius response times.

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `lyricsgenius` | `3.0.1` | Genius lyrics API client |

Requires new env var: `GENIUS_ACCESS_TOKEN` (free at genius.com/api-clients). Added to `.env.example` and `docker-compose.yml`.

---

## Error Handling

- `get_lyric_snippet` catches all exceptions, logs at WARNING level, returns `""`
- `get_audio_features` catches `requests.RequestException`, logs at WARNING, returns `{}`
- `expand_query` is pure Python, no I/O, cannot fail
- Enrichment failures never block the response — graceful degradation always produces a result

---

## Testing

Manual smoke tests (no automated test suite added in this iteration):

```bash
# Backend enricher unit test
cd backend && python enricher.py  # __main__ block tests all three functions

# Full pipeline test
curl -s -X POST "http://127.0.0.1:8000/recommend?query=overthinking+at+3am&top_k=3" | python -m json.tool

# Verify expanded query produces better pool than raw query
# Expected: tracks like "3am" by Matchbox Twenty, "Can't Sleep" type results
# NOT: tracks literally named "overthinking at 3am"
```

---

## Out of Scope

- Vector database / pre-indexing (future work)
- LLM-generated descriptions
- Musixmatch API
- Automated test suite
- Changes to Docker config beyond adding `GENIUS_ACCESS_TOKEN`
