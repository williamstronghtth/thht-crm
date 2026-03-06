-- THHT CRM Schema for Supabase
-- Run this in the Supabase SQL Editor to create the clients table

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  stage TEXT DEFAULT 'lead',
  client_type TEXT DEFAULT 'buyer',
  lead_type TEXT DEFAULT 'cold',
  lead_source TEXT DEFAULT 'Other',
  follow_up_date TIMESTAMPTZ,
  next_action TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  
  -- Property Alerts (stored as JSONB)
  alerts JSONB DEFAULT '{
    "enabled": false,
    "method": "email",
    "frequency": "daily",
    "criteria": {
      "locations": [],
      "priceMin": null,
      "priceMax": null,
      "bedsMin": null,
      "bathsMin": null,
      "propertyTypes": [],
      "yearBuiltMax": null,
      "maxStories": null,
      "minCapRate": null,
      "customNotes": ""
    }
  }'::jsonb,
  
  -- Activity log (stored as JSONB array)
  activity_log JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clients_stage ON clients(stage);
CREATE INDEX IF NOT EXISTS idx_clients_lead_type ON clients(lead_type);
CREATE INDEX IF NOT EXISTS idx_clients_lead_source ON clients(lead_source);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_follow_up ON clients(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_clients_updated ON clients(updated_at DESC);

-- Create full-text search index
CREATE INDEX IF NOT EXISTS idx_clients_search ON clients 
  USING GIN (to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, '')));

-- Enable Row Level Security (optional, for future multi-user support)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust for production)
CREATE POLICY "Allow all operations" ON clients
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Verify table created
SELECT 'Table created successfully!' AS status;
