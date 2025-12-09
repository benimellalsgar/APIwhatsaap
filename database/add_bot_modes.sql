-- Migration: Add bot mode configuration to tenants table

-- Add bot_mode column (default: conversational - most flexible)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'bot_mode'
    ) THEN
        ALTER TABLE tenants ADD COLUMN bot_mode VARCHAR(50) DEFAULT 'conversational';
    END IF;
END $$;

-- Add bot_config column for mode-specific settings (JSON)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'bot_config'
    ) THEN
        ALTER TABLE tenants ADD COLUMN bot_config JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_tenants_bot_mode ON tenants(bot_mode);

-- Update existing tenants with owner_whatsapp_number to ecommerce mode
UPDATE tenants 
SET bot_mode = 'ecommerce'
WHERE owner_whatsapp_number IS NOT NULL AND bot_mode = 'conversational';

-- Bot Modes:
-- 'conversational' - Simple Q&A bot (no orders, no payments) - DEFAULT
-- 'ecommerce'      - Full shopping experience with payments
-- 'appointment'    - Booking system for doctors, salons, etc.
-- 'delivery'       - Delivery tracking and updates
