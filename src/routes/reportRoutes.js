import express from 'express'
import User from '../models/User.js'
import PreAdvice from '../models/PreAdvice.js'
import Booking from '../models/Booking.js'
import GateIn from '../models/GateIn.js'
import Inventory from '../models/Inventory.js'
import GateOut from '../models/GateOut.js'
import Billing from '../models/Billing.js'
import { MODULES } from '../constants/modules.js'
import { protect, requireAdmin, requireModule } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const router = express.Router()

router.use(protect, requireAdmin, requireModule(MODULES.REPORTS))

router.get('/summary', asyncHandler(async (req, res) => {
  const start = new Date(new Date().setHours(0, 0, 0, 0))
  const end = new Date(new Date().setHours(23, 59, 59, 999))

  const [
    totalClients,
    preAdviceTotal,
    gateInToday,
    gateOutToday,
    currentInventory,
    releasedInventory,
    unpaidInvoices,
    paidRevenueAgg,
    pendingGateOut
  ] = await Promise.all([
    User.countDocuments({ role: 'client' }),
    PreAdvice.countDocuments(),
    GateIn.countDocuments({ gateInAt: { $gte: start, $lte: end } }),
    GateOut.countDocuments({ gateOutAt: { $gte: start, $lte: end } }),
    Inventory.countDocuments({ status: 'in-yard' }),
    Inventory.countDocuments({ status: 'released' }),
    Billing.countDocuments({ status: { $in: ['unpaid', 'for-verification'] } }),
    Billing.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
    GateOut.countDocuments({ status: 'pending' })
  ])

  const byShippingLine = await Inventory.aggregate([
    { $match: { status: { $ne: 'released' } } },
    { $group: { _id: '$shippingLine', total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 }
  ])

  res.json({
    success: true,
    data: {
      totalClients,
      preAdviceTotal,
      gateInToday,
      gateOutToday,
      currentInventory,
      releasedInventory,
      unpaidInvoices,
      pendingGateOut,
      paidRevenue: paidRevenueAgg[0]?.total || 0,
      byShippingLine
    }
  })
}))

export default router
