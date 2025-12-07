-- Add bank_rib column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_rib VARCHAR(255);
