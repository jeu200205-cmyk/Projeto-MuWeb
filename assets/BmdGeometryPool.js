import * as THREE from 'three';

// Identity is the actual immutable parsed mesh, never a path/type/filename.
// Different Data authorities or composed player binds produce different keys.
const records=new WeakMap();
const pooled=new WeakSet();

export function isSharedBmdGeometry(geometry){return pooled.has(geometry)}

export function acquireBmdGeometry(meshData) {
  let record=records.get(meshData);
  const reused=Boolean(record);
  if(!record) {
    const geometry=new THREE.BufferGeometry();
    try {
      geometry.setAttribute('position',new THREE.BufferAttribute(meshData.positions,3));
      geometry.setAttribute('normal',new THREE.BufferAttribute(meshData.normals,3));
      geometry.setAttribute('uv',new THREE.BufferAttribute(meshData.uvs,2));
      geometry.setAttribute('skinIndex',new THREE.BufferAttribute(meshData.skinIndices,4));
      const normalNodes=meshData.normalSkinIndices || Float32Array.from({length:meshData.positions.length/3},(_,i)=>meshData.skinIndices[i*4]);
      geometry.setAttribute('normalSkinIndex',new THREE.BufferAttribute(normalNodes,1));
      geometry.setAttribute('skinWeight',new THREE.BufferAttribute(meshData.skinWeights,4));
      geometry.setIndex(new THREE.BufferAttribute(meshData.indices,1));
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
    }catch(e){geometry.dispose();throw e}
    record={geometry,refs:0};records.set(meshData,record);pooled.add(geometry);
  }
  record.refs++;
  let released=false;
  return {geometry:record.geometry,reused,release(){
    if(released)return;
    released=true;
    if(--record.refs===0){
      records.delete(meshData);pooled.delete(record.geometry);
      if(meshData._geometry===record.geometry)delete meshData._geometry;
      record.geometry.dispose();
    }
  }};
}
