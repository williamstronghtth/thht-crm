/**
 * Add test buyers with alert criteria
 * Based on Chris's buyer list: Suzanne Allen and Scott
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      stages: ['lead', 'active', 'contract', 'closed', 'past'],
      leadSources: ['Other'],
      clients: []
    };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const testBuyers = [
  {
    id: 'buyer-suzanne-allen',
    firstName: 'Suzanne',
    lastName: 'Allen',
    email: 'suzanne.allen@example.com', // Placeholder
    phone: '386-555-0001', // Placeholder
    address: '',
    stage: 'active',
    clientType: 'buyer',
    leadSource: 'Other',
    followUpDate: null,
    nextAction: 'Property search active',
    notes: 'Looking for older home, single story. Port Orange or New Smyrna Beach area.',
    alerts: {
      enabled: true,
      method: 'email',
      frequency: 'daily',
      criteria: {
        locations: ['Port Orange', 'New Smyrna Beach', 'NSB'],
        priceMin: 650000,
        priceMax: 775000,
        bedsMin: 3,
        bathsMin: null,
        propertyTypes: ['single-family'],
        yearBuiltMax: 1980, // ≤1980 requirement
        maxStories: 1, // Single story only
        minCapRate: null,
        customNotes: 'Wants character home, older construction preferred'
      }
    },
    activityLog: [{
      timestamp: new Date().toISOString(),
      action: 'Created',
      details: 'Test buyer added for Property Alert System'
    }],
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'buyer-scott',
    firstName: 'Scott',
    lastName: '(Investor)',
    email: 'scott.investor@example.com', // Placeholder
    phone: '386-555-0002', // Placeholder
    address: '',
    stage: 'active',
    clientType: 'investor',
    leadSource: 'Other',
    followUpDate: null,
    nextAction: 'Investment property search',
    notes: 'Investor looking for 6%+ cap rate. Daytona Beach or Ormond Beach preferred.',
    alerts: {
      enabled: true,
      method: 'email',
      frequency: 'daily',
      criteria: {
        locations: ['Daytona Beach', 'Ormond Beach'],
        priceMin: null,
        priceMax: 425000,
        bedsMin: null,
        bathsMin: null,
        propertyTypes: ['single-family', 'multi-family', 'condo'],
        yearBuiltMax: null,
        maxStories: null,
        minCapRate: 6, // 6%+ cap rate - flagged for manual review
        customNotes: 'Investment property. Verify cap rate manually - need rental income data.'
      }
    },
    activityLog: [{
      timestamp: new Date().toISOString(),
      action: 'Created',
      details: 'Test buyer added for Property Alert System'
    }],
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function addTestBuyers() {
  console.log('Adding test buyers for Property Alert System...\n');
  
  const data = loadData();
  
  for (const buyer of testBuyers) {
    // Check if buyer already exists
    const existing = data.clients.find(c => c.id === buyer.id);
    if (existing) {
      console.log(`⏭️  ${buyer.firstName} ${buyer.lastName} already exists, skipping`);
      continue;
    }
    
    data.clients.push(buyer);
    console.log(`✅ Added: ${buyer.firstName} ${buyer.lastName}`);
    console.log(`   Criteria: $${buyer.alerts.criteria.priceMin?.toLocaleString() || '0'}-$${buyer.alerts.criteria.priceMax?.toLocaleString() || '∞'}`);
    console.log(`   Locations: ${buyer.alerts.criteria.locations.join(', ')}`);
    if (buyer.alerts.criteria.yearBuiltMax) {
      console.log(`   Year Built: ≤${buyer.alerts.criteria.yearBuiltMax}`);
    }
    if (buyer.alerts.criteria.maxStories) {
      console.log(`   Stories: ≤${buyer.alerts.criteria.maxStories}`);
    }
    if (buyer.alerts.criteria.minCapRate) {
      console.log(`   Cap Rate: ≥${buyer.alerts.criteria.minCapRate}%`);
    }
    console.log('');
  }
  
  saveData(data);
  console.log('✅ Test buyers saved to data.json');
}

if (require.main === module) {
  addTestBuyers();
}

module.exports = { testBuyers, addTestBuyers };
