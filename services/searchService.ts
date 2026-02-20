/**
 * Advanced Search Service
 * Powerful search, filtering, and sorting capabilities
 * Includes saved searches and search history
 */

import { ContactInfo } from '../types';

// ==================== TYPES ====================

export interface SearchQuery {
  term?: string;
  filters?: SearchFilter[];
  sort?: SortConfig;
  pagination?: PaginationConfig;
}

export interface SearchFilter {
  field: keyof ContactInfo | 'any';
  operator: FilterOperator;
  value: string | number | boolean | string[];
}

export type FilterOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'is_not_empty';

export interface SortConfig {
  field: keyof ContactInfo;
  direction: 'asc' | 'desc';
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
}

export interface SearchResult {
  contacts: ContactInfo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  searchTime: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: SearchQuery;
  createdAt: number;
  lastUsed?: number;
  useCount: number;
}

// ==================== SEARCH ENGINE ====================

/**
 * Execute advanced search
 */
export function searchContacts(
  contacts: ContactInfo[],
  query: SearchQuery
): SearchResult {
  const startTime = performance.now();
  
  let results = [...contacts];
  
  // Apply text search
  if (query.term && query.term.trim()) {
    results = textSearch(results, query.term);
  }
  
  // Apply filters
  if (query.filters && query.filters.length > 0) {
    results = applyFilters(results, query.filters);
  }
  
  // Apply sorting
  if (query.sort) {
    results = sortContacts(results, query.sort);
  }
  
  // Apply pagination
  const total = results.length;
  const page = query.pagination?.page || 1;
  const pageSize = query.pagination?.pageSize || 50;
  const totalPages = Math.ceil(total / pageSize);
  
  const start = (page - 1) * pageSize;
  const paginatedResults = results.slice(start, start + pageSize);
  
  const searchTime = performance.now() - startTime;
  
  return {
    contacts: paginatedResults,
    total,
    page,
    pageSize,
    totalPages,
    searchTime
  };
}

/**
 * Full-text search across all fields
 */
function textSearch(contacts: ContactInfo[], term: string): ContactInfo[] {
  const searchTerm = term.toLowerCase().trim();
  const terms = searchTerm.split(/\s+/).filter(t => t.length > 0);
  
  return contacts.filter(contact => {
    const searchableText = [
      contact.name,
      contact.firmName,
      contact.jobTitle,
      contact.email,
      contact.email2,
      contact.phone,
      contact.phone2,
      contact.address,
      contact.industry,
      contact.notes,
      contact.website
    ].join(' ').toLowerCase();
    
    // All terms must match (AND logic)
    return terms.every(term => searchableText.includes(term));
  });
}

/**
 * Apply filters to contacts
 */
function applyFilters(contacts: ContactInfo[], filters: SearchFilter[]): ContactInfo[] {
  return contacts.filter(contact => {
    return filters.every(filter => matchFilter(contact, filter));
  });
}

/**
 * Check if contact matches a single filter
 */
function matchFilter(contact: ContactInfo, filter: SearchFilter): boolean {
  if (filter.field === 'any') {
    // Search across all fields
    const values = Object.values(contact).map(v => String(v || '').toLowerCase());
    const searchValue = String(filter.value).toLowerCase();
    
    switch (filter.operator) {
      case 'contains':
        return values.some(v => v.includes(searchValue));
      case 'not_contains':
        return !values.some(v => v.includes(searchValue));
      case 'equals':
        return values.some(v => v === searchValue);
      default:
        return true;
    }
  }
  
  const fieldValue = contact[filter.field];
  const value = filter.value;
  
  switch (filter.operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === String(value).toLowerCase();
      
    case 'not_equals':
      return String(fieldValue).toLowerCase() !== String(value).toLowerCase();
      
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      
    case 'not_contains':
      return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      
    case 'starts_with':
      return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
      
    case 'ends_with':
      return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
      
    case 'greater_than':
      return Number(fieldValue) > Number(value);
      
    case 'less_than':
      return Number(fieldValue) < Number(value);
      
    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        const num = Number(fieldValue);
        return num >= Number(value[0]) && num <= Number(value[1]);
      }
      return false;
      
    case 'in':
      if (Array.isArray(value)) {
        return value.map(v => String(v).toLowerCase()).includes(String(fieldValue).toLowerCase());
      }
      return false;
      
    case 'not_in':
      if (Array.isArray(value)) {
        return !value.map(v => String(v).toLowerCase()).includes(String(fieldValue).toLowerCase());
      }
      return false;
      
    case 'is_empty':
      return !fieldValue || String(fieldValue).trim() === '';
      
    case 'is_not_empty':
      return Boolean(fieldValue) && String(fieldValue).trim() !== '';
      
    default:
      return true;
  }
}

/**
 * Sort contacts
 */
function sortContacts(contacts: ContactInfo[], sort: SortConfig): ContactInfo[] {
  return [...contacts].sort((a, b) => {
    const aValue = a[sort.field];
    const bValue = b[sort.field];
    
    // Handle null/undefined
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return sort.direction === 'asc' ? 1 : -1;
    if (bValue == null) return sort.direction === 'asc' ? -1 : 1;
    
    // Handle numbers
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sort.direction === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    // Handle strings
    const comparison = String(aValue).localeCompare(String(bValue));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

// ==================== QUICK FILTERS ====================

/**
 * Pre-defined quick filters
 */
export const QUICK_FILTERS: Record<string, SearchFilter[]> = {
  hasEmail: [{ field: 'email', operator: 'is_not_empty', value: '' }],
  noEmail: [{ field: 'email', operator: 'is_empty', value: '' }],
  hasPhone: [{ field: 'phone', operator: 'is_not_empty', value: '' }],
  noPhone: [{ field: 'phone', operator: 'is_empty', value: '' }],
  complete: [
    { field: 'email', operator: 'is_not_empty', value: '' },
    { field: 'phone', operator: 'is_not_empty', value: '' },
    { field: 'firmName', operator: 'is_not_empty', value: '' }
  ],
  incomplete: [
    { field: 'any', operator: 'contains', value: '' } // Placeholder, handled specially
  ],
  recentlyAdded: [
    { field: 'createdAt', operator: 'greater_than', value: Date.now() - 7 * 24 * 60 * 60 * 1000 }
  ],
  hasNotes: [{ field: 'notes', operator: 'is_not_empty', value: '' }],
  hasWebsite: [{ field: 'website', operator: 'is_not_empty', value: '' }]
};

/**
 * Apply quick filter
 */
export function applyQuickFilter(
  contacts: ContactInfo[],
  filterName: keyof typeof QUICK_FILTERS
): ContactInfo[] {
  const filters = QUICK_FILTERS[filterName];
  
  if (filterName === 'incomplete') {
    return contacts.filter(c => !c.email || !c.phone || !c.firmName);
  }
  
  if (!filters) return contacts;
  
  return applyFilters(contacts, filters);
}

// ==================== SEARCH SUGGESTIONS ====================

/**
 * Get search suggestions based on existing data
 */
export function getSearchSuggestions(
  contacts: ContactInfo[],
  partialTerm: string,
  limit: number = 10
): string[] {
  const term = partialTerm.toLowerCase().trim();
  if (!term) return [];
  
  const suggestions = new Set<string>();
  
  for (const contact of contacts) {
    // Check names
    if (contact.name?.toLowerCase().includes(term)) {
      suggestions.add(contact.name);
    }
    // Check companies
    if (contact.firmName?.toLowerCase().includes(term)) {
      suggestions.add(contact.firmName);
    }
    // Check industries
    if (contact.industry?.toLowerCase().includes(term)) {
      suggestions.add(contact.industry);
    }
    
    if (suggestions.size >= limit) break;
  }
  
  return Array.from(suggestions).slice(0, limit);
}

/**
 * Get field value suggestions
 */
export function getFieldSuggestions(
  contacts: ContactInfo[],
  field: keyof ContactInfo,
  limit: number = 20
): string[] {
  const values = new Map<string, number>();
  
  for (const contact of contacts) {
    const value = contact[field];
    if (value && typeof value === 'string' && value.trim()) {
      const count = values.get(value) || 0;
      values.set(value, count + 1);
    }
  }
  
  // Sort by frequency
  return Array.from(values.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

// ==================== SAVED SEARCHES ====================

const SAVED_SEARCHES_KEY = 'kksmartscan_saved_searches';
const SEARCH_HISTORY_KEY = 'kksmartscan_search_history';
const MAX_SEARCH_HISTORY = 50;

/**
 * Save a search query
 */
export function saveSearch(name: string, query: SearchQuery): SavedSearch {
  const savedSearches = getSavedSearches();
  
  const search: SavedSearch = {
    id: crypto.randomUUID(),
    name,
    query,
    createdAt: Date.now(),
    useCount: 0
  };
  
  savedSearches.push(search);
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(savedSearches));
  
  return search;
}

/**
 * Get all saved searches
 */
export function getSavedSearches(): SavedSearch[] {
  try {
    const data = localStorage.getItem(SAVED_SEARCHES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Delete a saved search
 */
export function deleteSavedSearch(id: string): void {
  const searches = getSavedSearches().filter(s => s.id !== id);
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
}

/**
 * Use a saved search (updates usage stats)
 */
export function useSavedSearch(id: string): SavedSearch | null {
  const searches = getSavedSearches();
  const search = searches.find(s => s.id === id);
  
  if (search) {
    search.lastUsed = Date.now();
    search.useCount++;
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
    return search;
  }
  
  return null;
}

// ==================== SEARCH HISTORY ====================

interface SearchHistoryEntry {
  term: string;
  timestamp: number;
  resultCount: number;
}

/**
 * Add to search history
 */
export function addToSearchHistory(term: string, resultCount: number): void {
  if (!term.trim()) return;
  
  const history = getSearchHistory();
  
  // Remove duplicate
  const filtered = history.filter(h => h.term.toLowerCase() !== term.toLowerCase());
  
  // Add new entry at the start
  filtered.unshift({
    term,
    timestamp: Date.now(),
    resultCount
  });
  
  // Limit history size
  const trimmed = filtered.slice(0, MAX_SEARCH_HISTORY);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(trimmed));
}

/**
 * Get search history
 */
export function getSearchHistory(): SearchHistoryEntry[] {
  try {
    const data = localStorage.getItem(SEARCH_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Clear search history
 */
export function clearSearchHistory(): void {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}

// ==================== FACETED SEARCH ====================

export interface Facet {
  field: keyof ContactInfo;
  values: { value: string; count: number }[];
}

/**
 * Get facets for filtered results
 */
export function getFacets(contacts: ContactInfo[]): Facet[] {
  const facetFields: (keyof ContactInfo)[] = ['industry', 'status'];
  const facets: Facet[] = [];
  
  for (const field of facetFields) {
    const valueCounts = new Map<string, number>();
    
    for (const contact of contacts) {
      const value = contact[field];
      if (value && typeof value === 'string') {
        const count = valueCounts.get(value) || 0;
        valueCounts.set(value, count + 1);
      }
    }
    
    facets.push({
      field,
      values: Array.from(valueCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
    });
  }
  
  return facets;
}

// ==================== SEARCH ANALYTICS ====================

/**
 * Get aggregate statistics for search results
 */
export function getSearchStats(contacts: ContactInfo[]): {
  totalContacts: number;
  withEmail: number;
  withPhone: number;
  withWebsite: number;
  complete: number;
  industries: Record<string, number>;
  dateRange: { earliest: number; latest: number } | null;
} {
  const stats = {
    totalContacts: contacts.length,
    withEmail: 0,
    withPhone: 0,
    withWebsite: 0,
    complete: 0,
    industries: {} as Record<string, number>,
    dateRange: null as { earliest: number; latest: number } | null
  };
  
  let earliest = Infinity;
  let latest = 0;
  
  for (const contact of contacts) {
    if (contact.email) stats.withEmail++;
    if (contact.phone) stats.withPhone++;
    if (contact.website) stats.withWebsite++;
    if (contact.email && contact.phone && contact.firmName) stats.complete++;
    
    if (contact.industry) {
      stats.industries[contact.industry] = (stats.industries[contact.industry] || 0) + 1;
    }
    
    if (contact.createdAt < earliest) earliest = contact.createdAt;
    if (contact.createdAt > latest) latest = contact.createdAt;
  }
  
  if (contacts.length > 0) {
    stats.dateRange = { earliest, latest };
  }
  
  return stats;
}

// ==================== HELPER ====================

/**
 * Build search query from simple parameters
 */
export function buildSearchQuery(params: {
  term?: string;
  industry?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  sortBy?: keyof ContactInfo;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): SearchQuery {
  const filters: SearchFilter[] = [];
  
  if (params.industry && params.industry !== 'All') {
    filters.push({ field: 'industry', operator: 'equals', value: params.industry });
  }
  
  if (params.hasEmail) {
    filters.push({ field: 'email', operator: 'is_not_empty', value: '' });
  }
  
  if (params.hasPhone) {
    filters.push({ field: 'phone', operator: 'is_not_empty', value: '' });
  }
  
  return {
    term: params.term,
    filters: filters.length > 0 ? filters : undefined,
    sort: params.sortBy ? {
      field: params.sortBy,
      direction: params.sortDir || 'asc'
    } : undefined,
    pagination: {
      page: params.page || 1,
      pageSize: params.pageSize || 50
    }
  };
}
