const mongoose = require('mongoose')

async function connectMongo() {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    throw new Error('MONGODB_URI is not defined')
  }

  await mongoose.connect(uri)
  console.log('MongoDB connected')
  return mongoose
}

module.exports = connectMongo
