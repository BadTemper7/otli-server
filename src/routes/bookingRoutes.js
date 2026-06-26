import express from 'express'
import Booking from '../models/Booking.js'
import PreAdvice from '../models/PreAdvice.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireClient, requireAdmin, requireModule } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { makeReference } from '../utils/reference.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()

router.post('/', protect, requireClient, asyncHandler(async (req, res) => {
  if (req.user.status !== 'verified') {
    return res.status(403).json({ success: false, message: 'Your account must be verified before creating a booking.' })
  }

  const {
    preAdviceId,
    containerNo,
    truckPlateNo,
    driverName,
    driverMobile,
    scheduleDate,
    scheduleTime,
    purpose,
    remarks
  } = req.body

  if (!scheduleDate || !driverName || !truckPlateNo) {
    return res.status(400).json({ success: false, message: 'Schedule date, driver name, and truck plate number are required.' })
  }

  let preAdvice = null

  if (preAdviceId) {
    preAdvice = await PreAdvice.findOne({ _id: preAdviceId, client: req.user._id })

    if (!preAdvice) {
      return res.status(404).json({ success: false, message: 'Pre-advice not found.' })
    }

    if (preAdvice.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Pre-advice must be approved before booking.' })
    }
  }

  const booking = await Booking.create({
    client: req.user._id,
    preAdvice: preAdvice?._id,
    bookingNo: makeReference('BK'),
    companyName: req.user.company?.companyName || req.body.companyName,
    containerNo: containerNo || preAdvice?.containerNo,
    truckPlateNo,
    driverName,
    driverMobile,
    scheduleDate,
    scheduleTime,
    purpose,
    remarks
  })

  emitRealtime('booking:created', { id: booking._id.toString(), clientId: req.user._id.toString(), status: booking.status }, ['admins', `client:${req.user._id.toString()}`])

  res.status(201).json({ success: true, message: 'Booking submitted for approval.', data: booking })
}))

router.get('/mine', protect, requireClient, asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ client: req.user._id })
    .populate('preAdvice', 'referenceNo containerNo status')
    .sort({ createdAt: -1 })

  res.json({ success: true, data: bookings })
}))

router.get('/admin', protect, requireAdmin, requireModule(MODULES.BOOKING_APPROVAL), asyncHandler(async (req, res) => {
  const { status = 'pending' } = req.query
  const filter = status === 'all' ? {} : { status }

  const bookings = await Booking.find(filter)
    .populate('client', 'name email company.companyName company.phoneNumber')
    .populate('preAdvice', 'referenceNo containerNo status')
    .sort({ createdAt: -1 })

  res.json({ success: true, data: bookings })
}))

router.get('/:id', protect, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('client', 'name email company')
    .populate('preAdvice', 'referenceNo containerNo status')

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found.' })
  }

  const ownsRecord = booking.client?._id?.toString() === req.user._id.toString()
  const isAdmin = ['admin', 'super-admin'].includes(req.user.role)

  if (!ownsRecord && !isAdmin) {
    return res.status(403).json({ success: false, message: 'You do not have permission to view this booking.' })
  }

  res.json({ success: true, data: booking })
}))

router.patch('/:id/approve', protect, requireAdmin, requireModule(MODULES.BOOKING_APPROVAL), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found.' })
  }

  const before = booking.toObject()

  booking.status = 'approved'
  booking.approvedAt = new Date()
  booking.approvedBy = req.user._id
  booking.rejectionReason = undefined
  await booking.save()

  await writeAuditLog({
    req,
    action: 'APPROVE_BOOKING',
    module: MODULES.BOOKING_APPROVAL,
    entityType: 'Booking',
    entityId: booking._id.toString(),
    before,
    after: booking.toObject(),
    message: `Approved booking ${booking.bookingNo}`
  })

  emitRealtime('booking:updated', { id: booking._id.toString(), clientId: booking.client?.toString(), status: booking.status }, ['admins', `client:${booking.client?.toString()}`])

  res.json({ success: true, message: 'Booking approved.', data: booking })
}))

router.patch('/:id/reject', protect, requireAdmin, requireModule(MODULES.BOOKING_APPROVAL), asyncHandler(async (req, res) => {
  const { reason = '' } = req.body
  const booking = await Booking.findById(req.params.id)

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found.' })
  }

  const before = booking.toObject()

  booking.status = 'rejected'
  booking.rejectedAt = new Date()
  booking.rejectedBy = req.user._id
  booking.rejectionReason = reason
  await booking.save()

  await writeAuditLog({
    req,
    action: 'REJECT_BOOKING',
    module: MODULES.BOOKING_APPROVAL,
    entityType: 'Booking',
    entityId: booking._id.toString(),
    before,
    after: booking.toObject(),
    message: `Rejected booking ${booking.bookingNo}`
  })

  emitRealtime('booking:updated', { id: booking._id.toString(), clientId: booking.client?.toString(), status: booking.status }, ['admins', `client:${booking.client?.toString()}`])

  res.json({ success: true, message: 'Booking rejected.', data: booking })
}))

export default router
