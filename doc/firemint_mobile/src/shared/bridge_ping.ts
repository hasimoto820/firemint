import {NativeModules} from 'react-native';

type BridgePing = {
  ping: () => Promise<string>;
};

export function ping(): Promise<string> {
  const mod = NativeModules.BridgePing as BridgePing | undefined;
  if (!mod) {
    return Promise.reject(new Error('BridgePing missing'));
  }
  return mod.ping();
}
