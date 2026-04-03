# Moodsic — ML Music Mood Recommender

Describe a vibe, get back the five tracks that match it. No genre filters, no keyword search — just a natural-language mood description fed into a sentence-transformer embedding pipeline backed by real Spotify audio features and lyric snippets.

## How It Works

1. **Query expansion** — your vibe description ("overthinking at 3am") is mapped to Spotify-searchable genre/mood terms ("dark alternative lo-fi") via a keyword bucket system
2. **Candidate pool** — 50 tracks are fetched from Spotify matching those expanded terms
3. **Enrichment** — each track gets a rich embed string built from:
   - Spotify audio features (energy, danceability, valence, tempo, acousticness)
   - Genius lyric snippet (first ~200 chars)
4. **Ranking** — `all-mpnet-base-v2` encodes both the original query and all embed strings; cosine similarity picks the top 5
5. **Reveal** — results appear with a Spotify Wrapped-style cinematic animation sequence

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.13, FastAPI, sentence-transformers, lyricsgenius, scikit-learn |
| Frontend | React 18, Vite, Three.js / React Three Fiber, GSAP |
| Infra | Docker Compose (two services) |

## Getting Started

### Prerequisites

- Docker + Docker Compose
- Spotify API credentials (free at [developer.spotify.com](https://developer.spotify.com))
- Genius API access token (free at [genius.com/api-clients](https://genius.com/api-clients))

### Setup

```bash
git clone https://github.com/kevinkunkel98/Moodsic-ML-Music-Recommender.git
cd Moodsic-ML-Music-Recommender

cp .env.example .env
# Fill in .env with your credentials
```

`.env` format:
```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
GENIUS_ACCESS_TOKEN=your_genius_token_here
```

### Run

```bash
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173).

First cold start takes ~30–60s for the ML model to load. Subsequent starts are fast (~2s, model is cached).

## Development

### Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# Start API server
cd backend && uvicorn main:app --reload --port 8000

# Smoke tests
cd backend && python enricher.py    # tests audio features + lyric fetching
cd backend && python recommender.py # tests query expansion + full pipeline
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev        # dev server on :5173
npm run build      # production build
```

### API

| Method | Path | Params | Response |
|--------|------|--------|----------|
| `POST` | `/recommend` | `query: str`, `top_k: int = 5` | `list[TrackDict]` |
| `GET` | `/health` | — | health status |

```bash
curl -s -X POST "http://127.0.0.1:8000/recommend?query=rainy+night&top_k=3" | python -m json.tool
```

## Project Structure

```
├── backend/
│   ├── main.py          # FastAPI app, /recommend endpoint
│   ├── recommender.py   # Query expansion, embedding pipeline, ranking
│   ├── enricher.py      # Spotify audio features, Genius lyrics, embed string builder
│   ├── spotify.py       # Spotify OAuth + track search
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx          # Phase state machine, loading overlay
│       ├── Scene.jsx        # Three.js canvas (stars, blob, orbs)
│       ├── MoodBlob.jsx     # Perlin-noise morphing blob
│       ├── ResultsList.jsx  # Wrapped-style reveal animation
│       ├── ResultCard.jsx   # Track detail card
│       └── AudioPlayer.jsx  # Web Audio waveform visualiser
├── docker-compose.yml
└── .env.example
```

## Notes

- Spotify's `/v1/audio-features` endpoint requires user-level OAuth for apps created after November 2024. With client-credential auth only, audio feature enrichment is gracefully skipped and ranking falls back to lyric + title/artist embeddings.
- Results are cached per query for 5 minutes.
- `preview_url` is often `null` — Spotify has reduced 30s preview availability significantly.
