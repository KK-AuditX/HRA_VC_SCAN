/**
 * Session Security Service
 * Auto-lock, sudo mode, and enhanced session protection
 */

// ==================== TYPES ====================

export interface SecurityConfig {
  autoLockTimeout: number; // ms until auto-lock
  sudoModeDuration: number; // ms sudo mode stays active
  maxFailedAttempts: number;
  lockoutDuration: number; // ms to lockout after max failures
  requireSudoFor: SudoRequiredAction[];
}

export type SudoRequiredAction = 
  | 'bulk_delete'
  | 'export_all'
  | 'user_management'
  | 'backup_restore'
  | 'settings_change'
  | 'role_change';

export interface SecurityState {
  isLocked: boolean;
  lockedAt: number | null;
  sudoModeActive: boolean;
  sudoModeExpires: number | null;
  failedAttempts: number;
  lockoutUntil: number | null;
  lastActivity: number;
}

// ==================== STORAGE ====================

const SECURITY_STATE_KEY = 'kksmartscan_security_state';
const SECURITY_CONFIG_KEY = 'kksmartscan_security_config';
const SECURITY_PIN_KEY = 'kksmartscan_security_pin';

const DEFAULT_CONFIG: SecurityConfig = {
  autoLockTimeout: 5 * 60 * 1000, // 5 minutes
  sudoModeDuration: 15 * 60 * 1000, // 15 minutes
  maxFailedAttempts: 5,
  lockoutDuration: 30 * 60 * 1000, // 30 minutes
  requireSudoFor: ['bulk_delete', 'export_all', 'user_management', 'backup_restore', 'role_change']
};

function getSecurityState(): SecurityState {
  try {
    const stored = localStorage.getItem(SECURITY_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {
    isLocked: false,
    lockedAt: null,
    sudoModeActive: false,
    sudoModeExpires: null,
    failedAttempts: 0,
    lockoutUntil: null,
    lastActivity: Date.now()
  };
}

function saveSecurityState(state: SecurityState): void {
  localStorage.setItem(SECURITY_STATE_KEY, JSON.stringify(state));
}

export function getSecurityConfig(): SecurityConfig {
  try {
    const stored = localStorage.getItem(SECURITY_CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_CONFIG;
}

export function updateSecurityConfig(updates: Partial<SecurityConfig>): SecurityConfig {
  const current = getSecurityConfig();
  const updated = { ...current, ...updates };
  localStorage.setItem(SECURITY_CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

// ==================== AUTO-LOCK ====================

let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
let activityListeners: (() => void)[] = [];

/**
 * Record user activity to reset auto-lock timer
 */
export function recordActivity(): void {
  const state = getSecurityState();
  state.lastActivity = Date.now();
  saveSecurityState(state);
  
  // Reset auto-lock timer
  resetAutoLockTimer();
}

/**
 * Start auto-lock monitoring
 */
export function startAutoLockMonitor(onLock: () => void): () => void {
  const config = getSecurityConfig();
  
  const handleActivity = () => {
    recordActivity();
  };
  
  // Listen for user activity
  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  events.forEach(event => {
    document.addEventListener(event, handleActivity, { passive: true });
  });
  
  // Store lock callback
  activityListeners.push(onLock);
  
  // Start timer
  resetAutoLockTimer();
  
  // Return cleanup function
  return () => {
    events.forEach(event => {
      document.removeEventListener(event, handleActivity);
    });
    activityListeners = activityListeners.filter(l => l !== onLock);
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }
  };
}

function resetAutoLockTimer(): void {
  const config = getSecurityConfig();
  
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
  }
  
  autoLockTimer = setTimeout(() => {
    lockScreen();
    activityListeners.forEach(listener => listener());
  }, config.autoLockTimeout);
}

/**
 * Lock the screen
 */
export function lockScreen(): void {
  const state = getSecurityState();
  state.isLocked = true;
  state.lockedAt = Date.now();
  saveSecurityState(state);
}

/**
 * Unlock the screen (requires re-authentication)
 */
export function unlockScreen(pin?: string): { success: boolean; error?: string } {
  const state = getSecurityState();
  const config = getSecurityConfig();
  
  // Check lockout
  if (state.lockoutUntil && Date.now() < state.lockoutUntil) {
    const remaining = Math.ceil((state.lockoutUntil - Date.now()) / 60000);
    return { 
      success: false, 
      error: `Account locked. Try again in ${remaining} minutes.` 
    };
  }
  
  // Validate PIN if one is set
  const storedPin = localStorage.getItem(SECURITY_PIN_KEY);
  if (storedPin) {
    if (!pin) {
      return { success: false, error: 'PIN required' };
    }
    if (pin !== storedPin) {
      const result = recordFailedUnlock();
      if (result.locked) {
        return { success: false, error: 'Too many failed attempts. Account locked.' };
      }
      return { success: false, error: `Invalid PIN. ${result.attemptsRemaining} attempts remaining.` };
    }
  }
  
  // Successfully unlocked
  state.isLocked = false;
  state.lockedAt = null;
  state.failedAttempts = 0;
  state.lockoutUntil = null;
  state.lastActivity = Date.now();
  saveSecurityState(state);
  
  resetAutoLockTimer();
  
  return { success: true };
}

/**
 * Record failed unlock attempt
 */
export function recordFailedUnlock(): { locked: boolean; attemptsRemaining: number } {
  const state = getSecurityState();
  const config = getSecurityConfig();
  
  state.failedAttempts++;
  
  if (state.failedAttempts >= config.maxFailedAttempts) {
    state.lockoutUntil = Date.now() + config.lockoutDuration;
    saveSecurityState(state);
    return { locked: true, attemptsRemaining: 0 };
  }
  
  saveSecurityState(state);
  return { 
    locked: false, 
    attemptsRemaining: config.maxFailedAttempts - state.failedAttempts 
  };
}

/**
 * Check if screen is locked
 */
export function isScreenLocked(): boolean {
  const state = getSecurityState();
  return state.isLocked;
}

// ==================== PIN MANAGEMENT ====================

/**
 * Set or update unlock PIN
 */
export function setSecurityPin(pin: string): { success: boolean; error?: string } {
  if (!pin || pin.length < 4) {
    return { success: false, error: 'PIN must be at least 4 characters' };
  }
  localStorage.setItem(SECURITY_PIN_KEY, pin);
  return { success: true };
}

/**
 * Remove unlock PIN
 */
export function removeSecurityPin(): void {
  localStorage.removeItem(SECURITY_PIN_KEY);
}

/**
 * Check if PIN is set
 */
export function hasSecurityPin(): boolean {
  return !!localStorage.getItem(SECURITY_PIN_KEY);
}

// ==================== SUDO MODE ====================

/**
 * Activate sudo mode for sensitive operations
 */
export function activateSudoMode(): void {
  const state = getSecurityState();
  const config = getSecurityConfig();
  
  state.sudoModeActive = true;
  state.sudoModeExpires = Date.now() + config.sudoModeDuration;
  saveSecurityState(state);
}

/**
 * Deactivate sudo mode
 */
export function deactivateSudoMode(): void {
  const state = getSecurityState();
  state.sudoModeActive = false;
  state.sudoModeExpires = null;
  saveSecurityState(state);
}

/**
 * Check if sudo mode is currently active
 */
export function isSudoModeActive(): boolean {
  const state = getSecurityState();
  
  if (!state.sudoModeActive) return false;
  
  // Check if expired
  if (state.sudoModeExpires && Date.now() > state.sudoModeExpires) {
    deactivateSudoMode();
    return false;
  }
  
  return true;
}

/**
 * Get remaining sudo mode time in seconds
 */
export function getSudoTimeRemaining(): number {
  const state = getSecurityState();
  
  if (!state.sudoModeActive || !state.sudoModeExpires) return 0;
  
  const remaining = state.sudoModeExpires - Date.now();
  return Math.max(0, Math.floor(remaining / 1000));
}

/**
 * Check if an action requires sudo mode
 */
export function requiresSudo(action: SudoRequiredAction): boolean {
  const config = getSecurityConfig();
  return config.requireSudoFor.includes(action);
}

/**
 * Check if an action can be performed (has sudo if required)
 */
export function canPerformAction(action: SudoRequiredAction): { 
  allowed: boolean; 
  requiresSudo: boolean;
  sudoActive: boolean;
} {
  const needsSudo = requiresSudo(action);
  const sudoActive = isSudoModeActive();
  
  return {
    allowed: !needsSudo || sudoActive,
    requiresSudo: needsSudo,
    sudoActive
  };
}

// ==================== SECURITY STATUS ====================

export interface SecurityStatus {
  isLocked: boolean;
  sudoModeActive: boolean;
  sudoTimeRemaining: number;
  lockoutActive: boolean;
  lockoutRemaining: number;
  lastActivity: number;
  timeSinceActivity: number;
  autoLockIn: number;
}

export function getSecurityStatus(): SecurityStatus {
  const state = getSecurityState();
  const config = getSecurityConfig();
  const now = Date.now();
  
  const timeSinceActivity = now - state.lastActivity;
  const autoLockIn = Math.max(0, config.autoLockTimeout - timeSinceActivity);
  
  let lockoutRemaining = 0;
  if (state.lockoutUntil && now < state.lockoutUntil) {
    lockoutRemaining = Math.ceil((state.lockoutUntil - now) / 1000);
  }
  
  return {
    isLocked: state.isLocked,
    sudoModeActive: isSudoModeActive(),
    sudoTimeRemaining: getSudoTimeRemaining(),
    lockoutActive: lockoutRemaining > 0,
    lockoutRemaining,
    lastActivity: state.lastActivity,
    timeSinceActivity,
    autoLockIn: Math.ceil(autoLockIn / 1000)
  };
}

// ==================== RESET ====================

/**
 * Reset all security state (use with caution)
 */
export function resetSecurityState(): void {
  localStorage.removeItem(SECURITY_STATE_KEY);
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}
