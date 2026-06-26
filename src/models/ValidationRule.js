import mongoose from 'mongoose'

const baseOptions = { timestamps: true }

const blacklistedContainerSchema = new mongoose.Schema(
  {
    containerNo: { type: String, required: true, trim: true, uppercase: true, unique: true },
    reason: { type: String, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  baseOptions
)

const outstandingChargeContainerSchema = new mongoose.Schema(
  {
    containerNo: { type: String, required: true, trim: true, uppercase: true, unique: true },
    amount: { type: Number, default: 0, min: 0 },
    reason: { type: String, trim: true },
    status: { type: String, enum: ['active', 'cleared'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  baseOptions
)

const containerOwnershipRuleSchema = new mongoose.Schema(
  {
    prefix: { type: String, required: true, trim: true, uppercase: true, unique: true, minlength: 4, maxlength: 4 },
    ownerName: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  baseOptions
)

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, unique: true },
    value: { type: String, trim: true },
    description: { type: String, trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  baseOptions
)

export const BlacklistedContainer = mongoose.model('BlacklistedContainer', blacklistedContainerSchema)
export const OutstandingChargeContainer = mongoose.model('OutstandingChargeContainer', outstandingChargeContainerSchema)
export const ContainerOwnershipRule = mongoose.model('ContainerOwnershipRule', containerOwnershipRuleSchema)
export const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema)
