import {randomUUID} from 'node:crypto';
import {AccessError,type Session} from '../admin-service';
import type {Database,Executor} from '../db';
export type Context={schoolId:string;session:Session};
export const ops=['crm.manage','schedule.manage','curriculum.manage','assessments.manage','events.manage','reports.read','communicate.manage'];
export const grants=['classes.teach','assessments.review','portal.learn','household.billing','finance.manage'];
export async function activity(tx:Executor,c:Context,action:string,details:Record<string,unknown>={}){await tx.query('INSERT INTO audit_events(id,school_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),c.schoolId,c.session.accountId,action,JSON.stringify(details)]);}
export class SchoolAccess {
 constructor(readonly db:Database){}
 async can(c:Context,cap:string,type='school',id=c.schoolId){
 const m=await this.db.query<{role:string}>('SELECT role FROM memberships WHERE school_id=$1 AND account_id=$2 AND revoked_at IS NULL',[c.schoolId,c.session.accountId]);
 if(m.rows[0]?.role==='owner'||(m.rows[0]?.role==='admin' && ops.includes(cap)))return true;
 const r=await this.db.query('SELECT id FROM school_grants WHERE school_id=$1 AND account_id=$2 AND capability=$3 AND resource_type=$4 AND resource_id=$5 AND revoked_at IS NULL',[c.schoolId,c.session.accountId,cap,type,id]);return !!r.rows.length;
 }
 async require(c:Context,cap:string,type='school',id=c.schoolId){if(!await this.can(c,cap,type,id))throw new AccessError('You do not have permission for this school resource.');}
 async exists(tx:Executor,c:Context,table:string,id:string){const allowed=['households','people','learners','batches','enrollments','class_occurrences','charges','payments','curriculum_lessons','media_assets','assessments','submission_versions','school_events'];if(!allowed.includes(table))throw Error('Invalid resource type');const r=await tx.query(`SELECT id FROM ${table} WHERE school_id=$1 AND id=$2`,[c.schoolId,id]);if(!r.rows.length)throw new AccessError('School resource not found.',404);}
 async capabilities(c:Context){const candidates=[...ops,...grants,'reviews.publish','dataset.export','team.manage'];const result:string[]=[];for(const cap of candidates){if(cap==='team.manage'){const r=await this.db.query("SELECT role FROM memberships WHERE school_id=$1 AND account_id=$2 AND role='owner' AND revoked_at IS NULL",[c.schoolId,c.session.accountId]);if(r.rows.length)result.push(cap);}else if(await this.can(c,cap))result.push(cap);}return result;}
}
export function positiveAmount(v:number){if(!Number.isSafeInteger(v)||v<=0||v>1_000_000_000)throw new AccessError('Enter an amount in whole paise.',400);return v;}
