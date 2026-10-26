// Electron display coordinates are already DPI-independent; retain negative origins.
function overlayBounds(monitor,{expanded=false,centered=false,clockOnly=false,contentHeight=160,position='top'}={}){
 if(expanded)return {...monitor.bounds};
 const area=monitor.workArea,margin=Math.min(12,Math.floor(Math.min(area.width,area.height)/8));
 const width=Math.min(clockOnly?180:area.width-2*margin,area.width-2*margin);
 const height=Math.min(Math.max(clockOnly?66:100,Math.ceil(contentHeight)),area.height-2*margin);
 return {x:Math.round(area.x+(area.width-width)/2),y:Math.round(centered?area.y+(area.height-height)/2:position==='bottom'?area.y+area.height-height-margin:area.y+margin),width:Math.round(width),height:Math.round(height)};
}
module.exports={overlayBounds};
