import {NativeModules} from 'react-native';

type AppVersion = {
  versionName: string;
  versionCode: number;
};

type SettingsNative = {
  getTheme: () => Promise<{color1: string; color2: string}>;
  setTheme: (color1: string, color2: string) => Promise<void>;
  getLanguage: () => Promise<string>;
  setLanguage: (language: string) => Promise<void>;
  getTextScale: () => Promise<string>;
  setTextScale: (scale: string) => Promise<void>;
  getDeviceLocale: () => Promise<string>;
  getAppVersion: () => Promise<AppVersion>;
};

function native(): SettingsNative | null {
  return (NativeModules.Settings as SettingsNative | undefined) ?? null;
}

export async function getTheme(): Promise<{color1: string; color2: string}> {
  const mod = native();
  if (!mod) {
    return {color1: 'white', color2: 'orange'};
  }
  try {
    return await mod.getTheme();
  } catch {
    return {color1: 'white', color2: 'orange'};
  }
}

export async function setTheme(color1: string, color2: string): Promise<void> {
  const mod = native();
  if (!mod) {
    return;
  }
  await mod.setTheme(color1, color2);
}

export async function getLanguage(): Promise<string> {
  const mod = native();
  if (!mod) {
    return '';
  }
  try {
    return await mod.getLanguage();
  } catch {
    return '';
  }
}

export async function setLanguage(language: string): Promise<void> {
  const mod = native();
  if (!mod) {
    return;
  }
  await mod.setLanguage(language);
}

export async function getTextScale(): Promise<string> {
  const mod = native();
  if (!mod) {
    return '';
  }
  try {
    return await mod.getTextScale();
  } catch {
    return '';
  }
}

export async function setTextScale(scale: string): Promise<void> {
  const mod = native();
  if (!mod) {
    return;
  }
  await mod.setTextScale(scale);
}

export async function getDeviceLocale(): Promise<string> {
  const mod = native();
  if (!mod) {
    return '';
  }
  try {
    return await mod.getDeviceLocale();
  } catch {
    return '';
  }
}

export async function getAppVersion(): Promise<AppVersion> {
  const mod = native();
  if (!mod) {
    return {versionName: '', versionCode: 0};
  }
  try {
    return await mod.getAppVersion();
  } catch {
    return {versionName: '', versionCode: 0};
  }
}
