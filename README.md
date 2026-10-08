# Multi-tenant SaaS Starter

A backend-first starter for B2B SaaS apps: companies sign up, invite their
team by email, and every request is scoped to the caller's own company,
so one tenant can never read another tenant's data. It also has
role-based permissions (owner / admin / member) and JWT auth with
rotating refresh tokens.

**Live demo:** https://saas-starter-gules-psi.vercel.app/signup
**API:** https://saas-starter-4oxj.onrender.com/

---

## The problem this solves

Most SaaS products serve many companies from one database. The most
expensive bug in that setup is a **tenant leak**: Company A's user sees
Company B's data because a query forgot a filter, or because the server
trusted a `companyId` sent by the client.

This project is built around one rule:

> **The tenant is decided by the server, from the verified token, never
> from anything the client sends.**

The `requireAuth` middleware verifies the JWT, loads the user, and sets
`req.companyId` from the user record. Every tenant-scoped query filters
on `req.companyId`. There is no route that accepts a company ID from the
request body, query string, or URL.

---

## Architecture

```
React (Vite) on Vercel
   |  axios: Bearer access token on every request
   |  401 -> one automatic refresh -> retry, else back to /login
   v
Express API on Render
   |
   |  requireAuth            -> verify JWT, set req.userId / req.companyId / req.role
   |  requireRole(...roles)  -> 403 if the role isn't allowed
   v
MongoDB Atlas
   users          (email unique, companyId, role)
   companies
   invites        (single-use token, 7-day TTL index)
   refreshtokens  (single-use token, 30-day TTL index)
```

---

## How auth works

- **Access token:** JWT, 15 minutes, signed with `JWT_ACCESS_SECRET`.
- **Refresh token:** random 40-byte value stored in MongoDB, 30 days.
- **Rotation:** each refresh token can be used once. Calling
  `/api/auth/refresh` deletes the old one and issues a new pair. A
  stolen refresh token therefore stops working the moment the real user
  refreshes.
- **Expiry cleanup:** MongoDB TTL indexes delete expired refresh tokens
  and invites automatically.
- **Passwords:** bcrypt, 10 salt rounds; minimum 8 characters.
  `passwordHash` is excluded from every API response.
- **Login errors are generic:** "Invalid email or password" for both an
  unknown email and a wrong password, so the endpoint can't be used to
  check which emails are registered.
- **401 vs 403:** 401 means "who are you?" (missing, invalid or expired
  token). 403 means "I know who you are, but your role can't do this."

## How invites work

1. An owner or admin calls `POST /api/team/invite` with an email and role.
2. The server creates a random token (7-day expiry) tied to **their**
   company and emails a link to `/accept-invite?token=...`.
3. The invitee sets a name and password. The server creates their account
   in the invite's company with the invite's role, and marks the invite
   used, so the same link can't create a second account.

The response includes `emailSent`, so the UI can tell the difference
between "invite created and emailed" and "invite created, email failed".

---

## API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | none | Create company + owner account |
| POST | `/api/auth/login` | none | Get access + refresh tokens |
| POST | `/api/auth/refresh` | refresh token | Rotate tokens |
| POST | `/api/auth/logout` | refresh token | Revoke refresh token |
| GET | `/api/me` | any role | Current user + company |
| GET | `/api/team` | any role | Members of **your** company only |
| POST | `/api/team/invite` | owner, admin | Invite by email |
| POST | `/api/team/accept-invite` | invite token | Join a company |

---

## How it was verified

These were tested by hand in Postman and the browser, against the local
and deployed API. **There is no automated test suite yet.**

- **Duplicate signup** returns `409`, not a crash.
- **Tenant isolation:** created Company A and Company B, logged in as
  each, and confirmed `GET /api/team` only ever returned that company's
  own members.
- **Invite flow end to end:** invite email received, link opened, account
  created in the correct company with the correct role.
- **Invites are single-use:** reusing an accepted link returns `400`.
- **Role check:** a `member` calling `POST /api/team/invite` gets `403`.
- **Duplicate email on accept-invite** returns a clean `409` JSON error
  instead of a raw database error.
- **Errors don't leak internals:** a catch-all handler logs the full
  error on the server and returns only `{ "error": "Server error" }`.

---

## Honest limitations

- **No automated tests.** Everything above was checked manually. The next
  step would be Jest + Supertest covering isolation and role checks.
- **Tokens live in `localStorage`.** Simple, but readable by any script
  on the page if there were an XSS bug. A hardened version would put the
  refresh token in an `httpOnly`, `Secure`, `SameSite` cookie.
- **Invite emails are sent from a personal Gmail account** and often land
  in spam. Production would use a transactional provider (SES, Resend,
  Postmark) on its own domain with SPF/DKIM.
- **Missing account features:** no password reset, no email
  verification, no removing members or changing roles, no revoking a
  pending invite.
- **Isolation is enforced per route, by convention.** Each query adds the
  `companyId` filter itself. A stricter design would enforce it once, at
  the data-access layer, so a new route can't forget it.
- **No rate limiting** on login or signup.
- **CORS allows a single origin** (`CLIENT_URL`).
- **Render free tier** sleeps after inactivity, so the first request can
  take 30-50 seconds.

---

## Tech stack

- **Client:** React 18, Vite, React Router, axios (interceptors for
  token refresh)
- **Server:** Node.js, Express, Mongoose, bcrypt, jsonwebtoken,
  Nodemailer
- **Database:** MongoDB Atlas
- **Hosting:** Vercel (client), Render (API)

---

## Running locally

**Server:**
```bash
cd server
npm install
npm run dev
```
Runs on `http://localhost:5001`.

**Client:**
```bash
cd client
npm install
npm run dev
```
Runs on `http://localhost:5177`.

### Environment variables

`server/.env`:
```
MONGODB_URI=your-mongodb-connection-string
JWT_ACCESS_SECRET=long-random-string
JWT_REFRESH_SECRET=a-different-long-random-string
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
CLIENT_URL=http://localhost:5177
PORT=5001
```

`client/.env`:
```
VITE_API_URL=http://localhost:5001
```

Generate the two JWT secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Trying it out

1. Sign up: this creates a new company and makes you its owner.
2. From the dashboard, invite a second email address as `member`.
3. Open the invite link (check spam), set a password, and you'll land in
   the same company's dashboard.
4. Log in as the member and try to invite someone: the server refuses
   with 403.
5. Sign up a second, separate company in another browser and confirm its
   team list shows none of the first company's people.