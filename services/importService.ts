/**
 * Import Service
 * Comprehensive import functionality for contacts
 * Supports CSV, vCard, JSON formats with validation and deduplication
 */

import { ContactInfo } from '../types';
import { validateEmail, validatePhone, normalizeContactFields } from '../utils/validators';
import { findDuplicates, DuplicateMatch } from '../utils/duplicateDetection';
import { recordAction } from './rateLimit';

// ==================== IMPORT TYPES ====================

export interface ImportOptions {
  format: 'csv' | 'vcf' | 'json';
  skipDuplicates?: boolean;
  mergeStrategy?: 'skip' | 'overwrite' | 'merge';
  validateData?: boolean;
  columnMapping?: Record<string, keyof ContactInfo>;
  defaultIndustry?: string;
}

export interface ImportResult {
  success: boolean;
  totalRecords: number;
  importedCount: number;
  skippedCount: number;
  duplicates: DuplicateMatch[];
  errors: ImportError[];
  contacts: ContactInfo[];
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  data?: string;
}

export interface ParsedContact {
  raw: Record<string, string>;
  contact: Partial<ContactInfo>;
  isValid: boolean;
  errors: string[];
}

// Default column mappings for CSV
export const DEFAULT_CSV_MAPPINGS: Record<string, keyof ContactInfo> = {
  'name': 'name',
  'full name': 'name',
  'contact name': 'name',
  'company': 'firmName',
  'firm': 'firmName',
  'organization': 'firmName',
  'org': 'firmName',
  'title': 'jobTitle',
  'job title': 'jobTitle',
  'position': 'jobTitle',
  'designation': 'jobTitle',
  'email': 'email',
  'email address': 'email',
  'e-mail': 'email',
  'primary email': 'email',
  'secondary email': 'email2',
  'email 2': 'email2',
  'phone': 'phone',
  'telephone': 'phone',
  'mobile': 'phone',
  'phone number': 'phone',
  'primary phone': 'phone',
  'secondary phone': 'phone2',
  'phone 2': 'phone2',
  'work phone': 'phone2',
  'website': 'website',
  'url': 'website',
  'web': 'website',
  'address': 'address',
  'street address': 'address',
  'postal code': 'pincode',
  'zip': 'pincode',
  'pincode': 'pincode',
  'zip code': 'pincode',
  'industry': 'industry',
  'sector': 'industry',
  'category': 'industry',
  'notes': 'notes',
  'comments': 'notes',
  'remarks': 'notes'
};

// ==================== MAIN IMPORT FUNCTION ====================

/**
 * Import contacts from file content
 */
export async function importContacts(
  fileContent: string,
  options: ImportOptions,
  existingContacts: ContactInfo[],
  userId?: string
): Promise<ImportResult> {
  // Rate limit check
  if (userId) {
    const rateCheck = recordAction(userId, 'import', 20); // 20 imports per minute
    if (!rateCheck.allowed) {
      return {
        success: false,
        totalRecords: 0,
        importedCount: 0,
        skippedCount: 0,
        duplicates: [],
        errors: [{
          row: 0,
          message: `Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} seconds.`
        }],
        contacts: []
      };
    }
  }

  let parsedContacts: ParsedContact[];
  
  try {
    switch (options.format) {
      case 'csv':
        parsedContacts = parseCSV(fileContent, options);
        break;
      case 'vcf':
        parsedContacts = parseVCard(fileContent);
        break;
      case 'json':
        parsedContacts = parseJSON(fileContent);
        break;
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  } catch (error) {
    return {
      success: false,
      totalRecords: 0,
      importedCount: 0,
      skippedCount: 0,
      duplicates: [],
      errors: [{
        row: 0,
        message: error instanceof Error ? error.message : 'Failed to parse file'
      }],
      contacts: []
    };
  }

  const result: ImportResult = {
    success: true,
    totalRecords: parsedContacts.length,
    importedCount: 0,
    skippedCount: 0,
    duplicates: [],
    errors: [],
    contacts: []
  };

  for (let i = 0; i < parsedContacts.length; i++) {
    const parsed = parsedContacts[i];
    
    // Collect parse errors
    if (parsed.errors.length > 0) {
      parsed.errors.forEach(err => {
        result.errors.push({ row: i + 1, message: err });
      });
    }

    // Skip invalid records if validation enabled
    if (options.validateData && !parsed.isValid) {
      result.skippedCount++;
      continue;
    }

    // Create contact object
    const contact: ContactInfo = {
      id: crypto.randomUUID(),
      name: parsed.contact.name || '',
      firmName: parsed.contact.firmName || '',
      jobTitle: parsed.contact.jobTitle || '',
      email: parsed.contact.email || '',
      email2: parsed.contact.email2 || '',
      phone: parsed.contact.phone || '',
      phone2: parsed.contact.phone2 || '',
      website: parsed.contact.website || '',
      address: parsed.contact.address || '',
      pincode: parsed.contact.pincode || '',
      industry: parsed.contact.industry || options.defaultIndustry || 'Unclassified',
      notes: parsed.contact.notes || '',
      createdAt: Date.now(),
      imageSource: '',
      status: 'completed'
    };

    // Normalize fields
    const normalized = normalizeContactFields(contact);
    Object.assign(contact, normalized);

    // Check for duplicates
    const duplicates = findDuplicates(contact, existingContacts);
    
    if (duplicates.length > 0) {
      const isDuplicate = duplicates.some(d => d.confidence === 'definite' || d.confidence === 'likely');
      
      if (isDuplicate) {
        result.duplicates.push(...duplicates);
        
        if (options.skipDuplicates || options.mergeStrategy === 'skip') {
          result.skippedCount++;
          continue;
        }
        
        if (options.mergeStrategy === 'merge') {
          // Merge with existing contact
          const existingContact = duplicates[0].contact;
          const mergedContact = mergeContacts(existingContact, contact);
          result.contacts.push(mergedContact);
          result.importedCount++;
          continue;
        }
      }
    }

    result.contacts.push(contact);
    result.importedCount++;
  }

  return result;
}

// ==================== CSV PARSING ====================

/**
 * Parse CSV content
 */
function parseCSV(content: string, options: ImportOptions): ParsedContact[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  // Build column mapping
  const columnMap: Map<number, keyof ContactInfo> = new Map();
  const customMapping = options.columnMapping || {};
  
  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim();
    
    // Check custom mapping first
    if (customMapping[normalizedHeader]) {
      columnMap.set(index, customMapping[normalizedHeader]);
    }
    // Then default mapping
    else if (DEFAULT_CSV_MAPPINGS[normalizedHeader]) {
      columnMap.set(index, DEFAULT_CSV_MAPPINGS[normalizedHeader]);
    }
  });

  // Parse data rows
  const results: ParsedContact[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = parseCSVLine(line);
    const raw: Record<string, string> = {};
    const contact: Partial<ContactInfo> = {};
    const errors: string[] = [];
    
    // Map values to contact fields
    values.forEach((value, index) => {
      const header = headers[index];
      raw[header] = value;
      
      const field = columnMap.get(index);
      if (field) {
        (contact as Record<string, string>)[field] = value.trim();
      }
    });

    // Validate
    let isValid = true;
    
    if (!contact.name && !contact.email && !contact.phone) {
      errors.push('Contact must have at least a name, email, or phone');
      isValid = false;
    }
    
    if (contact.email && !validateEmail(contact.email).isValid) {
      errors.push(`Invalid email format: ${contact.email}`);
    }
    
    if (contact.phone && !validatePhone(contact.phone).isValid) {
      // Don't mark as invalid, just note it
    }

    results.push({ raw, contact, isValid, errors });
  }

  return results;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  fields.push(current);
  return fields;
}

// ==================== VCARD PARSING ====================

/**
 * Parse vCard content
 */
function parseVCard(content: string): ParsedContact[] {
  const vcards = content.split(/(?=BEGIN:VCARD)/i).filter(s => s.trim());
  const results: ParsedContact[] = [];

  for (const vcard of vcards) {
    const raw: Record<string, string> = {};
    const contact: Partial<ContactInfo> = {};
    const errors: string[] = [];
    
    const lines = vcard.split(/\r?\n/);
    
    for (const line of lines) {
      if (!line.includes(':')) continue;
      
      const colonIndex = line.indexOf(':');
      const property = line.substring(0, colonIndex).toUpperCase();
      const value = line.substring(colonIndex + 1).trim();
      
      raw[property] = value;
      
      // Parse common vCard fields
      if (property === 'FN' || property.startsWith('FN;')) {
        contact.name = unescapeVCard(value);
      }
      else if (property === 'ORG' || property.startsWith('ORG;')) {
        contact.firmName = unescapeVCard(value.split(';')[0]);
      }
      else if (property === 'TITLE' || property.startsWith('TITLE;')) {
        contact.jobTitle = unescapeVCard(value);
      }
      else if (property.startsWith('TEL')) {
        if (!contact.phone) {
          contact.phone = value.replace(/[^\d+\-\s()]/g, '');
        } else if (!contact.phone2) {
          contact.phone2 = value.replace(/[^\d+\-\s()]/g, '');
        }
      }
      else if (property.startsWith('EMAIL')) {
        if (!contact.email) {
          contact.email = value;
        } else if (!contact.email2) {
          contact.email2 = value;
        }
      }
      else if (property.startsWith('ADR')) {
        const parts = value.split(';').filter(p => p.trim());
        contact.address = parts.join(', ');
      }
      else if (property === 'URL' || property.startsWith('URL;')) {
        contact.website = value;
      }
      else if (property === 'NOTE' || property.startsWith('NOTE;')) {
        contact.notes = unescapeVCard(value);
      }
      else if (property.startsWith('X-INDUSTRY')) {
        contact.industry = unescapeVCard(value);
      }
      else if (property.startsWith('X-PINCODE')) {
        contact.pincode = value;
      }
    }

    // Validate
    const isValid = Boolean(contact.name || contact.email || contact.phone);
    
    if (!isValid) {
      errors.push('vCard must have at least a name, email, or phone');
    }

    results.push({ raw, contact, isValid, errors });
  }

  return results;
}

/**
 * Unescape vCard values
 */
function unescapeVCard(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\;/g, ';')
    .replace(/\\,/g, ',')
    .replace(/\\\\/g, '\\');
}

// ==================== JSON PARSING ====================

/**
 * Parse JSON content
 */
function parseJSON(content: string): ParsedContact[] {
  let data: unknown;
  
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON format');
  }

  // Handle different JSON structures
  let contactsArray: unknown[];
  
  if (Array.isArray(data)) {
    contactsArray = data;
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.contacts)) {
      contactsArray = obj.contacts;
    } else if (Array.isArray(obj.data)) {
      contactsArray = obj.data;
    } else {
      throw new Error('JSON must be an array or contain a "contacts" or "data" array');
    }
  } else {
    throw new Error('Invalid JSON structure');
  }

  return contactsArray.map((item, index) => {
    const raw = item as Record<string, string>;
    const contact: Partial<ContactInfo> = {};
    const errors: string[] = [];
    
    if (typeof item !== 'object' || item === null) {
      errors.push(`Row ${index + 1}: Invalid contact object`);
      return { raw: {}, contact: {}, isValid: false, errors };
    }

    const obj = item as Record<string, unknown>;

    // Map JSON fields to ContactInfo
    contact.name = String(obj.name || obj.fullName || obj.contactName || '');
    contact.firmName = String(obj.firmName || obj.company || obj.organization || obj.org || '');
    contact.jobTitle = String(obj.jobTitle || obj.title || obj.position || '');
    contact.email = String(obj.email || obj.emailAddress || '');
    contact.email2 = String(obj.email2 || obj.secondaryEmail || '');
    contact.phone = String(obj.phone || obj.telephone || obj.mobile || '');
    contact.phone2 = String(obj.phone2 || obj.secondaryPhone || '');
    contact.website = String(obj.website || obj.url || '');
    contact.address = String(obj.address || obj.streetAddress || '');
    contact.pincode = String(obj.pincode || obj.postalCode || obj.zip || '');
    contact.industry = String(obj.industry || obj.sector || obj.category || '');
    contact.notes = String(obj.notes || obj.comments || '');

    const isValid = Boolean(contact.name || contact.email || contact.phone);
    
    if (!isValid) {
      errors.push('Contact must have at least a name, email, or phone');
    }

    return { raw, contact, isValid, errors };
  });
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Merge two contacts, preferring non-empty values from the new contact
 */
function mergeContacts(existing: ContactInfo, incoming: Partial<ContactInfo>): ContactInfo {
  const merged = { ...existing };
  
  const fields: (keyof ContactInfo)[] = [
    'name', 'firmName', 'jobTitle', 'email', 'email2',
    'phone', 'phone2', 'website', 'address', 'pincode',
    'industry', 'notes'
  ];
  
  for (const field of fields) {
    const incomingValue = incoming[field];
    if (incomingValue && !merged[field]) {
      (merged as Record<string, unknown>)[field] = incomingValue;
    }
  }
  
  merged.updatedAt = Date.now();
  
  return merged;
}

/**
 * Preview import without actually importing
 */
export async function previewImport(
  fileContent: string,
  options: ImportOptions,
  limit: number = 10
): Promise<{ headers: string[]; preview: ParsedContact[]; totalRows: number }> {
  let parsedContacts: ParsedContact[];
  let headers: string[] = [];
  
  switch (options.format) {
    case 'csv': {
      const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
      headers = parseCSVLine(lines[0]);
      parsedContacts = parseCSV(fileContent, options);
      break;
    }
    case 'vcf':
      headers = ['FN', 'ORG', 'TEL', 'EMAIL', 'ADR'];
      parsedContacts = parseVCard(fileContent);
      break;
    case 'json':
      parsedContacts = parseJSON(fileContent);
      if (parsedContacts.length > 0) {
        headers = Object.keys(parsedContacts[0].raw);
      }
      break;
    default:
      throw new Error(`Unsupported format: ${options.format}`);
  }

  return {
    headers,
    preview: parsedContacts.slice(0, limit),
    totalRows: parsedContacts.length
  };
}

/**
 * Detect file format from content
 */
export function detectFormat(content: string): 'csv' | 'vcf' | 'json' | null {
  const trimmed = content.trim();
  
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  
  if (trimmed.toUpperCase().includes('BEGIN:VCARD')) {
    return 'vcf';
  }
  
  // Check for CSV by looking for common patterns
  const firstLine = trimmed.split(/\r?\n/)[0];
  if (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t')) {
    return 'csv';
  }
  
  return null;
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
