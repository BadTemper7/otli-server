import express from 'express'
import crypto from 'crypto'
import User from '../models/User.js'
import EmailOtp from '../models/EmailOtp.js'
import { ALL_ADMIN_MODULES } from '../constants/modules.js'
import { protect, requireAdmin } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { cleanUser } from '../utils/cleanUser.js'
import { signToken } from '../utils/jwt.js'
import { uploadFilesMap } from '../utils/cloudinaryUpload.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'
import { sendRegistrationOtpEmail } from '../utils/email.js'

const router = express.Router()

const OTP_PURPOSE = 'client-registration'
const OTP_EXPIRY_MINUTES = Number(process.env.EMAIL_OTP_EXPIRES_MINUTES || 10)
const OTP_MAX_ATTEMPTS = Number(process.env.EMAIL_OTP_MAX_ATTEMPTS || 5)
const OTP_RESEND_SECONDS = Number(process.env.EMAIL_OTP_RESEND_SECONDS || 60)

const accountUpload = upload.fields([
  { name: 'businessPermit', maxCount: 1 },
  { name: 'birCertificate', maxCount: 1 },
  { name: 'validId', maxCount: 1 },
  { name: 'authorizationLetter', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 }
])

const normalizeEmail = (value) => String(value || '').toLowerCase().trim()
const normalizePhone = (value) => String(value || '').replace(/\s+/g, '').trim()
const isValidOtpCode = (value) => /^\d{6}$/.test(String(value || '').trim())

const validateEmailFormat = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const validatePhoneFormat = (phoneNumber) => {
  const normalized = normalizePhone(phoneNumber)
  if (!normalized) return true
  return /^(09\d{9}|\+639\d{9})$/.test(normalized)
}

const ensureUniqueClientEmailAndPhone = async ({ email, phoneNumber }) => {
  const existingEmail = await User.findOne({ email })

  if (existingEmail) {
    return 'Email is already registered.'
  }

  const normalizedPhone = normalizePhone(phoneNumber)

  if (normalizedPhone) {
    const phoneVariants = normalizedPhone.startsWith('+63')
      ? [normalizedPhone, `0${normalizedPhone.slice(3)}`]
      : [normalizedPhone, `+63${normalizedPhone.slice(1)}`]

    const existingPhone = await User.findOne({ 'company.phoneNumber': { $in: phoneVariants } })

    if (existingPhone) {
      return 'Phone number is already registered.'
    }
  }

  return ''
}

router.post('/register-email-otp', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const phoneNumber = normalizePhone(req.body.phoneNumber)

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required before sending OTP.' })
  }

  if (!validateEmailFormat(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' })
  }

  if (!validatePhoneFormat(phoneNumber)) {
    return res.status(400).json({ success: false, message: 'Phone number must use 09XXXXXXXXX or +639XXXXXXXXX format.' })
  }

  const uniqueError = await ensureUniqueClientEmailAndPhone({ email, phoneNumber })

  if (uniqueError) {
    return res.status(409).json({ success: false, message: uniqueError })
  }

  const recentOtp = await EmailOtp.findOne({
    email,
    purpose: OTP_PURPOSE,
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 })

  if (recentOtp?.lastSentAt) {
    const secondsSinceLastSend = Math.floor((Date.now() - recentOtp.lastSentAt.getTime()) / 1000)

    if (secondsSinceLastSend < OTP_RESEND_SECONDS) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${OTP_RESEND_SECONDS - secondsSinceLastSend} seconds before requesting another OTP.`
      })
    }
  }

  await EmailOtp.updateMany(
    { email, purpose: OTP_PURPOSE, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date() } }
  )

  const code = crypto.randomInt(100000, 999999).toString()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  const otp = await EmailOtp.create({
    email,
    purpose: OTP_PURPOSE,
    codeHash: code,
    expiresAt,
    lastSentAt: new Date(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  })

  let emailResult = null

  try {
    emailResult = await sendRegistrationOtpEmail({
      email,
      code,
      expiresInMinutes: OTP_EXPIRY_MINUTES
    })
  } catch (error) {
    otp.consumedAt = new Date()
    await otp.save()
    throw error
  }

  const responsePayload = {
    success: true,
    message: `OTP sent to ${email}. Please check your inbox.`,
    data: {
      otpRequestId: otp._id.toString(),
      email,
      expiresAt
    }
  }

  if (emailResult?.developmentOnly && process.env.NODE_ENV !== 'production') {
    responsePayload.devOtp = code
  }

  res.json(responsePayload)
}))

router.post('/register-client', accountUpload, asyncHandler(async (req, res) => {
  const {
    password,
    companyName,
    companyAddress,
    companyType,
    companyTypeOther,
    representativeFirstName,
    representativeMiddleName,
    representativeLastName,
    representativePosition,
    emailOtpCode,
    emailOtpRequestId
  } = req.body

  const email = normalizeEmail(req.body.email)
  const phoneNumber = normalizePhone(req.body.phoneNumber)
  const otpCode = String(emailOtpCode || '').trim()

  if (!email || !password || !companyName || !representativeFirstName || !representativeLastName) {
    return res.status(400).json({
      success: false,
      message: 'Email, password, company name, representative first name, and representative last name are required.'
    })
  }

  if (!validateEmailFormat(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' })
  }

  if (!validatePhoneFormat(phoneNumber)) {
    return res.status(400).json({ success: false, message: 'Phone number must use 09XXXXXXXXX or +639XXXXXXXXX format.' })
  }

  if (!isValidOtpCode(otpCode)) {
    return res.status(400).json({ success: false, message: 'A valid 6-digit email OTP is required.' })
  }

  const uniqueError = await ensureUniqueClientEmailAndPhone({ email, phoneNumber })

  if (uniqueError) {
    return res.status(409).json({ success: false, message: uniqueError })
  }

  const otpFilter = {
    email,
    purpose: OTP_PURPOSE,
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  }

  if (emailOtpRequestId) otpFilter._id = emailOtpRequestId

  const otp = await EmailOtp.findOne(otpFilter).sort({ createdAt: -1 }).select('+codeHash')

  if (!otp) {
    return res.status(400).json({ success: false, message: 'Email OTP is missing, expired, or already used. Please request a new OTP.' })
  }

  if ((otp.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    otp.consumedAt = new Date()
    await otp.save()
    return res.status(429).json({ success: false, message: 'Too many incorrect OTP attempts. Please request a new OTP.' })
  }

  const otpMatches = await otp.compareCode(otpCode)

  if (!otpMatches) {
    otp.attempts = (otp.attempts || 0) + 1
    await otp.save()
    return res.status(400).json({ success: false, message: 'Incorrect email OTP.' })
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

  otp.consumedAt = new Date()
  await otp.save()

  emitRealtime('account:created', { id: user._id.toString(), status: user.status }, ['admins'])

  res.status(201).json({
    success: true,
    message: 'Email verified. Account registration submitted. Please wait for admin verification.',
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
