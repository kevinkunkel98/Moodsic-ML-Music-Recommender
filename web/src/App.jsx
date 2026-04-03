import React, { useState } from 'react'
import axios from 'axios'

export default function App() {
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(3)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post('http://127.0.0.1:8000/recommend', null, {
        params: { query, top_k: topK },
      })
      setResults(res.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-semibold mb-4">Moodsic — Recommend</h1>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Query</label>
            <textarea
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"
              placeholder="Paste parameters or writing sample here"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Top K</label>
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="mt-1 block w-32 rounded-md border-gray-300 p-2"
              min={1}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 text-white rounded-md"
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Send'}
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-gray-100 rounded-md"
              onClick={() => {
                setQuery('')
                setResults(null)
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="mt-6">
          {error && <div className="text-red-600">Error: {error}</div>}

          {results && (
            <div>
              <h2 className="font-semibold mb-2">Results</h2>
              <ul className="space-y-2">
                {results.map((r, i) => (
                  <li key={i} className="p-2 border rounded">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-sm text-slate-600">Score: {r.score}</div>
                    {r.spotify_url && (
                      <a href={r.spotify_url} className="text-blue-600 text-sm" target="_blank" rel="noreferrer">
                        Open on Spotify
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
