// Pure 8x8 occupancy projection. Wire slots retain top-left anchors (12..75).
export function projectInventoryGrid(slots,attributes){
  const cells=new Int16Array(64).fill(-1),placements=new Map(),errors=[];
  for(let anchor=12;anchor<76;anchor++){
    const item=slots[anchor];if(!item)continue;
    const dim=attributes?.get(item.itemType);
    if(!dim||!Number.isInteger(dim.width)||!Number.isInteger(dim.height)||dim.width<1||dim.height<1||dim.width>8||dim.height>8){errors.push({anchor,reason:'missing-dimensions'});continue;}
    const x=(anchor-12)%8,y=Math.floor((anchor-12)/8);
    if(x+dim.width>8||y+dim.height>8){errors.push({anchor,reason:'bounds'});continue;}
    const indices=[];
    for(let dy=0;dy<dim.height;dy++)for(let dx=0;dx<dim.width;dx++)indices.push((y+dy)*8+x+dx);
    if(indices.some(i=>cells[i]!==-1)){errors.push({anchor,reason:'overlap'});continue;}
    for(const i of indices)cells[i]=anchor;
    placements.set(anchor,{anchor,x,y,width:dim.width,height:dim.height});
  }
  return {cells,placements,errors,valid:errors.length===0};
}
export function canPlaceInventoryItem(grid,attributes,type,destination,source=-1){
  if(!grid?.valid||!Number.isInteger(destination)||destination<12||destination>=76)return false;
  const dim=attributes?.get(type);if(!dim||!Number.isInteger(dim.width)||!Number.isInteger(dim.height)||dim.width<1||dim.height<1||dim.width>8||dim.height>8)return false;
  const x=(destination-12)%8,y=Math.floor((destination-12)/8);
  if(x+dim.width>8||y+dim.height>8)return false;
  for(let dy=0;dy<dim.height;dy++)for(let dx=0;dx<dim.width;dx++){
    const owner=grid.cells[(y+dy)*8+x+dx];if(owner!==-1&&owner!==source)return false;
  }
  return true;
}
