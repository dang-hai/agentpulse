'use client';

import { useEffect, useState } from 'react';
import { useExpose } from 'agentpulse';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'deal-moved';
  message: string;
  icon?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastProps) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(toast.id), 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const icons: Record<string, string> = {
    success: '✓',
    info: 'ℹ',
    warning: '⚠',
    'deal-moved': '→',
  };

  return (
    <div className={`toast ${toast.type} ${exiting ? 'exiting' : ''}`}>
      <span className="toast-icon">{toast.icon || icons[toast.type]}</span>
      {toast.message}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastMessage['type'], message: string, icon?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, icon }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toast = {
    success: (msg: string) => addToast('success', msg, '✓'),
    info: (msg: string) => addToast('info', msg, 'ℹ'),
    warning: (msg: string) => addToast('warning', msg, '⚠'),
    dealMoved: (title: string, from: string, to: string) =>
      addToast('deal-moved', `${title}: ${from} → ${to}`, '📊'),
    contactAdded: (name: string) => addToast('success', `Added ${name}`, '👤'),
    dealWon: (title: string, value: number) =>
      addToast('success', `🎉 Won: ${title} ($${value.toLocaleString()})`, '🏆'),
  };

  useExpose('notifications', {
    toast,
    showSuccess: toast.success,
    showInfo: toast.info,
    showWarning: toast.warning,
    showDealMoved: toast.dealMoved,
    showDealWon: toast.dealWon,
  }, {
    description: 'Toast notifications. Use showSuccess(msg), showInfo(msg), showDealMoved(title, from, to), showDealWon(title, value).',
  });

  return { toasts, addToast, removeToast, toast };
}
