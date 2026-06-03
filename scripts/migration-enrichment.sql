-- Migration: Add enrichment columns to clients table
-- Phase 1: Prospect Intelligence Engine
-- Date: 2026-06-03

ALTER TABLE clients ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS home_purchase_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS estimated_home_value INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enrichment_notes TEXT;
