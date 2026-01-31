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

const moduleKnowledge = `
ALIF HOMES ZOHO CRM MODULES - COMPLETE REFERENCE:

1. Unit_Owner_Database - Property owners and landlords
   Keywords: owners, landlords, who owns, unit owner, owner phone, payout method, owner name
   Fields: Name, Units, Phone, Contact Role, Owner Type, Payout Method

2. Property_Units_Database - Individual units/apartments (mainly for Airbnb)
   Keywords: units, rooms, apartments, unit number, occupied, vacant, available, bedrooms, floor, nightly rate, which units
   Fields: Unit Number, Unit Status, Unit Owner, Nightly Rate, Bedrooms, Floor

3. Guests_Database - Guest information for short-term stays
   Keywords: guests, visitors, guest names, who stayed, nationality, passport, ID number, guest payment
   Fields: First Name, Last Name, Contact Role, ID/Passport Number, Nationality, Payment Method

4. Bookings - Reservations and bookings with commissions
   Keywords: bookings, reservations, check-in, check-out, arrivals, departures, commission, net commission, agent commission, amount paid, balance, booking status, confirmed, booking source
   Fields: Guest Name, Unit, Amount, Amount Paid, Balance, Commission Rate, Commission Amount, Agent Commission, Net Commission, Booking Status, Checked-in, Checked-out, Payment Status, Booking Source

5. Airbnb_Services - Services for Airbnb units (cleaning, maintenance)
   Keywords: airbnb services, airbnb cleaning, cleaning service, service frequency, airbnb maintenance
   Fields: Owner Name, Unit, Amount, Service, Service Frequency, Status, Amount Paid, Balance, Payment Date, Note

6. Airbnb_Water_Bills - Water bills for Airbnb units
   Keywords: airbnb water, airbnb water bills, airbnb meter, airbnb billing
   Fields: Owner Name, Unit, Meter Reading, Price Per Unit, Total Water Bill, Billing Month, Reference Number, Bill Status, Payment Method, Amount Paid, Balance

7. Rental_Properties - Long-term rental properties/units
   Keywords: rental properties, rental units, long-term rentals, property status, lease status, rental monthly
   Fields: Unit Number, Property Status, Owner, Monthly Rent, Bedrooms, Lease Status

8. Rental_Management - Lease agreements and contracts
   Keywords: lease, lease management, rental agreement, contract, lease start, lease end, tenancy agreement, agreement
   Fields: Property, Tenant, Rental Status, Rent Amount, Payment Frequency, Payment Method, Payment Status, Lease Start Date, Lease End Date

9. Tenants - Long-term tenants/renters
   Keywords: tenants, renters, tenant names, who lives, who rents, tenant phone, tenant contact, long-term renters
   Fields: Contact Name, Contact Phone, Tenant Type, ID/Passport Number, Preferred Payment Method

10. Monthly_Rent - Monthly rent payments from tenants
    Keywords: monthly rent, rent payment, rent due, rent paid, rent amount, due date, rent balance, who paid rent, rent status
    Fields: Tenant, Rental Properties, Rent Month, Due Date, Rent Amount, Paid Amount, Balance, Payment Status, Payment Date, Payment Method

11. Rental_Water_Bills - Water bills for rental tenants
    Keywords: rental water, rental water bills, tenant water, water bill, meter reading, water meter, tenant billing
    Fields: Client Name, Unit, Meter Reading, Price Per Unit, Billing Month, Reference Number, Bill Status, Payment Method, Amount Paid

12. Rentals_Service - Annual/periodic rental services
    Keywords: rental services, rentals service, annual service, service payment, service balance, service fee
    Fields: Client Name, Unit, Billing Frequency, Amount, Amount Paid, Balance, Status, Payment Date, Due Date, Note

13. Rental_Payments - Payments for rental services
    Keywords: rental payments, payments, service payment, payment amount, payment method, payment status, who paid
    Fields: Service Name, Client Name, Unit Number, Payment Amount, Payment Method, Payment Date, Payment Status, Note
`;

const req = https.request(getOptions, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const workflow = JSON.parse(data);

    // Update Build Module Detection node with comprehensive knowledge
    const buildModuleNode = workflow.nodes.find(n => n.name === 'Build Module Detection');
    if (buildModuleNode) {
      buildModuleNode.parameters.jsCode = `const input = $('Merge Input').first().json;
const modulesRes = $input.first().json;
const question = input.chatInput || '';
const source = input.source;
const chatId = input.chatId;

// Get modules from Zoho
let modules = [];
if (modulesRes.modules) {
  modules = modulesRes.modules
    .filter(m => m.api_supported)
    .map(m => ({
      api_name: m.api_name,
      plural_label: m.plural_label,
      singular_label: m.singular_label
    }));
}

const moduleList = modules.map(m => m.api_name + ' (' + m.plural_label + ')').join(', ');

const systemPrompt = \`You are a module detector for Alif Homes Zoho CRM. Given a user question, determine which module to query.

MODULES AND THEIR KEYWORDS:

1. Unit_Owner_Database - owners, landlords, who owns, unit owner, owner phone, payout method
2. Property_Units_Database - units, rooms, apartments, unit number, occupied, vacant, bedrooms, floor, nightly rate
3. Guests_Database - guests, visitors, guest names, who stayed, nationality, passport, ID
4. Bookings - bookings, reservations, check-in, check-out, arrivals, departures, commission, net commission, agent commission, booking status
5. Airbnb_Services - airbnb services, airbnb cleaning, cleaning service, airbnb maintenance
6. Airbnb_Water_Bills - airbnb water, airbnb water bills, airbnb meter
7. Rental_Properties - rental properties, rental units, long-term rentals, property status
8. Rental_Management - lease, lease management, rental agreement, contract, lease start, lease end
9. Tenants - tenants, renters, tenant names, who lives, who rents
10. Monthly_Rent - monthly rent, rent payment, rent due, rent paid, rent amount, due date
11. Rental_Water_Bills - rental water, tenant water, water bill, meter reading (for rentals)
12. Rentals_Service - rental services, annual service, service payment, service fee
13. Rental_Payments - rental payments, payments, service payment, payment amount

RULES:
1. Return ONLY the exact api_name (e.g., "Bookings" or "Tenants")
2. Match keywords carefully - "airbnb water" = Airbnb_Water_Bills, "rental water" or "tenant water" = Rental_Water_Bills
3. "commission" or "net commission" = Bookings
4. "cleaning" with "airbnb" = Airbnb_Services
5. "guests" or "visitors" = Guests_Database
6. "tenants" or "renters" or "who lives" = Tenants
7. "monthly rent" or "rent paid" or "rent due" = Monthly_Rent
8. "lease" or "agreement" or "contract" = Rental_Management
9. "owners" or "landlords" = Unit_Owner_Database
10. "units" or "rooms" or "bedrooms" or "vacant" or "occupied" = Property_Units_Database
11. If user says "list modules" or "show modules", return "LIST_MODULES"
12. If truly unclear, return "UNKNOWN"

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
}];`;
      console.log('Updated Build Module Detection');
    }

    // Update Build AI Request node with comprehensive knowledge
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

MODULE CONTEXT:
- Unit_Owner_Database: Property owners/landlords info (Name, Phone, Units, Payout Method)
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
      console.log('Updated Build AI Request');
    }

    // Update Format Response to handle special characters
    const formatNode = workflow.nodes.find(n => n.name === 'Format Response');
    if (formatNode) {
      formatNode.parameters.jsCode = `const prev = $('Build AI Request').first().json;
const source = prev.source;
const chatId = prev.chatId;
let output = '';
try {
  output = $input.first().json.choices[0].message.content;
  // Remove markdown formatting that Telegram can't parse
  output = output.replace(/\\*\\*/g, '');
  output = output.replace(/\\*/g, '');
  output = output.replace(/_/g, ' ');
  output = output.replace(/\`/g, '');
  output = output.replace(/\\[/g, '(');
  output = output.replace(/\\]/g, ')');
} catch(e) {
  output = 'Error processing your request. Please try again.';
}
return [{ json: { output, source, chatId } }];`;
      console.log('Updated Format Response');
    }

    // Update Format Unknown to list all modules
    const unknownNode = workflow.nodes.find(n => n.name === 'Format Unknown');
    if (unknownNode) {
      unknownNode.parameters.jsCode = `const input = $input.first().json;
const output = "I'm not sure which module you're asking about. Here are all available modules:\\n\\n" +
  "AIRBNB/SHORT-TERM:\\n" +
  "- Bookings (reservations, check-ins, commissions)\\n" +
  "- Guests Database (guest info, nationality)\\n" +
  "- Property Units (units, rooms, rates)\\n" +
  "- Airbnb Services (cleaning)\\n" +
  "- Airbnb Water Bills\\n\\n" +
  "LONG-TERM RENTALS:\\n" +
  "- Tenants (tenant info)\\n" +
  "- Monthly Rent (rent payments)\\n" +
  "- Rental Properties (rental units)\\n" +
  "- Lease Management (agreements)\\n" +
  "- Rental Services\\n" +
  "- Rental Water Bills\\n" +
  "- Rental Payments\\n\\n" +
  "OWNERS:\\n" +
  "- Unit Owner Database (landlords)\\n\\n" +
  "Try asking something like 'Show me all bookings' or 'List tenants'";
return [{ json: { output, source: input.source, chatId: input.chatId } }];`;
      console.log('Updated Format Unknown');
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
          console.log('SUCCESS: Agent trained with all 13 modules!');
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
