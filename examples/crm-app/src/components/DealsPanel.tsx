'use client';

import { useState } from 'react';
import { useExpose } from 'agentpulse';
import type { Contact, Deal, DealStage } from '@/types';
import { DEAL_STAGES, STAGE_LABELS } from '@/types';

interface DealsPanelProps {
  deals: Deal[];
  contacts: Contact[];
  onAdd: (data: Omit<Deal, 'id' | 'createdAt'>) => string;
  onUpdate: (id: string, data: Partial<Omit<Deal, 'id' | 'createdAt'>>) => void;
  onMove: (id: string, stage: DealStage) => void;
  onDelete: (id: string) => void;
  movingDeals: Set<string>;
  wonDeals: Set<string>;
}

function StageProgress({ currentStage }: { currentStage: DealStage }) {
  const stageIndex = DEAL_STAGES.indexOf(currentStage);
  const activeStages = DEAL_STAGES.slice(0, 4); // Exclude lost

  return (
    <div className="stage-progress">
      {activeStages.map((stage, i) => (
        <span key={stage} style={{ display: 'contents' }}>
          <span
            className={`stage-dot ${i < stageIndex ? 'completed' : ''} ${i === stageIndex ? 'active' : ''}`}
          />
          {i < activeStages.length - 1 && (
            <span className={`stage-line ${i < stageIndex ? 'completed' : ''}`} />
          )}
        </span>
      ))}
    </div>
  );
}

export function DealsPanel({
  deals,
  contacts,
  onAdd,
  onUpdate,
  onMove,
  onDelete,
  movingDeals,
  wonDeals,
}: DealsPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', value: '', contactId: '', stage: 'lead' as DealStage });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.contactId) return;
    onAdd({
      title: formData.title,
      value: Number(formData.value) || 0,
      contactId: formData.contactId,
      stage: formData.stage,
    });
    setFormData({ title: '', value: '', contactId: '', stage: 'lead' });
    setShowForm(false);
  };

  const getContactName = (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    return contact?.name || 'Unknown';
  };

  const getDealsByStage = (stage: DealStage) => deals.filter((d) => d.stage === stage);

  const getStageValue = (stage: DealStage) =>
    getDealsByStage(stage).reduce((sum, d) => sum + d.value, 0);

  const addDeal = (data: { title: string; value: number; contactId: string; stage?: DealStage }) => {
    return onAdd({
      title: data.title,
      value: data.value,
      contactId: data.contactId,
      stage: data.stage || 'lead',
    });
  };

  const openForm = () => setShowForm(true);
  const closeForm = () => setShowForm(false);

  const setFormField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const submitForm = () => {
    if (!formData.title.trim() || !formData.contactId) return false;
    onAdd({
      title: formData.title,
      value: Number(formData.value) || 0,
      contactId: formData.contactId,
      stage: formData.stage,
    });
    setFormData({ title: '', value: '', contactId: '', stage: 'lead' });
    setShowForm(false);
    return true;
  };

  useExpose('deals', {
    deals,
    stages: DEAL_STAGES,
    getDealsByStage,
    getStageValue,
    addDeal,
    updateDeal: onUpdate,
    moveDeal: onMove,
    deleteDeal: onDelete,
    getDeal: (id: string) => deals.find((d) => d.id === id),
    getDealsForContact: (contactId: string) => deals.filter((d) => d.contactId === contactId),
    getTotalValue: () => deals.filter((d) => d.stage !== 'lost').reduce((sum, d) => sum + d.value, 0),
    getWonValue: () => deals.filter((d) => d.stage === 'won').reduce((sum, d) => sum + d.value, 0),
  }, {
    description: 'Deal pipeline management. Stages: lead → qualified → proposal → won/lost. Use addDeal({ title, value, contactId, stage? }) to create, moveDeal(id, stage) to advance, updateDeal(id, data) to modify.',
  });

  useExpose('deal-form', {
    isOpen: showForm,
    formData,
    openForm,
    closeForm,
    setFormField,
    submitForm,
    setTitle: (v: string) => setFormField('title', v),
    setValue: (v: string) => setFormField('value', v),
    setContactId: (v: string) => setFormField('contactId', v),
    setStage: (v: string) => setFormField('stage', v),
  }, {
    description: 'Deal form controls. Use openForm() to show, setTitle/setValue/setContactId/setStage to fill fields, submitForm() to create deal.',
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Deal Pipeline</h2>
        <button className="primary small" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Deal'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '6px' }}>
          <div className="form-group">
            <label>Deal Title *</label>
            <input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enterprise License"
              className={formData.title ? 'ai-active' : ''}
              required
            />
          </div>
          <div className="form-group">
            <label>Value ($)</label>
            <input
              type="number"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              placeholder="10000"
              className={formData.value ? 'ai-active' : ''}
            />
          </div>
          <div className="form-group">
            <label>Contact *</label>
            <select
              value={formData.contactId}
              onChange={(e) => setFormData({ ...formData, contactId: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">Select a contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.company})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Stage</label>
            <select
              value={formData.stage}
              onChange={(e) => setFormData({ ...formData, stage: e.target.value as DealStage })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              {DEAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="primary">Add Deal</button>
        </form>
      )}

      <div className="pipeline">
        {DEAL_STAGES.map((stage) => (
          <div key={stage} className={`pipeline-column ${stage}`}>
            <div className="pipeline-header">
              <span className="pipeline-title">{STAGE_LABELS[stage]}</span>
              <span className="pipeline-count">{getDealsByStage(stage).length}</span>
            </div>
            {getDealsByStage(stage).map((deal) => {
              const isMoving = movingDeals.has(deal.id);
              const justWon = wonDeals.has(deal.id);

              return (
                <div
                  key={deal.id}
                  className={`deal-card ${isMoving ? 'moving' : ''} ${justWon ? 'just-won' : ''}`}
                >
                  <div className="deal-title">{deal.title}</div>
                  <div className="deal-value">${deal.value.toLocaleString()}</div>
                  <div className="deal-contact">{getContactName(deal.contactId)}</div>
                  {stage !== 'won' && stage !== 'lost' && (
                    <StageProgress currentStage={stage} />
                  )}
                  <div className="deal-actions">
                    {stage !== 'lead' && stage !== 'won' && stage !== 'lost' && (
                      <button
                        className="secondary small"
                        onClick={() => onMove(deal.id, DEAL_STAGES[DEAL_STAGES.indexOf(stage) - 1])}
                        disabled={isMoving}
                      >
                        ←
                      </button>
                    )}
                    {stage !== 'won' && stage !== 'lost' && (
                      <button
                        className="secondary small"
                        onClick={() => onMove(deal.id, DEAL_STAGES[DEAL_STAGES.indexOf(stage) + 1])}
                        disabled={isMoving}
                      >
                        →
                      </button>
                    )}
                    <button className="danger small" onClick={() => onDelete(deal.id)} disabled={isMoving}>
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
            {getDealsByStage(stage).length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#999', fontSize: '0.75rem' }}>
                No deals
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
