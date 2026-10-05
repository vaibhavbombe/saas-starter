const mongoose = require('mongoose')

const inviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  token: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
})

inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.models.Invite || mongoose.model('Invite', inviteSchema)
