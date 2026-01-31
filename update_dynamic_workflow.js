const https = require('https');
const config = require('./config.json');

const updatedWorkflow = {
  name: 'Zoho CRM AI Chat Agent',
  nodes: [
    // Triggers
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
    // Input processors
    {
      parameters: { jsCode: `const chatInput = $input.first().json.chatInput || '';
return [{ json: { chatInput, source: 'chat', chatId: null } }];` },
      id: '11',
      name: 'From Chat',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [200, 208]
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
      position: [200, 464]
    },
    // Merge inputs
    {
      parameters: { jsCode: `const input = $input.first().json;
return [{ json: input }];` },
      id: '20',
      name: 'Merge Input',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [400, 320]
    },
    // Fetch all modules from Zoho
    {
      parameters: {
        url: 'https://www.zohoapis.com/crm/v2/settings/modules',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'zohoOAuth2Api',
        options: { response: { response: { neverError: true } } }
      },
      id: '21',
      name: 'Get All Modules',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [600, 320],
      credentials: { zohoOAuth2Api: { id: 'x7W9mTyq5hIWwhtu', name: 'Zoho account' } }
    },
    // AI to detect module
    {
      parameters: { jsCode: `const input = $('Merge Input').first().json;
const modulesRes = $input.first().json;
const question = input.chatInput || '';
const source = input.source;
const chatId = input.chatId;

// Get custom modules from Zoho
let modules = [];
if (modulesRes.modules) {
  modules = modulesRes.modules
    .filter(m => m.api_supported && (m.generated_type === 'custom' || ['Contacts', 'Leads', 'Accounts', 'Deals'].includes(m.api_name)))
    .map(m => ({
      api_name: m.api_name,
      plural_label: m.plural_label,
      singular_label: m.singular_label
    }));
}

// Build module list for AI
const moduleList = modules.map(m => m.api_name + ' (' + m.plural_label + ')').join(', ');

// Create AI request to detect module
const systemPrompt = \`You are a module detector for Zoho CRM. Given a user question, determine which module to query.

Available modules: \${moduleList}

Rules:
1. Return ONLY the api_name of the most relevant module (e.g., "Bookings" or "Tenants")
2. If user asks about commissions, bookings, reservations, check-ins, check-outs -> return "Bookings"
3. If user asks about tenants, renters -> return "Tenants"
4. If user asks about properties, houses, apartments -> return "Rental_Properties"
5. If user asks about payments -> return "Rental_Payments"
6. If user asks about water bills -> return "Rental_Water_Bills" or "Airbnb_Water_Bills"
7. If user asks about services -> return "Rentals_Service" or "Airbnb_Services"
8. If user asks about owners, landlords -> return "Unit_Owner_Database"
9. If user asks about units, rooms -> return "Property_Units_Database"
10. If user asks about guests, visitors -> return "Guests_Database"
11. If user asks about monthly rent -> return "Monthly_Rent"
12. If user asks about leases, agreements, contracts -> return "Rental_Management"
13. If user asks to list/show modules, return "LIST_MODULES"
14. If unclear, return "UNKNOWN"

Return ONLY the module api_name, nothing else.\`;

const requestBody = JSON.stringify({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ],
  max_tokens: 50,
  temperature: 0
});

return [{
  json: {
    requestBody,
    question,
    source,
    chatId,
    modules,
    moduleList
  }
}];` },
      id: '22',
      name: 'Build Module Detection',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [800, 320]
    },
    // Call AI to detect module
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
      id: '23',
      name: 'Detect Module AI',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1000, 320],
      credentials: { httpHeaderAuth: { id: '41PFYbdJUDhDEJrm', name: 'Header Auth account' } }
    },
    // Parse detected module
    {
      parameters: { jsCode: `const prev = $('Build Module Detection').first().json;
const aiRes = $input.first().json;

let detectedModule = 'UNKNOWN';
try {
  detectedModule = aiRes.choices[0].message.content.trim();
} catch(e) {}

return [{
  json: {
    detectedModule,
    question: prev.question,
    source: prev.source,
    chatId: prev.chatId,
    modules: prev.modules,
    moduleList: prev.moduleList
  }
}];` },
      id: '24',
      name: 'Parse Module',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1200, 320]
    },
    // Route based on detected module
    {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '1', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.detectedModule }}', rightValue: 'LIST_MODULES' }]
              },
              renameOutput: true,
              outputKey: 'List Modules'
            },
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '2', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.detectedModule }}', rightValue: 'UNKNOWN' }]
              },
              renameOutput: true,
              outputKey: 'Unknown'
            }
          ]
        },
        options: { fallbackOutput: 'extra' }
      },
      id: '25',
      name: 'Route Module',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [1400, 320]
    },
    // Handle List Modules
    {
      parameters: { jsCode: `const input = $input.first().json;
const modules = input.modules || [];
let output = 'Available Modules:\\n\\n';
modules.forEach((m, i) => {
  output += (i+1) + '. ' + m.plural_label + ' (' + m.api_name + ')\\n';
});
output += '\\nAsk me anything about these modules!';
return [{ json: { output, source: input.source, chatId: input.chatId } }];` },
      id: '26',
      name: 'Format Module List',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1600, 160]
    },
    // Handle Unknown
    {
      parameters: { jsCode: `const input = $input.first().json;
const output = "I'm not sure which module you're asking about. You can ask me about:\\n\\n" +
  "- Bookings (reservations, check-ins, commissions)\\n" +
  "- Tenants (renters)\\n" +
  "- Properties (houses, apartments)\\n" +
  "- Payments\\n" +
  "- Water Bills\\n" +
  "- Services\\n" +
  "- Owners (landlords)\\n" +
  "- Units (rooms)\\n" +
  "- Guests\\n" +
  "- Monthly Rent\\n" +
  "- Leases/Agreements\\n\\n" +
  "Or say 'list modules' to see all available modules.";
return [{ json: { output, source: input.source, chatId: input.chatId } }];` },
      id: '27',
      name: 'Format Unknown',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1600, 320]
    },
    // Fetch data from detected module
    {
      parameters: {
        url: '=https://www.zohoapis.com/crm/v2/{{ $json.detectedModule }}?per_page=200',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'zohoOAuth2Api',
        options: { response: { response: { neverError: true } } }
      },
      id: '4',
      name: 'Fetch Zoho Data',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1600, 480],
      credentials: { zohoOAuth2Api: { id: 'x7W9mTyq5hIWwhtu', name: 'Zoho account' } }
    },
    // Prepare data for AI
    {
      parameters: { jsCode: `const prev = $('Parse Module').first().json;
const res = $input.first().json;
const question = prev.question;
const source = prev.source;
const chatId = prev.chatId;
const module = prev.detectedModule;

if (res.code) {
  return [{ json: { output: 'Error fetching data: ' + res.message, source, chatId } }];
}

let records = res.data || [];
const total = records.length;

// Clean data for AI
const data = records.slice(0, 100).map(r => {
  const o = {};
  for (const [k,v] of Object.entries(r)) {
    if (k.startsWith('$') || k === 'id' || k.includes('Created_') || k.includes('Modified_')) continue;
    if (v && typeof v === 'object' && v.name) o[k] = v.name;
    else if (v && typeof v !== 'object') o[k] = v;
  }
  return o;
});

return [{
  json: {
    question,
    module,
    total,
    data: JSON.stringify(data),
    source,
    chatId,
    hasData: data.length > 0
  }
}];` },
      id: '5',
      name: 'Prepare Data',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1800, 480]
    },
    // Check if has data
    {
      parameters: {
        rules: {
          values: [{
            conditions: {
              options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              combinator: 'and',
              conditions: [{ id: '1', operator: { type: 'boolean', operation: 'false' }, leftValue: '={{ $json.hasData }}' }]
            },
            renameOutput: true,
            outputKey: 'No Data'
          }]
        },
        options: { fallbackOutput: 'extra' }
      },
      id: '28',
      name: 'Check Data',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [2000, 480]
    },
    // No data response
    {
      parameters: { jsCode: `const input = $input.first().json;
const output = 'No records found in ' + input.module + '. The module might be empty or there was an issue fetching data.';
return [{ json: { output, source: input.source, chatId: input.chatId } }];` },
      id: '29',
      name: 'No Data Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2200, 400]
    },
    // Build AI analysis request
    {
      parameters: { jsCode: `const input = $input.first().json;
const question = input.question || '';
const module = input.module || 'Unknown';
const data = input.data || '[]';
const total = input.total || 0;
const source = input.source;
const chatId = input.chatId;

const systemPrompt = 'You are Alif Homes CRM assistant for a property management company in Kenya. Today: ' + new Date().toISOString().split('T')[0] + '.\\n\\nCRITICAL RULES:\\n1. ALWAYS use Kenyan Shillings (KES) - NEVER use dollar signs ($)\\n2. Format amounts as: KES 1,495,826.50\\n3. When calculating totals, sum ALL numeric values from the relevant field\\n4. Double-check all calculations - be accurate\\n5. Be specific with names, dates, amounts\\n6. Keep responses concise but informative';

const userMsg = 'Question: ' + question + '\\n\\nModule: ' + module + '\\nTotal Records: ' + total + '\\n\\nData:\\n' + data;

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
    requestBody,
    chatId,
    source
  }
}];` },
      id: '6',
      name: 'Build AI Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2200, 560]
    },
    // Call OpenAI for analysis
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
      position: [2400, 560],
      credentials: { httpHeaderAuth: { id: '41PFYbdJUDhDEJrm', name: 'Header Auth account' } }
    },
    // Format response
    {
      parameters: { jsCode: `const prev = $('Build AI Request').first().json;
const source = prev.source;
const chatId = prev.chatId;
let output = '';
try {
  output = $input.first().json.choices[0].message.content;
} catch(e) {
  output = 'Error processing your request. Please try again.';
}
return [{ json: { output, source, chatId } }];` },
      id: '8',
      name: 'Format Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2600, 560]
    },
    // Route output
    {
      parameters: {
        rules: {
          values: [{
            conditions: {
              options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              combinator: 'and',
              conditions: [{ id: '1', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.source }}', rightValue: 'telegram' }]
            },
            renameOutput: true,
            outputKey: 'Telegram'
          }]
        },
        options: { fallbackOutput: 'extra' }
      },
      id: '13',
      name: 'Route Output',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [2800, 400]
    },
    // Send Telegram
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
      position: [3000, 320],
      credentials: { telegramApi: { id: 'tk6Hy4g3KjjYESOo', name: 'Telegram account' } }
    },
    // Output Chat
    {
      parameters: { jsCode: `return [{ json: { output: $json.output } }];` },
      id: '15',
      name: 'Output Chat',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3000, 480]
    }
  ],
  connections: {
    'Chat Trigger': { main: [[{ node: 'From Chat', type: 'main', index: 0 }]] },
    'Telegram Trigger': { main: [[{ node: 'From Telegram', type: 'main', index: 0 }]] },
    'From Chat': { main: [[{ node: 'Merge Input', type: 'main', index: 0 }]] },
    'From Telegram': { main: [[{ node: 'Merge Input', type: 'main', index: 0 }]] },
    'Merge Input': { main: [[{ node: 'Get All Modules', type: 'main', index: 0 }]] },
    'Get All Modules': { main: [[{ node: 'Build Module Detection', type: 'main', index: 0 }]] },
    'Build Module Detection': { main: [[{ node: 'Detect Module AI', type: 'main', index: 0 }]] },
    'Detect Module AI': { main: [[{ node: 'Parse Module', type: 'main', index: 0 }]] },
    'Parse Module': { main: [[{ node: 'Route Module', type: 'main', index: 0 }]] },
    'Route Module': { main: [
      [{ node: 'Format Module List', type: 'main', index: 0 }],
      [{ node: 'Format Unknown', type: 'main', index: 0 }],
      [{ node: 'Fetch Zoho Data', type: 'main', index: 0 }]
    ]},
    'Format Module List': { main: [[{ node: 'Route Output', type: 'main', index: 0 }]] },
    'Format Unknown': { main: [[{ node: 'Route Output', type: 'main', index: 0 }]] },
    'Fetch Zoho Data': { main: [[{ node: 'Prepare Data', type: 'main', index: 0 }]] },
    'Prepare Data': { main: [[{ node: 'Check Data', type: 'main', index: 0 }]] },
    'Check Data': { main: [
      [{ node: 'No Data Response', type: 'main', index: 0 }],
      [{ node: 'Build AI Request', type: 'main', index: 0 }]
    ]},
    'No Data Response': { main: [[{ node: 'Route Output', type: 'main', index: 0 }]] },
    'Build AI Request': { main: [[{ node: 'Call OpenAI', type: 'main', index: 0 }]] },
    'Call OpenAI': { main: [[{ node: 'Format Response', type: 'main', index: 0 }]] },
    'Format Response': { main: [[{ node: 'Route Output', type: 'main', index: 0 }]] },
    'Route Output': { main: [
      [{ node: 'Send Telegram', type: 'main', index: 0 }],
      [{ node: 'Output Chat', type: 'main', index: 0 }]
    ]}
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
    console.log('Update Status:', res.statusCode);
    if (res.statusCode === 200) {
      console.log('SUCCESS: Dynamic workflow deployed!');

      // Activate workflow
      const activateOptions = {
        hostname: config.n8n.hostname,
        path: `/api/v1/workflows/${config.n8n.workflowId}/activate`,
        method: 'POST',
        headers: {
          'X-N8N-API-KEY': config.n8n.apiKey
        },
        rejectUnauthorized: false
      };

      const activateReq = https.request(activateOptions, activateRes => {
        console.log('Activation:', activateRes.statusCode === 200 ? 'SUCCESS' : 'Failed');
      });
      activateReq.on('error', e => console.error('Activation error:', e.message));
      activateReq.end();
    } else {
      console.log('Error:', responseData.substring(0, 500));
    }
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
