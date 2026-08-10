import { Resend } from 'resend';
import { readFileSync } from 'fs';

// Load RESEND_API_KEY from .env.local
const env = readFileSync('.env.local', 'utf8');
const match = env.match(/RESEND_API_KEY=(.+)/);
if (!match) { console.error('RESEND_API_KEY not found in .env.local'); process.exit(1); }

const resend = new Resend(match[1].trim());

const { data, error } = await resend.emails.send({
  from: 'TechCongress Dashboard <onboarding@resend.dev>',
  to: 'hello@techcongress.io',
  subject: '🎁 Test — Gift Card Streak Alert',
  html: `
    <p>Hi Mya,</p>
    <p>This is a test email from the TechCongress Fellows Dashboard.</p>
    <p>If you're seeing this, the streak email alert is working correctly!</p>
    <p>— TechCongress Dashboard</p>
  `,
});

if (error) {
  console.error('Failed to send:', error);
} else {
  console.log('Email sent successfully! ID:', data.id);
}
