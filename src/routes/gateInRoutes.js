import express from 'express'
import Booking from '../models/Booking.js'
import GateIn from '../models/GateIn.js'
import PreAdvice from '../models/PreAdvice.js'
import Inventory from '../models/Inventory.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireAdmin, requireModule } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { makeReference } from '../utils/reference.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()

router.use(protect, requireAdmin, requireModule(MODULES.GATE_IN))

router.post('/', asyncHandler(async (req, res) => {
  const {
    bookingId,
    companyName,
    containerNo,
    truckPlateNo,
    driverName,
    guardName,
    gateInAt,
    remarks
  } = req.body

  let booking = null

  if (bookingId) {
    booking = await Booking.findById(bookingId)

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' })
    }

    if (booking.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved bookings can be used for gate in.' })
    }
  }

  const gateIn = await GateIn.create({
    booking: booking?._id,
    client: booking?.client,
    gateInNo: makeReference('GI'),
    companyName: companyName || booking?.companyName,
    containerNo: containerNo || booking?.containerNo,
    truckPlateNo: truckPlateNo || booking?.truckPlateNo,
    driverName: driverName || booking?.driverName,
    guardName,
    gateInAt,
    remarks,
    recordedBy: req.user._id
  })

  if (booking) {
    booking.status = 'completed'
    await booking.save()
  }

  const normalizedContainerNo = String(gateIn.containerNo || '').trim().replace(/\s+/g, '').toUpperCase()
  const preAdvice = normalizedContainerNo
    ? await PreAdvice.findOne({ containerNo: normalizedContainerNo }).sort({ createdAt: -1 })
    : null

  if (normalizedContainerNo) {
    await Inventory.findOneAndUpdate(
      { containerNo: normalizedContainerNo },
      {
        containerNo: normalizedContainerNo,
        client: booking?.client || preAdvice?.client,
        companyName: gateIn.companyName || booking?.companyName || preAdvice?.companyName,
        preAdvice: preAdvice?._id,
        booking: booking?._id,
        gateIn: gateIn._id,
        shippingLine: preAdvice?.shippingLine,
        containerSize: preAdvice?.containerSize,
        containerType: preAdvice?.containerType,
        containerStatus: preAdvice?.containerStatus,
        status: 'in-yard',
        gateInAt: gateIn.gateInAt || new Date(),
        lastMoveAt: new Date(),
        updatedBy: req.user._id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  }

  await writeAuditLog({
    req,
    action: 'CREATE_GATE_IN',
    module: MODULES.GATE_IN,
    entityType: 'GateIn',
    entityId: gateIn._id.toString(),
    after: gateIn.toObject(),
    message: `Recorded gate in ${gateIn.gateInNo}`
  })

  emitRealtime('inventory:updated', { containerNo: gateIn.containerNo }, ['admins'])
  emitRealtime('gateIn:created', { id: gateIn._id.toString(), bookingId: booking?._id?.toString(), clientId: gateIn.client?.toString() }, ['admins', gateIn.client ? `client:${gateIn.client.toString()}` : 'admins'])
  if (booking) {
    emitRealtime('booking:updated', { id: booking._id.toString(), clientId: booking.client?.toString(), status: booking.status }, ['admins', booking.client ? `client:${booking.client.toString()}` : 'admins'])
  }

  res.status(201).json({ success: true, message: 'Gate in recorded.', data: gateIn })
}))

router.get('/', asyncHandler(async (req, res) => {
  const gateIns = await GateIn.find()
    .populate('booking', 'bookingNo status scheduleDate')
    .populate('client', 'name email company.companyName')
    .populate('recordedBy', 'name email')
    .sort({ gateInAt: -1 })
    .limit(200)

  res.json({ success: true, data: gateIns })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const gateIn = await GateIn.findById(req.params.id)
    .populate('booking', 'bookingNo status scheduleDate')
    .populate('client', 'name email company')
    .populate('recordedBy', 'name email')

  if (!gateIn) {
    return res.status(404).json({ success: false, message: 'Gate in record not found.' })
  }

  res.json({ success: true, data: gateIn })
}))

export default router
