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

    // Helper function to escape for Telegram - replace underscores with spaces
    const escapeCode = `
// Escape special characters for Telegram
function escapeForTelegram(text) {
  if (!text) return text;
  return text
    .replace(/_/g, ' ')
    .replace(/\\*/g, '')
    .replace(/\`/g, '')
    .replace(/\\[/g, '(')
    .replace(/\\]/g, ')');
}`;

    // Fix Format Response node
    const formatNode = workflow.nodes.find(n => n.name === 'Format Response');
    if (formatNode) {
      formatNode.parameters.jsCode = `const prev = $('Build AI Request').first().json;
const source = prev.source;
const chatId = prev.chatId;
let output = '';
try {
  output = $input.first().json.choices[0].message.content;
  // Escape special characters for Telegram
  output = output.replace(/_/g, ' ');
  output = output.replace(/\\*\\*/g, '');
  output = output.replace(/\\*/g, '');
  output = output.replace(/\`/g, '');
  output = output.replace(/\\[/g, '(');
  output = output.replace(/\\]/g, ')');
} catch(e) {
  output = 'Error processing your request. Please try again.';
}
return [{ json: { output, source, chatId } }];`;
      console.log('Fixed Format Response');
    }

    // Fix No Data Response node
    const noDataNode = workflow.nodes.find(n => n.name === 'No Data Response');
    if (noDataNode) {
      noDataNode.parameters.jsCode = `const input = $input.first().json;
const moduleName = (input.module || 'Unknown').replace(/_/g, ' ');
const output = 'No records found in ' + moduleName + '. The module might be empty.';
return [{ json: { output, source: input.source, chatId: input.chatId } }];`;
      console.log('Fixed No Data Response');
    }

    // Fix Format Unknown node
    const unknownNode = workflow.nodes.find(n => n.name === 'Format Unknown');
    if (unknownNode) {
      unknownNode.parameters.jsCode = `const input = $input.first().json;
const output = "I'm not sure what you're asking about. Here are things I can help with:\\n\\n" +
  "AIRBNB/SHORT-TERM:\\n" +
  "- Bookings (reservations, check-ins, commissions)\\n" +
  "- Guests (guest info)\\n" +
  "- Property Units (units, rooms, rates)\\n" +
  "- Airbnb Services (cleaning)\\n" +
  "- Airbnb Water Bills\\n\\n" +
  "LONG-TERM RENTALS:\\n" +
  "- Tenants\\n" +
  "- Monthly Rent\\n" +
  "- Rental Properties\\n" +
  "- Lease Management\\n" +
  "- Rental Services\\n" +
  "- Rental Water Bills\\n" +
  "- Rental Payments\\n\\n" +
  "OWNERS:\\n" +
  "- Unit Owner Database\\n\\n" +
  "Try: 'Show all bookings' or 'List tenants'";
return [{ json: { output, source: input.source, chatId: input.chatId } }];`;
      console.log('Fixed Format Unknown');
    }

    // Fix Format Module List node
    const moduleListNode = workflow.nodes.find(n => n.name === 'Format Module List');
    if (moduleListNode) {
      moduleListNode.parameters.jsCode = `const input = $input.first().json;

let output = 'Available Modules:\\n\\n';
output += 'AIRBNB/SHORT-TERM:\\n';
output += '1. Bookings\\n';
output += '2. Guests Database\\n';
output += '3. Property Units\\n';
output += '4. Airbnb Services\\n';
output += '5. Airbnb Water Bills\\n\\n';

output += 'LONG-TERM RENTALS:\\n';
output += '6. Tenants\\n';
output += '7. Monthly Rent\\n';
output += '8. Rental Properties\\n';
output += '9. Lease Management\\n';
output += '10. Rental Services\\n';
output += '11. Rental Water Bills\\n';
output += '12. Rental Payments\\n\\n';

output += 'OWNERS:\\n';
output += '13. Unit Owner Database\\n\\n';

output += 'Ask me about any of these!';

return [{ json: { output, source: input.source, chatId: input.chatId } }];`;
      console.log('Fixed Format Module List');
    }

    // Fix Handle Create node
    const handleCreateNode = workflow.nodes.find(n => n.name === 'Handle Create');
    if (handleCreateNode) {
      handleCreateNode.parameters.jsCode = `const input = $input.first().json;
const module = (input.detectedModule || '').replace(/_/g, ' ');
const createData = input.createData;
const missingFields = input.missingFields || [];
const source = input.source;
const chatId = input.chatId;

if (missingFields.length > 0) {
  const fields = missingFields.map((f, i) => (i+1) + '. ' + f.replace(/_/g, ' ')).join('\\n');
  const output = 'To create a record in ' + module + ', I need:\\n\\n' + fields + '\\n\\nPlease provide these details.';
  return [{ json: { output, source, chatId, skipCreate: true } }];
}

if (createData && Object.keys(createData).length > 0) {
  return [{ json: { module: input.detectedModule, createData, source, chatId, skipCreate: false } }];
}

const output = 'Please provide the details for the record you want to create. For example:\\n' +
  '"Create booking for Ahmed in unit 701 for KES 50000 from Jan 1 to Jan 15"';
return [{ json: { output, source, chatId, skipCreate: true } }];`;
      console.log('Fixed Handle Create');
    }

    // Fix Format Create Response node
    const createResponseNode = workflow.nodes.find(n => n.name === 'Format Create Response');
    if (createResponseNode) {
      createResponseNode.parameters.jsCode = `const prev = $('Handle Create').first().json;
const res = $input.first().json;
const source = prev.source;
const chatId = prev.chatId;
const module = (prev.module || '').replace(/_/g, ' ');

let output = '';
if (res.data && res.data[0] && res.data[0].status === 'success') {
  output = 'Successfully created record in ' + module + '!\\n\\n' +
    'Record ID: ' + res.data[0].details.id;
} else if (res.code) {
  output = 'Error creating record: ' + (res.message || res.code);
} else {
  output = 'Record creation completed. Please check Zoho CRM to verify.';
}

return [{ json: { output, source, chatId } }];`;
      console.log('Fixed Format Create Response');
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
          console.log('SUCCESS: All Telegram escaping fixed!');
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
