import dotenv from 'dotenv'
import { connectDB } from '../config/db.js'
import User from '../models/User.js'
import { ALL_ADMIN_MODULES } from '../constants/modules.js'

dotenv.config()

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

  console.log(`Created locked super admin: ${superAdmin.email}`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
