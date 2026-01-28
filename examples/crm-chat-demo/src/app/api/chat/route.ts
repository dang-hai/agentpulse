import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const SYSTEM_PROMPT = `You are an AI assistant that can control a CRM application through AgentPulse.

You have access to tools that let you inspect and control UI components:

WORKFLOW:
1. ALWAYS call 'discover' first to see available components and their current state
2. Use the information from discover to understand what actions are available
3. Execute the appropriate actions using expose_call, expose_set, or interact

AVAILABLE COMPONENTS (discovered at runtime):
- "contacts" - Contact list management
  - addContact({ name, email?, phone?, company? }) - Create a new contact
  - updateContact(id, data) - Update an existing contact
  - deleteContact(id) - Remove a contact
  - setSearch(query) - Filter contacts
  - highlightContact(id) - Visually highlight a contact

- "contact-form" - Form for adding contacts
  - openForm() - Show the form
  - setName/setEmail/setPhone/setCompany(value) - Fill form fields
  - submitForm() - Submit and create the contact

- "deals" - Deal pipeline management (stages: lead → qualified → proposal → won/lost)
  - addDeal({ title, value, contactId, stage? }) - Create a new deal
  - moveDeal(id, stage) - Move deal to a different stage
  - updateDeal(id, data) - Update deal properties
  - deleteDeal(id) - Remove a deal
  - getDealsByStage(stage) - Get deals in a specific stage

- "deal-form" - Form for adding deals
  - openForm() - Show the form
  - setTitle/setValue/setContactId/setStage(value) - Fill form fields
  - submitForm() - Submit and create the deal

IMPORTANT RULES:
- Always discover first to get current state before making changes
- When creating deals, you need a valid contactId from the contacts list
- Use interact tool for multi-step operations (e.g., fill form then submit)
- Provide clear, helpful responses about what you did`;

const agentPulseTools = {
  discover: tool({
    description: 'Discover all available UI components and their current state. Call this first to understand what you can control.',
    inputSchema: z.object({
      id: z.string().optional().describe('Optional: filter to a specific component ID'),
    }),
  }),

  expose_list: tool({
    description: 'List all registered components (basic info only, no current state)',
    inputSchema: z.object({}),
  }),

  expose_get: tool({
    description: 'Get the current value of a specific property on a component',
    inputSchema: z.object({
      id: z.string().describe('Component ID (e.g., "contacts", "deals")'),
      key: z.string().describe('Property name to get'),
    }),
  }),

  expose_set: tool({
    description: 'Set a value on a component (for properties that support setting)',
    inputSchema: z.object({
      id: z.string().describe('Component ID'),
      key: z.string().describe('Property name to set'),
      value: z.unknown().describe('Value to set'),
    }),
  }),

  expose_call: tool({
    description: 'Call an action/function on a component',
    inputSchema: z.object({
      id: z.string().describe('Component ID'),
      key: z.string().describe('Function name to call'),
      args: z.array(z.unknown()).optional().describe('Arguments to pass to the function'),
    }),
  }),

  interact: tool({
    description: 'Execute multiple actions in sequence. Use this for multi-step operations like filling a form and submitting.',
    inputSchema: z.object({
      actions: z.array(z.object({
        type: z.enum(['get', 'set', 'call']).describe('Action type'),
        id: z.string().describe('Component ID'),
        key: z.string().describe('Property or function name'),
        value: z.unknown().optional().describe('Value for set operations'),
        args: z.array(z.unknown()).optional().describe('Arguments for call operations'),
      })).describe('List of actions to execute in order'),
    }),
  }),
};

export async function POST(request: Request) {
  const { messages } = await request.json();

  const modelMessages = await convertToModelMessages(messages, { tools: agentPulseTools });

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: agentPulseTools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
