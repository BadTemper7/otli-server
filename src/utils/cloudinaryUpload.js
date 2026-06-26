import { cloudinary } from '../config/cloudinary.js'

export const uploadBufferToCloudinary = (file, options = {}) => {
  if (!file) return null

  const folder = options.folder || process.env.CLOUDINARY_FOLDER || 'otli-documents'

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        public_id: options.publicId,
        use_filename: true,
        unique_filename: true,
        overwrite: false
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve({
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          publicId: result.public_id,
          url: result.secure_url,
          resourceType: result.resource_type,
          uploadedAt: new Date()
        })
      }
    )

    uploadStream.end(file.buffer)
  })
}

export const uploadFilesMap = async (files = {}, options = {}) => {
  const uploaded = {}

  for (const [fieldName, fileList] of Object.entries(files)) {
    if (!Array.isArray(fileList) || fileList.length === 0) continue

    uploaded[fieldName] = await uploadBufferToCloudinary(fileList[0], {
      ...options,
      publicId: `${fieldName}-${Date.now()}`
    })
  }

  return uploaded
}
