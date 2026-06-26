import express from 'express'
import QRCode from 'qrcode'
import PreAdvice from '../models/PreAdvice.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireClient, requireAdmin, requireModule } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { makeReference } from '../utils/reference.js'
import { uploadFilesMap } from '../utils/cloudinaryUpload.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'
import { BlacklistedContainer, OutstandingChargeContainer, ContainerOwnershipRule, SystemSetting } from '../models/ValidationRule.js'

const router = express.Router()

const preAdviceUpload = upload.fields([
  { name: 'eir', maxCount: 1 },
  { name: 'deliveryOrder', maxCount: 1 },
  { name: 'bookingConfirmation', maxCount: 1 },
  { name: 'packingList', maxCount: 1 },
  { name: 'customsClearance', maxCount: 1 },

  // Backward-compatible upload fields.
  { name: 'billOfLading', maxCount: 1 },
  { name: 'commercialInvoice', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 }
])

const normalizeContainerNo = (value = '') => String(value).trim().replace(/\s+/g, '').toUpperCase()
const normalizeText = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const envList = (key) => String(process.env[key] || '').split(',').map((item) => normalizeContainerNo(item)).filter(Boolean)

function parseOwnershipRules() {
  return String(process.env.CONTAINER_OWNERSHIP_PREFIXES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((rules, item) => {
      const [prefix, owner] = item.split('=').map((part) => String(part || '').trim())
      if (prefix && owner) rules[normalizeContainerNo(prefix)] = owner
      return rules
    }, {})
}

async function getContainerOwnershipResult(containerNo, shippingLine) {
  const prefix = normalizeContainerNo(containerNo).slice(0, 4)
  const dbRule = await ContainerOwnershipRule.findOne({ prefix, status: 'active' })
  const envRules = parseOwnershipRules()
  const expectedOwner = dbRule?.ownerName || envRules[prefix]

  if (!expectedOwner) {
    return {
      passed: true,
      message: 'No ownership rule configured for this container prefix.'
    }
  }

  const matchesOwner = normalizeText(shippingLine).includes(normalizeText(expectedOwner)) || normalizeText(expectedOwner).includes(normalizeText(shippingLine))

  return {
    passed: matchesOwner,
    message: matchesOwner
      ? `Container prefix ${prefix} matches ${expectedOwner}.`
      : `Container prefix ${prefix} is configured for ${expectedOwner}. Please check the shipping line.`
  }
}

async function getDefaultGateAppointmentWindow() {
  const setting = await SystemSetting.findOne({ key: 'defaultGateAppointmentWindow' })
  return setting?.value || process.env.DEFAULT_GATE_APPOINTMENT_WINDOW || '08:00-17:00'
}

async function buildGateAppointment(referenceNo, arrivalDate) {
  const appointmentDate = arrivalDate ? new Date(arrivalDate) : new Date()
  if (Number.isNaN(appointmentDate.getTime())) appointmentDate.setTime(Date.now())

  return {
    appointmentNo: makeReference('GA'),
    appointmentDate,
    timeWindow: await getDefaultGateAppointmentWindow(),
    status: 'scheduled',
    remarks: `Auto-generated from pre-advice ${referenceNo}. Final gate processing is still subject to terminal validation.`
  }
}

async function buildPreAdviceValidation({ containerNo, shippingLine }) {
  const normalizedContainerNo = normalizeContainerNo(containerNo)
  const duplicate = await PreAdvice.findOne({
    containerNo: normalizedContainerNo,
    status: { $in: ['pending', 'approved'] }
  }).select('_id referenceNo status')

  const [blacklistedRule, outstandingChargeRule] = await Promise.all([
    BlacklistedContainer.findOne({ containerNo: normalizedContainerNo, status: 'active' }),
    OutstandingChargeContainer.findOne({ containerNo: normalizedContainerNo, status: 'active' })
  ])
  const blacklistedContainers = envList('BLACKLISTED_CONTAINERS')
  const outstandingChargeContainers = envList('OUTSTANDING_CHARGE_CONTAINERS')
  const blacklisted = Boolean(blacklistedRule) || blacklistedContainers.includes(normalizedContainerNo)
  const hasOutstandingCharges = Boolean(outstandingChargeRule) || outstandingChargeContainers.includes(normalizedContainerNo)
  const ownership = await getContainerOwnershipResult(normalizedContainerNo, shippingLine)

  const validationResults = {
    duplicateContainer: {
      passed: !duplicate,
      message: duplicate
        ? `Container already has active pre-advice ${duplicate.referenceNo}.`
        : 'No active duplicate pre-advice found.'
    },
    blacklistedContainer: {
      passed: !blacklisted,
      message: blacklisted
        ? (blacklistedRule?.reason || 'Container is currently blacklisted.')
        : 'Container is not blacklisted.'
    },
    outstandingCharges: {
      passed: !hasOutstandingCharges,
      message: hasOutstandingCharges
        ? (outstandingChargeRule?.reason || `Container has outstanding charges${outstandingChargeRule?.amount ? ` amounting to ${outstandingChargeRule.amount}.` : '.'}`)
        : 'No outstanding charges found.'
    },
    containerOwnership: ownership
  }

  const failed = Object.entries(validationResults).filter(([, result]) => !result.passed)

  return {
    validationResults,
    failed,
    passed: failed.length === 0
  }
}

router.post('/', protect, requireClient, preAdviceUpload, asyncHandler(async (req, res) => {
  if (req.user.status !== 'verified') {
    return res.status(403).json({ success: false, message: 'Your account must be verified before submitting pre-advice.' })
  }

  const {
    containerNo,
    containerSize = '20ft',
    containerType = 'Dry',
    containerStatus = 'Empty',
    shippingLine,
    bookingNumber,
    blNumber,
    vesselVoyage,
    cargoDescription,
    dangerousGoodsClass,
    weight,
    arrivalDate,

    // Legacy aliases.
    sealNo,
    vesselName,
    voyageNo,
    expectedArrivalDate
  } = req.body

  const normalizedContainerNo = normalizeContainerNo(containerNo)

  if (!normalizedContainerNo) {
    return res.status(400).json({ success: false, message: 'Container number is required.' })
  }

  if (!/^[A-Z]{4}\d{7}$/.test(normalizedContainerNo)) {
    return res.status(400).json({ success: false, message: 'Container number must use format ABCD1234567.' })
  }

  if (!shippingLine) {
    return res.status(400).json({ success: false, message: 'Shipping line is required.' })
  }

  const validation = await buildPreAdviceValidation({ containerNo: normalizedContainerNo, shippingLine })

  if (!validation.passed) {
    return res.status(409).json({
      success: false,
      message: validation.failed.map(([, result]) => result.message).join(' '),
      validationResults: validation.validationResults
    })
  }

  const referenceNo = makeReference('PA')
  const finalArrivalDate = arrivalDate || expectedArrivalDate
  const gateAppointment = await buildGateAppointment(referenceNo, finalArrivalDate)
  const documents = await uploadFilesMap(req.files, { folder: `${process.env.CLOUDINARY_FOLDER || 'otli-documents'}/pre-advices` })

  const qrData = JSON.stringify({
    type: 'OTLI_PRE_ADVICE',
    referenceNo,
    containerNo: normalizedContainerNo,
    companyName: req.user.company?.companyName || req.body.companyName,
    gateAppointmentNo: gateAppointment.appointmentNo,
    gateAppointmentDate: gateAppointment.appointmentDate,
    timeWindow: gateAppointment.timeWindow
  })

  const qrCodeImageDataUrl = await QRCode.toDataURL(qrData, {
    margin: 1,
    width: 220,
    errorCorrectionLevel: 'M'
  })

  const preAdvice = await PreAdvice.create({
    client: req.user._id,
    companyName: req.user.company?.companyName || req.body.companyName,
    referenceNo,
    containerNo: normalizedContainerNo,
    containerSize,
    containerType,
    containerStatus,
    shippingLine,
    bookingNumber,
    blNumber,
    vesselVoyage,
    cargoDescription,
    dangerousGoodsClass,
    weight: weight === '' || weight === undefined ? undefined : Number(weight),
    arrivalDate: finalArrivalDate,

    sealNo,
    vesselName,
    voyageNo,
    expectedArrivalDate: finalArrivalDate,

    validationResults: validation.validationResults,
    gateAppointment,
    qrCode: {
      data: qrData,
      imageDataUrl: qrCodeImageDataUrl,
      generatedAt: new Date()
    },
    documents
  })

  emitRealtime('preAdvice:created', { id: preAdvice._id.toString(), clientId: req.user._id.toString(), status: preAdvice.status }, ['admins', `client:${req.user._id.toString()}`])

  res.status(201).json({
    success: true,
    message: 'Pre-advice submitted for approval. Pre-advice number, QR code, and gate appointment were generated.',
    data: preAdvice
  })
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
