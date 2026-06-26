import express from 'express'
import PreAdvice from '../models/PreAdvice.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireClient, requireAdmin, requireModule } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { makeReference } from '../utils/reference.js'
import { uploadFilesMap } from '../utils/cloudinaryUpload.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()

const preAdviceUpload = upload.fields([
  { name: 'billOfLading', maxCount: 1 },
  { name: 'packingList', maxCount: 1 },
  { name: 'commercialInvoice', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 }
])

router.post('/', protect, requireClient, preAdviceUpload, asyncHandler(async (req, res) => {
  if (req.user.status !== 'verified') {
    return res.status(403).json({ success: false, message: 'Your account must be verified before submitting pre-advice.' })
  }

  const {
    containerNo,
    sealNo,
    shippingLine,
    vesselName,
    voyageNo,
    containerSize,
    cargoDescription,
    expectedArrivalDate
  } = req.body

  if (!containerNo) {
    return res.status(400).json({ success: false, message: 'Container number is required.' })
  }

  const documents = await uploadFilesMap(req.files, { folder: `${process.env.CLOUDINARY_FOLDER || 'otli-documents'}/pre-advices` })

  const preAdvice = await PreAdvice.create({
    client: req.user._id,
    companyName: req.user.company?.companyName || req.body.companyName,
    referenceNo: makeReference('PA'),
    containerNo,
    sealNo,
    shippingLine,
    vesselName,
    voyageNo,
    containerSize,
    cargoDescription,
    expectedArrivalDate,
    documents
  })

  emitRealtime('preAdvice:created', { id: preAdvice._id.toString(), clientId: req.user._id.toString(), status: preAdvice.status }, ['admins', `client:${req.user._id.toString()}`])

  res.status(201).json({ success: true, message: 'Pre-advice submitted for approval.', data: preAdvice })
}))

router.get('/mine', protect, requireClient, asyncHandler(async (req, res) => {
  const preAdvices = await PreAdvice.find({ client: req.user._id }).sort({ createdAt: -1 })
  res.json({ success: true, data: preAdvices })
}))

router.get('/admin', protect, requireAdmin, requireModule(MODULES.PRE_ADVICE_APPROVAL), asyncHandler(async (req, res) => {
  const { status = 'pending' } = req.query
  const filter = status === 'all' ? {} : { status }

  const preAdvices = await PreAdvice.find(filter)
    .populate('client', 'name email company.companyName company.phoneNumber')
    .sort({ createdAt: -1 })

  res.json({ success: true, data: preAdvices })
}))

router.get('/:id', protect, asyncHandler(async (req, res) => {
  const preAdvice = await PreAdvice.findById(req.params.id).populate('client', 'name email company')

  if (!preAdvice) {
    return res.status(404).json({ success: false, message: 'Pre-advice not found.' })
  }

  const ownsRecord = preAdvice.client?._id?.toString() === req.user._id.toString()
  const isAdmin = ['admin', 'super-admin'].includes(req.user.role)

  if (!ownsRecord && !isAdmin) {
    return res.status(403).json({ success: false, message: 'You do not have permission to view this pre-advice.' })
  }

  res.json({ success: true, data: preAdvice })
}))

router.patch('/:id/approve', protect, requireAdmin, requireModule(MODULES.PRE_ADVICE_APPROVAL), asyncHandler(async (req, res) => {
  const preAdvice = await PreAdvice.findById(req.params.id)

  if (!preAdvice) {
    return res.status(404).json({ success: false, message: 'Pre-advice not found.' })
  }

  const before = preAdvice.toObject()

  preAdvice.status = 'approved'
  preAdvice.approvedAt = new Date()
  preAdvice.approvedBy = req.user._id
  preAdvice.rejectionReason = undefined
  await preAdvice.save()

  await writeAuditLog({
    req,
    action: 'APPROVE_PRE_ADVICE',
    module: MODULES.PRE_ADVICE_APPROVAL,
    entityType: 'PreAdvice',
    entityId: preAdvice._id.toString(),
    before,
    after: preAdvice.toObject(),
    message: `Approved pre-advice ${preAdvice.referenceNo}`
  })

  emitRealtime('preAdvice:updated', { id: preAdvice._id.toString(), clientId: preAdvice.client?.toString(), status: preAdvice.status }, ['admins', `client:${preAdvice.client?.toString()}`])

  res.json({ success: true, message: 'Pre-advice approved.', data: preAdvice })
}))

router.patch('/:id/reject', protect, requireAdmin, requireModule(MODULES.PRE_ADVICE_APPROVAL), asyncHandler(async (req, res) => {
  const { reason = '' } = req.body
  const preAdvice = await PreAdvice.findById(req.params.id)

  if (!preAdvice) {
    return res.status(404).json({ success: false, message: 'Pre-advice not found.' })
  }

  const before = preAdvice.toObject()

  preAdvice.status = 'rejected'
  preAdvice.rejectedAt = new Date()
  preAdvice.rejectedBy = req.user._id
  preAdvice.rejectionReason = reason
  await preAdvice.save()

  await writeAuditLog({
    req,
    action: 'REJECT_PRE_ADVICE',
    module: MODULES.PRE_ADVICE_APPROVAL,
    entityType: 'PreAdvice',
    entityId: preAdvice._id.toString(),
    before,
    after: preAdvice.toObject(),
    message: `Rejected pre-advice ${preAdvice.referenceNo}`
  })

  emitRealtime('preAdvice:updated', { id: preAdvice._id.toString(), clientId: preAdvice.client?.toString(), status: preAdvice.status }, ['admins', `client:${preAdvice.client?.toString()}`])

  res.json({ success: true, message: 'Pre-advice rejected.', data: preAdvice })
}))

export default router
