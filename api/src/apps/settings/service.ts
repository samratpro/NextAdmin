import fs from 'fs';
import path from 'path';

export interface SiteSettings {
  siteTitle: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  footerText: string;
  contactEmail: string;
  siteUrl: string;
  primaryColor: string;
}

const SETTINGS_DIR = path.join(__dirname, '../settings_data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
export const SETTINGS_UPLOADS_DIR = path.join(__dirname, '../../../public/uploads/settings');

const DEFAULTS: SiteSettings = {
  siteTitle: 'My Site',
  tagline: '',
  logoUrl: '',
  faviconUrl: '',
  footerText: '',
  contactEmail: '',
  siteUrl: '',
  primaryColor: '#4f46e5',
};

class SiteSettingsService {
  private cache: SiteSettings | null = null;

  constructor() {
    if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_UPLOADS_DIR)) fs.mkdirSync(SETTINGS_UPLOADS_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULTS, null, 2));
  }

  get(): SiteSettings {
    if (this.cache) return this.cache;
    try {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const settings = { ...DEFAULTS, ...JSON.parse(raw) };
      this.cache = settings;
      return settings;
    } catch {
      return { ...DEFAULTS };
    }
  }

  update(updates: Partial<SiteSettings>): SiteSettings {
    const current = this.get();
    const next = { ...current, ...updates };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
    this.cache = next; // keep cache in sync
    return next;
  }
}

export default new SiteSettingsService();
