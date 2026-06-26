import { v2 as cloudinary } from 'cloudinary'

const requiredKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']

export const configureCloudinary = () => {
  const missing = requiredKeys.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.warn(`Cloudinary config missing: ${missing.join(', ')}. Upload routes will fail until configured.`)
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  })
}

export { cloudinary }
