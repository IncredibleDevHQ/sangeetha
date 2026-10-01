import type { Database } from './db';
import { AccessError } from './admin-service';
export type Tenant={id:string;name:string;slug:string};
const reserved=['app','auth','api','www','admin','static','staging','mail'];
export function schoolSlug(value:string){const slug=value.trim().toLowerCase();if(!/^[a-z][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)||reserved.includes(slug))throw new AccessError('Use a school subdomain of 3–50 letters, numbers or hyphens.',400);return slug;}
export class TenantResolver {
 constructor(private db:Database,private root=process.env.TENANT_ROOT_DOMAIN){}
 async resolve(host:string):Promise<Tenant|null>{
  const hostname=host.toLowerCase().split(':')[0];
  if(!this.root){if(process.env.NODE_ENV==='production')throw Error('TENANT_ROOT_DOMAIN is required.');if(['localhost','127.0.0.1'].includes(hostname))return null;throw new AccessError('Unknown workspace host.',404);}
  const root=this.root.toLowerCase();
  if(hostname===root||hostname==='app.'+root)return null;
  if(!hostname.endsWith('.'+root))throw new AccessError('Unknown workspace host.',404);
  const slug=hostname.slice(0,-root.length-1);if(slug.includes('.'))throw new AccessError('Unknown workspace host.',404);
  schoolSlug(slug);
  const r=await this.db.query<Tenant>('SELECT id,name,slug FROM schools WHERE slug=$1',[slug]);
  if(!r.rows.length)throw new AccessError('School workspace not found.',404);return r.rows[0];
 }
 assert(tenant:Tenant|null,schoolId:string){if(tenant&&tenant.id!==schoolId)throw new AccessError('This resource belongs to a different school.',403);}
}
