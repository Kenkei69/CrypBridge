import {EventEmitter} from 'node:events';
export const realtime=new EventEmitter();
export const refreshClients=()=>realtime.emit('refresh');
