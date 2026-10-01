import { spawn } from 'node:child_process';
const children=['dev:api','dev:web'].map(script=>spawn('npm',['run',script],{stdio:'inherit',env:{...process.env,AUTH_MODE:process.env.AUTH_MODE || 'local'}}));
function stop(){children.forEach(p=>p.kill());}
process.on('SIGINT',stop);process.on('SIGTERM',stop);children.forEach(p=>p.on('exit',stop));
