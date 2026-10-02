-- Preserve existing lesson order when introducing block ordering.
UPDATE curriculum_lessons l SET block_position=(SELECT min(x.position) FROM curriculum_lessons x WHERE x.school_id=l.school_id AND x.curriculum=l.curriculum AND x.module=l.module);
