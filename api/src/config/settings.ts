import { config } from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
config();

const PLACEHOLDER_SECRET = 'your-secret-key-change-in-production';
const PLACEHOLDER_JWT = 'jwt-secret-key-change-in-production';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEBUG: z.string().optional(),
  SECRET_KEY: z.string().min(16, 'SECRET_KEY must be at least 16 characters').default(PLACEHOLDER_SECRET),
  DB_ENGINE: z.enum(['sqlite', 'postgresql']).default('sqlite'),
  DB_PATH: z.string().default('./db.sqlite3'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').default(PLACEHOLDER_JWT),
  JWT_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().optional(),
  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_SECURE: z.string().optional(),
  EMAIL_USER: z.string().default(''),
  EMAIL_PASSWORD: z.string().default(''),
  EMAIL_FROM: z.string().default('noreply@example.com'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  ADMIN_URL: z.string().default('http://localhost:8001'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

// Warn (or fail in production) if placeholder secrets are still in use
if (env.NODE_ENV === 'production') {
  const errors: string[] = [];
  if (env.SECRET_KEY === PLACEHOLDER_SECRET) {
    errors.push('SECRET_KEY must be changed from the default placeholder in production');
  }
  if (env.JWT_SECRET === PLACEHOLDER_JWT) {
    errors.push('JWT_SECRET must be changed from the default placeholder in production');
  }
  if (env.DB_ENGINE === 'postgresql' && !env.DATABASE_URL) {
    errors.push('DATABASE_URL is required when DB_ENGINE=postgresql');
  }
  if (errors.length > 0) {
    for (const err of errors) console.error(`[FATAL] ${err}`);
    process.exit(1);
  }
} else {
  if (env.SECRET_KEY === PLACEHOLDER_SECRET) {
    console.warn('[WARNING] SECRET_KEY is using the default placeholder. Set a strong value before deploying to production.');
  }
  if (env.JWT_SECRET === PLACEHOLDER_JWT) {
    console.warn('[WARNING] JWT_SECRET is using the default placeholder. Set a strong value before deploying to production.');
  }
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

export interface AppSettings {
  port: number;
  host: string;
  environment: 'development' | 'production' | 'test';
  debug: boolean;
  secretKey: string;
  database: {
    engine: 'sqlite' | 'postgresql';
    path: string;
    url?: string;
  };
  email: EmailConfig;
  jwt: {
    secret: string;
    expiresIn: SignOptions['expiresIn'];
    refreshExpiresIn: SignOptions['expiresIn'];
  };
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  apps: string[];
}

const settings: AppSettings = {
  port: env.PORT,
  host: env.HOST,
  environment: env.NODE_ENV,
  debug: env.DEBUG ? env.DEBUG === 'true' : env.NODE_ENV !== 'production',
  secretKey: env.SECRET_KEY,

  database: {
    engine: env.DB_ENGINE,
    path: env.DB_PATH,
    url: env.DATABASE_URL,
  },

  email: {
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_SECURE === 'true',
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASSWORD,
    },
    from: env.EMAIL_FROM,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  },

  cors: {
    origin: env.CORS_ORIGIN?.split(',') || ['http://localhost:8001', 'http://localhost:3000'],
    credentials: true,
  },

  apps: [
    'auth',
    // Add your apps here
  ],
};

export default settings;
