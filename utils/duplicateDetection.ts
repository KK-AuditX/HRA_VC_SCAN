/**
 * Duplicate Detection Utilities
 * Uses fuzzy matching algorithms to detect potential duplicates
 * NO AI tokens required - pure algorithmic matching
 */

import { ContactInfo } from '../types';

export interface DuplicateMatch {
  contact: ContactInfo;
  score: number;  // 0-100 similarity score
  matchedFields: string[];
  confidence: 'definite' | 'likely' | 'possible';
}

/**
 * Levenshtein distance between two strings
 * Lower = more similar
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[s1.length][s2.length];
}

/**
 * Calculate similarity percentage between two strings
 * Returns 0-100
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 100;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;

  const distance = levenshteinDistance(s1, s2);
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10); // Last 10 digits
}

/**
 * Normalize email for comparison
 */
function normalizeEmail(email: string): string {
  if (!email) return '';
  return email.toLowerCase().trim();
}

/**
 * Check if two phone numbers match
 */
function phonesMatch(phone1: string, phone2: string): boolean {
  const n1 = normalizePhone(phone1);
  const n2 = normalizePhone(phone2);
  return n1.length >= 10 && n1 === n2;
}

/**
 * Check if two emails match
 */
function emailsMatch(email1: string, email2: string): boolean {
  const e1 = normalizeEmail(email1);
  const e2 = normalizeEmail(email2);
  return e1.length > 0 && e1 === e2;
}

/**
 * Find potential duplicates for a contact
 */
export function findDuplicates(
  contact: Partial<ContactInfo>,
  existingContacts: ContactInfo[],
  excludeId?: string
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const existing of existingContacts) {
    // Skip the same contact
    if (excludeId && existing.id === excludeId) continue;

    const matchedFields: string[] = [];
    let totalScore = 0;
    let fieldCount = 0;

    // Exact match checks (high confidence)
    const phoneMatch = 
      phonesMatch(contact.phone || '', existing.phone) ||
      phonesMatch(contact.phone || '', existing.phone2) ||
      phonesMatch(contact.phone2 || '', existing.phone) ||
      phonesMatch(contact.phone2 || '', existing.phone2);
    
    if (phoneMatch) {
      matchedFields.push('phone');
      totalScore += 40;
      fieldCount++;
    }

    const emailMatch = 
      emailsMatch(contact.email || '', existing.email) ||
      emailsMatch(contact.email || '', existing.email2) ||
      emailsMatch(contact.email2 || '', existing.email) ||
      emailsMatch(contact.email2 || '', existing.email2);

    if (emailMatch) {
      matchedFields.push('email');
      totalScore += 40;
      fieldCount++;
    }

    // Fuzzy match checks
    const nameSim = stringSimilarity(contact.name || '', existing.name || '');
    if (nameSim >= 85) {
      matchedFields.push('name');
      totalScore += nameSim * 0.3;
      fieldCount++;
    }

    const firmSim = stringSimilarity(contact.firmName || '', existing.firmName || '');
    if (firmSim >= 80) {
      matchedFields.push('firmName');
      totalScore += firmSim * 0.2;
      fieldCount++;
    }

    // Calculate final score
    if (matchedFields.length > 0) {
      // Normalize score to 0-100
      const finalScore = Math.min(100, Math.round(totalScore));

      // Determine confidence level
      let confidence: 'definite' | 'likely' | 'possible';
      if (phoneMatch && emailMatch) {
        confidence = 'definite';
      } else if (phoneMatch || emailMatch) {
        confidence = 'likely';
      } else {
        confidence = 'possible';
      }

      // Only include if score is meaningful
      if (finalScore >= 30 || phoneMatch || emailMatch) {
        matches.push({
          contact: existing,
          score: finalScore,
          matchedFields,
          confidence
        });
      }
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Check if a contact is a definite duplicate
 */
export function isDefiniteDuplicate(
  contact: Partial<ContactInfo>,
  existingContacts: ContactInfo[],
  excludeId?: string
): ContactInfo | null {
  const duplicates = findDuplicates(contact, existingContacts, excludeId);
  const definite = duplicates.find(d => d.confidence === 'definite');
  return definite?.contact || null;
}

/**
 * Find all duplicate groups in a contact list
 */
export function findAllDuplicateGroups(contacts: ContactInfo[]): ContactInfo[][] {
  const processed = new Set<string>();
  const groups: ContactInfo[][] = [];

  for (const contact of contacts) {
    if (processed.has(contact.id)) continue;

    const duplicates = findDuplicates(contact, contacts, contact.id);
    const definiteOrLikely = duplicates.filter(
      d => d.confidence === 'definite' || d.confidence === 'likely'
    );

    if (definiteOrLikely.length > 0) {
      const group = [contact, ...definiteOrLikely.map(d => d.contact)];
      
      // Mark all as processed
      group.forEach(c => processed.add(c.id));
      
      groups.push(group);
    } else {
      processed.add(contact.id);
    }
  }

  return groups;
}

/**
 * Merge two contacts, keeping the best data from each
 */
export function mergeContacts(primary: ContactInfo, secondary: ContactInfo): ContactInfo {
  const merged: ContactInfo = { ...primary };

  // Helper to safely set string fields
  const setField = (field: keyof ContactInfo, value: string) => {
    switch (field) {
      case 'name': merged.name = value; break;
      case 'firmName': merged.firmName = value; break;
      case 'jobTitle': merged.jobTitle = value; break;
      case 'phone': merged.phone = value; break;
      case 'phone2': merged.phone2 = value; break;
      case 'email': merged.email = value; break;
      case 'email2': merged.email2 = value; break;
      case 'website': merged.website = value; break;
      case 'address': merged.address = value; break;
      case 'pincode': merged.pincode = value; break;
      case 'notes': merged.notes = value; break;
      case 'industry': merged.industry = value; break;
    }
  };

  // For each field, prefer non-empty values
  const fields: (keyof ContactInfo)[] = [
    'name', 'firmName', 'jobTitle', 'phone', 'phone2',
    'email', 'email2', 'website', 'address', 'pincode', 'notes', 'industry'
  ];

  for (const field of fields) {
    const primaryValue = primary[field];
    const secondaryValue = secondary[field];

    // Use secondary if primary is empty
    if (!primaryValue && secondaryValue && typeof secondaryValue === 'string') {
      setField(field, secondaryValue);
    }
    // For notes, concatenate
    else if (field === 'notes' && primaryValue && secondaryValue && primaryValue !== secondaryValue) {
      merged.notes = `${primaryValue}\n---\n${secondaryValue}`;
    }
    // For phone2/email2, fill if primary is empty
    else if ((field === 'phone2' || field === 'email2') && !primaryValue) {
      const mainField = field === 'phone2' ? 'phone' : 'email';
      if (secondaryValue && secondaryValue !== primary[mainField] && typeof secondaryValue === 'string') {
        setField(field, secondaryValue);
      }
    }
  }

  // Keep earliest createdAt
  merged.createdAt = Math.min(primary.createdAt, secondary.createdAt);

  return merged;
}

/**
 * Generate a similarity report for UI display
 */
export function generateDuplicateReport(matches: DuplicateMatch[]): string {
  if (matches.length === 0) return 'No duplicates found.';

  const lines: string[] = ['Potential duplicates found:'];
  
  for (const match of matches) {
    const confidenceEmoji = 
      match.confidence === 'definite' ? '🔴' :
      match.confidence === 'likely' ? '🟠' : '🟡';
    
    lines.push(
      `${confidenceEmoji} ${match.contact.name || 'Unknown'} (${match.score}% match)`
    );
    lines.push(`   Matched: ${match.matchedFields.join(', ')}`);
  }

  return lines.join('\n');
}
