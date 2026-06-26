import express from 'express'
import Billing from '../models/Billing.js'
import Inventory from '../models/Inventory.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireClient, requireAdmin, requireModule } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { makeReference } from '../utils/reference.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()
const normalizeContainerNo = (value = '') => String(value).trim().replace(/\s+/g, '').toUpperCase()

function computeTotal(chargeLines = []) {
  return chargeLines.reduce((sum, item) => sum + Number(item.amount || 0), 0)
}

router.get('/mine', protect, requireClient, asyncHandler(async (req, res) => {
  const items = await Billing.find({ client: req.user._id }).sort({ createdAt: -1 }).limit(200)
  res.json({ success: true, data: items })
}))

router.get('/admin', protect, requireAdmin, requireModule(MODULES.BILLING), asyncHandler(async (req, res) => {
  const { status = 'all' } = req.query
  const filter = status === 'all' ? {} : { status }
  const items = await Billing.find(filter).populate('client', 'name email company.companyName').populate('inventory', 'yardLocation status').sort({ createdAt: -1 }).limit(300)
  res.json({ success: true, data: items })
}))

router.post('/admin', protect, requireAdmin, requireModule(MODULES.BILLING), asyncHandler(async (req, res) => {
  const containerNo = normalizeContainerNo(req.body.containerNo)
  const chargeLines = Array.isArray(req.body.chargeLines) && req.body.chargeLines.length
    ? req.body.chargeLines
    : [
        { description: 'Storage Charges', amount: Number(req.body.storageCharge || 0) },
        { description: 'Handling Charges', amount: Number(req.body.handlingCharge || 0) },
        { description: 'Documentation Fee', amount: Number(req.body.documentationFee || 0) }
      ].filter((item) => item.amount > 0)

  if (!chargeLines.length) return res.status(400).json({ success: false, message: 'At least one charge line is required.' })

  const inventory = containerNo ? await Inventory.findOne({ containerNo }) : null
  const companyName = req.body.companyName || inventory?.companyName
  if (!companyName) return res.status(400).json({ success: false, message: 'Company name is required.' })

  const invoice = await Billing.create({
    invoiceNo: makeReference('INV'),
    client: inventory?.client || req.body.client,
    inventory: inventory?._id,
    companyName,
    containerNo,
    chargeLines,
    totalAmount: computeTotal(chargeLines),
    remarks: req.body.remarks
  })

  await writeAuditLog({ req, action: 'CREATE_BILLING_INVOICE', module: MODULES.BILLING, entityType: 'Billing', entityId: invoice._id.toString(), after: invoice.toObject(), message: `Created invoice ${invoice.invoiceNo}` })
  emitRealtime('billing:created', { id: invoice._id.toString(), clientId: invoice.client?.toString() }, ['admins', invoice.client ? `client:${invoice.client.toString()}` : 'admins'])

  res.status(201).json({ success: true, message: 'Billing invoice created.', data: invoice })
}))

router.patch('/:id/payment', protect, requireClient, asyncHandler(async (req, res) => {
  const invoice = await Billing.findOne({ _id: req.params.id, client: req.user._id })
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' })
  if (invoice.status === 'paid') return res.status(400).json({ success: false, message: 'Invoice is already paid.' })

  invoice.status = 'for-verification'
  invoice.paymentReference = req.body.paymentReference || invoice.paymentReference
  invoice.paymentMethod = req.body.paymentMethod || invoice.paymentMethod
  await invoice.save()

  emitRealtime('billing:updated', { id: invoice._id.toString(), clientId: req.user._id.toString(), status: invoice.status }, ['admins', `client:${req.user._id.toString()}`])
  res.json({ success: true, message: 'Payment submitted for verification.', data: invoice })
}))

router.patch('/:id/verify-payment', protect, requireAdmin, requireModule(MODULES.PAYMENT_VERIFICATION), asyncHandler(async (req, res) => {
  const invoice = await Billing.findById(req.params.id)
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found.' })

  const before = invoice.toObject()
  invoice.status = 'paid'
  invoice.paidAt = invoice.paidAt || new Date()
  invoice.verifiedAt = new Date()
  invoice.verifiedBy = req.user._id
  invoice.remarks = req.body.remarks || invoice.remarks
  await invoice.save()

  await writeAuditLog({ req, action: 'VERIFY_PAYMENT', module: MODULES.PAYMENT_VERIFICATION, entityType: 'Billing', entityId: invoice._id.toString(), before, after: invoice.toObject(), message: `Verified payment for invoice ${invoice.invoiceNo}` })
  emitRealtime('billing:updated', { id: invoice._id.toString(), clientId: invoice.client?.toString(), status: invoice.status }, ['admins', invoice.client ? `client:${invoice.client.toString()}` : 'admins'])
  res.json({ success: true, message: 'Payment verified.', data: invoice })
}))

export default router
