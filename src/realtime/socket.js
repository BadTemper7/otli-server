import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

let io = null

const parseOrigins = () => {
  const value = process.env.CLIENT_ORIGINS || 'http://localhost:5173'
  return value.split(',').map((origin) => origin.trim()).filter(Boolean)
}

export const initRealtime = (httpServer) => {
  const allowedOrigins = parseOrigins()

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
          return
        }

        callback(new Error(`Socket CORS blocked for origin: ${origin}`))
      },
      credentials: true
    }
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token

      if (!token) {
        return next(new Error('Unauthorized socket connection.'))
      }

      socket.user = jwt.verify(token, process.env.JWT_SECRET)
      next()
    } catch {
      next(new Error('Unauthorized socket connection.'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.user?.id
    const role = socket.user?.role

    if (userId) {
      socket.join(`user:${userId}`)
    }

    if (role === 'client' && userId) {
      socket.join(`client:${userId}`)
    }

    if (['admin', 'super-admin'].includes(role)) {
      socket.join('admins')
    }
  })

  return io
}

export const emitRealtime = (eventName, payload = {}, rooms = ['admins']) => {
  if (!io) return

  const uniqueRooms = [...new Set(rooms.filter(Boolean))]

  for (const room of uniqueRooms) {
    io.to(room).emit(eventName, payload)
  }
}
