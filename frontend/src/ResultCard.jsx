import { useEffect } from 'react'
import AudioPlayer from './AudioPlayer'

export default function ResultCard({ track, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!track) return null

  const scorePercent = Math.round(track.score * 100)

  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />

      <div className="detail-card">
        <button className="detail-close-btn" onClick={onClose}>[ESC]</button>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          {track.album_art_url
            ? <img src={track.album_art_url} alt={track.album} className="track-card-art" style={{ width: 56, height: 56 }} />
            : <div className="track-card-art-placeholder" style={{ width: 56, height: 56 }} />
          }
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div className="detail-title">{track.title}</div>
            <div className="detail-artist">{track.artist}</div>
            <div className="detail-album">{track.album}</div>
          </div>
        </div>

        <div className="detail-score-label">MOOD MATCH</div>
        <div className="detail-score-bar-track">
          <div className="detail-score-bar-fill" style={{ width: `${scorePercent}%` }} />
        </div>
        <div className="detail-score-pct">{scorePercent}%</div>

        <AudioPlayer previewUrl={track.preview_url} trackTitle={track.title} />

        {track.spotify_url && (
          <a
            href={track.spotify_url}
            target="_blank"
            rel="noreferrer"
            className="detail-spotify-link"
          >
            OPEN IN SPOTIFY ↗
          </a>
        )}
      </div>
    </>
  )
}
