<div align="center">

# 🎴 HRA VC Scan - Neural Vault

### AI-Powered Business Card Scanner & Contact Management System

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite)](https://vitejs.dev)




**Intelligent business card scanning with enterprise-grade features for contact management, compliance tracking, and team collaboration.**

</div>

---

## ✨ Features

### 🔍 Core Scanning
- **AI-Powered Extraction** - Uses Google Gemini 2.0 Flash for accurate OCR
- **Multi-Card Support** - Extract multiple contacts from a single image/PDF
- **Image Compression** - Optimizes images before AI processing (40-60% token savings)
- **Smart Caching** - Hash-based deduplication to avoid reprocessing

### 📇 Contact Management
- **IndexedDB Storage** - Fast local-first data persistence
- **Advanced Search** - Full-text search with filters and quick presets
- **Duplicate Detection** - Fuzzy matching to identify potential duplicates
- **Batch Operations** - Bulk edit, delete, and merge with concurrency control

### 🔒 Security & Compliance
- **AES-256-GCM Encryption** - PII encryption at rest
- **Cryptographic Audit Log** - SHA-256 hash chain for tamper-proof audit trail
- **Session Security** - Auto-lock, sudo mode, PIN protection
- **GSTIN/PAN/Aadhar Validation** - Indian compliance with checksum verification
- **KYC Workflow** - State machine for compliance approvals

### 📊 Enterprise Features
- **ERP Export Templates** - SAP IDoc, Oracle FBDI, Tally XML formats
- **PDF Audit Reports** - Printable certificates and compliance reports
- **Expiry Tracking** - Document/license monitoring with visual countdowns
- **Timesheet Logging** - Track time spent on audit tasks
- **Lead Scoring** - AI-driven prioritization with grades (A-F)

### 👥 Team Collaboration
- **Comments & Threads** - Discuss contacts with reactions and @mentions
- **Activity Feed** - Real-time team activity tracking
- **Shared Notes** - Collaborative notes with templates
- **Reminder System** - Follow-up scheduling with notifications

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Google Gemini API Key ([Get one here](https://aistudio.google.com/apikey))

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/HRA_VC_SCAN.git
cd HRA_VC_SCAN

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
```

### Configuration

Edit `.env.local` with your credentials:

```env
GEMINI_API_KEY=your_gemini_api_key_here
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here  # Optional: for Google Sign-In
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
HRA_VC_SCAN/
├── App.tsx                 # Main application component
├── types.ts                # TypeScript interfaces
├── components/
│   ├── ContactCard.tsx     # Card view component
│   └── ContactTable.tsx    # Table view component
├── services/
│   ├── gemini.ts           # Gemini AI integration
│   ├── database.ts         # IndexedDB operations
│   ├── auditLog.ts         # Cryptographic audit logging
│   ├── sessionSecurity.ts  # Auto-lock & sudo mode
│   ├── piiEncryption.ts    # AES-GCM encryption
│   ├── kycWorkflow.ts      # KYC state machine
│   ├── expiryTracking.ts   # Document expiry monitoring
│   ├── timesheetService.ts # Time tracking
│   ├── exportService.ts    # Multi-format export
│   ├── importService.ts    # CSV/JSON/vCard import
│   ├── batchOperations.ts  # Bulk operations
│   ├── searchService.ts    # Advanced search
│   └── ...                 # Additional services
└── utils/
    ├── validators.ts       # GSTIN/PAN/Aadhar validation
    ├── export.ts           # ERP export templates
    ├── duplicateDetection.ts # Fuzzy matching
    └── imageProcessor.ts   # Image compression
```

---

## 🔧 Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Build | Vite 6.x |
| AI/ML | Google Gemini 2.0 Flash |
| Storage | IndexedDB (Dexie) |
| Icons | Lucide React |
| Encryption | Web Crypto API (AES-GCM, SHA-256) |

---

## 📋 API Reference

### Core Functions

```typescript
// Extract contacts from image/PDF
extractContactFromDocument(base64Data: string, mimeType: string): Promise<ExtractionResult[]>

// Search contacts
searchContacts(contacts: ContactInfo[], query: SearchQuery): ContactInfo[]

// Encrypt sensitive fields
encryptSensitiveFields<T>(obj: T, fields?: string[]): Promise<T>

// Validate GSTIN
validateGSTIN(gstin: string): ValidationResult

// Create KYC record
createKYCRecord(contactId: string, userId: string, userName: string): KYCRecord
```

---

## 🛡️ Security Features

### Encryption
- **Algorithm**: AES-256-GCM with 128-bit authentication tag
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Encrypted Fields**: phone, email, address, pincode, gstin, pan, aadhar

### Audit Trail
- **Hash Chain**: SHA-256 cryptographic linking
- **Immutable**: Each entry references previous hash
- **Verifiable**: Chain integrity can be validated

### Session Protection
- **Auto-Lock**: Configurable idle timeout (default: 5 minutes)
- **Sudo Mode**: Re-authentication for sensitive operations
- **Lockout**: Account lockout after failed attempts

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 Support

For support, please open an issue in the GitHub repository.

---

<div align="center">

**Made with ❤️ for efficient business card management**

</div>
