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

  static async analyzeMovie(title: string, overview?: string): Promise<MoodVector> {
    try {
      const client = this.getClient();

      const systemPrompt = `You are an expert film psychologist specializing in emotional impact analysis. 
Analyze the movie provided considering genre conventions, directorial tone, character arcs, and thematic weight.

Rate on 10 dimensions (0-100):
1. Adrenaline: Action intensity, excitement peaks
2. Melancholy: Sadness depth, emotional gravity  
3. Joy: Happiness, comedic relief, feel-good factor
4. Tension: Suspense buildup, anxiety induction
5. Intellect: Thought provocation, complexity
6. Romance: Love themes, relationship focus
7. Wonder: Awe, fantasy escapism, visual spectacle
8. Nostalgia: Period authenticity, memory triggers
9. Darkness: Moral ambiguity, noir elements, dystopia
10. Inspiration: Motivational impact, triumph themes

Return ONLY valid JSON without any markdown formatting.`;

      const userPrompt = `Movie Title: ${title}${overview ? `\nSummary: ${overview}` : ''}\n\nAnalyze this movie and return a JSON object with exactly these keys: adrenaline, melancholy, joy, tension, intellect, romance, wonder, nostalgia, darkness, inspiration. Each value must be a number between 0 and 100.`;

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

      const parsed = JSON.parse(content) as MoodVector;

      // Validate and normalize values
      return {
        adrenaline: Math.max(0, Math.min(100, parsed.adrenaline || 0)),
        melancholy: Math.max(0, Math.min(100, parsed.melancholy || 0)),
        joy: Math.max(0, Math.min(100, parsed.joy || 0)),
        tension: Math.max(0, Math.min(100, parsed.tension || 0)),
        intellect: Math.max(0, Math.min(100, parsed.intellect || 0)),
        romance: Math.max(0, Math.min(100, parsed.romance || 0)),
        wonder: Math.max(0, Math.min(100, parsed.wonder || 0)),
        nostalgia: Math.max(0, Math.min(100, parsed.nostalgia || 0)),
        darkness: Math.max(0, Math.min(100, parsed.darkness || 0)),
        inspiration: Math.max(0, Math.min(100, parsed.inspiration || 0))
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
    // Check if movie exists in database
    let movie = await Movie.findOne({ tmdbId, mediaType });

    if (movie && movie.moodVector && movie.aiProcessedAt) {
      // Return cached mood vector
      return movie.moodVector;
    }

    // Analyze with AI
    const moodVector = await this.analyzeMovie(title, overview);

    // Save to database
    if (movie) {
      movie.moodVector = moodVector;
      movie.aiProcessedAt = new Date();
      // Update genres if provided and missing
      if (genres && genres.length > 0 && (!movie.genres || movie.genres.length === 0)) {
        movie.genres = genres;
      }
      // Update posterPath if provided and missing
      if (posterPath && !movie.posterPath) {
        movie.posterPath = posterPath;
      }
      // Update releaseDate if provided and missing
      if (releaseDate && !movie.releaseDate) {
        movie.releaseDate = releaseDate;
      }
      await movie.save();
    } else {
      movie = new Movie({
        tmdbId,
        mediaType,
        title,
        overview,
        moodVector,
        genres: genres || [],
        posterPath: posterPath || '',
        releaseDate: releaseDate || '',
        aiProcessedAt: new Date()
      });
      await movie.save();
    }

    return moodVector;
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

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      console.log('[AI Curator] Raw OpenAI Response:', content);

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
}

