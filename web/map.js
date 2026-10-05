const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const K=CANDS.length, COLS=CANDS.map((c,i)=>css(i<K-1?`--c${i}`:"--c5"));
const NAME=Object.fromEntries(CANDS.filter(c=>c.k).map(c=>[c.k,c.n]));
const title=s=>s.toLowerCase().replace(/(^|\s)\S/g,m=>m.toUpperCase());
const natTot=d3.sum(CANDS,c=>c.v);
const pct=(v,t)=>(100*v/t).toFixed(1)+'%';
const fmt=d3.format(",");
let focus=-1, repaint=()=>{};

// results panel: same dot language as the map, one dot per million votes
const list=d3.select("#cands");
CANDS.forEach((c,i)=>{
 const b=list.append("button").attr("class","cand").attr("aria-pressed","false").style("--c",COLS[i]);
 b.append("div").attr("class","row").html(`<span class="nm">${c.n}</span><span class="pc">${pct(c.v,natTot)}</span>`);
 b.append("div").attr("class","vt").text(`${fmt(c.v)} votes`);
 if(c.who)b.append("div").attr("class","who").text(c.who.join(", "));
 const m=c.v/1e6, gr=b.append("div").attr("class","grains");
 for(let j=0;j<Math.ceil(m);j++)gr.append("i").classed("part",j>=Math.floor(m)&&m%1<.5);
 const set=on=>{focus=on?i:-1;list.selectAll(".cand").attr("aria-pressed",(_,j)=>String(j===focus));
  d3.select("#page").classed("focus",focus>=0);repaint();};
 b.on("mouseenter",()=>set(true)).on("mouseleave",()=>set(false)).on("click",()=>set(focus!==i));
});

const proj=d3.geoMercator(), path=d3.geoPath(proj);
const svg=d3.select("#map"), tip=d3.select("#tip"), g=svg.append("g");
const mu=g.append("g").selectAll("path").data(MG.features).join("path").attr("class","mu")
 .on("mousemove",(e,f)=>{const m=M[f.properties.codarea];if(!m)return;
  tip.style("opacity",1).style("left",Math.min(e.clientX+16,innerWidth-240)+"px").style("top",Math.min(e.clientY+16,innerHeight-160)+"px")
  .html(`<b>${m.n}, ${m.uf}</b>`+m.v.map(([n,v])=>`<div class="l"><span>${NAME[n]||title(n)}</span><span>${pct(v,m.t)}</span></div>`).join("")+`<div class="t">${fmt(m.t)} valid votes</div>`);})
 .on("mouseenter",(e,f)=>hl.datum(f).attr("d",path).style("display",null))
 .on("mouseleave",()=>{tip.style("opacity",0);hl.style("display","none");})
 .on("click",(e,f)=>{e.stopPropagation();select(sel===f?null:f);})
 .on("dblclick",(e,f)=>{e.stopPropagation();select(f,true);}); // double click: select and zoom to it
const uf=g.append("g").selectAll("path").data(SG.features).join("path").attr("class","uf");
// Brazil's outer border: every state outline stroked once, masked to outside the country so the internal
// state borders vanish and only a light halo around the coast and frontier remains
const outer=g.append("path").attr("class","outer").attr("mask","url(#outside)");
const msk=svg.append("defs").append("mask").attr("id","outside").attr("maskUnits","userSpaceOnUse").attr("x",-1e5).attr("y",-1e5).attr("width",2e5).attr("height",2e5);
msk.append("rect").attr("x",-1e5).attr("y",-1e5).attr("width",2e5).attr("height",2e5).attr("fill","#fff");
const mskIn=msk.append("path").attr("fill","#000");
// hover and selection outlines live above every border so neighbours never paint over them; click selects
// a municipality (click again to clear) and its outline stays at any zoom
let sel=null;const hl=g.append("path").attr("class","hl").style("display","none"),sl=g.append("path").attr("class","sel").style("display","none");

// the map fills its container: on load and on resize, refit the projection and reallocate the pixel buffers
const n=DOTS.length/3, P=new Float32Array(2*n), C=new Uint8Array(n);
for(let i=0;i<n;i++)C[i]=DOTS[3*i+2];
const cv=document.getElementById("cv"),dpr=devicePixelRatio||1,cx=cv.getContext("2d"),cc=COLS.map(h=>d3.rgb(h));
let w,h,W,H,img,px,T,O,TOP;
const PX=cc.map(c=>(c.b<<16|c.g<<8|c.r)>>>0); // candidate colours packed as little-endian RGB
function layout(){
 const r=document.getElementById("wrap").getBoundingClientRect();w=r.width;h=r.height;
 const pad=Math.min(w,h)*.05,lg=0;
 proj.fitExtent([[pad,pad],[w-pad,h-pad-24]],SG);
 svg.attr("viewBox",`0 0 ${w} ${h}`);mu.attr("d",path);uf.attr("d",path);outer.attr("d",path(SG));mskIn.attr("d",path(SG));if(typeof sl!=="undefined"&&sel)sl.attr("d",path);
 for(let i=0;i<n;i++){const [x,y]=proj([DOTS[3*i]/1000,DOTS[3*i+1]/1000]);P[2*i]=x;P[2*i+1]=y;}
 W=Math.round(w*dpr);H=Math.round(h*dpr);cv.width=W;cv.height=H;
 img=cx.createImageData(W,H);px=new Uint32Array(img.data.buffer);
 [T,O]=[0,0].map(()=>new Float32Array(W*H));TOP=new Uint8Array(W*H);
}
// Every dot exists at every zoom (as in Cable's Racial Dot Map).
// Zoomed out, many dots share a pixel: its opacity shows their coverage, its colour one of them (see add()).
// Zoomed in, the dots grow past a pixel and are drawn as discs. Nothing is added or removed.
// Dot radius grows as k^0.5 (CartoDB's women dot map grows ~k^0.83: 0.5px at z8 → 16px at z14), so dots
// per screen area fall by k² but each grows by k^1.5: coverage thins slowly instead of collapsing mid-zoom.
let R1=.32, STEP=1; // radius in css px at zoom 1 (dot-size control); draw every STEP-th dot (votes-per-dot control)
const GAMMA=.5, ALO=.4; // growth exponent, opacity of the sparsest pixels
function paint(t){
 const rd=R1*Math.pow(t.k,GAMMA)*dpr, sx=t.k*dpr,ox=t.x*dpr,oy=t.y*dpr, N=W*H, f=focus;
 T.fill(0);if(f>=0)O.fill(0);
 // T is total coverage per pixel (with a candidate in focus, only theirs; O holds everyone else's, drawn as
 // a faint grey trace). A pixel's colour is the last dot drawn on it, not the average: dots are shuffled, so
 // that is a random pick weighted by each candidate's share, and dense mixed places read as blue-and-orange
 // speckle (as in Cable's and CartoDB's maps) instead of averaging complementary hues into grey.
 const add=(j,c,a)=>{if(f<0||c===f){T[j]+=a;TOP[j]=c;}else O[j]+=a;};
 if(rd<1.2){const ar=Math.PI*rd*rd; // sub-pixel dots add their area to one pixel
  for(let i=0;i<n;i+=STEP){const x=(P[2*i]*sx+ox)|0,y=(P[2*i+1]*sx+oy)|0;
   if(x>=0&&x<W&&y>=0&&y<H)add(y*W+x,C[i],ar);}
 }else{const Rr=Math.ceil(rd),r2=rd*rd,off=[]; // larger dots add 1 to every pixel of a disc
  for(let dy=-Rr;dy<=Rr;dy++)for(let dx=-Rr;dx<=Rr;dx++)if(dx*dx+dy*dy<=r2)off.push(dx,dy);
  for(let i=0;i<n;i+=STEP){const X=(P[2*i]*sx+ox)|0,Y=(P[2*i+1]*sx+oy)|0;
   if(X<-Rr||X>=W+Rr||Y<-Rr||Y>=H+Rr)continue;const c=C[i];
   for(let q=0;q<off.length;q+=2){const x=X+off[q],y=Y+off[q+1];if(x>=0&&x<W&&y>=0&&y<H)add(y*W+x,c,1);}}
 }
 // histogram-equalised opacity (as in Datashader's eq_hist): pixels are ranked by coverage within the
 // current view, so a pixel with 50 overlapping dots reads denser than one with 5 instead of both saturating.
 // The ranking is sampled once into a 1024-step lookup table over log coverage.
 let m=0;const smp=new Float32Array(Math.ceil(N/7));for(let j=0;j<N;j+=7)if(T[j])smp[m++]=T[j];
 const S=smp.subarray(0,m).sort(),lo=Math.log(S[0]||1),sc=1023/Math.max(1e-6,Math.log(S[m-1]||1)-lo),LUT=new Uint8Array(1024);
 for(let b=0,i=0;b<1024;b++){const v=Math.exp(lo+b/sc);while(i<m&&S[i]<v)i++;LUT[b]=255*(ALO+(1-ALO)*i/Math.max(1,m));}
 const grey=(22<<24|150<<16|150<<8|150)>>>0;
 for(let j=0;j<N;j++){const v=T[j];
  if(!v){px[j]=f>=0&&O[j]?grey:0;continue;}
  let b=((Math.log(v)-lo)*sc)|0;b=b<0?0:b>1023?1023:b;
  px[j]=(LUT[b]<<24|PX[TOP[j]])>>>0;}
 cx.putImageData(img,0,0);
}
// paint during the gesture, at most once per animation frame (zoom events can arrive faster than frames)
let pending=null;
// unselected borders fade in to 0.1 by ~3x, then ease down to 0.06 by 20x: at mid zoom, sparse areas are mostly
// dark background and the lines would compete with the dots. From 20x they grow (to 0.4 opacity, 1.1px at 60x)
// so city limits read clearly up close.
const borderOpacity=k=>k<3?Math.max(0,Math.min(.1,(k-1.3)*.06)):k<20?Math.max(.06,.1-.04*Math.log(k/3)/Math.log(20/3)):Math.min(.4,.06+.34*Math.log(k/20)/Math.log(3));
const MAXK=400; // deep enough for the smallest municipalities to fill the screen
let lastK=1;const CLEARK=1.5;
const zoom=d3.zoom().scaleExtent([1,MAXK]).on("zoom",e=>{const t=e.transform;
 // zooming out by hand to near the whole-country view clears the selection
 if(sel&&e.sourceEvent&&t.k<lastK&&t.k<CLEARK)select(null);
 lastK=t.k;
 g.attr("transform",t);svg.style("--mu-o",borderOpacity(t.k)).style("--mu-w",t.k<20?.5:Math.min(1.1,.5+.6*Math.log(t.k/20)/Math.log(3)));
 if(!pending)requestAnimationFrame(()=>{paint(pending);pending=null;});pending=t;});

layout();svg.call(zoom.translateExtent([[0,0],[w,h]]));
// replace d3's double-click zoom-in: on a municipality it zooms to that municipality (handler above);
// anywhere outside Brazil it zooms back out to the whole country
svg.on("dblclick.zoom",null).on("dblclick",()=>{select(null);svg.transition().duration(750).call(zoom.transform,d3.zoomIdentity);});
// a selection clears on a click outside Brazil or on Escape anywhere (clicking the same municipality also toggles it)
svg.on("click",()=>select(null));
addEventListener("keydown",e=>{if(e.key==="Escape"&&e.target!==q)select(null);});
repaint=()=>paint(d3.zoomTransform(svg.node()));repaint();
// controls. Dots are shuffled, so keeping every STEP-th one is a random sample at STEP × __VPD__ votes per dot.
const STEPS=[1,2,4,10,20,40];let vpdTimer;
d3.select("#vpd").on("input",e=>{STEP=STEPS[+e.target.value];const v=fmt(STEP*__VPD__);d3.selectAll(".vpd").text(v);d3.select("#vpdv").text(v);
 clearTimeout(vpdTimer);vpdTimer=setTimeout(repaint,120);}); // repaint once the slider settles
d3.select("#rad").on("input",e=>{const m=2**+e.target.value;R1=.32*m;d3.select("#radv").text(m.toFixed(m<1?2:1).replace(/\.?0+$/,"")+"×");repaint();});
// selecting a municipality (by click or search) outlines it; from search it also zooms to it
function select(f,zoomTo){sel=f;if(!f&&typeof q!=="undefined")q.value="";sl.datum(f).attr("d",f?path:null).style("display",f?null:"none");
 if(f&&zoomTo){const [[x0,y0],[x1,y1]]=path.bounds(f),k=Math.min(MAXK,.9/Math.max((x1-x0)/w,(y1-y0)/h));
  svg.transition().duration(750).call(zoom.transform,d3.zoomIdentity.translate(w/2,h/2).scale(k).translate(-(x0+x1)/2,-(y0+y1)/2));}}

// municipality search: accent- and case-insensitive; prefix matches first, then substring matches, each by size
const fold=t=>t.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const index=MG.features.filter(f=>M[f.properties.codarea]).map(f=>{const m=M[f.properties.codarea];return {f,label:m.n,uf:m.uf,key:fold(m.n),t:m.t};}).sort((a,b)=>b.t-a.t); // bigger municipalities first
const q=document.getElementById("q"),ql=d3.select("#qlist");let hits=[],cur=-1;
function show(){const t=fold(q.value.trim());
 hits=t?[...index.filter(d=>d.key.startsWith(t)),...index.filter(d=>!d.key.startsWith(t)&&d.key.includes(t))].slice(0,8):[];cur=hits.length?0:-1;
 ql.attr("hidden",t?null:true);q.setAttribute("aria-expanded",String(!!t));
 ql.selectAll("li").data(hits.length?hits:t?[null]:[]).join("li").attr("id",(d,i)=>"q"+i)
  .attr("role",d=>d?"option":null).attr("class",d=>d?null:"none")
  .html(d=>d?`${d.label}<span>${d.uf}</span>`:"No municipality found")
  .on("mousedown",(e,d)=>{if(d){e.preventDefault();pick(d);}});mark();}
function mark(){ql.selectAll("li").attr("aria-selected",(d,i)=>String(i===cur));
 q.setAttribute("aria-activedescendant",cur>=0?"q"+cur:"");if(cur>=0)document.getElementById("q"+cur)?.scrollIntoView({block:"nearest"});}
function pick(d){q.value=`${d.label}, ${d.uf}`;ql.attr("hidden",true);q.setAttribute("aria-expanded","false");select(d.f,true);}
q.addEventListener("input",show);
q.addEventListener("keydown",e=>{
 if(e.key==="ArrowDown"||e.key==="ArrowUp"){if(!hits.length)return;e.preventDefault();cur=(cur+(e.key==="ArrowDown"?1:hits.length-1))%hits.length;mark();}
 else if(e.key==="Enter"&&cur>=0){e.preventDefault();pick(hits[cur]);}
 else if(e.key==="Escape"){q.value="";show();select(null);}});
q.addEventListener("blur",()=>setTimeout(()=>{ql.attr("hidden",true);q.setAttribute("aria-expanded","false");},100));
let rz;addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{layout();zoom.translateExtent([[0,0],[w,h]]);
 svg.call(zoom.transform,d3.zoomIdentity);},150);});
