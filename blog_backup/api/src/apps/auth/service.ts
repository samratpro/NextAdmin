import {
  User,
  EmailVerificationToken,
  PasswordResetToken,
  RefreshToken,
  UserRecord,
  EmailVerificationTokenRecord,
  PasswordResetTokenRecord,
  RefreshTokenRecord
} from './models';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import settings from '../../config/settings';
import emailService from '../../core/email';

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface TokenPayload {
  userId: number;
  email: string;
  username: string;
  isStaff: boolean;
  isSuperuser: boolean;
  needsPasswordReset: boolean;
}

class AuthService {
  generateAccessToken(user: UserRecord): string {
    const authUser = user;
    const payload: TokenPayload = {
      userId: authUser.id!,
      email: authUser.email,
      username: authUser.username,
      isStaff: authUser.isStaff,
      isSuperuser: authUser.isSuperuser,
      needsPasswordReset: authUser.needsPasswordReset
    };

    return jwt.sign(payload, settings.jwt.secret, {
      expiresIn: settings.jwt.expiresIn
    });
  }

  async generateRefreshToken(user: UserRecord): Promise<string> {
    const authUser = user;
    const token = jwt.sign(
      { userId: authUser.id, jti: uuidv4() },  // jti ensures uniqueness even within the same second
      settings.jwt.secret,
      { expiresIn: settings.jwt.refreshExpiresIn }
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await RefreshToken.objects.create({
      userId: authUser.id!.toString(),
      token,
      expiresAt: expiresAt.toISOString()
    });

    return token;
  }

  async register(data: RegisterData): Promise<{ success: boolean; message: string; user?: UserRecord }> {
    // Check if user already exists
    const existingUser = await User.objects.get<UserRecord>({ email: data.email });
    if (existingUser) {
      return { success: false, message: 'User with this email already exists' };
    }

    const existingUsername = await User.objects.get<UserRecord>({ username: data.username });
    if (existingUsername) {
      return { success: false, message: 'Username already taken' };
    }

    // Create user
    const user = new User() as unknown as UserRecord;
    user.username = data.username;
    user.email = data.email;
    user.firstName = data.firstName || '';
    user.lastName = data.lastName || '';
    await user.setPassword(data.password);
    await user.save();

    // Generate verification token
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    await EmailVerificationToken.objects.create({
      userId: user.id!.toString(),
      token,
      expiresAt: expiresAt.toISOString()
    });

    // Send verification email
    await emailService.sendVerificationEmail(user.email, token, user.username);

    return {
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user
    };
  }

  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    const verificationToken = await EmailVerificationToken.objects.get<EmailVerificationTokenRecord>({ token });

    if (!verificationToken) {
      return { success: false, message: 'Invalid verification token' };
    }

    if (verificationToken.isExpired()) {
      return { success: false, message: 'Verification token has expired' };
    }

    const user = await User.objects.get<UserRecord>({ id: parseInt(verificationToken.userId, 10) });
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    user.isActive = true;
    await user.save();

    // Delete used token
    await verificationToken.delete();

    return { success: true, message: 'Email verified successfully' };
  }

  async login(data: LoginData): Promise<{ success: boolean; message: string; accessToken?: string; refreshToken?: string; user?: any }> {
    const user = await User.objects.get<UserRecord>({ email: data.email });

    if (!user) {
      return { success: false, message: 'Invalid credentials' };
    }

    const isPasswordValid = await user.checkPassword(data.password);
    if (!isPasswordValid) {
      return { success: false, message: 'Invalid credentials' };
    }

    if (!user.isActive) {
      return { success: false, message: 'Please verify your email before logging in' };
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    await user.save();

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    return {
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: user.toJSON()
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ success: boolean; message: string; accessToken?: string; refreshToken?: string }> {
    try {
      const decoded = jwt.verify(refreshToken, settings.jwt.secret) as JwtPayload & { userId: number };

      const tokenRecord = await RefreshToken.objects.get<RefreshTokenRecord>({ token: refreshToken });
      if (!tokenRecord || !tokenRecord.isValid()) {
        return { success: false, message: 'Invalid refresh token' };
      }

      const user = await User.objects.get<UserRecord>({ id: decoded.userId });
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Rotate: revoke the old token before issuing a new one
      tokenRecord.revoked = true;
      await tokenRecord.save();

      const accessToken = this.generateAccessToken(user);
      const newRefreshToken = await this.generateRefreshToken(user);

      return { success: true, message: 'Token refreshed', accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      return { success: false, message: 'Invalid refresh token' };
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const user = await User.objects.get<UserRecord>({ email });

    if (!user) {
      // Don't reveal if user exists
      return { success: true, message: 'If an account exists with this email, a password reset link has been sent.' };
    }

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour

    await PasswordResetToken.objects.create({
      userId: user.id!.toString(),
      token,
      expiresAt: expiresAt.toISOString()
    });

    await emailService.sendPasswordResetEmail(user.email, token, user.username);

    return { success: true, message: 'If an account exists with this email, a password reset link has been sent.' };
  }

  async createPasswordResetTokenForUser(userId: number, expiresInHours = 24): Promise<{ token: string; user: UserRecord }> {
    const user = await User.objects.get<UserRecord>({ id: userId });
    if (!user) {
      throw new Error('User not found');
    }

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    await PasswordResetToken.objects.create({
      userId: user.id!.toString(),
      token,
      expiresAt: expiresAt.toISOString()
    });

    return { token, user };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const resetToken = await PasswordResetToken.objects.get<PasswordResetTokenRecord>({ token });

    if (!resetToken) {
      return { success: false, message: 'Invalid reset token' };
    }

    if (resetToken.used) {
      return { success: false, message: 'Reset token has already been used' };
    }

    if (resetToken.isExpired()) {
      return { success: false, message: 'Reset token has expired' };
    }

    const user = await User.objects.get<UserRecord>({ id: parseInt(resetToken.userId, 10) });
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    await user.setPassword(newPassword);
    (user as any).needsPasswordReset = false;
    await user.save();

    resetToken.used = true;
    await resetToken.save();

    // Revoke all refresh tokens
    const refreshTokens = await RefreshToken.objects.filter<RefreshTokenRecord>({ userId: user.id!.toString() }).all();
    for (const rt of refreshTokens) {
      rt.revoked = true;
      await rt.save();
    }

    await emailService.sendPasswordChangedEmail(user.email, user.username);

    return { success: true, message: 'Password reset successful' };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const user = await User.objects.get<UserRecord>({ id: userId });

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    const isPasswordValid = await user.checkPassword(currentPassword);
    if (!isPasswordValid) {
      return { success: false, message: 'Current password is incorrect' };
    }

    await user.setPassword(newPassword);
    await user.save();

    await emailService.sendPasswordChangedEmail(user.email, user.username);

    return { success: true, message: 'Password changed successfully' };
  }

  async setupPassword(userId: number, newPassword: string): Promise<{ success: boolean; message: string }> {
    const user = await User.objects.get<UserRecord>({ id: userId });

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    const rec = user as any;
    if (!rec.needsPasswordReset) {
      return { success: false, message: 'Account already configured' };
    }

    await rec.setPassword(newPassword);
    rec.needsPasswordReset = false;
    await rec.save();

    await emailService.sendPasswordChangedEmail(rec.email, rec.username);

    return { success: true, message: 'Account configured successfully' };
  }

  async updateProfile(userId: number, data: { username?: string; firstName?: string; lastName?: string }): Promise<UserRecord> {
    const user = await User.objects.get<UserRecord>({ id: userId });
    if (!user) throw new Error('User not found');

    const rec = user as unknown as UserRecord & { save: () => Promise<void> };

    if (data.username && data.username !== rec.username) {
      const taken = await User.objects.get<UserRecord>({ username: data.username });
      if (taken) throw new Error('Username is already taken');
      rec.username = data.username;
    }
    if (data.firstName !== undefined) rec.firstName = data.firstName;
    if (data.lastName  !== undefined) rec.lastName  = data.lastName;

    await rec.save();
    return rec;
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, settings.jwt.secret) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }
}

export default new AuthService();
