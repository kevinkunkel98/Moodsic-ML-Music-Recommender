import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from recommender import get_model, recommend

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Moodsic-Sentimentizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:80",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Pre-warm the sentence-transformer model so first request is fast."""
    logger.info("Pre-warming sentence-transformer model...")
    get_model()
    logger.info("Model ready.")


@app.post("/recommend")
def get_recommendation(query: str, top_k: int = 5) -> list[dict]:
    """
    Returns top_k track recommendations for the given mood query.
    Query params: query (str), top_k (int, default 5).
    """
    return recommend(query, top_k=top_k)


@app.get("/health")
def health():
    """Debug: test Spotify connectivity and cache state."""
    from spotify import search_tracks as st, get_access_token
    token = get_access_token()
    tracks = st("test", limit=2)
    from recommender import _query_cache
    return {
        "spotify_token_present": token is not None,
        "spotify_tracks_found": len(tracks),
        "cache_keys": list(_query_cache.keys()),
    }
