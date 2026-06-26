import http from 'http'
import dotenv from 'dotenv'
import { connectDB } from './config/db.js'
import { configureCloudinary } from './config/cloudinary.js'
import { createApp } from './app.js'
import { initRealtime } from './realtime/socket.js'

dotenv.config()

const port = process.env.PORT || 5000

const startServer = async () => {
  try {
    await connectDB()
    configureCloudinary()

    const app = createApp()
    const httpServer = http.createServer(app)

    initRealtime(httpServer)

    httpServer.listen(port, () => {
      console.log(`OTLI server running on port ${port}`)
      console.log('Socket.IO realtime server enabled')
    })
  } catch (error) {
    console.error('Server failed to start:', error.message)
    process.exit(1)
  }
}

startServer()
