import mongoose from 'mongoose'

const gateInSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gateInNo: { type: String, required: true, unique: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    containerNo: { type: String, required: true, trim: true },
    truckPlateNo: { type: String, required: true, trim: true },
    driverName: { type: String, required: true, trim: true },
    guardName: { type: String, trim: true },
    gateInAt: { type: Date, default: Date.now },
    remarks: String,
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
)

const GateIn = mongoose.model('GateIn', gateInSchema)

export default GateIn
