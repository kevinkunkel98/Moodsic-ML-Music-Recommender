import time
from functools import lru_cache

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from spotify import search_tracks

DEFAULT_SONGS = [
    {"title": "Song A", "artist": "Artist A", "album": "Album A",
     "album_art_url": None, "preview_url": None, "spotify_url": None,
     "desc": "dreamy indie, nostalgic, sunset vibes"},
    {"title": "Song B", "artist": "Artist B", "album": "Album B",
     "album_art_url": None, "preview_url": None, "spotify_url": None,
     "desc": "energetic party, loud, hype"},
    {"title": "Song C", "artist": "Artist C", "album": "Album C",
     "album_art_url": None, "preview_url": None, "spotify_url": None,
     "desc": "melancholic, slow, emotional"},
]

# Per-query cache: {query: {"results": [...], "expires_at": float}}
_query_cache: dict = {}
CACHE_TTL = 300  # 5 minutes


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    return SentenceTransformer("all-mpnet-base-v2")


def _embed_string(song: dict) -> str:
    """Build the embed string for a track."""
    return f"{song['title']} {song['artist']} {song.get('album', '')}"


def recommend(query: str, top_k: int = 5) -> list[dict]:
    """
    Returns top_k track dicts ranked by cosine similarity to `query`.
    Each dict: title, artist, album, album_art_url, preview_url, spotify_url, score.
    Falls back to DEFAULT_SONGS if Spotify unavailable.
    """
    now = time.time()
    cached = _query_cache.get(query)
    if cached and cached["expires_at"] > now:
        all_results = cached["results"]
    else:
        songs = search_tracks(query, limit=50) or DEFAULT_SONGS
        model = get_model()
        query_embedding = model.encode(query)
        song_embeddings = model.encode([_embed_string(s) for s in songs])
        scores = cosine_similarity([query_embedding], song_embeddings)[0]
        ranked = sorted(
            zip(songs, scores),
            key=lambda x: x[1],
            reverse=True,
        )
        all_results = [
            {**song, "score": float(score)}
            for song, score in ranked
        ]
        _query_cache[query] = {"results": all_results, "expires_at": now + CACHE_TTL}

    return all_results[:top_k]


if __name__ == "__main__":
    queries = ["late summer evening, nostalgic", "overthinking at 2am", "first warm day"]
    for q in queries:
        print(f"\nQuery: {q}")
        for r in recommend(q, top_k=3):
            print(f"  {r['title']} by {r['artist']} ({r['score']:.3f})")
