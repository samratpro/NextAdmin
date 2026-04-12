import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(__dirname, '../../logs/stripe_debug.log');

export function logStripeEvent(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const entry = `${timestamp}: ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n---\n`;
  fs.appendFileSync(LOG_FILE, entry);
}
