import AuditLog from '../models/AuditLog.js'

export const writeAuditLog = async ({ req, action, module, entityType, entityId, before = null, after = null, message = '' }) => {
  try {
    await AuditLog.create({
      actor: req.user?._id,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action,
      module,
      entityType,
      entityId,
      before,
      after,
      message,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    })
  } catch (error) {
    console.error('Audit log failed:', error.message)
  }
}
