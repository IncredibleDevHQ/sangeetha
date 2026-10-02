ALTER TABLE media_assets ADD COLUMN note_cues jsonb NOT NULL DEFAULT '[]'::jsonb;
