import express from 'express'
import { MODULES } from '../constants/modules.js'
import { protect, requireAdmin, requireModule } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'
import {
  BlacklistedContainer,
  OutstandingChargeContainer,
  ContainerOwnershipRule,
  SystemSetting
} from '../models/ValidationRule.js'

const router = express.Router()

router.use(protect, requireAdmin, requireModule(MODULES.VALIDATION_RULES))

const normalizeContainerNo = (value = '') => String(value).trim().replace(/\s+/g, '').toUpperCase()
const normalizePrefix = (value = '') => normalizeContainerNo(value).slice(0, 4)

async function getValidationRulesPayload() {
  const [blacklistedContainers, outstandingChargeContainers, ownershipRules, settings] = await Promise.all([
    BlacklistedContainer.find().sort({ updatedAt: -1 }).limit(300),
    OutstandingChargeContainer.find().sort({ updatedAt: -1 }).limit(300),
    ContainerOwnershipRule.find().sort({ prefix: 1 }),
    SystemSetting.find({ key: { $in: ['defaultGateAppointmentWindow'] } })
  ])

  const settingsMap = settings.reduce((acc, item) => {
    acc[item.key] = item.value
    return acc
  }, {})

  if (!settingsMap.defaultGateAppointmentWindow) {
    settingsMap.defaultGateAppointmentWindow = process.env.DEFAULT_GATE_APPOINTMENT_WINDOW || '08:00-17:00'
  }

  return {
    blacklistedContainers,
    outstandingChargeContainers,
    ownershipRules,
    settings: settingsMap
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const data = await getValidationRulesPayload()
  res.json({ success: true, data })
}))

router.post('/blacklisted-containers', asyncHandler(async (req, res) => {
  const containerNo = normalizeContainerNo(req.body.containerNo)
  if (!/^[A-Z]{4}\d{7}$/.test(containerNo)) {
    return res.status(400).json({ success: false, message: 'Container number must use format ABCD1234567.' })
  }

  const item = await BlacklistedContainer.findOneAndUpdate(
    { containerNo },
    {
      containerNo,
      reason: req.body.reason || '',
      status: req.body.status || 'active',
      createdBy: req.user._id
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  await writeAuditLog({ req, action: 'UPSERT_BLACKLISTED_CONTAINER', module: MODULES.VALIDATION_RULES, entityType: 'BlacklistedContainer', entityId: item._id.toString(), after: item.toObject(), message: `Saved blacklisted container ${containerNo}` })
  emitRealtime('validationRules:updated', { type: 'blacklisted-container' }, ['admins'])

  res.status(201).json({ success: true, message: 'Blacklisted container saved.', data: item })
}))

router.post('/outstanding-charges', asyncHandler(async (req, res) => {
  const containerNo = normalizeContainerNo(req.body.containerNo)
  if (!/^[A-Z]{4}\d{7}$/.test(containerNo)) {
    return res.status(400).json({ success: false, message: 'Container number must use format ABCD1234567.' })
  }

  const item = await OutstandingChargeContainer.findOneAndUpdate(
    { containerNo },
    {
      containerNo,
      amount: Number(req.body.amount || 0),
      reason: req.body.reason || '',
      status: req.body.status || 'active',
      createdBy: req.user._id
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  await writeAuditLog({ req, action: 'UPSERT_OUTSTANDING_CHARGE', module: MODULES.VALIDATION_RULES, entityType: 'OutstandingChargeContainer', entityId: item._id.toString(), after: item.toObject(), message: `Saved outstanding charge for ${containerNo}` })
  emitRealtime('validationRules:updated', { type: 'outstanding-charge' }, ['admins'])

  res.status(201).json({ success: true, message: 'Outstanding charge rule saved.', data: item })
}))

router.post('/ownership-rules', asyncHandler(async (req, res) => {
  const prefix = normalizePrefix(req.body.prefix)
  const ownerName = String(req.body.ownerName || '').trim()

  if (!/^[A-Z]{4}$/.test(prefix)) {
    return res.status(400).json({ success: false, message: 'Prefix must be 4 letters, for example MSCU.' })
  }

  if (!ownerName) {
    return res.status(400).json({ success: false, message: 'Owner name is required.' })
  }

  const item = await ContainerOwnershipRule.findOneAndUpdate(
    { prefix },
    {
      prefix,
      ownerName,
      status: req.body.status || 'active',
      createdBy: req.user._id
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  await writeAuditLog({ req, action: 'UPSERT_OWNERSHIP_RULE', module: MODULES.VALIDATION_RULES, entityType: 'ContainerOwnershipRule', entityId: item._id.toString(), after: item.toObject(), message: `Saved ownership rule ${prefix}=${ownerName}` })
  emitRealtime('validationRules:updated', { type: 'ownership-rule' }, ['admins'])

  res.status(201).json({ success: true, message: 'Container ownership rule saved.', data: item })
}))

router.patch('/settings', asyncHandler(async (req, res) => {
  const { defaultGateAppointmentWindow = '08:00-17:00' } = req.body

  const item = await SystemSetting.findOneAndUpdate(
    { key: 'defaultGateAppointmentWindow' },
    {
      key: 'defaultGateAppointmentWindow',
      value: String(defaultGateAppointmentWindow).trim(),
      description: 'Default gate appointment time window generated after pre-advice submission.',
      updatedBy: req.user._id
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  await writeAuditLog({ req, action: 'UPDATE_VALIDATION_SETTINGS', module: MODULES.VALIDATION_RULES, entityType: 'SystemSetting', entityId: item._id.toString(), after: item.toObject(), message: 'Updated validation system settings' })
  emitRealtime('validationRules:updated', { type: 'settings' }, ['admins'])

  res.json({ success: true, message: 'Validation settings saved.', data: item })
}))

router.delete('/:type/:id', asyncHandler(async (req, res) => {
  const modelMap = {
    blacklisted: BlacklistedContainer,
    outstanding: OutstandingChargeContainer,
    ownership: ContainerOwnershipRule
  }

  const Model = modelMap[req.params.type]
  if (!Model) return res.status(400).json({ success: false, message: 'Invalid validation rule type.' })

  const item = await Model.findByIdAndDelete(req.params.id)
  if (!item) return res.status(404).json({ success: false, message: 'Rule not found.' })

  await writeAuditLog({ req, action: 'DELETE_VALIDATION_RULE', module: MODULES.VALIDATION_RULES, entityType: req.params.type, entityId: req.params.id, before: item.toObject(), message: 'Deleted validation rule' })
  emitRealtime('validationRules:updated', { type: req.params.type }, ['admins'])

  res.json({ success: true, message: 'Validation rule deleted.' })
}))

export default router
