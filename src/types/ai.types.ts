export interface MemoryVerificationResult {
    watched: boolean;
    confidence: number; // 0-100
    reasoning: string;
}

export interface VerifyMemoryRequest {
    filmTitle: string;
    filmOverview: string;
    userMemory: string;
}
