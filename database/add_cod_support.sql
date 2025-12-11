-- Add COD (Cash On Delivery) support
-- Migration: Add accept_cod column to tenants table

-- Add accept_cod column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'accept_cod'
    ) THEN
        ALTER TABLE tenants ADD COLUMN accept_cod BOOLEAN DEFAULT false;
        RAISE NOTICE 'Column accept_cod added to tenants table';
    ELSE
        RAISE NOTICE 'Column accept_cod already exists in tenants table';
    END IF;
END $$;

-- Add payment_method column to customer_orders if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_orders' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE customer_orders ADD COLUMN payment_method VARCHAR(20) DEFAULT 'BANK_TRANSFER';
        RAISE NOTICE 'Column payment_method added to customer_orders table';
    ELSE
        RAISE NOTICE 'Column payment_method already exists in customer_orders table';
    END IF;
END $$;

-- Update existing orders to have payment_method = 'BANK_TRANSFER' if NULL
UPDATE customer_orders 
SET payment_method = 'BANK_TRANSFER' 
WHERE payment_method IS NULL;

RAISE NOTICE 'COD migration completed successfully!';
