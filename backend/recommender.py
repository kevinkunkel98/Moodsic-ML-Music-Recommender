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
