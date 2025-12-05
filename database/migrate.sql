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
