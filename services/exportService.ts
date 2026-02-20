/**
 * Advanced Export Service
 * Comprehensive export functionality with multiple formats
 * Supports CSV, vCard, JSON, XML, Excel-compatible format
 */

import { ContactInfo } from '../types';
import { recordAction } from './rateLimit';

// ==================== EXPORT CONFIGURATION ====================

export interface ExportOptions {
  format: 'csv' | 'vcf' | 'json' | 'xml' | 'xlsx';
  columns?: ExportColumn[];
  includeImages?: boolean;
  includeMetadata?: boolean;
  dateFormat?: 'iso' | 'locale' | 'unix';
  encoding?: 'utf-8' | 'utf-16';
  delimiter?: ',' | ';' | '\t';
}

export interface ExportColumn {
  key: keyof ContactInfo;
  label: string;
  transform?: (value: unknown) => string;
}

export interface ExportResult {
  success: boolean;
  fileName: string;
  recordCount: number;
  fileSize: number;
  format: string;
  error?: string;
}

// Default columns for export
export const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'firmName', label: 'Company' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'email', label: 'Email' },
  { key: 'email2', label: 'Email (Secondary)' },
  { key: 'phone', label: 'Phone' },
  { key: 'phone2', label: 'Phone (Secondary)' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'industry', label: 'Industry' },
  { key: 'notes', label: 'Notes' },
  { key: 'createdAt', label: 'Created', transform: (v) => new Date(v as number).toISOString() }
];

// Industry-specific column presets
export const COLUMN_PRESETS: Record<string, ExportColumn[]> = {
  basic: [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'firmName', label: 'Company' }
  ],
  sales: [
    { key: 'name', label: 'Contact Name' },
    { key: 'firmName', label: 'Company' },
    { key: 'jobTitle', label: 'Title' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'industry', label: 'Industry' },
    { key: 'notes', label: 'Notes' }
  ],
  mailing: [
    { key: 'name', label: 'Full Name' },
    { key: 'firmName', label: 'Organization' },
    { key: 'address', label: 'Street Address' },
    { key: 'pincode', label: 'Postal Code' }
  ],
  full: DEFAULT_EXPORT_COLUMNS
};

// ==================== EXPORT FUNCTIONS ====================

/**
 * Export contacts to specified format
 */
export async function exportContacts(
  contacts: ContactInfo[],
  options: ExportOptions,
  userId?: string
): Promise<ExportResult> {
  // Rate limit check
  if (userId) {
    const rateCheck = recordAction(userId, 'export');
    if (!rateCheck.allowed) {
      return {
        success: false,
        fileName: '',
        recordCount: 0,
        fileSize: 0,
        format: options.format,
        error: `Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} seconds.`
      };
    }
  }

  if (contacts.length === 0) {
    return {
      success: false,
      fileName: '',
      recordCount: 0,
      fileSize: 0,
      format: options.format,
      error: 'No contacts to export'
    };
  }

  const columns = options.columns || DEFAULT_EXPORT_COLUMNS;
  const timestamp = generateTimestamp();
  let content: string;
  let mimeType: string;
  let extension: string;

  try {
    switch (options.format) {
      case 'csv':
        content = generateCSV(contacts, columns, options);
        mimeType = 'text/csv;charset=utf-8';
        extension = 'csv';
        break;
      case 'vcf':
        content = generateVCard(contacts);
        mimeType = 'text/vcard';
        extension = 'vcf';
        break;
      case 'json':
        content = generateJSON(contacts, options);
        mimeType = 'application/json';
        extension = 'json';
        break;
      case 'xml':
        content = generateXML(contacts, options);
        mimeType = 'application/xml';
        extension = 'xml';
        break;
      case 'xlsx':
        content = generateExcelCSV(contacts, columns);
        mimeType = 'text/csv;charset=utf-16le';
        extension = 'csv'; // Excel-compatible CSV with BOM
        break;
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }

    const fileName = `smartscan_export_${timestamp}.${extension}`;
    const fileSize = new Blob([content]).size;

    // Download the file
    downloadFile(content, fileName, mimeType);

    return {
      success: true,
      fileName,
      recordCount: contacts.length,
      fileSize,
      format: options.format
    };
  } catch (error) {
    return {
      success: false,
      fileName: '',
      recordCount: 0,
      fileSize: 0,
      format: options.format,
      error: error instanceof Error ? error.message : 'Export failed'
    };
  }
}

/**
 * Generate CSV content
 */
function generateCSV(
  contacts: ContactInfo[], 
  columns: ExportColumn[],
  options: ExportOptions
): string {
  const delimiter = options.delimiter || ',';
  
  // Header row
  const headers = columns.map(col => escapeCSVField(col.label, delimiter));
  
  // Data rows
  const rows = contacts.map(contact => {
    return columns.map(col => {
      const rawValue = contact[col.key];
      const value = col.transform ? col.transform(rawValue) : String(rawValue || '');
      return escapeCSVField(value, delimiter);
    }).join(delimiter);
  });

  return [headers.join(delimiter), ...rows].join('\n');
}

/**
 * Generate Excel-compatible CSV with BOM
 */
function generateExcelCSV(contacts: ContactInfo[], columns: ExportColumn[]): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const delimiter = ',';
  
  const headers = columns.map(col => escapeCSVField(col.label, delimiter));
  const rows = contacts.map(contact => {
    return columns.map(col => {
      const rawValue = contact[col.key];
      const value = col.transform ? col.transform(rawValue) : String(rawValue || '');
      return escapeCSVField(value, delimiter);
    }).join(delimiter);
  });

  return BOM + [headers.join(delimiter), ...rows].join('\r\n');
}

/**
 * Generate vCard 3.0 format
 */
function generateVCard(contacts: ContactInfo[]): string {
  return contacts.map(contact => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCardValue(contact.name)}`,
      `N:${parseNameToVCard(contact.name)}`,
      `ORG:${escapeVCardValue(contact.firmName)}`,
      `TITLE:${escapeVCardValue(contact.jobTitle)}`
    ];

    // Primary phone
    if (contact.phone) {
      lines.push(`TEL;TYPE=WORK,VOICE:${contact.phone}`);
    }
    // Secondary phone
    if (contact.phone2) {
      lines.push(`TEL;TYPE=CELL:${contact.phone2}`);
    }

    // Primary email
    if (contact.email) {
      lines.push(`EMAIL;TYPE=PREF,INTERNET:${contact.email}`);
    }
    // Secondary email
    if (contact.email2) {
      lines.push(`EMAIL;TYPE=INTERNET:${contact.email2}`);
    }

    // Website
    if (contact.website) {
      lines.push(`URL:${contact.website}`);
    }

    // Address
    if (contact.address) {
      lines.push(`ADR;TYPE=WORK:;;${escapeVCardValue(contact.address.replace(/\n/g, ', '))}`);
    }

    // Notes
    if (contact.notes) {
      lines.push(`NOTE:${escapeVCardValue(contact.notes)}`);
    }

    // Custom fields
    lines.push(`X-INDUSTRY:${escapeVCardValue(contact.industry)}`);
    lines.push(`X-PINCODE:${contact.pincode || ''}`);
    lines.push(`REV:${new Date().toISOString()}`);
    lines.push(`UID:${contact.id}`);
    lines.push('END:VCARD');

    return lines.join('\r\n');
  }).join('\r\n\r\n');
}

/**
 * Generate JSON export
 */
function generateJSON(contacts: ContactInfo[], options: ExportOptions): string {
  const exportData = {
    metadata: options.includeMetadata ? {
      exportDate: new Date().toISOString(),
      totalRecords: contacts.length,
      version: '1.0',
      source: 'KK-SmartScan'
    } : undefined,
    contacts: contacts.map(contact => {
      const { imageSource, selected, status, ...cleanContact } = contact;
      return options.includeImages ? contact : cleanContact;
    })
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Generate XML export
 */
function generateXML(contacts: ContactInfo[], options: ExportOptions): string {
  const escapeXML = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const contactNodes = contacts.map(contact => `
    <Contact id="${contact.id}">
      <Name>${escapeXML(contact.name || '')}</Name>
      <Company>${escapeXML(contact.firmName || '')}</Company>
      <JobTitle>${escapeXML(contact.jobTitle || '')}</JobTitle>
      <Email primary="true">${escapeXML(contact.email || '')}</Email>
      ${contact.email2 ? `<Email>${escapeXML(contact.email2)}</Email>` : ''}
      <Phone primary="true">${escapeXML(contact.phone || '')}</Phone>
      ${contact.phone2 ? `<Phone>${escapeXML(contact.phone2)}</Phone>` : ''}
      <Website>${escapeXML(contact.website || '')}</Website>
      <Address>
        <Street>${escapeXML(contact.address || '')}</Street>
        <PostalCode>${escapeXML(contact.pincode || '')}</PostalCode>
      </Address>
      <Industry>${escapeXML(contact.industry || '')}</Industry>
      <Notes>${escapeXML(contact.notes || '')}</Notes>
      <CreatedAt>${new Date(contact.createdAt).toISOString()}</CreatedAt>
    </Contact>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<SmartScanExport>
  ${options.includeMetadata ? `<Metadata>
    <ExportDate>${new Date().toISOString()}</ExportDate>
    <TotalRecords>${contacts.length}</TotalRecords>
    <Version>1.0</Version>
  </Metadata>` : ''}
  <Contacts>${contactNodes}
  </Contacts>
</SmartScanExport>`;
}

// ==================== HELPER FUNCTIONS ====================

function escapeCSVField(value: string, delimiter: string): string {
  const needsQuotes = value.includes(delimiter) || 
                      value.includes('"') || 
                      value.includes('\n') || 
                      value.includes('\r');
  
  if (needsQuotes) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeVCardValue(value: string): string {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function parseNameToVCard(fullName: string): string {
  if (!fullName) return ';;;;';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0]};;;;`;
  const lastName = parts.pop() || '';
  const firstName = parts.join(' ');
  return `${lastName};${firstName};;;`;
}

function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString()
    .replace(/[:\-T]/g, '')
    .replace(/\.\d{3}Z$/, '');
}

function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==================== BATCH EXPORT ====================

/**
 * Export multiple batches with progress callback
 */
export async function exportBatch(
  contacts: ContactInfo[],
  options: ExportOptions,
  batchSize: number = 1000,
  onProgress?: (progress: number) => void
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];
  const batches = Math.ceil(contacts.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, contacts.length);
    const batch = contacts.slice(start, end);
    
    const result = await exportContacts(batch, {
      ...options,
      includeMetadata: true
    });
    
    results.push(result);
    
    if (onProgress) {
      onProgress(((i + 1) / batches) * 100);
    }
  }

  return results;
}

/**
 * Export contacts filtered by criteria
 */
export async function exportFiltered(
  contacts: ContactInfo[],
  filter: {
    industries?: string[];
    dateRange?: { start: number; end: number };
    hasEmail?: boolean;
    hasPhone?: boolean;
    searchTerm?: string;
  },
  options: ExportOptions
): Promise<ExportResult> {
  let filtered = [...contacts];

  if (filter.industries?.length) {
    filtered = filtered.filter(c => filter.industries!.includes(c.industry));
  }

  if (filter.dateRange) {
    filtered = filtered.filter(c => 
      c.createdAt >= filter.dateRange!.start && 
      c.createdAt <= filter.dateRange!.end
    );
  }

  if (filter.hasEmail) {
    filtered = filtered.filter(c => c.email);
  }

  if (filter.hasPhone) {
    filtered = filtered.filter(c => c.phone);
  }

  if (filter.searchTerm) {
    const term = filter.searchTerm.toLowerCase();
    filtered = filtered.filter(c => 
      c.name?.toLowerCase().includes(term) ||
      c.firmName?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term)
    );
  }

  return exportContacts(filtered, options);
}
