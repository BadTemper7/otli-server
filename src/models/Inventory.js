import mongoose from 'mongoose'

const inventorySchema = new mongoose.Schema(
  {
    containerNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyName: { type: String, trim: true },
    preAdvice: { type: mongoose.Schema.Types.ObjectId, ref: 'PreAdvice' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    gateIn: { type: mongoose.Schema.Types.ObjectId, ref: 'GateIn' },
    gateOut: { type: mongoose.Schema.Types.ObjectId, ref: 'GateOut' },
    shippingLine: { type: String, trim: true },
    containerSize: { type: String, trim: true },
    containerType: { type: String, trim: true },
    containerStatus: { type: String, enum: ['Empty', 'Laden', ''], default: 'Empty' },
    yardLocation: { type: String, trim: true, default: 'UNASSIGNED' },
    stack: { type: String, trim: true },
    bay: { type: String, trim: true },
    row: { type: String, trim: true },
    tier: { type: String, trim: true },
    condition: { type: String, trim: true },
    status: { type: String, enum: ['in-yard', 'on-hold', 'released'], default: 'in-yard' },
    gateInAt: Date,
    gateOutAt: Date,
    lastMoveAt: Date,
    remarks: { type: String, trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

inventorySchema.index({ status: 1, yardLocation: 1 })
inventorySchema.index({ client: 1, createdAt: -1 })

const Inventory = mongoose.model('Inventory', inventorySchema)

export default Inventory
