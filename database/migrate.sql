-- Add owner_whatsapp_number column to tenants table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'owner_whatsapp_number'
    ) THEN
        ALTER TABLE tenants ADD COLUMN owner_whatsapp_number VARCHAR(50);
    END IF;
END $$;

-- Add bank_rib column to tenants table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'bank_rib'
    ) THEN
        ALTER TABLE tenants ADD COLUMN bank_rib VARCHAR(255);
    END IF;
END $$;

-- Add first_used_at column for trial tracking
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'first_used_at'
    ) THEN
        ALTER TABLE tenants ADD COLUMN first_used_at TIMESTAMP;
    END IF;
END $$;

-- Add trial_notified column for trial tracking
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'trial_notified'
    ) THEN
        ALTER TABLE tenants ADD COLUMN trial_notified BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Ensure customer_orders table exists with all columns
CREATE TABLE IF NOT EXISTS customer_orders (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    customer_phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255),
    customer_address TEXT,
    customer_email VARCHAR(255),
    order_details TEXT,
    payment_proof_url TEXT,
    payment_proof_cloudinary_id VARCHAR(255),
    order_state VARCHAR(50) DEFAULT 'initiated',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_customer_orders_tenant_id ON customer_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_orders_state ON customer_orders(order_state);

-- Create indexes for trial tracking
CREATE INDEX IF NOT EXISTS idx_tenants_first_used_at ON tenants(first_used_at);
CREATE INDEX IF NOT EXISTS idx_tenants_trial_notified ON tenants(trial_notified);

-- Update existing tenants with connections (backfill first_used_at)
UPDATE tenants t
SET first_used_at = (
    SELECT MIN(created_at) 
    FROM whatsapp_connections wc 
    WHERE wc.tenant_id = t.id
)
WHERE first_used_at IS NULL 
AND EXISTS (SELECT 1 FROM whatsapp_connections wc WHERE wc.tenant_id = t.id);
