ALTER TABLE curriculum_lessons ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE curriculum_lessons ADD COLUMN category_position INTEGER NOT NULL DEFAULT 1 CHECK(category_position>0);
ALTER TABLE curriculum_lessons ADD COLUMN block_position INTEGER NOT NULL DEFAULT 1 CHECK(block_position>0);
CREATE INDEX curriculum_sections ON curriculum_lessons(school_id,curriculum,category_position,category,block_position,module,position);
