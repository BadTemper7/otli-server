import express from 'express'
import mongoose from 'mongoose'

const router = express.Router()

router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'otli-server',
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  })
})

export default router
