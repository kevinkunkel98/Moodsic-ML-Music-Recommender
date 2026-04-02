import { useState, useRef, useCallback } from 'react'
import axios from 'axios'
import Scene from './Scene'
import ResultCard from './ResultCard'
import { classifyMood } from './moodClassifier'

const DEFAULT_MOOD = { speed: 1.0, intensity: 1.0, color1: '#7b2fff', color2: '#00ffcc', mood: 'default' }
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [moodConfig, setMoodConfig] = useState(DEFAULT_MOOD)
  const [error, setError] = useState(null)
  const flashRef = useRef(null)

  const submit = useCallback(async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setSelectedTrack(null)

    // Trigger glitch animation immediately
    flashRef.current?.current?.flash?.()

    // Classify mood and update blob
    const mood = classifyMood(query)
    setMoodConfig(mood)

    try {
      const res = await axios.post(`${API_BASE}/recommend`, null, {
        params: { query: query.trim(), top_k: 5 },
      })
      setResults(res.data)
    } catch (err) {
      setError('Could not reach the server. Is the backend running?')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query])

  return (
    <>
      {/* Three.js full-screen scene */}
      <Scene
        moodConfig={moodConfig}
        results={results}
        onSelectTrack={setSelectedTrack}
        onFlashRef={flashRef}
      />

      {/* UI overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', pointerEvents: 'none',
      }}>
        {/* Wordmark */}
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

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Search form */}
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
              disabled={loading}
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
              disabled={loading || !query.trim()}
              style={{
                background: loading ? 'rgba(123,47,255,0.3)' : 'var(--color-blob-1)',
                border: 'none',
                borderRadius: '40px',
                padding: '8px 20px',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'var(--font-main)',
                fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer',
                transition: 'var(--transition-smooth)',
                boxShadow: loading ? 'none' : '0 0 15px rgba(123,47,255,0.6)',
              }}
            >
              {loading ? '...' : '→'}
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
      </div>

      {/* Result card */}
      {selectedTrack && (
        <ResultCard track={selectedTrack} onClose={() => setSelectedTrack(null)} />
      )}
    </>
  )
}
