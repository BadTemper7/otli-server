import mongoose from 'mongoose'

const documentSchema = new mongoose.Schema(
  {
    fileName: String,
    mimeType: String,
    size: Number,
    publicId: String,
    url: String,
    resourceType: String,
    uploadedAt: Date
  },
  { _id: false }
)

const validationItemSchema = new mongoose.Schema(
  {
    passed: { type: Boolean, default: false },
    message: { type: String, trim: true }
  },
  { _id: false }
)

const gateOutSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    preAdvice: { type: mongoose.Schema.Types.ObjectId, ref: 'PreAdvice' },
    requestNo: { type: String, required: true, unique: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    containerNo: { type: String, required: true, trim: true, uppercase: true },
    releaseOrderNo: { type: String, trim: true },
    customsClearanceNo: { type: String, trim: true },
    paymentReference: { type: String, trim: true },
    truckPlateNo: { type: String, trim: true },
    driverName: { type: String, trim: true },
    driverMobile: { type: String, trim: true },
    requestedReleaseDate: Date,
    gateOutAt: Date,
    validationResults: {
      releaseOrder: validationItemSchema,
      customsClearance: validationItemSchema,
      payment: validationItemSchema
    },
    documents: {
      releaseOrder: documentSchema,
      customsClearance: documentSchema,
      paymentProof: documentSchema,
      otherDocument: documentSchema
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'released', 'cancelled'],
      default: 'pending'
    },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    releasedAt: Date,
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
    remarks: String
  },
  { timestamps: true }
)

gateOutSchema.index({ client: 1, createdAt: -1 })
gateOutSchema.index({ containerNo: 1, status: 1 })

const GateOut = mongoose.model('GateOut', gateOutSchema)

export default GateOut
