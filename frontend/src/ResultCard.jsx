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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 20,
          background: 'rgba(0,0,0,0.4)',
        }}
      />

      {/* Card */}
      <div style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        width: 'min(360px, 90vw)',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 0 60px rgba(123,47,255,0.4)',
        animation: 'slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <style>{`
          @keyframes slideUp {
            from { transform: translateX(-50%) translateY(100%); opacity: 0; }
            to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
          }
        `}</style>

        {/* Album art blurred background */}
        {track.album_art_url && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${track.album_art_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(24px) brightness(0.3)',
            transform: 'scale(1.1)',
          }} />
        )}

        {/* Glass content layer */}
        <div className="glass" style={{
          position: 'relative',
          padding: '20px',
          background: 'rgba(10,0,30,0.7)',
        }}>
          {/* Track info row */}
          <div style={{ display: 'flex', gap: '14px', marginBottom: '14px' }}>
            {track.album_art_url && (
              <img
                src={track.album_art_url}
                alt={track.album}
                style={{ width: 72, height: 72, borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <div style={{ overflow: 'hidden' }}>
              <div style={{
                fontWeight: 600, fontSize: '15px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {track.title}
              </div>
              <div style={{ color: 'var(--color-text-dim)', fontSize: '13px', marginTop: '2px' }}>
                {track.artist}
              </div>
              <div style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>
                {track.album}
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Mood Match
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-neon-cyan)', fontWeight: 600 }}>
                {scorePercent}%
              </span>
            </div>
            <div style={{
              height: '4px', borderRadius: '2px',
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${scorePercent}%`,
                background: 'linear-gradient(to right, var(--color-blob-1), var(--color-neon-cyan))',
                boxShadow: '0 0 8px var(--color-neon-cyan)',
                borderRadius: '2px',
              }} />
            </div>
          </div>

          {/* Audio preview */}
          <div style={{ marginBottom: '16px' }}>
            <AudioPlayer previewUrl={track.preview_url} />
          </div>

          {/* Spotify link */}
          {track.spotify_url && (
            <a
              href={track.spotify_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '10px',
                borderRadius: '10px',
                background: 'rgba(123,47,255,0.25)',
                border: '1px solid rgba(123,47,255,0.4)',
                color: '#fff',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'var(--transition-smooth)',
              }}
            >
              Open in Spotify ↗
            </a>
          )}
        </div>
      </div>
    </>
  )
}
