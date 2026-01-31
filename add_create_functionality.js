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

    // Update Build Module Detection to handle CREATE intent
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

// Check for list modules
const isListModules = (questionLower === 'list modules' || questionLower === 'show modules' || questionLower.includes('what modules'));
if (isListModules) {
  return [{ json: { action: 'LIST_MODULES', question, source, chatId, modules, moduleList } }];
}

// Check for CREATE intent
const createKeywords = ['create', 'add', 'new', 'register', 'insert', 'make'];
const isCreate = createKeywords.some(k => questionLower.includes(k));

const systemPrompt = \`You are a Zoho CRM assistant for Alif Homes. Analyze the user request and return a JSON response.

MODULES:
1. Property_Units_Database - units, rooms, apartments
2. Unit_Owner_Database - owners, landlords
3. Guests_Database - guests, visitors
4. Bookings - bookings, reservations
5. Airbnb_Services - airbnb cleaning services
6. Airbnb_Water_Bills - airbnb water bills
7. Rental_Properties - rental properties
8. Rental_Management - leases, agreements
9. Tenants - tenants, renters
10. Monthly_Rent - monthly rent
11. Rental_Water_Bills - rental water bills
12. Rentals_Service - rental services
13. Rental_Payments - rental payments

REQUIRED FIELDS FOR CREATING:
- Bookings: First_Name, Unit (unit number), Amount, Checked_in (date), Checked_out (date)
- Tenants: Contact_Name, Contact_Phone
- Guests_Database: First_Name, Last_Name
- Monthly_Rent: Tenant (name), Rental_Properties (unit), Rent_Amount, Rent_Month (date)
- Unit_Owner_Database: Name, Phone, Units
- Property_Units_Database: Unit_Number, Unit_Status, Nightly_Rate
- Rental_Properties: Unit_Number, Property_Status
- Rental_Management: Property, Tenant, Rent_Amount
- Airbnb_Services: Owner_Name, Unit, Amount, Service
- Airbnb_Water_Bills: Owner_Name, Unit, Meter_Reading, Total_Water_Bill
- Rental_Water_Bills: Client_Name, Unit, Meter_Reading
- Rentals_Service: Client_Name, Unit, Amount
- Rental_Payments: Client_Name, Unit_Number, Payment_Amount

If CREATE request, return:
{"action": "CREATE", "module": "Module_Api_Name", "data": {"Field1": "value1", "Field2": "value2"}, "missing": ["Field3", "Field4"]}

If READ/QUERY request, return:
{"action": "READ", "module": "Module_Api_Name"}

If user provides data like "create booking for Ahmed in unit 701 for 50000", extract the values.
If data is incomplete, list missing required fields.

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

return [{ json: { requestBody, question, source, chatId, modules, moduleList, isCreate } }];`;
      console.log('Updated Build Module Detection with CREATE support');
    }

    // Update Parse Module to handle CREATE actions
    const parseModuleNode = workflow.nodes.find(n => n.name === 'Parse Module');
    if (parseModuleNode) {
      parseModuleNode.parameters.jsCode = `const prev = $('Build Module Detection').first().json;
const aiRes = $input.first().json;

// Check if it's already a direct action
if (prev.action === 'LIST_MODULES') {
  return [{ json: { action: 'LIST_MODULES', question: prev.question, source: prev.source, chatId: prev.chatId, modules: prev.modules, moduleList: prev.moduleList } }];
}

let parsed = { action: 'READ', module: 'UNKNOWN' };
try {
  const content = aiRes.choices[0].message.content.trim();
  // Try to parse JSON from response
  const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    parsed = JSON.parse(jsonMatch[0]);
  } else {
    // Fallback - treat as module name
    parsed = { action: 'READ', module: content };
  }
} catch(e) {
  parsed = { action: 'READ', module: 'UNKNOWN' };
}

return [{
  json: {
    action: parsed.action || 'READ',
    detectedModule: parsed.module || 'UNKNOWN',
    createData: parsed.data || null,
    missingFields: parsed.missing || [],
    question: prev.question,
    source: prev.source,
    chatId: prev.chatId,
    modules: prev.modules,
    moduleList: prev.moduleList
  }
}];`;
      console.log('Updated Parse Module');
    }

    // Update Route Module to handle CREATE
    const routeModuleNode = workflow.nodes.find(n => n.name === 'Route Module');
    if (routeModuleNode) {
      routeModuleNode.parameters = {
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
                conditions: [{ id: '2', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'CREATE' }]
              },
              renameOutput: true,
              outputKey: 'Create'
            },
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '3', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.detectedModule }}', rightValue: 'UNKNOWN' }]
              },
              renameOutput: true,
              outputKey: 'Unknown'
            }
          ]
        },
        options: { fallbackOutput: 'extra' }
      };
      console.log('Updated Route Module');
    }

    // Add new nodes for CREATE functionality
    // Find max position
    let maxX = 0;
    workflow.nodes.forEach(n => {
      if (n.position && n.position[0] > maxX) maxX = n.position[0];
    });

    // Add Handle Create node
    const handleCreateNode = {
      parameters: {
        jsCode: `const input = $input.first().json;
const module = input.detectedModule;
const createData = input.createData;
const missingFields = input.missingFields || [];
const source = input.source;
const chatId = input.chatId;

// If missing required fields, ask user for them
if (missingFields.length > 0) {
  const output = 'To create a record in ' + module.replace(/_/g, ' ') + ', I need:\\n\\n' +
    missingFields.map((f, i) => (i+1) + '. ' + f.replace(/_/g, ' ')).join('\\n') +
    '\\n\\nPlease provide these details.';
  return [{ json: { output, source, chatId, skipCreate: true } }];
}

// If we have all data, prepare for creation
if (createData && Object.keys(createData).length > 0) {
  return [{ json: { module, createData, source, chatId, skipCreate: false } }];
}

// No data provided
const output = 'Please provide the details for the record you want to create. For example:\\n' +
  '"Create booking for Ahmed in unit 701 for KES 50000 from Jan 1 to Jan 15"';
return [{ json: { output, source, chatId, skipCreate: true } }];`
      },
      id: '30',
      name: 'Handle Create',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1600, 560]
    };

    // Add Check Skip Create node
    const checkSkipCreateNode = {
      parameters: {
        rules: {
          values: [{
            conditions: {
              options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              combinator: 'and',
              conditions: [{ id: '1', operator: { type: 'boolean', operation: 'true' }, leftValue: '={{ $json.skipCreate }}' }]
            },
            renameOutput: true,
            outputKey: 'Skip'
          }]
        },
        options: { fallbackOutput: 'extra' }
      },
      id: '31',
      name: 'Check Skip Create',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [1800, 560]
    };

    // Add Create in Zoho node
    const createZohoNode = {
      parameters: {
        method: 'POST',
        url: '=https://www.zohoapis.com/crm/v2/{{ $json.module }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'zohoOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ "data": [$json.createData] }) }}',
        options: { response: { response: { neverError: true } } }
      },
      id: '32',
      name: 'Create in Zoho',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2000, 640],
      credentials: { zohoOAuth2Api: { id: 'x7W9mTyq5hIWwhtu', name: 'Zoho account' } }
    };

    // Add Format Create Response node
    const formatCreateResponseNode = {
      parameters: {
        jsCode: `const prev = $('Handle Create').first().json;
const res = $input.first().json;
const source = prev.source;
const chatId = prev.chatId;
const module = prev.module;

let output = '';
if (res.data && res.data[0] && res.data[0].status === 'success') {
  output = 'Successfully created record in ' + module.replace(/_/g, ' ') + '!\\n\\n' +
    'Record ID: ' + res.data[0].details.id;
} else if (res.code) {
  output = 'Error creating record: ' + (res.message || res.code);
} else {
  output = 'Record creation completed. Please check Zoho CRM to verify.';
}

return [{ json: { output, source, chatId } }];`
      },
      id: '33',
      name: 'Format Create Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2200, 640]
    };

    // Add nodes to workflow
    workflow.nodes.push(handleCreateNode);
    workflow.nodes.push(checkSkipCreateNode);
    workflow.nodes.push(createZohoNode);
    workflow.nodes.push(formatCreateResponseNode);

    // Update connections
    workflow.connections['Route Module'].main.push([{ node: 'Handle Create', type: 'main', index: 0 }]);
    workflow.connections['Handle Create'] = { main: [[{ node: 'Check Skip Create', type: 'main', index: 0 }]] };
    workflow.connections['Check Skip Create'] = {
      main: [
        [{ node: 'Route Output', type: 'main', index: 0 }],
        [{ node: 'Create in Zoho', type: 'main', index: 0 }]
      ]
    };
    workflow.connections['Create in Zoho'] = { main: [[{ node: 'Format Create Response', type: 'main', index: 0 }]] };
    workflow.connections['Format Create Response'] = { main: [[{ node: 'Route Output', type: 'main', index: 0 }]] };

    console.log('Added CREATE nodes and connections');

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
          console.log('SUCCESS: CREATE functionality added!');
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
