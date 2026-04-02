const MOOD_KEYWORDS = {
  happy: ['happy', 'joy', 'sunshine', 'bright', 'summer', 'upbeat', 'fun', 'dance', 'party', 'celebrate', 'cheerful'],
  sad: ['sad', 'cry', 'lonely', 'melancholy', 'miss', 'heartbreak', 'loss', 'dark', 'rainy', 'grief', 'blue', 'depressed'],
  energetic: ['energy', 'hype', 'pump', 'workout', 'fast', 'rage', 'intense', 'run', 'power', 'adrenaline', 'fire', 'lit'],
  calm: ['chill', 'calm', 'relax', 'peaceful', 'sleep', 'ambient', 'soft', 'gentle', 'slow', 'quiet', 'meditate', 'dreamy'],
}

const MOOD_CONFIG = {
  happy:     { speed: 1.8,  intensity: 1.4, color1: '#ffd700', color2: '#ff6600' },
  sad:       { speed: 0.4,  intensity: 0.5, color1: '#1a237e', color2: '#4a148c' },
  energetic: { speed: 3.0,  intensity: 2.0, color1: '#00ff88', color2: '#ff0080' },
  calm:      { speed: 0.3,  intensity: 0.4, color1: '#00bcd4', color2: '#7b2fff' },
  default:   { speed: 1.0,  intensity: 1.0, color1: '#7b2fff', color2: '#00ffcc' },
}

/**
 * Classify a mood query string into a mood config object.
 * @param {string} query
 * @returns {{ speed: number, intensity: number, color1: string, color2: string, mood: string }}
 */
export function classifyMood(query) {
  const lower = query.toLowerCase()
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return { ...MOOD_CONFIG[mood], mood }
    }
  }
  return { ...MOOD_CONFIG.default, mood: 'default' }
}
