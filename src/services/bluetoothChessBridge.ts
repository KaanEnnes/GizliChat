import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface PairedDevice {
  name: string;
  address: string;
}

interface BluetoothChessNative {
  isSupported: () => Promise<boolean>;
  isEnabled: () => Promise<boolean>;
  requestEnable: () => Promise<boolean>;
  getPairedDevices: () => Promise<PairedDevice[]>;
  startServer: () => Promise<boolean>;
  connectToDevice: (address: string) => Promise<boolean>;
  sendData: (data: string) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
}

const { BluetoothChess } = NativeModules as { BluetoothChess?: BluetoothChessNative };

const emitter = BluetoothChess ? new NativeEventEmitter(NativeModules.BluetoothChess) : null;

export function isBluetoothChessAvailable(): boolean {
  return Platform.OS === 'android' && !!BluetoothChess;
}

export async function isBluetoothSupported(): Promise<boolean> {
  if (!BluetoothChess) {
    return false;
  }
  return BluetoothChess.isSupported();
}

export async function isBluetoothEnabled(): Promise<boolean> {
  if (!BluetoothChess) {
    return false;
  }
  return BluetoothChess.isEnabled();
}

export async function requestEnableBluetooth(): Promise<void> {
  await BluetoothChess?.requestEnable();
}

export async function getPairedDevices(): Promise<PairedDevice[]> {
  if (!BluetoothChess) {
    return [];
  }
  return BluetoothChess.getPairedDevices();
}

/** Starts listening for an incoming connection — this side becomes white. */
export async function startBluetoothChessServer(): Promise<void> {
  if (!BluetoothChess) {
    throw new Error('Bluetooth bu cihazda kullanılamıyor.');
  }
  await BluetoothChess.startServer();
}

/** Connects to a paired device already hosting a game — this side becomes black. */
export async function connectToBluetoothChessHost(address: string): Promise<void> {
  if (!BluetoothChess) {
    throw new Error('Bluetooth bu cihazda kullanılamıyor.');
  }
  await BluetoothChess.connectToDevice(address);
}

export interface BluetoothChessMove {
  from: string;
  to: string;
  promotion?: string;
}

export async function sendBluetoothChessMove(move: BluetoothChessMove): Promise<void> {
  await BluetoothChess?.sendData(JSON.stringify(move));
}

/** Tells the other side to reset the board too, keeping both in sync. */
export async function sendBluetoothChessRestart(): Promise<void> {
  await BluetoothChess?.sendData(JSON.stringify({ restart: true }));
}

export async function disconnectBluetoothChess(): Promise<void> {
  await BluetoothChess?.disconnect();
}

export function onBluetoothChessConnected(handler: (opponentName: string) => void): () => void {
  const sub = emitter?.addListener('BluetoothChess:connected', (payload: { name?: string }) =>
    handler(payload?.name ?? 'Rakip'),
  );
  return () => sub?.remove();
}

export function onBluetoothChessDisconnected(handler: () => void): () => void {
  const sub = emitter?.addListener('BluetoothChess:disconnected', handler);
  return () => sub?.remove();
}

export function onBluetoothChessMove(handler: (move: BluetoothChessMove) => void): () => void {
  const sub = emitter?.addListener('BluetoothChess:data', (payload: { data?: string }) => {
    if (!payload?.data) {
      return;
    }
    try {
      const move = JSON.parse(payload.data) as BluetoothChessMove;
      if (typeof move.from === 'string' && typeof move.to === 'string') {
        handler(move);
      }
    } catch {
      // ignore malformed line
    }
  });
  return () => sub?.remove();
}

export function onBluetoothChessRestart(handler: () => void): () => void {
  const sub = emitter?.addListener('BluetoothChess:data', (payload: { data?: string }) => {
    if (!payload?.data) {
      return;
    }
    try {
      const parsed = JSON.parse(payload.data) as { restart?: boolean };
      if (parsed.restart) {
        handler();
      }
    } catch {
      // ignore malformed line
    }
  });
  return () => sub?.remove();
}

export function onBluetoothChessError(handler: (message: string) => void): () => void {
  const sub = emitter?.addListener('BluetoothChess:error', (payload: { message?: string }) =>
    handler(payload?.message ?? 'Bluetooth hatası'),
  );
  return () => sub?.remove();
}
