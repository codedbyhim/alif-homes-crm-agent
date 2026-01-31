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

    // Find and fix Format Response node to escape special chars
    const formatNode = workflow.nodes.find(n => n.name === 'Format Response');
    if (formatNode) {
      formatNode.parameters.jsCode = `const prev = $('Build AI Request').first().json;
const source = prev.source;
const chatId = prev.chatId;
let output = '';
try {
  output = $input.first().json.choices[0].message.content;
  // Remove markdown formatting that Telegram can't parse
  output = output.replace(/\\*\\*/g, '');  // Remove bold **
  output = output.replace(/\\*/g, '');     // Remove italic *
  output = output.replace(/_/g, ' ');     // Replace underscores with spaces
  output = output.replace(/\`/g, '');     // Remove code backticks
} catch(e) {
  output = 'Error processing your request. Please try again.';
}
return [{ json: { output, source, chatId } }];`;
      console.log('Fixed Format Response node');
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
          console.log('SUCCESS: Workflow updated!');
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
          console.log('Error:', putData.substring(0, 300));
        }
      });
    });
    putReq.write(updateData);
    putReq.end();
  });
});
req.end();
