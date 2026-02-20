/**
 * Client-Side Validation Utilities
 * Validates data WITHOUT using AI tokens
 * Reduces AI dependency by handling common validation locally
 */

export interface ValidationResult {
  isValid: boolean;
  normalized: string;
  errors: string[];
}

// ==================== PHONE VALIDATION ====================

/**
 * Validate and normalize Indian phone numbers
 * Format: +91 XXXXX XXXXX
 */
export function validatePhone(phone: string): ValidationResult {
  const errors: string[] = [];
  
  if (!phone || phone.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^0-9+]/g, '');
  
  // Extract digits only for processing
  let digits = cleaned.replace(/[^0-9]/g, '');

  // Handle various input formats
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Validate length
  if (digits.length !== 10) {
    errors.push(`Invalid phone length: expected 10 digits, got ${digits.length}`);
    return { isValid: false, normalized: phone, errors };
  }

  // Validate Indian mobile number pattern (starts with 6-9)
  const firstDigit = digits[0];
  if (!['6', '7', '8', '9'].includes(firstDigit)) {
    errors.push('Indian mobile numbers must start with 6, 7, 8, or 9');
  }

  // Format as +91 XXXXX XXXXX
  const normalized = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

// ==================== EMAIL VALIDATION ====================

/**
 * Validate email address format
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  
  if (!email || email.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  const normalized = email.trim().toLowerCase();

  // Basic regex for email validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(normalized)) {
    errors.push('Invalid email format');
  }

  // Check for common typos
  const commonDomainTypos: Record<string, string> = {
    'gmial.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gnail.com': 'gmail.com',
    'hotmial.com': 'hotmail.com',
    'hotmal.com': 'hotmail.com',
    'yahooo.com': 'yahoo.com',
    'yaho.com': 'yahoo.com',
    'outllok.com': 'outlook.com',
    'outlok.com': 'outlook.com',
  };

  const domain = normalized.split('@')[1];
  if (domain && commonDomainTypos[domain]) {
    errors.push(`Did you mean ${normalized.replace(domain, commonDomainTypos[domain])}?`);
  }

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

// ==================== PINCODE VALIDATION ====================

/**
 * Validate and format Indian pincode
 * Format: XXX XXX
 */
export function validatePincode(pincode: string): ValidationResult {
  const errors: string[] = [];
  
  if (!pincode || pincode.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  // Extract digits only
  const digits = pincode.replace(/\D/g, '');

  if (digits.length !== 6) {
    errors.push(`Invalid pincode length: expected 6 digits, got ${digits.length}`);
    return { isValid: false, normalized: pincode, errors };
  }

  // First digit cannot be 0
  if (digits[0] === '0') {
    errors.push('Invalid pincode: first digit cannot be 0');
  }

  // Format as XXX XXX
  const normalized = `${digits.slice(0, 3)} ${digits.slice(3)}`;

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

// ==================== GSTIN VALIDATION ====================

/**
 * Validate Indian GSTIN (Goods and Services Tax Identification Number)
 * Format: 22AAAAA0000A1Z5
 * - 2 digits: State code (01-37)
 * - 10 characters: PAN
 * - 1 digit: Entity number (1-9 or Z for default)
 * - 1 letter: Z (reserved)
 * - 1 character: Check digit
 */
export function validateGSTIN(gstin: string): ValidationResult {
  const errors: string[] = [];
  
  if (!gstin || gstin.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  const normalized = gstin.trim().toUpperCase().replace(/\s+/g, '');

  // Length check
  if (normalized.length !== 15) {
    errors.push(`Invalid GSTIN length: expected 15 characters, got ${normalized.length}`);
    return { isValid: false, normalized, errors };
  }

  // GSTIN Regex: 2 digits + PAN (10 chars) + entity number + Z + check digit
  const gstinRegex = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

  if (!gstinRegex.test(normalized)) {
    errors.push('Invalid GSTIN format');
    return { isValid: false, normalized, errors };
  }

  // Validate state code (01-37, also 97 for Other Territory)
  const stateCode = parseInt(normalized.slice(0, 2), 10);
  const validStateCodes = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 97
  ];

  if (!validStateCodes.includes(stateCode)) {
    errors.push(`Invalid state code: ${stateCode}`);
  }

  // Extract and validate the embedded PAN
  const embeddedPAN = normalized.slice(2, 12);
  const panResult = validatePAN(embeddedPAN);
  if (!panResult.isValid) {
    errors.push('Invalid PAN embedded in GSTIN');
  }

  // Checksum validation (using weighted sum algorithm)
  const checksumValid = validateGSTINChecksum(normalized);
  if (!checksumValid) {
    errors.push('GSTIN checksum validation failed');
  }

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

/**
 * Validate GSTIN checksum using weighted sum algorithm
 */
function validateGSTINChecksum(gstin: string): boolean {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const charValues: Record<string, number> = {};
  
  for (let i = 0; i < chars.length; i++) {
    charValues[chars[i]] = i + 10;
  }
  for (let i = 0; i <= 9; i++) {
    charValues[i.toString()] = i;
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const c = gstin[i];
    const value = charValues[c] || 0;
    const factor = (i % 2 === 0) ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }

  const checkDigit = (36 - (sum % 36)) % 36;
  const expectedChar = checkDigit < 10 ? checkDigit.toString() : chars[checkDigit - 10];
  
  return gstin[14] === expectedChar;
}

// ==================== PAN VALIDATION ====================

/**
 * Validate Indian PAN (Permanent Account Number)
 * Format: AAAAA0000A
 * - 5 letters: First 3 are alphabetic sequence (AAA-ZZZ)
 *              4th letter is category (C, P, H, F, A, T, B, L, J, G)
 *              5th letter is first letter of name/surname
 * - 4 digits: Sequential number
 * - 1 letter: Alphabetic check digit
 */
export function validatePAN(pan: string): ValidationResult {
  const errors: string[] = [];
  
  if (!pan || pan.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  const normalized = pan.trim().toUpperCase().replace(/\s+/g, '');

  // Length check
  if (normalized.length !== 10) {
    errors.push(`Invalid PAN length: expected 10 characters, got ${normalized.length}`);
    return { isValid: false, normalized, errors };
  }

  // PAN Regex: 5 letters + 4 digits + 1 letter
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  if (!panRegex.test(normalized)) {
    errors.push('Invalid PAN format: must be 5 letters + 4 digits + 1 letter');
    return { isValid: false, normalized, errors };
  }

  // Validate 4th character (entity type)
  const entityChar = normalized[3];
  const validEntityTypes: Record<string, string> = {
    'A': 'Association of Persons (AOP)',
    'B': 'Body of Individuals (BOI)',
    'C': 'Company',
    'F': 'Firm',
    'G': 'Government',
    'H': 'HUF (Hindu Undivided Family)',
    'J': 'Artificial Juridical Person',
    'L': 'Local Authority',
    'P': 'Individual/Person',
    'T': 'Trust'
  };

  if (!validEntityTypes[entityChar]) {
    errors.push(`Invalid PAN entity type: '${entityChar}' is not a recognized type`);
  }

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

/**
 * Get PAN entity type description
 */
export function getPANEntityType(pan: string): string | null {
  if (!pan || pan.length < 4) return null;
  
  const entityChar = pan[3].toUpperCase();
  const types: Record<string, string> = {
    'A': 'Association of Persons',
    'B': 'Body of Individuals',
    'C': 'Company',
    'F': 'Firm',
    'G': 'Government',
    'H': 'Hindu Undivided Family',
    'J': 'Artificial Juridical Person',
    'L': 'Local Authority',
    'P': 'Individual',
    'T': 'Trust'
  };
  
  return types[entityChar] || null;
}

// ==================== AADHAR VALIDATION ====================

/**
 * Validate Indian Aadhar number
 * Format: XXXX XXXX XXXX (12 digits)
 */
export function validateAadhar(aadhar: string): ValidationResult {
  const errors: string[] = [];
  
  if (!aadhar || aadhar.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  // Extract digits only
  const digits = aadhar.replace(/\D/g, '');

  if (digits.length !== 12) {
    errors.push(`Invalid Aadhar length: expected 12 digits, got ${digits.length}`);
    return { isValid: false, normalized: aadhar, errors };
  }

  // First digit cannot be 0 or 1
  if (digits[0] === '0' || digits[0] === '1') {
    errors.push('Invalid Aadhar: first digit cannot be 0 or 1');
  }

  // Verhoeff checksum validation
  const checksumValid = verhoeffCheck(digits);
  if (!checksumValid) {
    errors.push('Invalid Aadhar checksum');
  }

  // Format as XXXX XXXX XXXX
  const normalized = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

/**
 * Verhoeff checksum algorithm for Aadhar validation
 */
function verhoeffCheck(num: string): boolean {
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];

  let c = 0;
  const myArray = num.split('').map(Number).reverse();
  
  for (let i = 0; i < myArray.length; i++) {
    c = d[c][p[i % 8][myArray[i]]];
  }
  
  return c === 0;
}

// ==================== WEBSITE VALIDATION ====================

/**
 * Validate and normalize website URL
 */
export function validateWebsite(url: string): ValidationResult {
  const errors: string[] = [];
  
  if (!url || url.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  let normalized = url.trim().toLowerCase();

  // Add protocol if missing
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }

  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');

  try {
    const urlObj = new URL(normalized);
    
    // Check for valid hostname
    if (!urlObj.hostname.includes('.')) {
      errors.push('Invalid domain name');
    }
    
    normalized = urlObj.href.replace(/\/+$/, '');
  } catch {
    errors.push('Invalid URL format');
  }

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

// ==================== NAME VALIDATION ====================

/**
 * Validate and normalize person name
 */
export function validateName(name: string): ValidationResult {
  const errors: string[] = [];
  
  // Empty is valid (optional field pattern)
  if (!name || name.trim() === '') {
    return { isValid: true, normalized: '', errors: [] };
  }

  // Remove extra whitespace and trim
  let normalized = name.trim().replace(/\s+/g, ' ');

  // Capitalize first letter of each word
  normalized = normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // Check for suspicious patterns
  if (/^\d+$/.test(normalized)) {
    errors.push('Name cannot be all numbers');
  }

  if (normalized.length < 2) {
    errors.push('Name is too short');
  }

  if (normalized.length > 100) {
    errors.push('Name is too long');
  }

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

// ==================== BATCH VALIDATION ====================

export interface ContactValidation {
  phone: ValidationResult;
  phone2: ValidationResult;
  email: ValidationResult;
  email2: ValidationResult;
  pincode: ValidationResult;
  website: ValidationResult;
  name: ValidationResult;
  overallValid: boolean;
  criticalErrors: string[];
}

/**
 * Validate all contact fields at once
 */
export function validateContact(contact: {
  name?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  email2?: string;
  pincode?: string;
  website?: string;
}): ContactValidation {
  const phoneResult = validatePhone(contact.phone || '');
  const phone2Result = validatePhone(contact.phone2 || '');
  const emailResult = validateEmail(contact.email || '');
  const email2Result = validateEmail(contact.email2 || '');
  const pincodeResult = validatePincode(contact.pincode || '');
  const websiteResult = validateWebsite(contact.website || '');
  const nameResult = validateName(contact.name || '');

  const criticalErrors: string[] = [];
  
  if (!nameResult.isValid) {
    criticalErrors.push(...nameResult.errors);
  }
  if (contact.phone && !phoneResult.isValid) {
    criticalErrors.push(...phoneResult.errors.map(e => `Phone: ${e}`));
  }
  if (contact.email && !emailResult.isValid) {
    criticalErrors.push(...emailResult.errors.map(e => `Email: ${e}`));
  }

  return {
    phone: phoneResult,
    phone2: phone2Result,
    email: emailResult,
    email2: email2Result,
    pincode: pincodeResult,
    website: websiteResult,
    name: nameResult,
    overallValid: criticalErrors.length === 0,
    criticalErrors
  };
}

/**
 * Normalize all contact fields using client-side validation
 * Returns normalized data WITHOUT calling AI
 */
export function normalizeContactFields(contact: {
  name?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  email2?: string;
  pincode?: string;
  website?: string;
}): {
  name: string;
  phone: string;
  phone2: string;
  email: string;
  email2: string;
  pincode: string;
  website: string;
} {
  return {
    name: validateName(contact.name || '').normalized,
    phone: validatePhone(contact.phone || '').normalized,
    phone2: validatePhone(contact.phone2 || '').normalized,
    email: validateEmail(contact.email || '').normalized,
    email2: validateEmail(contact.email2 || '').normalized,
    pincode: validatePincode(contact.pincode || '').normalized,
    website: validateWebsite(contact.website || '').normalized
  };
}

// ==================== DATA QUALITY SCORE ====================

/**
 * Calculate data quality/completeness score for a contact
 * Returns percentage 0-100
 */
export function calculateDataQuality(contact: {
  name?: string;
  firmName?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  pincode?: string;
  industry?: string;
}): {
  score: number;
  missing: string[];
  quality: 'high' | 'medium' | 'low';
} {
  const fields = [
    { key: 'name', weight: 20, label: 'Name' },
    { key: 'firmName', weight: 15, label: 'Company' },
    { key: 'phone', weight: 20, label: 'Phone' },
    { key: 'email', weight: 20, label: 'Email' },
    { key: 'address', weight: 10, label: 'Address' },
    { key: 'pincode', weight: 5, label: 'Pincode' },
    { key: 'industry', weight: 5, label: 'Industry' },
    { key: 'jobTitle', weight: 5, label: 'Job Title' }
  ];

  const missing: string[] = [];
  let totalScore = 0;

  for (const field of fields) {
    const value = contact[field.key as keyof typeof contact];
    if (value && value.trim() !== '' && value !== 'N/A') {
      totalScore += field.weight;
    } else {
      missing.push(field.label);
    }
  }

  const quality = totalScore >= 80 ? 'high' : totalScore >= 50 ? 'medium' : 'low';

  return { score: totalScore, missing, quality };
}
