'use client';

import { AgentPulseProvider, VisualOverlay } from 'agentpulse';
import { animationTargets } from '@/animation.config';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AgentPulseProvider
      endpoint="ws://localhost:3100/ws"
      onConnect={() => console.log('[AgentPulse] Connected to server')}
      onDisconnect={() => console.log('[AgentPulse] Disconnected from server')}
      onError={(err) => console.error('[AgentPulse] Connection error:', err)}
    >
      {children}
      <VisualOverlay targets={animationTargets} />
    </AgentPulseProvider>
  );
}
