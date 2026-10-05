const jwt = require('jsonwebtoken')
const User = require('../models/User')

async function requireAuth(req, res, next) {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = header.split(' ')[1]

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    const user = await User.findById(payload.userId)

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' })
    }

    req.userId = user._id.toString()
    req.companyId = user.companyId
    req.role = user.role
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' })
    }

    next()
  }
}

module.exports = { requireAuth, requireRole }
