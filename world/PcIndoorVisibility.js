// PC ZzzObject.cpp MoveObject; _enum.h HouseWall01=121; Alpha default disabled.
export function pcIndoorObject(world, serial) {
 return world===1 ? serial===125||serial===126 : world===3 && [81,82,96,98,99].includes(serial);
}
export function pcIndoorAlphaTarget(world, serial, tile) {
 if(!pcIndoorObject(world,serial))return 1;
 return world===1 ? (tile===4?0:1) : (tile===3||tile>=10?0:1);
}
export function pcTerrainTileAt(mapping,x,z) {
 const xi=Math.floor((x+12800)/100)&255,yi=Math.floor((12800-z)/100)&255;
 return mapping?.layer1?.[yi*256+xi]??null;
}
export function stepPcIndoorAlpha(alpha,target,ticks) {
 return target+(alpha-target)*Math.pow(.9,Math.max(0,ticks));
}
