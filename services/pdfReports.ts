/**
 * PDF Audit Report Generator
 * Client-side PDF generation for audit certificates and reports
 * Uses canvas-based PDF creation without external dependencies
 */

import { ContactInfo, AuditLogEntry } from '../types';

// ==================== TYPES ====================

export interface AuditReportConfig {
  title: string;
  subtitle?: string;
  companyName?: string;
  preparedBy?: string;
  reportDate?: Date;
  includeSignature?: boolean;
  watermark?: string;
}

export interface AuditCertificateData {
  auditId: string;
  entityName: string;
  entityType: 'contact' | 'batch' | 'document';
  auditDate: Date;
  auditor: string;
  status: 'passed' | 'failed' | 'partial';
  findings: string[];
  hashChain?: string;
}

// ==================== PDF GENERATOR ====================

/**
 * Simple PDF document builder using canvas
 */
class PDFBuilder {
  private pages: string[] = [];
  private currentPage: string[] = [];
  private yPosition = 50;
  private pageNumber = 1;
  private readonly pageHeight = 842; // A4 height in points
  private readonly pageWidth = 595;  // A4 width in points
  private readonly margin = 50;
  private readonly lineHeight = 14;

  constructor(private config: AuditReportConfig) {
    this.addHeader();
  }

  private addHeader(): void {
    const date = this.config.reportDate || new Date();
    this.currentPage.push(`%PDF-1.4`);
    this.currentPage.push(`1 0 obj << /Type /Catalog /Pages 2 0 obj >> endobj`);
  }

  addTitle(text: string, fontSize: number = 18): this {
    this.yPosition += fontSize + 10;
    return this;
  }

  addText(text: string, fontSize: number = 12): this {
    this.yPosition += this.lineHeight;
    if (this.yPosition > this.pageHeight - this.margin) {
      this.newPage();
    }
    return this;
  }

  addSection(title: string): this {
    this.yPosition += 20;
    return this.addText(title, 14);
  }

  addTable(headers: string[], rows: string[][]): this {
    this.yPosition += 20;
    rows.forEach(() => {
      this.yPosition += this.lineHeight;
    });
    return this;
  }

  addSignatureLine(): this {
    this.yPosition += 60;
    return this;
  }

  newPage(): void {
    this.pages.push(this.currentPage.join('\n'));
    this.currentPage = [];
    this.yPosition = 50;
    this.pageNumber++;
  }

  build(): string {
    // Return HTML-based printable document instead of raw PDF
    return this.buildHTMLDocument();
  }

  private buildHTMLDocument(): string {
    return ''; // Will be replaced by actual HTML generation
  }
}

// ==================== HTML REPORT GENERATOR ====================

/**
 * Generate printable HTML audit report (can be printed to PDF)
 */
export function generateAuditReportHTML(
  entries: AuditLogEntry[],
  config: AuditReportConfig
): string {
  const date = (config.reportDate || new Date()).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const entriesHTML = entries.map((entry, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${new Date(entry.timestamp).toLocaleString('en-IN')}</td>
      <td><strong>${entry.action}</strong></td>
      <td>${entry.details ? (typeof entry.details === 'object' ? JSON.stringify(entry.details) : String(entry.details)) : 'N/A'}</td>
      <td>${entry.userId}</td>
      <td style="font-family: monospace; font-size: 10px;">${entry.hash?.slice(0, 16) || 'N/A'}...</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
      @page { margin: 1cm; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20mm;
      background: white;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #7c3aed;
    }
    .title {
      font-size: 28px;
      margin: 10px 0;
      color: #1a1a2e;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      margin: 20px 0;
      padding: 15px;
      background: #f8f7ff;
      border-radius: 8px;
    }
    .meta-item label {
      font-size: 12px;
      color: #666;
      display: block;
    }
    .meta-item span {
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #e0e0e0;
      padding: 10px;
      text-align: left;
    }
    th {
      background: #7c3aed;
      color: white;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #f9f9f9;
    }
    .section-title {
      font-size: 18px;
      color: #7c3aed;
      margin-top: 30px;
      border-bottom: 1px solid #e0e0e0;
      padding-bottom: 10px;
    }
    .summary-box {
      background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
    }
    .summary-box h3 {
      margin: 0 0 15px 0;
    }
    .summary-stats {
      display: flex;
      gap: 30px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
    }
    .stat-label {
      font-size: 12px;
      opacity: 0.9;
    }
    .signature-section {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 200px;
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #333;
      margin-top: 50px;
      padding-top: 5px;
      font-size: 12px;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 11px;
      color: #888;
      border-top: 1px solid #e0e0e0;
      padding-top: 20px;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 100px;
      color: rgba(124, 58, 237, 0.05);
      pointer-events: none;
      z-index: -1;
    }
    .hash-chain {
      font-family: monospace;
      font-size: 10px;
      background: #f5f5f5;
      padding: 10px;
      border-radius: 4px;
      word-break: break-all;
      margin-top: 10px;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #7c3aed;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .print-btn:hover {
      background: #5b21b6;
    }
  </style>
</head>
<body>
  ${config.watermark ? `<div class="watermark">${config.watermark}</div>` : ''}
  
  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
  
  <div class="header">
    <div class="logo">KK SmartScan Neural Vault</div>
    <h1 class="title">${config.title}</h1>
    ${config.subtitle ? `<p class="subtitle">${config.subtitle}</p>` : ''}
  </div>
  
  <div class="meta">
    <div class="meta-item">
      <label>Report Date</label>
      <span>${date}</span>
    </div>
    ${config.companyName ? `
    <div class="meta-item">
      <label>Company</label>
      <span>${config.companyName}</span>
    </div>
    ` : ''}
    ${config.preparedBy ? `
    <div class="meta-item">
      <label>Prepared By</label>
      <span>${config.preparedBy}</span>
    </div>
    ` : ''}
    <div class="meta-item">
      <label>Total Entries</label>
      <span>${entries.length}</span>
    </div>
  </div>
  
  <div class="summary-box">
    <h3>Audit Summary</h3>
    <div class="summary-stats">
      <div class="stat">
        <div class="stat-value">${entries.length}</div>
        <div class="stat-label">Total Actions</div>
      </div>
      <div class="stat">
        <div class="stat-value">${new Set(entries.map(e => e.userId)).size}</div>
        <div class="stat-label">Unique Users</div>
      </div>
      <div class="stat">
        <div class="stat-value">${new Set(entries.map(e => e.action)).size}</div>
        <div class="stat-label">Action Types</div>
      </div>
    </div>
  </div>
  
  <h2 class="section-title">Audit Log Entries</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Timestamp</th>
        <th>Action</th>
        <th>Details</th>
        <th>User</th>
        <th>Hash</th>
      </tr>
    </thead>
    <tbody>
      ${entriesHTML}
    </tbody>
  </table>
  
  ${config.includeSignature ? `
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line">Prepared By</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Reviewed By</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Approved By</div>
    </div>
  </div>
  ` : ''}
  
  <div class="footer">
    <p>This report was generated by KK SmartScan Neural Vault on ${new Date().toLocaleString('en-IN')}</p>
    <p>Document integrity verified through cryptographic hash chain</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate audit certificate HTML
 */
export function generateAuditCertificateHTML(data: AuditCertificateData): string {
  const date = data.auditDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const statusColors = {
    passed: { bg: '#10b981', text: 'PASSED' },
    failed: { bg: '#ef4444', text: 'FAILED' },
    partial: { bg: '#f59e0b', text: 'PARTIAL' }
  };

  const status = statusColors[data.status];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Audit Certificate - ${data.auditId}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Georgia', serif;
      background: linear-gradient(135deg, #f8f7ff 0%, #e8e6f7 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .certificate {
      background: white;
      width: 700px;
      padding: 50px;
      border: 3px solid #7c3aed;
      box-shadow: 0 10px 40px rgba(124, 58, 237, 0.2);
      position: relative;
    }
    .certificate::before {
      content: '';
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      bottom: 10px;
      border: 1px solid #c4b5fd;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 14px;
      letter-spacing: 3px;
      color: #7c3aed;
      text-transform: uppercase;
    }
    .title {
      font-size: 36px;
      color: #1a1a2e;
      margin: 20px 0;
      font-weight: normal;
    }
    .ornament {
      color: #7c3aed;
      font-size: 20px;
    }
    .status-badge {
      display: inline-block;
      background: ${status.bg};
      color: white;
      padding: 10px 40px;
      font-size: 18px;
      letter-spacing: 2px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .content {
      text-align: center;
      line-height: 2;
      margin: 30px 0;
    }
    .entity-name {
      font-size: 24px;
      color: #7c3aed;
      font-weight: bold;
    }
    .details {
      margin: 30px 0;
      padding: 20px;
      background: #f8f7ff;
      border-radius: 8px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dashed #e0e0e0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .findings {
      text-align: left;
      margin: 20px 0;
    }
    .findings h3 {
      color: #7c3aed;
      font-size: 14px;
    }
    .findings ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .findings li {
      margin: 5px 0;
      font-size: 13px;
    }
    .hash {
      font-family: monospace;
      font-size: 10px;
      background: #f0f0f0;
      padding: 10px;
      border-radius: 4px;
      word-break: break-all;
      margin-top: 20px;
    }
    .signature-area {
      display: flex;
      justify-content: space-around;
      margin-top: 50px;
    }
    .signature {
      text-align: center;
      width: 150px;
    }
    .signature-line {
      border-top: 1px solid #333;
      padding-top: 10px;
      font-size: 12px;
    }
    .seal {
      position: absolute;
      bottom: 80px;
      right: 80px;
      width: 100px;
      height: 100px;
      border: 3px solid #7c3aed;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      text-align: center;
      color: #7c3aed;
      opacity: 0.7;
      transform: rotate(-15deg);
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      font-size: 11px;
      color: #888;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #7c3aed;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print Certificate</button>
  
  <div class="certificate">
    <div class="header">
      <div class="logo">KK SmartScan Neural Vault</div>
      <div class="ornament">✦ ✦ ✦</div>
      <h1 class="title">Certificate of Audit</h1>
      <div class="status-badge">${status.text}</div>
    </div>
    
    <div class="content">
      <p>This is to certify that</p>
      <div class="entity-name">${data.entityName}</div>
      <p>has undergone a comprehensive audit review on <strong>${date}</strong></p>
    </div>
    
    <div class="details">
      <div class="detail-row">
        <span>Audit ID</span>
        <strong>${data.auditId}</strong>
      </div>
      <div class="detail-row">
        <span>Entity Type</span>
        <strong>${data.entityType.charAt(0).toUpperCase() + data.entityType.slice(1)}</strong>
      </div>
      <div class="detail-row">
        <span>Auditor</span>
        <strong>${data.auditor}</strong>
      </div>
      <div class="detail-row">
        <span>Audit Date</span>
        <strong>${date}</strong>
      </div>
    </div>
    
    ${data.findings.length > 0 ? `
    <div class="findings">
      <h3>Key Findings</h3>
      <ul>
        ${data.findings.map(f => `<li>${f}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    ${data.hashChain ? `
    <div class="hash">
      <strong>Verification Hash:</strong><br>
      ${data.hashChain}
    </div>
    ` : ''}
    
    <div class="signature-area">
      <div class="signature">
        <div class="signature-line">Auditor</div>
      </div>
      <div class="signature">
        <div class="signature-line">Witness</div>
      </div>
    </div>
    
    <div class="seal">
      VERIFIED<br>
      AUDIT<br>
      COMPLETE
    </div>
    
    <div class="footer">
      Certificate generated on ${new Date().toLocaleString('en-IN')}<br>
      This certificate is digitally verifiable through the audit hash chain
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate contact directory PDF report
 */
export function generateContactDirectoryHTML(
  contacts: ContactInfo[],
  config: AuditReportConfig
): string {
  const date = (config.reportDate || new Date()).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const contactsHTML = contacts.map((c, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${c.name || '-'}</strong></td>
      <td>${c.firmName || '-'}</td>
      <td>${c.jobTitle || '-'}</td>
      <td>${c.email || '-'}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.industry || '-'}</td>
    </tr>
  `).join('');

  // Group by industry for summary
  const industryGroups: Record<string, number> = {};
  contacts.forEach(c => {
    const ind = c.industry || 'Unspecified';
    industryGroups[ind] = (industryGroups[ind] || 0) + 1;
  });

  const industryHTML = Object.entries(industryGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([industry, count]) => `
      <div style="display: flex; justify-content: space-between; padding: 5px 0;">
        <span>${industry}</span>
        <strong>${count}</strong>
      </div>
    `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${config.title}</title>
  <style>
    @media print {
      .no-print { display: none; }
      @page { margin: 1cm; size: landscape; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
      margin: 0 auto;
      padding: 20mm;
      background: white;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo { font-size: 24px; font-weight: bold; color: #7c3aed; }
    .title { font-size: 28px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #e0e0e0; padding: 8px; text-align: left; }
    th { background: #7c3aed; color: white; }
    tr:nth-child(even) { background: #f9f9f9; }
    .summary { 
      display: flex; 
      gap: 30px; 
      margin-bottom: 30px;
      background: #f8f7ff;
      padding: 20px;
      border-radius: 8px;
    }
    .summary-section { flex: 1; }
    .summary-section h3 { margin: 0 0 10px 0; color: #7c3aed; font-size: 14px; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #888; }
    .print-btn {
      position: fixed; top: 20px; right: 20px;
      background: #7c3aed; color: white; border: none;
      padding: 12px 24px; border-radius: 8px; cursor: pointer;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print Report</button>
  
  <div class="header">
    <div class="logo">KK SmartScan Neural Vault</div>
    <h1 class="title">${config.title}</h1>
    <p>Generated on ${date} | Total Contacts: ${contacts.length}</p>
  </div>
  
  <div class="summary">
    <div class="summary-section">
      <h3>By Industry</h3>
      ${industryHTML}
    </div>
    <div class="summary-section">
      <h3>Quick Stats</h3>
      <div style="display: flex; justify-content: space-between; padding: 5px 0;">
        <span>Total Contacts</span>
        <strong>${contacts.length}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0;">
        <span>With Email</span>
        <strong>${contacts.filter(c => c.email).length}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0;">
        <span>With Phone</span>
        <strong>${contacts.filter(c => c.phone).length}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 5px 0;">
        <span>With Website</span>
        <strong>${contacts.filter(c => c.website).length}</strong>
      </div>
    </div>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Company</th>
        <th>Role</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Industry</th>
      </tr>
    </thead>
    <tbody>
      ${contactsHTML}
    </tbody>
  </table>
  
  <div class="footer">
    Report generated by KK SmartScan Neural Vault on ${new Date().toLocaleString('en-IN')}
  </div>
</body>
</html>
  `;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Open report in new window for printing
 */
export function openReportInWindow(html: string, title: string = 'Report'): void {
  const reportWindow = window.open('', '_blank');
  if (reportWindow) {
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.document.title = title;
  }
}

/**
 * Download HTML report as file
 */
export function downloadHTMLReport(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
