export interface UserPreferences {
  language: string;
  theme: 'light' | 'dark' | 'system';
  timezone: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  status: 'active' | 'suspended' | 'pending';
  emailVerified: boolean;
  defaultWorkspaceId?: string;
  preferences: UserPreferences;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileDto {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  defaultWorkspaceId?: string;
  preferences: UserPreferences;
}

