/**
 * PII Encryption Service
 * AES-GCM encryption for sensitive fields at rest
 */

// ==================== TYPES ====================

export interface EncryptedField {
  iv: string; // Base64 encoded initialization vector
  data: string; // Base64 encoded encrypted data
  tag: string; // Base64 encoded auth tag
}

export interface PIIConfig {
  sensitiveFields: string[];
  encryptionEnabled: boolean;
}

// ==================== CONSTANTS ====================

const ENCRYPTION_KEY_KEY = 'kksmartscan_encryption_key';
const PII_CONFIG_KEY = 'kksmartscan_pii_config';

const DEFAULT_SENSITIVE_FIELDS = [
  'phone',
  'email',
  'address',
  'pincode',
  'gstin',
  'pan',
  'bankAccount',
  'aadhar',
  'passport'
];

// ==================== KEY MANAGEMENT ====================

/**
 * Generate a new AES-256 encryption key
 */
async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export key to storable format
 */
async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Import key from stored format
 */
async function importKey(keyData: string): Promise<CryptoKey> {
  const rawKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Get or create encryption key
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  let storedKey = localStorage.getItem(ENCRYPTION_KEY_KEY);
  
  if (!storedKey) {
    const newKey = await generateEncryptionKey();
    storedKey = await exportKey(newKey);
    localStorage.setItem(ENCRYPTION_KEY_KEY, storedKey);
  }
  
  return importKey(storedKey);
}

/**
 * Derive key from password (for user-provided keys)
 */
export async function deriveKeyFromPassword(
  password: string, 
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const effectiveSalt = salt || crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: effectiveSalt as Uint8Array<ArrayBuffer>,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return { key, salt: effectiveSalt };
}

// ==================== ENCRYPTION/DECRYPTION ====================

/**
 * Encrypt a string value using AES-GCM
 */
export async function encryptField(value: string): Promise<EncryptedField> {
  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128
      },
      key,
      encoder.encode(value)
    );
    
    // AES-GCM appends the auth tag to the ciphertext
    const encryptedBytes = new Uint8Array(encrypted);
    const ciphertext = encryptedBytes.slice(0, -16);
    const tag = encryptedBytes.slice(-16);
    
    return {
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...ciphertext)),
      tag: btoa(String.fromCharCode(...tag))
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error(`Failed to encrypt field: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt an encrypted field
 */
export async function decryptField(encrypted: EncryptedField): Promise<string> {
  try {
    const key = await getEncryptionKey();
    
    const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(encrypted.data), c => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(encrypted.tag), c => c.charCodeAt(0));
    
    // Combine ciphertext and tag for decryption
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128
      },
      key,
      combined
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error(`Failed to decrypt field: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a value is an encrypted field
 */
export function isEncryptedField(value: unknown): value is EncryptedField {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.iv === 'string' &&
    typeof obj.data === 'string' &&
    typeof obj.tag === 'string'
  );
}

// ==================== OBJECT ENCRYPTION ====================

/**
 * Get PII configuration
 */
export function getPIIConfig(): PIIConfig {
  try {
    const stored = localStorage.getItem(PII_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {
    sensitiveFields: DEFAULT_SENSITIVE_FIELDS,
    encryptionEnabled: false // Disabled by default for performance
  };
}

/**
 * Update PII configuration
 */
export function updatePIIConfig(updates: Partial<PIIConfig>): PIIConfig {
  const current = getPIIConfig();
  const updated = { ...current, ...updates };
  localStorage.setItem(PII_CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Encrypt sensitive fields in an object
 */
export async function encryptSensitiveFields<T extends Record<string, any>>(
  obj: T,
  customFields?: string[]
): Promise<T> {
  const config = getPIIConfig();
  
  if (!config.encryptionEnabled) {
    return obj;
  }
  
  const fieldsToEncrypt = customFields || config.sensitiveFields;
  const result: Record<string, any> = { ...obj };
  
  for (const field of fieldsToEncrypt) {
    if (field in result && result[field] && typeof result[field] === 'string') {
      result[field] = await encryptField(result[field]);
    }
  }
  
  return result as T;
}

/**
 * Decrypt sensitive fields in an object
 */
export async function decryptSensitiveFields<T extends Record<string, any>>(
  obj: T,
  customFields?: string[]
): Promise<T> {
  const config = getPIIConfig();
  const fieldsToDecrypt = customFields || config.sensitiveFields;
  const result: Record<string, any> = { ...obj };
  
  for (const field of fieldsToDecrypt) {
    if (field in result && isEncryptedField(result[field])) {
      try {
        result[field] = await decryptField(result[field]);
      } catch (e) {
        console.error(`Failed to decrypt field ${field}:`, e);
        result[field] = '[Decryption Failed]';
      }
    }
  }
  
  return result as T;
}

/**
 * Encrypt array of objects
 */
export async function encryptArray<T extends Record<string, any>>(
  items: T[],
  customFields?: string[]
): Promise<T[]> {
  return Promise.all(items.map(item => encryptSensitiveFields(item, customFields)));
}

/**
 * Decrypt array of objects
 */
export async function decryptArray<T extends Record<string, any>>(
  items: T[],
  customFields?: string[]
): Promise<T[]> {
  return Promise.all(items.map(item => decryptSensitiveFields(item, customFields)));
}

// ==================== KEY ROTATION ====================

/**
 * Rotate encryption key
 * WARNING: This generates a new key but does NOT re-encrypt existing data.
 * All data encrypted with the old key will become unrecoverable unless you:
 * 1. First decrypt all encrypted data with the old key
 * 2. Rotate the key
 * 3. Re-encrypt the data with the new key
 * 
 * Returns the old key for backup purposes.
 */
export async function rotateEncryptionKey(): Promise<{
  success: boolean;
  oldKeyBackup: string;
  warning: string;
}> {
  // Backup old key
  const oldKey = localStorage.getItem(ENCRYPTION_KEY_KEY) || '';
  
  // Generate new key
  const newKey = await generateEncryptionKey();
  const exportedNewKey = await exportKey(newKey);
  
  // Store new key
  localStorage.setItem(ENCRYPTION_KEY_KEY, exportedNewKey);
  
  return {
    success: true,
    oldKeyBackup: oldKey,
    warning: 'Key rotated. Existing encrypted data will require the old key to decrypt. Store the oldKeyBackup securely.'
  };
}

// ==================== SECURE WIPE ====================

/**
 * Securely wipe encryption key (makes all encrypted data unrecoverable)
 */
export function wipeEncryptionKey(): void {
  localStorage.removeItem(ENCRYPTION_KEY_KEY);
}

/**
 * Export encryption key for backup
 */
export async function exportEncryptionKeyForBackup(): Promise<string> {
  const key = await getEncryptionKey();
  return exportKey(key);
}

/**
 * Import encryption key from backup
 */
export function importEncryptionKeyFromBackup(keyData: string): void {
  localStorage.setItem(ENCRYPTION_KEY_KEY, keyData);
}
