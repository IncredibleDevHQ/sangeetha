CREATE TABLE assessment_taxonomies (
 school_id UUID NOT NULL REFERENCES schools(id), version INTEGER NOT NULL, labels JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,version)
);
CREATE TABLE assessments (
 school_id UUID NOT NULL REFERENCES schools(id), id UUID NOT NULL, title TEXT NOT NULL, instructions TEXT NOT NULL, rubric JSONB NOT NULL, due_at TIMESTAMPTZ NOT NULL, taxonomy_version INTEGER NOT NULL, published BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,taxonomy_version) REFERENCES assessment_taxonomies(school_id,version)
);
CREATE TABLE assessment_targets (
 school_id UUID NOT NULL, assessment_id UUID NOT NULL, learner_id UUID NOT NULL, PRIMARY KEY(school_id,assessment_id,learner_id), FOREIGN KEY(school_id,assessment_id) REFERENCES assessments(school_id,id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id)
);
CREATE TABLE submission_versions (
 school_id UUID NOT NULL, id UUID NOT NULL, assessment_id UUID NOT NULL, learner_id UUID NOT NULL, version INTEGER NOT NULL CHECK(version>0), asset_ids UUID[] NOT NULL CHECK(cardinality(asset_ids)>0), submitted_by UUID NOT NULL REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), review_published_at TIMESTAMPTZ, published_by UUID REFERENCES accounts(id), PRIMARY KEY(school_id,id), UNIQUE(school_id,assessment_id,learner_id,version), FOREIGN KEY(school_id,assessment_id) REFERENCES assessments(school_id,id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id)
);
CREATE TABLE annotations (
 school_id UUID NOT NULL, id UUID NOT NULL, submission_id UUID NOT NULL, asset_id UUID NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('point','interval')), start_ms INTEGER NOT NULL CHECK(start_ms>=0), end_ms INTEGER, label TEXT NOT NULL, comment TEXT NOT NULL, exercise TEXT NOT NULL, taxonomy_version INTEGER NOT NULL, reviewer_id UUID NOT NULL REFERENCES accounts(id), verified_by UUID REFERENCES accounts(id), verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,id), FOREIGN KEY(school_id,submission_id) REFERENCES submission_versions(school_id,id), FOREIGN KEY(school_id,asset_id) REFERENCES media_assets(school_id,id), FOREIGN KEY(school_id,taxonomy_version) REFERENCES assessment_taxonomies(school_id,version), CHECK((kind='point' AND end_ms IS NULL) OR (kind='interval' AND end_ms>start_ms))
);
CREATE TABLE dataset_consents (
 school_id UUID NOT NULL, learner_id UUID NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('recording-reuse','label-export')), allowed BOOLEAN NOT NULL, provided_by UUID NOT NULL REFERENCES accounts(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,learner_id,purpose), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id)
);
