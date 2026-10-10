-- Teachers can mark a learner as late. A late learner still attended the class.
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check CHECK (status IN ('present','late','absent','excused'));
