CREATE TABLE school_events (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, title TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, venue TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', contribution INTEGER NOT NULL DEFAULT 0 CHECK(contribution>=0), basis TEXT NOT NULL CHECK(basis IN ('person','household')), cancelled_at TIMESTAMPTZ, PRIMARY KEY(school_id,id)
);
ALTER TABLE charges ADD FOREIGN KEY(school_id,event_id) REFERENCES school_events(school_id,id);
CREATE TABLE event_registrations (
 school_id UUID NOT NULL, event_id UUID NOT NULL, household_id UUID NOT NULL, person_id UUID NOT NULL, performing BOOLEAN NOT NULL DEFAULT false, programme_order INTEGER NOT NULL DEFAULT 0, piece TEXT NOT NULL DEFAULT '', rehearsal TEXT NOT NULL DEFAULT '', cancelled_at TIMESTAMPTZ, PRIMARY KEY(school_id,event_id,person_id), FOREIGN KEY(school_id,event_id) REFERENCES school_events(school_id,id), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id), FOREIGN KEY(school_id,person_id) REFERENCES people(school_id,id)
);
CREATE TABLE event_expenses (
 school_id UUID NOT NULL, id UUID NOT NULL, event_id UUID NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), key TEXT NOT NULL, actor_id UUID NOT NULL REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), UNIQUE(school_id,key), FOREIGN KEY(school_id,event_id) REFERENCES school_events(school_id,id)
);
