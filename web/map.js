const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// colour categories are shared by both years (see categories() in build.py): candidates keyed by ballot number, so
// a camp keeps its colour from one year to the other, then "Others", then abstentions by age: AB for people who had
// to vote (18–69), AO for those for whom voting is optional (16–17, 70–79), A8 for 80+
const COLS=CATS.map(c=>css("--"+c.col)), K=CATS.length, OT=K-4, AB=K-3, AO=K-2, A8=K-1, YS=Object.keys(YEARS).sort().reverse();
const pct=(v,t)=>(100*v/t).toFixed(1)+'%';
const fmt=d3.format(","), fmt0=d3.format(",.0f");
let focus=-1, repaint=()=>{}, YEAR=YS[0], SPLITA=false, INC80=true;
const nameOf=(y,k)=>YEARS[y].names[k]||k;

// Display state, per category: visible or hidden, and its colour (the controls in each panel row). Colours start
// from the CSS tokens; changes and hidden rows are remembered in this browser. Unless abstention is split by age,
// its two categories draw as one (DC maps each category to the one it draws as).
const HID=new Uint8Array(K), DC=Uint8Array.from({length:K},(_,i)=>i);
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
{const c=store.get("cols"),hd=store.get("hid");if(c&&c.length===K)c.forEach((v,i)=>{if(/^#[0-9a-f]{6}$/i.test(v))COLS[i]=v;});
 if(hd&&hd.length===K)HID.set(hd);}
let PX=[];const packCols=()=>{DC[AO]=SPLITA?AO:AB;DC[A8]=SPLITA?A8:AB;PX=COLS.map(h=>{const c=d3.rgb(h);return (c.b<<16|c.g<<8|c.r)>>>0;});}; // little-endian RGB
packCols();
const hidden=c=>HID[DC[c]];

// Studio filters: municipalities outside every slider's range are dimmed on the map and left out of the totals.
// PASS is per feature of MG (municipality shapes); the variables are those of STUDIO (build.py) plus two computed
// here: the abstention rate in the year shown and its change since the other year.
const PASS=new Uint8Array(MG.features.length).fill(1);let FILTERED=false;
const codeOf=MG.features.map(f=>f.properties.codarea);
// Without 80+ (the studio switch), their abstainers and their eligible voters (from TSE's voter profile, which can
// differ from election-day counts by up to ~2%) leave the rates
const tally=(y,m)=>{const d=m&&m.y[y];if(!d)return null;let ab=d.c[AB]+d.c[AO]+d.c[A8],all=d3.sum(d.c)+d.bn;const valid=all-ab-d.bn;
 if(!INC80){ab-=d.c[A8];all-=Math.max(d.e80,d.c[A8]);}return {d,ab,all,valid};};
const abRate=(y,m)=>{const t=tally(y,m);return t&&t.all?100*t.ab/t.all:null;};
const VARS=[...STUDIO.map((v,j)=>({...v,get:m=>m.x?m.x[j]:null})),
 {n:"Abstention rate",u:"pct",src:"TSE, year shown",get:m=>abRate(YEAR,m),dyn:true},
 {n:"Change in abstention",u:"pp",src:"TSE, year shown vs the other",get:m=>{const a=abRate(YS[0],m),b=abRate(YS[1],m);return a==null||b==null?null:(YEAR===YS[0]?a-b:b-a);},dyn:true}];
// sliders move by municipality count (0–100 = quantiles of the values): income and population are very skewed
function quantiles(v){const s=MG.features.map(f=>v.get(M[f.properties.codarea]||{})).filter(x=>x!=null).sort((a,b)=>a-b);
 return d3.range(101).map(i=>s[Math.round(i*(s.length-1)/100)]);}
VARS.forEach(v=>{v.q=quantiles(v);v.lo=0;v.hi=100;});
const showVal=(v,x)=>x==null?"–":v.u==="brl"?"R$ "+fmt0(x):v.u==="pct"?x.toFixed(x<10?1:0)+"%":v.u==="pp"?(x>0?"+":"")+x.toFixed(1)+" pp":d3.format(".2~s")(x).replace("k"," k").replace("M"," M");
function refilter(){
 const act=VARS.filter(v=>v.lo>0||v.hi<100);FILTERED=act.length>0;let n=0;
 MG.features.forEach((f,fi)=>{const m=M[f.properties.codarea];let ok=!!m;
  for(const v of act){if(!ok)break;const x=v.get(m);ok=x!=null&&x>=v.q[v.lo]&&x<=v.q[v.hi];}
  PASS[fi]=ok?1:0;if(ok)n++;});
 d3.select("#fcount").text(FILTERED?`${fmt(n)} of ${fmt(Object.keys(M).length)} municipalities`:"All municipalities");
 d3.select("#fclear").property("hidden",!FILTERED);
 panel();repaint();}

// results panel: same dot language as the map, one dot per million. Abstention is ranked among the candidates by
// head count; its share is of everyone on the roll, the candidates' of valid votes, as TSE reports them. "Others"
// stays last. Unfiltered, the figures are the official national ones (including votes cast abroad); filtered, they
// are the totals of the municipalities that pass. Each row also shows its change since the other year.
const list=d3.select("#cands");
function totals(y){const c=new Array(K).fill(0);let bn=0,e80=0;
 MG.features.forEach((f,fi)=>{if(!PASS[fi])return;const d=(M[f.properties.codarea]||{y:{}}).y[y];if(!d)return;d.c.forEach((v,i)=>c[i]+=v);bn+=d.bn;e80+=Math.max(d.e80,d.c[A8]);});
 return {c,bn,e80};}
function figures(y){
 const Y=YEARS[y],t=totals(y);
 if(!FILTERED){t.c=t.c.slice();const dom=t.c[AB]+t.c[AO]+t.c[A8]||1,o=t.c[AO]/dom,e=t.c[A8]/dom;Y.cands.forEach(c=>t.c[c.i]=c.v);
  t.c[AO]=Math.round(Y.a*o);t.c[A8]=Math.round(Y.a*e);t.c[AB]=Y.a-t.c[AO]-t.c[A8];t.bn=Y.bn;} // abroad: split like at home
 let ab=t.c[AB]+t.c[AO]+t.c[A8];const valid=d3.sum(t.c)-ab;let all=valid+ab+t.bn;
 if(!INC80){ab-=t.c[A8];all-=t.e80;}return {...t,ab,valid,all};}
function panel(){
 const Y=YEARS[YEAR],oy=YS.find(v=>v!==YEAR),F=figures(YEAR),G=figures(oy);
 d3.select("#date").text(Y.date);
 list.selectAll(".cand").remove();
 const has=(y,i)=>YEARS[y].cands.some(c=>c.i===i);
 const ar=(v,i,n,unit,extra)=>({n,v,i,abst:true,share:v/F.all,prev:i===AB&&!SPLITA?G.ab/G.all:(SPLITA?G.c[i]/G.all:null),unit,extra});
 const abRows=SPLITA?[ar(F.c[AB],AB,"Didn't vote, had to","people aged 18–69 on the roll didn't vote"),
   ar(F.c[AO],AO,"Didn't vote, optional","people aged 70–79 or 16–17 didn't vote",YEAR==="2026"?"Age split estimated for 2026":""),
   ...INC80?[ar(F.c[A8],A8,"Didn't vote, 80+","people aged 80+ didn't vote","Includes people likely no longer living who are still on the roll"+(YEAR==="2026"?"; estimated for 2026":""))]:[]]
  :[ar(F.ab,AB,"Didn't vote",INC80?"people on the roll didn't vote":"people on the roll under 80 didn't vote")];
 const rows=[...abRows,...Y.cands.map(c=>({...c,v:F.c[c.i],share:F.c[c.i]/F.valid,prev:has(oy,c.i)?G.c[c.i]/G.valid:null,unit:"votes"}))]
  .sort((a,b)=>(a.k==="")-(b.k==="")||b.v-a.v);
 rows.forEach(c=>{const i=c.i;
  const r=list.append("div").datum(c).attr("class","cand").classed("ab",!!c.abst).classed("off",!!HID[i]).style("--c",COLS[i]);
  // visibility switch | the row itself (hover or click: show only this category) | colour
  r.append("input").attr("type","checkbox").attr("class","vis").property("checked",!HID[i]).attr("aria-label",`Show ${c.n}`)
   .on("change",e=>{HID[i]=e.target.checked?0:1;r.classed("off",!!HID[i]);store.set("hid",[...HID]);repaint();});
  const b=r.append("button").attr("class","body").attr("aria-pressed",String(focus===i));
  const d=c.prev==null?"":(c.share-c.prev)*100,ds=d===""?"":`<span class="dl">${d>=0?"+":"−"}${Math.abs(d).toFixed(1)} pp vs ${oy}</span>`;
  b.append("div").attr("class","row").html(`<span class="nm">${c.n}</span><span class="pc">${(100*c.share).toFixed(1)}%</span>`);
  b.append("div").attr("class","vt").html(`${fmt(c.v)} ${c.unit}${ds}`);
  if(c.extra)b.append("div").attr("class","who").text(c.extra);
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
// studio controls: abstention split by age, and a two-handled range per variable
// the studio column collapses to a strip; the map refits to the space it frees
d3.select("#studiox").on("click",e=>{const o=e.currentTarget.getAttribute("aria-expanded")!=="true";e.currentTarget.setAttribute("aria-expanded",o);
 e.currentTarget.title=o?"Hide the studio":"Show the studio";d3.select("#page").classed("nostudio",!o);dispatchEvent(new Event("resize"));});
d3.selectAll("#asplit button").on("click",e=>{SPLITA=e.currentTarget.dataset.v==="age";
 d3.selectAll("#asplit button").attr("aria-pressed",function(){return String(this===e.currentTarget);});
 if(!SPLITA&&(focus===AO||focus===A8))focus=AB;packCols();panel();repaint();});
d3.select("#inc80").on("change",e=>{INC80=e.target.checked;if(!INC80&&focus===A8)focus=-1;
 VARS.filter(v=>v.dyn).forEach(v=>{v.q=quantiles(v);drawRange(v);});refilter();});
let fRaf=0;const refilterSoon=()=>{if(!fRaf)fRaf=requestAnimationFrame(()=>{fRaf=0;refilter();});};
const fl=d3.select("#filters").selectAll(".f").data(VARS).join("div").attr("class","f");
fl.append("div").attr("class","fh").html(v=>`<span class="fn">${v.n}</span><span class="fv"></span>`);
const rg=fl.append("div").attr("class","rng");rg.append("div").attr("class","track").append("div").attr("class","fill");
["lo","hi"].forEach(end=>rg.append("input").attr("type","range").attr("min",0).attr("max",100).attr("step",1).attr("class",end)
 .attr("aria-label",v=>`${v.n}, ${end==="lo"?"minimum":"maximum"}`).property("value",v=>v[end])
 .on("input",function(e,v){let x=+this.value;if(end==="lo")x=Math.min(x,v.hi);else x=Math.max(x,v.lo);this.value=x;v[end]=x;drawRange(v);refilterSoon();}));
fl.append("div").attr("class","fs").text(v=>v.src);
function drawRange(v){const f=fl.filter(d=>d===v);
 f.select(".fv").text(`${showVal(v,v.q[v.lo])} – ${showVal(v,v.q[v.hi])}`); // the full span when unfiltered
 f.select(".fill").style("left",v.lo+"%").style("right",(100-v.hi)+"%");f.select("input.lo").property("value",v.lo);f.select("input.hi").property("value",v.hi);
 f.classed("on",v.lo>0||v.hi<100);}
VARS.forEach(drawRange);
d3.select("#fclear").on("click",()=>{VARS.forEach(v=>{v.lo=0;v.hi=100;drawRange(v);});refilter();});
d3.select("#fcount").text("All municipalities");
d3.select("#reset").on("click",()=>{COLS.splice(0,K,...CATS.map(c=>css("--"+c.col)));HID.fill(0);packCols();
 store.set("cols",null);store.set("hid",null);panel();repaint();});

const proj=d3.geoMercator(), path=d3.geoPath(proj);
const svg=d3.select("#map"), tip=d3.select("#tip"), g=svg.append("g");
const mu=g.append("g").selectAll("path").data(MG.features).join("path").attr("class","mu")
 .on("mousemove",(e,f)=>{const m=M[f.properties.codarea],a=tally(YEAR,m);if(!a)return;
  // this year's top candidates, then the same camps in the other year, and abstention in both
  const oy=YS.find(v=>v!==YEAR),o=tally(oy,m),has=(y,i)=>YEARS[y].cands.some(c=>c.i===i);
  const top=YEARS[YEAR].cands.filter(c=>c.k).map(c=>c.i).sort((p,q)=>a.d.c[q]-a.d.c[p]).slice(0,4);
  tip.style("opacity",1).style("left",Math.min(e.clientX+16,innerWidth-260)+"px").style("top",Math.min(e.clientY+16,innerHeight-240)+"px")
  .html(`<b>${m.n}, ${m.uf}</b><div class="l h"><span></span><span>${YEAR}</span><span>${oy}</span></div>`
   +top.map(i=>`<div class="l"><span>${YEARS[YEAR].cands.find(c=>c.i===i).n}</span><span>${pct(a.d.c[i],a.valid)}</span><span>${o&&has(oy,i)?pct(o.d.c[i],o.valid):"–"}</span></div>`).join("")
   +`<div class="l a"><span>Didn't vote</span><span>${pct(a.ab,a.all)}</span><span>${o?pct(o.ab,o.all):"–"}</span></div>`
   +`<div class="l"><span class="sub">of whom optional</span><span>${pct(a.d.c[AO],a.ab)}</span><span>${o?pct(o.d.c[AO],o.ab):"–"}</span></div>`
   +`<div class="l"><span class="sub">of whom 80+</span><span>${pct(a.d.c[A8],a.ab)}</span><span>${o?pct(o.d.c[A8],o.ab):"–"}</span></div>`
   +`<div class="t">${fmt(a.valid)} valid votes in ${YEAR}${PASS[MG.features.indexOf(f)]?"":" · outside the filters"}</div>`);})
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
 // dots come grouped by municipality, in ORDER (feature indices); S holds each group's first dot
 const cnt=YEARS[y].cnt,S=new Uint32Array(cnt.length+1);for(let r=0;r<cnt.length;r++)S[r+1]=S[r]+cnt[r];
 DOT[y]={n,U,C,S,P:new Float32Array(2*n)};delete D.b;}
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
// Two sizing strategies (Studio → Display → Dot size):
// - By zoom: dots are fixed objects on the map and just magnify with it, radius R0·k (up to RMAX px), so zooming
//   in on a city turns it into a solid sheet. Nothing adapts.
// - Adaptive: the radius is fitted to the dots in view (as in Datashader's dynspread) on every frame, so it changes
//   as you pan and zoom: dense close-ups get fine dots, so blocks and streets show; sparse ones get large dots, so
//   a few hundred votes stay visible. See radius().
let SIZE=1, STEP=1, ADAPT=true; // radius multiplier (dot-size control); draw every STEP-th dot (votes-per-dot control)
const ALO=.4, CELL=16, COVER=.6; // opacity of the sparsest pixels; density fit
// Adaptive is bounded to ×AMIN–×AMAX of R0·√k (the old zoom rule, CartoDB-like), a soft guard against extremes.
const R0=.32, RMAX=16, DENSE_W=.75, ADAPT_W=1, AMIN=.15, AMAX=10;
// dots are drawn municipality by municipality (so filtered-out ones can be skipped or dimmed); every STEP-th dot
// overall, as before: first(s) is the first such index at or after s
const first=s=>Math.ceil(s/STEP)*STEP;
function radius(t){ // in css px
 const k=t.k,rz=R0*Math.sqrt(k);
 if(!ADAPT)return Math.min(RMAX,R0*k)*SIZE;
 const gw=Math.ceil(w/CELL);cnt.fill(0);
 for(const {P,C,S,x0,x1} of layers())for(let r=0;r<ORDER.length;r++){if(!PASS[ORDER[r]])continue;
  for(let i=first(S[r]),e=S[r+1];i<e;i+=STEP){if(hidden(C[i])||(!INC80&&C[i]===A8))continue;const x=P[2*i]*k+t.x,y=P[2*i+1]*k+t.y;if(x>=x0&&x<x1&&y>=0&&y<h)cnt[((y/CELL)|0)*gw+((x/CELL)|0)]++;}}
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
 // e: the radius at which coverage reaches 0. Full-size discs get half a pixel of anti-aliased edge (rd+.5); just
 // above the single-pixel threshold the edge grows in from almost nothing, so the footprint there (πe² ≈ 1 px)
 // matches a single-pixel dot and the size grows continuously through the switch
 const e=rd+.064+.436*Math.min(1,Math.max(0,rd-.5)),Rr=Math.ceil(e)+1,off=[],wt=[],start=new Int32Array(PH*PH+1);
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
 const trace=f>=0||FILTERED,x80=INC80?-1:A8; // x80: 80+ abstainers, when left out
 T.fill(0,0,N);if(trace)O.fill(0,0,N);
 // T is total coverage per pixel (with a candidate in focus, only theirs; O holds everyone else's, drawn as
 // a faint grey trace). A pixel's colour is the last dot drawn on it, not the average: dots are shuffled, so
 // that is a random pick weighted by each candidate's share, and dense mixed places read as blue-and-orange
 // speckle (as in Cable's and CartoDB's maps) instead of averaging complementary hues into grey.
 // Sub-pixel dots add their area to the one pixel they fall in: crisp and saturated (sharing it across
 // neighbours looked washed out). Larger dots are anti-aliased discs at their exact sub-pixel centre, adding ~1
 // per covered pixel; fringe pixels add partial coverage but only take the colour when mostly inside.
 // Each layer (one year, or one per side when comparing) draws only within its own columns [xa, xb), into the
 // same buffers, so both sides share one opacity scale and stay comparable.
 // Municipalities outside the studio filters go to the grey trace (O), like the other candidates under focus.
 for(const {P,C,S,x0,x1} of layers()){const xa=Math.round(x0*dpr),xb=Math.round(x1*dpr);
 for(let r=0;r<ORDER.length;r++){const out_=!PASS[ORDER[r]],i0=first(S[r]),i1=S[r+1];
 if(rd<.5){const area=Math.PI*rd*rd; // below .5 px a disc covers about one pixel anyway: switching here keeps growth continuous
  for(let i=i0;i<i1;i+=STEP){const x=(P[2*i]*sx+ox)|0,y=(P[2*i+1]*sx+oy)|0;
   if(x<xa||x>=xb||y<0||y>=Hq)continue;const j=y*Wq+x,c0=C[i],c=DC[c0];if(HID[c]||c0===x80)continue;
   if(!out_&&(f<0||c===f)){T[j]+=area;TOP[j]=c;}else O[j]+=area;}
 }else{const {Rr,start,off,wt}=stamps(rd);
  for(let i=i0;i<i1;i+=STEP){const fx=P[2*i]*sx+ox-.5,fy=P[2*i+1]*sx+oy-.5,X=Math.floor(fx),Y=Math.floor(fy);
   if(X<xa-Rr||X>=xb+Rr||Y<-Rr||Y>=Hq+Rr)continue;const c0=C[i],c=DC[c0];if(HID[c]||c0===x80)continue;const mine=!out_&&(f<0||c===f),p=((fy-Y)*PH|0)*PH+((fx-X)*PH|0);
   const inside=X>=xa+Rr&&X<xb-Rr&&Y>=Rr&&Y<Hq-Rr;
   for(let q2=start[p],e=start[p+1];q2<e;q2++){const x=X+off[2*q2],y=Y+off[2*q2+1];
    if(!inside&&(x<xa||x>=xb||y<0||y>=Hq))continue;const j=y*Wq+x,a=wt[q2];
    if(mine){T[j]+=a;if(a>=.5||T[j]===a)TOP[j]=c;}else O[j]+=a;}}
 }}}
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
  if(!v){out[j]=trace&&O[j]?grey:0;continue;}
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
const tot=m=>{const d=m.y[YS[0]]||Object.values(m.y)[0];return d3.sum(d.c)-d.c[AB]-d.c[AO]-d.c[A8];};
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
 VARS.filter(v=>v.dyn).forEach(v=>{v.q=quantiles(v);drawRange(v);});
 if(VARS.some(v=>v.dyn&&(v.lo>0||v.hi<100)))refilter();else panel();repaint();}
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
