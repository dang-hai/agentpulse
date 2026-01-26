import React from 'react';
import ReactDOM from 'react-dom/client';
import { AgentPulseProvider } from 'agentpulse';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AgentPulseProvider
      endpoint="ws://localhost:3100/ws"
      onConnect={() => console.log('[AgentPulse] Connected to server')}
      onDisconnect={() => console.log('[AgentPulse] Disconnected from server')}
      onError={(err) => console.error('[AgentPulse] Connection error:', err)}
    >
      <App />
    </AgentPulseProvider>
  </React.StrictMode>
);
