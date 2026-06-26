import express from 'express'
import User from '../models/User.js'
import { ALL_ADMIN_MODULES } from '../constants/modules.js'
import { protect, requireAdmin } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { cleanUser } from '../utils/cleanUser.js'
import { signToken } from '../utils/jwt.js'
import { uploadFilesMap } from '../utils/cloudinaryUpload.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()

const accountUpload = upload.fields([
  { name: 'businessPermit', maxCount: 1 },
  { name: 'birCertificate', maxCount: 1 },
  { name: 'validId', maxCount: 1 },
  { name: 'authorizationLetter', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 }
])

router.post('/register-client', accountUpload, asyncHandler(async (req, res) => {
  const {
    email,
    password,
    companyName,
    companyAddress,
    companyType,
    companyTypeOther,
    phoneNumber,
    representativeFirstName,
    representativeMiddleName,
    representativeLastName,
    representativePosition
  } = req.body

  if (!email || !password || !companyName || !representativeFirstName || !representativeLastName) {
    return res.status(400).json({
      success: false,
      message: 'Email, password, company name, representative first name, and representative last name are required.'
    })
  }

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() })

  if (existingUser) {
    return res.status(409).json({ success: false, message: 'Email is already registered.' })
  }

  const documents = await uploadFilesMap(req.files, { folder: `${process.env.CLOUDINARY_FOLDER || 'otli-documents'}/accounts` })

  const name = [representativeFirstName, representativeMiddleName, representativeLastName]
    .filter(Boolean)
    .join(' ')

  const user = await User.create({
    name,
    email,
    passwordHash: password,
    role: 'client',
    status: 'pending',
    company: {
      companyName,
      companyAddress,
      companyType,
      companyTypeOther,
      phoneNumber,
      representativeFirstName,
      representativeMiddleName,
      representativeLastName,
      representativePosition
    },
    documents
  })

  emitRealtime('account:created', { id: user._id.toString(), status: user.status }, ['admins'])

  res.status(201).json({
    success: true,
    message: 'Account registration submitted. Please wait for admin verification.',
    data: cleanUser(user)
  })
}))

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, portal } = req.body

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' })
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash')

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' })
  }

  if (portal === 'admin' && !['admin', 'super-admin'].includes(user.role)) {
    return res.status(403).json({ success: false, message: 'Admin access is required.' })
  }

  if (portal === 'client' && user.role !== 'client') {
    return res.status(403).json({ success: false, message: 'Client access is required.' })
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ success: false, message: 'Your account is suspended.' })
  }

  if (portal === 'admin' && user.status !== 'verified') {
    return res.status(403).json({ success: false, message: 'Admin account must be verified.' })
  }

  user.lastLoginAt = new Date()
  await user.save()

  const token = signToken(user)

  res.json({
    success: true,
    message: 'Login successful.',
    token,
    data: cleanUser(user)
  })
}))

router.get('/me', protect, asyncHandler(async (req, res) => {
  res.json({ success: true, data: cleanUser(req.user) })
}))

router.post('/admin/create', protect, requireAdmin, asyncHandler(async (req, res) => {
  if (req.user.role !== 'super-admin') {
    return res.status(403).json({ success: false, message: 'Only super admin can create admin users.' })
  }

  const { name, email, password, moduleAccess = [] } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required.' })
  }

  const allowedAccess = moduleAccess.filter((item) => ALL_ADMIN_MODULES.includes(item))

  const admin = await User.create({
    name,
    email,
    passwordHash: password,
    role: 'admin',
    status: 'verified',
    moduleAccess: allowedAccess
  })

  await writeAuditLog({
    req,
    action: 'CREATE_ADMIN',
    module: 'users',
    entityType: 'User',
    entityId: admin._id.toString(),
    after: cleanUser(admin),
    message: `Created admin user ${admin.email}`
  })

  emitRealtime('admin:userCreated', { id: admin._id.toString() }, ['admins'])

  res.status(201).json({ success: true, message: 'Admin user created.', data: cleanUser(admin) })
}))

export default router
