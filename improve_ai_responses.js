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

    // Update Build AI Request with much better instructions
    const buildAINode = workflow.nodes.find(n => n.name === 'Build AI Request');
    if (buildAINode) {
      buildAINode.parameters.jsCode = `const input = $input.first().json;
const question = input.question || '';
const module = input.module || 'Unknown';
const data = input.data || '[]';
const total = input.total || 0;
const source = input.source;
const chatId = input.chatId;

const systemPrompt = \`You are Alif Homes CRM assistant for SkyWay Building in Kenya. Today: \${new Date().toISOString().split('T')[0]}.

CRITICAL RULES:
1. ALWAYS use Kenyan Shillings (KES) - never use $
2. Format: KES 1,495,826.50
3. Be accurate with calculations
4. Be specific with names, dates, amounts

DATA INTERPRETATION FOR Unit_Owner_Database:
- The "Units" field contains unit numbers
- If Units = "310" → owner owns 1 unit (unit 310)
- If Units = "201; 204; 205" → owner owns 3 units (units 201, 204, 205)
- Count semicolons + 1 = number of units
- ALWAYS report the actual unit numbers when asked

EXAMPLE RESPONSES:
Q: "How many units does Raage Barre own?"
A: "Raage Barre owns 1 unit: 310"

Q: "How many units does Mr. Daniel Chege own?"
A: "Mr. Daniel Chege owns 12 units: 201, 204, 205, 207, 507, 701, 708, 709, 710, 906, 910, 1406"

Q: "Which unit does Raage Barre own?"
A: "Raage Barre owns unit 310"

IMPORTANT:
- Read the data carefully
- Find the person's name in the data
- Look at their "Units" field
- Report the exact unit numbers
- Never say "no unit numbers" if there IS data in the Units field\`;

const userMsg = 'Question: ' + question + '\\n\\nModule: ' + module + '\\nTotal Records: ' + total + '\\n\\nData:\\n' + data;

const requestBody = JSON.stringify({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg }
  ],
  max_tokens: 2000,
  temperature: 0.1
});

return [{
  json: {
    requestBody,
    chatId,
    source
  }
}];`;
      console.log('Improved AI response instructions');
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
          console.log('SUCCESS: AI responses improved!');
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
