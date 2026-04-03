import { useRef, useState, useEffect, useCallback } from 'react'

export default function AudioPlayer({ previewUrl, trackTitle }) {
  const audioRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const duration = 30 // Spotify previews are always 30s

  // Setup Web Audio API (only once per audio element)
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

  const toggle = useCallback(() => {
    if (!audioRef.current) return
    setupAudio()
    if (playing) {
      audioRef.current.pause()
      cancelAnimationFrame(animFrameRef.current)
    } else {
      audioRef.current.play()
    }
    setPlaying(p => !p)
  }, [playing, setupAudio])

  const seek = useCallback((e) => {
    if (!audioRef.current) return
    const t = Number(e.target.value)
    audioRef.current.currentTime = t
    setProgress(t)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      audioRef.current?.pause()
    }
  }, [])

  // Reset on track change
  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    cancelAnimationFrame(animFrameRef.current)
    if (audioRef.current) audioRef.current.currentTime = 0
  }, [previewUrl])

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  if (!previewUrl) {
    return <p className="audio-no-preview">// NO PREVIEW AVAILABLE</p>
  }

  return (
    <div className="audio-player">
      {trackTitle && (
        <div className="audio-player-track-name">▶ {trackTitle}</div>
      )}

      <audio
        ref={audioRef}
        src={previewUrl}
        crossOrigin="anonymous"
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime || 0)}
        onEnded={() => {
          setPlaying(false)
          cancelAnimationFrame(animFrameRef.current)
        }}
      />

      <div className="audio-controls">
        <button
          className={`audio-btn${playing ? ' audio-btn--active' : ''}`}
          onClick={toggle}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>

        <input
          type="range"
          className="audio-scrubber"
          min={0}
          max={duration}
          step={0.1}
          value={progress}
          onChange={seek}
        />

        <span className="audio-time">
          {formatTime(progress)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
