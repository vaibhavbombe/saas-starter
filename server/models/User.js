const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.models.User || mongoose.model('User', userSchema)
