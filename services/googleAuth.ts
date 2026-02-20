/**
 * Google OAuth Authentication Service
 * Uses Google Identity Services (GIS) for secure authentication
 * Handles token management, session, and user validation
 */

import { AppUser, Session, AccessStatus, UserRole } from '../types';

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const TOKEN_STORAGE_KEY = 'kksmartscan_auth_token';
const USER_STORAGE_KEY = 'kksmartscan_user';
const SESSION_STORAGE_KEY = 'kksmartscan_session';

// Token expiry buffer (refresh 5 minutes before expiry)
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
}

// Singleton for Google client
let googleClient: google.accounts.oauth2.TokenClient | null = null;
let authStateListeners: ((state: AuthState) => void)[] = [];
let currentAuthState: AuthState = {
  isAuthenticated: false,
  user: null,
  session: null,
  isLoading: true,
  error: null
};

/**
 * Initialize Google OAuth client
 */
export function initGoogleAuth(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      console.warn('[Auth] No Google Client ID configured. Auth features disabled.');
      updateAuthState({ isLoading: false });
      resolve();
      return;
    }

    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      try {
        googleClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid email profile',
          callback: handleTokenResponse,
        });
        
        // Try to restore session
        restoreSession().then(() => {
          resolve();
        });
      } catch (error) {
        console.error('[Auth] Failed to initialize Google Auth:', error);
        updateAuthState({ isLoading: false, error: 'Failed to initialize authentication' });
        reject(error);
      }
    };
    
    script.onerror = () => {
      console.error('[Auth] Failed to load Google Identity Services');
      updateAuthState({ isLoading: false, error: 'Failed to load authentication' });
      reject(new Error('Failed to load Google Identity Services'));
    };
    
    document.head.appendChild(script);
  });
}

/**
 * Handle token response from Google
 */
async function handleTokenResponse(response: GoogleTokenResponse) {
  try {
    updateAuthState({ isLoading: true, error: null });
    
    // Fetch user info from Google
    const userInfo = await fetchGoogleUserInfo(response.access_token);
    
    // Create or get existing user
    const user = await getOrCreateUser(userInfo, response);
    
    // Create session
    const session = createSession(user, response);
    
    // Store auth data
    storeAuthData(user, session, response.access_token);
    
    // Update state
    updateAuthState({
      isAuthenticated: true,
      user,
      session,
      isLoading: false,
      error: null
    });
    
    console.log('[Auth] Successfully authenticated:', user.email);
  } catch (error) {
    console.error('[Auth] Token handling failed:', error);
    updateAuthState({
      isAuthenticated: false,
      user: null,
      session: null,
      isLoading: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Fetch user info from Google API
 */
async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }
  
  return response.json();
}

/**
 * Get or create user from Google user info
 */
async function getOrCreateUser(
  googleUser: GoogleUserInfo, 
  tokenResponse: GoogleTokenResponse
): Promise<AppUser> {
  // Check if user exists in storage
  const existingUsers = getStoredUsers();
  let user = existingUsers.find(u => u.email === googleUser.email);
  
  if (user) {
    // Update existing user
    user.lastLoginAt = Date.now();
    user.accessToken = tokenResponse.access_token;
    user.tokenExpiresAt = Date.now() + (tokenResponse.expires_in * 1000);
    user.picture = googleUser.picture;
    user.name = googleUser.name;
  } else {
    // Create new user
    const isFirstUser = existingUsers.length === 0;
    user = {
      id: `user_${crypto.randomUUID()}`,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      role: isFirstUser ? 'owner' : 'viewer', // First user is owner
      status: isFirstUser ? 'approved' : 'pending', // First user auto-approved
      accessToken: tokenResponse.access_token,
      tokenExpiresAt: Date.now() + (tokenResponse.expires_in * 1000),
      createdAt: Date.now(),
      lastLoginAt: Date.now()
    };
    
    existingUsers.push(user);
  }
  
  // Save users
  saveStoredUsers(existingUsers);
  
  return user;
}

/**
 * Create a new session
 */
function createSession(user: AppUser, tokenResponse: GoogleTokenResponse): Session {
  const session: Session = {
    id: `session_${crypto.randomUUID()}`,
    userId: user.id,
    token: tokenResponse.access_token,
    deviceInfo: navigator.userAgent,
    ipAddress: 'client', // Would be set by server in production
    createdAt: Date.now(),
    expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
    lastActiveAt: Date.now(),
    isActive: true
  };
  
  // Store session
  const sessions = getStoredSessions();
  
  // Invalidate other sessions for this user (single session mode)
  sessions.forEach(s => {
    if (s.userId === user.id) {
      s.isActive = false;
    }
  });
  
  sessions.push(session);
  saveStoredSessions(sessions);
  
  return session;
}

/**
 * Sign in with Google
 */
export function signIn(): void {
  if (!googleClient) {
    console.error('[Auth] Google client not initialized');
    updateAuthState({ error: 'Authentication not available' });
    return;
  }
  
  googleClient.requestAccessToken();
}

/**
 * Sign out
 */
export function signOut(): void {
  const currentUser = currentAuthState.user;
  const currentSession = currentAuthState.session;
  
  // Revoke Google token
  if (currentUser?.accessToken) {
    google.accounts.oauth2.revoke(currentUser.accessToken, () => {
      console.log('[Auth] Token revoked');
    });
  }
  
  // Mark session as inactive
  if (currentSession) {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === currentSession.id);
    if (session) {
      session.isActive = false;
      saveStoredSessions(sessions);
    }
  }
  
  // Clear stored auth data
  clearAuthData();
  
  // Update state
  updateAuthState({
    isAuthenticated: false,
    user: null,
    session: null,
    isLoading: false,
    error: null
  });
  
  console.log('[Auth] Signed out');
}

/**
 * Restore session from storage
 * @returns Session if valid, null otherwise
 */
export async function restoreSession(): Promise<Session | null> {
  try {
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    
    if (!storedUser || !storedSession || !storedToken) {
      updateAuthState({ isLoading: false });
      return null;
    }
    
    const user: AppUser = JSON.parse(storedUser);
    const session: Session = JSON.parse(storedSession);
    
    // Check if session is expired
    if (session.expiresAt < Date.now()) {
      console.log('[Auth] Session expired');
      clearAuthData();
      updateAuthState({ isLoading: false });
      return null;
    }
    
    // Check if user is still approved
    if (user.status !== 'approved') {
      console.log('[Auth] User not approved');
      clearAuthData();
      updateAuthState({ isLoading: false });
      return null;
    }
    
    // Validate token with Google
    const isValid = await validateToken(storedToken);
    if (!isValid) {
      console.log('[Auth] Token invalid');
      clearAuthData();
      updateAuthState({ isLoading: false });
      return null;
    }
    
    // Update session activity
    session.lastActiveAt = Date.now();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    
    // Restore auth state
    updateAuthState({
      isAuthenticated: true,
      user,
      session,
      isLoading: false,
      error: null
    });
    
    console.log('[Auth] Session restored for:', user.email);
    return session;
  } catch (error) {
    console.error('[Auth] Failed to restore session:', error);
    clearAuthData();
    updateAuthState({ isLoading: false });
    return null;
  }
}

/**
 * Validate token with Google
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if token needs refresh
 */
export function shouldRefreshToken(): boolean {
  const user = currentAuthState.user;
  if (!user?.tokenExpiresAt) return false;
  
  return user.tokenExpiresAt - Date.now() < TOKEN_REFRESH_BUFFER;
}

/**
 * Refresh token
 */
export function refreshToken(): void {
  if (googleClient) {
    googleClient.requestAccessToken({ prompt: '' });
  }
}

// ==================== STORAGE HELPERS ====================

function storeAuthData(user: AppUser, session: Session, token: string): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearAuthData(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function getStoredUsers(): AppUser[] {
  try {
    const data = localStorage.getItem('kksmartscan_users');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveStoredUsers(users: AppUser[]): void {
  localStorage.setItem('kksmartscan_users', JSON.stringify(users));
}

function getStoredSessions(): Session[] {
  try {
    const data = localStorage.getItem('kksmartscan_sessions');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveStoredSessions(sessions: Session[]): void {
  localStorage.setItem('kksmartscan_sessions', JSON.stringify(sessions));
}

// ==================== STATE MANAGEMENT ====================

function updateAuthState(updates: Partial<AuthState>): void {
  currentAuthState = { ...currentAuthState, ...updates };
  authStateListeners.forEach(listener => listener(currentAuthState));
}

export function subscribeToAuthState(listener: (state: AuthState) => void): () => void {
  authStateListeners.push(listener);
  // Immediately call with current state
  listener(currentAuthState);
  
  // Return unsubscribe function
  return () => {
    authStateListeners = authStateListeners.filter(l => l !== listener);
  };
}

export function getAuthState(): AuthState {
  return currentAuthState;
}

export function getCurrentUser(): AppUser | null {
  return currentAuthState.user;
}

export function isAuthenticated(): boolean {
  return currentAuthState.isAuthenticated;
}

// ==================== TYPE DECLARATIONS ====================

declare global {
  interface Window {
    google: typeof google;
  }
  
  namespace google.accounts.oauth2 {
    interface TokenClient {
      requestAccessToken(options?: { prompt?: string }): void;
    }
    
    function initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: GoogleTokenResponse) => void;
    }): TokenClient;
    
    function revoke(token: string, callback: () => void): void;
  }
}
