const https = require('https');
const config = require('./config.json');

// Get current workflow
const getOptions = {
  hostname: config.n8n.hostname,
  path: `/api/v1/workflows/${config.n8n.workflowId}`,
  method: 'GET',
  headers: {
    'X-N8N-API-KEY': config.n8n.apiKey,
    'accept': 'application/json'
  },
  rejectUnauthorized: false
};

const req = https.request(getOptions, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const workflow = JSON.parse(data);

    // Update Build Module Detection with better logic
    const buildModuleNode = workflow.nodes.find(n => n.name === 'Build Module Detection');
    if (buildModuleNode) {
      buildModuleNode.parameters.jsCode = `const input = $('Merge Input').first().json;
const modulesRes = $input.first().json;
const question = input.chatInput || '';
const questionLower = question.toLowerCase();
const source = input.source;
const chatId = input.chatId;

// Only our 13 custom modules
const ourModules = [
  'Unit_Owner_Database',
  'Property_Units_Database',
  'Guests_Database',
  'Bookings',
  'Airbnb_Services',
  'Airbnb_Water_Bills',
  'Rental_Properties',
  'Rental_Management',
  'Tenants',
  'Monthly_Rent',
  'Rental_Water_Bills',
  'Rentals_Service',
  'Rental_Payments'
];

// Get only our custom modules from Zoho response
let modules = [];
if (modulesRes.modules) {
  modules = modulesRes.modules
    .filter(m => ourModules.includes(m.api_name))
    .map(m => ({
      api_name: m.api_name,
      plural_label: m.plural_label,
      singular_label: m.singular_label
    }));
}

const moduleList = modules.map(m => m.api_name + ' (' + m.plural_label + ')').join(', ');

// Check for "list modules" or "show modules" EXACTLY (not "list units" etc)
const isListModules = (questionLower === 'list modules' ||
                       questionLower === 'show modules' ||
                       questionLower.includes('what modules') ||
                       questionLower.includes('which modules') ||
                       questionLower === 'modules');

if (isListModules) {
  return [{
    json: {
      detectedModule: 'LIST_MODULES',
      question,
      source,
      chatId,
      modules,
      moduleList,
      skipAI: true
    }
  }];
}

const systemPrompt = \`You are a module detector for Alif Homes Zoho CRM. Given a user question, determine which module to query.

MODULES AND KEYWORDS:

1. Property_Units_Database - units, rooms, apartments, unit number, occupied, vacant, available units, bedrooms, floor, nightly rate, list units
2. Unit_Owner_Database - owners, landlords, who owns, unit owner, owner phone, payout method
3. Guests_Database - guests, visitors, guest names, who stayed, nationality, passport
4. Bookings - bookings, reservations, check-in, check-out, arrivals, departures, commission, net commission
5. Airbnb_Services - airbnb services, airbnb cleaning, cleaning service
6. Airbnb_Water_Bills - airbnb water, airbnb water bills
7. Rental_Properties - rental properties, long-term rentals, property status
8. Rental_Management - lease, rental agreement, contract, lease start, lease end
9. Tenants - tenants, renters, tenant names, who lives, who rents
10. Monthly_Rent - monthly rent, rent payment, rent due, rent paid
11. Rental_Water_Bills - rental water, tenant water bill
12. Rentals_Service - rental services, annual service
13. Rental_Payments - rental payments, service payment

IMPORTANT RULES:
- "list units" or "available units" or "vacant units" = Property_Units_Database (NOT list modules!)
- "list tenants" = Tenants
- "list bookings" = Bookings
- "list guests" = Guests_Database
- Only return "UNKNOWN" if truly unrelated to property management

Return ONLY the exact api_name, nothing else.\`;

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
    moduleList,
    skipAI: false
  }
}];`;
      console.log('Updated Build Module Detection');
    }

    // Update Format Module List to only show our 13 modules
    const formatModuleNode = workflow.nodes.find(n => n.name === 'Format Module List');
    if (formatModuleNode) {
      formatModuleNode.parameters.jsCode = `const input = $input.first().json;
const modules = input.modules || [];

let output = 'Available Modules:\\n\\n';
output += 'AIRBNB/SHORT-TERM:\\n';
output += '1. Bookings - reservations, check-ins, commissions\\n';
output += '2. Guests Database - guest info\\n';
output += '3. Property Units - units, rates, availability\\n';
output += '4. Airbnb Services - cleaning\\n';
output += '5. Airbnb Water Bills\\n\\n';

output += 'LONG-TERM RENTALS:\\n';
output += '6. Tenants - tenant info\\n';
output += '7. Monthly Rent - rent payments\\n';
output += '8. Rental Properties\\n';
output += '9. Lease Management\\n';
output += '10. Rental Services\\n';
output += '11. Rental Water Bills\\n';
output += '12. Rental Payments\\n\\n';

output += 'OWNERS:\\n';
output += '13. Unit Owner Database\\n\\n';

output += 'Ask me about any of these!';

return [{ json: { output, source: input.source, chatId: input.chatId } }];`;
      console.log('Updated Format Module List');
    }

    // Update workflow
    const updateData = JSON.stringify({
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings
    });

    const putOptions = {
      hostname: config.n8n.hostname,
      path: `/api/v1/workflows/${config.n8n.workflowId}`,
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': config.n8n.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(updateData)
      },
      rejectUnauthorized: false
    };

    const putReq = https.request(putOptions, putRes => {
      let putData = '';
      putRes.on('data', chunk => putData += chunk);
      putRes.on('end', () => {
        if (putRes.statusCode === 200) {
          console.log('SUCCESS: Module detection fixed!');
          // Activate
          const actReq = https.request({
            hostname: config.n8n.hostname,
            path: `/api/v1/workflows/${config.n8n.workflowId}/activate`,
            method: 'POST',
            headers: { 'X-N8N-API-KEY': config.n8n.apiKey },
            rejectUnauthorized: false
          }, actRes => console.log('Activated:', actRes.statusCode === 200 ? 'SUCCESS' : 'Failed'));
          actReq.end();
        } else {
          console.log('Error:', putRes.statusCode, putData.substring(0, 500));
        }
      });
    });
    putReq.write(updateData);
    putReq.end();
  });
});
req.end();
