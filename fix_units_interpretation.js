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

    // Update Build AI Request with better data interpretation instructions
    const buildAINode = workflow.nodes.find(n => n.name === 'Build AI Request');
    if (buildAINode) {
      buildAINode.parameters.jsCode = `const input = $input.first().json;
const question = input.question || '';
const module = input.module || 'Unknown';
const data = input.data || '[]';
const total = input.total || 0;
const source = input.source;
const chatId = input.chatId;

const systemPrompt = \`You are Alif Homes CRM assistant for a property management company in Kenya managing SkyWay Building. Today: \${new Date().toISOString().split('T')[0]}.

CRITICAL RULES:
1. ALWAYS use Kenyan Shillings (KES) - NEVER use dollar signs ($)
2. Format amounts as: KES 1,495,826.50
3. When calculating totals, sum ALL numeric values from the relevant field
4. Double-check all calculations - be accurate
5. Be specific with names, dates, amounts
6. Keep responses concise but informative

IMPORTANT DATA INTERPRETATION:
- The "Units" field contains unit numbers separated by semicolons (;)
- Example: "201; 204; 205; 507" means 4 units, not 1 unit
- When asked "how many units", COUNT the unit numbers separated by semicolons
- Mr. Daniel Chege with Units "201; 204; 205; 207; 507; 701; 708; 709; 710; 906; 910; 1406" owns 12 units
- Always list all unit numbers when relevant

MODULE CONTEXT:
- Unit_Owner_Database: Property owners - Name, Phone, Units (semicolon-separated list), Payout Method
- Property_Units_Database: Individual units - Unit Number, Status, Nightly Rate, Bedrooms, Floor
- Guests_Database: Guest info - Name, Nationality, Passport, Payment Method
- Bookings: Reservations - Guest, Unit, Amount, Commission, Check-in/out dates, Status
- Airbnb_Services: Cleaning and services for Airbnb units
- Airbnb_Water_Bills: Water bills for Airbnb units
- Rental_Properties: Long-term rental units
- Rental_Management: Lease agreements - Property, Tenant, Lease dates, Rent Amount
- Tenants: Long-term tenants info
- Monthly_Rent: Monthly rent payments - Tenant, Amount, Due Date, Status
- Rental_Water_Bills: Water bills for rental tenants
- Rentals_Service: Annual/periodic rental services
- Rental_Payments: Service payments\`;

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
}];`;
      console.log('Updated Build AI Request with better data interpretation');
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
          console.log('SUCCESS: Units interpretation fixed!');
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
