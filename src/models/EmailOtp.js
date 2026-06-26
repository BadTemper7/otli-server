import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const emailOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    purpose: {
      type: String,
      enum: ['client-registration'],
      default: 'client-registration',
      index: true
    },
    codeHash: {
      type: String,
      required: true,
      select: false
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    consumedAt: Date,
    attempts: {
      type: Number,
      default: 0
    },
    lastSentAt: Date,
    ipAddress: String,
    userAgent: String
  },
  { timestamps: true }
)

emailOtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 })
emailOtpSchema.index({ email: 1, purpose: 1, consumedAt: 1, expiresAt: 1 })

emailOtpSchema.pre('save', async function hashOtp(next) {
  if (!this.isModified('codeHash')) return next()

  this.codeHash = await bcrypt.hash(this.codeHash, 12)
  next()
})

emailOtpSchema.methods.compareCode = function compareCode(code) {
  return bcrypt.compare(String(code || ''), this.codeHash)
}

const EmailOtp = mongoose.model('EmailOtp', emailOtpSchema)

export default EmailOtp
