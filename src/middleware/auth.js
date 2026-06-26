import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized. Token is missing.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.id).select('-passwordHash')

    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authorized. User no longer exists.' })
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account is suspended.' })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized. Token is invalid or expired.' })
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to access this resource.' })
  }

  next()
}

export const requireAdmin = requireRole('admin', 'super-admin')
export const requireClient = requireRole('client')

export const requireModule = (moduleKey) => (req, res, next) => {
  if (!req.user || !['admin', 'super-admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin access is required.' })
  }

  if (req.user.role === 'super-admin') {
    return next()
  }

  const access = Array.isArray(req.user.moduleAccess) ? req.user.moduleAccess : []

  if (!access.includes(moduleKey)) {
    return res.status(403).json({
      success: false,
      message: `You do not have access to the ${moduleKey} module.`
    })
  }

  next()
}
