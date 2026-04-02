import { useRef, useState, useEffect, useCallback } from 'react'

const BAR_COUNT = 32

export default function AudioPlayer({ previewUrl }) {
  const audioRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const canvasRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  // Setup Web Audio API
  const setupAudio = useCallback(() => {
    if (analyserRef.current) return
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const source = ctx.createMediaElementSource(audioRef.current)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 64
    source.connect(analyser)
    analyser.connect(ctx.destination)
    analyserRef.current = analyser
  }, [])

  const drawBars = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(data)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const barW = canvas.width / BAR_COUNT - 1
    for (let i = 0; i < BAR_COUNT; i++) {
      const barH = (data[i] / 255) * canvas.height
      const hue = 260 + (i / BAR_COUNT) * 120
      ctx.fillStyle = `hsl(${hue}, 100%, 65%)`
      ctx.fillRect(i * (barW + 1), canvas.height - barH, barW, barH)
    }
    animFrameRef.current = requestAnimationFrame(drawBars)
  }, [])

  const toggle = useCallback(() => {
    if (!audioRef.current) return
    setupAudio()
    if (playing) {
      audioRef.current.pause()
      cancelAnimationFrame(animFrameRef.current)
    } else {
      audioRef.current.play()
      drawBars()
    }
    setPlaying(p => !p)
  }, [playing, setupAudio, drawBars])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      audioRef.current?.pause()
    }
  }, [])

  useEffect(() => {
    // Reset on track change
    setPlaying(false)
    setProgress(0)
    cancelAnimationFrame(animFrameRef.current)
    if (audioRef.current) audioRef.current.currentTime = 0
  }, [previewUrl])

  if (!previewUrl) {
    return (
      <p style={{ color: 'var(--color-text-dim)', fontSize: '13px', textAlign: 'center' }}>
        No preview available
      </p>
    )
  }

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <audio
        ref={audioRef}
        src={previewUrl}
        crossOrigin="anonymous"
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime || 0)}
        onEnded={() => { setPlaying(false); cancelAnimationFrame(animFrameRef.current) }}
      />

      <canvas
        ref={canvasRef}
        width={240}
        height={40}
        style={{ width: '100%', height: '40px', borderRadius: '4px' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={toggle}
          style={{
            background: 'none',
            border: '1px solid var(--color-blob-1)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>
          {formatTime(progress)} / 0:30
        </span>
      </div>
    </div>
  )
}
