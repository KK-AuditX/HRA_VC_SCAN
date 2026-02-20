/**
 * Rate Limiting Service
 * Prevents abuse by limiting action frequency per user
 * Uses sliding window algorithm
 */

import { RateLimitEntry } from '../types';

const RATE_LIMITS_KEY = 'kksmartscan_rate_limits';

// Default rate limits (actions per minute)
export const DEFAULT_RATE_LIMITS: Record<string, number> = {
  'scan': 10,           // 10 scans per minute
  'export': 5,          // 5 exports per minute
  'api_call': 60,       // 60 API calls per minute
  'invite': 10,         // 10 invites per minute
  'login_attempt': 5,   // 5 login attempts per minute
  'password_reset': 3,  // 3 password resets per minute
};

// Window duration in milliseconds
const WINDOW_DURATION = 60 * 1000; // 1 minute

// ==================== RATE LIMIT CHECKING ====================

/**
 * Get all rate limit entries
 */
function getRateLimits(): RateLimitEntry[] {
  try {
    const data = localStorage.getItem(RATE_LIMITS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save rate limit entries
 */
function saveRateLimits(entries: RateLimitEntry[]): void {
  localStorage.setItem(RATE_LIMITS_KEY, JSON.stringify(entries));
}

/**
 * Clean up expired rate limit windows
 */
function cleanupExpired(): void {
  const now = Date.now();
  const entries = getRateLimits().filter(e => e.windowEnd > now);
  saveRateLimits(entries);
}

/**
 * Check if action is rate limited
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  userId: string, 
  action: string,
  customLimit?: number
): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
  cleanupExpired();
  
  const limit = customLimit ?? DEFAULT_RATE_LIMITS[action] ?? 60;
  const now = Date.now();
  const entries = getRateLimits();
  
  // Find existing entry for this user+action
  let entry = entries.find(
    e => e.userId === userId && e.action === action && e.windowEnd > now
  );
  
  if (!entry) {
    // Create new window
    entry = {
      userId,
      action,
      count: 0,
      windowStart: now,
      windowEnd: now + WINDOW_DURATION
    };
    entries.push(entry);
  }
  
  const remaining = Math.max(0, limit - entry.count);
  
  return {
    allowed: entry.count < limit,
    remaining,
    resetAt: entry.windowEnd,
    limit
  };
}

/**
 * Record an action (increment counter)
 * Returns true if action was allowed, false if rate limited
 */
export function recordAction(
  userId: string, 
  action: string,
  customLimit?: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupExpired();
  
  const limit = customLimit ?? DEFAULT_RATE_LIMITS[action] ?? 60;
  const now = Date.now();
  const entries = getRateLimits();
  
  // Find or create entry
  let entry = entries.find(
    e => e.userId === userId && e.action === action && e.windowEnd > now
  );
  
  if (!entry) {
    entry = {
      userId,
      action,
      count: 0,
      windowStart: now,
      windowEnd: now + WINDOW_DURATION
    };
    entries.push(entry);
  }
  
  // Check if allowed
  if (entry.count >= limit) {
    saveRateLimits(entries);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowEnd
    };
  }
  
  // Increment counter
  entry.count++;
  saveRateLimits(entries);
  
  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.windowEnd
  };
}

/**
 * Rate limit decorator for functions
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  userId: string,
  action: string,
  customLimit?: number
): T {
  return (async (...args: Parameters<T>) => {
    const result = recordAction(userId, action, customLimit);
    
    if (!result.allowed) {
      const waitSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      throw new RateLimitError(
        `Rate limit exceeded for ${action}. Try again in ${waitSeconds} seconds.`,
        action,
        result.resetAt
      );
    }
    
    return fn(...args);
  }) as T;
}

/**
 * Custom error for rate limiting
 */
export class RateLimitError extends Error {
  action: string;
  resetAt: number;
  
  constructor(message: string, action: string, resetAt: number) {
    super(message);
    this.name = 'RateLimitError';
    this.action = action;
    this.resetAt = resetAt;
  }
}

// ==================== RATE LIMIT MANAGEMENT ====================

/**
 * Reset rate limit for a specific user+action
 */
export function resetRateLimit(userId: string, action: string): void {
  const entries = getRateLimits().filter(
    e => !(e.userId === userId && e.action === action)
  );
  saveRateLimits(entries);
}

/**
 * Reset all rate limits for a user
 */
export function resetUserRateLimits(userId: string): void {
  const entries = getRateLimits().filter(e => e.userId !== userId);
  saveRateLimits(entries);
}

/**
 * Get current rate limit status for a user
 */
export function getUserRateLimitStatus(userId: string): Record<string, {
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
}> {
  cleanupExpired();
  
  const now = Date.now();
  const entries = getRateLimits().filter(
    e => e.userId === userId && e.windowEnd > now
  );
  
  const status: Record<string, {
    count: number;
    limit: number;
    remaining: number;
    resetAt: number;
  }> = {};
  
  for (const entry of entries) {
    const limit = DEFAULT_RATE_LIMITS[entry.action] ?? 60;
    status[entry.action] = {
      count: entry.count,
      limit,
      remaining: Math.max(0, limit - entry.count),
      resetAt: entry.windowEnd
    };
  }
  
  return status;
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats(): {
  activeWindows: number;
  blockedActions: number;
  topUsers: { userId: string; totalActions: number }[];
} {
  cleanupExpired();
  
  const now = Date.now();
  const entries = getRateLimits().filter(e => e.windowEnd > now);
  
  let blockedActions = 0;
  const userActions: Record<string, number> = {};
  
  for (const entry of entries) {
    const limit = DEFAULT_RATE_LIMITS[entry.action] ?? 60;
    if (entry.count >= limit) blockedActions++;
    
    userActions[entry.userId] = (userActions[entry.userId] || 0) + entry.count;
  }
  
  const topUsers = Object.entries(userActions)
    .map(([userId, totalActions]) => ({ userId, totalActions }))
    .sort((a, b) => b.totalActions - a.totalActions)
    .slice(0, 10);
  
  return {
    activeWindows: entries.length,
    blockedActions,
    topUsers
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Format remaining time until reset
 */
export function formatResetTime(resetAt: number): string {
  const seconds = Math.ceil((resetAt - Date.now()) / 1000);
  
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Create a rate limiter for specific actions
 */
export function createRateLimiter(
  userId: string,
  limits: Record<string, number> = DEFAULT_RATE_LIMITS
) {
  return {
    check: (action: string) => checkRateLimit(userId, action, limits[action]),
    record: (action: string) => recordAction(userId, action, limits[action]),
    reset: (action: string) => resetRateLimit(userId, action),
    resetAll: () => resetUserRateLimits(userId),
    status: () => getUserRateLimitStatus(userId)
  };
}
