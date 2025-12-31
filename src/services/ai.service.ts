import OpenAI from 'openai';
import { Movie } from '../models/movie.model';
import { MemoryVerificationResult } from '../types/ai.types';

export interface MoodVector {
  adrenaline: number;
  melancholy: number;
  joy: number;
  tension: number;
  intellect: number;
  romance: number;
  wonder: number;
  nostalgia: number;
  darkness: number;
  inspiration: number;
}

export class AIService {
  private static client: OpenAI | null = null;

  private static getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set in environment variables');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  /**
   * Analyze a movie using advanced Chain-of-Thought prompting
   * Supports optional enrichment data: director, cast, keywords
   */
  static async analyzeMovie(
    title: string,
    overview?: string,
    director?: string,
    cast?: string[],
    keywords?: string[]
  ): Promise<MoodVector> {
    try {
      const client = this.getClient();

      const systemPrompt = `You are CineTrack's Expert Film Psychologist – a world-class cinema analyst with encyclopedic knowledge of directors, actors, cinematographers, and film theory. Your task is to generate a precise 10-dimensional emotional fingerprint for films.

═══════════════════════════════════════════════════════════════════════════════
SECTION 1: INPUT ENRICHMENT PROTOCOL
═══════════════════════════════════════════════════════════════════════════════

Before scoring, you MUST analyze these contextual signals:

📌 DIRECTOR STYLE: Consider the filmmaker's signature. 
   - David Fincher = clinical tension, desaturated palette → boost Darkness, Tension
   - Wes Anderson = symmetry, whimsy, melancholy nostalgia → boost Wonder, Nostalgia
   - Christopher Nolan = cerebral puzzles, time manipulation → boost Intellect
   - Denis Villeneuve = slow-burn atmosphere, existential weight → boost Tension, Intellect

📌 CAST REPUTATION: Actors carry emotional signatures.
   - Keanu Reeves in action = high Adrenaline
   - Adam Sandler in drama (Uncut Gems) = Tension, Darkness
   - Tom Hanks = warmth, Inspiration
   - Tilda Swinton = avant-garde, Intellect, Wonder

📌 TMDB KEYWORDS: These are explicit tone markers.
   - "surrealism", "dreamlike" → Wonder 75+
   - "dystopia", "post-apocalyptic" → Darkness 70+
   - "coming-of-age" → Nostalgia 60+
   - "revenge", "one-man army" → Adrenaline 80+
   - "slow burn" → Tension 65+, Adrenaline LOW

═══════════════════════════════════════════════════════════════════════════════
SECTION 2: CALIBRATION ANCHORS (Your Scoring North Star)
═══════════════════════════════════════════════════════════════════════════════

Use these films as ABSOLUTE REFERENCE POINTS for the 0-100 scale:

| Dimension    | Score 100 Anchor              | Score 0 Anchor                |
|--------------|-------------------------------|-------------------------------|
| Adrenaline   | Mad Max: Fury Road            | My Dinner with Andre          |
| Tension      | Uncut Gems                    | Paddington                    |
| Melancholy   | Grave of the Fireflies        | The Hangover                  |
| Joy          | Paddington 2                  | Requiem for a Dream           |
| Intellect    | Primer                        | Transformers                  |
| Romance      | Before Sunrise                | John Wick                     |
| Wonder       | Spirited Away                 | 12 Angry Men                  |
| Nostalgia    | Stand By Me                   | Blade Runner 2049             |
| Darkness     | Se7en                         | Frozen                        |
| Inspiration  | Rocky                         | No Country for Old Men        |

═══════════════════════════════════════════════════════════════════════════════
SECTION 3: DIMENSION DEFINITIONS (Precision Criteria)
═══════════════════════════════════════════════════════════════════════════════

1. ADRENALINE (Physical Intensity)
   - 80-100: Non-stop kinetic energy, chases, combat, explosions
   - 20-40: Some action scenes but dialogue-driven
   - 0-20: Static, talky, contemplative
   ⚠️ NOT the same as Tension. Adrenaline = speed/movement. Tension = fear/anxiety.

2. TENSION (Psychological Pressure)  
   - 80-100: Anxiety, dread, survival stakes, ticking clocks (Zodiac, Alien)
   - 20-40: Mild stakes, mostly resolved quickly
   - 0-20: Cozy, safe, predictable
   ⚠️ Slow films CAN have high Tension (A Quiet Place).

3. MELANCHOLY (Emotional Gravity)
   - 80-100: Grief, loss, loneliness, tragedy, tears (Manchester by the Sea)
   - 20-40: Bittersweet moments but overall hopeful
   - 0-20: Purely fun, emotionally shallow
   ⚠️ Different from Darkness. Melancholy = sadness. Darkness = moral grit.

4. JOY (Positive Uplift)
   - 80-100: Laughter, feel-good, cuteness, celebration of life
   - 20-40: Some humor but overall serious
   - 0-20: Bleak, cynical, depressing
   ⚠️ Can coexist with Romance or Wonder.

5. INTELLECT (Cognitive Load)
   - 80-100: Complex plots, philosophy, puzzles, requires focus (Arrival)
   - 20-40: Has themes but accessible
   - 0-20: "Turn off your brain" entertainment
   ⚠️ Confusing ≠ Intellectual. Must be genuinely thought-provoking.

6. ROMANCE (Intimacy Focus)
   - 80-100: Plot driven by love, longing, relationships
   - 20-40: Romantic subplot exists
   - 0-20: Platonic, professional relationships only

7. WONDER (Awe & Imagination)
   - 80-100: Magic, spectacle, vast scale, dream logic (Avatar)
   - 20-40: Some fantastical elements
   - 0-20: Mundane realism, contained settings

8. NOSTALGIA (Past & Memory)
   - 80-100: Memory focus, childhood, retro aesthetics (80s/90s)
   - 20-40: Period setting but not the point
   - 0-20: Ultra-modern or futuristic

9. DARKNESS (Tone & Morality)
   - 80-100: Gritty, corruption, dystopia, moral ambiguity (Joker)
   - 20-40: Some edgy elements
   - 0-20: Wholesome, morally clear
   ⚠️ Different from Tension. Darkness = vibe/setting, not fear.

10. INSPIRATION (Human Spirit)
    - 80-100: Triumph, overcoming odds, personal growth (Hidden Figures)
    - 20-40: Some uplifting moments
    - 0-20: Nihilistic, defeatist, no lesson

═══════════════════════════════════════════════════════════════════════════════
SECTION 4: ANTI-GRAY BLOB RULE (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

🚨 FORBIDDEN: Scores between 40-60 are LAZY and USELESS.

Every film has a PERSONALITY. If you find yourself scoring 45-55, you are:
- Not thinking hard enough
- Defaulting to "safe" averages
- Producing useless data

✅ REQUIRED: At least 4 dimensions must be ≤30 OR ≥70.
✅ REQUIRED: At least 2 dimensions must be ≤20 OR ≥80.

Ask yourself: "What makes THIS film special? What would it score 90+ on?"

═══════════════════════════════════════════════════════════════════════════════
SECTION 5: CHAIN-OF-THOUGHT REASONING (Mandatory)
═══════════════════════════════════════════════════════════════════════════════

Before outputting scores, you MUST explain your reasoning:

1. Identify DOMINANT dimensions (what this film is KNOWN for)
2. Identify ABSENT dimensions (what this film deliberately avoids)
3. Note any DIRECTOR/CAST signals that shift the tone
4. Justify any score above 80 or below 20

═══════════════════════════════════════════════════════════════════════════════
SECTION 6: OUTPUT FORMAT (Strict JSON)
═══════════════════════════════════════════════════════════════════════════════

Return ONLY valid JSON with this exact structure:

{
  "reasoning": {
    "dominant_traits": "string",
    "absent_traits": "string",
    "director_cast_influence": "string",
    "extreme_justification": "string"
  },
  "scores": {
    "adrenaline": number,
    "tension": number,
    "melancholy": number,
    "joy": number,
    "intellect": number,
    "romance": number,
    "wonder": number,
    "nostalgia": number,
    "darkness": number,
    "inspiration": number
  }
}

Do NOT include markdown formatting. Return raw JSON only.`;

      // Build enriched user prompt
      let userPrompt = `Analyze this film:\n\nTitle: ${title}`;
      if (overview) userPrompt += `\nPlot Summary: ${overview}`;
      if (director) userPrompt += `\nDirector: ${director}`;
      if (cast && cast.length > 0) userPrompt += `\nCast: ${cast.slice(0, 5).join(', ')}`;
      if (keywords && keywords.length > 0) userPrompt += `\nTMDB Keywords: ${keywords.slice(0, 10).join(', ')}`;

      userPrompt += `\n\nGenerate the mood vector following ALL rules in the system prompt. Remember: NO gray blob scores (40-60). Be bold and distinctive.`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4 // Slightly higher for more distinctive scores
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);

      // Handle new nested format (reasoning + scores) or legacy flat format
      const scores = parsed.scores || parsed;

      // Log reasoning for debugging (optional: can be stored in DB later)
      if (parsed.reasoning) {
        console.log(`[AI Analysis] ${title} reasoning:`, parsed.reasoning.dominant_traits);
      }

      // Validate and normalize values
      return {
        adrenaline: Math.max(0, Math.min(100, scores.adrenaline || 0)),
        melancholy: Math.max(0, Math.min(100, scores.melancholy || 0)),
        joy: Math.max(0, Math.min(100, scores.joy || 0)),
        tension: Math.max(0, Math.min(100, scores.tension || 0)),
        intellect: Math.max(0, Math.min(100, scores.intellect || 0)),
        romance: Math.max(0, Math.min(100, scores.romance || 0)),
        wonder: Math.max(0, Math.min(100, scores.wonder || 0)),
        nostalgia: Math.max(0, Math.min(100, scores.nostalgia || 0)),
        darkness: Math.max(0, Math.min(100, scores.darkness || 0)),
        inspiration: Math.max(0, Math.min(100, scores.inspiration || 0))
      };
    } catch (error) {
      console.error('OpenAI Analysis Error:', error);
      throw new Error('Failed to analyze movie with AI');
    }
  }

  static async getOrAnalyzeMovie(
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    title: string,
    overview?: string,
    genres?: string[],
    posterPath?: string,
    releaseDate?: string
  ): Promise<MoodVector> {
    // 1. Fast Read (Lean)
    const existingMovie = await Movie.findOne({ tmdbId, mediaType }).lean();

    if (existingMovie && existingMovie.moodVector && existingMovie.aiProcessedAt) {
      return existingMovie.moodVector;
    }

    // 2. Cache miss: Analyze
    console.log(`[AI Service] Analyzing fresh movie: ${title}`);
    const moodVector = await this.analyzeMovie(title, overview);

    // 3. Atomic Upsert (The Fix)
    // Using findOneAndUpdate ensures we don't create duplicates even under race conditions
    try {
      const updatedMovie = await Movie.findOneAndUpdate(
        { tmdbId, mediaType },
        {
          $set: {
            title,
            overview,
            moodVector,
            aiProcessedAt: new Date(),
            // Only update these if they are provided, keeping existing data otherwise
            ...(genres?.length ? { genres } : {}),
            ...(posterPath ? { posterPath } : {}),
            ...(releaseDate ? { releaseDate } : {})
          }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      ).lean();

      return (updatedMovie as any).moodVector || moodVector;
    } catch (dbError) {
      console.error(`[AI Service] Atomic Upsert Failed for ${title}`, dbError);
      // Fallback: Return the moodVector we calculated anyway, so the user isn't blocked.
      return moodVector;
    }
  }

  static async verifyFilmMemory(
    filmTitle: string,
    filmOverview: string,
    userMemory: string
  ): Promise<MemoryVerificationResult> {
    try {
      const client = this.getClient();

      const systemPrompt = `You are a film verification assistant. Given a movie's title and plot summary, determine if a user's memory description indicates they have actually watched the film. Consider:
- Specific plot points, character names, or scenes mentioned
- Emotional reactions that align with the film's themes
- Details that could only be known from watching (not just trailers/marketing)

Return ONLY valid JSON without any markdown formatting.`;

      const userPrompt = `Film Title: ${filmTitle}
Film Plot: ${filmOverview}

User's Memory: "${userMemory}"

Analyze if this user has likely watched the film. Return a JSON object with:
- "watched": boolean (true if they likely watched it, false otherwise)
- "confidence": number from 0-100 (how confident you are in your assessment)
- "reasoning": string (brief explanation of your decision)`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content) as MemoryVerificationResult;

      return {
        watched: Boolean(parsed.watched),
        confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
        reasoning: parsed.reasoning || 'Unable to determine reasoning.'
      };
    } catch (error) {
      console.error('OpenAI Memory Verification Error:', error);
      throw new Error('Failed to verify film memory with AI');
    }
  }

  /**
   * Get AI-curated movie suggestions based on mood description
   * The "Curator" prompt asks OpenAI to suggest movie titles matching a mood
   */
  static async getCuratorSuggestions(
    moodDescription: string,
    count: number = 10
  ): Promise<string[]> {
    try {
      const client = this.getClient();

      const systemPrompt = `You are an expert film curator with encyclopedic knowledge of cinema history.
Your task is to suggest FEATURE FILMS that perfectly match a viewer's mood profile.

CRITICAL RULES:
- Suggest ONLY theatrical feature films (movies released in cinemas or as feature-length films)
- Do NOT suggest TV Series, Mini-series, TV Movies, or Documentaries
- Do NOT suggest anime series or animated TV shows
- Always include a balanced mix of cult classics (pre-2010) and modern hits (2015-present)

Return ONLY a valid JSON object with a "movies" key containing an array of movie titles. No explanations.`;

      const userPrompt = `Suggest exactly ${count} FEATURE FILMS that match this mood profile: "${moodDescription}".

Requirements:
- ONLY theatrical feature films (NO TV series, NO mini-series, NO documentaries)
- Include at least 3 films from before 2010 (classics)
- Include at least 3 films from 2015 or later (modern)
- Focus on quality and relevance to the mood
- Avoid extremely obscure films

Return JSON: {"movies": ["Film 1", "Film 2", ...]}`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7 // Higher temperature for variety
      });

      let content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      console.log('[AI Curator] Raw OpenAI Response:', content);

      // SANITIZATION: Strip markdown code blocks if present (common GPT issue)
      content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

      const parsed = JSON.parse(content);

      // Handle both array format and object with array property
      let titles: string[];
      if (Array.isArray(parsed)) {
        titles = parsed;
      } else if (parsed.movies && Array.isArray(parsed.movies)) {
        titles = parsed.movies;
      } else if (parsed.titles && Array.isArray(parsed.titles)) {
        titles = parsed.titles;
      } else {
        // Try to find any array property
        const arrayProp = Object.values(parsed).find(v => Array.isArray(v));
        titles = (arrayProp as string[]) || [];
      }

      console.log('[AI Curator] Parsed Titles:', titles);


      return titles.slice(0, count);
    } catch (error) {
      console.error('OpenAI Curator Suggestions Error:', error);
      return []; // Return empty array on failure, don't throw
    }
  }

  /**
   * Process imported movies in background to generate moodVectors
   * Called asynchronously after bulk import - fire and forget
   * Rate limited to avoid overwhelming OpenAI API
   */
  static async processImportedMoviesInBackground(
    items: Array<{
      tmdbId: number;
      mediaType: 'movie' | 'tv';
      title: string;
      overview?: string;
    }>
  ): Promise<void> {
    console.log(`[AI Background] Starting to process ${items.length} items for moodVector analysis`);

    const DELAY_BETWEEN_ITEMS_MS = 1000; // 1 second between each AI call
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        // Check if already has moodVector
        const existing = await Movie.findOne({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          moodVector: { $exists: true }
        }).lean();

        if (existing) {
          console.log(`[AI Background] Skipping ${item.title} - already has moodVector`);
          continue;
        }

        // Analyze and save
        console.log(`[AI Background] Analyzing: ${item.title}`);
        await this.getOrAnalyzeMovie(
          item.tmdbId,
          item.mediaType,
          item.title,
          item.overview
        );

        successCount++;

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ITEMS_MS));
      } catch (error) {
        console.error(`[AI Background] Failed to process ${item.title}:`, error);
        errorCount++;
        // Continue with next item even if one fails
      }
    }

    console.log(`[AI Background] Completed. Success: ${successCount}, Errors: ${errorCount}`);
  }
}

