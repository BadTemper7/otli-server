import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { ALL_ADMIN_MODULES } from '../constants/modules.js'

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

const companySchema = new mongoose.Schema(
  {
    companyName: { type: String, trim: true },
    companyAddress: { type: String, trim: true },
    companyType: { type: String, trim: true },
    companyTypeOther: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    representativeFirstName: { type: String, trim: true },
    representativeMiddleName: { type: String, trim: true },
    representativeLastName: { type: String, trim: true },
    representativePosition: { type: String, trim: true }
  },
  { _id: false }
)

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['client', 'admin', 'super-admin'],
      default: 'client'
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'suspended'],
      default: 'pending'
    },
    isLocked: { type: Boolean, default: false },
    moduleAccess: {
      type: [String],
      default: []
    },
    company: companySchema,
    documents: {
      businessPermit: documentSchema,
      birCertificate: documentSchema,
      validId: documentSchema,
      authorizationLetter: documentSchema,
      otherDocument: documentSchema
    },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
    resubmittedAt: Date,
    resubmissionCount: { type: Number, default: 0 },
    lastLoginAt: Date
  },
  { timestamps: true }
)

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next()

  this.passwordHash = await bcrypt.hash(this.passwordHash, 12)
  next()
})

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash)
}

userSchema.methods.grantAllModules = function grantAllModules() {
  this.moduleAccess = [...ALL_ADMIN_MODULES]
}

const User = mongoose.model('User', userSchema)

export default User
