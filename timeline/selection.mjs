// Only view selection IDs are persisted. Native authority/data never come from here.
const selectionMemory=new Map();
export const selectionKey=(identity,context,kind)=>'orca.timeline.selection.v1:'+JSON.stringify([identity?.id,identity?.instanceId,context?.runId,context?.taskId,kind,...(identity?.environmentId&&identity.environmentId!=='local'?[identity.environmentId]:[])]);
export function readSelection(key){try{return JSON.parse(sessionStorage.getItem(key))??selectionMemory.get(key);}catch{return selectionMemory.get(key);}}
export function saveSelection(key,value){selectionMemory.set(key,value);try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}}
