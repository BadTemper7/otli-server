# OTLI Server for Render

MongoDB + Express backend for the OTLI system. This version includes Socket.IO realtime updates and cleaner request logging.

## Main features

- Client registration with Cloudinary document uploads
- Client login for verified, pending, and rejected accounts
- Pending clients can login but cannot submit pre-advice or bookings yet
- Rejected clients can login, update their profile, replace documents, and resubmit
- Resubmitted rejected accounts automatically return to pending status
- Admin login using `/admin` on the client app
- Super Admin and Admin roles
- Module access control for Admin users
- Account approval and rejection
- Pre-advice approval and rejection
- Booking approval and rejection
- Gate-in records
- API logs and audit logs
- Socket.IO realtime events for admin and client updates
- Cleaner morgan/API logging that skips 304 responses and successful GET read requests

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Seed or reset the locked Super Admin:

```bash
npm run seed:super-admin
```

## Required environment variables

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/mport?retryWrites=true&w=majority&appName=mport
JWT_SECRET=change-this-to-a-long-random-secret
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_FOLDER=otli-documents
CLIENT_ORIGINS=http://localhost:5173
SUPER_ADMIN_NAME=Super Admin
SUPER_ADMIN_EMAIL=otli@gmail.com
SUPER_ADMIN_PASSWORD=!Otli_2026
```

## Render deployment

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

Health Check Path:

```txt
/api/health
```

Add the same `.env` values in Render Environment Variables.
