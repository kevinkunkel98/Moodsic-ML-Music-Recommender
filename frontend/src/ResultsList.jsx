import { useEffect, useRef } from 'react'

export default function ResultsList({ tracks = [], visible, onSelect }) {
  const cardRefs = useRef([])
  const timersRef = useRef([])

  // Reset and re-trigger reveal whenever tracks change and panel becomes visible
  useEffect(() => {
    // Clear any pending timers
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []

    // Trim stale refs when tracks array shrinks
    cardRefs.current = cardRefs.current.slice(0, tracks.length)

    // Remove visible class from all cards
    cardRefs.current.forEach(el => {
      if (el) el.classList.remove('track-card--visible')
    })

    if (!visible || !tracks.length) return

    // Stagger the scan-reveal animation using setTimeout + CSS class toggle
    tracks.forEach((_, i) => {
      const t = setTimeout(() => {
        const el = cardRefs.current[i]
        if (el) el.classList.add('track-card--visible')
      }, i * 150)
      timersRef.current.push(t)
    })

    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current = []
    }
  }, [visible, tracks])

  if (!visible || !tracks.length) return null

  return (
    <div className="results-list">
      <div className="results-header">// TRACKS RETRIEVED</div>
      {tracks.map((track, i) => (
        <div
          key={track.spotify_url || i}
          ref={el => { cardRefs.current[i] = el }}
          className="track-card"
          style={{ '--i': i }}
          onClick={() => onSelect(track)}
        >
          <span className="track-card-num">
            {String(i + 1).padStart(2, '0')}
          </span>

          {track.album_art_url
            ? <img src={track.album_art_url} alt={track.album} className="track-card-art" />
            : <div className="track-card-art-placeholder" />
          }

          <div className="track-card-info">
            <div className="track-card-title">{track.title}</div>
            <div className="track-card-artist">{track.artist}</div>
          </div>

          {track.spotify_url && (
            <a
              href={track.spotify_url}
              target="_blank"
              rel="noreferrer"
              className="track-card-open"
              onClick={e => e.stopPropagation()}
            >
              [OPEN]
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
