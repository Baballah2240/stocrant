import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {overlayBounds}=createRequire(import.meta.url)('../desktop/bounds.cjs');
test('overlay fits landscape, portrait, small and negative-origin Windows displays',()=>{
 for(const [x,y,width,height] of [[0,0,1920,1080],[0,0,1366,768],[-1080,0,1080,1920],[1920,-900,1600,900],[0,0,640,480],[0,0,320,240]]){
  const monitor={bounds:{x,y,width,height},workArea:{x,y,width,height:height-40}},area=monitor.workArea;
  assert.deepEqual(overlayBounds(monitor,{expanded:true}),monitor.bounds);
  for(const mode of [{},{position:'bottom'},{centered:true},{clockOnly:true},{contentHeight:2000},{horizontal:'left',clockOnly:true,edgeMargin:120},{horizontal:'right',clockOnly:true,edgeMargin:60}]){
   const b=overlayBounds(monitor,mode);assert.ok(b.width>0&&b.height>0);assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);
   if(mode.clockOnly)assert.ok(b.width<=180);
   if(mode.centered)assert.ok(Math.abs(b.y+b.height/2-(area.y+area.height/2))<=1);
  }
 }
});
