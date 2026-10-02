ALTER TABLE curriculum_lessons ADD COLUMN curriculum TEXT NOT NULL DEFAULT 'Lesson library';
ALTER TABLE curriculum_lessons ADD COLUMN position INTEGER NOT NULL DEFAULT 1 CHECK(position>0);
ALTER TABLE curriculum_lessons ADD COLUMN music_notes TEXT NOT NULL DEFAULT '';
CREATE INDEX curriculum_lesson_order ON curriculum_lessons(school_id,curriculum,position,created_at);
CREATE TABLE lesson_progress (
 school_id UUID NOT NULL, learner_id UUID NOT NULL, lesson_id UUID NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(school_id,learner_id,lesson_id), FOREIGN KEY(school_id,learner_id) REFERENCES learners(school_id,id), FOREIGN KEY(school_id,lesson_id) REFERENCES curriculum_lessons(school_id,id)
);
