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
    passed: { type: Boolean, default: true },
    message: { type: String, trim: true }
  },
  { _id: false }
)

const gateAppointmentSchema = new mongoose.Schema(
  {
    appointmentNo: { type: String, trim: true },
    appointmentDate: Date,
    timeWindow: { type: String, trim: true },
    status: {
      type: String,
      enum: ['scheduled', 'for-scheduling', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    remarks: { type: String, trim: true }
  },
  { _id: false }
)

const qrCodeSchema = new mongoose.Schema(
  {
    data: { type: String, trim: true },
    imageDataUrl: String,
    generatedAt: Date
  },
  { _id: false }
)

const preAdviceSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    companyName: { type: String, required: true, trim: true },
    referenceNo: { type: String, required: true, unique: true, trim: true },

    containerNo: { type: String, required: true, trim: true, uppercase: true },
    containerSize: {
      type: String,
      enum: ['20ft', '40ft', '45ft', '20FT', '40FT', '40HC', '45FT'],
      default: '20ft'
    },
    containerType: {
      type: String,
      enum: ['Dry', 'Reefer', 'Tank', 'Open Top', 'Flat Rack', ''],
      default: 'Dry'
    },
    containerStatus: {
      type: String,
      enum: ['Empty', 'Laden', ''],
      default: 'Empty'
    },
    shippingLine: { type: String, trim: true },
    bookingNumber: { type: String, trim: true },
    blNumber: { type: String, trim: true },
    vesselVoyage: { type: String, trim: true },
    cargoDescription: { type: String, trim: true },
    dangerousGoodsClass: { type: String, trim: true },
    weight: { type: Number, min: 0 },
    arrivalDate: Date,

    // Backward-compatible legacy fields used by older booking screens.
    sealNo: { type: String, trim: true },
    vesselName: { type: String, trim: true },
    voyageNo: { type: String, trim: true },
    expectedArrivalDate: Date,

    validationResults: {
      duplicateContainer: validationItemSchema,
      blacklistedContainer: validationItemSchema,
      outstandingCharges: validationItemSchema,
      containerOwnership: validationItemSchema
    },

    documents: {
      eir: documentSchema,
      deliveryOrder: documentSchema,
      bookingConfirmation: documentSchema,
      packingList: documentSchema,
      customsClearance: documentSchema,

      // Backward-compatible document keys.
      billOfLading: documentSchema,
      commercialInvoice: documentSchema,
      otherDocument: documentSchema
    },

    gateAppointment: gateAppointmentSchema,
    qrCode: qrCodeSchema,

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

preAdviceSchema.index({ containerNo: 1, status: 1 })
preAdviceSchema.index({ client: 1, createdAt: -1 })

const PreAdvice = mongoose.model('PreAdvice', preAdviceSchema)

export default PreAdvice
