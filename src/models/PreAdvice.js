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

const preAdviceSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    companyName: { type: String, required: true, trim: true },
    referenceNo: { type: String, required: true, unique: true, trim: true },
    containerNo: { type: String, required: true, trim: true },
    sealNo: { type: String, trim: true },
    shippingLine: { type: String, trim: true },
    vesselName: { type: String, trim: true },
    voyageNo: { type: String, trim: true },
    containerSize: { type: String, trim: true },
    cargoDescription: { type: String, trim: true },
    expectedArrivalDate: Date,
    documents: {
      billOfLading: documentSchema,
      packingList: documentSchema,
      commercialInvoice: documentSchema,
      otherDocument: documentSchema
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String
  },
  { timestamps: true }
)

const PreAdvice = mongoose.model('PreAdvice', preAdviceSchema)

export default PreAdvice
