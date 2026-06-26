import nodemailer from 'nodemailer'

const getBoolean = (value) => ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase())

const buildTransport = () => {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) return null

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  })
}

export const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER
  const transport = buildTransport()
  const devMode = getBoolean(process.env.EMAIL_OTP_DEV_MODE)

  if (!transport) {
    if (process.env.NODE_ENV === 'production' && !devMode) {
      throw new Error('Email service is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and MAIL_FROM.')
    }

    console.log('Email service is not configured. Development email output below:')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(text || html)
    return { developmentOnly: true }
  }

  return transport.sendMail({
    from,
    to,
    subject,
    html,
    text
  })
}

export const sendRegistrationOtpEmail = async ({ email, code, expiresInMinutes = 10 }) => {
  const appName = process.env.APP_NAME || 'OTLI Logistics Management System'
  const subject = `${appName} email verification code`
  const text = `Your ${appName} registration verification code is ${code}. This code expires in ${expiresInMinutes} minutes.`
  const html = `
    <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:24px; color:#0f172a;">
      <div style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:18px; padding:28px;">
        <p style="margin:0 0 8px; color:#2563eb; font-size:12px; font-weight:800; letter-spacing:.18em; text-transform:uppercase;">Email Verification</p>
        <h1 style="margin:0 0 12px; font-size:24px; line-height:1.2;">Verify your OTLI account</h1>
        <p style="margin:0 0 18px; color:#475569; font-size:14px; line-height:1.6;">Use the code below to finish your account registration.</p>
        <div style="display:inline-block; padding:14px 20px; border-radius:14px; background:#eff6ff; color:#1d4ed8; font-size:30px; font-weight:900; letter-spacing:.28em;">${code}</div>
        <p style="margin:18px 0 0; color:#64748b; font-size:13px; line-height:1.6;">This code expires in ${expiresInMinutes} minutes. If you did not request this, you can ignore this email.</p>
      </div>
    </div>
  `

  return sendEmail({ to: email, subject, text, html })
}
