-- A learner, or their family, can log a day of practice on their own. One entry per day, and it grows their tulsi.
CREATE TABLE practice_log (
 school_id UUID NOT NULL, learner_id UUID NOT NULL, practised_on DATE NOT NULL, logged_by UUID NOT NULL REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,learner_id,practised_on), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id)
);
