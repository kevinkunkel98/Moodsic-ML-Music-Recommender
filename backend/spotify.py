import time
from functools import lru_cache
from os import getenv

import requests

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search"

# Token cache: {"token": str, "expires_at": float}
_token_cache: dict = {}


def get_access_token() -> str | None:
    """Return a valid Spotify access token, refreshing if expired."""
    client_id = getenv("SPOTIFY_CLIENT_ID")
    client_secret = getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    now = time.time()
    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]

    response = requests.post(
        SPOTIFY_TOKEN_URL,
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        timeout=10,
    )
    response.raise_for_status()
    data = response.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data["expires_in"]
    return _token_cache["token"]


def search_tracks(query: str, limit: int = 50) -> list[dict]:
    """
    Search Spotify for tracks matching `query`.
    Returns list of track dicts with keys:
      title, artist, album, album_art_url, preview_url, spotify_url
    Returns empty list if credentials missing or API fails.
    """
    token = get_access_token()
    if not token:
        return []

    try:
        response = requests.get(
            SPOTIFY_SEARCH_URL,
            headers={"Authorization": f"Bearer {token}"},
            params={"q": query, "type": "track", "limit": limit},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException:
        return []

    items = response.json().get("tracks", {}).get("items", [])
    tracks = []
    for item in items:
        artists = ", ".join(a["name"] for a in item.get("artists", []))
        images = item.get("album", {}).get("images", [])
        # Prefer 300x300 (index 1), fall back to first available
        art_url = images[1]["url"] if len(images) > 1 else (images[0]["url"] if images else None)
        tracks.append({
            "title": item.get("name", "Unknown"),
            "artist": artists,
            "album": item.get("album", {}).get("name", ""),
            "album_art_url": art_url,
            "preview_url": item.get("preview_url"),  # nullable
            "spotify_url": item.get("external_urls", {}).get("spotify"),
        })
    return tracks
