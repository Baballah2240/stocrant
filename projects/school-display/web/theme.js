const dark=matchMedia('(prefers-color-scheme: dark)');let current={};
export function applyTheme(settings={}){
 current=settings;const accent=/^#[a-f0-9]{6}$/i.test(settings.themeAccent)?settings.themeAccent:'#007aff',rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16));
 const luminance=rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
 const root=document.documentElement;root.style.setProperty('--accent',accent);root.style.setProperty('--accent-rgb',rgb.join(','));root.style.setProperty('--on-accent',luminance>.183?'#101827':'#ffffff');root.style.setProperty('--panel-opacity',String((settings.panelOpacity||72)/100));root.style.setProperty('--panel-rgb',settings.panelTheme==='accent'?rgb.map(n=>Math.round(n*.35)).join(','):'28,29,33');
 root.dataset.theme=settings.themeMode==='dark'||settings.themeMode==='system'&&dark.matches?'dark':'light';
}
dark.addEventListener('change',()=>applyTheme(current));
