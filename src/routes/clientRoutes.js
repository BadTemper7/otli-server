import express from 'express'
import User from '../models/User.js'
import { protect, requireClient } from '../middleware/auth.js'
import { upload } from '../middleware/upload.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { cleanUser } from '../utils/cleanUser.js'
import { uploadFilesMap } from '../utils/cloudinaryUpload.js'
import { writeAuditLog } from '../utils/audit.js'
import { emitRealtime } from '../realtime/socket.js'

const router = express.Router()

const accountUpload = upload.fields([
  { name: 'businessPermit', maxCount: 1 },
  { name: 'birCertificate', maxCount: 1 },
  { name: 'validId', maxCount: 1 },
  { name: 'authorizationLetter', maxCount: 1 },
  { name: 'otherDocument', maxCount: 1 }
])

router.use(protect, requireClient)

router.get('/profile', asyncHandler(async (req, res) => {
  res.json({ success: true, data: cleanUser(req.user) })
}))

router.patch('/profile', accountUpload, asyncHandler(async (req, res) => {
  const allowedCompanyFields = [
    'companyName',
    'companyAddress',
    'companyType',
    'companyTypeOther',
    'phoneNumber',
    'representativeFirstName',
    'representativeMiddleName',
    'representativeLastName',
    'representativePosition'
  ]

  const user = await User.findById(req.user._id)

  if (!user) {
    return res.status(404).json({ success: false, message: 'Client account not found.' })
  }

  const before = cleanUser(user)
  const previousStatus = user.status

  if (!user.company) user.company = {}

  for (const field of allowedCompanyFields) {
    if (req.body[field] !== undefined) {
      user.company[field] = req.body[field]
    }
  }

  const uploadedDocuments = await uploadFilesMap(req.files, {
    folder: `${process.env.CLOUDINARY_FOLDER || 'otli-documents'}/accounts`
  })

  user.documents = {
    ...(user.documents?.toObject ? user.documents.toObject() : user.documents || {}),
    ...uploadedDocuments
  }

  const name = [
    user.company?.representativeFirstName,
    user.company?.representativeMiddleName,
    user.company?.representativeLastName
  ]
    .filter(Boolean)
    .join(' ')

  user.name = name || user.name

  if (previousStatus === 'rejected') {
    user.status = 'pending'
    user.resubmittedAt = new Date()
    user.resubmissionCount = (user.resubmissionCount || 0) + 1
    user.rejectedAt = undefined
    user.rejectedBy = undefined
    user.rejectionReason = undefined
  }

  if (previousStatus === 'pending') {
    user.resubmittedAt = new Date()
  }

  await user.save()

  await writeAuditLog({
    req,
    action: previousStatus === 'rejected' ? 'RESUBMIT_REJECTED_ACCOUNT' : 'UPDATE_CLIENT_PROFILE',
    module: 'client-profile',
    entityType: 'User',
    entityId: user._id.toString(),
    before,
    after: cleanUser(user),
    message: previousStatus === 'rejected'
      ? `Client resubmitted rejected account ${user.email}`
      : `Client updated profile ${user.email}`
  })

  const message = previousStatus === 'rejected'
    ? 'Profile resubmitted. Your account is now pending admin review again.'
    : previousStatus === 'pending'
      ? 'Profile updated. Your account is still pending admin review.'
      : 'Profile updated.'

  const realtimeEvent = previousStatus === 'rejected' ? 'account:resubmitted' : 'account:updated'
  emitRealtime(realtimeEvent, { id: user._id.toString(), status: user.status }, ['admins', `client:${user._id.toString()}`])

  res.json({ success: true, message, data: cleanUser(user) })
}))

export default router
