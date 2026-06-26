import express from 'express'
import User from '../models/User.js'
import PreAdvice from '../models/PreAdvice.js'
import Booking from '../models/Booking.js'
import GateIn from '../models/GateIn.js'
import ApiLog from '../models/ApiLog.js'
import AuditLog from '../models/AuditLog.js'
import { ALL_ADMIN_MODULES, MODULES } from '../constants/modules.js'
import { protect, requireAdmin, requireModule } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { cleanUser } from '../utils/cleanUser.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()

router.use(protect, requireAdmin)

router.get('/dashboard', requireModule(MODULES.DASHBOARD), asyncHandler(async (req, res) => {
  const [pendingAccounts, pendingPreAdvices, pendingBookings, gateInToday, totalClients] = await Promise.all([
    User.countDocuments({ role: 'client', status: 'pending' }),
    PreAdvice.countDocuments({ status: 'pending' }),
    Booking.countDocuments({ status: 'pending' }),
    GateIn.countDocuments({
      gateInAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999))
      }
    }),
    User.countDocuments({ role: 'client' })
  ])

  const recentApprovals = await Promise.all([
    User.find({ role: 'client' }).sort({ updatedAt: -1 }).limit(5).select('-passwordHash'),
    PreAdvice.find().sort({ updatedAt: -1 }).limit(5).populate('client', 'name email company.companyName'),
    Booking.find().sort({ updatedAt: -1 }).limit(5).populate('client', 'name email company.companyName')
  ])

  res.json({
    success: true,
    data: {
      stats: {
        pendingAccounts,
        pendingPreAdvices,
        pendingBookings,
        gateInToday,
        totalClients
      },
      recent: {
        accounts: recentApprovals[0],
        preAdvices: recentApprovals[1],
        bookings: recentApprovals[2]
      }
    }
  })
}))

router.get('/accounts', requireModule(MODULES.ACCOUNT_APPROVAL), asyncHandler(async (req, res) => {
  const { status = 'pending' } = req.query
  const filter = { role: 'client' }

  if (status !== 'all') filter.status = status

  const accounts = await User.find(filter).sort({ createdAt: -1 }).select('-passwordHash')

  res.json({ success: true, data: accounts })
}))

router.get('/accounts/:id', requireModule(MODULES.ACCOUNT_APPROVAL), asyncHandler(async (req, res) => {
  const account = await User.findOne({ _id: req.params.id, role: 'client' }).select('-passwordHash')

  if (!account) {
    return res.status(404).json({ success: false, message: 'Client account not found.' })
  }

  res.json({ success: true, data: account })
}))

router.patch('/accounts/:id/approve', requireModule(MODULES.ACCOUNT_APPROVAL), asyncHandler(async (req, res) => {
  const account = await User.findOne({ _id: req.params.id, role: 'client' })

  if (!account) {
    return res.status(404).json({ success: false, message: 'Client account not found.' })
  }

  const before = cleanUser(account)

  account.status = 'verified'
  account.approvedAt = new Date()
  account.approvedBy = req.user._id
  account.rejectionReason = undefined
  await account.save()

  await writeAuditLog({
    req,
    action: 'APPROVE_ACCOUNT',
    module: MODULES.ACCOUNT_APPROVAL,
    entityType: 'User',
    entityId: account._id.toString(),
    before,
    after: cleanUser(account),
    message: `Approved account ${account.email}`
  })

  emitRealtime('account:updated', { id: account._id.toString(), status: account.status }, ['admins', `client:${account._id.toString()}`])

  res.json({ success: true, message: 'Client account approved.', data: cleanUser(account) })
}))

router.patch('/accounts/:id/reject', requireModule(MODULES.ACCOUNT_APPROVAL), asyncHandler(async (req, res) => {
  const { reason = '' } = req.body
  const account = await User.findOne({ _id: req.params.id, role: 'client' })

  if (!account) {
    return res.status(404).json({ success: false, message: 'Client account not found.' })
  }

  const before = cleanUser(account)

  account.status = 'rejected'
  account.rejectedAt = new Date()
  account.rejectedBy = req.user._id
  account.rejectionReason = reason
  await account.save()

  await writeAuditLog({
    req,
    action: 'REJECT_ACCOUNT',
    module: MODULES.ACCOUNT_APPROVAL,
    entityType: 'User',
    entityId: account._id.toString(),
    before,
    after: cleanUser(account),
    message: `Rejected account ${account.email}`
  })

  emitRealtime('account:updated', { id: account._id.toString(), status: account.status }, ['admins', `client:${account._id.toString()}`])

  res.json({ success: true, message: 'Client account rejected.', data: cleanUser(account) })
}))

router.get('/users', requireModule(MODULES.USERS), asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: ['admin', 'super-admin'] } })
    .sort({ role: -1, createdAt: -1 })
    .select('-passwordHash')

  res.json({ success: true, data: users, modules: ALL_ADMIN_MODULES })
}))

router.patch('/users/:id/module-access', requireModule(MODULES.USERS), asyncHandler(async (req, res) => {
  if (req.user.role !== 'super-admin') {
    return res.status(403).json({ success: false, message: 'Only super admin can change module access.' })
  }

  const { moduleAccess = [] } = req.body
  const targetUser = await User.findById(req.params.id)

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found.' })
  }

  if (targetUser.role === 'super-admin' || targetUser.isLocked) {
    return res.status(403).json({ success: false, message: 'Super admin access is locked and cannot be changed.' })
  }

  if (targetUser.role !== 'admin') {
    return res.status(400).json({ success: false, message: 'Module access can only be assigned to admin users.' })
  }

  const before = cleanUser(targetUser)
  const allowedAccess = moduleAccess.filter((item) => ALL_ADMIN_MODULES.includes(item))

  targetUser.moduleAccess = [...new Set(allowedAccess)]
  await targetUser.save()

  await writeAuditLog({
    req,
    action: 'UPDATE_MODULE_ACCESS',
    module: MODULES.USERS,
    entityType: 'User',
    entityId: targetUser._id.toString(),
    before,
    after: cleanUser(targetUser),
    message: `Updated module access for ${targetUser.email}`
  })

  emitRealtime('admin:moduleAccessUpdated', { id: targetUser._id.toString() }, ['admins'])

  res.json({ success: true, message: 'Module access updated.', data: cleanUser(targetUser) })
}))

router.get('/api-logs', requireModule(MODULES.API_LOGS), asyncHandler(async (req, res) => {
  const logs = await ApiLog.find().sort({ createdAt: -1 }).limit(200)
  res.json({ success: true, data: logs })
}))

router.get('/audit-logs', requireModule(MODULES.AUDIT_LOGS), asyncHandler(async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200).populate('actor', 'name email role')
  res.json({ success: true, data: logs })
}))

router.get('/settings/modules', requireModule(MODULES.SETTINGS), asyncHandler(async (req, res) => {
  res.json({ success: true, data: ALL_ADMIN_MODULES })
}))

export default router
