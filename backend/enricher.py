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
