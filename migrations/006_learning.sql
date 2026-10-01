CREATE TABLE capability_invitations (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('email','phone')), destination TEXT NOT NULL, capability TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id UUID NOT NULL, invited_by UUID NOT NULL REFERENCES accounts(id), claimed_by UUID REFERENCES accounts(id), claimed_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(school_id,id)
);
CREATE TABLE curriculum_lessons (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, level TEXT NOT NULL, module TEXT NOT NULL, title TEXT NOT NULL, raga TEXT NOT NULL DEFAULT '', tala TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', batch_id UUID, published BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,batch_id) REFERENCES batches(school_id,id)
);
CREATE TABLE media_assets (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, owner_id UUID NOT NULL REFERENCES accounts(id), learner_id UUID, lesson_id UUID, filename TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 52428800), status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','ready','failed')), chunks INTEGER NOT NULL CHECK(chunks BETWEEN 1 AND 200), duration_ms INTEGER, sha256 TEXT, storage_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id), FOREIGN KEY(school_id,lesson_id) REFERENCES curriculum_lessons(school_id,id), CHECK(duration_ms IS NULL OR duration_ms>0)
);
CREATE TABLE media_chunks (
 school_id UUID NOT NULL, asset_id UUID NOT NULL, part INTEGER NOT NULL CHECK(part>=0), sha256 TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>0), PRIMARY KEY(school_id,asset_id,part), FOREIGN KEY(school_id,asset_id) REFERENCES media_assets(school_id,id)
);
CREATE TABLE practice_tasks (
 school_id UUID NOT NULL, id UUID NOT NULL, learner_id UUID NOT NULL, lesson_id UUID NOT NULL, text TEXT NOT NULL, due_on DATE NOT NULL, completed_at TIMESTAMPTZ, PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id), FOREIGN KEY(school_id,lesson_id) REFERENCES curriculum_lessons(school_id,id)
);
