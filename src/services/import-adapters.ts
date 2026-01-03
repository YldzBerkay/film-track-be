export interface ImportItem {
    source: string;
    imdbId?: string;
    title?: string;
    year?: number;
    rating?: number;
    watchedAt?: Date;
    rawType?: string; // 'movie', 'tvEpisode', etc.
}

export interface ImportAdapter {
    parse(row: any): ImportItem | null;
}

// Helper for case-insensitive column lookup
function getColumnValue(row: any, ...possibleNames: string[]): string | undefined {
    const keys = Object.keys(row);
    for (const name of possibleNames) {
        const key = keys.find(k => k.toLowerCase().trim() === name.toLowerCase());
        if (key && row[key]) {
            return row[key].toString().trim();
        }
    }
    return undefined;
}

export class ImdbAdapter implements ImportAdapter {
    parse(row: any): ImportItem | null {
        // IMDB format detection: check for 'Const' column
        const imdbId = getColumnValue(row, 'const', 'tconst', 'id');
        if (!imdbId) return null; // Not an IMDB row if no ID? 
        // Actually user logic was: if (imdbId && imdbId.startsWith('tt'))

        const title = getColumnValue(row, 'title', 'original title', 'name');
        const yearStr = getColumnValue(row, 'year', 'release_year');
        const ratingStr = getColumnValue(row, 'your rating');
        const dateStr = getColumnValue(row, 'date rated');
        const titleType = getColumnValue(row, 'title type');

        // Parse Year
        let year: number | undefined;
        if (yearStr) {
            const y = parseInt(yearStr, 10);
            if (!isNaN(y)) year = y;
        }

        // Parse Rating (1-10)
        let rating: number | undefined;
        if (ratingStr) {
            const r = parseFloat(ratingStr);
            if (!isNaN(r) && r >= 1 && r <= 10) rating = Math.round(r);
        }

        // Parse Date
        let watchedAt: Date | undefined;
        if (dateStr) {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) watchedAt = d;
        }

        return {
            source: 'imdb',
            imdbId,
            title,
            year,
            rating,
            watchedAt,
            rawType: titleType
        };
    }
}

export class LetterboxdAdapter implements ImportAdapter {
    parse(row: any): ImportItem | null {
        // Letterboxd usually has Name, Year, Rating10 (or Rating), WatchedDate
        const name = getColumnValue(row, 'name', 'film');
        if (!name) return null;

        const yearStr = getColumnValue(row, 'year');
        const ratingStr = getColumnValue(row, 'rating'); // 0-5
        const dateStr = getColumnValue(row, 'watched date', 'date');

        let year: number | undefined;
        if (yearStr) {
            const y = parseInt(yearStr, 10);
            if (!isNaN(y)) year = y;
        }

        let rating: number | undefined;
        if (ratingStr) {
            const r = parseFloat(ratingStr);
            // Letterboxd is 0-5. Convert to 1-10.
            if (!isNaN(r)) rating = Math.min(10, Math.max(1, Math.round(r * 2)));
        }

        let watchedAt: Date | undefined;
        if (dateStr) {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) watchedAt = d;
        }

        return {
            source: 'letterboxd',
            title: name,
            year,
            rating,
            watchedAt,
            rawType: 'movie' // Letterboxd is primarily movies
        };
    }
}

export class AdapterFactory {
    static getAdapter(source?: string): ImportAdapter {
        switch (source?.toLowerCase()) {
            case 'letterboxd':
                return new LetterboxdAdapter();
            case 'imdb':
            default:
                // Default to IMDB capability but ideally user specifies
                // Or we can try to detect? 
                // Creating a 'SmartAdapter' that delegates? 
                // For now, default to ImdbAdapter as it handles Generic fields too (in original code)
                return new ImdbAdapter();
        }
    }
}
