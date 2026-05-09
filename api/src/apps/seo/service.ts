import fs from 'fs';
import path from 'path';
import logger from '../../core/logger';

export interface PageSeo {
  pageSlug: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;       // stored as relative URL e.g. /uploads/seo/about/og-image.jpg
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;  // stored as relative URL e.g. /uploads/seo/about/twitter-image.jpg
  noIndex: boolean;
  schema: string;        // JSON-LD structured data
}

export interface GlobalSeoSettings {
  headerScripts: string;
  footerScripts: string;
}

export interface SitemapConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
  excludeSlugs: string[];
  includedModels: string[];      // model names to include (e.g. ['BlogPost', 'Category'])
  staticPaths: string[];         // manually added static URLs
  maxUrlsPerSitemap: number;     // max URLs per sitemap file (0 = unlimited)
}

const SEO_DATA_DIR = path.join(__dirname, '../seo_data');
const PAGES_DIR    = path.join(SEO_DATA_DIR, 'pages');
const PUBLIC_DIR   = path.join(__dirname, '../../../public');
// Base uploads dir — slug sub-folders created on demand
const SEO_UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads/seo');

class SeoService {
  constructor() {
    this.ensureDirectoryStructure();
  }

  private ensureDirectoryStructure() {
    if (!fs.existsSync(SEO_DATA_DIR))   fs.mkdirSync(SEO_DATA_DIR,   { recursive: true });
    if (!fs.existsSync(PAGES_DIR))      fs.mkdirSync(PAGES_DIR,      { recursive: true });
    if (!fs.existsSync(SEO_UPLOADS_DIR)) fs.mkdirSync(SEO_UPLOADS_DIR, { recursive: true });
  }

  // --- Slug → safe folder name ---
  // e.g. "blog/post-1" → "blog__post-1", "/" → "home"
  private safeSlug(slug: string): string {
    return slug.replace(/^\//, '').replace(/\//g, '__') || 'home';
  }

  // Path to the slug's data folder under seo_data/pages/{slug}/
  getPageDir(slug: string): string {
    return path.join(PAGES_DIR, this.safeSlug(slug));
  }

  // Path to the slug's public uploads folder under public/uploads/seo/{slug}/
  getPageUploadDir(slug: string): string {
    return path.join(SEO_UPLOADS_DIR, this.safeSlug(slug));
  }

  ensurePageDirs(slug: string) {
    const dataDir   = this.getPageDir(slug);
    const uploadDir = this.getPageUploadDir(slug);
    if (!fs.existsSync(dataDir))   fs.mkdirSync(dataDir,   { recursive: true });
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  }

  // --- Robots.txt ---
  getRobotsContent(): string {
    const robotsPath = path.join(PUBLIC_DIR, 'robots.txt');
    if (!fs.existsSync(robotsPath)) return '';
    return fs.readFileSync(robotsPath, 'utf-8');
  }

  updateRobotsContent(content: string) {
    const robotsPath = path.join(PUBLIC_DIR, 'robots.txt');
    fs.writeFileSync(robotsPath, content, 'utf-8');
  }

  // --- Global Settings ---
  getGlobalSettings(): GlobalSeoSettings {
    const filePath = path.join(SEO_DATA_DIR, 'global_settings.json');
    if (!fs.existsSync(filePath)) return { headerScripts: '', footerScripts: '' };
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  updateGlobalSettings(settings: GlobalSeoSettings) {
    const filePath = path.join(SEO_DATA_DIR, 'global_settings.json');
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  // --- Page SEO ---
  // meta.json lives at pages/{slug}/meta.json
  private metaFilePath(slug: string): string {
    return path.join(this.getPageDir(slug), 'meta.json');
  }

  getPageSeo(slug: string): PageSeo | null {
    const filePath = this.metaFilePath(slug);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  listAllPageSeoSlugs(): string[] {
    // Each entry in PAGES_DIR is now a directory
    return fs.readdirSync(PAGES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const name = d.name;
        return name === 'home' ? '/' : `/${name.replace(/__/g, '/')}`;
      });
  }

  updatePageSeo(slug: string, data: PageSeo) {
    this.ensurePageDirs(slug);
    fs.writeFileSync(this.metaFilePath(slug), JSON.stringify(data, null, 2), 'utf-8');
  }

  deletePageSeo(slug: string) {
    const dir = this.getPageDir(slug);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    // Also remove upload folder
    const uploadDir = this.getPageUploadDir(slug);
    if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  // --- Sitemap ---
  getSitemapConfig(): SitemapConfig {
    const filePath = path.join(SEO_DATA_DIR, 'sitemap_config.json');
    if (!fs.existsSync(filePath)) {
      return {
        enabled: true,
        frequency: 'daily',
        priority: 0.8,
        excludeSlugs: [],
        includedModels: [],
        staticPaths: [],
        maxUrlsPerSitemap: 0,
      };
    }
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // back-compat defaults for new fields
    return { excludeSlugs: [], includedModels: [], staticPaths: [], maxUrlsPerSitemap: 0, ...saved };
  }

  updateSitemapConfig(config: SitemapConfig) {
    const filePath = path.join(SEO_DATA_DIR, 'sitemap_config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  getSitemapData(): string[] {
    const config = this.getSitemapConfig();
    if (!config.enabled) return [];

    const urls: string[] = [...this.listAllPageSeoSlugs()];
    // static paths
    urls.push(...(config.staticPaths || []).filter(Boolean));

    const normalizedExcludes = config.excludeSlugs.map(s => s.replace(/^\//, ''));
    return [...new Set(urls)].filter(url => !normalizedExcludes.includes(url.replace(/^\//, '')));
  }
}

export const seoService = new SeoService();
