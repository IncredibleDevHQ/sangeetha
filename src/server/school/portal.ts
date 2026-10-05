import { SchoolAccess, type Context } from "./shared";
export class PortalService extends SchoolAccess {
  async view(c: Context) {
    const ids = (
      await this.db.query(
        "SELECT resource_id FROM school_grants WHERE school_id=$1 AND account_id=$2 AND capability='portal.learn' AND resource_type='learner' AND revoked_at IS NULL",
        [c.schoolId, c.session.accountId],
      )
    ).rows.map((g) => g.resource_id);
    const batchIds = (
      await this.db.query(
        "SELECT resource_id FROM school_grants WHERE school_id=$1 AND account_id=$2 AND capability='classes.teach' AND resource_type='batch' AND revoked_at IS NULL",
        [c.schoolId, c.session.accountId],
      )
    ).rows.map((g) => g.resource_id);
    return {
      recordings: (
        await this.db.query(
          "SELECT id,learner_id,filename,duration_ms,created_at FROM media_assets WHERE school_id=$1 AND learner_id=ANY($2::uuid[]) AND owner_id=$3 AND status='ready'",
          [c.schoolId, ids, c.session.accountId],
        )
      ).rows,
      attendance: (
        await this.db.query(
          "SELECT a.*,o.starts_at,b.name AS batch_name FROM attendance a JOIN class_occurrences o ON o.school_id=a.school_id AND o.id=a.occurrence_id JOIN batches b ON b.school_id=o.school_id AND b.id=o.batch_id WHERE a.school_id=$1 AND a.learner_id=ANY($2::uuid[])",
          [c.schoolId, ids],
        )
      ).rows,
      learners: (
        await this.db.query(
          "SELECT l.*,p.name FROM learners l JOIN people p ON p.school_id=l.school_id AND p.id=l.person_id WHERE l.school_id=$1 AND l.id=ANY($2::uuid[])",
          [c.schoolId, ids],
        )
      ).rows,
      classes: (
        await this.db.query(
          "SELECT DISTINCT o.id,o.batch_id,o.teacher_id,o.starts_at,o.ends_at,o.status,o.location,CASE WHEN o.batch_id=ANY($3::uuid[]) THEN o.notes ELSE NULL END AS teaching_notes,ARRAY(SELECT e.learner_id FROM enrollments e WHERE e.school_id=o.school_id AND e.batch_id=o.batch_id AND e.learner_id=ANY($2::uuid[]) AND e.status='active') AS learner_ids,b.name AS batch_name FROM class_occurrences o JOIN batches b ON b.school_id=o.school_id AND b.id=o.batch_id WHERE o.school_id=$1 AND (o.batch_id=ANY($3::uuid[]) OR EXISTS(SELECT 1 FROM enrollments e WHERE e.school_id=o.school_id AND e.batch_id=o.batch_id AND e.learner_id=ANY($2::uuid[]) AND e.status='active')) ORDER BY starts_at",
          [c.schoolId, ids, batchIds],
        )
      ).rows,
      teachingLearners: (
        await this.db.query(
          "SELECT l.id,p.name,e.batch_id FROM learners l JOIN people p ON p.school_id=l.school_id AND p.id=l.person_id JOIN enrollments e ON e.school_id=l.school_id AND e.learner_id=l.id WHERE l.school_id=$1 AND e.batch_id=ANY($2::uuid[]) AND e.status='active'",
          [c.schoolId, batchIds],
        )
      ).rows,
      teachingAttendance: (
        await this.db.query(
          "SELECT a.* FROM attendance a JOIN class_occurrences o ON o.school_id=a.school_id AND o.id=a.occurrence_id WHERE a.school_id=$1 AND o.batch_id=ANY($2::uuid[])",
          [c.schoolId, batchIds],
        )
      ).rows,
      teachingEnrollments: (
        await this.db.query(
          "SELECT l.id,p.name,e.batch_id,e.starts_on,e.ends_on FROM learners l JOIN people p ON p.school_id=l.school_id AND p.id=l.person_id JOIN enrollments e ON e.school_id=l.school_id AND e.learner_id=l.id WHERE l.school_id=$1 AND e.batch_id=ANY($2::uuid[])",
          [c.schoolId, batchIds],
        )
      ).rows,
      tests: (
        await this.db.query(
          "SELECT a.*,t.learner_id FROM assessments a JOIN assessment_targets t ON t.school_id=a.school_id AND t.assessment_id=a.id WHERE a.school_id=$1 AND a.published AND t.learner_id=ANY($2::uuid[])",
          [c.schoolId, ids],
        )
      ).rows,
      submissions: (
        await this.db.query(
          "SELECT v.id,v.assessment_id,v.learner_id,v.version,v.asset_ids,v.created_at,v.review_published_at,CASE WHEN v.review_published_at IS NOT NULL THEN v.scores ELSE NULL END AS scores,a.title FROM submission_versions v JOIN assessments a ON a.school_id=v.school_id AND a.id=v.assessment_id WHERE v.school_id=$1 AND v.learner_id=ANY($2::uuid[]) ORDER BY v.created_at DESC",
          [c.schoolId, ids],
        )
      ).rows,
      practice: (
        await this.db.query(
          "SELECT * FROM practice_tasks WHERE school_id=$1 AND learner_id=ANY($2::uuid[])",
          [c.schoolId, ids],
        )
      ).rows,
      consents: (
        await this.db.query(
          "SELECT * FROM dataset_consents WHERE school_id=$1 AND learner_id=ANY($2::uuid[])",
          [c.schoolId, ids],
        )
      ).rows,
      households: (
        await this.db.query(
          "SELECT h.* FROM households h JOIN school_grants g ON g.school_id=h.school_id AND g.resource_id=h.id WHERE g.school_id=$1 AND g.account_id=$2 AND g.capability='household.billing' AND g.revoked_at IS NULL",
          [c.schoolId, c.session.accountId],
        )
      ).rows,
      teachingBatches: (
        await this.db.query(
          "SELECT * FROM batches WHERE school_id=$1 AND id=ANY($2::uuid[])",
          [c.schoolId, batchIds],
        )
      ).rows,
    };
  }
}
