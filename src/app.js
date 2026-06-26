import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import healthRoutes from './routes/healthRoutes.js'
import authRoutes from './routes/authRoutes.js'
import clientRoutes from './routes/clientRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import preAdviceRoutes from './routes/preAdviceRoutes.js'
import bookingRoutes from './routes/bookingRoutes.js'
import gateInRoutes from './routes/gateInRoutes.js'
import { apiLogger } from './utils/apiLogger.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

const parseOrigins = () => {
  const value = process.env.CLIENT_ORIGINS || 'http://localhost:5173'
  return value.split(',').map((origin) => origin.trim()).filter(Boolean)
}

export const createApp = () => {
  const app = express()
  const allowedOrigins = parseOrigins()

  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true
  }))
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    skip: (req, res) => req.path === '/api/health' || res.statusCode === 304
  }))
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 250,
    standardHeaders: true,
    legacyHeaders: false
  }))

  app.use('/api', healthRoutes)
  app.use(apiLogger)

  app.use('/api/auth', authRoutes)
  app.use('/api/client', clientRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/pre-advices', preAdviceRoutes)
  app.use('/api/bookings', bookingRoutes)
  app.use('/api/gate-ins', gateInRoutes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
