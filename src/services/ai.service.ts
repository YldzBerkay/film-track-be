import OpenAI from 'openai';
import { Movie } from '../models/movie.model';
import { MemoryVerificationResult } from '../types/ai.types';

export interface MoodVector {
  adrenaline: number;
  melancholy: number;
  joy: number;
  tension: number;
  intellect: number;
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

      const systemPrompt = `You are a film analyst. Analyze the movie provided by the user. Rate it on 5 dimensions (adrenaline, melancholy, joy, tension, intellect) from 0 to 100. Return ONLY valid JSON without any markdown formatting or code blocks.`;

      const userPrompt = `Movie Title: ${title}${overview ? `\nSummary: ${overview}` : ''}\n\nAnalyze this movie and return a JSON object with exactly these keys: adrenaline, melancholy, joy, tension, intellect. Each value must be a number between 0 and 100.`;

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
        intellect: Math.max(0, Math.min(100, parsed.intellect || 0))
      };
    } catch (error) {
      console.error('OpenAI Analysis Error:', error);
      throw new Error('Failed to analyze movie with AI');
    }
  }

  static async getOrAnalyzeMovie(tmdbId: number, title: string, overview?: string): Promise<MoodVector> {
    // Check if movie exists in database
    let movie = await Movie.findOne({ tmdbId });

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
      await movie.save();
    } else {
      movie = new Movie({
        tmdbId,
        title,
        overview,
        moodVector,
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
}

