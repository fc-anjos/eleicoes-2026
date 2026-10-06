const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// colour categories are shared by both years (see categories() in build.py): candidates keyed by ballot number, so
// a camp keeps its colour from one year to the other, then "Others", then abstentions (AB)
const COLS=CATS.map(c=>css("--"+c.col)), AB=CATS.length-1, YS=Object.keys(YEARS).sort().reverse();
const pct=(v,t)=>(100*v/t).toFixed(1)+'%';
const fmt=d3.format(",");
let focus=-1, repaint=()=>{}, YEAR=YS[0];
const nameOf=(y,k)=>YEARS[y].names[k]||k;
const electorate=y=>d3.sum(YEARS[y].cands,c=>c.v)+YEARS[y].a+YEARS[y].bn;

// Display state, per category: visible or hidden, and its colour (the studio controls in each panel row). Colours
// start from the CSS tokens; changes and hidden rows are remembered in this browser.
const HID=new Uint8Array(CATS.length);
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
{const c=store.get("cols"),hd=store.get("hid");if(c&&c.length===COLS.length)c.forEach((v,i)=>{if(/^#[0-9a-f]{6}$/i.test(v))COLS[i]=v;});
 if(hd&&hd.length===HID.length)HID.set(hd);}
let PX=[];const packCols=()=>{PX=COLS.map(h=>{const c=d3.rgb(h);return (c.b<<16|c.g<<8|c.r)>>>0;});}; // little-endian RGB
packCols();

// results panel: same dot language as the map, one dot per million. Abstention is ranked among the candidates by
// head count (in both years it's third, behind only the two leaders); its share is of everyone on the roll, the
// candidates' of valid votes, as TSE reports them. "Others" stays last.
const list=d3.select("#cands");
function panel(){
 const Y=YEARS[YEAR],valid=d3.sum(Y.cands,c=>c.v);
 d3.select("#date").text(Y.date);
 list.selectAll(".cand").remove();
 const rows=[{n:"Didn't vote",v:Y.a,i:AB,share:pct(Y.a,electorate(YEAR)),unit:"people on the roll didn't vote",abst:true},
  ...Y.cands.map(c=>({...c,share:pct(c.v,valid),unit:"votes"}))].sort((a,b)=>(a.k==="")-(b.k==="")||b.v-a.v);
 rows.forEach(c=>{const i=c.i;
  const r=list.append("div").datum(c).attr("class","cand").classed("ab",!!c.abst).classed("off",!!HID[i]).style("--c",COLS[i]);
  // visibility switch | the row itself (hover or click: show only this category) | colour
  r.append("input").attr("type","checkbox").attr("class","vis").property("checked",!HID[i]).attr("aria-label",`Show ${c.n}`)
   .on("change",e=>{HID[i]=e.target.checked?0:1;r.classed("off",!!HID[i]);store.set("hid",[...HID]);repaint();});
  const b=r.append("button").attr("class","body").attr("aria-pressed",String(focus===i));
  b.append("div").attr("class","row").html(`<span class="nm">${c.n}</span><span class="pc">${c.share}</span>`);
  b.append("div").attr("class","vt").text(`${fmt(c.v)} ${c.unit}`);
  if(c.who)b.append("div").attr("class","who").text(c.who.join(", "));
  const m=c.v/1e6, gr=b.append("div").attr("class","grains");
  for(let j=0;j<Math.ceil(m);j++)gr.append("i").classed("part",j>=Math.floor(m)&&m%1<.5);
  r.append("input").attr("type","color").attr("class","col").property("value",COLS[i]).attr("aria-label",`Colour for ${c.n}`)
   .on("input",e=>{COLS[i]=e.target.value;r.style("--c",COLS[i]);packCols();store.set("cols",COLS);repaint();});
  const set=on=>{focus=on?i:-1;list.selectAll(".cand .body").attr("aria-pressed",d=>String(d.i===focus));
   d3.select("#page").classed("focus",focus>=0);repaint();};
  b.on("mouseenter",()=>set(true)).on("mouseleave",()=>set(false)).on("click",()=>set(focus!==i));
 });
}
d3.select("#reset").on("click",()=>{COLS.splice(0,COLS.length,...CATS.map(c=>css("--"+c.col)));HID.fill(0);packCols();
 store.set("cols",null);store.set("hid",null);panel();repaint();});

const proj=d3.geoMercator(), path=d3.geoPath(proj);
const svg=d3.select("#map"), tip=d3.select("#tip"), g=svg.append("g");
const mu=g.append("g").selectAll("path").data(MG.features).join("path").attr("class","mu")
 .on("mousemove",(e,f)=>{const m=M[f.properties.codarea];if(!m||!m.y[YEAR])return;
  // this year's top candidates, then the same camps in the other year, and abstention in both
  const y=m.y[YEAR],oy=YS.find(v=>v!==YEAR),o=m.y[oy],ov=o?Object.fromEntries(o.v):{};
  const ab=d=>d.a/(d.t+d.a+d.bn);
  tip.style("opacity",1).style("left",Math.min(e.clientX+16,innerWidth-260)+"px").style("top",Math.min(e.clientY+16,innerHeight-220)+"px")
  .html(`<b>${m.n}, ${m.uf}</b><div class="l h"><span></span><span>${YEAR}</span><span>${oy}</span></div>`
   +y.v.map(([k,v])=>`<div class="l"><span>${nameOf(YEAR,k)}</span><span>${pct(v,y.t)}</span><span>${o&&ov[k]!=null?pct(ov[k],o.t):"–"}</span></div>`).join("")
   +`<div class="l a"><span>Didn't vote</span><span>${pct(y.a,y.t+y.a+y.bn)}</span><span>${o?pct(o.a,o.t+o.a+o.bn):"–"}</span></div>`
   +`<div class="t">${fmt(y.t)} valid votes in ${YEAR}</div>`);})
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
// dots arrive packed (see pack() in build.py). They are projected once, with the raw Mercator formula, into U;
// fitting the map to the window is then just a scale and offset of U (layout() runs again on every resize).
// Each year has its own dots (n, U, C, and P projected to the screen). The map shows one year, or both side by
// side in compare mode, split by a draggable divider (see layers()).
const DOT={};
for(const y of YS){const D=YEARS[y].dots,n=D.n,U=new Float32Array(2*n),C=new Uint8Array(n);
 const bin=atob(D.b),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 const X=new Uint16Array(bytes.buffer,0,n),Y=new Uint16Array(bytes.buffer,2*n,n),rad=Math.PI/180000;C.set(bytes.subarray(4*n,5*n));
 for(let i=0;i<n;i++){U[2*i]=(X[i]+D.x0)*rad;U[2*i+1]=-Math.log(Math.tan(Math.PI/4+(Y[i]+D.y0)*rad/2));}
 DOT[y]={n,U,C,P:new Float32Array(2*n)};delete D.b;}
function useYear(y){YEAR=y;}
function project(){const k=proj.scale(),[tx,ty]=proj.translate();
 for(const y of YS){const {n,U,P}=DOT[y];for(let i=0;i<n;i++){P[2*i]=U[2*i]*k+tx;P[2*i+1]=U[2*i+1]*k+ty;}}}
// compare mode: the older year left of the divider, the newer right; SPLIT is the divider's position (0–1)
let COMPARE=false,SPLIT=.5;
function layers(){const sx=Math.round(SPLIT*w);
 return COMPARE?[{...DOT[YS[1]],x0:0,x1:sx},{...DOT[YS[0]],x0:sx,x1:w}]:[{...DOT[YEAR],x0:0,x1:w}];}
const cv=document.getElementById("cv"),dpr=devicePixelRatio||1,cx=cv.getContext("2d");
let w,h,W,H,img,px,T,O,TOP,cnt,layoutGen=0;
function layout(){
 const r=document.getElementById("wrap").getBoundingClientRect();w=r.width;h=r.height;
 const pad=Math.min(w,h)*.05,lg=0;
 proj.fitExtent([[pad,pad],[w-pad,h-pad-24]],SG);
 svg.attr("viewBox",`0 0 ${w} ${h}`);mu.attr("d",path);uf.attr("d",path);outer.attr("d",path(SG));mskIn.attr("d",path(SG));if(typeof sl!=="undefined"&&sel)sl.attr("d",path);
 layoutGen++;
 project();
 W=Math.round(w*dpr);H=Math.round(h*dpr);cv.width=W;cv.height=H;
 img=cx.createImageData(W,H);px=new Uint32Array(img.data.buffer);
 [T,O]=[0,0].map(()=>new Float32Array(W*H));TOP=new Uint8Array(W*H);
 cnt=new Uint32Array(Math.ceil(w/CELL)*Math.ceil(h/CELL));
}
// Every dot exists at every zoom (as in Cable's Racial Dot Map).
// Zoomed out, many dots share a pixel: its opacity shows their coverage, its colour one of them (see add()).
// Zoomed in, the dots grow past a pixel and are drawn as discs.
// Dot radius: by default R0·√k (the zoom rule), corrected by the density of the dots in view (as in Datashader's
// dynspread): dense close-ups get somewhat smaller dots, so blocks show instead of a solid sheet; sparse ones get
// larger dots, so a few hundred votes stay visible. See radius().
let SIZE=1, STEP=1, ADAPT=true; // radius multiplier (dot-size control); draw every STEP-th dot (votes-per-dot control)
const ALO=.4, CELL=16, COVER=.6; // opacity of the sparsest pixels; density fit
// The other strategy (the original): radius from zoom alone, R0·k^0.5 (CartoDB's women dot map grows ~k^0.83),
// so dots per screen area fall by k² but each grows by k^1.5 and coverage thins slowly as you zoom in.
const R0=.32, DENSE_W=.35, ADAPT_W=.9, AMIN=.3, AMAX=8;
function radius(t){ // in css px
 const k=t.k,rz=R0*Math.sqrt(k);
 if(!ADAPT)return rz*SIZE;
 const gw=Math.ceil(w/CELL);cnt.fill(0);
 for(const {n,P,C,x0,x1} of layers())
  for(let i=0;i<n;i+=STEP){if(HID[C[i]])continue;const x=P[2*i]*k+t.x,y=P[2*i+1]*k+t.y;if(x>=x0&&x<x1&&y>=0&&y<h)cnt[((y/CELL)|0)*gw+((x/CELL)|0)]++;}
 // Two views of the density: as seen by the average dot (Σc²/Σc over cells, dominated by crowded town cells) and
 // of a typical occupied cell (geometric mean of counts, dominated by sparse rural cells). Sizing by the first
 // leaves the countryside as faint specks; by the second, cities and zoomed-out views clutter. The radius uses
 // their geometric mean (DENSE_W sets the balance). Neither uses a percentile, so both move smoothly while panning.
 let s1=0,s2=0,occ=0,sl=0;for(let j=0;j<cnt.length;j++){const v=cnt[j];if(v){s1+=v;s2+=v*v;occ++;sl+=Math.log(v);}}
 if(!s1)return rz*AMAX*SIZE;
 const c=Math.exp(DENSE_W*Math.log(s2/s1)+(1-DENSE_W)*sl/occ);
 // n discs of radius r scattered in a cell of area g² cover 1-exp(-nπr²/g²) of it
 const r=CELL*Math.sqrt(-Math.log(1-COVER)/(Math.PI*c));
 // The fit is applied as a correction to the zoom rule: the radius moves ADAPT_W of the way (geometrically) from
 // R0·√k towards it, within ×AMIN–×AMAX of the zoom rule, so dense views get much finer dots and sparse ones much
 // larger. Soft limits (tanh) avoid a kink where the correction tops out.
 const z=Math.log(r/rz)*ADAPT_W,lo=Math.log(AMIN),hi=Math.log(AMAX),mid=(lo+hi)/2,hh=(hi-lo)/2;
 return rz*Math.exp(mid+hh*Math.tanh((z-mid)/hh))*SIZE;}
// Disc stamps: pixel offsets and anti-aliased weights for a disc of radius rd, precomputed for 8×8 sub-pixel
// phases of its centre, so drawing a dot is a table walk instead of a square root per pixel
const PH=8;let stamp={rd:-1};
function stamps(rd){
 if(stamp.rd===rd)return stamp;
 const e=rd+.5,Rr=Math.ceil(e)+1,off=[],wt=[],start=new Int32Array(PH*PH+1);
 for(let p=0;p<PH*PH;p++){const cx=(p%PH+.5)/PH,cy=(((p/PH)|0)+.5)/PH; /* dot centre within its pixel */start[p]=off.length/2;
  for(let dy=-Rr;dy<=Rr;dy++)for(let dx=-Rr;dx<=Rr;dx++){const a=e-Math.hypot(dx-cx,dy-cy);if(a>0){off.push(dx,dy);wt.push(a<1?a:1);}}}
 start[PH*PH]=off.length/2;
 return stamp={rd,Rr,start,off:Int16Array.from(off),wt:Float32Array.from(wt)};
}
// the radius eases towards its target over a few frames instead of snapping to it
let rCur=0,easing=false;
// Float32 coverage read as its bit pattern: for positive floats the bits grow monotonically with log2(value),
// piecewise-linearly, which is close enough for binning and much cheaper than Math.log on every pixel
let TI;
function paint(t){
 const target=radius(t);
 rCur=rCur&&ADAPT?rCur*Math.pow(target/rCur,.3):target;
 if(Math.abs(Math.log(rCur/target))>.01){if(!easing){easing=true;requestAnimationFrame(()=>{easing=false;if(!pending)paint(d3.zoomTransform(svg.node()));});}}else rCur=target;
 const Wq=W,Hq=H,N=W*H,out=px;
 const sx=t.k*dpr,ox=t.x*dpr,oy=t.y*dpr,rd=rCur*dpr,f=focus;
 if(!TI||TI.buffer!==T.buffer)TI=new Int32Array(T.buffer);
 T.fill(0,0,N);if(f>=0)O.fill(0,0,N);
 // T is total coverage per pixel (with a candidate in focus, only theirs; O holds everyone else's, drawn as
 // a faint grey trace). A pixel's colour is the last dot drawn on it, not the average: dots are shuffled, so
 // that is a random pick weighted by each candidate's share, and dense mixed places read as blue-and-orange
 // speckle (as in Cable's and CartoDB's maps) instead of averaging complementary hues into grey.
 // Sub-pixel dots add their area to the one pixel they fall in: crisp and saturated (sharing it across
 // neighbours looked washed out). Larger dots are anti-aliased discs at their exact sub-pixel centre, adding ~1
 // per covered pixel; fringe pixels add partial coverage but only take the colour when mostly inside.
 // Each layer (one year, or one per side when comparing) draws only within its own columns [xa, xb), into the
 // same buffers, so both sides share one opacity scale and stay comparable.
 for(const {n,P,C,x0,x1} of layers()){const xa=Math.round(x0*dpr),xb=Math.round(x1*dpr);
 if(rd<.75){const area=Math.PI*rd*rd;
  for(let i=0;i<n;i+=STEP){const x=(P[2*i]*sx+ox)|0,y=(P[2*i+1]*sx+oy)|0;
   if(x<xa||x>=xb||y<0||y>=Hq)continue;const j=y*Wq+x,c=C[i];if(HID[c])continue;
   if(f<0||c===f){T[j]+=area;TOP[j]=c;}else O[j]+=area;}
 }else{const {Rr,start,off,wt}=stamps(rd);
  for(let i=0;i<n;i+=STEP){const fx=P[2*i]*sx+ox-.5,fy=P[2*i+1]*sx+oy-.5,X=Math.floor(fx),Y=Math.floor(fy);
   if(X<xa-Rr||X>=xb+Rr||Y<-Rr||Y>=Hq+Rr)continue;const c=C[i];if(HID[c])continue;const mine=f<0||c===f,p=((fy-Y)*PH|0)*PH+((fx-X)*PH|0);
   const inside=X>=xa+Rr&&X<xb-Rr&&Y>=Rr&&Y<Hq-Rr;
   for(let q2=start[p],e=start[p+1];q2<e;q2++){const x=X+off[2*q2],y=Y+off[2*q2+1];
    if(!inside&&(x<xa||x>=xb||y<0||y>=Hq))continue;const j=y*Wq+x,a=wt[q2];
    if(mine){T[j]+=a;if(a>=.5||T[j]===a)TOP[j]=c;}else O[j]+=a;}}
 }}
 // histogram-equalised opacity (as in Datashader's eq_hist): pixels are ranked by coverage within the
 // current view, so a pixel with 50 overlapping dots reads denser than one with 5 instead of both saturating.
 // A sample of pixels is counted into 1024 log-coverage bins, and the running count gives each bin its rank.
 let ilo=2147483647,ihi=0,m=0;
 for(let j=0;j<N;j+=7){const v=TI[j];if(v){m++;if(v<ilo)ilo=v;if(v>ihi)ihi=v;}}
 const sc=1023/Math.max(1,ihi-ilo),hist=new Uint32Array(1024),LUT=new Uint8Array(1024);
 for(let j=0;j<N;j+=7){const v=TI[j];if(v)hist[((v-ilo)*sc)|0]++;}
 for(let b=0,below=0;b<1024;b++){LUT[b]=255*(ALO+(1-ALO)*below/Math.max(1,m));below+=hist[b];}
 const grey=(22<<24|150<<16|150<<8|150)>>>0;
 for(let j=0;j<N;j++){const v=TI[j];
  if(!v){out[j]=f>=0&&O[j]?grey:0;continue;}
  let b=((v-ilo)*sc)|0;b=b<0?0:b>1023?1023:b;
  out[j]=(LUT[b]<<24|PX[TOP[j]])>>>0;}
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
 g.attr("transform",t);placeLabels(t);svg.style("--mu-o",borderOpacity(t.k)).style("--mu-w",t.k<20?.5:Math.min(1.1,.5+.6*Math.log(t.k/20)/Math.log(3)));
 if(!pending)requestAnimationFrame(()=>{paint(pending);pending=null;});pending=t;});

useYear(YEAR);layout();svg.call(zoom.translateExtent([[0,0],[w,h]]));panel();
// Place names. Municipalities are tried in order of votes cast; a name is shown when
// it falls in view and doesn't collide with one already placed, so big cities win and more names appear as you
// zoom in. Names sit at the municipality's centroid.
const LABELS_K=2.5,labG=svg.append("g").attr("class","place");
const tot=m=>(m.y[YS[0]]||Object.values(m.y)[0]).t;
const LAB=MG.features.filter(f=>M[f.properties.codarea]).map(f=>({f,n:M[f.properties.codarea].n,t:tot(M[f.properties.codarea]),c:[0,0]})).sort((a,b)=>b.t-a.t);
let labGen=-1;
function placeLabels(t){
 if(labGen!==layoutGen){LAB.forEach(d=>d.c=path.centroid(d.f));labGen=layoutGen;} // centroids follow the fitted projection
 const out=[];
 if(t.k>=LABELS_K){const boxes=[],max=Math.round(w*h/28000);
  for(const d of LAB){if(out.length>=max)break;
   const x=d.c[0]*t.k+t.x,y=d.c[1]*t.k+t.y;if(x<20||x>w-20||y<10||y>h-90)continue; // keep clear of the key and credits
   const fs=d.t>1e6?13.5:d.t>2e5?12:11,bw=d.n.length*fs*.56+40,bh=fs+26,b=[x-bw/2,y-bh/2,x+bw/2,y+bh/2];
   if(boxes.some(o=>o[0]<b[2]&&b[0]<o[2]&&o[1]<b[3]&&b[1]<o[3]))continue;
   boxes.push(b);out.push({d,x,y,fs});}}
 labG.selectAll("text").data(out,o=>o.d.f.properties.codarea).join("text")
  .attr("x",o=>o.x).attr("y",o=>o.y).style("font-size",o=>o.fs+"px").classed("big",o=>o.d.t>1e6).text(o=>o.d.n);
}
placeLabels(d3.zoomIdentity);
// replace d3's double-click zoom-in: on a municipality it zooms to that municipality (handler above);
// anywhere outside Brazil it zooms back out to the whole country
svg.on("dblclick.zoom",null).on("dblclick",()=>{select(null);svg.transition().duration(750).call(zoom.transform,d3.zoomIdentity);});
// a selection clears on a click outside Brazil or on Escape anywhere (clicking the same municipality also toggles it)
svg.on("click",()=>select(null));
addEventListener("keydown",e=>{if(e.key==="Escape"&&e.target!==q)select(null);});
repaint=()=>paint(d3.zoomTransform(svg.node()));repaint();
// year switch: same view, same colours per camp, the other year's dots
// "Compare" splits the map: the older year left of a draggable divider, the newer right; the side panel keeps
// showing the year last picked
const swipe=d3.select("#swipe");
function setMode(y){const cmp=y==="cmp";COMPARE=cmp;if(!cmp)useYear(y);
 d3.selectAll("#years button").attr("aria-pressed",v=>String(cmp?v==="cmp":v===YEAR));
 swipe.property("hidden",!cmp);if(cmp)placeSwipe();
 if(focus>=0&&!YEARS[YEAR].cands.some(c=>c.i===focus)){focus=-1;d3.select("#page").classed("focus",false);}
 panel();repaint();}
d3.select("#years").selectAll("button").data([...YS,"cmp"]).join("button").text(y=>y==="cmp"?"Compare":y)
 .attr("aria-pressed",y=>String(y===YEAR)).on("click",(e,y)=>setMode(y));
d3.select("#swl").text(YS[1]);d3.select("#swr").text(YS[0]);
function placeSwipe(){swipe.style("left",SPLIT*100+"%");swipe.select(".grip").attr("aria-valuenow",Math.round(SPLIT*100));}
// dragging the divider (pointer or arrow keys); it never starts a pan
let swRaf=0;const moveSplit=v=>{SPLIT=Math.max(.02,Math.min(.98,v));placeSwipe();if(!swRaf)swRaf=requestAnimationFrame(()=>{swRaf=0;repaint();});};
swipe.select(".grip").on("pointerdown",e=>{e.stopPropagation();e.preventDefault();const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  const r=document.getElementById("wrap").getBoundingClientRect();
  const mv=ev=>moveSplit((ev.clientX-r.left)/r.width),up=()=>{el.removeEventListener("pointermove",mv);el.removeEventListener("pointerup",up);};
  el.addEventListener("pointermove",mv);el.addEventListener("pointerup",up);})
 .on("keydown",e=>{const d={ArrowLeft:-.02,ArrowRight:.02}[e.key];if(d){e.preventDefault();moveSplit(SPLIT+d);}});

// controls. Dots are shuffled, so keeping every STEP-th one is a random sample at STEP × __VPD__ votes per dot.
// display settings: hidden behind the gear until asked for
d3.select("#gear").on("click",e=>{const b=e.currentTarget,o=b.getAttribute("aria-expanded")!=="true";b.setAttribute("aria-expanded",o);d3.select("#ctlp").property("hidden",!o);});
d3.selectAll("#mode button").on("click",e=>{ADAPT=e.currentTarget.dataset.m==="a";
 d3.selectAll("#mode button").attr("aria-pressed",function(){return String(this===e.currentTarget);});repaint();});
const STEPS=[1,2,4,10,20,40];let vpdTimer;
d3.select("#vpd").on("input",e=>{STEP=STEPS[+e.target.value];const v=fmt(STEP*__VPD__);d3.selectAll(".vpd").text(v);d3.select("#vpdv").text(v);
 clearTimeout(vpdTimer);vpdTimer=setTimeout(repaint,120);}); // repaint once the slider settles
d3.select("#rad").on("input",e=>{const m=2**+e.target.value;SIZE=m;d3.select("#radv").text(m.toFixed(m<1?2:1).replace(/\.?0+$/,"")+"×");repaint();});
// selecting a municipality (by click or search) outlines it; from search it also zooms to it
function select(f,zoomTo){sel=f;if(!f&&typeof q!=="undefined")q.value="";sl.datum(f).attr("d",f?path:null).style("display",f?null:"none");
 if(f&&zoomTo){const [[x0,y0],[x1,y1]]=path.bounds(f),k=Math.min(MAXK,.9/Math.max((x1-x0)/w,(y1-y0)/h));
  svg.transition().duration(750).call(zoom.transform,d3.zoomIdentity.translate(w/2,h/2).scale(k).translate(-(x0+x1)/2,-(y0+y1)/2));}}

// municipality search: accent- and case-insensitive; prefix matches first, then substring matches, each by size
const fold=t=>t.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const index=MG.features.filter(f=>M[f.properties.codarea]).map(f=>{const m=M[f.properties.codarea];return {f,label:m.n,uf:m.uf,key:fold(m.n),t:tot(m)};}).sort((a,b)=>b.t-a.t); // bigger municipalities first
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
