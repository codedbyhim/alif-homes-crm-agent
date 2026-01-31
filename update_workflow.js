const https = require('https');
const config = require('./config.json');

const updatedWorkflow = {
  name: 'Zoho CRM AI Chat Agent',
  nodes: [
    {
      parameters: { options: {} },
      id: '1',
      name: 'Chat Trigger',
      type: '@n8n/n8n-nodes-langchain.chatTrigger',
      typeVersion: 1.1,
      position: [0, 208],
      webhookId: 'chat-trigger-1'
    },
    {
      parameters: { updates: ['message'], additionalFields: {} },
      id: '10',
      name: 'Telegram Trigger',
      type: 'n8n-nodes-base.telegramTrigger',
      typeVersion: 1.2,
      position: [0, 464],
      webhookId: 'telegram-trigger-1',
      credentials: { telegramApi: { id: 'tk6Hy4g3KjjYESOo', name: 'Telegram account' } }
    },
    {
      parameters: { jsCode: `const chatInput = $input.first().json.chatInput || '';
return [{ json: { chatInput, source: 'chat', chatId: null } }];` },
      id: '11',
      name: 'From Chat',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [208, 208]
    },
    {
      parameters: { jsCode: `const msg = $input.first().json.message || {};
const chatInput = msg.text || '';
const chatId = msg.chat?.id || msg.from?.id;
return [{ json: { chatInput, source: 'telegram', chatId } }];` },
      id: '12',
      name: 'From Telegram',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [208, 464]
    },
    {
      parameters: { jsCode: `const input = $input.first().json;
const chatInput = input.chatInput || '';
const chatInputLower = chatInput.toLowerCase();
const source = input.source;
const chatId = input.chatId;

let module = null;

const patterns = [
  { m: 'Bookings', p: ['check-out', 'checkout', 'check-in', 'checkin', 'booking', 'reservation', 'arrival', 'departure', 'commission', 'net commission'] },
  { m: 'Rentals_Service', p: ['rental service', 'rentals service', 'service'] },
  { m: 'Tenants', p: ['tenant', 'renter'] },
  { m: 'Rental_Properties', p: ['propert', 'house', 'apartment', 'building'] },
  { m: 'Monthly_Rent', p: ['monthly rent', 'rent due', 'rent paid'] },
  { m: 'Rental_Payments', p: ['payment', 'paid', 'income'] },
  { m: 'Unit_Owner_Database', p: ['owner', 'landlord'] },
  { m: 'Property_Units_Database', p: ['unit', 'room'] },
  { m: 'Guests_Database', p: ['guest', 'visitor'] },
  { m: 'Airbnb_Services', p: ['airbnb'] },
  { m: 'Rental_Water_Bills', p: ['water bill', 'water'] },
  { m: 'Rental_Management', p: ['lease', 'agreement', 'contract'] },
];

for (const {m, p} of patterns) {
  if (p.some(x => chatInputLower.includes(x))) { module = m; break; }
}

if (chatInputLower.includes('list modules') || chatInputLower.includes('show modules')) {
  module = '_modules_';
}

let filter = null;
const nameMatch = chatInput.match(/(?:for|by|of|about)\\s+([A-Za-z][\\w\\s\\.]+?)(?:\\s|$|\\?)/i);
if (nameMatch) filter = nameMatch[1].trim();
const mrMatch = chatInput.match(/\\b(mr\\.?\\s*\\w+)/i);
if (mrMatch && !filter) filter = mrMatch[1];

return [{ json: { chatInput, module, filter, source, chatId } }];` },
      id: '2',
      name: 'Detect Intent',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [432, 320]
    },
    {
      parameters: {
        rules: { values: [{ conditions: { options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: '1', operator: { type: 'string', operation: 'notEquals' }, leftValue: '={{ $json.module }}', rightValue: '' }] }, renameOutput: true, outputKey: 'Has Module' }] },
        options: { fallbackOutput: 'extra' }
      },
      id: '3',
      name: 'Route',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [640, 320]
    },
    {
      parameters: {
        url: '=https://www.zohoapis.com/crm/v2/{{ $json.module }}?per_page=200',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'zohoOAuth2Api',
        options: { response: { response: { neverError: true } } }
      },
      id: '4',
      name: 'Fetch Zoho',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [864, 224],
      credentials: { zohoOAuth2Api: { id: 'x7W9mTyq5hIWwhtu', name: 'Zoho account' } }
    },
    {
      parameters: { jsCode: `const mod = $('Detect Intent').first().json.module;
const filter = $('Detect Intent').first().json.filter;
const question = $('Detect Intent').first().json.chatInput;
const source = $('Detect Intent').first().json.source;
const chatId = $('Detect Intent').first().json.chatId;
const res = $input.first().json;

if (mod === '_modules_') {
  const mods = (res.modules || []).filter(m => m.generated_type === 'custom' && m.api_supported);
  let out = 'Modules:\\n' + mods.map(m => '- ' + m.plural_label).join('\\n');
  return [{ json: { output: out, source, chatId, skipAI: true } }];
}

if (res.code) {
  return [{ json: { output: 'Error: ' + res.message, source, chatId, skipAI: true } }];
}

let records = res.data || [];
const total = records.length;

if (filter && records.length > 0) {
  const f = filter.toLowerCase().replace(/[^a-z0-9]/g, '');
  records = records.filter(r => Object.values(r).some(v => {
    if (typeof v === 'string') return v.toLowerCase().replace(/[^a-z0-9]/g, '').includes(f);
    if (v && v.name) return v.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(f);
    return false;
  }));
}

const data = records.slice(0, 100).map(r => {
  const o = {};
  for (const [k,v] of Object.entries(r)) {
    if (k.startsWith('$') || k === 'id' || k.includes('Created') || k.includes('Modified')) continue;
    if (v && typeof v === 'object' && v.name) o[k] = v.name;
    else if (v && typeof v !== 'object') o[k] = v;
  }
  return o;
});

return [{ json: { question, module: mod, total, filtered: records.length, filter, data: JSON.stringify(data), source, chatId, skipAI: false } }];` },
      id: '5',
      name: 'Prepare Data',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1088, 224]
    },
    {
      parameters: {
        rules: { values: [{ conditions: { options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: '1', operator: { type: 'boolean', operation: 'true' }, leftValue: '={{ $json.skipAI }}' }] }, renameOutput: true, outputKey: 'Skip AI' }] },
        options: { fallbackOutput: 'extra' }
      },
      id: '16',
      name: 'Check Skip AI',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [1312, 224]
    },
    {
      parameters: { jsCode: `const input = $input.first().json;
const question = input.question || '';
const module = input.module || 'Unknown';
const data = input.data || 'No data';
const filtered = input.filtered || 0;
const total = input.total || 0;
const source = input.source;
const chatId = input.chatId;

const systemPrompt = 'You are Alif Homes CRM assistant for a property management company in Kenya. Today: ' + new Date().toISOString().split('T')[0] + '.\\n\\nCRITICAL RULES:\\n1. ALWAYS use Kenyan Shillings (KES) - NEVER use dollar signs ($)\\n2. Format amounts as: KES 1,495,826.50\\n3. When calculating totals, sum ALL numeric values from the relevant field (like Net_Commission)\\n4. Double-check all calculations - be accurate\\n5. Show individual items AND the correct total';

const userMsg = 'Question: ' + question + '\\n\\nModule: ' + module + '\\nRecords: ' + filtered + ' of ' + total + '\\n\\nData:\\n' + data;

const requestBody = JSON.stringify({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg }
  ],
  max_tokens: 2000,
  temperature: 0.3
});

return [{
  json: {
    requestBody: requestBody,
    chatId: chatId,
    source: source
  }
}];` },
      id: '6',
      name: 'Build AI Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1520, 320]
    },
    {
      parameters: {
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ $json.requestBody }}',
        options: {}
      },
      id: '7',
      name: 'Call OpenAI',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1744, 320],
      credentials: { httpHeaderAuth: { id: '41PFYbdJUDhDEJrm', name: 'Header Auth account' } }
    },
    {
      parameters: { jsCode: `const source = $('Build AI Request').first().json.source;
const chatId = $('Build AI Request').first().json.chatId;
let output = '';
try { output = $input.first().json.choices[0].message.content; } catch(e) { output = 'Error processing request.'; }
return [{ json: { output, source, chatId } }];` },
      id: '8',
      name: 'Format Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1968, 320]
    },
    {
      parameters: {
        rules: { values: [{ conditions: { options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: '1', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.source }}', rightValue: 'telegram' }] }, renameOutput: true, outputKey: 'Telegram' }] },
        options: { fallbackOutput: 'extra' }
      },
      id: '13',
      name: 'Route Output',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [2192, 320]
    },
    {
      parameters: {
        chatId: '={{ $json.chatId }}',
        text: '={{ $json.output }}',
        additionalFields: { appendAttribution: false }
      },
      id: '14',
      name: 'Send Telegram',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [2400, 224],
      credentials: { telegramApi: { id: 'tk6Hy4g3KjjYESOo', name: 'Telegram account' } }
    },
    {
      parameters: { jsCode: `return [{ json: { output: $json.output } }];` },
      id: '15',
      name: 'Output Chat',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2400, 432]
    }
  ],
  connections: {
    'Chat Trigger': { main: [[{ node: 'From Chat', type: 'main', index: 0 }]] },
    'Telegram Trigger': { main: [[{ node: 'From Telegram', type: 'main', index: 0 }]] },
    'From Chat': { main: [[{ node: 'Detect Intent', type: 'main', index: 0 }]] },
    'From Telegram': { main: [[{ node: 'Detect Intent', type: 'main', index: 0 }]] },
    'Detect Intent': { main: [[{ node: 'Route', type: 'main', index: 0 }]] },
    'Route': { main: [[{ node: 'Fetch Zoho', type: 'main', index: 0 }], [{ node: 'Build AI Request', type: 'main', index: 0 }]] },
    'Fetch Zoho': { main: [[{ node: 'Prepare Data', type: 'main', index: 0 }]] },
    'Prepare Data': { main: [[{ node: 'Check Skip AI', type: 'main', index: 0 }]] },
    'Check Skip AI': { main: [[{ node: 'Route Output', type: 'main', index: 0 }], [{ node: 'Build AI Request', type: 'main', index: 0 }]] },
    'Build AI Request': { main: [[{ node: 'Call OpenAI', type: 'main', index: 0 }]] },
    'Call OpenAI': { main: [[{ node: 'Format Response', type: 'main', index: 0 }]] },
    'Format Response': { main: [[{ node: 'Route Output', type: 'main', index: 0 }]] },
    'Route Output': { main: [[{ node: 'Send Telegram', type: 'main', index: 0 }], [{ node: 'Output Chat', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1', timezone: 'Africa/Nairobi', saveManualExecutions: true }
};

const data = JSON.stringify(updatedWorkflow);

const options = {
  hostname: config.n8n.hostname,
  path: `/api/v1/workflows/${config.n8n.workflowId}`,
  method: 'PUT',
  headers: {
    'X-N8N-API-KEY': config.n8n.apiKey,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  },
  rejectUnauthorized: false
};

const req = https.request(options, res => {
  let responseData = '';
  res.on('data', chunk => responseData += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    if (res.statusCode === 200) {
      console.log('SUCCESS: Workflow updated!');
    } else {
      console.log('Response:', responseData.substring(0, 500));
    }
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
