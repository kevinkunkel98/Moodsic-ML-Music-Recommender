from functools import lru_cache
from os import getenv

import requests
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# Dummy Songs (später ersetzen!)
DEFAULT_SONGS = [
    {"title": "Song A", "desc": "dreamy indie, nostalgic, sunset vibes"},
    {"title": "Song B", "desc": "energetic party, loud, hype"},
    {"title": "Song C", "desc": "melancholic, slow, emotional"},
]

SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search"


@lru_cache(maxsize=1)
def get_model():
    return SentenceTransformer("all-MiniLM-L6-v2")


@lru_cache(maxsize=32)
def _spotify_access_token():
    client_id = getenv("SPOTIFY_CLIENT_ID")
    client_secret = getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        timeout=10,
    )
    response.raise_for_status()
    return response.json().get("access_token")


def _spotify_headers():
    token = _spotify_access_token()
    if not token:
        return None
    return {"Authorization": f"Bearer {token}"}


def fetch_spotify_songs(query="mood music", limit=10):
    headers = _spotify_headers()
    if not headers:
        return []

    response = requests.get(
        SPOTIFY_SEARCH_URL,
        headers=headers,
        params={"q": query, "type": "track", "limit": limit},
        timeout=10,
    )
    response.raise_for_status()
    items = response.json().get("tracks", {}).get("items", [])

    songs = []
    for item in items:
        artists = ", ".join(artist["name"] for artist in item.get("artists", []))
        desc = " ".join(
            part
            for part in [artists, item.get("name", ""), item.get("album", {}).get("name", "")]
            if part
        )
        songs.append(
            {
                "title": item.get("name", "Unknown track"),
                "desc": desc,
                "spotify_url": item.get("external_urls", {}).get("spotify"),
                "artist": artists,
            }
        )
    return songs


@lru_cache(maxsize=1)
def get_songs():
    spotify_songs = fetch_spotify_songs()
    return spotify_songs or DEFAULT_SONGS


@lru_cache(maxsize=1)
def get_song_embeddings():
    model = get_model()
    return [model.encode(song["desc"]) for song in get_songs()]


def recommend(query, top_k=3):
    model = get_model()
    songs = get_songs()
    song_embeddings = get_song_embeddings()
    query_embedding = model.encode(query)

    scores = cosine_similarity([query_embedding], song_embeddings)[0]

    ranked = sorted(
        zip(songs, scores),
        key=lambda x: x[1],
        reverse=True,
    )

    return ranked[:top_k]


if __name__ == "__main__":
    queries = [
        "late summer evening, nostalgic but warm",
        "overthinking at 2am",
        "first warm day with friends",
        "driving at night, slightly sad but peaceful",
    ]

    for q in queries:
        print(f"\nQuery: {q}")
        results = recommend(q)

        for song, score in results:
            print(f"  {song['title']} ({score:.3f})")
