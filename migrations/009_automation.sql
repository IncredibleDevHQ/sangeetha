CREATE TABLE school_integrations (
 school_id UUID PRIMARY KEY REFERENCES schools(id), automated_messages BOOLEAN NOT NULL DEFAULT false, whatsapp_phone_id TEXT, whatsapp_template TEXT, whatsapp_language TEXT NOT NULL DEFAULT 'en', daily_message_limit INTEGER NOT NULL DEFAULT 200 CHECK(daily_message_limit BETWEEN 1 AND 10000)
);
CREATE TABLE delivery_events (
 school_id UUID NOT NULL, id UUID NOT NULL, communication_id UUID NOT NULL, status TEXT NOT NULL, provider_id TEXT, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,communication_id) REFERENCES communications(school_id,id)
);
CREATE TABLE payment_links (
 school_id UUID NOT NULL, id UUID NOT NULL, household_id UUID NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), provider_id TEXT, url TEXT, status TEXT NOT NULL CHECK(status IN ('creating','created','unknown','paid','cancelled')), charge_ids UUID[] NOT NULL, key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), UNIQUE(school_id,key), UNIQUE(provider_id), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id)
);
CREATE TABLE provider_events (
 provider TEXT NOT NULL, id TEXT NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(provider,id)
);
