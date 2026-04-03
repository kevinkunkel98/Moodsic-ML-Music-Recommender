import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'
import ResultCard from './ResultCard'
import ResultsList from './ResultsList'
import { classifyMood } from './moodClassifier'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function App() {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('idle') // 'idle' | 'loading' | 'revealing' | 'done'
  const [results, setResults] = useState([])
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [moodConfig, setMoodConfig] = useState(null)
  const [error, setError] = useState(null)
  const doneTimerRef = useRef(null)

  // Clear done-transition timer on unmount
  useEffect(() => {
    return () => clearTimeout(doneTimerRef.current)
  }, [])

  const submit = useCallback(async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    clearTimeout(doneTimerRef.current)
    setPhase('loading')
    setError(null)
    setSelectedTrack(null)
    setResults([])

    const mood = classifyMood(query)
    setMoodConfig(mood)

    try {
      const res = await axios.post(`${API_BASE}/recommend`, null, {
        params: { query: query.trim(), top_k: 5 },
      })
      setResults(res.data)
      setPhase('revealing')
      // Transition to done after reveal animation completes (~1.5s for all cards)
      doneTimerRef.current = setTimeout(() => setPhase('done'), 1600)
    } catch (err) {
      setError('Could not reach the server. Is the backend running?')
      setResults([])
      setPhase('idle')
    }
  }, [query])

  return (
    <>
      {/* VHS background noise bands */}
      <div className="vhs-bg" />

      <div className="app">
        {/* Header */}
        <h1 className="app-title">MOODSIC</h1>

        {/* Status bar */}
        <div className="status-bar">
          <span className="rec-badge">▶ REC ●</span>
          <span>
            {phase === 'loading'
              ? 'SCANNING'
              : 'SP · HiFi STEREO · 00:00:00'}
          </span>
        </div>

        {/* Mood input — visible in idle and done phases */}
        {(phase === 'idle' || phase === 'done') && (
          <form className="mood-form" onSubmit={submit}>
            <input
              type="text"
              className="mood-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="enter your mood..."
              autoFocus
            />
            <button
              type="submit"
              className="scan-btn"
              disabled={!query.trim()}
            >
              [ SCAN MOOD ]
            </button>
            {error && <p className="error-msg">{error}</p>}
          </form>
        )}

        {/* Loading state */}
        {phase === 'loading' && (
          <>
            <div className="scan-progress" />
            <p className="loading-status">▶ SCANNING</p>
          </>
        )}

        {/* Mood result */}
        {(phase === 'revealing' || phase === 'done') && moodConfig && (
          <div className="mood-result">
            <div className="mood-result-label">MOOD DETECTED //</div>
            <div className="mood-result-word">{moodConfig.mood}</div>
          </div>
        )}

        {/* Track list */}
        <ResultsList
          tracks={results}
          visible={phase === 'revealing' || phase === 'done'}
          onSelect={setSelectedTrack}
        />
      </div>

      {/* Detail card */}
      {selectedTrack && (
        <ResultCard track={selectedTrack} onClose={() => setSelectedTrack(null)} />
      )}
    </>
  )
}
