export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  createdAt: number;
}

export interface Deal {
  id: string;
  title: string;
  value: number;
  contactId: string;
  stage: DealStage;
  createdAt: number;
}

export type DealStage = 'lead' | 'qualified' | 'proposal' | 'won' | 'lost';

export const DEAL_STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'won', 'lost'];

export const STAGE_LABELS: Record<DealStage, string> = {
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};
