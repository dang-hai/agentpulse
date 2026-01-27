'use client';

import { useState, useRef } from 'react';
import { useExpose, createScrollBindings } from 'agentpulse';
import type { Contact } from '@/types';

interface ContactsPanelProps {
  contacts: Contact[];
  onAdd: (data: Omit<Contact, 'id' | 'createdAt'>) => string;
  onUpdate: (id: string, data: Partial<Omit<Contact, 'id' | 'createdAt'>>) => void;
  onDelete: (id: string) => void;
}

export function ContactsPanel({ contacts, onAdd, onUpdate, onDelete }: ContactsPanelProps) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', company: '' });
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onAdd(formData);
    setFormData({ name: '', email: '', phone: '', company: '' });
    setShowForm(false);
  };

  const addContact = (data: { name: string; email?: string; phone?: string; company?: string }) => {
    return onAdd({
      name: data.name,
      email: data.email || '',
      phone: data.phone || '',
      company: data.company || '',
    });
  };

  const openForm = () => setShowForm(true);
  const closeForm = () => setShowForm(false);

  const setFormField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const submitForm = () => {
    if (!formData.name.trim()) return false;
    onAdd(formData);
    setFormData({ name: '', email: '', phone: '', company: '' });
    setShowForm(false);
    return true;
  };

  const highlightContact = (id: string) => {
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), 2000);
  };

  useExpose('contacts', {
    contacts: filteredContacts,
    allContacts: contacts,
    count: contacts.length,
    search,
    setSearch,
    addContact,
    updateContact: onUpdate,
    deleteContact: onDelete,
    getContact: (id: string) => contacts.find((c) => c.id === id),
    findByEmail: (email: string) => contacts.find((c) => c.email === email),
    findByCompany: (company: string) => contacts.filter((c) =>
      c.company.toLowerCase().includes(company.toLowerCase())
    ),
    highlightContact,
    ...createScrollBindings(listRef),
  }, {
    description: 'Contact management. Use addContact({ name, email?, phone?, company? }) to create, updateContact(id, data) to modify, deleteContact(id) to remove. Search with setSearch(query). highlightContact(id) to visually highlight. Scroll: scrollToTop(), scrollToBottom(), scrollBy(delta).',
  });

  useExpose('contact-form', {
    isOpen: showForm,
    formData,
    openForm,
    closeForm,
    setFormField,
    submitForm,
    setName: (v: string) => setFormField('name', v),
    setEmail: (v: string) => setFormField('email', v),
    setPhone: (v: string) => setFormField('phone', v),
    setCompany: (v: string) => setFormField('company', v),
  }, {
    description: 'Contact form controls. Use openForm() to show, setName/setEmail/setPhone/setCompany to fill fields, submitForm() to create contact.',
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Contacts</h2>
        <button className="primary small" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '6px' }}>
          <div className="form-group">
            <label>Name *</label>
            <input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              className={formData.name ? 'ai-active' : ''}
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              className={formData.email ? 'ai-active' : ''}
            />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="555-0100"
              className={formData.phone ? 'ai-active' : ''}
            />
          </div>
          <div className="form-group">
            <label>Company</label>
            <input
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Acme Corp"
              className={formData.company ? 'ai-active' : ''}
            />
          </div>
          <button type="submit" className="primary">Add Contact</button>
        </form>
      )}

      <div className="search-box">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className={search ? 'ai-active' : ''}
        />
      </div>

      <ul ref={listRef} className="contact-list">
        {filteredContacts.map((contact) => (
          <li
            key={contact.id}
            className={`contact-item ${highlightedId === contact.id ? 'highlighted' : ''}`}
          >
            <div className="contact-info">
              <div className="contact-name">{contact.name}</div>
              <div className="contact-details">
                {contact.email && <span>{contact.email}</span>}
                {contact.company && <span> · {contact.company}</span>}
              </div>
            </div>
            <div className="contact-actions">
              <button className="danger small" onClick={() => onDelete(contact.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {filteredContacts.length === 0 && (
          <li style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
            No contacts found
          </li>
        )}
      </ul>
    </div>
  );
}
