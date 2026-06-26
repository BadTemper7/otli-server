import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    preAdvice: { type: mongoose.Schema.Types.ObjectId, ref: 'PreAdvice' },
    bookingNo: { type: String, required: true, unique: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    containerNo: { type: String, trim: true },
    truckPlateNo: { type: String, trim: true },
    driverName: { type: String, trim: true },
    driverMobile: { type: String, trim: true },
    scheduleDate: { type: Date, required: true },
    scheduleTime: { type: String, trim: true },
    purpose: {
      type: String,
      enum: ['gate-in', 'gate-out', 'inspection', 'other'],
      default: 'gate-in'
    },
    remarks: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'],
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

const Booking = mongoose.model('Booking', bookingSchema)

export default Booking
