const https = require('https');
const config = require('./config.json');

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

    // Fix Build Module Detection with better READ vs CREATE detection
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

// Check for list modules FIRST
const isListModules = (questionLower === 'list modules' || questionLower === 'show modules' || questionLower.includes('what modules'));
if (isListModules) {
  return [{ json: { action: 'LIST_MODULES', question, source, chatId, modules, moduleList } }];
}

// READ keywords - these should NEVER be CREATE
const readKeywords = ['list', 'show', 'get', 'what', 'how many', 'do we have', 'any', 'all', 'display', 'find', 'search', 'total', 'sum', 'count', 'available', 'who', 'which'];
const isDefinitelyRead = readKeywords.some(k => questionLower.includes(k));

// CREATE keywords - must be explicit
const createPhrases = ['create a', 'create new', 'add a', 'add new', 'register a', 'register new', 'insert a', 'make a new', 'book a', 'new booking for', 'add tenant', 'add guest', 'create booking'];
const isDefinitelyCreate = createPhrases.some(k => questionLower.includes(k));

// Determine action
let action = 'READ';
if (isDefinitelyCreate && !isDefinitelyRead) {
  action = 'CREATE';
}

const systemPrompt = \`You are a Zoho CRM assistant for Alif Homes. Analyze the user request.

ACTION: \${action}

MODULES:
1. Property_Units_Database - units, rooms, apartments, available units, vacant units
2. Unit_Owner_Database - owners, landlords
3. Guests_Database - guests, visitors
4. Bookings - bookings, reservations, check-in, check-out, commission
5. Airbnb_Services - airbnb cleaning services
6. Airbnb_Water_Bills - airbnb water bills
7. Rental_Properties - rental properties, rental units
8. Rental_Management - leases, agreements
9. Tenants - tenants, renters
10. Monthly_Rent - monthly rent, rent payments
11. Rental_Water_Bills - rental water bills
12. Rentals_Service - rental services
13. Rental_Payments - rental payments

\${action === 'CREATE' ? \`
REQUIRED FIELDS FOR CREATING:
- Bookings: First_Name, Unit, Amount, Checked_in, Checked_out
- Tenants: Contact_Name
- Guests_Database: First_Name, Last_Name
- Monthly_Rent: Tenant, Rental_Properties, Rent_Amount
- Unit_Owner_Database: Name, Phone
- Property_Units_Database: Unit_Number, Unit_Status
- Rental_Properties: Unit_Number
- Rental_Management: Property, Tenant
- Airbnb_Services: Owner_Name, Unit, Service
- Airbnb_Water_Bills: Owner_Name, Unit
- Rental_Water_Bills: Client_Name, Unit
- Rentals_Service: Client_Name, Unit
- Rental_Payments: Client_Name, Unit_Number

Return JSON: {"action": "CREATE", "module": "Module_Name", "data": {...}, "missing": [...]}
\` : \`
Return JSON: {"action": "READ", "module": "Module_Name"}
\`}

Return ONLY valid JSON.\`;

const requestBody = JSON.stringify({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ],
  max_tokens: 500,
  temperature: 0
});

return [{ json: { requestBody, question, source, chatId, modules, moduleList, action } }];`;
      console.log('Fixed Build Module Detection - better READ vs CREATE');
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
          console.log('SUCCESS: Intent detection fixed!');
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
