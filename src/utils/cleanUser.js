export const cleanUser = (user) => {
  if (!user) return null

  const source = typeof user.toObject === 'function' ? user.toObject() : user
  const { passwordHash, __v, ...safeUser } = source

  return safeUser
}
