CREATE TABLE people (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100), phone TEXT, email TEXT, contact_opt_out BOOLEAN NOT NULL DEFAULT false, archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id)
);
CREATE TABLE households (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100), primary_person_id UUID NOT NULL, billing_person_id UUID NOT NULL, version INTEGER NOT NULL DEFAULT 1, archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,primary_person_id) REFERENCES people(school_id,id), FOREIGN KEY(school_id,billing_person_id) REFERENCES people(school_id,id)
);
CREATE TABLE household_members (
 school_id UUID NOT NULL, household_id UUID NOT NULL, person_id UUID NOT NULL, relationship TEXT NOT NULL, ended_at TIMESTAMPTZ, PRIMARY KEY(school_id,household_id,person_id), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id), FOREIGN KEY(school_id,person_id) REFERENCES people(school_id,id)
);
ALTER TABLE households ADD FOREIGN KEY(school_id,id,primary_person_id) REFERENCES household_members(school_id,household_id,person_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE households ADD FOREIGN KEY(school_id,id,billing_person_id) REFERENCES household_members(school_id,household_id,person_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE learners (
 school_id UUID NOT NULL, id UUID NOT NULL, person_id UUID NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')), level TEXT NOT NULL DEFAULT 'Beginner', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), UNIQUE(school_id,person_id), FOREIGN KEY(school_id,person_id) REFERENCES people(school_id,id)
);
CREATE TABLE relationships (
 school_id UUID NOT NULL, guardian_id UUID NOT NULL, dependant_id UUID NOT NULL, PRIMARY KEY(school_id,guardian_id,dependant_id), CHECK(guardian_id<>dependant_id), FOREIGN KEY(school_id,guardian_id) REFERENCES people(school_id,id), FOREIGN KEY(school_id,dependant_id) REFERENCES people(school_id,id)
);
CREATE TABLE batches (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, name TEXT NOT NULL, course TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 500), archived_at TIMESTAMPTZ, PRIMARY KEY(school_id,id)
);
CREATE TABLE enrollments (
 school_id UUID NOT NULL, id UUID NOT NULL, learner_id UUID NOT NULL, batch_id UUID NOT NULL, household_id UUID NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','ended')), starts_on DATE NOT NULL, ends_on DATE, PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id), FOREIGN KEY(school_id,batch_id) REFERENCES batches(school_id,id), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id), CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE UNIQUE INDEX active_enrollment ON enrollments(school_id,learner_id,batch_id) WHERE status='active';
CREATE TABLE crm_notes (
 school_id UUID NOT NULL, id UUID NOT NULL, household_id UUID NOT NULL, text TEXT NOT NULL, actor_id UUID NOT NULL REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id)
);
CREATE TABLE followups (
 school_id UUID NOT NULL, id UUID NOT NULL, household_id UUID NOT NULL, title TEXT NOT NULL, due_on DATE NOT NULL, done_at TIMESTAMPTZ, PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id)
);
CREATE TABLE school_grants (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, account_id UUID NOT NULL REFERENCES accounts(id), capability TEXT NOT NULL, resource_type TEXT NOT NULL CHECK(resource_type IN ('school','batch','learner','household','assessment')), resource_id UUID NOT NULL, granted_by UUID NOT NULL REFERENCES accounts(id), revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id)
);
CREATE UNIQUE INDEX active_grant ON school_grants(school_id,account_id,capability,resource_type,resource_id) WHERE revoked_at IS NULL;
CREATE TABLE import_runs (
 school_id UUID NOT NULL REFERENCES schools(id), key TEXT NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,key)
);
CREATE TABLE saved_views (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, account_id UUID NOT NULL REFERENCES accounts(id), name TEXT NOT NULL, filters JSONB NOT NULL, PRIMARY KEY(school_id,id)
);
CREATE INDEX person_search ON people(school_id,lower(name));
