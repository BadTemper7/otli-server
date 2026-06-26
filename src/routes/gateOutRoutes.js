import express from 'express'
import GateOut from '../models/GateOut.js'
import Inventory from '../models/Inventory.js'
import Billing from '../models/Billing.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireClient, requireAdmin, requireModule } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { makeReference } from '../utils/reference.js'
import { uploadFilesMap } from '../utils/cloudinaryUpload.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()
const gateOutUpload = upload.fields([
  { name: 'releaseOrder', maxCount: 1 },
  { name: 'customsClearance', maxCount: 1 },
  { name: 'paymentProof', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 }
])
const normalizeContainerNo = (value = '') => String(value).trim().replace(/\s+/g, '').toUpperCase()

function buildValidation({ releaseOrderNo, customsClearanceNo, paymentReference }) {
  return {
    releaseOrder: {
      passed: Boolean(releaseOrderNo),
      message: releaseOrderNo ? 'Release order number provided.' : 'Release order number is missing.'
    },
    customsClearance: {
      passed: Boolean(customsClearanceNo),
      message: customsClearanceNo ? 'Customs clearance number provided.' : 'Customs clearance number is missing.'
    },
    payment: {
      passed: Boolean(paymentReference),
      message: paymentReference ? 'Payment reference provided for verification.' : 'Payment reference is missing.'
    }
  }
}

router.post('/', protect, requireClient, gateOutUpload, asyncHandler(async (req, res) => {
  if (req.user.status !== 'verified') {
    return res.status(403).json({ success: false, message: 'Your account must be verified before requesting gate-out.' })
  }

  const containerNo = normalizeContainerNo(req.body.containerNo)
  if (!containerNo) return res.status(400).json({ success: false, message: 'Container number is required.' })

  const inventory = await Inventory.findOne({ containerNo, status: { $ne: 'released' } })
  if (!inventory) return res.status(404).json({ success: false, message: 'Container is not currently active in yard inventory.' })

  const existing = await GateOut.findOne({ containerNo, status: { $in: ['pending', 'approved'] } })
  if (existing) return res.status(409).json({ success: false, message: `Container already has active gate-out request ${existing.requestNo}.` })

  const documents = await uploadFilesMap(req.files, { folder: `${process.env.CLOUDINARY_FOLDER || 'otli-documents'}/gate-outs` })
  const validationResults = buildValidation(req.body)

  const gateOut = await GateOut.create({
    client: req.user._id,
    inventory: inventory._id,
    preAdvice: inventory.preAdvice,
    requestNo: makeReference('GO'),
    companyName: req.user.company?.companyName || inventory.companyName,
    containerNo,
    releaseOrderNo: req.body.releaseOrderNo,
    customsClearanceNo: req.body.customsClearanceNo,
    paymentReference: req.body.paymentReference,
    truckPlateNo: req.body.truckPlateNo,
    driverName: req.body.driverName,
    driverMobile: req.body.driverMobile,
    requestedReleaseDate: req.body.requestedReleaseDate,
    remarks: req.body.remarks,
    validationResults,
    documents
  })

  emitRealtime('gateOut:created', { id: gateOut._id.toString(), clientId: req.user._id.toString() }, ['admins', `client:${req.user._id.toString()}`])
  res.status(201).json({ success: true, message: 'Gate-out request submitted for approval.', data: gateOut })
}))

router.get('/mine', protect, requireClient, asyncHandler(async (req, res) => {
  const items = await GateOut.find({ client: req.user._id }).populate('inventory', 'yardLocation status').sort({ createdAt: -1 })
  res.json({ success: true, data: items })
}))

router.get('/admin', protect, requireAdmin, requireModule(MODULES.GATE_OUT), asyncHandler(async (req, res) => {
  const { status = 'pending' } = req.query
  const filter = status === 'all' ? {} : { status }
  const items = await GateOut.find(filter).populate('client', 'name email company.companyName').populate('inventory', 'yardLocation status').sort({ createdAt: -1 }).limit(300)
  res.json({ success: true, data: items })
}))

router.patch('/:id/approve', protect, requireAdmin, requireModule(MODULES.GATE_OUT), asyncHandler(async (req, res) => {
  const gateOut = await GateOut.findById(req.params.id)
  if (!gateOut) return res.status(404).json({ success: false, message: 'Gate-out request not found.' })

  const unpaidInvoice = await Billing.findOne({ containerNo: gateOut.containerNo, status: { $in: ['unpaid', 'for-verification'] } })
  if (unpaidInvoice) {
    return res.status(400).json({ success: false, message: `Cannot approve. Billing invoice ${unpaidInvoice.invoiceNo} is not paid yet.` })
  }

  const before = gateOut.toObject()
  gateOut.status = 'approved'
  gateOut.approvedAt = new Date()
  gateOut.approvedBy = req.user._id
  gateOut.rejectionReason = undefined
  await gateOut.save()

  await writeAuditLog({ req, action: 'APPROVE_GATE_OUT', module: MODULES.GATE_OUT, entityType: 'GateOut', entityId: gateOut._id.toString(), before, after: gateOut.toObject(), message: `Approved gate-out ${gateOut.requestNo}` })
  emitRealtime('gateOut:updated', { id: gateOut._id.toString(), clientId: gateOut.client?.toString(), status: gateOut.status }, ['admins', `client:${gateOut.client?.toString()}`])
  res.json({ success: true, message: 'Gate-out request approved.', data: gateOut })
}))

router.patch('/:id/reject', protect, requireAdmin, requireModule(MODULES.GATE_OUT), asyncHandler(async (req, res) => {
  const gateOut = await GateOut.findById(req.params.id)
  if (!gateOut) return res.status(404).json({ success: false, message: 'Gate-out request not found.' })

  const before = gateOut.toObject()
  gateOut.status = 'rejected'
  gateOut.rejectedAt = new Date()
  gateOut.rejectedBy = req.user._id
  gateOut.rejectionReason = req.body.reason || ''
  await gateOut.save()

  await writeAuditLog({ req, action: 'REJECT_GATE_OUT', module: MODULES.GATE_OUT, entityType: 'GateOut', entityId: gateOut._id.toString(), before, after: gateOut.toObject(), message: `Rejected gate-out ${gateOut.requestNo}` })
  emitRealtime('gateOut:updated', { id: gateOut._id.toString(), clientId: gateOut.client?.toString(), status: gateOut.status }, ['admins', `client:${gateOut.client?.toString()}`])
  res.json({ success: true, message: 'Gate-out request rejected.', data: gateOut })
}))

router.patch('/:id/release', protect, requireAdmin, requireModule(MODULES.GATE_OUT), asyncHandler(async (req, res) => {
  const gateOut = await GateOut.findById(req.params.id)
  if (!gateOut) return res.status(404).json({ success: false, message: 'Gate-out request not found.' })
  if (gateOut.status !== 'approved') return res.status(400).json({ success: false, message: 'Only approved gate-out requests can be released.' })

  const before = gateOut.toObject()
  gateOut.status = 'released'
  gateOut.gateOutAt = req.body.gateOutAt || new Date()
  gateOut.releasedAt = new Date()
  gateOut.releasedBy = req.user._id
  await gateOut.save()

  if (gateOut.inventory) {
    await Inventory.findByIdAndUpdate(gateOut.inventory, {
      status: 'released',
      gateOut: gateOut._id,
      gateOutAt: gateOut.gateOutAt,
      lastMoveAt: new Date(),
      updatedBy: req.user._id
    })
  }

  await writeAuditLog({ req, action: 'RELEASE_GATE_OUT', module: MODULES.GATE_OUT, entityType: 'GateOut', entityId: gateOut._id.toString(), before, after: gateOut.toObject(), message: `Released container ${gateOut.containerNo}` })
  emitRealtime('gateOut:updated', { id: gateOut._id.toString(), clientId: gateOut.client?.toString(), status: gateOut.status }, ['admins', `client:${gateOut.client?.toString()}`])
  emitRealtime('inventory:updated', { containerNo: gateOut.containerNo }, ['admins'])
  res.json({ success: true, message: 'Container released from yard.', data: gateOut })
}))

export default router
