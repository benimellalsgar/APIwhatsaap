-- Migration: Add trial tracking columns to tenants table

-- Add first_used_at column (tracks when user first started bot after confirmation)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS first_used_at TIMESTAMP;

-- Add trial_notified column (tracks if admin has been notified about 30-day usage)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS trial_notified BOOLEAN DEFAULT false;

-- Add index for efficient querying of trial users
CREATE INDEX IF NOT EXISTS idx_tenants_first_used_at ON tenants(first_used_at);
CREATE INDEX IF NOT EXISTS idx_tenants_trial_notified ON tenants(trial_notified);

-- Update existing tenants who have connections (set first_used_at to their first connection date)
UPDATE tenants t
SET first_used_at = (
    SELECT MIN(created_at) 
    FROM whatsapp_connections wc 
    WHERE wc.tenant_id = t.id
)
WHERE first_used_at IS NULL 
AND EXISTS (SELECT 1 FROM whatsapp_connections wc WHERE wc.tenant_id = t.id);
