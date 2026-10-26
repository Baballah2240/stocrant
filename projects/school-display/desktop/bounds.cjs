// Electron display coordinates are already DPI-independent; retain negative origins.
function overlayBounds(monitor,{expanded=false,centered=false,clockOnly=false,contentHeight=160,position='top',horizontal='center',edgeMargin=12}={}){
 if(expanded)return {...monitor.bounds};
 const area=monitor.workArea,margin=Math.min(Math.max(0,edgeMargin-12),Math.floor(Math.min(area.width,area.height)/8));
 const width=Math.min(clockOnly?144:area.width-2*margin,area.width-2*margin);
 const height=Math.min(Math.max(clockOnly?66:100,Math.ceil(contentHeight)),area.height-2*margin);
 const x=clockOnly&&!centered&&horizontal==='left'?area.x+margin:clockOnly&&!centered&&horizontal==='right'?area.x+area.width-width-margin:area.x+(area.width-width)/2;
 return {x:Math.round(x),y:Math.round(centered?area.y+(area.height-height)/2:position==='bottom'?area.y+area.height-height-margin:area.y+margin),width:Math.round(width),height:Math.round(height)};
}
module.exports={overlayBounds};
