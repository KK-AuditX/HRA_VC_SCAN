
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult } from "../types";
import { processImage, hashImage, isPDF, getBase64Size } from "../utils/imageProcessor";
import { getCachedExtraction, setCachedExtraction } from "./database";
import { normalizeContactFields } from "../utils/validators";

// Get API key with fallback and validation
function getApiKey(): string {
  // Try different ways to get the API key (Vite injects as process.env)
  const apiKey = process.env.API_KEY || 
                 process.env.GEMINI_API_KEY || 
                 (typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) ||
                 '';
  
  if (!apiKey) {
    console.error('[Gemini] API key not found. Please set GEMINI_API_KEY in your .env file');
  }
  
  return apiKey;
}

let ai: GoogleGenAI | null = null;

function getAIInstance(): GoogleGenAI {
  if (!ai) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Please add GEMINI_API_KEY to your .env file.');
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000, // 1 second
  MAX_RETRY_DELAY: 10000,    // 10 seconds
  CACHE_ENABLED: true,
  IMAGE_COMPRESSION_ENABLED: true,
  MAX_IMAGE_SIZE: 800 * 1024, // 800KB threshold for compression
};

export interface ExtractionStats {
  cached: boolean;
  compressed: boolean;
  originalSize: number;
  processedSize: number;
  processingTime: number;
  retries: number;
}

/**
 * Sleep for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function getRetryDelay(attempt: number): number {
  const baseDelay = CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
  return Math.min(baseDelay + jitter, CONFIG.MAX_RETRY_DELAY);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // These errors should NOT be retried
    if (
      message.includes('api key') ||
      message.includes('invalid key') ||
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('not configured')
    ) {
      return false;
    }
    
    // These errors CAN be retried
    return (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('503') ||
      message.includes('429') ||
      message.includes('500') ||
      message.includes('econnreset') ||
      message.includes('socket') ||
      message.includes('temporarily')
    );
  }
  return false;
}

/**
 * Extracts multiple contact identities from a document (Image or PDF).
 * Features:
 * - Image compression to reduce token usage
 * - Hash-based caching to skip AI for duplicate images
 * - Exponential backoff retry logic
 * - Client-side normalization post-processing
 */
export async function extractContactFromDocument(
  base64Data: string, 
  mimeType: string
): Promise<ExtractionResult[]> {
  const startTime = Date.now();
  const stats: ExtractionStats = {
    cached: false,
    compressed: false,
    originalSize: getBase64Size(base64Data),
    processedSize: 0,
    processingTime: 0,
    retries: 0
  };

  let processedBase64 = base64Data;
  let processedMimeType = mimeType;

  // Step 1: Check cache first (saves 100% tokens if hit)
  if (CONFIG.CACHE_ENABLED && !isPDF(mimeType)) {
    try {
      const imageHash = await hashImage(base64Data);
      const cachedResults = await getCachedExtraction(imageHash);
      
      if (cachedResults) {
        console.log(`[AI Optimizer] Cache HIT - Saved ${stats.originalSize} bytes of AI processing`);
        stats.cached = true;
        stats.processingTime = Date.now() - startTime;
        return cachedResults;
      }
    } catch (e) {
      console.warn('[AI Optimizer] Cache check failed:', e);
    }
  }

  // Step 2: Compress image if needed (saves ~40-60% tokens)
  if (CONFIG.IMAGE_COMPRESSION_ENABLED && !isPDF(mimeType)) {
    if (stats.originalSize > CONFIG.MAX_IMAGE_SIZE) {
      try {
        const processed = await processImage(base64Data, {
          maxWidth: 1200,
          maxHeight: 1600,
          quality: 0.85
        });
        processedBase64 = processed.base64;
        processedMimeType = 'image/jpeg';
        stats.compressed = true;
        stats.processedSize = processed.compressedSize;
        
        console.log(`[AI Optimizer] Image compressed: ${stats.originalSize} -> ${stats.processedSize} bytes (${Math.round(processed.compressionRatio * 100)}%)`);
      } catch (e) {
        console.warn('[AI Optimizer] Compression failed, using original:', e);
        processedBase64 = base64Data;
        stats.processedSize = stats.originalSize;
      }
    } else {
      stats.processedSize = stats.originalSize;
    }
  } else {
    stats.processedSize = stats.originalSize;
  }

  // Step 3: Call AI with retry logic
  const results = await callAIWithRetry(processedBase64, processedMimeType, stats);

  // Step 4: Apply client-side normalization (no AI needed)
  const normalizedResults = results.map(result => {
    const normalized = normalizeContactFields(result);
    return {
      ...result,
      ...normalized
    };
  });

  // Step 5: Cache the results
  if (CONFIG.CACHE_ENABLED && !isPDF(mimeType) && normalizedResults.length > 0) {
    try {
      const imageHash = await hashImage(base64Data);
      await setCachedExtraction(imageHash, normalizedResults);
      console.log('[AI Optimizer] Results cached for future use');
    } catch (e) {
      console.warn('[AI Optimizer] Caching failed:', e);
    }
  }

  stats.processingTime = Date.now() - startTime;
  console.log(`[AI Optimizer] Extraction complete in ${stats.processingTime}ms, ${stats.retries} retries`);

  return normalizedResults;
}

/**
 * Call AI API with exponential backoff retry
 */
async function callAIWithRetry(
  base64Data: string,
  mimeType: string,
  stats: ExtractionStats
): Promise<ExtractionResult[]> {
  const model = "gemini-2.0-flash";
  
  // Simplified prompt - let schema do the heavy lifting
  const prompt = `Extract ALL business card contacts from this document.
For each card found, extract: name, company, title, phone numbers, emails, website, address, pincode, industry.
Industry must be one of: Technology, Finance, Healthcare, Creative, Legal, Real Estate, Manufacturing, Other.
Return empty string for missing fields. Do NOT guess or fabricate data.`;

  const cleanMimeType = mimeType.includes('pdf') ? 'application/pdf' : 'image/jpeg';
  const cleanBase64 = base64Data.split(',')[1] || base64Data;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const aiInstance = getAIInstance();
      const response = await aiInstance.models.generateContent({
        model,
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: cleanBase64
              }
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "Extracted business cards",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                firmName: { type: Type.STRING },
                jobTitle: { type: Type.STRING },
                phone: { type: Type.STRING },
                phone2: { type: Type.STRING },
                email: { type: Type.STRING },
                email2: { type: Type.STRING },
                website: { type: Type.STRING },
                address: { type: Type.STRING },
                pincode: { type: Type.STRING },
                notes: { type: Type.STRING },
                industry: { type: Type.STRING }
              },
              required: ["name"]
            }
          }
        }
      });

      const text = response.text || "[]";
      console.log('[AI Optimizer] Raw response:', text.substring(0, 200));
      
      let results;
      try {
        results = JSON.parse(text);
      } catch (parseError) {
        console.error('[AI Optimizer] JSON parse error:', parseError, 'Raw text:', text);
        // Try to extract JSON from response if it contains extra text
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          results = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse AI response as JSON');
        }
      }
      
      return Array.isArray(results) ? results : [results];

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      stats.retries = attempt + 1;

      if (attempt < CONFIG.MAX_RETRIES && isRetryableError(error)) {
        const delay = getRetryDelay(attempt);
        console.warn(`[AI Optimizer] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  console.error('[AI Optimizer] All retries exhausted:', lastError);
  throw new Error(`Extraction failed after ${CONFIG.MAX_RETRIES} retries: ${lastError?.message}`);
}

/**
 * Get current AI optimization configuration
 */
export function getAIConfig() {
  return { ...CONFIG };
}

/**
 * Update AI optimization configuration
 */
export function updateAIConfig(updates: Partial<typeof CONFIG>) {
  Object.assign(CONFIG, updates);
}
/**
 * Check if Gemini API is properly configured
 */
export function isGeminiConfigured(): { configured: boolean; message: string } {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      configured: false,
      message: 'Gemini API key not found. Please add GEMINI_API_KEY to your .env file and restart the app.'
    };
  }
  
  if (apiKey.length < 20) {
    return {
      configured: false,
      message: 'Gemini API key appears invalid. Please verify your API key.'
    };
  }
  
  return {
    configured: true,
    message: 'Gemini API is configured.'
  };
}