import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

// Define the connection interface
interface MongooseConnection {
  conn: mongoose.Connection | null
  promise: Promise<mongoose.Connection> | null
}

// Cache the connection across serverless function invocations
declare global {
  var mongoose: MongooseConnection | undefined
}

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local')
}

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

export const connectToDatabase = async (): Promise<mongoose.Connection> => {
  // Return existing connection if available
  if (cached.conn) {
    console.log('🔗 Using existing MongoDB connection')
    return cached.conn
  }

  // Return pending connection promise if in progress
  if (cached.promise) {
    console.log('⏳ Waiting for MongoDB connection promise')
    cached.conn = await cached.promise
    return cached.conn
  }

  console.log('🆕 Creating new MongoDB connection')

  // Configure mongoose for production
  const opts = {
    bufferCommands: false, // Disable mongoose buffering for serverless
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    family: 4, // Use IPv4, skip trying IPv6
  }

  // Create new connection promise
  cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
    console.log('✅ MongoDB connected successfully')
    return mongoose.connection
  }).catch((error) => {
    console.error('❌ MongoDB connection failed:', error)
    cached.promise = null // Reset promise on failure
    throw error
  })

  try {
    cached.conn = await cached.promise
    return cached.conn
  } catch (error) {
    cached.promise = null // Reset promise on failure
    throw error
  }
}

// Health check function
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const connection = await connectToDatabase()
    
    // Ping the database
    await connection.db.admin().ping()
    
    console.log('💚 Database health check passed')
    return true
  } catch (error) {
    console.error('💔 Database health check failed:', error)
    return false
  }
}

// Graceful disconnection (for local development)
export const disconnectFromDatabase = async (): Promise<void> => {
  try {
    if (cached.conn) {
      await mongoose.disconnect()
      cached.conn = null
      cached.promise = null
      console.log('👋 Disconnected from MongoDB')
    }
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error)
  }
}