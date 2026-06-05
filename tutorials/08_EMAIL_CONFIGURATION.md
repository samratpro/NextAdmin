# Email Configuration Guide

NextAdmin uses **Nodemailer** for sending transactional emails such as account verification and password resets. This guide explains how to configure your SMTP settings.

## ⚙️ Environment Variables

All email settings are managed via environment variables in your `api/.env` file.

| Variable | Description | Example (Gmail) |
| :--- | :--- | :--- |
| `EMAIL_HOST` | SMTP server address | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP server port | `587` |
| `EMAIL_SECURE` | Use SSL/TLS | `false` (for port 587) |
| `EMAIL_USER` | SMTP username | `your-email@gmail.com` |
| `EMAIL_PASSWORD` | SMTP password or App Password | `your-app-password` |
| `EMAIL_FROM` | Sender address | `noreply@yourdomain.com` |

---

## 📧 Provider Setup Examples

### Gmail (Recommended for Dev)
Google requires **2-Factor Authentication** and an **App Password** to send emails via SMTP.

1.  Enable **2-Step Verification** in your Google Account.
2.  Search for **"App Passwords"** in your account settings.
3.  Create a new app password (select "Other" and name it "NextAdmin").
4.  Copy the 16-character code into your `EMAIL_PASSWORD`.

**Config for Gmail:**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx
EMAIL_FROM=NextAdmin <your-email@gmail.com>
```

### Mailtrap (Recommended for Testing)
Mailtrap is an excellent service for capturing emails in a "fake" inbox during development.

1.  Sign up at [Mailtrap.io](https://mailtrap.io).
2.  Go to "Email Testing" > "Inboxes" > "SMTP Settings".
3.  Copy the credentials provided.

---

## 🛠️ Testing Your Setup

To verify that email is working:
1.  Ensure your API is running (`npm run dev`).
2.  Register a new user via the API or Admin Panel.
3.  Check your inbox (or Mailtrap) for the verification email.

## ⚠️ Troubleshooting

- **Connection Timeout**: Ensure your firewall allows outgoing traffic on port 587 or 465.
- **Authentication Failure**: Double-check that you are using an **App Password** for Gmail, not your primary login password.
- **SSL/TLS Errors**: If using port 465, set `EMAIL_SECURE=true`. If using port 587, set `EMAIL_SECURE=false` (it will use STARTTLS).
