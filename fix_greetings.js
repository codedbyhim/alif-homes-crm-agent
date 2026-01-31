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

    // Update Build Module Detection to handle greetings
    const buildModuleNode = workflow.nodes.find(n => n.name === 'Build Module Detection');
    if (buildModuleNode) {
      buildModuleNode.parameters.jsCode = `const input = $('Merge Input').first().json;
const modulesRes = $input.first().json;
const question = input.chatInput || '';
const questionLower = question.toLowerCase().trim();
const source = input.source;
const chatId = input.chatId;

// Only our 13 custom modules
const ourModules = [
  'Unit_Owner_Database', 'Property_Units_Database', 'Guests_Database', 'Bookings',
  'Airbnb_Services', 'Airbnb_Water_Bills', 'Rental_Properties', 'Rental_Management',
  'Tenants', 'Monthly_Rent', 'Rental_Water_Bills', 'Rentals_Service', 'Rental_Payments'
];

let modules = [];
if (modulesRes.modules) {
  modules = modulesRes.modules
    .filter(m => ourModules.includes(m.api_name))
    .map(m => ({ api_name: m.api_name, plural_label: m.plural_label, singular_label: m.singular_label }));
}

const moduleList = modules.map(m => m.api_name + ' (' + m.plural_label + ')').join(', ');

// GREETINGS - respond directly without querying modules
const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'thanks', 'thank you', 'thank', 'bye', 'goodbye', 'ok', 'okay', 'cool', 'great', 'nice', 'awesome', 'perfect', 'got it', 'alright'];
const isGreeting = greetings.some(g => questionLower === g || questionLower === g + '!');

if (isGreeting) {
  return [{ json: { action: 'GREETING', question, source, chatId, modules, moduleList } }];
}

// LIST MODULES
const isListModules = (questionLower === 'list modules' || questionLower === 'show modules' || questionLower.includes('what modules'));
if (isListModules) {
  return [{ json: { action: 'LIST_MODULES', question, source, chatId, modules, moduleList } }];
}

// READ keywords - definitely NOT create
const readKeywords = ['list', 'show', 'get', 'what', 'how many', 'do we have', 'any', 'all', 'display', 'find', 'search', 'total', 'sum', 'count', 'available', 'who', 'which'];
const isDefinitelyRead = readKeywords.some(k => questionLower.includes(k));

// CREATE keywords
const createPhrases = ['create a', 'create new', 'add a', 'add new', 'register a', 'register new', 'insert a', 'make a new', 'book a', 'new booking for', 'add tenant', 'add guest', 'create booking'];
const isDefinitelyCreate = createPhrases.some(k => questionLower.includes(k));

let action = 'READ';
if (isDefinitelyCreate && !isDefinitelyRead) {
  action = 'CREATE';
}

const systemPrompt = \`You are a Zoho CRM assistant for Alif Homes. Analyze the user request.

ACTION: \${action}

MODULES:
1. Property_Units_Database - units, rooms, apartments, available units
2. Unit_Owner_Database - owners, landlords
3. Guests_Database - guests, visitors
4. Bookings - bookings, reservations, check-in, check-out, commission
5. Airbnb_Services - airbnb cleaning services
6. Airbnb_Water_Bills - airbnb water bills
7. Rental_Properties - rental properties
8. Rental_Management - leases, agreements
9. Tenants - tenants, renters
10. Monthly_Rent - monthly rent, rent payments
11. Rental_Water_Bills - rental water bills
12. Rentals_Service - rental services
13. Rental_Payments - rental payments

\${action === 'CREATE' ? \`Return JSON: {"action": "CREATE", "module": "Module_Name", "data": {...}, "missing": [...]}\` : \`Return JSON: {"action": "READ", "module": "Module_Name"}\`}

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
      console.log('Updated Build Module Detection with greeting support');
    }

    // Update Route Module to handle GREETING
    const routeNode = workflow.nodes.find(n => n.name === 'Route Module');
    if (routeNode) {
      routeNode.parameters = {
        rules: {
          values: [
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '1', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'LIST_MODULES' }]
              },
              renameOutput: true,
              outputKey: 'List Modules'
            },
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '2', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'GREETING' }]
              },
              renameOutput: true,
              outputKey: 'Greeting'
            },
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '3', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.detectedModule }}', rightValue: 'UNKNOWN' }]
              },
              renameOutput: true,
              outputKey: 'Unknown'
            },
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '4', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'CREATE' }]
              },
              renameOutput: true,
              outputKey: 'Create'
            }
          ]
        },
        options: { fallbackOutput: 'extra' }
      };
      console.log('Updated Route Module with Greeting route');
    }

    // Add Handle Greeting node
    const greetingNode = {
      parameters: {
        jsCode: `const input = $input.first().json;
const question = (input.question || '').toLowerCase().trim();
const source = input.source;
const chatId = input.chatId;

let output = '';

if (question.includes('thank') || question === 'thanks') {
  output = "You're welcome! Let me know if you need anything else about SkyWay Building.";
} else if (question === 'hi' || question === 'hello' || question === 'hey') {
  output = "Hello! I'm your Alif Homes assistant. I can help you with:\\n" +
    "- Bookings and reservations\\n" +
    "- Tenants and owners info\\n" +
    "- Monthly rent and payments\\n" +
    "- Property units and availability\\n\\n" +
    "What would you like to know?";
} else if (question === 'bye' || question === 'goodbye') {
  output = "Goodbye! Feel free to message me anytime you need help with SkyWay Building.";
} else if (question === 'ok' || question === 'okay' || question === 'cool' || question === 'great' || question === 'nice' || question === 'awesome' || question === 'perfect' || question === 'alright' || question === 'got it') {
  output = "Great! Let me know if you need anything else.";
} else {
  output = "Hi! How can I help you with SkyWay Building today?";
}

return [{ json: { output, source, chatId } }];`
      },
      id: '40',
      name: 'Handle Greeting',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1600, 80]
    };

    // Check if Handle Greeting already exists
    const existingGreeting = workflow.nodes.find(n => n.name === 'Handle Greeting');
    if (!existingGreeting) {
      workflow.nodes.push(greetingNode);
      console.log('Added Handle Greeting node');
    } else {
      existingGreeting.parameters = greetingNode.parameters;
      console.log('Updated existing Handle Greeting node');
    }

    // Update connections
    workflow.connections['Route Module'] = {
      main: [
        [{ node: 'Format Module List', type: 'main', index: 0 }],   // Output 0: LIST_MODULES
        [{ node: 'Handle Greeting', type: 'main', index: 0 }],      // Output 1: GREETING
        [{ node: 'Format Unknown', type: 'main', index: 0 }],       // Output 2: UNKNOWN
        [{ node: 'Handle Create', type: 'main', index: 0 }],        // Output 3: CREATE
        [{ node: 'Fetch Zoho Data', type: 'main', index: 0 }]       // Output 4: fallback (READ)
      ]
    };

    // Add connection from Handle Greeting to Route Output
    workflow.connections['Handle Greeting'] = {
      main: [[{ node: 'Route Output', type: 'main', index: 0 }]]
    };
    console.log('Updated connections');

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
          console.log('SUCCESS: Greeting handling added!');
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
