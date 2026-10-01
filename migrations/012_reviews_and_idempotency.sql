ALTER TABLE import_runs ADD COLUMN fingerprint TEXT;
ALTER TABLE submission_versions ADD COLUMN scores JSONB NOT NULL DEFAULT '{}';
CREATE INDEX enrollment_household ON enrollments(school_id,household_id,status);
CREATE INDEX attendance_learner ON attendance(school_id,learner_id);
CREATE INDEX submission_learner ON submission_versions(school_id,learner_id);
CREATE INDEX pending_communications ON communications(status,due_at);
