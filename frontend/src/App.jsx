import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'
import { gsap } from 'gsap'
import Scene from './Scene'
import ResultCard from './ResultCard'
import ResultsList from './ResultsList'
import { classifyMood } from './moodClassifier'

const DEFAULT_MOOD = { speed: 1.0, intensity: 1.0, color1: '#7b2fff', color2: '#00ffcc', mood: 'default' }
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const STATUS_MESSAGES = [
  'scanning your vibe...',
  'fetching tracks...',
  'analysing audio features...',
  'reading lyrics...',
  'ranking by feel...',
]

export default function App() {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('idle') // 'idle' | 'loading' | 'revealing' | 'done'
  const [results, setResults] = useState([])
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [moodConfig, setMoodConfig] = useState(DEFAULT_MOOD)
  const [error, setError] = useState(null)
  const flashRef = useRef(null)
  const statusRef = useRef(null)
  const statusTweenRef = useRef(null)
  const statusIndexRef = useRef(0)

  // Cycle status messages during loading phase
  useEffect(() => {
    if (phase !== 'loading') {
      statusTweenRef.current?.kill()
      return
    }
    if (!statusRef.current) return

    statusIndexRef.current = 0
    statusRef.current.textContent = STATUS_MESSAGES[0]
    gsap.set(statusRef.current, { opacity: 1 })

    const cycle = () => {
      if (!statusRef.current) return
      gsap.to(statusRef.current, {
        opacity: 0,
        duration: 0.3,
        onComplete: () => {
          statusIndexRef.current = (statusIndexRef.current + 1) % STATUS_MESSAGES.length
          if (statusRef.current) {
            statusRef.current.textContent = STATUS_MESSAGES[statusIndexRef.current]
          }
          gsap.to(statusRef.current, { opacity: 1, duration: 0.3 })
        },
      })
    }

    statusTweenRef.current = gsap.delayedCall(2, function tick() {
      cycle()
      statusTweenRef.current = gsap.delayedCall(2, tick)
    })

    return () => statusTweenRef.current?.kill()
  }, [phase])

  const submit = useCallback(async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setPhase('loading')
    setError(null)
    setSelectedTrack(null)
    setResults([])

    flashRef.current?.current?.flash?.()

    const mood = classifyMood(query)
    setMoodConfig(mood)

    try {
      const res = await axios.post(`${API_BASE}/recommend`, null, {
        params: { query: query.trim(), top_k: 5 },
      })
      setResults(res.data)
      setPhase('revealing')
      // Transition to done after reveal animation completes (~1.5s for all rows)
      setTimeout(() => setPhase('done'), 1600)
    } catch (err) {
      setError('Could not reach the server. Is the backend running?')
      setResults([])
      setPhase('idle')
    }
  }, [query])

  return (
    <>
      <Scene
        moodConfig={moodConfig}
        results={results}
        onSelectTrack={setSelectedTrack}
        onFlashRef={flashRef}
        phase={phase}
      />

      {/* Loading overlay */}
      {phase === 'loading' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,8,0.55)',
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}>
          <div
            ref={statusRef}
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.4rem)',
              fontWeight: 500,
              color: 'var(--color-blob-2)',
              textShadow: '0 0 20px var(--color-blob-2)',
              letterSpacing: '0.04em',
            }}
          />
        </div>
      )}

      {/* UI overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', pointerEvents: 'none',
      }}>
        <div style={{
          marginTop: '2.5rem',
          fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
          fontWeight: 700,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--color-blob-2)',
          textShadow: '0 0 20px var(--color-blob-2), 0 0 40px rgba(0,255,204,0.4)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          Moodsic
        </div>

        <div style={{ flex: 1 }} />

        {/* Search form — visible in idle and done phases */}
        {(phase === 'idle' || phase === 'done') && (
          <form
            onSubmit={submit}
            style={{
              marginBottom: '3.5rem',
              width: 'min(480px, 90vw)',
              pointerEvents: 'all',
            }}
          >
            <div style={{
              display: 'flex',
              gap: '10px',
              background: 'rgba(10,0,30,0.6)',
              border: '1px solid rgba(123,47,255,0.5)',
              borderRadius: '50px',
              padding: '10px 10px 10px 20px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 0 30px rgba(123,47,255,0.2)',
            }}>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="describe your mood..."
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--color-text)',
                  fontSize: '15px',
                  fontFamily: 'var(--font-main)',
                }}
              />
              <button
                type="submit"
                disabled={!query.trim()}
                style={{
                  background: 'var(--color-blob-1)',
                  border: 'none',
                  borderRadius: '40px',
                  padding: '8px 20px',
                  color: '#fff',
                  fontSize: '14px',
                  fontFamily: 'var(--font-main)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)',
                  boxShadow: '0 0 15px rgba(123,47,255,0.6)',
                }}
              >
                →
              </button>
            </div>

            {error && (
              <p style={{
                marginTop: '8px',
                textAlign: 'center',
                color: 'var(--color-neon-pink)',
                fontSize: '13px',
              }}>
                {error}
              </p>
            )}
          </form>
        )}
      </div>

      {/* Wrapped-style results panel */}
      <ResultsList
        tracks={results}
        visible={phase === 'revealing' || phase === 'done'}
        onSelect={setSelectedTrack}
        flashScene={() => flashRef.current?.current?.flash?.()}
      />

      {/* Detail card */}
      {selectedTrack && (
        <ResultCard track={selectedTrack} onClose={() => setSelectedTrack(null)} />
      )}
    </>
  )
}
