// PcJointPool.js — process-wide retained JOINT slot authority for map/world FX.
// Mirrors the desktop invariant that joint behavior may depend on the actual
// slot occupied in the global JOINT pool. Content/rendering stays in each owner.
const slots=[];
const free=[];
let live=0;
export function acquirePcJointSlot(owner='unknown'){
  const index=free.length?free.shift():slots.length;
  const token=Object.seal({index,owner:String(owner),released:false});
  slots[index]=token;live++;
  return token;
}
export function releasePcJointSlot(token){
  if(!token||token.released)return false;
  const i=token.index|0;if(slots[i]!==token)return false;
  token.released=true;slots[i]=null;live--;
  let p=0;while(p<free.length&&free[p]<i)p++;if(free[p]!==i)free.splice(p,0,i);
  while(slots.length&&slots[slots.length-1]===null){const tail=slots.length-1;slots.pop();const q=free.indexOf(tail);if(q>=0)free.splice(q,1);}
  return true;
}
export function pcJointPoolStats(){return Object.freeze({live,capacity:slots.length,free:free.length});}
