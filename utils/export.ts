
import { ContactInfo } from "../types";

export interface ExportColumn {
  key: keyof ContactInfo;
  label: string;
}

/**
 * Generates a Batch Timestamp in a readable format
 */
function getBatchTimestamp(): string {
  const now = new Date();
  return now.toLocaleString('en-IN', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
}

export function generateCSV(contacts: ContactInfo[], selectedColumns: ExportColumn[]): string {
  if (contacts.length === 0) return "";
  
  const timestamp = getBatchTimestamp();
  const headers = [...selectedColumns.map(col => `"${col.label.replace(/"/g, '""')}"`), '"Batch Timestamp"'];
  
  const rows = contacts.map(contact => {
    const fields = selectedColumns.map(col => {
      const value = (contact[col.key] as string) || "";
      return `"${value.toString().replace(/"/g, '""')}"`;
    });
    fields.push(`"${timestamp}"`);
    return fields.join(",");
  });
  
  return [headers.join(","), ...rows].join("\n");
}

export function generateVCF(contacts: ContactInfo[]): string {
  const timestamp = getBatchTimestamp();
  return contacts.map(c => {
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${c.name}`,
      `ORG:${c.firmName}`,
      `TITLE:${c.jobTitle}`,
      `TEL;TYPE=WORK,VOICE:${c.phone}`,
      `EMAIL;TYPE=PREF,INTERNET:${c.email}`,
      `ADR;TYPE=WORK:;;${c.address.replace(/\n/g, ' ')}`,
      `URL:${c.website}`,
      `NOTE:TitanVault Batch Node - Synced: ${timestamp}. ${c.notes}`,
      "END:VCARD"
    ].join("\n");
  }).join("\n\n");
}

export function generateXML(contacts: ContactInfo[]): string {
  const timestamp = getBatchTimestamp();
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
  
  const contactNodes = contacts.map(c => `
  <Contact>
    <ID>${c.id}</ID>
    <Name>${c.name || ''}</Name>
    <Firm>${c.firmName || ''}</Firm>
    <Role>${c.jobTitle || ''}</Role>
    <Email>${c.email || ''}</Email>
    <Phone>${c.phone || ''}</Phone>
    <Sector>${c.industry || ''}</Sector>
    <Pincode>${c.pincode || ''}</Pincode>
    <Address>${c.address || ''}</Address>
    <Website>${c.website || ''}</Website>
    <SyncDate>${new Date(c.createdAt).toISOString()}</SyncDate>
  </Contact>`).join('');

  return `${xmlHeader}
<TitanVaultBatch>
  <BatchMetadata>
    <Timestamp>${timestamp}</Timestamp>
    <TotalRecords>${contacts.length}</TotalRecords>
  </BatchMetadata>
  <Contacts>${contactNodes}
  </Contacts>
</TitanVaultBatch>`;
}

export function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== ERP EXPORT TEMPLATES ====================

export type ERPSystem = 'sap' | 'oracle' | 'tally';

/**
 * Generate SAP IDoc format for business partner master data
 * DEBMAS05/DEBMAS06 compatible format
 */
export function generateSAPiDoc(contacts: ContactInfo[]): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const docNumber = `KK${Date.now().toString().slice(-10)}`;
  
  const segments: string[] = [];
  
  // EDI_DC40 - Control Record
  segments.push(`EDI_DC40`);
  segments.push(`TABNAM=EDI_DC40`);
  segments.push(`MANDT=100`);
  segments.push(`DOCNUM=${docNumber}`);
  segments.push(`DOCREL=750`);
  segments.push(`STATUS=30`);
  segments.push(`DIRECT=2`);
  segments.push(`OUTMOD=2`);
  segments.push(`IDOCTYP=DEBMAS06`);
  segments.push(`MESTYP=DEBMAS`);
  segments.push(`SNDPOR=KKSMARTSCAN`);
  segments.push(`SNDPRT=LS`);
  segments.push(`SNDPRN=KKSCAN01`);
  segments.push(`RCVPOR=SAPCLNT100`);
  segments.push(`RCVPRT=LS`);
  segments.push(`RCVPRN=SAPERP01`);
  segments.push(`CREDAT=${timestamp.slice(0, 8)}`);
  segments.push(`CRETIM=${timestamp.slice(8, 14)}`);
  segments.push(`---`);
  
  contacts.forEach((c, idx) => {
    const customerNum = `KK${String(idx + 1).padStart(8, '0')}`;
    
    // E1KNA1M - General Customer Data
    segments.push(`E1KNA1M`);
    segments.push(`KUNNR=${customerNum}`);
    segments.push(`NAME1=${(c.name || '').slice(0, 35)}`);
    segments.push(`NAME2=${(c.firmName || '').slice(0, 35)}`);
    segments.push(`SORTL=${(c.name || '').toUpperCase().slice(0, 10)}`);
    segments.push(`STRAS=${(c.address || '').slice(0, 35)}`);
    segments.push(`PSTLZ=${c.pincode || ''}`);
    segments.push(`LAND1=IN`);
    segments.push(`SPRAS=EN`);
    segments.push(`TELF1=${(c.phone || '').replace(/\D/g, '').slice(0, 16)}`);
    segments.push(`TELFX=`);
    segments.push(`STCD1=${c.gstin || ''}`);
    segments.push(`STCD2=${c.pan || ''}`);
    segments.push(`---`);
    
    // E1KNA11 - Customer Email
    if (c.email) {
      segments.push(`E1KNA11`);
      segments.push(`SMTP_ADDR=${c.email}`);
      segments.push(`---`);
    }
    
    // E1KNVVM - Sales Area Data
    segments.push(`E1KNVVM`);
    segments.push(`VKORG=1000`);
    segments.push(`VTWEG=10`);
    segments.push(`SPART=00`);
    segments.push(`BZIRK=IN0001`);
    segments.push(`BRSCH=${mapIndustryToSAPCode(c.industry || '')}`);
    segments.push(`---`);
  });
  
  return segments.join('\n');
}

/**
 * Map industry to SAP industry sector code
 */
function mapIndustryToSAPCode(industry: string): string {
  const codes: Record<string, string> = {
    'Technology': 'Z001',
    'Finance': 'Z002',
    'Healthcare': 'Z003',
    'Manufacturing': 'Z004',
    'Retail': 'Z005',
    'Education': 'Z006',
    'Services': 'Z007',
    'Construction': 'Z008',
    'Government': 'Z009',
    'Other': 'Z999'
  };
  return codes[industry] || 'Z999';
}

/**
 * Generate Oracle ERP Cloud import format (FBDI)
 * File-Based Data Import for Customer Master
 */
export function generateOracleImport(contacts: ContactInfo[]): string {
  const timestamp = getBatchTimestamp();
  const lines: string[] = [];
  
  // Header line
  lines.push([
    'PARTY_ORIG_SYSTEM',
    'PARTY_ORIG_SYSTEM_REFERENCE',
    'PARTY_TYPE',
    'ORGANIZATION_NAME',
    'PERSON_FIRST_NAME',
    'PERSON_LAST_NAME',
    'ADDRESS_LINE1',
    'ADDRESS_LINE2',
    'POSTAL_CODE',
    'COUNTRY',
    'PHONE_NUMBER',
    'EMAIL_ADDRESS',
    'CUST_ACCT_ORIG_SYSTEM',
    'CUST_ACCT_ORIG_SYS_REF',
    'ACCOUNT_NAME',
    'ACCOUNT_NUMBER',
    'BILL_TO_FLAG',
    'SHIP_TO_FLAG',
    'TAX_REFERENCE',
    'DUNS_NUMBER',
    'SIC_CODE',
    'CREATION_DATE',
    'LAST_UPDATE_DATE'
  ].join(','));
  
  contacts.forEach((c, idx) => {
    const partyRef = `KK_PARTY_${String(idx + 1).padStart(6, '0')}`;
    const acctRef = `KK_ACCT_${String(idx + 1).padStart(6, '0')}`;
    const [firstName, ...lastNameParts] = (c.name || 'Unknown').split(' ');
    const lastName = lastNameParts.join(' ') || firstName;
    
    lines.push([
      'KKSMARTSCAN',
      partyRef,
      c.firmName ? 'ORGANIZATION' : 'PERSON',
      `"${(c.firmName || '').replace(/"/g, '""')}"`,
      `"${firstName.replace(/"/g, '""')}"`,
      `"${lastName.replace(/"/g, '""')}"`,
      `"${(c.address || '').split('\n')[0]?.replace(/"/g, '""') || ''}"`,
      `"${(c.address || '').split('\n').slice(1).join(' ')?.replace(/"/g, '""') || ''}"`,
      c.pincode || '',
      'IN',
      (c.phone || '').replace(/\D/g, ''),
      c.email || '',
      'KKSMARTSCAN',
      acctRef,
      `"${(c.firmName || c.name || '').replace(/"/g, '""')}"`,
      partyRef.replace('PARTY', 'NUM'),
      'Y',
      'Y',
      c.gstin || '',
      '',
      mapIndustryToSICCode(c.industry || ''),
      new Date(c.createdAt).toISOString().slice(0, 10),
      timestamp.slice(0, 10)
    ].join(','));
  });
  
  return lines.join('\n');
}

/**
 * Map industry to SIC code
 */
function mapIndustryToSICCode(industry: string): string {
  const codes: Record<string, string> = {
    'Technology': '7370',
    'Finance': '6021',
    'Healthcare': '8011',
    'Manufacturing': '3999',
    'Retail': '5411',
    'Education': '8221',
    'Services': '7389',
    'Construction': '1520',
    'Government': '9199',
    'Other': '9999'
  };
  return codes[industry] || '9999';
}

/**
 * Generate Tally Prime XML import format
 * Masters > Ledgers import compatible
 */
export function generateTallyXML(contacts: ContactInfo[]): string {
  const timestamp = new Date().toISOString();
  
  const ledgers = contacts.map((c, idx) => {
    const ledgerName = c.firmName || c.name || `Contact_${idx + 1}`;
    const parent = determineTallyParentGroup(c);
    
    return `
    <LEDGER NAME="${escapeXML(ledgerName)}" RESERVEDNAME="">
      <GUID>KKSmartScan-${c.id}</GUID>
      <ALTERID>${idx + 1}</ALTERID>
      <NAME>${escapeXML(ledgerName)}</NAME>
      <PARENT>${parent}</PARENT>
      <CURRENCYNAME>₹</CURRENCYNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <LEDSTATENAME>India</LEDSTATENAME>
      <PINCODE>${c.pincode || ''}</PINCODE>
      <MAILINGNAME.LIST TYPE="String">
        <MAILINGNAME>${escapeXML(c.name || '')}</MAILINGNAME>
      </MAILINGNAME.LIST>
      <ADDRESS.LIST TYPE="String">
        <ADDRESS>${escapeXML(c.address || '')}</ADDRESS>
      </ADDRESS.LIST>
      <LEDGERPHONE>${c.phone || ''}</LEDGERPHONE>
      <LEDGERMOBILE>${c.phone || ''}</LEDGERMOBILE>
      <LEDGERFAX></LEDGERFAX>
      <EMAIL>${c.email || ''}</EMAIL>
      <WEBSITE>${c.website || ''}</WEBSITE>
      <INCOMETAXNUMBER>${c.pan || ''}</INCOMETAXNUMBER>
      <PARTYGSTIN>${c.gstin || ''}</PARTYGSTIN>
      <GSTREGISTRATIONTYPE>${c.gstin ? 'Regular' : 'Unregistered'}</GSTREGISTRATIONTYPE>
      <COUNTRYNAME>India</COUNTRYNAME>
      <LEDGERCONTACT>${escapeXML(c.name || '')}</LEDGERCONTACT>
      <ISBILLWISEON>Yes</ISBILLWISEON>
      <AFFECTSGSTFLAG>Yes</AFFECTSGSTFLAG>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
      <ISREVENUE>No</ISREVENUE>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <LANGUAGENAME.LIST>
        <NAME.LIST TYPE="String">
          <NAME>${escapeXML(ledgerName)}</NAME>
        </NAME.LIST>
        <LANGUAGEID>1033</LANGUAGEID>
      </LANGUAGENAME.LIST>
    </LEDGER>`;
  }).join('');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>##SVCURRENTCOMPANY</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COMPANY>
            <REMOTECMPINFO.LIST MERGE="Yes">
              <NAME>KKSmartScan Import</NAME>
              <REMOTECMPNAME>##SVCURRENTCOMPANY</REMOTECMPNAME>
              <REMOTECMPSTATE>India</REMOTECMPSTATE>
            </REMOTECMPINFO.LIST>
          </COMPANY>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          ${ledgers}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
  <METADATA>
    <SOURCE>KKSmartScan Neural Vault</SOURCE>
    <EXPORTTIME>${timestamp}</EXPORTTIME>
    <TOTALRECORDS>${contacts.length}</TOTALRECORDS>
  </METADATA>
</ENVELOPE>`;
}

/**
 * Determine Tally parent group based on contact data
 */
function determineTallyParentGroup(contact: ContactInfo): string {
  // Could be enhanced based on business logic
  if (contact.industry === 'Finance') return 'Sundry Creditors';
  return 'Sundry Debtors';
}

/**
 * Escape XML special characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export contacts to specified ERP format
 */
export function exportToERP(contacts: ContactInfo[], system: ERPSystem): { content: string; fileName: string; mimeType: string } {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  switch (system) {
    case 'sap':
      return {
        content: generateSAPiDoc(contacts),
        fileName: `kksmartscan_sap_idoc_${timestamp}.txt`,
        mimeType: 'text/plain'
      };
    case 'oracle':
      return {
        content: generateOracleImport(contacts),
        fileName: `kksmartscan_oracle_fbdi_${timestamp}.csv`,
        mimeType: 'text/csv'
      };
    case 'tally':
      return {
        content: generateTallyXML(contacts),
        fileName: `kksmartscan_tally_import_${timestamp}.xml`,
        mimeType: 'application/xml'
      };
    default:
      throw new Error(`Unsupported ERP system: ${system}`);
  }
}
