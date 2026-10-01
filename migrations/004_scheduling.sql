CREATE TABLE class_series (
 school_id UUID NOT NULL, id UUID NOT NULL, batch_id UUID NOT NULL, teacher_id UUID NOT NULL REFERENCES accounts(id), location TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,batch_id) REFERENCES batches(school_id,id)
);
CREATE TABLE class_occurrences (
 school_id UUID NOT NULL, id UUID NOT NULL, series_id UUID, batch_id UUID NOT NULL, teacher_id UUID NOT NULL REFERENCES accounts(id), starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, location TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled','completed')), version INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '', makeup_for UUID, PRIMARY KEY(school_id,id), CHECK(ends_at>starts_at), FOREIGN KEY(school_id,series_id) REFERENCES class_series(school_id,id), FOREIGN KEY(school_id,batch_id) REFERENCES batches(school_id,id), FOREIGN KEY(school_id,makeup_for) REFERENCES class_occurrences(school_id,id)
);
CREATE TABLE attendance (
 school_id UUID NOT NULL, occurrence_id UUID NOT NULL, learner_id UUID NOT NULL, status TEXT NOT NULL CHECK(status IN ('present','absent','excused')), marked_by UUID NOT NULL REFERENCES accounts(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,occurrence_id,learner_id), FOREIGN KEY(school_id,occurrence_id) REFERENCES class_occurrences(school_id,id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id)
);
CREATE TABLE communications (
 school_id UUID NOT NULL, id UUID NOT NULL, key TEXT NOT NULL, household_id UUID NOT NULL, person_id UUID NOT NULL, occurrence_id UUID, occurrence_version INTEGER, kind TEXT NOT NULL CHECK(kind IN ('class','fee','test','feedback','event','announcement')), destination TEXT NOT NULL, subjects JSONB NOT NULL, message TEXT NOT NULL, due_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','manual','sending','sent','delivered','failed','unknown','cancelled','opted_out')), attempts INTEGER NOT NULL DEFAULT 0, provider_id TEXT, error TEXT, lease_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), UNIQUE(school_id,key), FOREIGN KEY(school_id,household_id) REFERENCES households(school_id,id), FOREIGN KEY(school_id,person_id) REFERENCES people(school_id,id), FOREIGN KEY(school_id,occurrence_id) REFERENCES class_occurrences(school_id,id)
);
CREATE INDEX due_messages ON communications(status,due_at);
CREATE INDEX class_calendar ON class_occurrences(school_id,starts_at);
