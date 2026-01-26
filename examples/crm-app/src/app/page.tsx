'use client';

import { useState, useCallback } from 'react';
import { useAgentPulse } from 'agentpulse';
import { ContactsPanel } from '@/components/ContactsPanel';
import { DealsPanel } from '@/components/DealsPanel';
import { ToastContainer, useToast } from '@/components/Toast';
import type { Contact, Deal, DealStage } from '@/types';
import { STAGE_LABELS } from '@/types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const INITIAL_CONTACTS: Contact[] = [
  { id: 'c1', name: 'Alice Chen', email: 'alice@acme.com', phone: '555-0101', company: 'Acme Corp', createdAt: Date.now() },
  { id: 'c2', name: 'Bob Smith', email: 'bob@techstart.io', phone: '555-0102', company: 'TechStart', createdAt: Date.now() },
  { id: 'c3', name: 'Carol Davis', email: 'carol@bigco.com', phone: '555-0103', company: 'BigCo Inc', createdAt: Date.now() },
];

const INITIAL_DEALS: Deal[] = [
  { id: 'd1', title: 'Enterprise License', value: 50000, contactId: 'c1', stage: 'qualified', createdAt: Date.now() },
  { id: 'd2', title: 'Starter Package', value: 5000, contactId: 'c2', stage: 'lead', createdAt: Date.now() },
  { id: 'd3', title: 'Consulting Project', value: 25000, contactId: 'c3', stage: 'proposal', createdAt: Date.now() },
];

export default function CRMPage() {
  const { isConnected } = useAgentPulse();
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS);
  const [movingDeals, setMovingDeals] = useState<Set<string>>(new Set());
  const [wonDeals, setWonDeals] = useState<Set<string>>(new Set());
  const [statsUpdated, setStatsUpdated] = useState(false);
  const { toasts, removeToast, toast } = useToast();

  const addContact = useCallback((data: Omit<Contact, 'id' | 'createdAt'>) => {
    const newContact: Contact = {
      ...data,
      id: generateId(),
      createdAt: Date.now(),
    };
    setContacts((prev) => [...prev, newContact]);
    toast.contactAdded(data.name);
    return newContact.id;
  }, [toast]);

  const updateContact = useCallback((id: string, data: Partial<Omit<Contact, 'id' | 'createdAt'>>) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...data } : c))
    );
    toast.success('Contact updated');
  }, [toast]);

  const deleteContact = useCallback((id: string) => {
    const contact = contacts.find(c => c.id === id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setDeals((prev) => prev.filter((d) => d.contactId !== id));
    if (contact) toast.warning(`Deleted ${contact.name}`);
  }, [contacts, toast]);

  const addDeal = useCallback((data: Omit<Deal, 'id' | 'createdAt'>) => {
    const newDeal: Deal = {
      ...data,
      id: generateId(),
      createdAt: Date.now(),
    };
    setDeals((prev) => [...prev, newDeal]);
    toast.success(`New deal: ${data.title}`);

    setStatsUpdated(true);
    setTimeout(() => setStatsUpdated(false), 500);

    return newDeal.id;
  }, [toast]);

  const updateDeal = useCallback((id: string, data: Partial<Omit<Deal, 'id' | 'createdAt'>>) => {
    setDeals((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...data } : d))
    );
  }, []);

  const moveDeal = useCallback((id: string, stage: DealStage) => {
    const deal = deals.find(d => d.id === id);
    if (!deal || deal.stage === stage) return;

    const fromStage = STAGE_LABELS[deal.stage];
    const toStage = STAGE_LABELS[stage];

    setMovingDeals(prev => new Set(prev).add(id));

    setTimeout(() => {
      setDeals((prev) =>
        prev.map((d) => (d.id === id ? { ...d, stage } : d))
      );

      setMovingDeals(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      if (stage === 'won') {
        setWonDeals(prev => new Set(prev).add(id));
        toast.dealWon(deal.title, deal.value);
        setTimeout(() => {
          setWonDeals(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 1000);
      } else {
        toast.dealMoved(deal.title, fromStage, toStage);
      }

      setStatsUpdated(true);
      setTimeout(() => setStatsUpdated(false), 500);
    }, 300);
  }, [deals, toast]);

  const deleteDeal = useCallback((id: string) => {
    const deal = deals.find(d => d.id === id);
    setDeals((prev) => prev.filter((d) => d.id !== id));
    if (deal) toast.warning(`Deleted: ${deal.title}`);
  }, [deals, toast]);

  const totalPipelineValue = deals
    .filter((d) => d.stage !== 'lost')
    .reduce((sum, d) => sum + d.value, 0);

  const wonValue = deals
    .filter((d) => d.stage === 'won')
    .reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="header">
        <h1>Mini CRM</h1>
        <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot" />
          {isConnected ? 'MCP Connected' : 'MCP Disconnected'}
        </span>
      </div>

      <div className="stats">
        <div className={`stat-card ${statsUpdated ? 'updated' : ''}`}>
          <div className="stat-value">{contacts.length}</div>
          <div className="stat-label">Contacts</div>
        </div>
        <div className={`stat-card ${statsUpdated ? 'updated' : ''}`}>
          <div className="stat-value">${totalPipelineValue.toLocaleString()}</div>
          <div className="stat-label">Pipeline Value</div>
        </div>
        <div className={`stat-card ${statsUpdated ? 'updated' : ''}`}>
          <div className="stat-value">${wonValue.toLocaleString()}</div>
          <div className="stat-label">Won Deals</div>
        </div>
      </div>

      <div className="layout">
        <ContactsPanel
          contacts={contacts}
          onAdd={addContact}
          onUpdate={updateContact}
          onDelete={deleteContact}
        />
        <DealsPanel
          deals={deals}
          contacts={contacts}
          onAdd={addDeal}
          onUpdate={updateDeal}
          onMove={moveDeal}
          onDelete={deleteDeal}
          movingDeals={movingDeals}
          wonDeals={wonDeals}
        />
      </div>
    </div>
  );
}
