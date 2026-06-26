export const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`)
  res.status(404)
  next(error)
}

export const errorHandler = (error, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode
  let message = error.message || 'Server error'

  if (error.name === 'CastError') {
    statusCode = 404
    message = 'Resource not found.'
  }

  if (error.code === 11000) {
    statusCode = 409
    const field = Object.keys(error.keyValue || {})[0] || 'field'
    message = `${field} already exists.`
  }

  if (error.name === 'ValidationError') {
    statusCode = 400
    message = Object.values(error.errors).map((item) => item.message).join(', ')
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
  })
}
