/**
 * Main 5.2 / ZzzObject.cpp / WD_10HEAVEN source contract.
 * `serial` is the zero-based Object11 type from EncTerrain11.obj.
 */
export function pcIcarusCloudControllerContract(serial){
  const t=serial|0;
  if(t<0||t>5)return null;
  return Object.freeze({subtype:t,count:t<=2?20:10,hiddenMesh:-2,bitmap:'Effect/clouds.OZJ',light:Object.freeze([.1,.1,.1])});
}
export function pcIcarusSourceHidden(serial){return !!pcIcarusCloudControllerContract(serial);}
