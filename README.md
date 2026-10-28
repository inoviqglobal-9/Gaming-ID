# Secure Private Scanner & Trader Panel | Enterprise MERN Stack Application

A secure, private, database-connected **MERN Stack Scanner and Trading Management System** engineered with strict financial integrity, role-based authorization, and modern dark-mode aesthetics modeled after the **FICHASPOT** enterprise interface.

---

## 🌟 Key Architecture & Security Features

1. **Login-First Gateway & Zero Public Registration:**
   - Public registration, sign-up forms, and open endpoints are strictly disabled.
   - Visitors cannot access protected routes without an authenticated session.
   - Initial Administrator account is created through a dedicated **one-time bootstrap CLI script**.
   - Client accounts can **only** be created by an authenticated Administrator.

2. **Session Security & Instant Revocation:**
   - Server-side session tokens stored with SHA-256 hashes in MongoDB.
   - Delivered via `HTTP-only`, `SameSite: 'lax'` secure cookies to prevent XSS credential theft.
   - **Instant revocation:** When a user is suspended or deactivated by an administrator, all active sessions and tokens are immediately revoked from MongoDB, preventing any further API access.

3. **FICHASPOT Visual Design System:**
   - Rich dark charcoal & black aesthetic (`#0B0F19`, `#111827`) with royal blue accents (`#2563EB`).
   - Interactive tables with pagination, search, status filters, row selection, CSV export, and modal controls.
   - Status indicators: Green (Confirmed / Active), Amber (Pending / Under Review), Red (Suspended / Rejected).

4. **Strict Financial Integrity & Ledger Isolation:**
   - **INR (₹) and USDT ($) are strictly isolated:** Fiat and crypto balances are never combined or treated as interchangeable.
   - **Unverified Payment Protection:** Unverified PayIns, pending bank deposits, or submitted screenshots **never** increase available balances.
   - **Atomic Ledger Updates:** Only independent administrator verification executes an atomic record into `BalanceLedger`.
   - **Duplicate-Reference Shield:** Unique sparse indexes prevent duplicate submission and duplicate crediting of transaction references or UTRs.

5. **Dynamic Scanner / QR Management:**
   - Admin upload portal for official scanner QR code assets (`image/png`, `image/jpeg`, `image/webp`).
   - Allows configuring custom instructions, display labels, and active status toggling.
   - Safe placeholder display when no asset is uploaded yet.

---

## 📂 Repository Structure

```text
GAMING SITE/
├── backend/
│   ├── config/
│   │   ├── db.js                 # MongoDB connection & disconnect handling
│   │   └── env.js                # Environment validator without credential leakage
│   ├── controllers/
│   │   ├── adminController.js    # Client management, bulk generation, analytics, CSV export
│   │   ├── auditController.js    # Immutable compliance and security audit logs
│   │   ├── authController.js     # Login, logout, session lookup, password change
│   │   ├── cryptoController.js   # USDT TRC20/ERC20 transfers and verification
│   │   ├── depositController.js  # Bank wire deposit requests & ledger verification
│   │   ├── payinController.js    # PayIn requests, reference submission, admin review
│   │   ├── payoutController.js   # Payout requests with masked details & verified deductions
│   │   └── scannerController.js  # QR scanner upload, preview, and activation
│   ├── middleware/
│   │   ├── auth.js               # Session validation, RBAC (ADMIN / CLIENT), revocation checks
│   │   ├── rateLimiter.js        # IP rate limiting on login & general endpoints
│   │   └── upload.js             # Safe image uploads with MIME & extension checks
│   ├── models/
│   │   ├── AuditLog.js           # Security & administrative actions log
│   │   ├── BalanceLedger.js      # Immutable financial ledger with atomic balance calculations
│   │   ├── CryptoRequest.js      # Crypto transaction requests
│   │   ├── DepositRequest.js     # Bank wire deposit requests
│   │   ├── PayInRequest.js       # PayIn requests with expiration and scanner binding
│   │   ├── PayoutRequest.js      # Payout requests with masked beneficiary data
│   │   ├── ScannerConfig.js      # Dynamic scanner QR configuration
│   │   ├── Session.js            # Server-side sessions with TTL auto-cleanup
│   │   └── User.js               # User accounts with bcrypt hashing (12 rounds)
│   ├── routes/                   # Modular Express REST API routes
│   ├── scripts/
│   │   └── bootstrapAdmin.js     # Secure one-time admin bootstrap CLI
│   ├── tests/                    # Automated integration & security test suite
│   ├── uploads/                  # Safe storage directory for scanner QR assets
│   ├── .env.example              # Environment variables template
│   ├── app.js                    # Express application configuration
│   ├── package.json              # Backend dependencies and scripts
│   └── server.js                 # Server startup and graceful termination
│
├── frontend/
│   ├── src/
│   │   ├── components/           # Navbar, Sidebar, Modal, StatusBadge, StatCard
│   │   ├── context/              # AuthContext (session, balances, login, logout)
│   │   ├── pages/
│   │   │   ├── admin/            # AdminDashboard, ManageClients, GenerateUsers,
│   │   │   │                     # AdminPayIns, AdminPayouts, AdminDeposits,
│   │   │   │                     # ScannerConfigPage, AuditLogsPage, AdminSettings
│   │   │   ├── client/           # ClientDashboard, PayInPage, PayoutPage,
│   │   │   │                     # DepositPage, CryptoPage, ProfilePage
│   │   │   └── LoginPage.jsx     # Dark luxury login gateway
│   │   ├── services/             # API client with credentials inclusion
│   │   ├── App.jsx               # Protected route switches & RBAC redirection
│   │   ├── index.css             # Tailwind CSS & dark theme styling
│   │   └── main.jsx              # React DOM mounting
│   ├── index.html                # Inter font and theme meta tags
│   ├── tailwind.config.js        # FICHASPOT color theme definitions
│   ├── vite.config.js            # Vite bundler with /api proxy
│   └── package.json              # Frontend dependencies and build scripts
│
├── .gitignore                    # Prevents leaking .env, node_modules, and uploads
├── package.json                  # Root unified scripts
└── README.md                     # Comprehensive documentation
```

---

## 🚀 Step-by-Step First Time Setup & Execution Guide

Follow these exact steps in **Windows PowerShell**:

### Step 1: Open the Project Directory

```powershell
cd "c:\Users\Asus\Desktop\GAMING SITE"
```

### Step 2: Configure Environment Variables

Create your `.env` file in the `backend/` directory by copying `backend/.env.example`:

```powershell
Copy-Item "backend\.env.example" -Destination "backend\.env"
```

Open `backend\.env` in your text editor (VS Code / Antigravity IDE) and customize your credentials:

```dotenv
# Port & Environment
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

# Database Connection (Local MongoDB or MongoDB Atlas URI)
MONGODB_URI=mongodb://127.0.0.1:27017/secure_scanner_trader

# Cryptographic Session Secret (At least 32 random characters)
SESSION_SECRET=a_very_long_secure_random_session_secret_2026_x9k2

# Initial Admin Bootstrap Credentials (Used ONLY once by npm run bootstrap:admin)
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=YourStrongUniquePassword2026!

# Batch & Expiration Rules
MAX_BATCH_GENERATE_USERS=50
PAYIN_EXPIRY_MINUTES=60
```

> ⚠️ **Important:**
> - Never use common or default passwords.
> - The bootstrap script enforces a minimum of 8 characters and rejects default placeholder passwords.
> - Never commit `backend/.env` to Git.

### Step 3: Run the One-Time Admin Bootstrap Script

Run the dedicated bootstrap command from the root directory or inside `backend`:

```powershell
npm run bootstrap:admin
```

**What the script does:**
1. Validates presence and strength of `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `MONGODB_URI`.
2. Connects to your MongoDB instance.
3. Verifies if an Admin account already exists.
4. If no Admin exists, hashes the password with **bcrypt (12 salt rounds)** and creates the Admin account.
5. Emits an immutable record to the `AuditLog` collection.
6. Safely closes the database connection.
7. **Idempotence:** If run again, it gracefully exits without modifying or resetting existing passwords.

### Step 4: Start the Backend API Server

Open a PowerShell terminal and run:

```powershell
npm run backend:dev
```
*Backend will start on `http://localhost:5000` with database connection and CORS configured.*

### Step 5: Start the Frontend Application

Open a second PowerShell terminal and run:

```powershell
npm run frontend:dev
```
*Frontend will launch on `http://localhost:5173`.*

---

## 🔐 Logging in for the First Time

1. Open your browser and navigate to: `http://localhost:5173`
2. You will be automatically presented with the **Login Page** (no public registration exists).
3. Enter your configured `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
4. Click **Sign In Securely**.
5. You will be redirected immediately to the **Admin Management Panel** (`/admin/clients` & `/admin/dashboard`).

---

## 🛠️ Complete Feature Walkthrough

### 1. Admin User Management (FICHASPOT UI)
- **Manage Clients:** Search by client username, filter by status (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`), paginate, and select rows.
- **Create Client:** Generate a single client with custom username, optional custom password or auto-generated cryptographically secure temporary password, notes, and first-login password change requirement.
- **Bulk Generate Users:** Generate up to 50 collision-resistant client accounts at once with temporary passwords displayed only once for secure copying.
- **Suspend / Activate Client:** Immediately invalidates active sessions upon suspension.
- **Reset Password:** Generates a new temporary password and revokes all active sessions.
- **Export CSV:** Downloads client directory excluding sensitive hashes and secrets.

### 2. Scanner Configuration (`/admin/scanner`)
- Upload your official payment QR code image (`.png`, `.jpg`, `.webp`).
- Configure custom instructions and display labels.
- Toggle active/disabled state anytime.
- Clients will see this exact QR code when requesting a PayIn.

### 3. PayIn & Deposit Verification Desk
- **Client workflow:** Client specifies amount (`INR` or `USDT`), views the configured QR, transfers funds, and submits the UTR / bank reference number.
- **Admin workflow:** Admin reviews the submitted UTR, verifies with bank records, and clicks **Verify & Credit**. This atomically updates the client's verified balance in the `BalanceLedger`.

### 4. Payout Desk (`/payouts` & `/admin/payouts`)
- **Client workflow:** Client requests payout with beneficiary name, masked account number, and IFSC / UPI / wallet address. The system enforces that the payout amount cannot exceed verified available balance.
- **Admin workflow:** Admin reviews beneficiary information, processes the bank transfer, enters the transfer reference, and marks **Completed**, which records a verified deduction in the ledger.

### 5. Cryptocurrency Hub (`/crypto`)
- Clear separation between USDT TRC20, ERC20, and Bitcoin networks.
- Copyable official deposit addresses.
- Strict network compatibility warnings.
- On-chain transaction hash tracking with manual audit requirements.

---

## 🧪 Running Automated Tests

A comprehensive integration test suite is included in `backend/tests/`. It runs with self-contained in-memory MongoDB support:

```powershell
npm test
```

### Test Coverage Summary:
- ✅ Admin RBAC enforcement (Client accounts receive 403 Forbidden on Admin APIs).
- ✅ User creation & duplicate username rejection.
- ✅ Bulk generation respects configured maximum limits.
- ✅ CSV export security (Never contains password hashes).
- ✅ Unauthenticated route protection (401 response).
- ✅ Generic login error messages (No username leakage).
- ✅ HTTP-only session cookies and `/api/auth/me` verification.
- ✅ Instant session invalidation upon account suspension.
- ✅ Admin bootstrap script creation, validation, and idempotence.
- ✅ Financial ledger balance isolation (Unverified PayIns never increase balance).
- ✅ Payout limit verification (Cannot request more than verified balance).

---

## 🔒 Security Best Practices Checklist

- [x] **No hardcoded credentials:** All secrets and credentials reside in environment variables.
- [x] **Safe Git configuration:** `.gitignore` excludes `.env`, `node_modules`, and uploaded files.
- [x] **No plaintext passwords:** All passwords hashed with bcrypt (12 rounds).
- [x] **No frontend secret leakage:** No backend secrets prefixed with `VITE_`.
- [x] **Rate limiting:** 10 login attempts per 15 minutes per IP.
- [x] **HTTP-Only Cookies:** Defends against JavaScript token theft and XSS.
- [x] **Audit Trail:** Immutable records of administrative and security events.
- [x] **Financial integrity:** Isolated INR and USDT balances with duplicate-reference locks.
