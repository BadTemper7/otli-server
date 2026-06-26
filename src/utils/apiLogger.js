import ApiLog from '../models/ApiLog.js'

const shouldSkipApiLog = (req, res) => {
  if (req.method === 'OPTIONS') return true

  const skippedPaths = [
    '/api/health',
    '/api/auth/me',
    '/api/admin/api-logs',
    '/api/admin/audit-logs'
  ]

  if (skippedPaths.some((path) => req.originalUrl.startsWith(path))) return true

  // Keep the API log useful and small. Successful GET polling/read requests are not stored.
  if (req.method === 'GET' && res.statusCode < 400) return true

  return false
}

export const apiLogger = (req, res, next) => {
  const startedAt = Date.now()

  res.on('finish', async () => {
    try {
      if (shouldSkipApiLog(req, res)) return

      await ApiLog.create({
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - startedAt,
        actor: req.user?._id,
        actorEmail: req.user?.email,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      })
    } catch (error) {
      console.error('API log failed:', error.message)
    }
  })

  next()
}
