
import React, { useState } from 'react';
import { ContactInfo } from '../types';
import { 
  Trash2, Mail, Building, Briefcase, Download, 
  CheckCircle2, ChevronDown, FileSpreadsheet,
  Columns, X, Check, FileText, CheckSquare, Square,
  Code
} from 'lucide-react';
import { generateVCF, generateCSV, generateXML, downloadFile, ExportColumn } from '../utils/export';

interface ContactTableProps {
  contacts: ContactInfo[];
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onUpdate: (id: string, updated: Partial<ContactInfo>) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
}

const ALL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'firmName', label: 'Organization name' },
  { key: 'jobTitle', label: 'Role' },
  { key: 'address', label: 'Address' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'email', label: 'Email 1' },
  { key: 'phone', label: 'Phone number 1' },
  { key: 'industry', label: 'Sector' },
];

const ContactTable: React.FC<ContactTableProps> = ({ contacts, onDelete, onBulkDelete, onUpdate, onToggleSelect, onSelectAll }) => {
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [selectedColKeys, setSelectedColKeys] = useState<string[]>(ALL_EXPORT_COLUMNS.map(c => c.key));

  const selectedContacts = contacts.filter(c => c.selected);
  const allVisibleSelected = contacts.length > 0 && contacts.every(c => c.selected);

  const handleBulkExportCSV = () => {
    let colsToExport = ALL_EXPORT_COLUMNS.filter(c => selectedColKeys.includes(c.key));
    const csv = generateCSV(selectedContacts, colsToExport);
    downloadFile(csv, `TitanVault_Batch_${Date.now()}.csv`, 'text/csv');
  };

  const handleBulkExportVCF = () => {
    const vcf = generateVCF(selectedContacts);
    downloadFile(vcf, `TitanVault_Contacts_${Date.now()}.vcf`, 'text/vcard');
  };

  const handleBulkExportXML = () => {
    const xml = generateXML(selectedContacts);
    downloadFile(xml, `TitanVault_Batch_${Date.now()}.xml`, 'application/xml');
  };

  const handleExecuteBulkDelete = () => {
    const ids = selectedContacts.map(c => c.id);
    if (ids.length === 0) return;
    if(window.confirm(`Permanently purge ${ids.length} selected records?`)) {
      onBulkDelete(ids);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      {/* BATCH ACTION BAR */}
      {selectedContacts.length > 0 && (
        <div className="glass p-6 rounded-[2.5rem] border-l-8 border-indigo-600 flex items-center justify-between shadow-2xl animate-in slide-in-from-top-4 relative z-[60]">
          <div className="flex items-center gap-6 px-4">
            <div className="bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center font-black shadow-glow">{selectedContacts.length}</div>
            <div>
              <p className="text-white font-black uppercase tracking-widest text-[10px]">Records Selected</p>
              <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest text-glow">Active batch session</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setShowExportOptions(!showExportOptions)} 
                className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${showExportOptions ? 'bg-indigo-600 text-white shadow-glow' : 'bg-slate-900 text-slate-400 border border-white/5 hover:border-indigo-500/30'}`}
              >
                <Columns size={16} /> Config <ChevronDown size={14} className={showExportOptions ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              
              {/* CONFIG DROPDOWN */}
              {showExportOptions && (
                <div className="absolute top-full mt-4 right-0 w-80 glass-dark rounded-[2.5rem] p-8 z-[100] border border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] animate-in zoom-in-95 backdrop-blur-3xl">
                  <div className="absolute -top-2 right-12 w-4 h-4 bg-slate-900 rotate-45 border-l border-t border-white/10"></div>
                  <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Neural Mapping</h4>
                      <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Structure Export Data</p>
                    </div>
                    <button onClick={() => setShowExportOptions(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><X size={16} className="text-slate-500 hover:text-white" /></button>
                  </div>
                  <div className="grid gap-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                    {ALL_EXPORT_COLUMNS.map(col => (
                      <button 
                        key={col.key} 
                        onClick={() => setSelectedColKeys(prev => prev.includes(col.key) ? prev.filter(k => k !== col.key) : [...prev, col.key])} 
                        className={`flex items-center justify-between px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedColKeys.includes(col.key) ? 'bg-indigo-500/10 border-indigo-500/40 text-white' : 'bg-transparent border-white/5 text-slate-600 hover:text-slate-400 hover:border-white/10'}`}
                      >
                        {col.label} 
                        {selectedColKeys.includes(col.key) ? <Check size={14} className="text-indigo-400" /> : <Square size={14} className="opacity-20" />}
                      </button>
                    ))}
                  </div>
                  <div className="mt-8 pt-6 border-t border-white/5">
                    <button onClick={() => setShowExportOptions(false)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-glow">Apply Intelligence</button>
                  </div>
                </div>
              )}
            </div>
            
            <button onClick={handleBulkExportCSV} className="px-8 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-emerald-500 transition-all">
              <FileSpreadsheet size={16} /> CSV
            </button>
            
            <button onClick={handleBulkExportXML} className="px-8 py-4 bg-indigo-900/40 text-indigo-400 border border-indigo-500/30 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-indigo-500 hover:text-white transition-all">
              <Code size={16} /> XML
            </button>

            <button onClick={handleBulkExportVCF} className="px-8 py-4 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-slate-700 transition-all">
              <Download size={16} /> VCF
            </button>
            
            <div className="w-[1px] h-10 bg-white/10 mx-2"></div>
            <button onClick={handleExecuteBulkDelete} className="p-4 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all border border-rose-500/20 shadow-lg shadow-rose-500/10" title="Delete Selection"><Trash2 size={20} /></button>
          </div>
        </div>
      )}

      <div className="glass rounded-[3.5rem] overflow-hidden border border-white/5 shadow-2xl z-10 relative">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-10 py-10 text-[11px] font-black uppercase tracking-[0.4em] text-slate-600">
                  <div className="flex items-center gap-3">
                    <button onClick={onSelectAll} className={`p-2 rounded-lg transition-all ${allVisibleSelected ? 'bg-indigo-600 text-white shadow-glow' : 'bg-slate-900 border border-white/5 text-slate-600 hover:text-slate-400'}`} title="Select All Visible">
                      {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <span>Node</span>
                  </div>
                </th>
                <th className="px-10 py-10 text-[11px] font-black uppercase tracking-[0.4em] text-slate-600">Identity Structure</th>
                <th className="px-10 py-10 text-[11px] font-black uppercase tracking-[0.4em] text-slate-600">Organization</th>
                <th className="px-10 py-10 text-[11px] font-black uppercase tracking-[0.4em] text-slate-600">Channels</th>
                <th className="px-10 py-10 text-[11px] font-black uppercase tracking-[0.4em] text-slate-600 text-right">Operation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {contacts.map((contact) => (
                <tr key={contact.id} className={`group transition-all duration-300 hover:bg-white/[0.04] ${contact.selected ? 'bg-indigo-600/5' : ''}`}>
                  <td className="px-10 py-8">
                    <button onClick={() => onToggleSelect(contact.id)} className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${contact.selected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-950 border-white/5 text-transparent hover:border-indigo-500/50'}`}>
                      <CheckCircle2 size={18} strokeWidth={3} />
                    </button>
                  </td>
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-950 flex flex-none items-center justify-center border border-white/5 shadow-inner">
                        {contact.imageSource.includes('pdf') || contact.imageSource.includes('flaticon') ? <FileText size={24} className="text-rose-500" /> : <img src={contact.imageSource} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" alt="" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-xl text-white truncate group-hover:text-indigo-400 transition-colors duration-300">{contact.name || 'ANONYMOUS'}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{contact.jobTitle || 'Executive Node'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest truncate max-w-[200px]">{contact.firmName || '—'}</span>
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">{contact.industry}</span>
                    </div>
                  </td>
                  <td className="px-10 py-8 space-y-1">
                    <div className="flex items-center gap-3 text-emerald-500 text-[11px] font-bold truncate max-w-[200px]"><Mail size={12} /> {contact.email}</div>
                    <div className="flex items-center gap-3 text-indigo-400 text-[11px] font-bold"><Briefcase size={12} /> {contact.phone}</div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <button onClick={() => onDelete(contact.id)} className="p-3 text-rose-500/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all shadow-sm hover:shadow-rose-500/10" title="Delete record"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ContactTable;
