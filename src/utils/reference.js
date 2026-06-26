import crypto from 'crypto'

export const makeReference = (prefix) => {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '')
  const random = crypto.randomBytes(3).toString('hex').toUpperCase()

  return `${prefix}-${date}-${random}`
}
