
import React, { useState, useMemo } from 'react';
import { ContactInfo } from '../types';
import { 
  Trash2, Edit3, Save, Phone, Mail, Building, 
  CheckCircle2, Tag, Briefcase, User,
  Zap, Download, Smartphone, Hash, QrCode, X, Share2,
  ShieldCheck, AlertTriangle, Target
} from 'lucide-react';
import { generateVCF, downloadFile } from '../utils/export';

interface ContactCardProps {
  contact: ContactInfo;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updated: Partial<ContactInfo>) => void;
  onToggleSelect: (id: string) => void;
  leadScore?: { score: number; grade: string } | null;
}

const ContactCard: React.FC<ContactCardProps> = ({ contact, onDelete, onUpdate, onToggleSelect, leadScore }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [edited, setEdited] = useState(contact);

  const handleSave = () => {
    onUpdate(contact.id, edited);
    setIsEditing(false);
  };

  const handleVCFDownload = () => {
    const vcf = generateVCF([contact]);
    downloadFile(vcf, `${contact.name.replace(/\s+/g, '_')}_ID.vcf`, 'text/vcard');
  };

  const isDataSolid = useMemo(() => {
    return contact.phone && contact.email && contact.name && contact.pincode;
  }, [contact]);

  const industryStyles = useMemo(() => {
    const ind = contact.industry?.toLowerCase() || '';
    if (ind.includes('tech')) return { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' };
    if (ind.includes('finance')) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
    if (ind.includes('creative')) return { color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30' };
    return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' };
  }, [contact.industry]);

  if (contact.status === 'processing') {
    return (
      <div className="glass h-[540px] rounded-[3rem] animate-pulse flex flex-col items-center justify-center gap-6">
        <div className="relative">
           <div className="w-24 h-24 bg-indigo-500/5 rounded-full flex items-center justify-center animate-spin-slow"></div>
           <Zap size={32} className="text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Neural Parsing</p>
      </div>
    );
  }

  return (
    <div className={`glass relative rounded-[3.5rem] overflow-hidden transition-all duration-500 group flex flex-col h-[540px] ${contact.selected ? 'ring-2 ring-indigo-500 border-transparent shadow-glow' : 'border-white/5 hover:border-white/10 hover:-translate-y-2'}`}>
      
      {/* QR MODAL OVERLAY */}
      {showQR && (
        <div className="absolute inset-0 z-[60] glass-dark flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-300">
           <button onClick={() => setShowQR(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X size={24} /></button>
           <div className="p-6 bg-white rounded-3xl mb-6 shadow-2xl">
             <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generateVCF([contact]))}`} alt="Contact QR" />
           </div>
           <h4 className="text-white font-black uppercase tracking-tighter text-xl mb-1">Identity Node</h4>
           <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">Scan to import directly</p>
        </div>
      )}

      {/* SELECTION OVERLAY */}
      <div className="absolute top-8 left-8 z-30 flex items-center gap-4">
        <button onClick={() => onToggleSelect(contact.id)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${contact.selected ? 'bg-indigo-600 text-white shadow-glow' : 'bg-slate-900/60 backdrop-blur-xl text-transparent border border-white/10 hover:border-indigo-500/40'}`}>
          <CheckCircle2 size={20} strokeWidth={3} />
        </button>
        <div className={`px-4 py-2 rounded-xl backdrop-blur-xl border border-white/5 flex items-center gap-2 ${isDataSolid ? 'text-emerald-500 bg-emerald-500/5' : 'text-amber-500 bg-amber-500/5'}`}>
           {isDataSolid ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
           <span className="text-[9px] font-black uppercase tracking-widest">{isDataSolid ? 'Verified' : 'Low Confidence'}</span>
        </div>
      </div>

      {/* HEADER PREVIEW */}
      <div className="h-44 flex-none bg-slate-900 relative group/img overflow-hidden">
        <img src={contact.imageSource} className="w-full h-full object-cover grayscale opacity-60 group-hover/img:grayscale-0 group-hover/img:opacity-100 transition-all duration-1000" alt="" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
        <div className="absolute bottom-4 left-8 right-8 flex justify-between items-center">
           <div className="flex items-center gap-2">
             <span className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest ${industryStyles.bg} ${industryStyles.color} ${industryStyles.border} backdrop-blur-md`}>
               {contact.industry || 'Lead'}
             </span>
             {leadScore && (
               <span className={`px-3 py-2 rounded-xl border text-[9px] font-black backdrop-blur-md flex items-center gap-1.5 ${
                 leadScore.grade === 'A' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                 leadScore.grade === 'B' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                 leadScore.grade === 'C' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                 leadScore.grade === 'D' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                 'bg-rose-500/20 text-rose-400 border-rose-500/30'
               }`}>
                 <Target size={10} />
                 {leadScore.grade}
               </span>
             )}
           </div>
           <button onClick={() => setShowQR(true)} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all backdrop-blur-md"><QrCode size={16} /></button>
        </div>
      </div>

      {/* CONTENT BODY */}
      <div className="flex-1 p-10 space-y-4 overflow-y-auto custom-scrollbar">
        {isEditing ? (
          <div className="space-y-3 animate-in fade-in zoom-in-95">
            <input value={edited.name} onChange={e => setEdited({...edited, name: e.target.value})} className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-3 text-sm font-bold text-white focus:ring-2 ring-indigo-500 outline-none" placeholder="Name" />
            <input value={edited.firmName} onChange={e => setEdited({...edited, firmName: e.target.value})} className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-3 text-sm font-bold text-white focus:ring-2 ring-indigo-500 outline-none" placeholder="Firm" />
            <div className="grid grid-cols-2 gap-2">
              <input value={edited.email} onChange={e => setEdited({...edited, email: e.target.value})} className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-4 py-3 text-xs font-bold text-white outline-none" placeholder="Email" />
              <input value={edited.phone} onChange={e => setEdited({...edited, phone: e.target.value})} className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-4 py-3 text-xs font-bold text-white outline-none" placeholder="Phone" />
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={handleSave} className="flex-1 bg-indigo-600 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest">Update</button>
              <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-800 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest">X</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h3 className="text-3xl font-black text-white truncate tracking-tighter group-hover:text-indigo-400 transition-colors duration-300">{contact.name || 'ANONYMOUS'}</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                 <Briefcase size={12} className="text-indigo-500" /> {contact.jobTitle || 'Executive Node'}
              </p>
            </div>
            
            <div className="space-y-3 py-6 border-y border-white/5">
              <div className="flex items-center gap-4 text-slate-400">
                <Building size={16} className="text-slate-600" />
                <span className="truncate text-sm font-bold tracking-tight">{contact.firmName || 'Independent'}</span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <Mail size={16} className="text-slate-600" />
                <span className="truncate text-sm font-black tracking-tight text-emerald-500">{contact.email || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <Smartphone size={16} className="text-slate-600" />
                <span className="truncate text-md font-black tracking-tight text-white">{contact.phone || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <Hash size={16} className="text-slate-600" />
                <span className="truncate text-sm font-bold tracking-tight bg-slate-900/80 px-3 py-1 rounded-lg border border-white/5">{contact.pincode || '—'}</span>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button onClick={handleVCFDownload} className="flex-1 h-14 bg-white/5 rounded-2xl hover:bg-indigo-600/20 text-slate-500 hover:text-indigo-400 transition-all flex items-center justify-center gap-3 text-[9px] font-black uppercase tracking-widest border border-white/5">
                <Download size={18} /> .VCF
              </button>
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(true)} className="w-14 h-14 bg-white/5 rounded-2xl hover:bg-white/10 text-slate-600 hover:text-white transition-all flex items-center justify-center">
                  <Edit3 size={18} />
                </button>
                <button onClick={() => onDelete(contact.id)} className="w-14 h-14 bg-rose-500/5 rounded-2xl hover:bg-rose-500/20 text-rose-500/30 hover:text-rose-500 transition-all flex items-center justify-center border border-rose-500/10">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ContactCard;
