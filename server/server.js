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
app.use(cors())
app.use(express.json())

const SALT_ROUNDS = 10

const transporter = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  : nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    })

function signAccessToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' })
}

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex')

  await RefreshToken.create({
    userId,
    token,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })

  return token
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name, companyName } = req.body
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const safeName = typeof name === 'string' ? name.trim() : ''
  const safeCompanyName = typeof companyName === 'string' ? companyName.trim() : ''

  if (!normalizedEmail || !password || !safeName || !safeCompanyName) {
    return res.status(400).json({ error: 'email, password, name, and companyName are all required' })
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  try {
    const company = await Company.create({ name: safeCompanyName })
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: safeName,
      companyId: company._id,
      role: 'owner',
    })

    const accessToken = signAccessToken(user._id)
    const refreshToken = await issueRefreshToken(user._id)

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      company: { id: company._id, name: company.name },
    })
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    console.error('Signup failed:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = req.body.password

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const user = await User.findOne({ email })

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)

  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const accessToken = signAccessToken(user._id)
  const refreshToken = await issueRefreshToken(user._id)

  return res.json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
  })
})

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select('-passwordHash')

  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }

  const company = await Company.findById(req.companyId)
  const payload = user.toObject()

  return res.json({
    ...payload,
    company: company ? { id: company._id, name: company.name } : null,
  })
})

app.get('/api/team', requireAuth, async (req, res) => {
  const members = await User.find({ companyId: req.companyId }).select('-passwordHash')
  return res.json(members)
})

app.post('/api/team/invite', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const role = req.body.role === 'admin' ? 'admin' : 'member'

  if (!email) {
    return res.status(400).json({ error: 'email is required' })
  }

  const token = crypto.randomBytes(24).toString('hex')

  await Invite.create({
    email,
    companyId: req.companyId,
    token,
    role,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })

  const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:5177'}/accept-invite?token=${token}`

  try {
    await transporter.sendMail({
      from: `"SaaS Starter" <${process.env.GMAIL_USER || 'no-reply@example.com'}>`,
      to: email,
      subject: 'You\'ve been invited to join a team',
      text: `You\'ve been invited to join a team. Click this link to accept: ${inviteUrl}`,
    })
  } catch (err) {
    console.error('Invite email failed:', err && err.message ? err.message : err)
  }

  return res.status(201).json({ message: 'Invite sent', inviteUrl })
})

app.post('/api/team/accept-invite', async (req, res) => {
  const { token, password, name } = req.body
  const safeName = typeof name === 'string' ? name.trim() : ''

  if (!token || !password || !safeName) {
    return res.status(400).json({ error: 'token, password, and name are required' })
  }

  const invite = await Invite.findOne({ token, used: false })

  if (!invite || invite.expiresAt < new Date()) {
    return res.status(400).json({ error: 'This invite is invalid or has expired' })
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const user = await User.create({
    email: invite.email,
    passwordHash,
    name: safeName,
    companyId: invite.companyId,
    role: invite.role,
  })

  invite.used = true
  await invite.save()

  const accessToken = signAccessToken(user._id)
  const refreshToken = await issueRefreshToken(user._id)

  return res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: user._id, email: user.email, name: user.name, role: user.role },
  })
})

app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' })
  }

  const stored = await RefreshToken.findOne({ token: refreshToken })

  if (!stored || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' })
  }

  await RefreshToken.deleteOne({ _id: stored._id })
  const newAccessToken = signAccessToken(stored.userId)
  const newRefreshToken = await issueRefreshToken(stored.userId)

  return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken })
})

app.post('/api/auth/logout', async (req, res) => {
  const { refreshToken } = req.body

  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken })
  }

  return res.json({ message: 'Logged out' })
})

module.exports = app

if (require.main === module) {
  const PORT = process.env.PORT || 5001

  connectMongo()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch((err) => {
      console.error('Startup failed:', err)
      process.exit(1)
    })
}
