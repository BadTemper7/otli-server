import mongoose from 'mongoose'

const apiLogSchema = new mongoose.Schema(
  {
    method: String,
    path: String,
    statusCode: Number,
    responseTimeMs: Number,
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorEmail: String,
    ipAddress: String,
    userAgent: String
  },
  { timestamps: true }
)

apiLogSchema.index({ createdAt: -1 })

const ApiLog = mongoose.model('ApiLog', apiLogSchema)

export default ApiLog
