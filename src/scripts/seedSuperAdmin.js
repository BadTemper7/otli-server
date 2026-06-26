import dotenv from 'dotenv'
import { connectDB } from '../config/db.js'
import User from '../models/User.js'
import { ALL_ADMIN_MODULES } from '../constants/modules.js'
import { ContainerOwnershipRule, SystemSetting } from '../models/ValidationRule.js'

dotenv.config()


const seedValidationDefaults = async (actorId) => {
  const ownership = String(process.env.CONTAINER_OWNERSHIP_PREFIXES || 'MSCU=MSC,MAEU=MAERSK,ONEY=ONE')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  for (const item of ownership) {
    const [prefix, ownerName] = item.split('=').map((part) => String(part || '').trim())
    if (prefix && ownerName) {
      await ContainerOwnershipRule.findOneAndUpdate(
        { prefix: prefix.toUpperCase().slice(0, 4) },
        { prefix: prefix.toUpperCase().slice(0, 4), ownerName, status: 'active', createdBy: actorId },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    }
  }

  await SystemSetting.findOneAndUpdate(
    { key: 'defaultGateAppointmentWindow' },
    {
      key: 'defaultGateAppointmentWindow',
      value: process.env.DEFAULT_GATE_APPOINTMENT_WINDOW || '08:00-17:00',
      description: 'Default gate appointment time window generated after pre-advice submission.',
      updatedBy: actorId
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}

const run = async () => {
  await connectDB()

  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin'
  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim()
  const password = process.env.SUPER_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required.')
  }

  // First try to find the account using the email from .env.
  // If it does not exist, find the existing locked super admin and update it.
  // This prevents login problems when you change SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD after the first seed.
  let existing = await User.findOne({ email }).select('+passwordHash')

  if (!existing) {
    existing = await User.findOne({ role: 'super-admin', isLocked: true }).select('+passwordHash')
  }

  if (existing) {
    existing.name = name
    existing.email = email
    existing.passwordHash = password
    existing.role = 'super-admin'
    existing.status = 'verified'
    existing.isLocked = true
    existing.moduleAccess = ALL_ADMIN_MODULES

    await existing.save()
    await seedValidationDefaults(existing._id)

    console.log(`Updated locked super admin login: ${existing.email}`)
    console.log('Super admin password was reset from SUPER_ADMIN_PASSWORD.')
    process.exit(0)
  }

  const superAdmin = await User.create({
    name,
    email,
    passwordHash: password,
    role: 'super-admin',
    status: 'verified',
    isLocked: true,
    moduleAccess: ALL_ADMIN_MODULES
  })

  await seedValidationDefaults(superAdmin._id)

  console.log(`Created locked super admin: ${superAdmin.email}`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
