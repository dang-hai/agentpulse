/**
 * AgentPulse Electron Preload
 *
 * Call setupAgentPulse() in your preload script to expose IPC bridge to renderer.
 *
 * @example
 * // preload.ts
 * import { setupAgentPulse } from 'agentpulse/preload';
 * setupAgentPulse();
 */

import type { AgentPulseBridge } from '../core/types.js';

export type { AgentPulseBridge };

// Electron types (peer dependency)
interface IpcRendererEvent {
  sender: unknown;
  senderId: number;
}

interface IpcRenderer {
  send(channel: string, ...args: unknown[]): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): this;
  removeListener(channel: string, listener: (...args: unknown[]) => void): this;
}

interface ContextBridge {
  exposeInMainWorld(apiKey: string, api: unknown): void;
}

// Import electron at runtime (only works in preload context)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electron = require('electron') as {
  contextBridge: ContextBridge;
  ipcRenderer: IpcRenderer;
};

/**
 * Set up the AgentPulse IPC bridge in the preload script.
 *
 * @param channel - Base channel name (default: 'agentpulse')
 *
 * @example
 * // preload.ts
 * import { setupAgentPulse } from 'agentpulse/preload';
 * setupAgentPulse();
 */
export function setupAgentPulse(channel = 'agentpulse'): void {
  const { contextBridge, ipcRenderer } = electron;

  const bridge: AgentPulseBridge = {
    send: (ch: string, data: unknown) => {
      ipcRenderer.send(`${channel}:${ch}`, data);
    },
    invoke: (ch: string, data: unknown) => {
      return ipcRenderer.invoke(`${channel}:${ch}`, data);
    },
    on: (ch: string, callback: (data: unknown) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on(`${channel}:${ch}`, handler);
      return () => {
        ipcRenderer.removeListener(`${channel}:${ch}`, handler as (...args: unknown[]) => void);
      };
    },
    onCustomRequest: (ch: string, handler: (payload: unknown) => Promise<unknown> | unknown) => {
      const ipcHandler = async (_event: IpcRendererEvent, payload: unknown) => {
        return await handler(payload);
      };
      ipcRenderer.on(`${channel}:custom:${ch}`, ipcHandler);
      return () => {
        ipcRenderer.removeListener(
          `${channel}:custom:${ch}`,
          ipcHandler as (...args: unknown[]) => void
        );
      };
    },
  };

  contextBridge.exposeInMainWorld('agentpulse', bridge);
}
