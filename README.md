# OTLI Server API

Express + MongoDB + Cloudinary + Socket.IO API server for the OTLI Logistics Management System.

## Deployment

This package is ready for Render.

### Render Settings

```txt
Environment: Node
Build Command: npm install --legacy-peer-deps --no-audit --no-fund
Start Command: npm start
Health Check Path: /api/health
```

### Required Environment Variables

```env
NODE_ENV=production
PORT=5000

MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/mport?retryWrites=true&w=majority&appName=mport
JWT_SECRET=change-this-to-a-long-random-secret
JWT_EXPIRES_IN=7d

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=otli-documents

CLIENT_ORIGINS=http://localhost:5173,https://your-vercel-app.vercel.app

SUPER_ADMIN_NAME=Super Admin
SUPER_ADMIN_EMAIL=otli@gmail.com
SUPER_ADMIN_PASSWORD=!Otli_2026

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="OTLI Logistics <your_verified_sender@email.com>"
EMAIL_OTP_EXPIRES_MINUTES=10
EMAIL_OTP_MAX_ATTEMPTS=5
EMAIL_OTP_RESEND_SECONDS=60
EMAIL_OTP_DEV_MODE=false

# Fallback and seed values. Main values are managed in MongoDB Validation Rules.
BLACKLISTED_CONTAINERS=
OUTSTANDING_CHARGE_CONTAINERS=
CONTAINER_OWNERSHIP_PREFIXES=MSCU=MSC,MAEU=MAERSK,ONEY=ONE
DEFAULT_GATE_APPOINTMENT_WINDOW=08:00-17:00
```

## First Account

Seed the locked Super Admin:

```bash
npm run seed:super-admin
```

The seeder also adds default container ownership prefixes and gate appointment settings into MongoDB.

## Modules Included

- Auth and email OTP registration
- Client profile and resubmission
- Account approval
- Pre-Advice with QR code and gate appointment
- Booking / Gate Appointment
- Gate-In
- Inventory / Yard Monitoring
- Billing
- Gate-Out
- Payment Verification
- Reports
- Validation Rules stored in MongoDB
- Users and module access
- API logs and audit logs
- Socket.IO realtime events

## Local Run

```bash
npm install --legacy-peer-deps --no-audit --no-fund
npm run dev
```
