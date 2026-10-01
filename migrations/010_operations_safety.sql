ALTER TABLE people ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE communications ADD COLUMN context JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX provider_message_identity ON communications(provider_id) WHERE provider_id IS NOT NULL;
CREATE UNIQUE INDEX whatsapp_school_sender ON school_integrations(whatsapp_phone_id) WHERE whatsapp_phone_id IS NOT NULL;
