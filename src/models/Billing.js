import mongoose from 'mongoose'

const chargeLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 }
  },
  { _id: false }
)

const billingSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    gateOut: { type: mongoose.Schema.Types.ObjectId, ref: 'GateOut' },
    companyName: { type: String, required: true, trim: true },
    containerNo: { type: String, trim: true, uppercase: true },
    chargeLines: [chargeLineSchema],
    totalAmount: { type: Number, default: 0, min: 0 },
    paymentReference: { type: String, trim: true },
    paymentMethod: { type: String, trim: true },
    status: { type: String, enum: ['unpaid', 'for-verification', 'paid', 'cancelled'], default: 'unpaid' },
    paidAt: Date,
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, trim: true }
  },
  { timestamps: true }
)

billingSchema.index({ client: 1, createdAt: -1 })
billingSchema.index({ status: 1, createdAt: -1 })

const Billing = mongoose.model('Billing', billingSchema)

export default Billing
