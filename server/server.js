require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const connectMongo = require('./config/mongo')
const User = require('./models/User')
const Company = require('./models/Company')
const Invite = require('./models/Invite')
const RefreshToken = require('./models/RefreshToken')
const { requireAuth, requireRole } = require('./middleware/auth')
const app = express()
app.use(cors({ origin: process.env.CLIENT_URL }))
app.use(express.json())
const SALT_ROUNDS = 10

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
})

function signAccessToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' })
}

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex')
  await RefreshToken.create({
    userId,
    token,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  })
  return token
}

// ---------- Auth ----------

// Signing up creates a brand new company, and the signer becomes its owner.
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name, companyName } = req.body

  if (!email || !password || !name || !companyName) {
    return res.status(400).json({ error: 'email, password, name, and companyName are all required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  const company = await Company.create({ name: companyName })
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const user = await User.create({
    email, passwordHash, name,
    companyId: company._id,
    role: 'owner',
  })

  const accessToken = signAccessToken(user._id)
  const refreshToken = await issueRefreshToken(user._id)
  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
    company: { id: company._id, name: company.name },
  })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const user = await User.findOne({ email: email.toLowerCase() })
  // Same error for "no such user" and "wrong password", so emails can't be probed.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const accessToken = signAccessToken(user._id)
  const refreshToken = await issueRefreshToken(user._id)
  res.json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
  })
})

app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' })

  const stored = await RefreshToken.findOne({ token: refreshToken })
  if (!stored || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' })
  }

  // Rotation: each refresh token is single-use.
  await RefreshToken.deleteOne({ _id: stored._id })
  const newAccessToken = signAccessToken(stored.userId)
  const newRefreshToken = await issueRefreshToken(stored.userId)

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken })
})

app.post('/api/auth/logout', async (req, res) => {
  const { refreshToken } = req.body
  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken })
  }
  res.json({ message: 'Logged out' })
})

// ---------- Tenant-scoped routes ----------

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select('-passwordHash')
  const company = await Company.findById(req.companyId)
  res.json({ user, company })
})

// Only ever returns users from the logged-in user's own company (req.companyId
// comes from the verified token, never from anything the client sends).
app.get('/api/team', requireAuth, async (req, res) => {
  const members = await User.find({ companyId: req.companyId }).select('-passwordHash')
  res.json(members)
})

// Only owners and admins can invite, enforced by middleware.
app.post('/api/team/invite', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { email, role } = req.body
  if (!email) return res.status(400).json({ error: 'email is required' })

  // FIX 1: don't invite an email that already has an account.
  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return res.status(409).json({ error: 'This email already has an account' })
  }

  const token = crypto.randomBytes(24).toString('hex')
  await Invite.create({
    email,
    companyId: req.companyId,
    token,
    role: role === 'admin' ? 'admin' : 'member',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  })

  const inviteUrl = `${process.env.CLIENT_URL}/accept-invite?token=${token}`

  let emailSent = true
  try {
    await transporter.sendMail({
      from: `"SaaS Starter" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "You've been invited to join a team",
      text: `You've been invited to join a team. Click this link to accept: ${inviteUrl}`,
    })
    console.log(`Invite email sent to ${email}`)
  } catch (err) {
    emailSent = false
    console.error('Invite email failed:', err.message)
  }

  res.status(201).json({
    message: emailSent ? 'Invite sent' : 'Invite created, but the email could not be sent',
    emailSent,
  })
})

// No auth here: the person accepting doesn't have an account yet.
app.post('/api/team/accept-invite', async (req, res) => {
  const { token, password, name } = req.body
  if (!token || !password || !name) {
    return res.status(400).json({ error: 'token, password, and name are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const invite = await Invite.findOne({ token, used: false })
  if (!invite || invite.expiresAt < new Date()) {
    return res.status(400).json({ error: 'This invite is invalid or has expired' })
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  // FIX 2: a duplicate email returns a clean 409 instead of crashing.
  let user
  try {
    user = await User.create({
      email: invite.email, passwordHash, name,
      companyId: invite.companyId,
      role: invite.role,
    })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' })
    }
    throw err
  }

  invite.used = true
  await invite.save()

  const accessToken = signAccessToken(user._id)
  const refreshToken = await issueRefreshToken(user._id)
  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
  })
})

// FIX 3: catch-all error handler. Log details on the server,
// send only a generic message to the client (no stack traces).
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Server error' })
})

const PORT = process.env.PORT || 5001
connectMongo()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((err) => {
    console.error('Startup failed:', err)
    process.exit(1)
  })