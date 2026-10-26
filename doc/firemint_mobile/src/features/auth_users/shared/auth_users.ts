export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  disabled: boolean;
  emailVerified: boolean;
  customAttributes: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  providerIds: string[];
};

export type ListAuthUsersResult = {
  users: AuthUser[];
  nextPageToken: string;
};

export type UpdateAuthUserInput = {
  email: string;
  displayName: string;
  phoneNumber: string;
  password: string;
  emailVerified: boolean;
  customAttributesJson: string;
};
