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
// a camp's share of valid votes, and its change 2022→2026 in points (ballot numbers 13 and 22 are the same camp in
// both years)
const CI=k=>CATS.findIndex(c=>c.k===k);
const share=(y,m,k)=>{const t=tally(y,m);return t&&t.valid?100*t.d.c[CI(k)]/t.valid:null;};
const lulaShift=m=>{const a=share(YS[0],m,"13"),b=share(YS[1],m,"13");return a==null||b==null?null:a-b;};
const marginShift=m=>{const a=share(YS[0],m,"22"),b=share(YS[1],m,"22"),c=share(YS[0],m,"13"),d=share(YS[1],m,"13");return a==null||b==null?null:(a-c)-(b-d);};
const abRate=(y,m)=>{const t=tally(y,m);return t&&t.all?100*t.ab/t.all:null;};
// neighbourhood variables, per polling place (PLACES: one byte per place and variable, column by column; 255 = none)
const PB=(()=>{const bin=atob(PLACES.b),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;})();
const PVARS=PLACES.vars.map((v,j)=>{const [lo,hi]=v.r,dec=v.enc==="log"?b=>Math.exp(Math.log(lo)+b/254*(Math.log(hi)-Math.log(lo))):b=>lo+b/254*(hi-lo);
 return {...v,place:true,j,val:row=>{if(row<0)return null;const b=PB[j*PLACES.n+row];return b===255?null:dec(b);}};});
const VARS=[...PVARS,...STUDIO.map((v,j)=>({...v,get:m=>m.x?m.x[j]:null})),
 {k:"dlula",n:"Change in Lula's share",u:"pp",src:"TSE, 2026 minus 2022, share of valid votes",get:m=>lulaShift(m)},
 {k:"abst",n:"Abstention rate",u:"pct",src:"TSE, year shown",get:m=>abRate(YEAR,m),dyn:true},
 {k:"dabst",n:"Change in abstention",u:"pp",src:"TSE, year shown vs the other",get:m=>{const a=abRate(YS[0],m),b=abRate(YS[1],m);return a==null||b==null?null:(YEAR===YS[0]?a-b:b-a);},dyn:true}];
// sliders move by municipality count (0–100 = quantiles of the values): income and population are very skewed
function quantiles(v){const s=(v.place?d3.range(PLACES.n).map(v.val):MG.features.map(f=>v.get(M[f.properties.codarea]||{}))).filter(x=>x!=null).sort((a,b)=>a-b);
 return d3.range(101).map(i=>s[Math.round(i*(s.length-1)/100)]);}
VARS.forEach(v=>{v.q=quantiles(v);v.lo=0;v.hi=100;});
// Brazil's income classes, in minimum wages (R$ 1,212 at the 2022 Census): E up to 2, D 2–4, C 4–10, B 10–20, A above
const SM=1212,klass=x=>x>20*SM?"A":x>10*SM?"B":x>4*SM?"C":x>2*SM?"D":"E";
const showVal=(v,x)=>x==null?"–":v.k==="setor_renda_resp_media"?`R$ ${d3.format(",.0f")(Math.round(x/10)*10)} (${klass(x)})`:v.u==="dens"?d3.format(",.0f")(x)+"/km²":v.u==="brl"?"R$ "+d3.format(",.0f")(x<1000?Math.round(x/10)*10:Math.round(x/100)*100):v.u==="pct"?x.toFixed(x<10?1:0)+"%":v.u==="pp"?(x>0?"+":"")+x.toFixed(1)+" pp":d3.format(".2~s")(x).replace("k"," k").replace("M"," M");
// bounds of a filter: by slider position (quantile), or exact values set by a story step (vlo/vhi)
const lo_=v=>v.vlo!=null?v.vlo:v.q[v.lo],hi_=v=>v.vhi!=null?v.vhi:v.q[v.hi];
// a group (one polling place's dots, or a municipality's unplaced ones) passes when its municipality passes the
// municipal filters and its place the neighbourhood ones; PLACEF: some neighbourhood filter is on
let PLACEF=false,INSET=null; // INSET: views can limit the map and totals to some municipalities ("in", IBGE codes)
// Filter results are cached by their signature (story steps reuse them, and are precomputed in idle time)
const FCACHE=new Map();
const fsig=()=>VARS.filter(v=>v.lo>0||v.hi<100).map(v=>`${v.k}:${lo_(v)}:${hi_(v)}${v.dyn?":"+YEAR:""}`).join("|")+"|"+(INSET?[...INSET].join(","):"")+"|"+INC80;
function refilter(){computeFilter();panelIfShown();repaint();}
function panelIfShown(){if(!d3.select("#explore").property("hidden")||typeof storyTotals!=="function")panel();else storyTotals();}
// what the current filter is, in words: the area, then each active filter with its bounds
const hum=x=>x>=1e6?(x/1e6).toFixed(x>=1e7?0:1)+"M":x>=1e3?Math.round(x/1e3)+"k":String(Math.round(x));
function describeFilter(){const out=[];
 if(INSET){const ks=[...INSET],ufs=new Set(ks.map(k=>M[k]&&M[k].uf));
  out.push(ks.length===1?M[ks[0]].n:ufs.size===1&&ks.length===Object.keys(M).filter(k=>M[k].uf===[...ufs][0]).length?"State: "+[...ufs][0]:fmt(ks.length)+" municipalities");}
 for(const v of VARS){if(!(v.lo>0||v.hi<100))continue;const a=v.vlo!=null||v.lo>0,b=v.vhi!=null||v.hi<100,l=lo_(v),h=hi_(v);
  out.push(`${v.n}${v.place?" (around polling place)":""}: ${a&&b?showVal(v,l)+" – "+showVal(v,h):a?"≥ "+showVal(v,l+(v.k==="setor_renda_resp_media"?1:0)):"≤ "+showVal(v,h-(v.k==="setor_renda_resp_media"?1:0))}`);}
 return out;}
function showFilter(){const d=describeFilter();
 d3.select("#fbadge").property("hidden",!d.length).html(d.length?`<b>Showing only</b> ${d.map(x=>`<span>${x}</span>`).join("")}`:"");}
function computeFilter(){
 const act=VARS.filter(v=>v.lo>0||v.hi<100),mact=act.filter(v=>!v.place),pact=act.filter(v=>v.place);
 FILTERED=act.length>0||!!INSET;PLACEF=pact.length>0;
 const key=fsig(),hit=FCACHE.get(key);let n=0;
 if(hit){PASS.set(hit.pass);for(const y of YS)DOT[y].GP.set(hit.gp[y]);d3.select("#fcount").text(hit.label);d3.select("#fclear").property("hidden",!FILTERED);showFilter();return;}
 MG.features.forEach((f,fi)=>{const m=M[f.properties.codarea];let ok=!!m&&(!INSET||INSET.has(f.properties.codarea));
  for(const v of mact){if(!ok)break;const x=v.get(m);ok=x!=null&&x>=lo_(v)&&x<=hi_(v);}
  PASS[fi]=ok?1:0;if(ok)n++;});
 let np=0,npt=0;
 for(const y of YS){const D=DOT[y];
  for(let r=0;r<ORDER.length;r++){const mp=PASS[ORDER[r]];
   for(let g=D.GM[r];g<D.GM[r+1];g++){let ok=mp;const row=D.GR[g];
    for(const v of pact){if(!ok)break;const x=v.val(row);ok=x!=null&&x>=lo_(v)&&x<=hi_(v);}
    D.GP[g]=ok?1:0;if(y===YEAR&&row>=0){npt++;if(ok)np++;}}}}
 d3.select("#fcount").text(!FILTERED?"All municipalities":PLACEF?`${fmt(np)} of ${fmt(npt)} polling places`:`${fmt(n)} of ${fmt(Object.keys(M).length)} municipalities`);
 d3.select("#fclear").property("hidden",!FILTERED);showFilter();
 FCACHE.set(key,{pass:PASS.slice(),gp:Object.fromEntries(YS.map(y=>[y,DOT[y].GP.slice()])),label:d3.select("#fcount").text()});
 if(FCACHE.size>40)FCACHE.delete(FCACHE.keys().next().value);
}

// results panel: same dot language as the map, one dot per million. Abstention is ranked among the candidates by
// head count; its share is of everyone on the roll, the candidates' of valid votes, as TSE reports them. "Others"
// stays last. Unfiltered, the figures are the official national ones (including votes cast abroad); filtered, they
// are the totals of the municipalities that pass. Each row also shows its change since the other year.
const list=d3.select("#cands");
// With neighbourhood filters on, totals come from the dots of the passing groups (each dot is __VPD__ people);
// blank/null votes and 80+ eligible voters are added in each municipality's own proportion.
function dotTotals(y){const D=DOT[y],c=new Array(K).fill(0);let bn=0,e80=0;
 for(let r=0;r<ORDER.length;r++){const m=M[codeOf[ORDER[r]]],d=m&&m.y[y];const cm=new Array(K).fill(0);let any=0;
  for(let g=D.GM[r];g<D.GM[r+1];g++){if(!D.GP[g])continue;any=1;for(let i=D.S[g];i<D.S[g+1];i++)cm[D.C[i]]+=__VPD__;}
  if(!any)continue;cm.forEach((v,i)=>c[i]+=v);
  if(d){const val=d3.sum(d.c)-d.c[AB]-d.c[AO]-d.c[A8],vv=d3.sum(cm)-cm[AB]-cm[AO]-cm[A8];bn+=val?d.bn*vv/val:0;e80+=d.c[A8]?Math.max(d.e80,d.c[A8])*cm[A8]/d.c[A8]:0;}}
 return {c,bn,e80};}
function totals(y){if(PLACEF)return dotTotals(y);const c=new Array(K).fill(0);let bn=0,e80=0;
 MG.features.forEach((f,fi)=>{if(!PASS[fi])return;const d=(M[f.properties.codarea]||{y:{}}).y[y];if(!d)return;d.c.forEach((v,i)=>c[i]+=v);bn+=d.bn;e80+=Math.max(d.e80,d.c[A8]);});
 return {c,bn,e80};}
function figures(y){
 const Y=YEARS[y],t=totals(y);
 if(!FILTERED){t.c=t.c.slice();const dom=t.c[AB]+t.c[AO]+t.c[A8]||1,o=t.c[AO]/dom,e=t.c[A8]/dom;Y.cands.forEach(c=>t.c[c.i]=c.v);
  t.c[AO]=Math.round(Y.a*o);t.c[A8]=Math.round(Y.a*e);t.c[AB]=Y.a-t.c[AO]-t.c[A8];t.bn=Y.bn;} // abroad: split like at home
 let ab=t.c[AB]+t.c[AO]+t.c[A8];const valid=d3.sum(t.c)-ab;let all=valid+ab+t.bn;
 if(!INC80){ab-=t.c[A8];all-=t.e80;}return {...t,ab,valid,all};}
let panel=function(){
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
d3.select("#pfilters").selectAll(".f").data(VARS.filter(v=>v.place)).join("div").attr("class","f");
d3.select("#filters").selectAll(".f").data(VARS.filter(v=>!v.place)).join("div").attr("class","f");
const fl=d3.selectAll("#pfilters .f, #filters .f");
fl.append("div").attr("class","fh").html(v=>`<span class="fn">${v.n}</span><span class="fv"></span>`);
const rg=fl.append("div").attr("class","rng");rg.append("div").attr("class","track").append("div").attr("class","fill");
["lo","hi"].forEach(end=>rg.append("input").attr("type","range").attr("min",0).attr("max",100).attr("step",1).attr("class",end)
 .attr("aria-label",v=>`${v.n}, ${end==="lo"?"minimum":"maximum"}`).property("value",v=>v[end])
 .on("input",function(e,v){v.vlo=v.vhi=null;let x=+this.value;if(end==="lo")x=Math.min(x,v.hi);else x=Math.max(x,v.lo);this.value=x;v[end]=x;drawRange(v);refilterSoon();}));
fl.append("div").attr("class","fs").text(v=>v.src);
function drawRange(v){const f=fl.filter(d=>d===v);
 f.select(".fv").text(`${showVal(v,lo_(v))} – ${showVal(v,hi_(v))}`); // the full span when unfiltered
 f.select(".fill").style("left",v.lo+"%").style("right",(100-v.hi)+"%");f.select("input.lo").property("value",v.lo);f.select("input.hi").property("value",v.hi);
 f.classed("on",v.lo>0||v.hi<100);}
VARS.forEach(drawRange);
d3.select("#fclear").on("click",()=>{INSET=null;VARS.forEach(v=>{v.lo=0;v.hi=100;v.vlo=v.vhi=null;drawRange(v);});refilter();});
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
  // columns in time order (2022, then 2026); the year not shown on the map is muted
  const cells=(cur,oth)=>{const c=`<span>${cur}</span>`,d=`<span class="oy">${oth}</span>`;return +YEAR<+oy?c+d:d+c;};
  tip.html(`<b>${m.n}, ${m.uf}</b><div class="l h"><span></span>${cells(YEAR,oy)}</div>`
   +top.map(i=>`<div class="l"><span>${YEARS[YEAR].cands.find(c=>c.i===i).n}</span>${cells(pct(a.d.c[i],a.valid),o&&has(oy,i)?pct(o.d.c[i],o.valid):"–")}</div>`).join("")
   +`<div class="l a"><span>Didn't vote</span>${cells(pct(a.ab,a.all),o?pct(o.ab,o.all):"–")}</div>`
   +`<div class="l"><span class="sub">of whom optional</span>${cells(pct(a.d.c[AO],a.ab),o?pct(o.d.c[AO],o.ab):"–")}</div>`
   +`<div class="l"><span class="sub">of whom 80+</span>${cells(pct(a.d.c[A8],a.ab),o?pct(o.d.c[A8],o.ab):"–")}</div>`
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
 // dots come grouped by municipality (in ORDER, feature indices) and within it by polling place: GM holds each
 // municipality's first group, S each group's first dot, GR its row in the place table (-1: none), GP whether it passes
 const cnt=YEARS[y].cnt,ng=YEARS[y].ng,gb=atob(YEARS[y].groups),gbytes=new Uint8Array(gb.length);for(let i=0;i<gb.length;i++)gbytes[i]=gb.charCodeAt(i);
 const GR=new Int32Array(gbytes.buffer,0,ng),GC=new Uint16Array(gbytes.buffer,4*ng,ng),S=new Uint32Array(ng+1),GM=new Uint32Array(cnt.length+1);
 for(let g=0;g<ng;g++)S[g+1]=S[g]+GC[g];for(let r=0;r<cnt.length;r++)GM[r+1]=GM[r]+cnt[r];
 DOT[y]={n,U,C,S,GM,GR,GP:new Uint8Array(ng).fill(1),P:new Float32Array(2*n)};delete D.b;delete YEARS[y].groups;}
function useYear(y){YEAR=y;}
function project(){const k=proj.scale(),[tx,ty]=proj.translate();
 for(const y of YS){const {n,U,P}=DOT[y];for(let i=0;i<n;i++){P[2*i]=U[2*i]*k+tx;P[2*i+1]=U[2*i+1]*k+ty;}}}
// compare mode: the older year left of the divider, the newer right; SPLIT is the divider's position (0–1)
let COMPARE=false,SPLIT=.5;
// first-visit hints: how to move the map, and that the year divider drags. Each goes once used.
const TOUCH=matchMedia("(pointer:coarse)").matches;
function hintDone(id){const n=document.getElementById(id);if(n)n.classList.add("gone");}
setTimeout(()=>hintDone("maphint"),12000);
if(TOUCH)d3.select(".mh-z").text("Pinch");
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
// dots are drawn group by group (so filtered-out ones can be skipped or dimmed); every STEP-th dot
// overall, as before: first(s) is the first such index at or after s
const first=s=>Math.ceil(s/STEP)*STEP;
function radius(t){ // in css px
 const k=t.k,rz=R0*Math.sqrt(k);
 if(!ADAPT)return Math.min(RMAX,R0*k)*SIZE;
 const gw=Math.ceil(w/CELL);cnt.fill(0);
 for(const {P,C,S,GP,x0,x1} of layers())for(let g=0;g<GP.length;g++){if(!GP[g])continue;
  for(let i=first(S[g]),e=S[g+1];i<e;i+=STEP){if(hidden(C[i])||(!INC80&&C[i]===A8))continue;const x=P[2*i]*k+t.x,y=P[2*i+1]*k+t.y;if(x>=x0&&x<x1&&y>=0&&y<h)cnt[((y/CELL)|0)*gw+((x/CELL)|0)]++;}}
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
 for(const {P,C,S,GP,x0,x1} of layers()){const xa=Math.round(x0*dpr),xb=Math.round(x1*dpr);
 for(let g=0;g<GP.length;g++){const out_=!GP[g],i0=first(S[g]),i1=S[g+1];
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
 const dim=ARROWS?.3:1; // under swing arrows the dots recede
 for(let b=0,below=0;b<1024;b++){LUT[b]=255*dim*(ALO+(1-ALO)*below/Math.max(1,m));below+=hist[b];}
 const grey=(22<<24|150<<16|150<<8|150)>>>0;
 for(let j=0;j<N;j++){const v=TI[j];
  if(!v){out[j]=trace&&O[j]?grey:0;continue;}
  let b=((v-ilo)*sc)|0;b=b<0?0:b>1023?1023:b;
  out[j]=(LUT[b]<<24|PX[TOP[j]])>>>0;}
 cx.putImageData(img,0,0);
 if(ARROWS)drawArrows(t);
}
// Swing arrows (as in the New York Times' election maps): one per municipality, from its centroid, leaning right
// and blue where the margin moved towards the Bolsonaro camp between 2022 and 2026, left and red where it moved
// towards Lula; length is the size of the shift in points of the margin. Filters apply.
let ARROWS=false,CEN=null,cenGen=-1;
const SHIFT=MG.features.map(f=>{const m=M[f.properties.codarea];return m?marginShift(m):null;});
const AORD=d3.range(SHIFT.length).filter(i=>SHIFT[i]!=null&&Math.abs(SHIFT[i])>=.5).sort((a,b)=>Math.abs(SHIFT[a])-Math.abs(SHIFT[b]));
function drawArrows(t){
 if(cenGen!==layoutGen){CEN=MG.features.map(f=>path.centroid(f));cenGen=layoutGen;}
 const S=ARROW_PX(t.k)*dpr,ca=Math.cos(Math.PI/6),sa=Math.sin(Math.PI/6),cb=COLS[CI("22")],cr=COLS[CI("13")];
 cx.lineCap="round";cx.lineJoin="round";cx.lineWidth=Math.min(1.4,.8+.15*Math.log2(t.k))*dpr;cx.globalAlpha=.8;
 for(const i of AORD){if(!PASS[i])continue;const c=CEN[i];if(!c||!isFinite(c[0]))continue;
  const x=(c[0]*t.k+t.x)*dpr,y=(c[1]*t.k+t.y)*dpr,d=SHIFT[i],L=Math.abs(d)*S,dir=d>0?1:-1;
  if(x<-L||x>W+L||y<-L||y>H+L)continue;
  const x2=x+dir*L*ca,y2=y-L*sa,hx=dir*ca,hy=-sa,h=Math.min(5*dpr,L*.45);
  cx.strokeStyle=d>0?cb:cr;cx.beginPath();cx.moveTo(x,y);cx.lineTo(x2,y2);
  cx.moveTo(x2-h*(hx*.8-hy*.6),y2-h*(hy*.8+hx*.6));cx.lineTo(x2,y2);cx.lineTo(x2-h*(hx*.8+hy*.6),y2-h*(hy*.8-hx*.6));cx.stroke();}
 cx.globalAlpha=1;}
const ARROW_PX=k=>.5*Math.pow(k,.5); // px per point of margin shift: grows gently as you zoom in
// paint during the gesture, at most once per animation frame (zoom events can arrive faster than frames)
let pending=null;
// unselected borders fade in to 0.1 by ~3x, then ease down to 0.06 by 20x: at mid zoom, sparse areas are mostly
// dark background and the lines would compete with the dots. From 20x they grow (to 0.4 opacity, 1.1px at 60x)
// so city limits read clearly up close.
const borderOpacity=k=>k<3?Math.max(0,Math.min(.1,(k-1.3)*.06)):k<20?Math.max(.06,.1-.04*Math.log(k/3)/Math.log(20/3)):Math.min(.4,.06+.34*Math.log(k/20)/Math.log(3));
const MAXK=400; // deep enough for the smallest municipalities to fill the screen
let lastK=1;const CLEARK=1.5;
const zoom=d3.zoom().scaleExtent([1,MAXK]).on("end",()=>saveSoon()).on("zoom",e=>{const t=e.transform;
 // zooming out by hand to near the whole-country view clears the selection
 if(sel&&e.sourceEvent&&t.k<lastK&&t.k<CLEARK)select(null);
 if(e.sourceEvent)hintDone("maphint");
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
repaint=()=>{paint(d3.zoomTransform(svg.node()));saveSoon();};repaint();
// year switch: same view, same colours per camp, the other year's dots
// "Compare" splits the map: the older year left of a draggable divider, the newer right; the side panel keeps
// showing the year last picked
const swipe=d3.select("#swipe");
function setMode(y){const cmp=y==="cmp";COMPARE=cmp;if(!cmp)useYear(y);
 d3.selectAll("#years button").attr("aria-pressed",v=>String(cmp?v==="cmp":v===YEAR));
 swipe.property("hidden",!cmp);if(cmp)placeSwipe();
 if(focus>=0&&!YEARS[YEAR].cands.some(c=>c.i===focus)){focus=-1;d3.select("#page").classed("focus",false);}
 VARS.filter(v=>v.dyn).forEach(v=>{v.q=quantiles(v);drawRange(v);});
 if(VARS.some(v=>v.dyn&&(v.lo>0||v.hi<100)))refilter();else{panelIfShown();repaint();}}
d3.select("#years").selectAll("button").data([...YS,"cmp"]).join("button").text(y=>y==="cmp"?"Compare":y)
 .attr("aria-pressed",y=>String(y===YEAR)).on("click",(e,y)=>setMode(y));
d3.select("#swl").text(YS[1]);d3.select("#swr").text(YS[0]);
function placeSwipe(){swipe.style("left",SPLIT*100+"%");swipe.select(".grip").attr("aria-valuenow",Math.round(SPLIT*100));}
// dragging the divider (pointer or arrow keys); it never starts a pan
let swRaf=0;const moveSplit=v=>{d3.select("#swipe").classed("used",true);SPLIT=Math.max(.02,Math.min(.98,v));placeSwipe();if(!swRaf)swRaf=requestAnimationFrame(()=>{swRaf=0;repaint();});};
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
// on resize the map refits, keeping the same centre and zoom
let rz;addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{const v=getView();layout();zoom.translateExtent([[0,0],[w,h]]);
 setView(v);},150);});

// Views in the URL. Everything that shapes the view lives in the hash, so any view can be shared or embedded:
// year or compare (and the divider), centre and zoom, the abstention split and the 80+ switch, filters (by
// slider position, so by quantile), hidden rows, the isolated row, changed colours, the display settings, and
// whether the studio is open. "embed" hides both side panels. The hash is rewritten as the view changes.
function getView(){const t=d3.zoomTransform(svg.node());return {c:proj.invert([(w/2-t.x)/t.k,(h/2-t.y)/t.k]),k:t.k};}
function setView(v){const p=proj(v.c);svg.call(zoom.transform,d3.zoomIdentity.translate(w/2,h/2).scale(v.k).translate(-p[0],-p[1]));}
const DEF_COLS=CATS.map(c=>css("--"+c.col));
function stateHash(embed){
 const q=new URLSearchParams(),v=getView();
 q.set("y",COMPARE?"cmp":YEAR);if(COMPARE)q.set("split",SPLIT.toFixed(3));
 q.set("at",`${v.c[0].toFixed(4)},${v.c[1].toFixed(4)},${+v.k.toFixed(2)}`);
 if(INSET){const u=M[[...INSET][0]].uf,whole=INSET.size>1&&Object.keys(M).every(k=>(M[k].uf===u)===INSET.has(k));q.set("in",whole?"uf:"+u:[...INSET].join(","));}if(SPLITA)q.set("ages","1");if(ARROWS)q.set("arrows","1");if(!INC80)q.set("80plus","0");
 const f=VARS.filter(x=>x.lo>0||x.hi<100).map(x=>x.vlo!=null||x.vhi!=null?`${x.k}@${x.vlo??"*"}~${x.vhi??"*"}`:`${x.k}:${x.lo}-${x.hi}`);if(f.length)q.set("f",f.join(","));
 const hid=[...HID].map((x,i)=>x?CATS[i].k||"others":null).filter(x=>x!=null);if(hid.length)q.set("hide",hid.join(","));
 if(focus>=0)q.set("only",CATS[focus].k||"others");
 const col=COLS.map((c,i)=>c.toLowerCase()!==DEF_COLS[i].toLowerCase()?`${CATS[i].k||"others"}:${c.slice(1)}`:null).filter(Boolean);if(col.length)q.set("col",col.join(","));
 if(!ADAPT)q.set("size","zoom");if(STEP!==1)q.set("vpd",STEP*__VPD__);if(SIZE!==1)q.set("scale",(+d3.select("#rad").property("value")).toFixed(2));
 if(d3.select("#page").classed("nostudio"))q.set("studio","0");
 if(embed)q.set("embed","1");
 return q.toString().replace(/%2C/g,",").replace(/%3A/g,":");}
var saveT=0,restoring=true; // var: repaint() calls saveSoon() before this point in the script runs
function saveSoon(){if(restoring)return;clearTimeout(saveT);saveT=setTimeout(()=>{const e=new URLSearchParams(location.hash.slice(1)).get("embed")==="1";
 try{history.replaceState(null,"","#"+stateHash(e));}catch(_){}},250);}
const catOf=k=>CATS.findIndex(c=>(c.k||"others")===k);
// Apply a view (a hash string, as in share links). The view-shaping parts are always set, to their defaults when
// absent (year, divider, place and zoom, abstention split, 80+, filters, hidden and isolated rows); the display
// settings, colours and panels only when given. animate: fly to the place and sweep the divider (story steps).
function setFiltersFrom(q){
 VARS.forEach(x=>{x.lo=0;x.hi=100;x.vlo=x.vhi=null;});INSET=q.get("in")?new Set(q.get("in").split(",").flatMap(c=>c.startsWith("uf:")?Object.keys(M).filter(k=>M[k].uf===c.slice(3)):[c])):null;
 // f: "key:lo-hi" by slider position (quantile), or "key@a~b" by value (story steps), either end open with "*"
 (q.get("f")||"").split(",").filter(Boolean).forEach(x=>{let m=x.match(/^(.+):(\d+)-(\d+)$/);let v=m&&VARS.find(z=>z.k===m[1]);
  if(v){v.lo=Math.min(100,+m[2]);v.hi=Math.max(v.lo,Math.min(100,+m[3]));return;}
  m=x.match(/^(.+)@(-?[\d.]+|\*)~(-?[\d.]+|\*)$/);v=m&&VARS.find(z=>z.k===m[1]);if(!v)return;
  v.lo=m[2]==="*"?0:Math.max(0,v.q.findIndex(z=>z>=+m[2]));v.hi=m[3]==="*"?100:Math.max(v.lo,100-[...v.q].reverse().findIndex(z=>z<=+m[3]));
  if(m[2]!=="*")v.vlo=+m[2];if(m[3]!=="*")v.vhi=+m[3];});
}
function applyState(str,animate){
 const q=new URLSearchParams(str);
 if(q.get("embed")==="1")d3.select("#page").classed("embed",true);
 if(q.has("studio")&&!d3.select("#page").classed("embed")){const open=q.get("studio")!=="0";d3.select("#page").classed("nostudio",!open);d3.select("#studiox").attr("aria-expanded",String(open));}
 SPLITA=q.has("ages");d3.selectAll("#asplit button").attr("aria-pressed",function(){return String((this.dataset.v==="age")===SPLITA);});
 INC80=q.get("80plus")!=="0";d3.select("#inc80").property("checked",INC80);
 setArrows(q.has("arrows"));
 if(q.has("size")){ADAPT=q.get("size")!=="zoom";d3.selectAll("#mode button").attr("aria-pressed",function(){return String((this.dataset.m==="a")===ADAPT);});}
 if(q.has("vpd")){const i=STEPS.indexOf(Math.round(+q.get("vpd")/__VPD__));if(i>=0){const el=d3.select("#vpd").property("value",i).node();el.dispatchEvent(new Event("input"));}}
 if(q.has("scale")){const el=d3.select("#rad").property("value",+q.get("scale")).node();el.dispatchEvent(new Event("input"));}
 (q.get("col")||"").split(",").filter(Boolean).forEach(x=>{const [k,c]=x.split(":"),i=catOf(k);if(i>=0&&/^[0-9a-f]{6}$/i.test(c))COLS[i]="#"+c;});
 HID.fill(0);(q.get("hide")||"").split(",").filter(Boolean).forEach(k=>{const i=catOf(k);if(i>=0)HID[i]=1;});packCols();
 setFiltersFrom(q);
 const y=q.get("y")||YS[0];let sp=q.has("split")?Math.max(.02,Math.min(.98,+q.get("split"))):.5;
 if(animate&&storyOffset()){const r=document.getElementById("wrap").getBoundingClientRect(),o=2*storyOffset()/r.width;sp=o+(1-o)*sp;} // story: within the visible map
 const wasCmp=COMPARE;
 if(animate&&y==="cmp"&&!wasCmp){SPLIT=.98;setMode("cmp");d3.transition().duration(1200).tween("split",()=>{const i=d3.interpolate(.98,sp);return t=>{SPLIT=i(t);placeSwipe();repaint();};});}
 else{SPLIT=sp;setMode(y==="cmp"||YS.includes(y)?y:YS[0]);}
 const o=q.get("only"),fi=o?catOf(o):-1;focus=fi;d3.select("#page").classed("focus",fi>=0);
 VARS.forEach(drawRange);drawArea();computeFilter();panelIfShown();
 {const r=document.getElementById("wrap").getBoundingClientRect();if(r.width!==w||r.height!==h){layout();zoom.translateExtent([[0,0],[w,h]]);}} // only if the panels changed the map's size
 const at=q.get("at"),a3=(at||"").split(",").map(Number);
 // in the story, the cards cover the map's left side: views centre on the visible part to their right
 const off=storyOffset(),home=off?d3.zoomIdentity.translate(off*.6,0):d3.zoomIdentity;
 const t=at==="home"?home:a3.length===3&&a3.every(isFinite)?(()=>{const p=proj([a3[0],a3[1]]);return d3.zoomIdentity.translate(w/2+off,h/2).scale(Math.max(1,Math.min(MAXK,a3[2]))).translate(-p[0],-p[1]);})():null;
 if(t){if(animate)svg.transition().duration(1600).call(zoom.transform,t);else svg.call(zoom.transform,t);}
 repaint();}
function storyOffset(){const a=document.querySelector("aside");return d3.select("#page").classed("storymode")&&innerWidth>900?a.getBoundingClientRect().width/2:0;}
function applyHash(){const h=location.hash.slice(1);if(h)applyState(h,false);}
// a reader editing the hash (or following a link within the page) gets that view
addEventListener("hashchange",()=>{if(location.hash.slice(1)!==stateHash(new URLSearchParams(location.hash.slice(1)).get("embed")==="1")){restoring=true;applyHash();restoring=false;}});
applyHash();restoring=false;

// share: a dialog with this view's link (optionally map only, for embedding) and a copy button
const dlg=document.getElementById("sharedlg"),surl=document.getElementById("shareurl");
const shareLink=()=>{const base=location.href.split("#")[0];return base+"#"+stateHash(document.getElementById("shareembed").checked);};
d3.select("#share").on("click",()=>{surl.value=shareLink();d3.select("#sharecopy").text("Copy");dlg.showModal();surl.select();});
d3.select("#shareembed").on("change",()=>{surl.value=shareLink();d3.select("#sharecopy").text("Copy");});
d3.select("#sharecopy").on("click",async()=>{let ok=false;
 try{await navigator.clipboard.writeText(surl.value);ok=true;}catch(_){surl.select();try{ok=document.execCommand("copy");}catch(__){}}
 d3.select("#sharecopy").text(ok?"Copied":"Select and copy");});
d3.select("#shareclose").on("click",()=>dlg.close());
dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close();});

// swing arrows toggle and key
function setArrows(on){ARROWS=on;d3.select("#arrows").property("checked",on);d3.select("#akey").property("hidden",!on);
 d3.select("#akl").style("width",10*ARROW_PX(d3.zoomTransform(svg.node()).k)+"px");}
d3.select("#arrows").on("change",e=>{setArrows(e.target.checked);repaint();});
svg.on("wheel.akey",()=>{if(ARROWS)requestAnimationFrame(()=>d3.select("#akl").style("width",10*ARROW_PX(d3.zoomTransform(svg.node()).k)+"px"));});

// Map notes: a step can label places on the map, each a short text with a leader line to its point, kept in
// place as the map moves
const notesG=svg.append("g").attr("class","notes");let NOTES=[];
function drawNotes(t){t=t||d3.zoomTransform(svg.node());
 const sel=notesG.selectAll("g.note").data(NOTES,d=>d.t).join(en=>{const g=en.append("g").attr("class","note").style("opacity",0);
   g.append("line");g.append("circle").attr("r",3);g.append("text");g.transition().duration(500).style("opacity",1);return g;});
 sel.each(function(d){const p=proj(d.at),x=p[0]*t.k+t.x,y=p[1]*t.k+t.y,dx=d.dx??40,dy=d.dy??-30,g=d3.select(this);
  g.select("circle").attr("cx",x).attr("cy",y);g.select("line").attr("x1",x).attr("y1",y).attr("x2",x+dx*.85).attr("y2",y+dy*.85);
  g.select("text").attr("x",x+dx).attr("y",y+dy).attr("text-anchor",dx<0?"end":"start").text(d.t);});}
zoom.on("zoom.notes",e=>drawNotes(e.transform));

// Small charts in story cards: Lula's share of valid votes in 2022 (hollow) and 2026 (filled) for groups of
// municipalities, summed over the group, computed here from the same data as the map
const REGION={AC:"North",AM:"North",AP:"North",PA:"North",RO:"North",RR:"North",TO:"North",AL:"Northeast",BA:"Northeast",CE:"Northeast",MA:"Northeast",PB:"Northeast",PE:"Northeast",PI:"Northeast",RN:"Northeast",SE:"Northeast",DF:"Centre-West",GO:"Centre-West",MS:"Centre-West",MT:"Centre-West",ES:"Southeast",MG:"Southeast",RJ:"Southeast",SP:"Southeast",PR:"South",RS:"South",SC:"South"};
const CAPITALS=new Set(["1100205","1200401","1302603","1400100","1501402","1600303","1721000","2111300","2211001","2304400","2408102","2507507","2611606","2704302","2800308","2927408","3106200","3205309","3304557","3550308","4106902","4205407","4314902","5002704","5103403","5208707","5300108"]);
function groupShares(spec){
 const groups=new Map(),add=(key,m)=>{let g=groups.get(key);if(!g)groups.set(key,g={a:[0,0],b:[0,0]});
  for(const [j,y] of [[0,YS[1]],[1,YS[0]]]){const t=tally(y,m);if(!t)return;g[j?"b":"a"][0]+=t.d.c[CI("13")];g[j?"b":"a"][1]+=t.valid;}};
 const v=spec.by==="region"?null:VARS.find(z=>z.k===spec.by);
 for(const f of MG.features){const m=M[f.properties.codarea];if(!m||!m.y[YS[0]]||!m.y[YS[1]])continue;
  if(spec.by==="region"){add(REGION[m.uf],m);continue;}
  if(spec.by==="capital"){add(CAPITALS.has(f.properties.codarea)?0:1,m);continue;}
  const x=v.get(m);if(x==null)continue;const i=spec.cuts.findIndex(c=>x<c);add(i<0?spec.cuts.length:i,m);}
 const keys=spec.by==="region"?spec.labels.map(l=>l):spec.labels.map((_,i)=>i);
 return keys.map((k,i)=>{const g=groups.get(k)||{a:[0,1],b:[0,1]};return {label:spec.labels[i],a:100*g.a[0]/g.a[1],b:100*g.b[0]/g.b[1]};});}
function chart(el,spec){
 if(spec.by==="series")return seriesChart(el,spec);
 const rows=groupShares(spec),W=330,rh=22,top=36,H=top+rows.length*rh+6,lx=118;
 const x=d3.scaleLinear().domain([Math.floor(d3.min(rows,r=>Math.min(r.a,r.b))/10)*10,Math.ceil(d3.max(rows,r=>Math.max(r.a,r.b))/10)*10]).range([lx,W-40]);
 const s=d3.select(el).append("svg").attr("class","dumb").attr("viewBox",`0 0 ${W} ${H}`).attr("role","img").attr("aria-label",spec.title);
 s.append("text").attr("class","ct").attr("x",0).attr("y",12).text(spec.title);
 s.append("g").selectAll("text").data(x.ticks(4)).join("text").attr("class","tk").attr("x",x).attr("y",top-8).text(d=>d+"%");
 const r=s.append("g").selectAll("g").data(rows).join("g").attr("transform",(d,i)=>`translate(0,${top+i*rh+rh/2})`);
 r.append("text").attr("class","rl").attr("x",0).attr("y",4).text(d=>d.label);
 r.append("line").attr("x1",d=>x(d.a)).attr("x2",d=>x(d.b)).attr("stroke",COLS[CI("13")]).attr("stroke-width",2).attr("opacity",.5);
 r.append("circle").attr("cx",d=>x(d.a)).attr("r",4).attr("fill","none").attr("stroke",COLS[CI("13")]).attr("stroke-width",1.5);
 r.append("circle").attr("cx",d=>x(d.b)).attr("r",4).attr("fill",COLS[CI("13")]);
 r.append("text").attr("class","rv").attr("x",W).attr("text-anchor","end").attr("y",4).text(d=>{const v=d.b-d.a;return (v>=0?"+":"−")+Math.abs(v).toFixed(1);});
 d3.select(el).append("p").attr("class","ck").html(`<i class="h"></i>${YS[1]} <i class="f"></i>${YS[0]} · Lula's share of valid votes`);}

// "Find your place": a step where the reader types a municipality; the map flies there in compare mode and the
// card says how it moved against the country
function findStep(el){
 const box=d3.select(el).append("div").attr("class","find");
 const inp=box.append("input").attr("type","text").attr("placeholder","Type a municipality").attr("aria-label","Find a municipality");
 const ul=box.append("ul").attr("class","fl"),res=box.append("div").attr("class","fres").attr("aria-live","polite");
 const nat=(y,k)=>{const F=figures(y);return 100*F.c[CI(k)]/F.valid;};
 inp.on("input",()=>{const t=fold(inp.property("value").trim());const hits=t?[...index.filter(d=>d.key.startsWith(t)),...index.filter(d=>!d.key.startsWith(t)&&d.key.includes(t))].slice(0,6):[];
  ul.selectAll("li").data(hits).join("li").html(d=>`${d.label}<span>${d.uf}</span>`).on("mousedown",(e,d)=>{e.preventDefault();pickP(d);});});
 inp.on("keydown",e=>{if(e.key==="Enter"){const t=fold(inp.property("value").trim()),d=index.find(z=>z.key.startsWith(t))||index.find(z=>z.key.includes(t));if(d)pickP(d);}});
 function pickP(d){ul.selectAll("li").remove();inp.property("value",`${d.label}, ${d.uf}`);const m=M[d.f.properties.codarea];
  const [[x0,y0],[x1,y1]]=path.bounds(d.f),k=Math.min(MAXK,.55/Math.max((x1-x0)/w,(y1-y0)/h)),c=proj.invert([(x0+x1)/2,(y0+y1)/2]);
  restoring=true;applyState(`y=cmp&at=${c[0]},${c[1]},${k}`,true);restoring=false;select(d.f);
  const a=share(YS[1],m,"13"),b=share(YS[0],m,"13"),dl=b-a,dn=nat(YS[0],"13")-nat(YS[1],"13"),ab=abRate(YS[0],m)-abRate(YS[1],m);
  const ns=`${Math.abs(dn).toFixed(1)} points nationally`;
  const how=dl>=0?`rose ${dl.toFixed(1)} points here, while it fell ${ns}`:`fell ${Math.abs(dl).toFixed(1)} points here, `+(Math.abs(dl-dn)<1?`about the same as the ${ns}`:dl>dn?`less than the ${ns}`:`more than the ${ns}`);
  res.html(`<p><b>${d.label}</b>: Lula ${a.toFixed(1)}% in ${YS[1]}, ${b.toFixed(1)}% in ${YS[0]}. His share ${how}. Abstention ${ab>=0?"rose":"fell"} ${Math.abs(ab).toFixed(1)} points.</p>`);}}

// Story: steps (web/story.json) in the left column; the step nearest the column's middle drives the map, which
// flies to that step's view. A small live total sits at the top, so filtered steps show their numbers. Explore
// is the full panel. Opening with a view in the hash starts in Explore at that view.
const steps=d3.select("#steps").selectAll(".step").data(STORY).join("section").attr("class","step")
 .html(d=>`<h2>${d.h}</h2>${d.t}`).each(function(d,i){if(d.chart)chart(this,d.chart);if(d.find)findStep(this);});
steps.filter((d,i)=>i===0).append("p").attr("class","cue").html('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>Scroll to read the story');
const prog=d3.select("#prog").selectAll("button").data(STORY).join("button").attr("aria-label",d=>d.h)
 .attr("title",d=>d.h).on("click",(e,d)=>{const i=STORY.indexOf(d),a=document.querySelector("aside");a.scrollTo({top:steps.nodes()[i].offsetTop-a.clientHeight*.4,behavior:"smooth"});});
let stepNow=-1;
function goStep(i){if(i>0)hintDone("maphint");if(i===stepNow)return;stepNow=i;steps.classed("on",(d,j)=>j===i);prog.attr("aria-current",(d,j)=>j===i?"step":null);
 // the card lights at once; the map's work waits for the next frame so the highlight paints first
 requestAnimationFrame(()=>requestAnimationFrame(()=>{if(stepNow!==i)return;restoring=true;applyState(viewOf(i),true);restoring=false;
  NOTES=STORY[i].notes||[];drawNotes();saveSoon();}));}
// The story's order is fixed, so each step's filters are computed in idle time after load and cached (FCACHE):
// reaching a step then only swaps in the result.
function precompute(){const views=STORY.map((d,i)=>viewOf(i));
 let k=0;const next=dl=>{const save=VARS.map(v=>[v.lo,v.hi,v.vlo,v.vhi]),si=INSET,sy=YEAR,s80=INC80;
  while(k<views.length&&(!dl||dl.timeRemaining()>8)){const q=new URLSearchParams(views[k++]);
   const y=q.get("y");YEAR=YS.includes(y)?y:YS[0];INC80=q.get("80plus")!=="0";setFiltersFrom(q);computeFilter();}
  VARS.forEach((v,j)=>[v.lo,v.hi,v.vlo,v.vhi]=save[j]);INSET=si;YEAR=sy;INC80=s80;computeFilter(); // back to what's shown
  if(k<views.length)(window.requestIdleCallback||setTimeout)(next);};
 (window.requestIdleCallback||setTimeout)(next);}
const viewOf=i=>STORY[i].view;
function storyTotals(){if(d3.select("#story").property("hidden"))return;
 const F=figures(YEAR),oy=YS.find(v=>v!==YEAR),G=figures(oy),N=FILTERED?natFig(YEAR):null;
 const c22=CATS.findIndex(c=>c.k==="22"),c13=CATS.findIndex(c=>c.k==="13");
 const r=(i,n,v,sh,pv,nv)=>`<div class="sr${i===AB?" a":""}" style="--c:${COLS[i]}"><i></i><span>${n}</span><b>${(100*sh).toFixed(1)}%</b><u>${hum(v)}${N?` <s>${Math.round(100*v/nv)}% of all</s>`:""}</u><em>${pv==null?"":((sh-pv)*100>=0?"+":"−")+Math.abs((sh-pv)*100).toFixed(1)+" vs "+oy}</em></div>`;
 d3.select("#stot").html(`<div class="sl">${COMPARE?`${YS[0]} totals`:YEAR}${INSET&&INSET.size===1?" · "+M[[...INSET][0]].n+(PLACEF?", lit polling places":""):FILTERED?(PLACEF?" · lit polling places":" · lit municipalities"):" · Brazil"}</div>`
  +(N?`<div class="scope"><b>${hum(F.all)}</b> people on the roll here, <b>${Math.round(100*F.all/N.all)}%</b> of Brazil's ${hum(N.all)}</div>`:"")
  +r(c22,nameOf(YEAR,"22"),F.c[c22],F.c[c22]/F.valid,G.c[c22]/G.valid,N&&N.c[c22])+r(c13,"Lula",F.c[c13],F.c[c13]/F.valid,G.c[c13]/G.valid,N&&N.c[c13])+r(AB,"Didn't vote",F.ab,F.ab/F.all,G.ab/G.all,N&&N.ab)
  +(N?`<div class="fdesc">${describeFilter().map(x=>`<span>${x}</span>`).join("")}</div>`:""));}
// the national figures, for "x% of all": computed with no filter, without touching what the map shows
function natFig(y){const f=FILTERED,pf=PLACEF,ps=PASS.slice();FILTERED=PLACEF=false;PASS.fill(1);const t=figures(y);FILTERED=f;PLACEF=pf;PASS.set(ps);return t;}
const _panel=panel;panel=function(){_panel();storyTotals();
 // in Explore, the filter count also says how much of Brazil is lit
 const fc=d3.select("#fcount");fc.select(".scope").remove();
 if(FILTERED){const F=figures(YEAR),N=natFig(YEAR);fc.append("span").attr("class","scope").text(` · ${hum(F.all)} on the roll, ${Math.round(100*F.all/N.all)}% of Brazil`);}};
const io=new IntersectionObserver(es=>{const vis=es.filter(e=>e.isIntersecting);if(vis.length)goStep(steps.nodes().indexOf(vis[0].target));},
 {root:document.querySelector("aside"),rootMargin:"-45% 0px -50% 0px"});
steps.each(function(){io.observe(this);});
function setTab(story){d3.select("#tab-story").attr("aria-selected",String(story));d3.select("#tab-explore").attr("aria-selected",String(!story));
 d3.select("#story").property("hidden",!story);d3.select("#explore").property("hidden",story);d3.select("#page").classed("storymode",story);
 // the story gets the studio's width for the map; Explore brings the studio back
 if(!d3.select("#page").classed("embed")){d3.select("#page").classed("nostudio",story);d3.select("#studiox").attr("aria-expanded",String(!story));layout();
  zoom.translateExtent(story?[[-w*.4,0],[w,h]]:[[0,0],[w,h]]);}
 if(story){stepNow=-1;const a=document.querySelector("aside");a.scrollTop=0;goStep(0);}else{NOTES=[];drawNotes();panel();svg.interrupt().call(zoom.transform,d3.zoomIdentity);repaint();}}
d3.select("#tab-story").on("click",()=>setTab(true));d3.select("#tab-explore").on("click",()=>setTab(false));
d3.select("#toexplore").on("click",()=>setTab(false));
if(location.hash.length>1)setTab(false);else setTab(true);
setTimeout(precompute,1500);


// a small column chart for a series given in the step (e.g. abstention by election), the last column highlighted
function seriesChart(el,spec){
 const W=330,H=118,top=26,bot=18,x=d3.scaleBand().domain(spec.points.map(p=>p[0])).range([0,W]).padding(.28);
 const y=d3.scaleLinear().domain([spec.min??0,d3.max(spec.points,p=>p[1])]).range([H-bot,top]);
 const s=d3.select(el).append("svg").attr("class","dumb").attr("viewBox",`0 0 ${W} ${H}`).attr("role","img").attr("aria-label",spec.title);
 s.append("text").attr("class","ct").attr("x",0).attr("y",12).text(spec.title);
 const g=s.append("g").selectAll("g").data(spec.points).join("g").attr("transform",p=>`translate(${x(p[0])},0)`);
 g.append("rect").attr("y",p=>y(p[1])).attr("height",p=>y.range()[0]-y(p[1])).attr("width",x.bandwidth()).attr("rx",2)
  .attr("fill",(p,i)=>i===spec.points.length-1?css("--ca"):css("--edge"));
 g.append("text").attr("class","rv").attr("x",x.bandwidth()/2).attr("y",p=>y(p[1])-4).attr("text-anchor","middle").text(p=>p[1].toFixed(1)+"%");
 g.append("text").attr("class","tk").attr("x",x.bandwidth()/2).attr("y",H-4).text(p=>p[0]);
 if(spec.note)d3.select(el).append("p").attr("class","ck").text(spec.note);}

// Area (Studio): add up Brazil, one state or one municipality (the one selected on the map or by search). It limits
// the map and the totals (INSET) and travels in the view as "in" ("uf:XX" for a state).
var UFS=[...new Set(Object.values(M).map(m=>m.uf))].sort();
d3.select("#areauf").selectAll("option").data(UFS).join("option").attr("value",d=>d).text(d=>d);
function setArea(kind,val){
 INSET=kind==="uf"?new Set(Object.keys(M).filter(k=>M[k].uf===val)):kind==="mu"&&val?new Set([val]):null;
 drawArea();refilter();saveSoon();}
function drawArea(){if(!UFS)return; // views applied before this point in the script skip it; drawArea() runs below
 const k=INSET&&INSET.size===1?"mu":INSET?"uf":"br";
 d3.selectAll("#area button").attr("aria-pressed",function(){return String(this.dataset.a===k);});
 d3.select("#areauf").property("hidden",k!=="uf");if(k==="uf")d3.select("#areauf").property("value",M[[...INSET][0]].uf);
 d3.select("#areamu").property("hidden",k!=="mu").text(k==="mu"?`${M[[...INSET][0]].n}, ${M[[...INSET][0]].uf}`:"");}
d3.selectAll("#area button").on("click",e=>{const a=e.currentTarget.dataset.a;
 if(a==="br")setArea("br");
 else if(a==="uf")setArea("uf",sel?M[sel.properties.codarea].uf:d3.select("#areauf").property("value")||UFS[0]);
 else if(sel)setArea("mu",sel.properties.codarea);
 else{d3.select("#areamu").property("hidden",false).text("Click a municipality on the map or search for one first.");}});
d3.select("#areauf").on("change",e=>setArea("uf",e.target.value));
drawArea();
