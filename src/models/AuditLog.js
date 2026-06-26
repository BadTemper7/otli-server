import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorEmail: String,
    actorRole: String,
    action: { type: String, required: true },
    module: String,
    entityType: String,
    entityId: String,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    message: String,
    ipAddress: String,
    userAgent: String
  },
  { timestamps: true }
)

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ module: 1 })
auditLogSchema.index({ entityType: 1, entityId: 1 })

const AuditLog = mongoose.model('AuditLog', auditLogSchema)

export default AuditLog
