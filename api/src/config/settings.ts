import { config } from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';
config();

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
    path: string;
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
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || '0.0.0.0',
  environment: (process.env.NODE_ENV as any) || 'development',
  debug: process.env.DEBUG ? process.env.DEBUG === 'true' : (process.env.NODE_ENV !== 'production'),
  secretKey: process.env.SECRET_KEY || 'your-secret-key-change-in-production',

  database: {
    path: process.env.DB_PATH || './db.sqlite3'
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASSWORD || ''
    },
    from: process.env.EMAIL_FROM || 'noreply@example.com'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'jwt-secret-key-change-in-production',
    expiresIn: (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'],
    refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn']
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:8001', 'http://localhost:3000'],
    credentials: true
  },

  apps: [
    'auth',
    // Add your apps here
  ]
};

export default settings;
