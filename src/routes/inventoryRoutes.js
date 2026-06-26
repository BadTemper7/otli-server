import express from 'express'
import Inventory from '../models/Inventory.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireAdmin, requireModule } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()

router.use(protect, requireAdmin, requireModule(MODULES.INVENTORY))

router.get('/', asyncHandler(async (req, res) => {
  const { status = 'all', search = '' } = req.query
  const filter = {}

  if (status !== 'all') filter.status = status
  if (search) {
    filter.$or = [
      { containerNo: new RegExp(search, 'i') },
      { companyName: new RegExp(search, 'i') },
      { yardLocation: new RegExp(search, 'i') },
      { shippingLine: new RegExp(search, 'i') }
    ]
  }

  const [items, total, inYard, released, onHold] = await Promise.all([
    Inventory.find(filter).populate('client', 'name email company.companyName').sort({ updatedAt: -1 }).limit(300),
    Inventory.countDocuments(),
    Inventory.countDocuments({ status: 'in-yard' }),
    Inventory.countDocuments({ status: 'released' }),
    Inventory.countDocuments({ status: 'on-hold' })
  ])

  res.json({ success: true, data: items, summary: { total, inYard, released, onHold } })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const inventory = await Inventory.findById(req.params.id)
  if (!inventory) return res.status(404).json({ success: false, message: 'Inventory record not found.' })

  const before = inventory.toObject()
  const allowed = ['yardLocation', 'stack', 'bay', 'row', 'tier', 'condition', 'status', 'remarks']
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) inventory[field] = req.body[field]
  })
  inventory.lastMoveAt = new Date()
  inventory.updatedBy = req.user._id
  await inventory.save()

  await writeAuditLog({ req, action: 'UPDATE_INVENTORY', module: MODULES.INVENTORY, entityType: 'Inventory', entityId: inventory._id.toString(), before, after: inventory.toObject(), message: `Updated inventory ${inventory.containerNo}` })
  emitRealtime('inventory:updated', { id: inventory._id.toString(), containerNo: inventory.containerNo }, ['admins'])

  res.json({ success: true, message: 'Inventory updated.', data: inventory })
}))

export default router
