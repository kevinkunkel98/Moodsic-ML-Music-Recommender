import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

const ORB_COLORS = ['#ff0080', '#00ffcc', '#7b2fff', '#ffd700', '#00ff88']

function ScoreBar({ score }) {
  const pct = Math.round(score * 100)
  return (
    <div style={{ marginTop: '4px' }}>
      <div style={{
        height: '3px',
        borderRadius: '2px',
        background: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        width: '100%',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(to right, var(--color-blob-1), var(--color-neon-cyan))',
          boxShadow: '0 0 6px var(--color-neon-cyan)',
          borderRadius: '2px',
        }} />
      </div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
        {pct}% match
      </div>
    </div>
  )
}

function TrackRow({ track, rank, onSelect, isBig }) {
  const isBest = rank === 1
  const accentColor = ORB_COLORS[(rank - 1) % ORB_COLORS.length]
  const size = isBig ? 'big' : (rank <= 3 ? 'mid' : 'small')
  const artSize = size === 'big' ? 72 : size === 'mid' ? 52 : 40
  const fontSize = size === 'big' ? '16px' : size === 'mid' ? '14px' : '13px'
  const padding = size === 'big' ? '18px 20px' : size === 'mid' ? '14px 16px' : '10px 14px'

  return (
    <div
      onClick={() => onSelect(track)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding,
        borderRadius: '16px',
        background: isBest ? 'rgba(123,47,255,0.18)' : 'rgba(10,0,30,0.45)',
        border: `1px solid ${isBest ? 'rgba(123,47,255,0.5)' : 'rgba(123,47,255,0.2)'}`,
        backdropFilter: 'blur(16px)',
        cursor: 'pointer',
        marginBottom: '8px',
        opacity: rank >= 4 ? 0.6 : 1,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = isBest ? 'rgba(123,47,255,0.28)' : 'rgba(123,47,255,0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = isBest ? 'rgba(123,47,255,0.18)' : 'rgba(10,0,30,0.45)'
      }}
    >
      <div style={{
        minWidth: size === 'big' ? '36px' : size === 'mid' ? '32px' : '24px',
        height: size === 'big' ? '36px' : size === 'mid' ? '32px' : '24px',
        borderRadius: '50%',
        background: accentColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size === 'big' ? '16px' : size === 'mid' ? '14px' : '11px',
        fontWeight: 700,
        color: '#000',
        flexShrink: 0,
        boxShadow: `0 0 12px ${accentColor}`,
      }}>
        {rank}
      </div>

      {track.album_art_url ? (
        <img
          src={track.album_art_url}
          alt={track.album}
          style={{
            width: `${artSize}px`,
            height: `${artSize}px`,
            borderRadius: '10px',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div style={{
          width: `${artSize}px`,
          height: `${artSize}px`,
          borderRadius: '10px',
          background: 'rgba(123,47,255,0.3)',
          flexShrink: 0,
        }} />
      )}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {isBest && (
          <div style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: accentColor,
            textTransform: 'uppercase',
            marginBottom: '2px',
          }}>
            Best Match
          </div>
        )}
        <div style={{
          fontWeight: isBest ? 600 : 500,
          fontSize,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {track.title}
        </div>
        <div style={{
          color: 'var(--color-text-dim)',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {track.artist}
        </div>
        <ScoreBar score={track.score} />
      </div>
    </div>
  )
}

// Full-screen color flash overlay for pulse step
function ColorFlash({ flashRef }) {
  return (
    <div
      ref={flashRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 25,
        background: 'var(--color-blob-1)',
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

export default function ResultsList({ tracks = [], visible, onSelect, flashScene }) {
  const containerRef = useRef(null)
  const rowRefs = useRef([])
  const flashOverlayRef = useRef(null)
  const [phase, setPhase] = useState('hidden') // 'hidden' | 'pulsing' | 'hero' | 'panel'

  // Reset when hidden
  useEffect(() => {
    if (!visible) setPhase('hidden')
  }, [visible])

  useEffect(() => {
    if (!visible || !tracks.length) return

    setPhase('pulsing')

    // Step 1: Three rapid color pulses (150ms each) + aberration flashes
    const pulseTimeline = gsap.timeline({
      onComplete: () => setPhase('hero'),
    })

    for (let i = 0; i < 3; i++) {
      pulseTimeline
        .to(flashOverlayRef.current, { opacity: 0.4, duration: 0.07, ease: 'power2.in' }, i * 0.15)
        .to(flashOverlayRef.current, { opacity: 0, duration: 0.08, ease: 'power2.out' }, i * 0.15 + 0.07)
        .call(() => flashScene?.(), [], i * 0.15)
    }
  }, [visible, tracks])

  useEffect(() => {
    if (phase !== 'hero' || !tracks.length || !containerRef.current) return

    // Step 2: #1 card slides in centered, large, holds 1.5s
    const heroEl = rowRefs.current[0]
    if (!heroEl) return

    gsap.fromTo(
      heroEl,
      { y: 60, opacity: 0, scale: 1 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(1.2)',
        onComplete: () => {
          // After 1.5s hold, reveal #2 and #3
          gsap.delayedCall(1.5, () => {
            // Step 3: #2 and #3 at 80% size, 0.3s apart
            ;[1, 2].forEach((idx, i) => {
              const el = rowRefs.current[idx]
              if (!el) return
              gsap.fromTo(
                el,
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.4, delay: i * 0.3, ease: 'back.out(1.4)' }
              )
            })

            // Step 4: #4 and #5 fade in at 60% opacity, 0.2s apart
            ;[3, 4].forEach((idx, i) => {
              const el = rowRefs.current[idx]
              if (!el) return
              gsap.fromTo(
                el,
                { opacity: 0 },
                { opacity: 0.6, duration: 0.35, delay: 0.6 + i * 0.2, ease: 'power2.out' }
              )
            })

            // Step 5: After all cards are in (~1s), slide panel in from left and settle
            gsap.delayedCall(1.2, () => setPhase('panel'))
          })
        },
      }
    )
  }, [phase, tracks])

  useEffect(() => {
    if (phase !== 'panel' || !containerRef.current) return

    // Slide the whole panel into its final left-side position from off-screen
    gsap.fromTo(
      containerRef.current,
      { x: -380, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }
    )
  }, [phase])

  if (!visible || !tracks.length) return null

  // During 'hero' phase, #1 card is centered on screen; others are in the panel
  const isHeroPhase = phase === 'pulsing' || phase === 'hero'

  return (
    <>
      <ColorFlash flashRef={flashOverlayRef} />

      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: '50%',
          left: '1.5rem',
          transform: 'translateY(-50%)',
          zIndex: 15,
          width: 'min(340px, 90vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '16px',
          opacity: phase === 'panel' ? 1 : 0,
        }}
      >
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          marginBottom: '12px',
        }}>
          Top Vibes
        </div>
        {tracks.map((track, i) => (
          <div
            key={track.spotify_url || i}
            ref={el => (rowRefs.current[i] = el)}
            style={{
              opacity: 0,
              // During hero phase, #1 is positioned absolutely center-screen
              ...(isHeroPhase && i === 0 ? {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(400px, 85vw)',
                zIndex: 20,
              } : {}),
            }}
          >
            <TrackRow
              track={track}
              rank={i + 1}
              onSelect={onSelect}
              isBig={isHeroPhase && i === 0}
            />
          </div>
        ))}
      </div>
    </>
  )
}
