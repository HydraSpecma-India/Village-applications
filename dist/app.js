"use strict";
const CATS = [
  {key:'isdNatham',   label:'ISD (Natham)',    g:'g-nat', s:'s-nat', t:'t-nat', color:'#DB7FA6'},
  {key:'flineRural',  label:'F Line (Rural)',  g:'g-fr',  s:'s-fr',  t:'t-fr',  color:'#7FB85C'},
  {key:'flineNatham', label:'F Line (Natham)', g:'g-fn',  s:'s-fn',  t:'t-fn',  color:'#8E7CC3'},
];
const CATS_ISD   = CATS.slice(0,1);
const CATS_FLINE = CATS.slice(1,3);
const CAT_KEYS   = ['isdRural','isdNatham','flineRural','flineNatham'];
const CAT_LABELS = {isdRural:'ISD (Rural)', isdNatham:'ISD (Natham)', flineRural:'F Line (Rural)', flineNatham:'F Line (Natham)'};
const CFG_DEFAULT = {
  isdRural:    {thresholds:[25,30],      labels:['25 Days below','25 Days above','30 Days above']},
  isdNatham:   {thresholds:[25,30,60],   labels:['25 Days below','25 Days above','30 Days above','60 Days above']},
  flineRural:  {thresholds:[60,90,120],  labels:['60 Days below','60 Days above','90 Days above','120 Days above']},
  flineNatham: {thresholds:[60,90,120],  labels:['60 Days below','60 Days above','90 Days above','120 Days above']},
};
const CFG_STORE_KEY = 'nemili.dayRanges.v1';
const BUCKET_COLORS = ['#4caf50','#ffc107','#ff9800','#fb8c00','#f4511e','#e53935'];
function autoLabel(th, i){
  if(i === 0) return th[0] + ' Days below';
  return th[i-1] + ' Days above';
}
function cloneCfg(c){ return JSON.parse(JSON.stringify(c)); }
function loadCfg(){
  let cfg = cloneCfg(CFG_DEFAULT);
  try{
    const raw = localStorage.getItem(CFG_STORE_KEY);
    if(raw){
      const saved = JSON.parse(raw);
      CAT_KEYS.forEach(k=>{
        if(saved[k] && Array.isArray(saved[k].thresholds) && saved[k].thresholds.length){
          cfg[k] = {thresholds: saved[k].thresholds.map(Number).filter(n=>!isNaN(n)),
                    labels: Array.isArray(saved[k].labels) ? saved[k].labels.slice() : []};
        }
      });
    }
  }catch(e){}
  return cfg;
}
function saveCfg(){
  try{ localStorage.setItem(CFG_STORE_KEY, JSON.stringify(CFG)); }catch(e){}
}
let CFG = loadCfg();
let BUCKETS_BY_CAT = {};
function makeBuckets(c){
  const th = (c.thresholds || []).slice().sort((a,b)=>a-b);
  const L  = c.labels || [];
  const n  = th.length;
  const out = [];
  for(let i=0;i<=n;i++){
    out.push({
      key:  'b'+i,
      label: (L[i] && String(L[i]).trim()) || autoLabel(th, i),
      min:  i === 0 ? 0 : th[i-1],
      max:  i === n ? Infinity : th[i] - 1,
      color: BUCKET_COLORS[Math.min(i, BUCKET_COLORS.length-1)],
      last: i === n,
    });
  }
  return out;
}
function rebuildBuckets(){
  BUCKETS_BY_CAT = {};
  CAT_KEYS.forEach(k => BUCKETS_BY_CAT[k] = makeBuckets(CFG[k] || CFG_DEFAULT[k]));
}
rebuildBuckets();
const bucketsFor = key => BUCKETS_BY_CAT[key] || BUCKETS_BY_CAT.isdNatham;
const isFline    = key => String(key).indexOf('fline') === 0;
function allBucketLabels(){
  const seen = new Map();
  CAT_KEYS.forEach(k=>{
    if(k !== 'isdRural' && !store[k]) return;
    if(k === 'isdRural' && !(R && R.ready)) return;
    bucketsFor(k).forEach(b=>{
      if(!seen.has(b.label)) seen.set(b.label, {label:b.label, min:b.min, color:b.color, last:b.last});
      else if(b.last) seen.get(b.label).last = true;
    });
  });
  const out = Array.from(seen.values()).sort((a,b)=>a.min - b.min);
  return out.length ? out : bucketsFor('isdNatham').map(b=>({label:b.label, min:b.min, color:b.color, last:b.last}));
}
function countByLabel(u, label, cats){
  return (cats || CATS).reduce((s,c)=>{
    const b = bucketsFor(c.key).find(x=>x.label === label);
    if(!b) return s;
    return s + ((A.counts[c.key][u] && A.counts[c.key][u][b.key]) || 0);
  }, 0);
}
const CAT_SPAN  = key => bucketsFor(key).length + 5;
const TOTAL_COLS = () => 1 + CATS.reduce((s,c)=> s + CAT_SPAN(c.key), 0);
function optSlots(){
  return bucketsFor('isdRural').map((b,i)=>({key:'opt'+i, idx:i, label:b.label,
    hint: b.max === Infinity ? ('pending over ' + b.min + ' days')
                             : ('pending ' + b.min + ' to ' + b.max + ' days')}));
}
let OPT_SLOTS = optSlots();
let OPT_KEYS  = OPT_SLOTS.map(s=>s.key);
const FILE_NAMES_FIXED = {village:'Village Details', vaoDetails:'VAO Details',
  isdRuralPdf:'ISD Rural Application Status PDF',
  isdNatham:'ISD Natham', flineRural:'F Line Rural', flineNatham:'F Line Natham'};
let FILE_NAMES = {};
let FILE_COUNT = 0;
function refreshFileNames(){
  FILE_NAMES = Object.assign({}, FILE_NAMES_FIXED);
  OPT_SLOTS.forEach(s => FILE_NAMES[s.key] = 'OPT Pending — ' + s.label);
  FILE_COUNT = Object.keys(FILE_NAMES).length;
}
refreshFileNames();
const store = {village:null, vaoDetails:null, isdRuralPdf:null,
               isdNatham:null, flineRural:null, flineNatham:null};
OPT_KEYS.forEach(k => store[k] = null);
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const OPT = {status:'pending', userSource:'village', fuzzy:true};
let TALUK = '';
function talukName(){
  if(TALUK) return TALUK;
  try{
    const t = allTaluks();
    if(t.length === 1) return t[0];
  }catch(e){}
  return '';
}
function talukTitle(suffix){
  const t = talukName();
  return (t ? t + ' ' : '') + suffix;
}
function talukSlug(){
  const t = talukName();
  return (t ? t.toLowerCase().replace(/[^a-z0-9]+/g,'_') : 'taluk');
}
function refreshTitles(){
  const t = talukName();
  const h = document.querySelector('.brand h1');
  if(h) h.textContent = (t ? t + ' ' : '') + 'ISD & F Line — Pending Applications';
  const c1 = document.getElementById('isdCardTitle');
  if(c1) c1.textContent = talukTitle('Taluk ISD Pending Details');
  const p1 = document.getElementById('isdPrintTitle');
  if(p1) p1.textContent = talukTitle('Taluk ISD Pending Details');
  const p2 = document.getElementById('printTitle');
  if(p2) p2.textContent = talukTitle('ISD & F Line (Pending Applications Overview)');
}
const norm = s => String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
const esc  = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TN_LOGO_DATA = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCACAAHQDASIAAhEBAxEB/8QAHAAAAgIDAQEAAAAAAAAAAAAABgcABQMECAEC/8QARRAAAgEDAwMCBAQBBwgLAQAAAQIDBAURAAYhBxIxE0EUIlFhFTJxgSMWQlNikaHRCCQzQ1KCo8ElNGRmcnOSk6KxtfD/xAAaAQACAwEBAAAAAAAAAAAAAAAEBQIDBgAB/8QAMBEAAgECAwYDCQEBAQAAAAAAAQIAAxEEITEFEkFRYYEiQnEGEyMykbHB0fCh4fH/2gAMAwEAAhEDEQA/AOp9TU15rp091pXe9W6wUEtwutbT0VJEMvNPIEUfuff7edDe9OoMe3qmCyWmie9bkrVJpbbC2ML/AEkreI4x9T59tBe59lXq37frN6bj9Dde46JPXiopEJoaBAcuYYOPUZVycsctj21Wz20lTVLXtL4dSr7us9uwtrTVlMTgXe7MaWkP3Rcd8g/QDX2uxN63r59xdQqymVvNLYadKVF+3qN3Of7tCNFU7kp95pFb9yUVU+4Lb8ZZrzcIDIJVVVZqRI1ZUjGfn4GcfUjIamxtwzbq2jab3UU6001ZTrLJEpyqt4OP6uRkfYjUFO9rK0s5s14oZ7H01qrct2rrRvncFGZFjWsq5J2SRmkEYwWdQcuQMjRjS9BunVZSQ1A2xUUMkih+xqyZZYifY4kIBH2J19Q7KvLdJU236EMVyjnDojyjtAWt9VT3DI/IAf7tMcEHOCPOuWmp+YCclFTmyj6RS3bZls21XJb7DvHetHcmj9ZaKiqHrgsecd7xurBVzxliM4wM62LXfeo1BFJPSS2je1HA3ZNF6Zt1xiOM9rI3yd2OcHGfbg6y7woqi3Nuyneohty7j+HWO6z93pQxCNYpYywHyuqh2QHAYvwc51Y7OSvutxtN9gt8dHRijqrfMVVohURRyp8LIsb/ADBSokIzyAx8g66wvYZT0LY2GU3tsdUbDuSuNqkNTaL0v57Xc4/QqAf6oPDj7qTow1R7r2XYt6UIpL3b46kLzFL+WWBv9pHHKn9NBP4xuTpLKse4qio3BtLIVLuV7qu3g+BUAfnT+uOR7/TU94r80nvFfm05xpamsFHWU1wpYqukninp5kEkcsbBldT4II8jWfVktkGpqAamunSaCOp/UNNlW+ClozTS3u4n0qKGdwkac4M0pP5Y1yM/U4A0VXm70dhtVXdLhKIaSkiaaVz7Koyf30s9rWbcNyttb1Clt1FV7iu5jkpbfXEhaegVu5KdG8JIww3cRjuIzqtydBK6jH5RrM+0anbfT+Wf8Sq66tuldUelc9xz0r/Dy1OcGIzY7UVW+UD8oIwTnOmLd7hDbLXVV06GWKniaR0BUFgBkj5iF5+5A++knfKh6/8AEGstVNZLTXSRSXO1XeMqfiJJSJGjQ/lUFXaTnscxnGR3kjV83Jfuum5Itu2WO7HadI6rNNDGC84X/WysxVQzYyqngee0njVRq7osB6Sg1gg3QM+EudkU1d1BDWHb4W3bUt08nqzCQylPUJZoIpCAzZBxhexFU8+oDyxKe4y2m4s0UXpxwj4dYBwqIo7VUAcDGB7aLdubctm1LNT2i00q01JTrhUHJJ92Y+7E8knzoYvBAvNTEDAUE3qYkHlivjWc9pPe0qVJ0exDf7bL6RzsimoLK4vcTJDertbmKVCuX9L5RNkg4Oe778ca+KC8VNPR3CSOVQzt39uD3KzHHcD4wPprHLRvSyQ00MtP8T2dshWQl2JHKcfbjUSo9QSQQUVLRoq9s4lkYBjkAZPng/8APWdFbEo4DVD4bgA3JuRzA4cb9rxruUyLhRna/Djy68J5Wbgqq6nkp5m+R2Q8eVAHI/c86xXu8bws1jo7/YqUXuCANHW2xxiSSME4liYc94HBU5yPAyOfu509LS1ANFLTMhVHU+oSQffj6fro1tKIlspljVFX01OEOVB8nB/XTf2fXEtjanv6lyBbnxy/usD2iKZoKKYtc/iD+wupm3+odE01pqCtTEMz0UwCzQ/qPcf1hx+/GssO9rNdNyV+15IqgSwd0TSTwYp6hgivJGrHhmVHUlSPB9wDpPdS+lV32tfZt37Jjuy1iStWTVRrYeyPOWf5W7Wx9ssCMjWK1b1g31arjdGjNPUyrFLXrAjObfWRoUjrFRcs0Eifw5MAlcc8HOtaKzA7ra/eZwV2B3H1+8JLRf7Z01uclXYbtS3Xp/U1Po1KU0wm/AqljweCcQsfI9v/ALc8brIiujKysMhl5BH1Gue+mqW+6XGSvmqTLtqCxG3XR6ukSlpYEXHp05b/AF0i5cmTjgrwCdHHSq8PZK+o2HWVvxkVNCtbZK0t3fGW9/ygH3KZx+mPpqVJ/oZKi/0MZw1NQfpqaIhUVvV+50dyu1k2jXVUdNbJCbteZHbCrRwsO1D/AOOQquPfGiKk6r7HmlWm/lDR0kh4WOtV6Un9BKq6X1bt68b+v29r7ZZ0Wtt9ypaCg7zgMtKvdIoYghW737lYggMqnHGs1a1Dba60xtDvG13CSrQ1VPeKiSrpZ6eMGSclnaSJ8Ro2CpDZIOhwxuTBd9gSw4wd/wAo69wXDcVHtixW1am9VEKJVTwRd87xkkx0645wcliPpgeCdNHpN07tmx7IktJHdkqqtA063CTDq3/lKxRD+mTjGSdc8bEoqjqb1FrbxWIZHmnNSc3QUXYWJ7R3AGRgFGMR4PHJGuu6GkjoaOGmiXtjiQIo7mbAA+rEk/qedQw/jY1D2leF+IxqntM+gqalqai4yyuaTsadw2fTLqufzEH/AB0Y1EqwQSSO3aqKWJ84wNBFEtuiczt8XInYysTEgBDEqT5yeTpJ7QsrNSptpmTnblnH+BBAZh6aXmagFalXD/Dou2Ikjt9IHweeDkHWbNcaepEtXRunylO4xMc5zyBxn7njWrQw2xaplWWpmEaSsGaNAr4Xk8/89Y6aS3SCqPp1Sn0S5/JxhlPAAHOs7Sq7qBS2pbz9Og/tYc6XYkDlw6zahpLi0azyJD8PKeyb0kiwq5858fQ6vtsmUWpIpVAaJmQYIORnIPH66o6KjpKqSaEVFWrSP2yIwRgOO7u44xx5+uNWG1J6MtVQ0jTkEiQiUKPtkY012QRTxNM3+YEZsDnqcrdOxMGxV2RstLHSW11tNBe7fNb7nRwVtJMAJIJ0DI4zkZB+4zrmDeax9I+oNHuDbk234BBKYai2W2uZ5CvPeskb8p3LxxwGAPB11VjSe69miNvekuEtHQ0s8X/W5Nvy1bI+fadWAjPH0zrV4hLrcaiZ/FJdN4aiWG2OnVt3jKN37huKX6G5SLXU1DGhioYx2gI7RZPqSBQoJbPI8ca2+sFvktFttm9bZCBWbXnFQUjGPUpGws0fHt28/bGgf/J33vVjZtysFLHT11xoKgPQU09SIBNHJlmAYg/lKyNjBODpjC47lrrpDYd1Wmz09uvVNUwL8HUyTsrhAe1iyKMFC54H83XiMrpccfvPKbK9MEDX7/8AsM6Krhr6SGrpnEkE6LJG48MrDIP9hGpoF6H1skuwYLZWSZqrJUz2qUk8/wAJyF/+JXU1crXAMIRt5QZTdJts0W6+mNLU3BqyOSuuNXclmpamSCVJGmdQwZCD4GOcj7a1eqW2a3bGy71eKnc1zu0dPQSUdHDXJGzwtUPHG7eooUse3KjuBIyeedUeyup1HtPpNYrUldR2+5yxKYJqxS8YSSqmV37FPc3YEJI45ZfvrN1C3DX3zpBuWCtudBePQahqILhQwmKOoglkUglMnBDK4PPsPBzoYsvu8tbfiBl191lrb8QB6PXGyUojStXZj1ImLKtfbKiprQM8EMoKAfT3GusqadKmCOaMkpIoYEqRwfseR++uT+j9bchStBS1XUEQrKS0e36WJ4ASf5zvnB+vGupLAXNnpfU/Ee/s5/EO34jz/P7eM/pr3CHwSWBPwwJ87iqGprXKUQO7kRhSvdnJ+nvqipZqmSjMVRboyI2yifCsOO0+AB57sf36tN0BpIqWFKmKnYy93e79uMA8j+3VPWSimpPRa5n4vtKyqWd0kUnKnPsQMcjWb2tWYYpnJsqrbhY3ztnx/U0WFQGkFAzJ6zLQfiSpM7WyNClO5T/NQuWPt9888a+qCpuM00yzUEfzQPyaTt7mA4B45/TWlFPPSQVizVakvRgpiY4GSPr4bGtSy3GMVokar9SHsfu7Zg5x2n2B50pp12U0gN+3HS2ts8uX+QpqW8HawlhTR3cSo0FBFE/cB3mjCYJzznHAA1cW6KqjuNO8iK4aKSN3SAxquGBH7fTVLCgmhp4qe6xJMUKt3VEnzNn5ceMZGsyVcMV3adq6MPG8faxlZlKBe1lPGM++icHVSiVZmJzGrC3M98rH1lVZC9wBwPDtDH99LDqzc6qmqEjgqa6JVg+YUe4KehLZJ/NHMCD+umaCMA50kuqN0sdbdKqnr06Z1NVExQfissqVSgeASi5z++NbeqfDM/XNli06GUdNW9RayyVXqRxVdNMEeGcGSCSNldHSVOO9cN8y8HJ9iRroqk6Z2yhulBdUuV8nraKYyrLWXGWo7gUZWUq5KgEN5AB41zp0G9N+s9I0MVPFEFqyqUzM0Sj02GELEsV+hPOuuidD4MA08+cGwCg08+c5g3Zv2bp7v3ddrgLqk9zNZhTxmSKMn+8HU0Idfz6vVq+lAT2mFTj6iFNTQNSs6uQDxi2rXdXZQeMaWxNk3aut1aLRc4aeu25d5qT4CohUxVJiqTURB5MF0U+ow+UfTOfGr3cXTm/U+0L7B61uqRdLbNLcFjVkKVSySTp6A8FO5ymDg4UHySNW1jb+THWi+2t/kptyUcVzps+DNF/DlUfcjDaZDYZSCAQfY++miUwVt2jinSUqR2nEnTqOGqrjGlsvFdVA94FFeo7eoX2yWXk/o37a652Ck8e24Vno6qjYM2I6q5fHvj6+rk59+M8a5L3xtk9PupFVbnoqSpphP6tKlXAZomhkPyEoCC3bkjA8lcYOurLbeLbt7btFQ0nwskkUCgR0tL8NEGIyT6Y/0YySe3yPHnS9MVSwqM1dgoH93lWy6NRyaai5E1N1yNV3SRFVmWnjCkjwpPJ0P3K4ySszMTmOHuyFz2og/Ko8FsZwD58nVr30xn9avJlaoh72ZMN2uzecZ4IGhi+00UaNWxSenMpCoSCe5m+ReM4Bw3nxjzrEUnpYjaG/iDcOTlfj5bj0M3WGp2QJyGv91nlwroBIFYtVUkReQMIwJRj5ctg9pADHJAX98YOilzeppo3enpo56ZO9PTdVBZCW734GQQAvHJOqe+VcRalii9IERsrBlyChXlcfQ5z5BBAIOdfU0VUjR1U9U9RGhPNS7TsEyMoob8pbABYZbHv51tlREU06agLyGkYU8Ou6CxzMMPxCFstG8khiWR54hH8sSqQFCtk9zHI4OAQeO04BsqeVSOx0Ll4zGvbgYzgg/wD99dA9qhNdcUheVhG8ff3KMMjrglQR4zyQD8p84JHJlSiKkhMSR+E7E+Yns588+T98++sdt6nhaFRBSAVuPK37g70iote8PLBXi5WqPLN6kY9KQjg5A8j9sHSZ6pS19otFZ+KUW8J6FQUE9dT26uplJOFPcQXQEkc5B5+uj223x7WymFO5SO2VG4D4JwwPscHH7aU/+UHSRVlObvRWa7CJnjaev/ES9MjHIKPASexvGGGAfvrRbL2xTxOHFIt8RRn16/uZDbGFeirVAPDAjpMtZbl3BuKmNVElvo4qeWqpo++SlSedFklQe7LEshH086cPTXcEdBvKW37XRbltm8VLJDNNcnlqIXhiBlnKvk9jsQOSCTj6jVb026SXiHpxTXi03u5WXcVYHq4PSm7YWRgBGsyEEMO0BvGR3aM5trWXpFa73u6BKZXpbRHTRlIQjuyA5Z2z87ySFMn+qNOaFNkUExTh6TIik5cYH2fYMXUm97rv7qrI18qKeJiPKRqiD+8HU0yukG35ttdO7NR1AxVyxGqqc+TLKTI2fuO7H7amrloIRdhnL1wqMLsMzKTrzty4XDaqbgsU09PebAzVUMsDFZPSK4lUEc/l+b/dOlxaYtw3uKhqaHqXuZ6asNOFYyDK+pNBEwOD5UzN+6j666SdVdSrAEEYIPIOue66wDpXvuG2t3pt+819LLbZP9XTSCrhkliY+3CZH1GPvqNZLHekMRTs2/wlHYbTcLhvzaFdeNwXC6zSVKRo1XhzEHo/X+UnPhmwP0z50zxeaDA/hVv/AAv8NAu2ud2bIz71tP8A/lJp3jZlgwP8xH/uN/jpNtDZTYshqdsud+kbbHxFGgHFUE3PCBX4zQf0db/wv8Nad4qKG622ejArUaQfI38Phgcgnjxkasd6U9HY66CmobUXVhGWKfOxDOVLfM4ARMZbHPzDx739qse36uyQXOrooadWj9R29VwgH+0CT+U4yM+xGgx7N4qnaoCv+x2u1MIGBCtft+4pYdmX6spKO6RQxSvP6gWL1VDlY8MWHPPHcACc4GTjPGOmsd+usEkcVNL6cTxxymQ9nJkCYUtyTk5yOABxnRe91taNa7fTO/wsT19VKw7iVWQSxrGnueDn9ADr24XWotsVume4xy9tFQVc0TqQH7SxYA/VuMfTt07WkoGZ9fpGZx1cn5R0uDzP4g7tmOSC9VtZdYqpZIiYVQEZD+Hz3ewx/azYONFX4rb/AOjrf7Y/8NEVltO3bvPXCVY56v4mSRl9Ug9rEFSAD+XDDn76G93JTWi9pR0tuSOFSgZychFKljLJ3MD6YI7cLzkHnwNKK+wMRi6xe6nle+kBr7Ww5b4isDYaafefX4rQf0db/bH/AIaFuqMUF72U1PBJUwiS6UNOxkCkfO7DOB5x9NNm37UslZQU1TLbPRkmiSRojI+UJUEr59s40HdZLLQWjadD8DAIvUvdu7/mJziXjyfudQwuwHoVRUcLYcr3izaOPw9XDOlMG55xbRUW9RTFl6i31FRGIUMcALHVtj83/ZAP9/7c5bft3cG6t/27aNw3fdr/AG6A/HXaKoYiOJI5T2IR3HLN2r+nd9tbNyvFPZbX606ySNIwhjhjXueV5Eucaqq++WdR++mr0k2LNtCyz1l2KyX+7y/F3GQc9rnkRA/Rcn9yftrQJT3jaZhKQZgB3zh4owMDjU1BqaOjGBnUie+QRW17bWPRW8Tj4+ojliiZELIBmSQ4RMFySATkKMYJ1pww2nqNtWosV+qoq+CoqJ4aOqyqSVaxEYqIgPJUnBZR2nGfDY0c1VLBW08tNUwxzQSoUkjkUMrqRggg+QRpZbh2BcbdVrPa5a+v9QJT04NQ4mRsn0keVQDFSwgByFy0j47iSADWwlTqfURcJbr1sHqBtyzbiKfDwVpeiu+QkU8a0hgjX6K4wgIJ8n9CcaS9ZOxcjd2cDOVbTYrLlZdwWar2xuaP+URhLUxlhpgpr6iNGd1hQNn1EUDuZSFDNgEHIFXDTb46UKFooqreO1VGVpyf+kaFPoP6RR9PP6aCrYbe8xA6QCthN7zEDp+YtqmDq3WKq1NNuecKcqJYS4B+oyNWVq/l5VVa0u6ay+09HKQRHWkhZu1gxUAjyR7+3GnRtLqVtbeqdtpucRqhw9HP/CqIz7gxtz/Zkasdx7aoty0scNWZY3hf1IpYm7WRsYP6gg4IPnUVwPmFQnvlDNl4ZMPiErtUJA78Mvoc4qbxY6RXp4oKiX16upWOSsFSswManCjIJC/LgY4OsN0tVOtKJ4xcE9B46UxyTlvWTkALk+2SR+41cv0y3jP3Csu1pqiwILhGiLfc9q5/v41nPT7d/qRyi40YliBEbPUO/aTxkZTg49/P31I0yfLN2uMprYe+Bt6/rt0gvcrLdrVMHtN1qoZBA0ULU8odmb5AqLj5hwyjGPIwMg6GpI+rs7I8sG6ZGjOULxFih+oJHH7acOzOnNVbKlK/cdVDXVVO4NIsLN6cQx5OcdzZ8Z8fro3ra2ktlK9VW1MNLToMtLM4RFH3J414cGX8W8V9DMpt9ExdVd2ofCLEjIH925/ic1+p1k/73f8ApbUvt13Pb9jVLbxkuhqfxi3y0cFcSJJgjMziNTyf5ucfUaY9760/ihqaLp/bHvs8Cs09ylBjt9GAMlnf+dgAnA8+2dVtNarXtV5927kv1FubeCLE4kqJOyntkcjKA6x4yka9wJbGfp251FMLutcOT6nKIEwm611qE+py/wCyv23tBLQkW8N9VUtqr5EaO1UkKB5bfD3tI0rKQQ0qrIxY4PYuTjj5TDblz3HJulKJq+orXVzNW59OShakcMYZYHUBkc4CiMk5AYnIw5FNw3o32qoBPQXB7jUXH4YSUlQ8UMvaCqsIpW76aVJTH83b8pJPcwcqWxtDbse2bFT0Iio1qMd9S9JD6Ucsx/M4X2z9PAGAABgA1F4CH01zsNJdjxqag1NXwiTXmNe6munQEn2dV7TuVXedqW+mrpZ4DAlDVTsi0pLFiYWOQqM57nTjOMg8BdDNB1Num246ukuCG4C2ymORXV2q6sgyNLJ3fki7RHJII2GFj7Pm5GnD7arL3tu07jhjhutElXHE/equSOcYIOCMgjgqeCPIOoFT5ZWUPlNoI3La+xOpsDVlyta09dHIsLSsfhquGRgGQd6nkkMpXlgQeNaI6bb22/gbW6jVrU68JSXqnWqUD6d/5v7tWl22dcKK5012t0a3do6yW41EFTKsTzT+l6cHae3tCRrkBTjnBznORukt25KajMNXFfYqEpRG9NJIxknkMkhqGh7WJ7cFA3Zj5OByNQKi+YlZUXzGcs/iutVvHY9v2ZdAPDxzTQFv2PGvBe+s0nCbU2rCf9qS4uwH7DVJt/closj115sdZW0trqbzT0s61kYFNFH85Yx4JwSFAxwRlQQSdE9h6hC7U2ylF0t01bdeK+niZTIpNNI/5Acph1Gf7NeC3OeLbTeMpLseqaxI973htnbcU7diJbqJ6mdjjJCBhknHPGtZOnW0p0oLvuK9XzftVWE/CRSSmRJSv5ikSkKAvv3HA8HnjRzu6kvtLcaW+bfoIrlVQ00tIaaSUJ2iR42Ei5IBx2crkZBHPGqCPpncL/TSSXuoFsqJZ3q0WgkLei08aioTnj/SIJFIJw3POOeKZ856aedrX9ZqX/c8gpaC07btb01A8vpNSU6tTTiSIkzU5VBlSFZJAE+Z0SQKeRm121ta83RLVVbgEApqVpZoqeoRpapFkRkMDyMfmiw2cMCxARW5UklFt2jZ7Xcai5xUvqV9Q5kkqZ3MkmSADgt+UYAGFx4GrjGNWBOcsCcTBDbPTiisFc1bLUfFyrIzwKsCwxw5J7flXyVVioPgDOACzEmGpqakBbSTAA0no1NeDU17PZ//2Q==";
function toast(title, msg, kind){
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + (kind||'');
  el.innerHTML = '<b>'+esc(title)+'</b>' + (msg ? '<span>'+esc(msg)+'</span>' : '');
  box.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 260); }, 4200);
}
(function initTheme(){
  const btn = document.getElementById('themeBtn');
  let theme = 'light';
  try{ if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme='dark'; }catch(e){}
  const apply = t => {
    document.documentElement.setAttribute('data-theme', t);
    btn.innerHTML = t==='dark' ? '&#9728;' : '&#9789;';
    btn.title = t==='dark' ? 'Switch to light theme' : 'Switch to dark theme';
  };
  apply(theme);
  btn.addEventListener('click', ()=>{ theme = theme==='dark' ? 'light' : 'dark'; apply(theme); });
})();
function fixYear(y){ y=+y; return y<100 ? (y<70?2000+y:1900+y) : y; }
function toDate(val){
  if(val==null || val==='') return null;
  if(val instanceof Date) return isNaN(val)?null:val;
  if(typeof val === 'number'){
    try{ const dc = XLSX.SSF.parse_date_code(val); if(dc && dc.y) return new Date(dc.y, dc.m-1, dc.d); }catch(e){}
    return null;
  }
  let s = String(val).trim();
  if(!s) return null;
  s = s.split(/[ T]/)[0];
  const mi = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  let m;
  if((m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,})[-\/\s](\d{2,4})$/))){
    const mon = mi[m[2].slice(0,3).toLowerCase()];
    if(mon!=null) return new Date(fixYear(m[3]), mon, +m[1]);
  }
  if((m = s.match(/^([A-Za-z]{3,})[-\/\s](\d{2,4})$/))){
    const mon = mi[m[1].slice(0,3).toLowerCase()];
    if(mon!=null) return new Date(fixYear(m[2]), mon, 1);
  }
  if((m = s.match(/^(\d{1,4})[-\/.](\d{1,2})[-\/.](\d{1,4})$/))){
    const a=+m[1], b=+m[2], c=+m[3];
    if(m[1].length===4) return new Date(a, b-1, c);
    let day=a, mon=b;
    if(a<=12 && b>12){ day=b; mon=a; }
    return new Date(fixYear(c), mon-1, day);
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}
function findKey(header, candidates){
  const H = header.map(h=>[norm(h), h]);
  for(const c of candidates){ const n=norm(c); const hit=H.find(([k])=>k===n); if(hit) return hit[1]; }
  for(const c of candidates){ const n=norm(c); const hit=H.find(([k])=>k&&(k.includes(n)||n.includes(k))); if(hit) return hit[1]; }
  return null;
}
function detectHeaderRow(rows, mustGroups){
  const limit = Math.min(rows.length, 20);
  for(let i=0;i<limit;i++){
    const keys = (rows[i]||[]).map(norm);
    const ok = mustGroups.every(group =>
      group.some(cand => keys.some(k => k && (k===norm(cand) || k.includes(norm(cand)) || norm(cand).includes(k))))
    );
    if(ok) return i;
  }
  for(let i=0;i<rows.length;i++){ if((rows[i]||[]).some(c=>c!=='' && c!=null)) return i; }
  return 0;
}
function readWorkbook(buf, mustGroups){
  const wb = XLSX.read(buf, {type:'array', raw:true});
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:''});
  const hIdx = detectHeaderRow(rows, mustGroups);
  const header = (rows[hIdx]||[]).map(h=>String(h).trim());
  const objs = [];
  for(let i=hIdx+1;i<rows.length;i++){
    const r = rows[i];
    if(!r || !r.some(c=>c!=='' && c!=null)) continue;
    const o = {};
    header.forEach((h,j)=>{ if(h!=='') o[h] = (r[j]===undefined?'':r[j]); });
    objs.push(o);
  }
  return {header, objs};
}
const MUST = {
  village: [['village'], ['name','user','surveyor']],
  vao:     [['village'], ['name','vao']],
  detail:  [['villagename','village'], ['applicationdate','appdate','date']],
};
function readRawRows(buf){
  const wb = XLSX.read(buf, {type:'array', raw:true});
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:''});
}
const STATUS_COLS = ['Application Status','App Status','Current Status','Status','Application status'];
const CLOSED_WORDS = ['approved','completed','complete','closed','rejected','cancelled','canceled','disposed','issued','delivered','finalised','finalized','done','sanctioned'];
function statusKeyOf(header){ return findKey(header, STATUS_COLS); }
function statusRaw(obj, sCol){
  if(!sCol) return '';
  const v = obj[sCol];
  return v==null ? '' : String(v).trim();
}
function statusIncludes(raw){
  const n = norm(raw);
  if(OPT.status === 'all') return true;
  if(OPT.status === 'openish'){
    if(!n) return true;                                  // blank = still open
    return !CLOSED_WORDS.some(w => n.includes(w));
  }
  return n.indexOf('pending') === 0 || n === 'pending';
}
function statusLabel(raw){
  const s = String(raw||'').trim();
  return s === '' ? '(blank status)' : s;
}
const VILL_NOISE = /(village|villages|gramam|grama|kirama|panchayat|panchayath|rf|rv|north|south|east|west)$/;
function villageKeys(raw){
  const base = norm(raw);
  if(!base) return [];
  const keys = new Set([base]);
  let k = base;
  for(let i=0;i<2;i++){
    const stripped = k.replace(VILL_NOISE, '');
    if(stripped && stripped !== k){ keys.add(stripped); k = stripped; } else break;
  }
  const noDigits = base.replace(/\d+$/,'');
  if(noDigits && noDigits !== base) keys.add(noDigits);
  return Array.from(keys);
}
function editDistance(a, b, max){
  if(Math.abs(a.length-b.length) > max) return max+1;
  const prev = new Array(b.length+1);
  for(let j=0;j<=b.length;j++) prev[j]=j;
  for(let i=1;i<=a.length;i++){
    let cur = [i]; let best = i;
    for(let j=1;j<=b.length;j++){
      const c = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a[i-1]===b[j-1]?0:1));
      cur[j] = c; if(c<best) best=c;
    }
    if(best > max) return max+1;
    for(let j=0;j<=b.length;j++) prev[j]=cur[j];
  }
  return prev[b.length];
}
function buildVillageMap(){
  const map = new Map();         // normalised key -> user
  const conflicts = new Map();   // village label -> Set(users)
  const info = {rows:0, villages:0, conflicts, missingUser:0};
  let pairs = [];
  if(store.village){
    const {header, objs} = store.village;
    const vKey = findKey(header, ['Village','Village Name','VillageName']);
    const uKey = findKeyStrict(header, ['Name','User name','User Name','Username','Surveyor Name','Surveyor','Officer','User']);
    const tKey = talukKeyOf(header);
    pairs = objs.filter(o => !tKey || inTaluk(o[tKey]))
                .map(o => [o[vKey], String(o[uKey]==null?'':o[uKey]).trim()]);
  }else{
    return {map, info, keys:[]};
  }
  const seen = new Map();        // primary key -> {user, label}
  for(const pr of pairs){
    const vRaw = pr[0];
    const u = String(pr[1]==null?'':pr[1]).trim();
    const keys = villageKeys(vRaw);
    if(!keys.length) continue;
    info.rows++;
    if(!u){ info.missingUser++; continue; }
    const primary = keys[0];
    const prev = seen.get(primary);
    if(prev && norm(prev.user) !== norm(u)){
      const label = String(vRaw).trim();
      const set = conflicts.get(label) || new Set([prev.user]);
      set.add(u); conflicts.set(label, set);
      continue;                                   // keep the FIRST mapping, flag the clash
    }
    if(!prev) seen.set(primary, {user:u, label:String(vRaw).trim()});
    keys.forEach(k=>{ if(!map.has(k)) map.set(k, u); });
  }
  info.villages = seen.size;
  return {map, info, keys:Array.from(map.keys())};
}
function resolveUser(vRaw, vmap){
  const keys = villageKeys(vRaw);
  for(const k of keys){ const u = vmap.map.get(k); if(u) return u; }
  if(!OPT.fuzzy || !keys.length) return null;
  const target = keys[0];
  if(target.length < 4) return null;
  const max = target.length > 9 ? 2 : 1;
  let best = null, bestD = max+1, ties = 0;
  for(const k of vmap.keys){
    const d = editDistance(target, k, max);
    if(d <= max){
      if(d < bestD){ bestD = d; best = k; ties = 1; }
      else if(d === bestD && vmap.map.get(k) !== vmap.map.get(best)) ties++;
    }
  }
  if(best && ties === 1) return vmap.map.get(best);
  const subs = vmap.keys.filter(k => k.length>4 && (k.startsWith(target) || target.startsWith(k)));
  if(subs.length === 1) return vmap.map.get(subs[0]);
  return null;
}
const USER_COLS = ['Pending At','PendingAt','Pending With','User name','User Name','Username','User','Assigned To','Surveyor','Officer'];
function getDaysPending(obj, header){
  const pCol = findKey(header, ['Number of days pending','Days Pending','Pending Days','Days pending','No of days pending']);
  if(pCol){
    const v = obj[pCol];
    if(v != null && v !== ''){
      const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9.-]/g,''), 10);
      if(!isNaN(n) && isFinite(n)) return Math.max(0, Math.round(n));
    }
  }
  const aCol = findKey(header, ['Application Date','ApplicationDate','App Date','Date']);
  if(aCol){
    const d = toDate(obj[aCol]);
    if(d){
      const now = new Date(); now.setHours(0,0,0,0);
      const t  = new Date(d); t.setHours(0,0,0,0);
      const diff = Math.floor((now - t) / 864e5);
      return Math.max(0, diff);
    }
  }
  return null;
}
function bucketKey(days, list){
  const L = list || BUCKETS;
  for(const b of L) if(days >= b.min && days <= b.max) return b.key;
  return L[L.length-1].key;
}
function aggregate(){
  const vmap = buildVillageMap();
  const counts = {};              // cat -> user -> bucketKey -> count
  const villages = {};            // cat -> user -> village -> bucketKey -> count
  const users = new Set();
  const unmatched = new Map();
  const unreadable = {};
  const statusDrop = new Map();   // status label -> count
  const noStatusCol = [];
  const disposal = {};            // cat -> user -> {approved, rejected}
  const villDisposal = {};        // cat -> user -> village -> {approved, rejected}
  let totalRows = 0, matchedRows = 0, statusSkipped = 0, talukSkipped = 0;
  CATS.forEach(c=>{ counts[c.key]={}; villages[c.key]={}; disposal[c.key]={}; villDisposal[c.key]={}; unreadable[c.key]=0; });
  for(const cat of CATS){
    const f = store[cat.key];
    if(!f) continue;
    const vKey = findKey(f.header, ['Village Name','VillageName','Village']);
    const sCol = statusKeyOf(f.header);
    const uCol = findKey(f.header, USER_COLS);
    const tCol = talukKeyOf(f.header);
    if(!sCol && OPT.status !== 'all') noStatusCol.push(cat.label);
    for(const o of f.objs){
      if(tCol && !inTaluk(o[tCol])){ talukSkipped++; continue; }
      totalRows++;
      const vRaw0 = o[vKey];
      const findUser = ()=>{
        const fromCol0 = uCol ? String(o[uCol]==null?'':o[uCol]).trim() : '';
        if(OPT.userSource === 'col')          return fromCol0 || null;
        if(OPT.userSource === 'colthen')      return fromCol0 || resolveUser(vRaw0, vmap);
        return resolveUser(vRaw0, vmap);
      };
      const sRaw = statusRaw(o, sCol);
      if(sCol && !statusIncludes(sRaw)){
        statusSkipped++;
        const lbl = statusLabel(sRaw);
        statusDrop.set(lbl, (statusDrop.get(lbl)||0) + 1);
        const n = norm(sRaw);
        const kind = n.indexOf('approv') === 0 ? 'approved' : (n.indexOf('reject') === 0 ? 'rejected' : null);
        if(kind){
          const du = findUser();
          if(du){
            const d = disposal[cat.key][du] = disposal[cat.key][du] || {approved:0, rejected:0};
            d[kind]++;
            const vl = (vRaw0==null||String(vRaw0).trim()==='') ? '(blank village)' : String(vRaw0).trim();
            const vd = (villDisposal[cat.key][du] = villDisposal[cat.key][du] || {});
            (vd[vl] = vd[vl] || {approved:0, rejected:0})[kind]++;
          }
        }
        continue;
      }
      const vRaw = o[vKey];
      const fromCol = uCol ? String(o[uCol]==null?'':o[uCol]).trim() : '';
      let user = null;
      if(OPT.userSource === 'col')          user = fromCol || null;
      else if(OPT.userSource === 'colthen') user = fromCol || resolveUser(vRaw, vmap);
      else                                  user = resolveUser(vRaw, vmap);
      if(!user){
        const key = (vRaw==null||String(vRaw).trim()==='') ? '(blank village)' : String(vRaw).trim();
        const rec = unmatched.get(key) || {count:0, cats:new Set()};
        rec.count++; rec.cats.add(cat.label); unmatched.set(key, rec);
        continue;
      }
      const days = getDaysPending(o, f.header);
      if(days === null){ unreadable[cat.key]++; continue; }
      matchedRows++;
      users.add(user);
      const bk = bucketKey(days, bucketsFor(cat.key));
      (counts[cat.key][user] = counts[cat.key][user] || {});
      counts[cat.key][user][bk] = (counts[cat.key][user][bk]||0) + 1;
      const vLabel = (vRaw==null||String(vRaw).trim()==='') ? '(blank village)' : String(vRaw).trim();
      (villages[cat.key][user] = villages[cat.key][user] || {});
      (villages[cat.key][user][vLabel] = villages[cat.key][user][vLabel] || {});
      villages[cat.key][user][vLabel][bk] = (villages[cat.key][user][vLabel][bk]||0) + 1;
    }
  }
  CATS.forEach(c=> Object.keys(disposal[c.key]).forEach(u=>users.add(u)));
  const userList = Array.from(users).sort((a,b)=>a.localeCompare(b));
  return {counts, villages, disposal, villDisposal, users:userList, unmatched, unreadable,
          totalRows, matchedRows, statusSkipped, statusDrop, noStatusCol, talukSkipped,
          vmapInfo:vmap.info};
}
const dis = (cat,u) => (A.disposal && A.disposal[cat] && A.disposal[cat][u]) || {approved:0, rejected:0};
const disSum = (cat, users) => users.reduce((a,u)=>{ const d = dis(cat,u); a.approved+=d.approved; a.rejected+=d.rejected; return a; }, {approved:0, rejected:0});
const pctOf = d => (d.approved + d.rejected) ? Math.round(d.rejected/(d.approved+d.rejected)*100) : null;
const pctCell = d => { const p = pctOf(d); return '<td class="num '+pctCls(p)+'">'+(p==null?'—':p)+'</td>'; };
const disCells = d => '<td class="num'+(d.approved===0?' zero':'')+'">'+d.approved+'</td>'+
                      '<td class="num'+(d.rejected===0?' zero':'')+'">'+d.rejected+'</td>'+
                      '<td class="num dtot">'+(d.approved+d.rejected)+'</td>'+ pctCell(d);
let lastMatrix = null;
let A = null;                 // current aggregation
let searchTerm = '';
let activeBucket = null;      // bucket filter key
let activeCat = null;         // category filter key
let sortCol = null, sortDir = 1;
const openUsers = new Set();
function loadedCount(){ return Object.values(store).filter(Boolean).length; }
function maybeAutoRender(){ if(loadedCount() >= 1) render(); }
function updateRail(){
  const n = loadedCount();
  document.getElementById('railBar').style.width = (n/FILE_COUNT*100)+'%';
  document.getElementById('filePill').textContent = n + ' / ' + FILE_COUNT + ' files';
}
function buildTableHtml(A, cnt, catTotal, colSum, catColSum, cats){
  let h1 = '<tr><th class="corner" rowspan="2">User name</th>';
  let h2 = '<tr>';
  cats.forEach(c=>{
    const BK = bucketsFor(c.key);
    h1 += '<th class="'+c.g+'" colspan="'+CAT_SPAN(c.key)+'">'+esc(c.label)+'</th>';
    BK.forEach(b=> h2 += '<th class="'+c.s+(b.last?' b-last':'')+'">'+esc(b.label)+'</th>');
    h2 += '<th class="'+c.t+'">Total</th>';
    h2 += '<th class="'+c.s+'">Approved</th><th class="'+c.s+'">Rejection</th><th class="'+c.s+'">Disp. total</th><th class="'+c.s+'">Rej. %</th>';
  });
  h1 += '</tr>'; h2 += '</tr>';
  let body = '';
  const num = (v,cls)=> '<td class="num '+(cls||'')+(v===0?' zero':'')+'">'+v+'</td>';
  A.users.forEach(u=>{
    let row = '<tr><td class="user">'+esc(u)+'</td>';
    cats.forEach(c=>{
      bucketsFor(c.key).forEach(b=> row += num(cnt(c.key,u,b.key), b.last?'b-last':''));
      row += num(catTotal(c.key,u), c.t);
      row += disCells(dis(c.key,u));
    });
    row += '</tr>';
    body += row;
  });
  let total = '<tr class="totalRow"><td class="user">Total</td>';
  cats.forEach(c=>{
    bucketsFor(c.key).forEach(b=> total += '<td class="num'+(b.last?' b-last':'')+'">'+colSum(c.key,b.key)+'</td>');
    total += '<td class="num '+c.t+'">'+catColSum(c.key)+'</td>';
    total += disCells(disSum(c.key, A.users));
  });
  total += '</tr>';
  return '<table><thead>'+h1+h2+'</thead><tbody>'+body+total+'</tbody></table>';
}
function buildInteractiveTable(){
  const wrap = document.getElementById('tablewrap');
  if(!A || A.users.length===0){
    wrap.innerHTML = '<div class="empty"><span class="big">&#128269;</span>No pending applications to summarise.'+
      (loadedCount()<5 ? '<br><small>'+loadedCount()+' of '+FILE_COUNT+' files loaded.</small>'
                       : '<br><small>Check the warnings above — every row may have been filtered out by status or village matching.</small>')+'</div>';
    document.getElementById('meta').textContent='';
    document.getElementById('tableActions').style.display='none';
    document.getElementById('exportBtn').disabled = true;
    return;
  }
  document.getElementById('tableActions').style.display='flex';
  document.getElementById('statsCard').style.display='block';
  document.getElementById('chartCard').style.display='block';
  document.getElementById('controls').style.display='flex';
  const cnt = (cat,u,bk) => (A.counts[cat][u] && A.counts[cat][u][bk]) || 0;
  const catTotal = (cat,u) => bucketsFor(cat).reduce((s,b)=>s+cnt(cat,u,b.key), 0);
  const grand = (u) => CATS.reduce((s,c)=>s+catTotal(c.key,u), 0);
  let users = A.users;
  const q = norm(searchTerm);
  if(q){
    users = users.filter(u=>{
      if(norm(u).includes(q)) return true;
      return CATS.some(c=>{
        const v = A.villages[c.key][u]; if(!v) return false;
        return Object.keys(v).some(vl => norm(vl).includes(q));
      });
    });
  }
  if(activeBucket){
    users = users.filter(u => countByLabel(u, activeBucket) > 0);
  }
  if(activeCat){
    users = users.filter(u => catTotal(activeCat,u) > 0);
  }
  if(sortCol){
    const sc = sortCol;
    users = users.slice().sort((a,b)=>{
      let va, vb;
      if(sc === 'user'){ va = a; vb = b; }
      else if(sc === 'grand'){ va = grand(a); vb = grand(b); }
      else{
        const m = sc.match(/^([A-Za-z]+)_([A-Za-z0-9]+)$/);
        if(m && m[2]==='total'){ va = catTotal(m[1],a); vb = catTotal(m[1],b); }
        else if(m){ va = cnt(m[1],a,m[2]); vb = cnt(m[1],b,m[2]); }
        else { va = 0; vb = 0; }
      }
      if(typeof va === 'string') return sortDir * va.localeCompare(vb);
      return sortDir * ((va||0) - (vb||0));
    });
  }
  const arrow = k => sortCol===k ? (sortDir>0?'▲':'▼') : '⇅';
  const sortCls = k => 'sortable'+(sortCol===k?' sorted':'');
  let h1 = '<tr><th class="corner '+sortCls('user')+'" data-sort="user" rowspan="2">User name <span class="arr">'+arrow('user')+'</span></th>';
  let h2 = '<tr>';
  CATS.forEach(c=>{
    const BK = bucketsFor(c.key);
    h1 += '<th class="'+c.g+' catcol" colspan="'+CAT_SPAN(c.key)+'" data-cat="'+c.key+'" title="Click to show only users with '+esc(c.label)+' applications" style="cursor:pointer'+(activeCat===c.key?'; box-shadow:inset 0 -3px 0 var(--accent)':'')+'">'+esc(c.label)+'</th>';
    BK.forEach(b=>{
      const k = c.key+'_'+b.key;
      h2 += '<th class="'+c.s+' '+sortCls(k)+(b.last?' b-last':'')+'" data-sort="'+k+'">'+esc(b.label)+' <span class="arr">'+arrow(k)+'</span></th>';
    });
    const kt = c.key+'_total';
    h2 += '<th class="'+c.t+' '+sortCls(kt)+'" data-sort="'+kt+'">Total <span class="arr">'+arrow(kt)+'</span></th>';
    h2 += '<th class="'+c.s+'">Approved</th><th class="'+c.s+'">Rejection</th><th class="'+c.s+'">Disp. total</th><th class="'+c.s+'">Rej. %</th>';
  });
  h1 += '<th class="t-grand '+sortCls('grand')+'" data-sort="grand" rowspan="2">Grand<br>total <span class="arr">'+arrow('grand')+'</span></th>';
  h1 += '</tr>'; h2 += '</tr>';
  let body = '';
  const num = (v,cls)=> '<td class="num '+(cls||'')+(v===0?' zero':'')+'">'+v+'</td>';
  users.forEach(u=>{
    const isOpen = openUsers.has(u);
    let row = '<tr class="userrow'+(isOpen?' open':'')+'" data-user="'+esc(u)+'">'+
      '<td class="user"><span class="chev">&#9654;</span>'+esc(u)+'</td>';
    CATS.forEach(c=>{
      bucketsFor(c.key).forEach(b=>{
        const v = cnt(c.key,u,b.key);
        const hl = (activeBucket===b.label) ? ' cell-hl' : '';
        const tt = villageTooltip(c.key, u, b.key, v);
        row += '<td class="num cell'+(v>0?' hoverable':'')+hl+(v===0?' zero':'')+(b.last?' b-last':'')+'" title="'+tt+'">'+v+'</td>';
      });
      row += num(catTotal(c.key,u), c.t);
      row += disCells(dis(c.key,u));
    });
    row += num(grand(u), 't-grand');
    row += '</tr>';
    if(isOpen){
      row += '<tr class="detail-row"><td colspan="'+(TOTAL_COLS()+1)+'"><div class="dr">'+detailTable(u)+'</div></td></tr>';
    }
    body += row;
  });
  const colSum = (cat,bk) => users.reduce((s,u)=>s+cnt(cat,u,bk), 0);
  const catColSum = (cat) => bucketsFor(cat).reduce((s,b)=>s+colSum(cat,b.key), 0);
  const grandColSum = () => CATS.reduce((s,c)=>s+catColSum(c.key), 0);
  let total = '<tr class="totalRow"><td class="user">Total</td>';
  CATS.forEach(c=>{
    bucketsFor(c.key).forEach(b=> total += '<td class="num'+(b.last?' b-last':'')+'">'+colSum(c.key,b.key)+'</td>');
    total += '<td class="num '+c.t+'">'+catColSum(c.key)+'</td>';
    total += disCells(disSum(c.key, users));
  });
  total += '<td class="num t-grand">'+grandColSum()+'</td></tr>';
  wrap.innerHTML = '<table class="fade-in"><thead>'+h1+h2+'</thead><tbody>'+body+total+'</tbody></table>';
  const bits = [];
  bits.push('<b>'+users.length+'</b> user'+(users.length!==1?'s':'')+' shown');
  bits.push('<b>'+grandColSum()+'</b> pending application'+(grandColSum()!==1?'s':''));
  bits.push(A.matchedRows+' counted of '+A.totalRows+' rows read');
  if(TALUK) bits.push('taluk: <b>'+esc(TALUK)+'</b>');
  if(A.talukSkipped) bits.push(A.talukSkipped+' row(s) in other taluks');
  if(A.statusSkipped) bits.push('<b>'+A.statusSkipped+'</b> row'+(A.statusSkipped!==1?'s':'')+' skipped — not pending');
  if(q) bits.push('search: "'+esc(searchTerm)+'"');
  if(activeBucket) bits.push('range: '+esc(activeBucket));
  if(activeCat) bits.push('category: '+esc(CATS.find(c=>c.key===activeCat).label));
  document.getElementById('meta').innerHTML = bits.join(' &middot; ');
  renderStats();
  renderChart(users);
  document.getElementById('exportBtn').disabled = false;
}
function detailTable(user){
  const vMap = {};
  CATS.forEach(c=>{
    const v = (A.villages[c.key] && A.villages[c.key][user]) || {};
    Object.keys(v).forEach(vl=>{
      (vMap[vl] = vMap[vl] || {});
      bucketsFor(c.key).forEach(b=>{ vMap[vl][c.key+'_'+b.key] = (vMap[vl][c.key+'_'+b.key]||0) + (v[vl][b.key]||0); });
    });
  });
  const names = Object.keys(vMap).sort();
  if(names.length===0) return '<div class="empty" style="padding:14px">No village detail.</div>';
  let html = '<table><thead><tr><th style="text-align:left">Village</th>';
  CATS.forEach(c=>{ bucketsFor(c.key).forEach(b=> html += '<th class="'+c.s+'">'+esc(c.label)+'<br>'+esc(b.label)+'</th>'); html += '<th class="'+c.t+'">Total</th>'; });
  html += '<th class="t-grand">All</th></tr></thead><tbody>';
  names.forEach(vl=>{
    let rowTotal = 0;
    let cells = '';
    CATS.forEach(c=>{
      let ct = 0;
      bucketsFor(c.key).forEach(b=>{
        const v = vMap[vl][c.key+'_'+b.key] || 0; ct += v;
        cells += '<td class="num'+(v===0?' zero':'')+'">'+v+'</td>';
      });
      cells += '<td class="num '+c.t+(ct===0?' zero':'')+'">'+ct+'</td>';
      rowTotal += ct;
    });
    html += '<tr><td style="text-align:left; font-weight:600">'+esc(vl)+'</td>'+cells+'<td class="num t-grand">'+rowTotal+'</td></tr>';
  });
  html += '</tbody></table>';
  return html;
}
function villageTooltip(cat, user, bk, total){
  if(!total) return '';
  const v = (A.villages[cat] && A.villages[cat][user]) || {};
  const parts = [];
  Object.keys(v).sort().forEach(vl=>{
    const n = v[vl][bk] || 0;
    if(n>0) parts.push(vl+': '+n);
  });
  return parts.length ? 'Villages — '+parts.join(', ') : '';
}
function animateValue(el, to){
  const dur = 550, t0 = performance.now();
  function step(t){
    const p = Math.min(1, (t-t0)/dur);
    el.textContent = Math.round(to * (1 - Math.pow(1-p, 3)));
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function renderStats(){
  const box = document.getElementById('stats');
  const cnt = (cat,u,bk) => (A.counts[cat][u] && A.counts[cat][u][bk]) || 0;
  const catTot = c => A.users.reduce((s,u)=>s+bucketsFor(c).reduce((y,b)=>y+cnt(c,u,b.key),0),0);
  const bucketTot = b => A.users.reduce((s,u)=>s+CATS.reduce((x,c)=>x+cnt(c.key,u,b),0),0);
  const catTotals = CATS.map(c=>catTot(c.key));
  const LB = allBucketLabels();
  const labelTot = lb => A.users.reduce((s,u)=>s+countByLabel(u, lb), 0);
  const bucketTotals = LB.map(b=>labelTot(b.label));
  const grandTotal = catTotals.reduce((s,v)=>s+v,0);
  const oldest = LB.filter(b=>b.last);
  const over30 = oldest.reduce((s,b)=>s+labelTot(b.label), 0);
  const oldestLabel = oldest.length ? oldest.map(b=>b.label).join(' / ') : '';
  const pct = grandTotal ? Math.round(over30/grandTotal*100) : 0;
  let html = '';
  let i = 0;
  const card = (inner, cls, attrs) => '<div class="stat '+(cls||'')+'" '+(attrs||'')+' style="animation-delay:'+(i++*45)+'ms">'+inner+'</div>';
  html += card('<div class="k">Pending total</div><div class="v" data-count="'+grandTotal+'">0</div><div class="s">across '+A.users.length+' user'+(A.users.length!==1?'s':'')+'</div>');
  CATS.forEach((c,idx)=>{
    html += card('<div class="k"><span class="dot" style="background:'+c.color+'"></span>'+esc(c.label)+'</div><div class="v" data-count="'+catTotals[idx]+'">0</div><div class="s">'+(activeCat===c.key?'filtering — click to clear':'click to filter')+'</div>',
      'clickable'+(activeCat===c.key?' active':''), 'data-cat="'+c.key+'"');
  });
  if(oldest.length) html += card('<div class="k"><span class="dot" style="background:#e53935"></span>Oldest range</div><div class="v" data-count="'+over30+'">0</div><div class="s">'+esc(oldestLabel)+' · '+pct+'% of pending</div>');
  if(A.statusSkipped){
    html += card('<div class="k">Not pending</div><div class="v" data-count="'+A.statusSkipped+'">0</div><div class="s">rows excluded by status</div>');
  }
  box.innerHTML = html;
  box.querySelectorAll('.v[data-count]').forEach(el=> animateValue(el, +el.dataset.count));
  box.querySelectorAll('.stat.clickable').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(el.dataset.bucket){ activeBucket = (activeBucket===el.dataset.bucket) ? null : el.dataset.bucket; }
      if(el.dataset.cat){ activeCat = (activeCat===el.dataset.cat) ? null : el.dataset.cat; }
      updateChips(); buildInteractiveTable();
    });
  });
}
function renderChart(visibleUsers){
  const chart = document.getElementById('chart');
  const cnt = (cat,u,bk) => (A.counts[cat][u] && A.counts[cat][u][bk]) || 0;
  const inCat = c => !activeCat || c.key === activeCat;
  const userTotal = u => CATS.filter(inCat).reduce((s,c)=>s+bucketsFor(c.key).reduce((y,b)=>y+cnt(c.key,u,b.key),0),0);
  void 0;
  const shown = new Set(visibleUsers||A.users);
  const maxV = Math.max(1, ...A.users.map(userTotal));
  let html = '';
  A.users.forEach(u=>{
    const total = userTotal(u);
    let bars = '';
    allBucketLabels().forEach(b=>{
      const real = countByLabel(u, b.label, CATS.filter(inCat));
      const h = Math.max(2, (real/maxV)*160);
      const dim = (activeBucket && activeBucket!==b.label) ? 'opacity:.28;' : '';
      bars += '<div class="chart-bar" data-bucket="'+esc(b.label)+'" style="height:'+h+'px; background:'+b.color+';'+dim+'">'+
              (real>0?'<span class="bar-count">'+real+'</span>':'')+
              '<span class="tip">'+esc(b.label)+': '+real+'</span></div>';
    });
    html += '<div class="chart-col'+(shown.has(u)?'':' dim')+'" data-user="'+esc(u)+'" title="'+esc(u)+' — '+total+' pending"><div class="chart-bars">'+bars+'</div><div class="chart-val">'+total+'</div><div class="chart-label">'+esc(u)+'</div></div>';
  });
  chart.innerHTML = html;
  chart.querySelectorAll('.chart-bar').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const bk = el.dataset.bucket;
      activeBucket = (activeBucket===bk) ? null : bk;
      updateChips(); buildInteractiveTable();
    });
  });
  chart.querySelectorAll('.chart-col').forEach(el=>{
    el.addEventListener('click', ()=>{
      const u = el.dataset.user;
      const inp = document.getElementById('searchInput');
      searchTerm = (searchTerm === u) ? '' : u;
      inp.value = searchTerm;
      document.getElementById('searchBox').classList.toggle('has', !!searchTerm);
      buildInteractiveTable();
    });
  });
  document.getElementById('bucketLegend').innerHTML =
    allBucketLabels().map(b=>'<span><i style="background:'+b.color+'"></i>'+esc(b.label)+'</span>').join('') +
    '<span style="margin-left:auto; opacity:.8">Click a bar to filter by bucket · click a name to filter the table</span>';
}
function updateChips(){
  const box = document.getElementById('chips');
  if(!A) return;
  const cnt = (cat,u,bk) => (A.counts[cat][u] && A.counts[cat][u][bk]) || 0;
  let html = '';
  allBucketLabels().forEach(b=>{
    const n = A.users.reduce((s,u)=>s+countByLabel(u, b.label), 0);
    if(!n) return;
    html += '<div class="chip'+(activeBucket===b.label?' on':'')+'" data-bucket="'+esc(b.label)+'"><i style="background:'+b.color+'"></i>'+esc(b.label)+' <span class="n">'+n+'</span></div>';
  });
  if(activeBucket || activeCat || searchTerm) html += '<div class="chip" data-reset="1">&#10005; Clear filters</div>';
  box.innerHTML = html;
  box.querySelectorAll('.chip').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(el.dataset.reset){
        activeBucket = null; activeCat = null; searchTerm = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchBox').classList.remove('has');
      }else{
        const bk = el.dataset.bucket;
        activeBucket = (activeBucket===bk) ? null : bk;
      }
      updateChips(); buildInteractiveTable();
    });
  });
}
function render(){
  renderIsdReport();
  A = aggregate();
  renderWarnings(A);
  updateChips();
  buildInteractiveTable();
  const cnt = (cat,u,bk) => (A.counts[cat][u] && A.counts[cat][u][bk]) || 0;
  const catTotal = (cat,u) => bucketsFor(cat).reduce((s,b)=>s+cnt(cat,u,b.key), 0);
  const colSum = (cat,bk) => A.users.reduce((s,u)=>s+cnt(cat,u,bk), 0);
  const catColSum = (cat) => bucketsFor(cat).reduce((s,b)=>s+colSum(cat,b.key), 0);
  document.getElementById('printIsd').innerHTML    = buildTableHtml(A, cnt, catTotal, colSum, catColSum, CATS_ISD);
  document.getElementById('printFline').innerHTML   = buildTableHtml(A, cnt, catTotal, colSum, catColSum, [CATS_FLINE[0]]);
  document.getElementById('printFlineN').innerHTML  = buildTableHtml(A, cnt, catTotal, colSum, catColSum, [CATS_FLINE[1]]);
  const grandAll = CATS.reduce((s,c)=>s+catColSum(c.key),0);
  document.getElementById('printSubhead').textContent =
    (TALUK ? TALUK + ' taluk · ' : '') + 'Pending applications only · ' + A.users.length + ' user(s) · ' +
    grandAll + ' application(s) · as on ' + new Date().toLocaleDateString('en-GB');
  const pill = document.getElementById('pendingPill');
  pill.style.display = grandAll ? 'inline-flex' : 'none';
  document.getElementById('pendingPillTxt').textContent = grandAll + ' pending';
  buildMatrix(A, cnt, catTotal, colSum, catColSum);
  document.getElementById('exportBtn').disabled = false;
}
function renderWarnings(A){
  const box = document.getElementById('warnings');
  let html = '';
  if(!store.village && OPT.userSource !== 'col' && CATS.some(c=>store[c.key])){
    html += '<div class="warn bad"><h3>Village Details not loaded</h3>'+
      'Without the mapping file no application can be assigned to a user. '+
      'Upload <code class="k">Village Details</code>, or switch <b>User name source</b> to the file’s own column.</div>';
  }
  if(TALUK){
    const off = [];
    ['isdRuralPdf'].concat(OPT_KEYS).forEach(k=>{
      if(!store[k]) return;
      const sp = talukSpread(k);
      if(sp.length && sp.indexOf(norm(TALUK)) < 0) off.push(FILE_NAMES[k]);
    });
    if(off.length){
      html += '<div class="talukwarn">Showing <b>'+esc(TALUK)+'</b>, but '+off.map(esc).join(', ')+
        ' contain'+(off.length===1?'s':'')+' no rows for that taluk — those figures are for whichever taluk the file covers.</div>';
    }
  }
  const missing = Object.keys(store).filter(k=>!store[k]);
  if(missing.length && missing.length<FILE_COUNT){
    html += '<div class="warn info"><h3>Waiting on '+missing.length+' file(s)</h3>Not yet loaded: '+
      missing.map(k=>esc(FILE_NAMES[k])).join(', ')+'.</div>';
  }
  if(OPT.status !== 'all'){
    if(A.statusSkipped){
      const rows = Array.from(A.statusDrop.entries()).sort((a,b)=>b[1]-a[1]);
      html += '<div class="warn good"><h3>Pending-only filter applied — '+A.statusSkipped+' row(s) excluded</h3>'+
        'Only rows with a <b>Pending</b> application status are counted in this report.'+
        '<details><summary>Show excluded statuses</summary><ul>'+
        rows.slice(0,30).map(kv=>'<li>'+esc(kv[0])+' — '+kv[1]+' row'+(kv[1]>1?'s':'')+'</li>').join('')+
        (rows.length>30 ? '<li>…and '+(rows.length-30)+' more</li>' : '')+
        '</ul></details></div>';
    }
    if(A.noStatusCol.length){
      html += '<div class="warn"><h3>No status column found in '+A.noStatusCol.length+' file(s)</h3>'+
        esc(A.noStatusCol.join(', '))+' — every row in these files was counted because no '+
        '<code class="k">Application Status</code> column could be located. Add that column to filter them too.</div>';
    }
  }
  const conf = A.vmapInfo && A.vmapInfo.conflicts;
  if(conf && conf.size){
    const rows = Array.from(conf.entries());
    html += '<div class="warn bad"><h3>'+rows.length+' village(s) map to more than one user</h3>'+
      'The <b>first</b> user listed in Village Details was used. Fix the duplicates so every village has one owner.'+
      '<ul>'+rows.slice(0,30).map(kv=>'<li><b>'+esc(kv[0])+'</b> → '+Array.from(kv[1]).map(esc).join(' / ')+'</li>').join('')+
      (rows.length>30 ? '<li>…and '+(rows.length-30)+' more</li>' : '')+'</ul></div>';
  }
  if(A.vmapInfo && A.vmapInfo.missingUser){
    html += '<div class="warn"><h3>'+A.vmapInfo.missingUser+' village row(s) in Village Details have no user name</h3>'+
      'Applications from those villages cannot be attributed and will appear as unmatched below.</div>';
  }
  if(A.unmatched.size){
    const entries = Array.from(A.unmatched.entries()).sort((a,b)=>b[1].count-a[1].count);
    const totalUn = entries.reduce((s,kv)=>s+kv[1].count,0);
    const items = entries.slice(0,40).map(kv=>
      '<li>'+esc(kv[0])+' — '+kv[1].count+' app'+(kv[1].count>1?'s':'')+' <small>['+esc(Array.from(kv[1].cats).join(', '))+']</small></li>'
    ).join('');
    const more = entries.length>40 ? '<li>…and '+(entries.length-40)+' more village(s)</li>' : '';
    html += '<div class="warn"><h3>'+totalUn+' pending application(s) from '+entries.length+' village(s) had no matching user</h3>'+
      'These rows are excluded from the totals. Add the villages to <code class="k">Village Details</code>'+
      (OPT.fuzzy?'':' or switch on <b>Fuzzy village matching</b>')+' to include them.'+
      '<ul>'+items+more+'</ul></div>';
  }
  const badTotal = Object.values(A.unreadable).reduce((s,n)=>s+n,0);
  if(badTotal){
    html += '<div class="warn"><h3>'+badTotal+' pending row(s) could not be bucketed</h3>'+
      'Missing or unreadable date / days-pending value. Check the date columns in the source files.</div>';
  }
  box.innerHTML = html;
}
function buildMatrix(A, cnt, catTotal, colSum, catColSum){
  const header = ['User name'];
  CATS.forEach(c=>{
    bucketsFor(c.key).forEach(b=> header.push(c.label+' · '+b.label));
    header.push(c.label+' · Total', c.label+' · Approved', c.label+' · Rejection', c.label+' · Disposal total', c.label+' · Rejection %');
  });
  header.push('Grand total');
  const rows = [header];
  A.users.forEach(u=>{
    const r = [u]; let g = 0;
    CATS.forEach(c=>{
      bucketsFor(c.key).forEach(b=> r.push(cnt(c.key,u,b.key)));
      const ct = catTotal(c.key,u); r.push(ct); g += ct;
      const d = dis(c.key,u), pp = pctOf(d);
      r.push(d.approved, d.rejected, d.approved+d.rejected, pp==null?'':pp);
    });
    r.push(g);
    rows.push(r);
  });
  const tr = ['Total']; let gg = 0;
  CATS.forEach(c=>{
    bucketsFor(c.key).forEach(b=> tr.push(colSum(c.key,b.key)));
    const ct = catColSum(c.key); tr.push(ct); gg += ct;
    const d = disSum(c.key, A.users), pp = pctOf(d);
    tr.push(d.approved, d.rejected, d.approved+d.rejected, pp==null?'':pp);
  });
  tr.push(gg);
  rows.push(tr);
  lastMatrix = rows;
}
const XC = {
  head:'FFDFE3E8', headInk:'FF1F2430',
  grp:'FFDCE7FF',
  totCol:'FFEDEFF2',
  subtotal:'FFD9DDE4',
  vao:'FFF6DCE7',
  grand:'FFC8CCD4',
  hot:'FFFF6B6B', hotInk:'FF4A0D0D',
  pcG:'FF63BE7B', pcGInk:'FF0D3B1A',
  pcY:'FFFFD666', pcYInk:'FF5A4200',
  pcR:'FFFF6B6B', pcRInk:'FF4A0D0D',
  zero:'FFB9BDC5',
  white:'FFFFFFFF'
};
const XLINE = {style:'thin', color:{argb:'FF9AA0AA'}};
const XBORDER = {top:XLINE, left:XLINE, bottom:XLINE, right:XLINE};
const xFill = argb => ({type:'pattern', pattern:'solid', fgColor:{argb}});
function xStyleRow(row, opts){
  const o = opts || {};
  row.eachCell({includeEmpty:true}, (cell, i)=>{
    cell.border = XBORDER;
    cell.alignment = {vertical:'middle', horizontal: (i<=(o.leftCols||0) ? 'left' : 'center'), wrapText: !!o.wrap};
    if(o.fill) cell.fill = xFill(o.fill);
    if(o.bold || o.size) cell.font = {bold:!!o.bold, size:o.size||11, color:{argb:o.ink||XC.headInk}};
  });
}
function xAddRow(ws, vals){
  const row = ws.getRow(ws.rowCount + 1);
  for(let i=0;i<vals.length;i++){
    const v = vals[i];
    if(v !== undefined && v !== null && v !== '') row.getCell(i+1).value = v;
  }
  return row;
}
async function downloadWorkbook(wb, filename){
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); }, 1500);
}
function xIsdHeader(ws, title, subtitle, lead){
  const NC = lead.length + bucketsFor('isdRural').length + 5;
  const L = n => ws.getColumn(n).letter;
  ws.mergeCells(1, 1, 1, NC);
  const t = ws.getCell(1,1);
  t.value = title;
  t.font = {bold:true, size:14, color:{argb:XC.headInk}};
  t.alignment = {horizontal:'center', vertical:'middle'};
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, NC);
  const sb = ws.getCell(2,1);
  sb.value = subtitle;
  sb.font = {size:9, color:{argb:'FF6B7280'}};
  sb.alignment = {horizontal:'center'};
  const r3 = 3, r4 = 4;
  let c = 1;
  lead.forEach(h=>{ ws.mergeCells(r3, c, r4, c); ws.getCell(r3, c).value = h; c++; });
  const redCols = [];
  bucketsFor('isdRural').forEach(b=>{ ws.mergeCells(r3, c, r4, c); ws.getCell(r3, c).value = b.label; if(b.last) redCols.push(c); c++; });
  ws.mergeCells(r3, c, r4, c); ws.getCell(r3, c).value = 'Total'; c++;
  const dStart = c;
  ws.mergeCells(r3, c, r3, c+2); ws.getCell(r3, c).value = 'Disposal';
  ws.getCell(r4, c).value = 'Approved';
  ws.getCell(r4, c+1).value = 'Rejection';
  ws.getCell(r4, c+2).value = 'Total';
  c += 3;
  ws.mergeCells(r3, c, r4, c); ws.getCell(r3, c).value = 'Rejection %';
  [r3, r4].forEach(rn=>{
    const row = ws.getRow(rn);
    for(let i=1;i<=NC;i++){
      const cell = row.getCell(i);
      cell.border = XBORDER;
      const red = redCols.indexOf(i) >= 0;
      cell.fill = xFill(red ? XC.hot : XC.head);
      cell.font = {bold:true, size:10, color:{argb: red ? XC.hotInk : XC.headInk}};
      cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
    }
    row.height = 18;
  });
  ws.columns.forEach((col, i)=>{ col.width = i < lead.length ? (i === lead.length-1 ? 26 : (lead.length>1 && i===0 ? 7 : 22)) : 13; });
  ws.views = [{state:'frozen', xSplit:lead.length, ySplit:4}];
  ws.pageSetup = {orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0, margins:{left:0.3,right:0.3,top:0.4,bottom:0.4,header:0.2,footer:0.2}};
  return {NC, dStart};
}
function xDataRow(ws, lead, r, style){
  const st = style || {};
  const p = rejPct(r);
  const vals = lead.concat(
    bucketsFor('isdRural').map(b => r.b[b.key]),
    [r.pending, r.approved, r.rejected, r.approved + r.rejected, p==null ? '—' : p]
  );
  const row = xAddRow(ws, vals);
  const nLead = lead.length;
  for(let i=1;i<=vals.length;i++) row.getCell(i);
  row.eachCell({includeEmpty:true}, (cell, i)=>{
    cell.border = XBORDER;
    cell.alignment = {horizontal: i<=nLead ? 'left' : 'center', vertical:'middle'};
    cell.font = {bold:!!st.bold, size:10, color:{argb:st.ink || XC.headInk}};
    if(st.fill) cell.fill = xFill(st.fill);
    else if(i === nLead + bucketsFor('isdRural').length + 1 || i === nLead + bucketsFor('isdRural').length + 4) cell.fill = xFill(XC.totCol);
  });
  const hotCol = nLead + bucketsFor('isdRural').length;
  const c = row.getCell(hotCol);
  c.fill = xFill(XC.hot); c.font = {bold:true, size:10, color:{argb:XC.hotInk}};
  const pcCell = row.getCell(nLead + bucketsFor('isdRural').length + 5);
  if(p != null){
    const bg = p <= 20 ? XC.pcG : (p <= 50 ? XC.pcY : XC.pcR);
    const ink = p <= 20 ? XC.pcGInk : (p <= 50 ? XC.pcYInk : XC.pcRInk);
    pcCell.fill = xFill(bg);
    pcCell.font = {bold:true, size:10, color:{argb:ink}};
  }
  row.height = st.tall ? 18 : 16;
  return row;
}
async function exportIsdStyled(){
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Taluk ISD dashboard';
  const sRows = R.surveyorNames.map(n => R.surveyors[n]);
  const vRows = R.vaoNames.map(n => R.vaos[n]);
  const sTotal = sumRows(sRows), vTotal = sumRows(vRows), gTotal = sumRows([sTotal, vTotal]);
  const ws = wb.addWorksheet('ISD Pending Details', {properties:{defaultRowHeight:16}});
  const {NC} = xIsdHeader(ws, talukTitle('Taluk ISD Pending Details') + ' — ISD (Rural)',
    'As on ' + new Date().toLocaleDateString('en-GB') + ' · surveyor ' + sTotal.pending +
    ' · VAO ' + vTotal.pending + ' · taluk total ' + gTotal.pending, ['S.No','Name']);
  const grp = xAddRow(ws, ['Surveyor']);
  ws.mergeCells(grp.number, 1, grp.number, NC);
  xStyleRow(grp, {fill:XC.grp, bold:true, leftCols:NC});
  R.surveyorNames.forEach((n,i)=> xDataRow(ws, [i+1, n], R.surveyors[n]));
  const tr = xDataRow(ws, ['', 'Total'], sTotal, {fill:XC.subtotal, bold:true, tall:true});
  ws.mergeCells(tr.number, 1, tr.number, 2);
  tr.getCell(1).value = 'Total';
  tr.getCell(1).alignment = {horizontal:'center', vertical:'middle'};
  xDataRow(ws, [R.surveyorNames.length+1, 'VAO'], vTotal, {fill:XC.vao, bold:true, tall:true});
  R.vaoNames.forEach(n=>{
    const rec = R.vaos[n];
    Object.keys(rec.villages).sort().forEach(v=>{
      const x = rec.villages[v];
      if(!x.pending && !x.approved && !x.rejected) return;
      const row = xDataRow(ws, ['', '      ' + n + ' — ' + v], x);
      row.getCell(2).font = {size:9, italic:true, color:{argb:'FF52514E'}};
    });
  });
  const gr = xDataRow(ws, ['', 'Taluk Total'], gTotal, {fill:XC.grand, bold:true, tall:true});
  ws.mergeCells(gr.number, 1, gr.number, 2);
  gr.getCell(1).value = 'Taluk Total';
  gr.getCell(1).alignment = {horizontal:'center', vertical:'middle'};
  const wv = wb.addWorksheet('VAO Details', {properties:{defaultRowHeight:16}});
  xIsdHeader(wv, talukTitle('· ISD (Rural) — VAO Details, village wise'),
    'As on ' + new Date().toLocaleDateString('en-GB') + ' · VAO total ' + vTotal.pending,
    ['S.No','VAO Name','Village']);
  let n = 0;
  R.vaoNames.forEach(name=>{
    const rec = R.vaos[name];
    Object.keys(rec.villages).sort().forEach(v=>{
      const x = rec.villages[v];
      if(!x.pending && !x.approved && !x.rejected) return;
      xDataRow(wv, [++n, name, v], x);
    });
  });
  const vt = xDataRow(wv, ['', 'VAO Total', ''], vTotal, {fill:XC.grand, bold:true, tall:true});
  wv.mergeCells(vt.number, 1, vt.number, 3);
  vt.getCell(1).value = 'VAO Total';
  vt.getCell(1).alignment = {horizontal:'center', vertical:'middle'};
  buildCombinedSheet(wb, sheetNameFor(CATS_ISD), CATS_ISD);
  CATS_FLINE.forEach(c => buildCombinedSheet(wb, sheetNameFor([c]), [c]));
  buildAllDataSheet(wb);
  await downloadWorkbook(wb, (talukSlug() + '_isd_rural_pending_details.xlsx'));
}
function sheetNameFor(cats){
  if(cats.length === 1) return cats[0].label.slice(0,31);
  const base = cats[0].label.split(' (')[0];
  if(cats.every(c => c.label.split(' (')[0] === base)){
    const parts = cats.map(c => (c.label.match(/\(([^)]*)\)/) || [])[1]).filter(Boolean);
    const n = base + ' (' + parts.join(' & ') + ')';
    if(n.length <= 31) return n;
  }
  return cats.map(c => c.label).join(' & ').slice(0,31);
}
function buildCombinedSheet(wb, sheetName, catList){
  if(!A || !A.users.length) return null;
  const CS = catList || CATS;
  const ws = wb.addWorksheet(sheetName || 'Pending Summary', {properties:{defaultRowHeight:16}});
  const CATFILL = {isdNatham:'FFF6DCE7', flineRural:'FFD8ECC8', flineNatham:'FFDED8F0'};
  const CATHEAD = {isdNatham:'FFDB7FA6', flineRural:'FF7FB85C', flineNatham:'FF8E7CC3'};
  const NC = 1 + CS.reduce((t,c)=>t + CAT_SPAN(c.key), 0) + 1;
  ws.mergeCells(1,1,1,NC);
  const t = ws.getCell(1,1);
  t.value = talukTitle('· pending applications by user & days pending');
  t.font = {bold:true, size:14}; t.alignment = {horizontal:'center'};
  ws.getRow(1).height = 24;
  ws.mergeCells(2,1,2,NC);
  const sb = ws.getCell(2,1);
  sb.value = 'As on ' + new Date().toLocaleDateString('en-GB') + ' · pending rows only';
  sb.font = {size:9, color:{argb:'FF6B7280'}}; sb.alignment = {horizontal:'center'};
  ws.mergeCells(3,1,4,1); ws.getCell(3,1).value = 'User name';
  let c = 2;
  CS.forEach(cat=>{
    const BK = bucketsFor(cat.key), span = CAT_SPAN(cat.key);
    ws.mergeCells(3, c, 3, c+span-1);
    const h = ws.getCell(3, c); h.value = cat.label;
    for(let i=0;i<span;i++) ws.getCell(3, c+i).fill = xFill(CATHEAD[cat.key]);
    BK.forEach((b,i)=>{
      const cell = ws.getCell(4, c+i); cell.value = b.label;
      cell.fill = xFill(b.last ? XC.hot : CATFILL[cat.key]);
    });
    ['Total','Approved','Rejection','Disp. total','Rej. %'].forEach((lab,i)=>{
      const cell = ws.getCell(4, c+BK.length+i); cell.value = lab; cell.fill = xFill(CATFILL[cat.key]);
    });
    c += span;
  });
  ws.mergeCells(3, c, 4, c); ws.getCell(3, c).value = 'Grand total';
  [3,4].forEach(rn=>{
    const row = ws.getRow(rn);
    for(let i=1;i<=NC;i++){
      const cell = row.getCell(i);
      cell.border = XBORDER;
      if(!cell.fill || cell.fill.type !== 'pattern') cell.fill = xFill(XC.head);
      cell.font = {bold:true, size:10, color:{argb:XC.headInk}};
      cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
    }
    row.height = 18;
  });
  ws.columns.forEach((col,i)=> col.width = i === 0 ? 26 : 13);
  ws.views = [{state:'frozen', xSplit:1, ySplit:4}];
  ws.pageSetup = {orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0};
  const cnt = (cat,u,bk) => (A.counts[cat][u] && A.counts[cat][u][bk]) || 0;
  const catTotal = (cat,u) => bucketsFor(cat).reduce((s,b)=>s+cnt(cat,u,b.key), 0);
  const line = (u)=>{
    const vals = [u]; let g = 0;
    CS.forEach(cat=>{
      bucketsFor(cat.key).forEach(b=>vals.push(cnt(cat.key,u,b.key)));
      const ct = catTotal(cat.key,u); vals.push(ct); g += ct;
      const d = dis(cat.key,u), pp = pctOf(d);
      vals.push(d.approved, d.rejected, d.approved+d.rejected, pp==null?'—':pp);
    });
    vals.push(g);
    return vals;
  };
  A.users.forEach(u=>{
    const row = xAddRow(ws, line(u));
    row.eachCell({includeEmpty:true},(cell,i)=>{
      cell.border = XBORDER;
      cell.alignment = {horizontal: i===1 ? 'left' : 'center'};
      cell.font = {size:10};
    });
    let cc = 2;
    CS.forEach(cat=>{
      const BK = bucketsFor(cat.key);
      BK.forEach((b,i)=>{ if(b.last){ const cell = row.getCell(cc+i); cell.fill = xFill(XC.hot); cell.font = {bold:true, size:10, color:{argb:XC.hotInk}}; } });
      cc += BK.length;
      row.getCell(cc).fill = xFill(CATFILL[cat.key]);
      cc += 5;
    });
    row.getCell(NC).fill = xFill(XC.totCol);
  });
  const totals = ['Total']; let gg = 0;
  CS.forEach(cat=>{
    bucketsFor(cat.key).forEach(b=> totals.push(A.users.reduce((s,u)=>s+cnt(cat.key,u,b.key),0)));
    const ct = A.users.reduce((s,u)=>s+catTotal(cat.key,u),0); totals.push(ct); gg += ct;
    const d = disSum(cat.key, A.users), pp = pctOf(d);
    totals.push(d.approved, d.rejected, d.approved+d.rejected, pp==null?'—':pp);
  });
  totals.push(gg);
  const trow = xAddRow(ws, totals);
  trow.eachCell({includeEmpty:true},(cell,i)=>{
    cell.border = XBORDER; cell.fill = xFill(XC.grand);
    cell.font = {bold:true, size:10}; cell.alignment = {horizontal: i===1 ? 'left' : 'center'};
  });
  return ws;
}
async function exportCombinedStyled(){
  const wb = new ExcelJS.Workbook();
  if(!buildCombinedSheet(wb)){ toast('Nothing to export', 'No matched applications in the combined table.', 'warn'); return; }
  await downloadWorkbook(wb, (talukSlug() + '_pending_applications_summary.xlsx'));
}
function exportPlain(matrix, sheet, file){
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws['!cols'] = matrix[0].map((h,i)=>({wch: i<=1 ? 26 : Math.max(11, String(h).length+2)}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, file);
}
const ALL_COLS = [
  {key:'isdRural',    label:'ISD (Rural)',     head:'FFB3A369', fill:'FFE7E0C2'},
  {key:'isdNatham',   label:'ISD (Natham)',    head:'FFDB7FA6', fill:'FFF6DCE7'},
  {key:'flineRural',  label:'F Line (Rural)',  head:'FF7FB85C', fill:'FFD8ECC8'},
  {key:'flineNatham', label:'F Line (Natham)', head:'FF8E7CC3', fill:'FFDED8F0'},
];
function allDataCats(){
  return ALL_COLS.filter(c => c.key === 'isdRural'
    ? (R && R.ready)
    : !!(A && A.counts && A.counts[c.key] && store[c.key]));
}
function allDataCount(catKey, name, bk, group){
  if(catKey === 'isdRural'){
    if(!R || !R.ready) return 0;
    const rec = group === 'vao' ? R.vaos[name] : R.surveyors[name];
    return (rec && rec.b[bk]) || 0;
  }
  if(group === 'vao') return 0;                 
  return (A && A.counts[catKey] && A.counts[catKey][name] && A.counts[catKey][name][bk]) || 0;
}
function allDataReady(){
  return allDataCats().length > 0 &&
         ((R && R.ready) || (A && A.users && A.users.length));
}
function buildAllDataSheet(wb){
  const cats = allDataCats();
  if(!cats.length) return null;
  const surveyors = Array.from(new Set(
    ((R && R.ready) ? R.surveyorNames : []).concat((A && A.users) ? A.users : [])
  )).sort((a,b)=>a.localeCompare(b));
  const vaos = (R && R.ready) ? R.vaoNames : [];
  if(!surveyors.length && !vaos.length) return null;
  const ws = wb.addWorksheet('All Data (no disposal)', {properties:{defaultRowHeight:16}});
  const NC = 2 + cats.reduce((t,c)=> t + bucketsFor(c.key).length + 1, 0) + 1;
  ws.mergeCells(1,1,1,NC);
  const t = ws.getCell(1,1);
  t.value = talukTitle('Taluk — all pending applications by user & days pending');
  t.font = {bold:true, size:14, color:{argb:XC.headInk}};
  t.alignment = {horizontal:'center', vertical:'middle'};
  ws.getRow(1).height = 24;
  ws.mergeCells(2,1,2,NC);
  const sb = ws.getCell(2,1);
  sb.value = 'As on ' + new Date().toLocaleDateString('en-GB') + ' · pending rows only · disposal figures not included';
  sb.font = {size:9, color:{argb:'FF6B7280'}};
  sb.alignment = {horizontal:'center'};
  ws.mergeCells(3,1,4,1); ws.getCell(3,1).value = 'S.No';
  ws.mergeCells(3,2,4,2); ws.getCell(3,2).value = 'Name';
  let c = 3;
  cats.forEach(cat=>{
    const BK = bucketsFor(cat.key), span = BK.length + 1;
    ws.mergeCells(3, c, 3, c+span-1);
    ws.getCell(3, c).value = cat.label;
    for(let i=0;i<span;i++) ws.getCell(3, c+i).fill = xFill(cat.head);
    BK.forEach((b,i)=>{
      const cell = ws.getCell(4, c+i);
      cell.value = b.label;
      cell.fill = xFill(b.last ? XC.hot : cat.fill);
    });
    const tc = ws.getCell(4, c+BK.length); tc.value = 'Total'; tc.fill = xFill(cat.fill);
    c += span;
  });
  ws.mergeCells(3, c, 4, c); ws.getCell(3, c).value = 'Grand total';
  [3,4].forEach(rn=>{
    const row = ws.getRow(rn);
    for(let i=1;i<=NC;i++){
      const cell = row.getCell(i);
      cell.border = XBORDER;
      if(!cell.fill || cell.fill.type !== 'pattern') cell.fill = xFill(XC.head);
      cell.font = {bold:true, size:10, color:{argb:XC.headInk}};
      cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
    }
    row.height = 18;
  });
  ws.columns.forEach((col,i)=> col.width = i === 0 ? 7 : (i === 1 ? 26 : 12));
  ws.views = [{state:'frozen', xSplit:2, ySplit:4}];
  ws.pageSetup = {orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0};
  const lineFor = (name, group)=>{
    const vals = []; let grand = 0;
    cats.forEach(cat=>{
      let ct = 0;
      bucketsFor(cat.key).forEach(b=>{
        const v = allDataCount(cat.key, name, b.key, group);
        vals.push(v); ct += v;
      });
      vals.push(ct); grand += ct;
    });
    vals.push(grand);
    return {vals, grand};
  };
  const sumFor = (names, group)=>{
    const out = {vals:null, grand:0};
    names.forEach(n=>{
      const l = lineFor(n, group);
      if(!out.vals) out.vals = l.vals.slice();
      else l.vals.forEach((v,i)=> out.vals[i] += v);
    });
    if(!out.vals) out.vals = lineFor(' none', group).vals.map(()=>0);
    out.grand = out.vals[out.vals.length-1];
    return out;
  };
  const styleData = (row, opts)=>{
    const o = opts || {};
    for(let i=1;i<=NC;i++){
      const cell = row.getCell(i);
      cell.border = XBORDER;
      cell.alignment = {horizontal: i<=2 ? 'left' : 'center', vertical:'middle'};
      cell.font = {bold:!!o.bold, size:10, color:{argb:XC.headInk}};
      if(o.fill) cell.fill = xFill(o.fill);
    }
    if(!o.fill){
      let cc = 3;
      cats.forEach(cat=>{
        const BK = bucketsFor(cat.key);
        BK.forEach((b,i)=>{ if(b.last){ const cell = row.getCell(cc+i); cell.fill = xFill(XC.hot); cell.font = {bold:true, size:10, color:{argb:XC.hotInk}}; } });
        cc += BK.length; row.getCell(cc).fill = xFill(cat.fill); cc++;
      });
      row.getCell(NC).fill = xFill(XC.totCol);
    }
    row.height = o.bold ? 18 : 16;
  };
  const groupRow = (label)=>{
    const row = xAddRow(ws, [label]);
    ws.mergeCells(row.number, 1, row.number, NC);
    styleData(row, {fill:XC.grp, bold:true});
    return row;
  };
  if(surveyors.length){
    groupRow('Surveyor');
    surveyors.forEach((n,i)=> styleData(xAddRow(ws, [i+1, n].concat(lineFor(n, 'surveyor').vals))));
    const st = sumFor(surveyors, 'surveyor');
    const row = xAddRow(ws, ['', 'Total'].concat(st.vals));
    ws.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).value = 'Total';
    styleData(row, {fill:XC.subtotal, bold:true});
    row.getCell(1).alignment = {horizontal:'center', vertical:'middle'};
  }
  if(vaos.length){
    groupRow('VAO — ISD (Rural)');
    vaos.forEach((n,i)=> styleData(xAddRow(ws, [i+1, n].concat(lineFor(n, 'vao').vals))));
    const vt = sumFor(vaos, 'vao');
    const row = xAddRow(ws, ['', 'VAO Total'].concat(vt.vals));
    ws.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).value = 'VAO Total';
    styleData(row, {fill:XC.vao, bold:true});
    row.getCell(1).alignment = {horizontal:'center', vertical:'middle'};
  }
  const st = sumFor(surveyors, 'surveyor'), vt = sumFor(vaos, 'vao');
  const gv = st.vals.map((v,i)=> v + vt.vals[i]);
  const grow = xAddRow(ws, ['', 'Taluk Total'].concat(gv));
  ws.mergeCells(grow.number, 1, grow.number, 2);
  grow.getCell(1).value = 'Taluk Total';
  styleData(grow, {fill:XC.grand, bold:true});
  grow.getCell(1).alignment = {horizontal:'center', vertical:'middle'};
  return ws;
}
async function exportAllDataStyled(){
  const wb = new ExcelJS.Workbook();
  if(!buildAllDataSheet(wb)) return false;
  await downloadWorkbook(wb, (talukSlug() + '_all_pending_data.xlsx'));
  return true;
}
function makeLookup(pairs){
  const map = new Map();
  pairs.forEach(([raw, val])=>{
    villageKeys(raw).forEach(k=>{ if(!map.has(k)) map.set(k, val); });
  });
  return {map, keys:Array.from(map.keys())};
}
function lookupVillage(raw, L){
  if(!L) return undefined;
  const keys = villageKeys(raw);
  for(const k of keys){ if(L.map.has(k)) return L.map.get(k); }
  if(!OPT.fuzzy || !keys.length) return undefined;
  const t = keys[0];
  if(t.length < 4) return undefined;
  const max = t.length > 9 ? 2 : 1;
  let best = null, bestD = max+1, ties = 0;
  for(const k of L.keys){
    const d = editDistance(t, k, max);
    if(d <= max){
      if(d < bestD){ bestD = d; best = k; ties = 1; }
      else if(d === bestD && L.map.get(k) !== L.map.get(best)) ties++;
    }
  }
  if(best && ties === 1) return L.map.get(best);
  const subs = L.keys.filter(k => k.length>4 && (k.startsWith(t) || t.startsWith(k)));
  if(subs.length === 1) return L.map.get(subs[0]);
  return undefined;
}
const RE_PDF_VILLAGE = /^(\d{1,3})\s+(\d{1,4})\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;
const RE_PDF_SUB     = /^(not\s+involving|involving)\s+sub\s*-?\s*division\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i;
const RE_PDF_TOTAL   = /^total\s+\d+/i;
function pdfLines(items){
  const rows = new Map();
  for(const it of items){
    const s = (it.str||'').trim(); if(!s) continue;
    const y = Math.round(it.transform[5]*2)/2;
    let key = null;
    for(const k of rows.keys()){ if(Math.abs(k-y) <= 2.5){ key = k; break; } }
    if(key === null){ key = y; rows.set(key, []); }
    rows.get(key).push({x: it.transform[4], s});
  }
  return Array.from(rows.entries()).sort((a,b)=>b[0]-a[0])
    .map(([,arr]) => arr.sort((a,b)=>a.x-b.x).map(o=>o.s).join(' ').replace(/\s+/g,' ').trim());
}
function parsePdfLines(lines){
  const villages = new Map();
  const grand = {};
  let cur = null;
  for(const raw of lines){
    const ln = String(raw).replace(/\s+/g,' ').trim();
    if(RE_PDF_TOTAL.test(ln)){
      const n = ln.match(/^total\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i);
      if(n) grand.all = {approved:+n[1], pending:+n[2], rejected:+n[3], returned:+n[4], total:+n[5]};
      cur = null; continue;
    }
    let m = ln.match(RE_PDF_SUB);
    if(m){
      const rec = {approved:+m[2], pending:+m[3], rejected:+m[4], returned:+m[5], total:+m[6]};
      const isInv = !/^not/i.test(m[1]);
      if(cur) cur[isInv ? 'inv' : 'notinv'] = rec;
      else if(isInv) grand.inv = rec;
      continue;
    }
    m = ln.match(RE_PDF_VILLAGE);
    if(m && !/^total$/i.test(m[3].trim())){
      cur = {sno:+m[1], code:m[2], village:m[3].trim(),
             approved:+m[4], pending:+m[5], rejected:+m[6], returned:+m[7], total:+m[8],
             inv:null, notinv:null};
      villages.set(cur.village, cur);
    }
  }
  return {villages, grand};
}
async function readStatusPdf(buf){
  if(!window.pdfjsLib) throw new Error('PDF reader could not be loaded — check your internet connection.');
  try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }catch(e){}
  const doc = await window.pdfjsLib.getDocument({data: buf}).promise;
  const lines = [];
  for(let p=1; p<=doc.numPages; p++){
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    lines.push(...pdfLines(tc.items));
  }
  const parsed = parsePdfLines(lines);
  if(!parsed.villages.size) throw new Error('No village rows found — is this the Application Status report?');
  return parsed;
}
function parseOptPending(rows){
  let gRow = -1;
  for(let i=0; i<Math.min(rows.length, 12); i++){
    const r = (rows[i]||[]).map(norm);
    if(r.includes('surveyor') || r.includes('vao')){ gRow = i; break; }
  }
  if(gRow < 0) throw new Error('Could not find the SURVEYOR / VAO column headings.');
  const groups = rows[gRow].map(norm);
  const sub    = (rows[gRow+1]||[]).map(norm);
  const vCol   = groups.findIndex(h => h.includes('villagename') || h === 'village');
  if(vCol < 0) throw new Error('Could not find the Village Name column.');
  const tCol   = groups.findIndex(h => h.includes('talukname') || h === 'taluk');
  const groupTotalCol = (name)=>{
    const start = groups.findIndex(h => h === name);
    if(start < 0) return -1;
    let end = groups.length;
    for(let j=start+1; j<groups.length; j++){ if(groups[j]){ end = j; break; } }
    for(let j=start; j<end; j++){ if(sub[j] === 'total') return j; }
    return start + 2 < end ? start + 2 : start;
  };
  const cols = {surv:groupTotalCol('surveyor'), vao:groupTotalCol('vao'),
                lrd:groupTotalCol('lrd'), dis:groupTotalCol('dis'), thl:groupTotalCol('thl'),
                all:groupTotalCol('total')};
  if(cols.surv < 0 && cols.vao < 0) throw new Error('Neither a SURVEYOR nor a VAO column group was found.');
  const out = []; let footer = null;
  for(let i=gRow+2; i<rows.length; i++){
    const r = rows[i] || [];
    const label = String(r[vCol]==null?'':r[vCol]).trim();
    const num = c => { const v = c<0 ? 0 : r[c]; const n = typeof v==='number' ? v : parseInt(String(v||'').replace(/[^0-9-]/g,''),10); return isNaN(n)?0:n; };
    const rec = {label, taluk: tCol >= 0 ? String(r[tCol]==null?'':r[tCol]).trim() : '',
                 surv:num(cols.surv), vao:num(cols.vao), lrd:num(cols.lrd), dis:num(cols.dis), thl:num(cols.thl), all:num(cols.all)};
    if(!label) continue;
    if(norm(label) === 'total'){ footer = rec; continue; }
    out.push(rec);
  }
  if(!out.length) throw new Error('No village rows found below the header.');
  return {rows:out, footer};
}
function blankRow(){
  const b = {}; bucketsFor('isdRural').forEach(x => b[x.key] = 0);
  return {b, pending:0, approved:0, rejected:0, villages:{}};
}
function addVillage(rec, village){
  if(!rec.villages[village]){
    const o = {}; bucketsFor('isdRural').forEach(x => o[x.key] = 0);
    rec.villages[village] = {b:o, pending:0, approved:0, rejected:0};
  }
  return rec.villages[village];
}
function isdReady(){
  return !!(store.village && store.vaoDetails && OPT_KEYS.some(k => store[k]));
}
function isdMissing(){
  const m = [];
  if(!store.village) m.push('village');
  if(!store.vaoDetails) m.push('vaoDetails');
  if(!OPT_KEYS.some(k => store[k])) m.push(OPT_KEYS[0]);
  return m;
}
function aggregateIsdRural(){
  if(!isdReady()) return {ready:false, missing:isdMissing()};
  const villageL = (()=>{
    const {header, objs} = store.village;
    const vK = findKey(header, ['Village','Village Name','VillageName']);
    const uK = findKeyStrict(header, ['Name','User name','User Name','Username','Surveyor Name','Surveyor','Officer','User']);
    const tK = talukKeyOf(header);
    return makeLookup(objs.filter(o => !tK || inTaluk(o[tK]))
      .map(o => [o[vK], String(o[uK]==null?'':o[uK]).trim()]).filter(p => p[0] && p[1]));
  })();
  const vaoL = (()=>{
    const {header, objs} = store.vaoDetails;
    const vK = findKey(header, ['Village Name','Village','VillageName']);
    const nK = findKeyStrict(header, ['VAO Name','VAO','Name','User name']);
    const tK = talukKeyOf(header);
    return makeLookup(objs.filter(o => !tK || inTaluk(o[tK]))
      .map(o => [o[vK], String(o[nK]==null?'':o[nK]).trim()]).filter(p => p[0] && p[1]));
  })();
  const surveyors = {}, vaos = {};
  const noSurveyor = new Set(), noVao = new Set(), otherRoles = new Map();
  const loadedSlots = [], slotTotals = {}, slotChecks = [];
  const pendingByVillage = new Map();   // village key -> {surv, vao, label}
  const get = (bag, name) => bag[name] = bag[name] || blankRow();
  OPT_SLOTS.forEach((slot, i)=>{
    const f = store[slot.key];
    if(!f) return;
    loadedSlots.push(slot);
    const bk = bucketsFor('isdRural')[i].key;
    let sSum = 0, vSum = 0;
    f.rows.forEach(r=>{
      if(!inTaluk(r.taluk)) return;
      const other = r.lrd + r.dis + r.thl;
      if(other > 0) otherRoles.set(r.label, (otherRoles.get(r.label)||0) + other);
      const pk = norm(r.label) || r.label;
      const pv = pendingByVillage.get(pk) || {surv:0, vao:0, label:r.label};
      pv.surv += r.surv; pv.vao += r.vao; pendingByVillage.set(pk, pv);
      if(r.surv > 0){
        sSum += r.surv;
        const name = lookupVillage(r.label, villageL);
        if(!name) noSurveyor.add(r.label);
        else{
          const rec = get(surveyors, name), v = addVillage(rec, r.label);
          rec.b[bk] += r.surv; rec.pending += r.surv;
          v.b[bk]   += r.surv; v.pending   += r.surv;
        }
      }
      if(r.vao > 0){
        vSum += r.vao;
        const name = lookupVillage(r.label, vaoL);
        if(!name) noVao.add(r.label);
        const rec = get(vaos, name || 'VAO — name not listed'), v = addVillage(rec, r.label);
        rec.b[bk] += r.vao; rec.pending += r.vao;
        v.b[bk]   += r.vao; v.pending   += r.vao;
      }
    });
    slotTotals[slot.key] = {surv:sSum, vao:vSum};
    if(f.footer){
      slotChecks.push({slot, fileSurv:f.footer.surv, fileVao:f.footer.vao, gotSurv:sSum, gotVao:vSum,
                       okSurv:f.footer.surv === sSum, okVao:f.footer.vao === vSum});
    }
  });
  let pdfNoOwner = new Map(), pdfApproved = 0, pdfRejected = 0;
  const pdf = store.isdRuralPdf;
  if(pdf){
    for(const pv of pdf.villages.values()){
      if(!pv.inv) continue;
      pdfApproved += pv.inv.approved; pdfRejected += pv.inv.rejected;
      if(!pv.inv.approved && !pv.inv.rejected) continue;
      const p = pendingByVillage.get(norm(pv.village)) || {surv:0, vao:0};
      let bag = null, name = null;
      if(p.vao > p.surv){ name = lookupVillage(pv.village, vaoL); bag = vaos; if(!name){ name = 'VAO — name not listed'; noVao.add(pv.village); } }
      else{
        name = lookupVillage(pv.village, villageL); bag = surveyors;
        if(!name){ name = lookupVillage(pv.village, vaoL); bag = vaos; }
      }
      if(!name){ pdfNoOwner.set(pv.village, pv.inv.approved + pv.inv.rejected); continue; }
      const rec = get(bag, name), v = addVillage(rec, pv.village);
      rec.approved += pv.inv.approved; rec.rejected += pv.inv.rejected;
      v.approved   += pv.inv.approved; v.rejected   += pv.inv.rejected;
    }
  }
  const names = o => Object.keys(o).sort((a,b)=>a.localeCompare(b));
  return {
    ready:true, missing:[],
    surveyors, vaos, surveyorNames:names(surveyors), vaoNames:names(vaos),
    loadedSlots, slotTotals, slotChecks,
    noSurveyor, noVao, otherRoles, pdfNoOwner, pdfApproved, pdfRejected,
    pdfGrand: pdf ? pdf.grand : null, hasPdf: !!pdf
  };
}
let R = null;
const openIsd = new Set();
const sumRows = list => list.reduce((acc, r)=>{
  bucketsFor('isdRural').forEach(x => acc.b[x.key] += r.b[x.key]);
  acc.pending += r.pending; acc.approved += r.approved; acc.rejected += r.rejected;
  return acc;
}, blankRow());
function pctCls(p){ return p==null ? 'pc-n' : (p <= 20 ? 'pc-g' : (p <= 50 ? 'pc-y' : 'pc-r')); }
function rejPct(r){ const d = r.approved + r.rejected; return d ? Math.round(r.rejected/d*100) : null; }
function repCellsNoDisposal(r){
  let h = '';
  bucketsFor('isdRural').forEach(x=>{
    const v = r.b[x.key];
    h += '<td class="num'+(x.last?' b-last':'')+(v===0?' zero':'')+'">'+v+'</td>';
  });
  h += '<td class="num tot">'+r.pending+'</td>';
  return h;
}
function repCells(r){
  let h = '';
  bucketsFor('isdRural').forEach((x)=>{
    const v = r.b[x.key];
    h += '<td class="num'+(x.last?' b-last':'')+(v===0?' zero':'')+'">'+v+'</td>';
  });
  h += '<td class="num tot">'+r.pending+'</td>';
  h += '<td class="num'+(r.approved===0?' zero':'')+'">'+r.approved+'</td>';
  h += '<td class="num'+(r.rejected===0?' zero':'')+'">'+r.rejected+'</td>';
  h += '<td class="num dtot">'+(r.approved+r.rejected)+'</td>';
  const p = rejPct(r);
  h += '<td class="num '+pctCls(p)+'">'+(p==null ? '—' : p)+'</td>';
  return h;
}
function subHead(extra, noDisposal){
  const BK = bucketsFor('isdRural');
  return '<tr>' + (extra ? '<th style="text-align:left">'+esc(extra)+'</th>' : '') +
    '<th style="text-align:left">Village</th>' +
    BK.map(b=>'<th'+(b.last?' class="b-last"':'')+'>'+esc(b.label)+'</th>').join('') +
    '<th>Total</th>' +
    (noDisposal ? '' : '<th>Approved</th><th>Rejection</th><th>Total</th><th>Rejection %</th>') +
    '</tr>';
}
function villageSubTable(rec){
  const names = Object.keys(rec.villages).filter(v=>{
    const x = rec.villages[v]; return x.pending || x.approved || x.rejected;
  }).sort();
  if(!names.length) return '<div class="empty" style="padding:14px">No villages with pending applications or disposal.</div>';
  let h = '<table><thead>' + subHead(null) + '</thead><tbody>';
  names.forEach(v => h += '<tr><td class="nm">'+esc(v)+'</td>'+repCells(rec.villages[v])+'</tr>');
  return h + '</tbody></table>';
}
function renderIsdReport(){
  const box = document.getElementById('isdRep');
  const note = document.getElementById('isdNote');
  R = aggregateIsdRural();
  if(!R.ready){
    const need = ['village','vaoDetails','isdRuralPdf'].concat(OPT_KEYS);
    box.innerHTML = '<div class="miss"><b>ISD Rural report not ready.</b><br>' +
      'Load Village Details, VAO Details and at least one VillageWise OPT Pending export.' +
      '<ul>' + need.map(k=>'<li class="'+(store[k]?'have':'')+'">'+(store[k]?'✓ ':'')+esc(FILE_NAMES[k])+'</li>').join('') + '</ul></div>';
    note.textContent = '';
    document.getElementById('isdActions').style.display = 'none';
    document.getElementById('isdPrintSub').textContent = '';
    document.getElementById('isdPrintVao').innerHTML = '';
    return;
  }
  document.getElementById('isdActions').style.display = 'flex';
  const sRows = R.surveyorNames.map(n => R.surveyors[n]);
  const vRows = R.vaoNames.map(n => R.vaos[n]);
  const sTotal = sumRows(sRows), vTotal = sumRows(vRows), gTotal = sumRows([sTotal, vTotal]);
  const COLS = 2 + bucketsFor('isdRural').length + 1 + 3 + 1;
  let h = '<table class="rep-t"><thead>';
  h += '<tr><th rowspan="2">S.No</th><th rowspan="2" style="text-align:left">Name</th>';
  bucketsFor('isdRural').forEach((b,i)=>{
    const sl = OPT_SLOTS[i], loaded = !!(sl && store[sl.key]);
    h += '<th rowspan="2" class="'+(b.last?'b-last':'')+'"'+(loaded?'':' style="opacity:.55"')+
         ' title="'+esc(sl?sl.hint:'')+(loaded?'':' — file not loaded')+'">'+esc(b.label)+'</th>';
  });
  h += '<th rowspan="2">Total</th><th colspan="3">Disposal</th><th rowspan="2">Rejection&nbsp;%</th></tr>';
  h += '<tr><th>Approved</th><th>Rejection</th><th>Total</th></tr></thead><tbody>';
  h += '<tr class="grp"><td colspan="'+COLS+'">Surveyor</td></tr>';
  R.surveyorNames.forEach((n,i)=>{
    const rec = R.surveyors[n], key = 's::'+n, open = openIsd.has(key);
    h += '<tr class="owner'+(open?' open':'')+'" data-k="'+esc(key)+'">'+
         '<td class="sn">'+(i+1)+'</td>'+
         '<td class="nm"><span class="chev">&#9654;</span>'+esc(n)+'</td>'+ repCells(rec) +'</tr>';
    if(open) h += '<tr class="sub"><td colspan="'+COLS+'"><div class="inner">'+villageSubTable(rec)+'</div></td></tr>';
  });
  h += '<tr class="subtotal"><td colspan="2" style="text-align:center">Total</td>'+ repCells(sTotal) +'</tr>';
  const vKey = 'vao::all', vOpen = openIsd.has(vKey);
  h += '<tr class="owner vaorow'+(vOpen?' open':'')+'" data-k="'+vKey+'">'+
       '<td class="sn">'+(R.surveyorNames.length+1)+'</td>'+
       '<td class="nm"><span class="chev">&#9654;</span>VAO</td>'+ repCells(vTotal) +'</tr>';
  if(vOpen){
    let inner = '<table><thead>' + subHead('VAO Name', true) + '</thead><tbody>';
    let any = false;
    R.vaoNames.forEach(n=>{
      const rec = R.vaos[n];
      Object.keys(rec.villages).sort().forEach(v=>{
        const x = rec.villages[v];
        if(!x.pending && !x.approved && !x.rejected) return;
        any = true;
        inner += '<tr><td class="nm">'+esc(n)+'</td><td class="nm">'+esc(v)+'</td>'+repCellsNoDisposal(x)+'</tr>';
      });
    });
    inner += '</tbody></table>';
    h += '<tr class="sub"><td colspan="'+COLS+'"><div class="inner">'+
         (any ? inner : '<div class="empty" style="padding:14px">No VAO villages with pending applications.</div>')+'</div></td></tr>';
  }
  h += '<tr class="grand"><td colspan="2" style="text-align:center">Taluk Total</td>'+ repCells(gTotal) +'</tr>';
  h += '</tbody></table>';
  box.innerHTML = h;
  const bits = [];
  bits.push('<b>'+R.surveyorNames.length+'</b> surveyor'+(R.surveyorNames.length!==1?'s':''));
  bits.push('<b>'+R.vaoNames.length+'</b> VAO'+(R.vaoNames.length!==1?'s':''));
  bits.push('pending <b>'+gTotal.pending+'</b> (surveyor '+sTotal.pending+' · VAO '+vTotal.pending+')');
  bits.push('disposal <b>'+(gTotal.approved+gTotal.rejected)+'</b>');
  let extra = '';
  const notLoaded = OPT_SLOTS.filter(s => !store[s.key]);
  if(notLoaded.length) extra += '<br><span style="color:var(--warn)">⚠ '+notLoaded.map(s=>esc(s.label)).join(', ')+' not loaded — those columns read zero.</span>';
  R.slotChecks.forEach(c=>{
    if(!c.okSurv || !c.okVao){
      extra += '<br><span style="color:var(--warn)">⚠ '+esc(c.slot.label)+': file Total row says surveyor '+c.fileSurv+' / VAO '+c.fileVao+
               ', attributed '+c.gotSurv+' / '+c.gotVao+' — the difference is villages with no matching name below.</span>';
    }
  });
  const allOk = R.slotChecks.length && R.slotChecks.every(c=>c.okSurv && c.okVao);
  if(allOk) extra += '<br><span style="color:var(--ok)">✓ every loaded OPT file reconciles exactly with its own Total row.</span>';
  if(R.noSurveyor.size) extra += '<br><span style="color:var(--warn)">⚠ '+R.noSurveyor.size+' village(s) with surveyor pending are missing from Village Details: '+esc(Array.from(R.noSurveyor).slice(0,8).join(', '))+(R.noSurveyor.size>8?' …':'')+'</span>';
  if(R.noVao.size)      extra += '<br><span style="color:var(--warn)">⚠ '+R.noVao.size+' village(s) with VAO pending are missing from VAO Details: '+esc(Array.from(R.noVao).slice(0,8).join(', '))+(R.noVao.size>8?' …':'')+'</span>';
  if(R.otherRoles.size){
    const n = Array.from(R.otherRoles.values()).reduce((s,v)=>s+v,0);
    extra += '<br><span style="color:var(--muted)">'+n+' application(s) are pending with LRD / DIS / THL and are not shown — this report covers Surveyor and VAO only.</span>';
  }
  if(!R.hasPdf){
    extra += '<br><span style="color:var(--muted)">No Application Status PDF loaded — the Today Disposal columns are empty.</span>';
  }else{
    const inv = R.pdfGrand && R.pdfGrand.inv;
    const got = gTotal.approved + gTotal.rejected;
    if(inv){
      const want = inv.approved + inv.rejected;
      extra += '<br><span style="color:'+(want===got?'var(--ok)':'var(--muted)')+'">'+(want===got?'✓ ':'')+
        'PDF Involving Sub-Division disposal: '+inv.approved+' approved, '+inv.rejected+' rejected'+
        (want===got ? ' — fully attributed.' : ' · attributed '+gTotal.approved+' / '+gTotal.rejected+'.')+'</span>';
    }
    if(R.pdfNoOwner.size) extra += '<br><span style="color:var(--warn)">⚠ '+R.pdfNoOwner.size+' village(s) in the PDF match neither Village Details nor VAO Details: '+esc(Array.from(R.pdfNoOwner.keys()).slice(0,8).join(', '))+(R.pdfNoOwner.size>8?' …':'')+'</span>';
    extra += '<br><span style="color:var(--muted)">Disposal is credited to whichever role holds that village’s pending; villages with no pending go to their surveyor.</span>';
  }
  note.innerHTML = bits.join(' &middot; ') + extra;
  document.getElementById('isdPrintSub').textContent =
    (TALUK ? TALUK + ' taluk · ' : '') + 'As on ' + new Date().toLocaleDateString('en-GB') +
    ' · surveyor ' + sTotal.pending + ' · VAO ' + vTotal.pending + ' · taluk total ' + gTotal.pending;
  renderVaoPrintPage(vTotal);
  isdMatrix(sTotal, vTotal, gTotal);
}
function renderVaoPrintPage(vTotal){
  const box = document.getElementById('isdPrintVao');
  const BKR = bucketsFor('isdRural');
  const head = '<tr><th style="text-align:left">S.No</th><th style="text-align:left">VAO Name</th><th style="text-align:left">Village</th>' +
    BKR.map(b=>'<th'+(b.last?' class="b-last"':'')+'>'+esc(b.label)+'</th>').join('') +
    '<th>Total</th></tr>';
  const cell = (r)=>{
    let h = '';
    BKR.forEach(x => h += '<td'+(x.last?' class="b-last"':'')+'>'+r.b[x.key]+'</td>');
    h += '<td>'+r.pending+'</td>';
    return h;
  };
  let body = '', n = 0;
  R.vaoNames.forEach(name=>{
    const rec = R.vaos[name];
    Object.keys(rec.villages).sort().forEach(v=>{
      const x = rec.villages[v];
      if(!x.pending && !x.approved && !x.rejected) return;
      body += '<tr><td class="nm">'+(++n)+'</td><td class="nm">'+esc(name)+'</td><td class="nm">'+esc(v)+'</td>'+cell(x)+'</tr>';
    });
  });
  if(!n){ box.innerHTML = ''; return; }
  box.innerHTML =
    '<h3>ISD (Rural) \u2014 VAO Details, village wise (' + n + ' village' + (n!==1?'s':'') + ')</h3>' +
    '<table><thead>'+head+'</thead><tbody>'+body+
    '<tr class="grand"><td colspan="3" style="text-align:center">VAO Total</td>'+cell(vTotal)+'</tr>'+
    '</tbody></table>';
}
let isdLastMatrix = null;
function isdMatrix(sTotal, vTotal, gTotal){
  const head = ['S.No','Name'].concat(OPT_SLOTS.map(s=>s.label), ['Total','Approved','Rejection','Disposal Total','Rejection %']);
  const line = (sno, name, r) => [sno, name].concat(bucketsFor('isdRural').map(b=>r.b[b.key]),
    [r.pending, r.approved, r.rejected, r.approved+r.rejected, rejPct(r)==null?'':rejPct(r)]);
  const rows = [head];
  R.surveyorNames.forEach((n,i)=> rows.push(line(i+1, n, R.surveyors[n])));
  rows.push(line('', 'Total', sTotal));
  rows.push(line(R.surveyorNames.length+1, 'VAO', vTotal));
  R.vaoNames.forEach(n=>{
    const rec = R.vaos[n];
    Object.keys(rec.villages).sort().forEach(v=>{
      const x = rec.villages[v];
      if(!x.pending && !x.approved && !x.rejected) return;
      rows.push(line('', '    ' + n + ' — ' + v, x));
    });
  });
  rows.push(line('', 'Taluk Total', gTotal));
  isdLastMatrix = rows;
}
document.addEventListener('click', e=>{
  const row = e.target.closest('tr.owner');
  if(row && row.dataset.k){
    const k = row.dataset.k;
    if(openIsd.has(k)) openIsd.delete(k); else openIsd.add(k);
    renderIsdReport();
  }
});
document.getElementById('isdExpandBtn').addEventListener('click', ()=>{
  if(!R || !R.ready) return;
  if(openIsd.size){ openIsd.clear(); }
  else { R.surveyorNames.forEach(n=>openIsd.add('s::'+n)); openIsd.add('vao::all'); }
  document.getElementById('isdExpandBtn').innerHTML = openIsd.size ? '&#8942; Collapse all' : '&#8942; Expand all';
  renderIsdReport();
});
document.getElementById('isdXlsBtn').addEventListener('click', async ()=>{
  if(!R || !R.ready){ toast('Nothing to export', 'Load the ISD Rural files first.', 'warn'); return; }
  try{
    if(window.ExcelJS){
      await exportIsdStyled();
      const n = (A && A.users.length) ? 4 : 2;
      toast('Excel exported', (talukSlug() + '_isd_rural_pending_details.xlsx — ') + n + ' sheets, same as the printed pages', 'ok');
    }else{
      exportPlain(isdLastMatrix, 'ISD Rural Pending', (talukSlug() + '_isd_rural_pending_details.xlsx'));
      toast('Excel exported (plain)', 'Styling library unavailable — values only.', 'warn');
    }
  }catch(err){ toast('Excel export failed', err.message, 'err'); }
});
document.getElementById('isdAllBtn').addEventListener('click', async ()=>{
  if(!window.ExcelJS){ toast('Not available', 'The Excel styling library could not be loaded.', 'err'); return; }
  if(!allDataReady()){ toast('Nothing to export', 'Load the ISD Rural files, or the ISD Natham / F Line files.', 'warn'); return; }
  try{
    const cats = allDataCats().map(c=>c.label).join(', ');
    if(await exportAllDataStyled()) toast('Excel exported', (talukSlug() + '_all_pending_data.xlsx — ') + cats, 'ok');
    else toast('Nothing to export', 'No pending applications found.', 'warn');
  }catch(err){ toast('Excel export failed', err.message, 'err'); }
});
document.getElementById('isdPrintBtn').addEventListener('click', ()=>{
  document.body.classList.add('print-isd-only');
  window.print();
  setTimeout(()=>document.body.classList.remove('print-isd-only'), 400);
});
const TALUK_COLS = ['Taluk Name','TalukName','Taluk','Taluk_Name'];
function talukKeyOf(header){ return findKey(header, TALUK_COLS); }
function allTaluks(){
  const set = new Map();
  const add = v => { const t = String(v==null?'':v).trim(); if(t && norm(t) !== 'total') set.set(norm(t), t); };
  ['isdNatham','flineRural','flineNatham','village','vaoDetails'].forEach(k=>{
    const f = store[k]; if(!f || !f.objs) return;
    const tk = talukKeyOf(f.header); if(!tk) return;
    f.objs.forEach(o => add(o[tk]));
  });
  OPT_KEYS.forEach(k=>{
    const f = store[k]; if(!f || !f.rows) return;
    f.rows.forEach(r => add(r.taluk));
  });
  return Array.from(set.values()).sort((a,b)=>a.localeCompare(b));
}
function inTaluk(value){
  if(!TALUK) return true;
  const t = String(value==null?'':value).trim();
  if(!t) return true;                       
  return norm(t) === norm(TALUK);
}
function refreshTalukSel(){
  const sel = document.getElementById('talukSel');
  const list = allTaluks();
  const cur = TALUK;
  sel.innerHTML = '<option value="">All taluks</option>' +
    list.map(t => '<option value="'+esc(t)+'"'+(norm(t)===norm(cur)?' selected':'')+'>'+esc(t)+'</option>').join('');
  if(cur && !list.some(t => norm(t) === norm(cur))){ TALUK = ''; sel.value = ''; }
  sel.disabled = list.length === 0;
  sel.title = list.length ? 'Showing ' + (TALUK || 'all taluks') : 'Load a file to see the taluks in it';
}
function talukSpread(key){
  const f = store[key];
  if(!f) return [];
  const set = new Set();
  if(f.rows){ f.rows.forEach(r => { if(r.taluk) set.add(norm(r.taluk)); }); }
  else if(f.objs){
    const tk = talukKeyOf(f.header);
    if(tk) f.objs.forEach(o => { const v = String(o[tk]||'').trim(); if(v) set.add(norm(v)); });
  }
  return Array.from(set);
}
function findKeyStrict(header, candidates){
  const H = header.map(h=>[norm(h), h]);
  for(const c of candidates){ const n = norm(c); const hit = H.find(([k])=>k === n); if(hit) return hit[1]; }
  for(const c of candidates){ const n = norm(c); const hit = H.find(([k])=>k && n.length > 2 && k.indexOf(n) >= 0); if(hit) return hit[1]; }
  return null;
}
function parseThresholds(text){
  return String(text||'').split(/[,\s;]+/).map(x=>parseInt(x,10)).filter(n=>!isNaN(n) && n > 0);
}
function adminRowsHtml(){
  const colour = {isdRural:'#B3A369', isdNatham:'#DB7FA6', flineRural:'#7FB85C', flineNatham:'#8E7CC3'};
  return CAT_KEYS.map(k=>{
    const c = CFG[k] || CFG_DEFAULT[k];
    const bk = makeBuckets(c);
    return '<div class="acat" data-cat="'+k+'">' +
      '<h3><i style="background:'+colour[k]+'"></i>'+esc(CAT_LABELS[k])+'</h3>' +
      '<div class="frow"><label>Day cut-offs</label>' +
        '<input type="text" class="thr" value="'+esc(c.thresholds.join(', '))+'" placeholder="e.g. 25, 30"></div>' +
      '<div class="frow"><label>Labels</label>' +
        '<input type="text" class="lbl" value="'+esc((c.labels||[]).join(' | '))+'" placeholder="leave blank to generate"></div>' +
      '<div class="prev">' + bk.map(b=>'<span class="'+(b.last?'last':'')+'">'+esc(b.label)+'</span>').join('') + '</div>' +
      '<div class="err">Enter at least one whole number above zero.</div>' +
      (k === 'isdRural' ? '<div class="prev" style="margin-top:6px"><span style="border-style:dashed">'+bk.length+' OPT Pending upload slot'+(bk.length!==1?'s':'')+'</span></div>' : '') +
      '</div>';
  }).join('');
}
function renderAdmin(){
  document.getElementById('adminBody').innerHTML = adminRowsHtml();
  document.querySelectorAll('#adminBody .acat').forEach(box=>{
    const upd = ()=>{
      const th = parseThresholds(box.querySelector('.thr').value);
      box.classList.toggle('bad', th.length === 0);
      if(!th.length) return;
      const labels = box.querySelector('.lbl').value.split('|').map(x=>x.trim());
      const bk = makeBuckets({thresholds:th, labels});
      const prev = box.querySelector('.prev');
      prev.innerHTML = bk.map(b=>'<span class="'+(b.last?'last':'')+'">'+esc(b.label)+'</span>').join('');
      const slots = box.parentElement && box.dataset.cat === 'isdRural' ? box.querySelectorAll('.prev')[1] : null;
      if(slots) slots.innerHTML = '<span style="border-style:dashed">'+bk.length+' OPT Pending upload slot'+(bk.length!==1?'s':'')+'</span>';
    };
    box.querySelector('.thr').addEventListener('input', upd);
    box.querySelector('.lbl').addEventListener('input', upd);
  });
}
function openAdmin(){
  renderAdmin();
  document.getElementById('adminPanel').hidden = false;
  document.getElementById('adminBack').hidden = false;
}
function closeAdmin(){
  document.getElementById('adminPanel').hidden = true;
  document.getElementById('adminBack').hidden = true;
}
function applyAdmin(){
  const next = cloneCfg(CFG);
  let bad = false;
  document.querySelectorAll('#adminBody .acat').forEach(box=>{
    const k = box.dataset.cat;
    const th = parseThresholds(box.querySelector('.thr').value);
    if(!th.length){ bad = true; box.classList.add('bad'); return; }
    const labels = box.querySelector('.lbl').value.split('|').map(x=>x.trim());
    next[k] = {thresholds: th.slice().sort((a,b)=>a-b), labels: labels.filter((x,i)=> i <= th.length)};
  });
  if(bad){ toast('Check the day ranges', 'Every category needs at least one cut-off.', 'err'); return false; }
  const beforeSlots = OPT_KEYS.slice();
  CFG = next; saveCfg(); rebuildBuckets();
  OPT_SLOTS = optSlots(); OPT_KEYS = OPT_SLOTS.map(s=>s.key);
  refreshFileNames();
  beforeSlots.forEach(k=>{ if(OPT_KEYS.indexOf(k) < 0) delete store[k]; });
  OPT_KEYS.forEach(k=>{ if(!(k in store)) store[k] = null; });
  renderOptDrops();
  updateRail();
  if(loadedCount()) render();
  return true;
}
function renderOptDrops(){
  const grid = document.querySelector('.uploads');
  grid.querySelectorAll('[data-optslot]').forEach(el=>el.remove());
  const anchor = grid.querySelector('[data-drop="isdNatham"]');
  const html = OPT_SLOTS.map((sl,i)=>{
    const bk = bucketsFor('isdRural')[i];
    const tag = bk.max === Infinity ? (bk.min + '+') : ('<' + (bk.max + 1));
    const loaded = !!store[sl.key];
    return '<div class="drop'+(loaded?' done':'')+'" data-optslot="1" data-drop="'+sl.key+'">' +
      '<span class="ic" style="background:'+bk.color+'">'+esc(tag)+'</span>' +
      '<span class="lab"><b>OPT Pending — '+esc(sl.label)+'</b><small>'+esc(store[sl.key] && store[sl.key].name ? store[sl.key].name : 'VillageWise OPT Pending export, '+sl.hint)+'</small></span>' +
      '<input type="file" data-cat="'+sl.key+'" accept=".xls,.xlsx,.csv,.htm,.html">' +
      '<span class="badge'+(loaded?' ok':'')+'" data-badge="'+sl.key+'">'+(loaded?'✓ loaded':'not loaded')+'</span>' +
      '</div>';
  }).join('');
  anchor.insertAdjacentHTML('beforebegin', html);
  grid.querySelectorAll('[data-optslot] input[type=file]').forEach(inp=>{
    inp.addEventListener('change', e => loadFile(inp.dataset.cat, e.target.files[0]));
  });
  grid.querySelectorAll('[data-optslot]').forEach(d => wireDrop(d));
}
const SB_URL  = 'https://ollhtyeflpggdazrsqsq.supabase.co';
const SB_KEY  = 'sb_publishable_vXtlD6VqEY8u_tBSdmw-0A_hxEIlf2j';
const SB_BUCKET = 'isd-uploads';
let sb = null;          
let ME = null;          
let CLOUD_ON = false;   
let RESTORING = false;  
const TALUK_SCOPED = () => ['isdRuralPdf'].concat(OPT_KEYS);
const kindTaluk = kind => (TALUK_SCOPED().indexOf(kind) >= 0 ? (TALUK || '') : '');
function cloudPill(state, text){
  const el = document.getElementById('cloudPill');
  if(!el) return;
  el.className = 'pill cloud ' + (state || '');
  el.style.display = 'inline-flex';
  el.textContent = text;
}
function gateMsg(kind, text){
  const m = document.getElementById('gateMsg');
  m.className = 'msg on ' + kind;
  m.innerHTML = text;
}
function showGate(show){
  document.getElementById('gate').classList.toggle('on', !!show);
  document.body.style.overflow = show ? 'hidden' : '';
}
async function initCloud(){
  if(!window.supabase){
    CLOUD_ON = false;
    cloudPill('off', 'offline');
    showGate(false);
    toast('Running offline', 'Could not reach the sign-in service — uploads stay in this browser only.', 'warn');
    return;
  }
  sb = window.supabase.createClient(SB_URL, SB_KEY);
  CLOUD_ON = true;
  const { data:{ session } } = await sb.auth.getSession();
  if(session) await onSignedIn(session);
  else { showGate(true); cloudPill('off', 'signed out'); }
  sb.auth.onAuthStateChange((evt, s)=>{
    if(evt === 'SIGNED_OUT'){ ME = null; showGate(true); cloudPill('off','signed out'); }
  });
}
async function onSignedIn(session){
  try{
    const { data, error } = await sb.rpc('isd_ensure_profile');
    if(error) throw error;
    ME = Array.isArray(data) ? data[0] : data;
  }catch(e){
    gateMsg('err', 'Signed in, but your account could not be loaded: ' + esc(e.message));
    return;
  }
  if(!ME || !ME.active){
    gateMsg('info', 'Your account <b>' + esc(session.user.email) + '</b> is not activated yet. Ask an administrator to enable it.');
    await sb.auth.signOut();
    return;
  }
  showGate(false);
  renderWhoAmI();
  applyTalukPermissions();
  await restoreFromCloud();
}
function renderWhoAmI(){
  const box = document.getElementById('whoami');
  if(!box || !ME) return;
  box.innerHTML = '<span class="rolechip' + (ME.role === 'admin' ? ' admin' : '') + '">' + esc(ME.role) + '</span>' +
                  '<b>' + esc(ME.full_name || ME.email) + '</b>';
  box.style.display = 'inline-flex';
  document.getElementById('signOutBtn').style.display = 'inline-flex';
  document.getElementById('usersBtn').style.display = ME.role === 'admin' ? 'inline-flex' : 'none';
}
function applyTalukPermissions(){
  if(!ME || ME.role === 'admin' || !ME.taluks || !ME.taluks.length) return;
  const sel = document.getElementById('talukSel');
  Array.prototype.forEach.call(sel.options, o=>{
    if(o.value && ME.taluks.indexOf(o.value) < 0) o.remove();
  });
  if(!TALUK || ME.taluks.indexOf(TALUK) < 0){
    TALUK = ME.taluks[0];
    sel.value = TALUK;
    refreshTitles();
  }
}
function serialiseParsed(kind, parsed){
  if(kind === 'isdRuralPdf'){
    return {type:'pdf', villages: Array.from(parsed.villages.values()), grand: parsed.grand};
  }
  if(OPT_KEYS.indexOf(kind) >= 0) return {type:'opt', rows: parsed.rows, footer: parsed.footer};
  return {type:'sheet', header: parsed.header, objs: parsed.objs};
}
function reviveParsed(kind, payload){
  if(!payload) return null;
  if(payload.type === 'pdf'){
    const m = new Map();
    (payload.villages||[]).forEach(v => m.set(v.village, v));
    return {villages:m, grand: payload.grand || {}};
  }
  if(payload.type === 'opt')   return {rows: payload.rows || [], footer: payload.footer || null};
  if(payload.type === 'sheet') return {header: payload.header || [], objs: payload.objs || []};
  return null;
}
function rowCountOf(kind, parsed){
  if(kind === 'isdRuralPdf') return parsed.villages.size;
  if(OPT_KEYS.indexOf(kind) >= 0) return parsed.rows.length;
  return parsed.objs.length;
}
async function saveToCloud(kind, file, parsed){
  if(!CLOUD_ON || !ME || RESTORING) return;
  const taluk = kindTaluk(kind);
  const path  = 'datasets/' + kind + (taluk ? '__' + taluk.replace(/[^A-Za-z0-9]+/g,'_') : '') + '/' + file.name;
  cloudPill('syncing', 'saving…');
  try{
    await sb.storage.from(SB_BUCKET).upload(path, file, {upsert:true, contentType:file.type || 'application/octet-stream'});
    const { error } = await sb.from('isd_datasets').upsert({
      kind, taluk,
      file_name: file.name,
      storage_path: path,
      payload: serialiseParsed(kind, parsed),
      row_count: rowCountOf(kind, parsed),
      uploaded_by: ME.id,
      uploaded_at: new Date().toISOString(),
    }, {onConflict:'kind,taluk'});
    if(error) throw error;
    cloudPill('saved', 'saved');
    toast('Saved to the cloud', FILE_NAMES[kind] + (taluk ? ' · ' + taluk : '') + ' — it will load automatically next time.', 'ok');
  }catch(e){
    cloudPill('off', 'not saved');
    toast('Could not save to the cloud', e.message || String(e), 'err');
  }
}
async function restoreFromCloud(){
  if(!CLOUD_ON || !ME) return;
  RESTORING = true;
  cloudPill('syncing', 'loading…');
  try{
    const { data, error } = await sb.from('isd_datasets').select('*');
    if(error) throw error;
    let n = 0;
    (data || []).forEach(row=>{
      const known = (row.kind in store) || OPT_KEYS.indexOf(row.kind) >= 0;
      if(!known) return;
      if(row.taluk && TALUK && row.taluk !== TALUK) return;    
      const parsed = reviveParsed(row.kind, row.payload);
      if(!parsed) return;
      parsed.name = row.file_name;
      parsed.fromCloud = true;
      parsed.uploadedAt = row.uploaded_at;
      store[row.kind] = parsed;
      markLoaded(row.kind, row.file_name, rowCountOf(row.kind, parsed), true);
      n++;
    });
    refreshTalukSel(); refreshTitles(); updateRail();
    if(n) render();
    cloudPill(n ? 'saved' : '', n ? n + ' file' + (n!==1?'s':'') + ' loaded' : 'no saved files');
    if(n) toast('Loaded from the cloud', n + ' saved file' + (n!==1?'s':'') + ' — no need to upload again.', 'ok');
  }catch(e){
    cloudPill('off', 'load failed');
    toast('Could not load saved files', e.message || String(e), 'err');
  }finally{
    RESTORING = false;
  }
}
function markLoaded(kind, name, rows, fromCloud){
  const badge = document.querySelector('[data-badge="' + kind + '"]');
  const drop  = document.querySelector('[data-drop="' + kind + '"]');
  if(!badge || !drop) return;
  badge.className = 'badge ok';
  badge.textContent = '✓ ' + rows + (kind === 'isdRuralPdf' ? ' villages' : ' rows');
  drop.classList.add('done');
  const small = drop.querySelector('.lab small');
  if(small) small.textContent = (fromCloud ? '☁ ' : '') + name;
}
let ADMIN_TAB = 'users';
function openUsersPanel(){
  document.getElementById('usersPanel').hidden = false;
  document.getElementById('usersBack').hidden = false;
  renderAdminTabs();
}
function closeUsersPanel(){
  document.getElementById('usersPanel').hidden = true;
  document.getElementById('usersBack').hidden = true;
}
function renderAdminTabs(){
  document.querySelectorAll('#usersTabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab === ADMIN_TAB));
  if(ADMIN_TAB === 'users') renderUsers(); else renderFiles();
}
const talukOptions = (sel)=>{
  const all = allTaluks();
  return '<option value="">All taluks</option>' +
    all.map(t=>'<option value="'+esc(t)+'"'+((sel||[]).indexOf(t)>=0?' selected':'')+'>'+esc(t)+'</option>').join('');
};
async function renderUsers(){
  const box = document.getElementById('usersBody');
  if(!CLOUD_ON){ box.innerHTML = '<div class="empty">Not connected to the account service.</div>'; return; }
  box.innerHTML = '<div class="empty">Loading…</div>';
  const [{data:users, error:e1}, {data:invites, error:e2}] = await Promise.all([
    sb.from('isd_users').select('*').order('created_at'),
    sb.from('isd_invites').select('*').order('created_at'),
  ]);
  if(e1 || e2){ box.innerHTML = '<div class="warn bad">'+esc((e1||e2).message)+'</div>'; return; }
  let h = '<div class="addrow">' +
    '<div class="f"><label>Email</label><input type="email" id="nuEmail" placeholder="name@example.com"></div>' +
    '<div class="f"><label>Name</label><input type="text" id="nuName" placeholder="optional"></div>' +
    '<div class="f" style="flex:0 0 110px"><label>Role</label><select id="nuRole"><option value="user">User</option><option value="admin">Admin</option></select></div>' +
    '<div class="f" style="flex:0 0 150px"><label>Taluk</label><select id="nuTaluk">' + talukOptions([]) + '</select></div>' +
    '<button class="primary" id="nuAdd">Add user</button></div>';
  h += '<p class="fstate" style="margin:0 0 10px">A person you add here can set their own password on the sign-in page using that email. ' +
       'Nobody else can get in.</p>';
  h += '<table class="utable"><thead><tr><th>Person</th><th>Role</th><th>Taluk</th><th>Status</th><th></th></tr></thead><tbody>';
  (users||[]).forEach(u=>{
    const isMe = ME && u.id === ME.id;
    h += '<tr class="'+(u.active?'':'off')+'" data-id="'+esc(u.id)+'">' +
      '<td class="who"><b>'+esc(u.full_name || u.email)+'</b><small>'+esc(u.email)+'</small></td>' +
      '<td><select data-act="role"'+(isMe?' disabled title="You cannot change your own role"':'')+'>' +
        '<option value="user"'+(u.role==='user'?' selected':'')+'>User</option>' +
        '<option value="admin"'+(u.role==='admin'?' selected':'')+'>Admin</option></select></td>' +
      '<td><select data-act="taluk">'+talukOptions(u.taluks)+'</select></td>' +
      '<td>'+(u.active?'<span style="color:var(--ok)">Active</span>':'<span style="color:var(--muted)">Disabled</span>')+'</td>' +
      '<td style="text-align:right">' +
        (isMe ? '<span class="fstate">that\'s you</span>'
              : '<button class="ghost" data-act="toggle">'+(u.active?'Disable':'Enable')+'</button>') +
      '</td></tr>';
  });
  (invites||[]).forEach(i=>{
    h += '<tr class="off" data-invite="'+esc(i.email)+'">' +
      '<td class="who"><b>'+esc(i.full_name || i.email)+'</b><small>'+esc(i.email)+'</small></td>' +
      '<td><span class="fstate">'+esc(i.role)+'</span></td>' +
      '<td><span class="fstate">'+(i.taluks && i.taluks.length ? esc(i.taluks.join(', ')) : 'All')+'</span></td>' +
      '<td><span style="color:var(--warn)">Invited</span></td>' +
      '<td style="text-align:right"><button class="ghost" data-act="uninvite">Remove</button></td></tr>';
  });
  h += '</tbody></table>';
  if(!(users||[]).length && !(invites||[]).length) h += '<div class="empty">No accounts yet.</div>';
  box.innerHTML = h;
  document.getElementById('nuAdd').addEventListener('click', addUser);
  box.querySelectorAll('[data-act]').forEach(el=>{
    const tr = el.closest('tr');
    const id = tr.dataset.id, inviteEmail = tr.dataset.invite;
    if(el.dataset.act === 'role')  el.addEventListener('change', ()=> patchUser(id, {role: el.value}));
    if(el.dataset.act === 'taluk') el.addEventListener('change', ()=> patchUser(id, {taluks: el.value ? [el.value] : []}));
    if(el.dataset.act === 'toggle')el.addEventListener('click', ()=> patchUser(id, {active: el.textContent === 'Enable'}));
    if(el.dataset.act === 'uninvite') el.addEventListener('click', async ()=>{
      const { error } = await sb.from('isd_invites').delete().eq('email', inviteEmail);
      if(error) toast('Could not remove', error.message, 'err'); else { toast('Invitation removed', inviteEmail, 'ok'); renderUsers(); }
    });
  });
}
async function addUser(){
  const email = document.getElementById('nuEmail').value.trim().toLowerCase();
  if(!email || email.indexOf('@') < 0){ toast('Enter an email', 'A valid email address is needed.', 'warn'); return; }
  const taluk = document.getElementById('nuTaluk').value;
  const { error } = await sb.from('isd_invites').upsert({
    email,
    full_name: document.getElementById('nuName').value.trim() || null,
    role: document.getElementById('nuRole').value,
    taluks: taluk ? [taluk] : [],
    created_by: ME.id,
  }, {onConflict:'email'});
  if(error){ toast('Could not add the user', error.message, 'err'); return; }
  toast('User added', email + ' can now set a password on the sign-in page.', 'ok');
  renderUsers();
}
async function patchUser(id, patch){
  const { error } = await sb.from('isd_users').update(patch).eq('id', id);
  if(error) toast('Could not update', error.message, 'err');
  else { toast('Saved', 'Account updated.', 'ok'); renderUsers(); }
}
async function renderFiles(){
  const box = document.getElementById('usersBody');
  if(!CLOUD_ON){ box.innerHTML = '<div class="empty">Not connected.</div>'; return; }
  box.innerHTML = '<div class="empty">Loading…</div>';
  const { data, error } = await sb.from('isd_datasets').select('*').order('kind');
  if(error){ box.innerHTML = '<div class="warn bad">'+esc(error.message)+'</div>'; return; }
  const byId = {};
  (await sb.from('isd_users').select('id,email,full_name')).data?.forEach(u=> byId[u.id] = u.full_name || u.email);
  const kinds = ['village','vaoDetails','isdRuralPdf'].concat(OPT_KEYS, ['isdNatham','flineRural','flineNatham']);
  let h = '<p class="fstate" style="margin:0 0 12px">Every upload is kept here. Uploading the same file again replaces it — ' +
          'the dashboard always shows the latest.</p>';
  h += '<table class="utable"><thead><tr><th>File</th><th>Taluk</th><th>Uploaded</th><th>By</th><th></th></tr></thead><tbody>';
  kinds.forEach(k=>{
    const rows = (data||[]).filter(r => r.kind === k);
    if(!rows.length){
      h += '<tr class="off"><td class="who"><b>'+esc(FILE_NAMES[k] || k)+'</b><small>not uploaded yet</small></td>' +
           '<td>—</td><td>—</td><td>—</td><td></td></tr>';
      return;
    }
    rows.forEach(r=>{
      h += '<tr data-kind="'+esc(r.kind)+'" data-taluk="'+esc(r.taluk)+'">' +
        '<td class="who"><b>'+esc(FILE_NAMES[k] || k)+'</b><small>'+esc(r.file_name||'')+' · '+(r.row_count||0)+' rows</small></td>' +
        '<td>'+(r.taluk ? esc(r.taluk) : '<span class="fstate">all</span>')+'</td>' +
        '<td class="fstate">'+new Date(r.uploaded_at).toLocaleString('en-GB')+'</td>' +
        '<td class="fstate">'+esc(byId[r.uploaded_by] || '—')+'</td>' +
        '<td style="text-align:right"><button class="ghost" data-act="del">Delete</button></td></tr>';
    });
  });
  h += '</tbody></table>';
  box.innerHTML = h;
  box.querySelectorAll('[data-act="del"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tr = btn.closest('tr');
      const { error } = await sb.from('isd_datasets').delete()
        .eq('kind', tr.dataset.kind).eq('taluk', tr.dataset.taluk);
      if(error) toast('Could not delete', error.message, 'err');
      else { toast('Deleted', 'The stored file was removed.', 'ok'); renderFiles(); }
    });
  });
}
async function loadFile(cat, file){
  if(!file) return;
  const badge = document.querySelector('[data-badge="'+cat+'"]');
  const drop  = document.querySelector('[data-drop="'+cat+'"]');
  badge.className = 'badge'; badge.textContent = 'reading…';
  drop.classList.remove('done','bad');
  try{
    const buf = await file.arrayBuffer();
    let summary = '';
    if(cat === 'isdRuralPdf'){
      const parsed = await readStatusPdf(buf);
      parsed.name = file.name;
      store[cat] = parsed;
      const inv = parsed.grand && parsed.grand.inv;
      summary = parsed.villages.size + ' villages';
      badge.textContent = '✓ ' + parsed.villages.size + ' villages';
      if(inv) summary += ' · Involving Sub-Division: ' + inv.approved + ' approved, ' + inv.rejected + ' rejected';
    }else if(OPT_KEYS.indexOf(cat) >= 0){
      const parsed = parseOptPending(readRawRows(buf));
      parsed.name = file.name;
      store[cat] = parsed;
      const sv = parsed.rows.reduce((t,r)=>t+r.surv,0), va = parsed.rows.reduce((t,r)=>t+r.vao,0);
      summary = parsed.rows.length + ' villages · surveyor ' + sv + ' · VAO ' + va;
      badge.textContent = '✓ ' + (sv+va) + ' pending';
    }else{
      const must = cat==='village' ? MUST.village : (cat==='vaoDetails' ? MUST.vao : MUST.detail);
      const parsed = readWorkbook(buf, must);
      parsed.name = file.name;
      store[cat] = parsed;
      badge.textContent = '✓ ' + parsed.objs.length + ' rows';
      const isDetail = ['isdNatham','flineRural','flineNatham'].indexOf(cat) >= 0;
      const sc = isDetail ? statusKeyOf(parsed.header) : null;
      summary = parsed.objs.length + ' rows' + (isDetail ? (sc ? ' · status column: "'+sc+'"' : ' · no status column found') : '');
    }
    badge.className = 'badge ok';
    drop.classList.add('done');
    drop.querySelector('.lab small').textContent = file.name;
    toast(FILE_NAMES[cat] + ' loaded', summary, 'ok');
    saveToCloud(cat, file, store[cat]);
  }catch(err){
    store[cat] = null;
    badge.className = 'badge err';
    badge.textContent = 'error';
    drop.classList.add('bad');
    toast('Could not read ' + FILE_NAMES[cat], err.message || 'Unsupported or corrupt file', 'err');
    console.error(err);
  }
  document.getElementById('exportBtn').disabled = true;
  refreshTalukSel();
  refreshTitles();
  updateRail();
  maybeAutoRender();
}
document.querySelectorAll('input[type=file]').forEach(inp=>{
  inp.addEventListener('change', e=> loadFile(inp.dataset.cat, e.target.files[0]));
});
function wireDrop(d){
  ['dragenter','dragover'].forEach(ev=> d.addEventListener(ev, e=>{ e.preventDefault(); d.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev=> d.addEventListener(ev, e=>{ e.preventDefault(); d.classList.remove('dragover'); }));
  d.addEventListener('drop', e=>{
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) loadFile(d.dataset.drop, f);
  });
}
document.querySelectorAll('.drop').forEach(wireDrop);
['dragover','drop'].forEach(ev=> window.addEventListener(ev, e=>{ if(!e.target.closest('.drop')) e.preventDefault(); }));
function reRender(){ if(loadedCount()) render(); }
document.getElementById('statusMode').addEventListener('change', e=>{
  OPT.status = e.target.value;
  const msg = {pending:'Counting only rows whose Application Status starts with "Pending".', openish:'Counting every status that is not closed/approved/rejected.', all:'Counting all rows — no status filter.'}[OPT.status];
  toast('Status filter changed', msg, OPT.status==='pending'?'ok':'warn');
  reRender();
});
document.getElementById('userMode').addEventListener('change', e=>{
  OPT.userSource = e.target.value;
  const msg = {village:'Users come from the Village Details mapping.', col:'Users come from the "Pending At" / user column in each file.', colthen:'Users come from the file column, falling back to Village Details.'}[OPT.userSource];
  toast('User name source changed', msg);
  reRender();
});
document.getElementById('fuzzyChk').addEventListener('change', e=>{
  OPT.fuzzy = e.target.checked;
  toast('Fuzzy village matching ' + (OPT.fuzzy?'on':'off'), OPT.fuzzy ? 'Small spelling differences are tolerated.' : 'Village names must match exactly.');
  reRender();
});
document.getElementById('refreshBtn').addEventListener('click', ()=>{
  if(!loadedCount()){ toast('Nothing to calculate', 'Upload at least one file first.', 'warn'); return; }
  render();
  toast('Recalculated', 'Pending applications refreshed.', 'ok');
});
document.getElementById('clearBtn').addEventListener('click', ()=>{
  Object.keys(store).forEach(k=>store[k]=null);
  document.querySelectorAll('input[type=file]').forEach(i=>i.value='');
  document.querySelectorAll('.badge').forEach(b=>{b.className='badge'; b.textContent='not loaded';});
  document.querySelectorAll('.drop').forEach(d=>d.classList.remove('done','bad'));
  A = null; R = null; searchTerm=''; activeBucket=null; activeCat=null; sortCol=null;
  openUsers.clear(); openIsd.clear(); isdLastMatrix = null;
  document.getElementById('isdExpandBtn').innerHTML = '&#8942; Expand all';
  renderIsdReport();
  document.getElementById('searchInput').value='';
  document.getElementById('searchBox').classList.remove('has');
  document.getElementById('warnings').innerHTML='';
  document.getElementById('meta').textContent='';
  document.getElementById('printSubhead').textContent='';
  document.getElementById('printIsd').innerHTML='';
  document.getElementById('printFline').innerHTML='';
  document.getElementById('printFlineN').innerHTML='';
  document.getElementById('tablewrap').innerHTML='<div class="empty"><span class="big">&#128202;</span>No summary yet — upload your files to begin.</div>';
  document.getElementById('tableActions').style.display='none';
  document.getElementById('statsCard').style.display='none';
  document.getElementById('chartCard').style.display='none';
  document.getElementById('controls').style.display='none';
  document.getElementById('pendingPill').style.display='none';
  document.getElementById('exportBtn').disabled = true;
  updateRail();
  toast('Cleared', 'All uploaded files removed.');
});
document.addEventListener('click', (e)=>{
  const catTh = e.target.closest('th.catcol');
  if(catTh){
    const k = catTh.dataset.cat;
    activeCat = (activeCat===k) ? null : k;
    updateChips(); buildInteractiveTable();
    return;
  }
  const sortTh = e.target.closest('th.sortable');
  if(sortTh){
    const key = sortTh.dataset.sort;
    if(sortCol===key) sortDir = -sortDir; else { sortCol = key; sortDir = -1; }
    buildInteractiveTable();
    return;
  }
  const row = e.target.closest('tr.userrow');
  if(row){
    const u = row.dataset.user;
    if(openUsers.has(u)) openUsers.delete(u); else openUsers.add(u);
    buildInteractiveTable();
    return;
  }
});
document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value;
  document.getElementById('searchBox').classList.toggle('has', !!searchTerm);
  updateChips();
  buildInteractiveTable();
});
document.getElementById('searchClear').addEventListener('click', ()=>{
  searchTerm=''; document.getElementById('searchInput').value='';
  document.getElementById('searchBox').classList.remove('has');
  updateChips(); buildInteractiveTable();
});
document.getElementById('expandAllBtn').addEventListener('click', ()=>{
  if(!A) return;
  if(openUsers.size) openUsers.clear(); else A.users.forEach(u=>openUsers.add(u));
  document.getElementById('expandAllBtn').innerHTML = openUsers.size ? '&#8942; Collapse all users' : '&#8942; Expand all users';
  buildInteractiveTable();
});
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    if(activeBucket || activeCat || searchTerm){
      activeBucket=null; activeCat=null; searchTerm='';
      document.getElementById('searchInput').value='';
      document.getElementById('searchBox').classList.remove('has');
      updateChips(); buildInteractiveTable();
    }
  }
  if(e.key === '/' && document.activeElement !== document.getElementById('searchInput')){
    const inp = document.getElementById('searchInput');
    if(inp.offsetParent){ e.preventDefault(); inp.focus(); }
  }
});
document.getElementById('printBtn').addEventListener('click', ()=> window.print());
const PAGE_W = 1040;
const PDF_M  = 7;                                             
const PDF_BOX_W = 297 - 2*PDF_M, PDF_BOX_H = 210 - 2*PDF_M;   
const PAGE_H = Math.round(PAGE_W * PDF_BOX_H / PDF_BOX_W);    
const PDF_CSS = {
  table: 'border-collapse:separate; border-spacing:0; font-size:15px; width:100%; table-layout:auto',
  cell:  'color:#111827; border:1px solid #9aa0aa; padding:7px 6px; text-align:center; white-space:nowrap',
};
function plainColor(v, fallback){
  const c = String(v || '').trim();
  if(!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return fallback;
  if(/^(rgb|rgba|#)/i.test(c)) return c;
  return fallback;                       
}
function pdfPage(){
  const p = document.createElement('div');
  p.className = 'pdf-page';
  p.style.cssText = 'background:#fff; color:#111827; padding:26px 30px; box-sizing:border-box; ' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; ' +
    'width:' + PAGE_W + 'px; min-height:' + PAGE_H + 'px; display:flex; flex-direction:column; overflow:hidden';
  return p;
}
function pdfHeader(page, title, subtitle, withLogo){
  const h = document.createElement('div');
  h.style.cssText = 'text-align:center; margin-bottom:16px';
  h.innerHTML = (withLogo ? '<img style="width:52px; height:52px; display:block; margin:0 auto 7px" src="' + TN_LOGO_DATA + '" alt="TN Govt Emblem"/>' : '') +
    '<h2 style="font-size:25px; font-weight:700; margin:0 0 3px">' + esc(title) + '</h2>' +
    (subtitle ? '<p style="font-size:13px; margin:0; color:#555">' + esc(subtitle) + '</p>' : '');
  page.appendChild(h);
}
function pdfTable(page, title, tableEl, opts){
  if(!tableEl) return false;
  const o = opts || {};
  if(title){
    const h = document.createElement('h3');
    h.style.cssText = 'font-size:17px; font-weight:700; margin:' + (o.gap ? '20px 0 8px' : '0 0 8px');
    h.textContent = title;
    page.appendChild(h);
  }
  const clone = tableEl.cloneNode(true);
  clone.querySelectorAll('tr.sub').forEach(r => r.remove());
  const src = Array.prototype.filter.call(tableEl.querySelectorAll('td,th'), c => !c.closest('tr.sub'));
  const dst = clone.querySelectorAll('td,th');
  const fs  = o.fontSize || 15;
  for(let i=0; i<dst.length; i++){
    const d = dst[i], sEl = src[i];
    let bg = '#ffffff', fg = '#111827', fw = '400', ta = 'center';
    if(sEl){
      const cs = getComputedStyle(sEl);
      bg = plainColor(cs.backgroundColor, '#ffffff');
      fg = plainColor(cs.color, '#111827');
      fw = cs.fontWeight || '400';
      ta = cs.textAlign === 'start' ? 'left' : (cs.textAlign || 'center');
    }
    const leftish = d.classList.contains('user') || d.classList.contains('corner') ||
                    d.classList.contains('nm') || d.classList.contains('sn');
    d.removeAttribute('class');
    d.removeAttribute('title');
    d.style.cssText = 'border:1px solid #9aa0aa; padding:7px 6px; position:static; ' +
      'white-space:nowrap; font-size:' + fs + 'px; font-weight:' + fw + '; ' +
      'color:' + fg + '; background:' + bg + '; text-align:' + (leftish ? 'left' : ta);
  }
  clone.querySelectorAll('tr').forEach(r=>{ r.removeAttribute('class'); r.removeAttribute('style'); r.removeAttribute('data-user'); r.removeAttribute('data-k'); });
  clone.querySelectorAll('.chev').forEach(c=> c.remove());
  clone.removeAttribute('class');
  clone.style.cssText = 'border-collapse:separate; border-spacing:0; width:100%; table-layout:auto; ' +
    'background:#ffffff; color:#111827; font-size:' + fs + 'px';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1 1 auto; display:flex; flex-direction:column; min-height:0';
  wrap.appendChild(clone);
  page.appendChild(wrap);
  return true;
}
function buildExportPages(){
  const pages = [];
  const isdTable = document.querySelector('#isdRep table.rep-t');
  if(isdTable){
    const p = pdfPage();
    pdfHeader(p, talukTitle('Taluk ISD Pending Details'), document.getElementById('isdPrintSub').textContent, true);
    pdfTable(p, 'ISD (Rural)', isdTable, {fontSize:15});
    pages.push(p);
  }
  const vaoTable = document.querySelector('#isdPrintVao table');
  if(vaoTable){
    const p = pdfPage();
    pdfHeader(p, talukTitle('· ISD (Rural) — VAO Details, village wise').replace(' ·',' ·'), document.getElementById('isdPrintSub').textContent, false);
    pdfTable(p, null, vaoTable, {fontSize:13});
    pages.push(p);
  }
  ['#printIsd table', '#printFline table', '#printFlineN table'].forEach(sel=>{
    const t = document.querySelector(sel);
    if(!t) return;
    const p = pdfPage();
    pdfTable(p, null, t, {fontSize:17});
    pages.push(p);
  });
  return pages;
}
function fitWidth(table, cells, avail){
  if(!avail || !table.scrollWidth) return;
  if(table.scrollWidth > avail){
    table.querySelectorAll('th').forEach(t => t.style.whiteSpace = 'normal');
  }
  let guard = 0;
  while(table.scrollWidth > avail && guard++ < 40){
    const fs = parseFloat(table.style.fontSize) || 15;
    const pad = parseFloat(cells[0] && cells[0].style.paddingLeft) || 6;
    if(pad > 2){
      cells.forEach(c=>{ c.style.paddingLeft = (pad-1)+'px'; c.style.paddingRight = (pad-1)+'px'; });
    }else if(fs > 7){
      const nf = fs - 0.5;
      table.style.fontSize = nf + 'px';
      cells.forEach(c => c.style.fontSize = nf + 'px');
    }else break;
  }
}
function fillPage(page){
  const table = page.querySelector('table');
  if(!table) return;
  const target = PAGE_H;
  const cells = table.querySelectorAll('td,th');
  const avail = page.clientWidth - 60;          
  fitWidth(table, cells, avail);
  const keepMin = page.style.minHeight;
  page.style.minHeight = '0';
  let h = page.scrollHeight;
  page.style.minHeight = keepMin;
  if(!h) return;                                
  const base = parseFloat(table.style.fontSize) || 14;
  const ratio = Math.min(target / h, 1.5);
  if(ratio > 1.02){
    for(let f = Math.round(base * ratio); f > base; f--){
      table.style.fontSize = f + 'px';
      cells.forEach(c => c.style.fontSize = f + 'px');
      if(table.scrollWidth <= avail) break;
      if(f - 1 <= base){ table.style.fontSize = base + 'px'; cells.forEach(c => c.style.fontSize = base + 'px'); break; }
    }
    page.style.minHeight = '0'; h = page.scrollHeight; page.style.minHeight = keepMin;
  }
  const rows = table.querySelectorAll('tr').length || 1;
  const gap = target - h;
  if(gap > 4 && rows > 1){
    const extra = gap / rows / 2;
    cells.forEach(c=>{
      const pv = parseFloat(getComputedStyle(c).paddingTop) || 7;
      c.style.paddingTop = (pv + extra).toFixed(2) + 'px';
      c.style.paddingBottom = (pv + extra).toFixed(2) + 'px';
    });
  }
  fitWidth(table, cells, avail);
  page.style.height = target + 'px';
}
async function renderPages(){
  const pages = buildExportPages();
  if(!pages.length) return [];
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute; left:-10000px; top:0; background:#ffffff; color:#111827';
  pages.forEach(p => host.appendChild(p));
  document.body.appendChild(host);
  const guard = document.createElement('style');
  guard.textContent = 'html,body{background:#ffffff!important;background-image:none!important;color:#111827!important}';
  document.head.appendChild(guard);
  try{
    const out = [];
    for(const p of pages){
      fillPage(p);
      out.push(await html2canvas(p, {backgroundColor:'#ffffff', scale:2, logging:false, useCORS:true}));
    }
    return out;
  }finally{
    document.body.removeChild(host);
    guard.remove();
  }
}
function anythingToExport(){
  return !!(document.querySelector('#isdRep table.rep-t') || document.querySelector('#printIsd table'));
}
document.getElementById('imageBtn').addEventListener('click', async ()=>{
  if(!anythingToExport()){ toast('Nothing to export', 'Load your files first.', 'warn'); return; }
  try{
    const canvases = await renderPages();
    const w = Math.max(...canvases.map(c=>c.width));
    const h = canvases.reduce((s,c)=>s+c.height, 0) + 24*(canvases.length-1);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
    let y = 0;
    canvases.forEach(c=>{ ctx.drawImage(c, 0, y); y += c.height + 24; });
    const link = document.createElement('a');
    link.download = talukSlug() + '_pending_applications.png';
    link.href = out.toDataURL('image/png');
    link.click();
    toast('Image exported', canvases.length + ' page(s) stacked into one PNG', 'ok');
  }catch(err){
    console.error(err);
    toast('Image export failed', /color/i.test(err.message||'') ? 'A colour in the page could not be rendered — try the Print button instead.' : err.message, 'err');
  }
});
document.getElementById('pdfBtn').addEventListener('click', async ()=>{
  if(!anythingToExport()){ toast('Nothing to export', 'Load your files first.', 'warn'); return; }
  try{
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');
    const M = PDF_M;
    const boxW = PDF_BOX_W, boxH = PDF_BOX_H;
    const canvases = await renderPages();
    let first = true;
    canvases.forEach(canvas=>{
      const scale = boxW / canvas.width;                 
      const fullH = canvas.height * scale;
      if(fullH <= boxH + 0.5){
        if(!first) pdf.addPage();
        first = false;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', M, M + (boxH - fullH)/2, boxW, fullH);
        return;
      }
      if(fullH <= boxH * 1.35){
        const sc = boxH / canvas.height;
        const w = canvas.width * sc;
        if(!first) pdf.addPage();
        first = false;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', M + (boxW - w)/2, M, w, boxH);
        return;
      }
      const sliceH = Math.floor(boxH / scale);
      let sy = 0;
      while(sy < canvas.height){
        const sh = Math.min(sliceH, canvas.height - sy);
        const part = document.createElement('canvas');
        part.width = canvas.width; part.height = sh;
        const c = part.getContext('2d');
        c.fillStyle = '#ffffff'; c.fillRect(0,0,part.width,sh);
        c.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
        if(!first) pdf.addPage();
        first = false;
        pdf.addImage(part.toDataURL('image/png'), 'PNG', M, M, boxW, sh * scale);
        sy += sh;
      }
    });
    pdf.save(talukSlug() + '_pending_applications.pdf');
    toast('PDF exported', pdf.getNumberOfPages() + ' landscape page(s)', 'ok');
  }catch(err){
    console.error(err);
    toast('PDF export failed', /color/i.test(err.message||'') ? 'A colour in the page could not be rendered — try the Print button instead.' : err.message, 'err');
  }
});
document.getElementById('exportBtn').addEventListener('click', async ()=>{
  if(!lastMatrix || !A){ toast('Nothing to export', 'Load your files first.', 'warn'); return; }
  try{
    if(window.ExcelJS){
      await exportCombinedStyled();
      toast('Excel exported', (talukSlug() + '_pending_applications_summary.xlsx — colours included'), 'ok');
    }else{
      exportPlain(lastMatrix, 'Pending Summary', (talukSlug() + '_pending_applications_summary.xlsx'));
      toast('Excel exported (plain)', 'Styling library unavailable — values only.', 'warn');
    }
  }catch(err){ toast('Excel export failed', err.message, 'err'); }
});
const TEMPLATES = {
  village: { sheet:'Village Details', file:'template_village_details.xlsx', rows:[
    ['S.No','Taluk','Village','Name'],
    [1,'Nemili','Agavalam','Arul'],
    [2,'Nemili','Alappakkam','Palanivel'],
    [3,'Nemili','Kalathur','Muralitharan'],
    [4,'Arakkonam','Ammanur','Venkatesan'],
    [5,'Arakkonam','Aarikilapadi','Appu'],
    [6,'Arcot','Kaveripakkam','Jayapal'],
    [7,'Kalavai','Melari','Abinash LS'],
    [8,'Sholinghur','Nagavedu','Hari Prasad'],
    [9,'Walajah','Visharam','Arul'],
  ]},
  vaoDetails: { sheet:'VAO Details', file:'template_vao_details.xlsx', rows:[
    ['S.No','Taluk','Village','Name'],
    [1,'Nemili','Agavalam','Jayakanthan'],
    [2,'Nemili','Alappakkam','Sathya'],
    [3,'Nemili','Kalathur','Babu'],
    [4,'Arakkonam','Ammanur','Thirugnanam'],
    [5,'Arakkonam','Aarikilapadi','Ranjithkumar'],
    [6,'Arcot','Kaveripakkam','Velmurugan'],
    [7,'Kalavai','Melari','Naveen'],
    [8,'Sholinghur','Nagavedu','Ramya'],
    [9,'Walajah','Visharam','Balaji'],
  ]},
  flineRural: { sheet:'F Line Rural', file:'template_fline_rural.xlsx', rows:[
    ['District Name','Taluk Name','Village Name','Application Id','SurveyNo-SubdivNo','Application Date','Number of days pending','Application Status'],
    ['Madurai','Melur','Alangudi','FR1001','123/2A','05-06-2026',12,'Pending'],
    ['Madurai','Melur','Melur','FR1002','45/1B','10-04-2026',80,'Pending'],
    ['Madurai','Melur','Melur','FR1003','45/2B','12-04-2026',78,'Approved'],
  ]},
  flineNatham: { sheet:'F Line Natham', file:'template_fline_natham.xlsx', rows:[
    ['District Name','Taluk Name','Village Name','Application Id','SurveyNo-SubdivNo','Application Date','Number of days pending','Application Status'],
    ['Madurai','Melur','Kottampatti','FN2001','88/3','02-07-2026',22,'Pending'],
    ['Madurai','Melur','Kottampatti','FN2002','88/4','04-07-2026',20,'Rejected'],
  ]},
  isdNatham: { sheet:'ISD Natham', file:'template_isd_natham.xlsx', rows:[
    ['S.No','District Name','Taluk Name','Village Name','Application ID','Application Date','RTR-STR','Update Date','Pending At','Application Status'],
    [1,'Madurai','Melur','Kottampatti','ISD6001','20-07-2026','RTR','22-07-2026','M. Anand','Pending'],
  ]},
};
function tmplSheet(rows){
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map(h=>({wch:Math.max(12, String(h).length+2)}));
  return ws;
}
function downloadTemplate(cat){
  const t = TEMPLATES[cat]; if(!t) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, tmplSheet(t.rows), t.sheet.slice(0,31));
  XLSX.writeFile(wb, t.file);
  toast('Template downloaded', t.file, 'ok');
}
function downloadAllTemplates(){
  const wb = XLSX.utils.book_new();
  ['village','vaoDetails','isdNatham','flineRural','flineNatham'].forEach(cat=>{
    const t = TEMPLATES[cat];
    XLSX.utils.book_append_sheet(wb, tmplSheet(t.rows), t.sheet.slice(0,31));
  });
  XLSX.writeFile(wb, 'village_summary_templates.xlsx');
  toast('Templates downloaded', 'All five sheets in one workbook.', 'ok');
}
document.querySelectorAll('[data-tmpl]').forEach(b=> b.addEventListener('click', e=>{ e.stopPropagation(); downloadTemplate(b.dataset.tmpl); }));
document.getElementById('tmplAllBtn').addEventListener('click', downloadAllTemplates);
renderOptDrops();
refreshTalukSel();
refreshTitles();
updateRail();
document.getElementById('talukSel').addEventListener('change', e=>{
  TALUK = e.target.value;
  refreshTitles();
  toast('Taluk changed', TALUK ? 'Showing ' + TALUK + ' only.' : 'Showing every taluk in the files.');
  if(loadedCount()) render();
});
document.getElementById('adminBtn').addEventListener('click', openAdmin);
document.getElementById('adminClose').addEventListener('click', closeAdmin);
document.getElementById('adminBack').addEventListener('click', closeAdmin);
document.getElementById('adminSave').addEventListener('click', ()=>{
  if(applyAdmin()){ closeAdmin(); toast('Day ranges saved', 'Columns and upload slots updated.', 'ok'); }
});
document.getElementById('adminReset').addEventListener('click', ()=>{
  CFG = cloneCfg(CFG_DEFAULT); saveCfg(); rebuildBuckets();
  OPT_SLOTS = optSlots(); OPT_KEYS = OPT_SLOTS.map(s=>s.key); refreshFileNames();
  OPT_KEYS.forEach(k=>{ if(!(k in store)) store[k] = null; });
  renderAdmin(); renderOptDrops(); updateRail();
  if(loadedCount()) render();
  toast('Reset', 'Day ranges are back to the defaults.', 'ok');
});
document.addEventListener('keydown', e=>{ if(e.key === 'Escape'){ closeAdmin(); closeUsersPanel(); } });
let GATE_MODE = 'in';                 
document.getElementById('gateToggle').addEventListener('click', ()=>{
  GATE_MODE = GATE_MODE === 'in' ? 'up' : 'in';
  const up = GATE_MODE === 'up';
  document.getElementById('gateTitle').textContent = up ? 'Set your password' : 'Sign in';
  document.getElementById('gateSub').textContent = up
    ? 'Use the email your administrator registered, and choose a password.'
    : 'Use the email address your administrator registered.';
  document.getElementById('gateBtn').textContent = up ? 'Create my password' : 'Sign in';
  document.getElementById('gateAltTxt').textContent = up ? 'Already have a password?' : 'First time here?';
  document.getElementById('gateToggle').textContent = up ? 'Sign in' : 'Set a password';
  document.getElementById('gatePass').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
  document.getElementById('gateMsg').className = 'msg';
});
document.getElementById('gateForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!sb) return;
  const email = document.getElementById('gateEmail').value.trim();
  const pass  = document.getElementById('gatePass').value;
  const btn   = document.getElementById('gateBtn');
  btn.disabled = true; btn.textContent = 'Please wait…';
  try{
    if(GATE_MODE === 'up'){
      const { data, error } = await sb.auth.signUp({email, password: pass});
      if(error) throw error;
      if(data.session) await onSignedIn(data.session);
      else gateMsg('ok', 'Account created. Check your email to confirm it, then sign in.');
    }else{
      const { data, error } = await sb.auth.signInWithPassword({email, password: pass});
      if(error) throw error;
      await onSignedIn(data.session);
    }
  }catch(err){
    gateMsg('err', esc(err.message || String(err)));
  }finally{
    btn.disabled = false;
    btn.textContent = GATE_MODE === 'up' ? 'Create my password' : 'Sign in';
  }
});
document.getElementById('gateForgot').addEventListener('click', async ()=>{
  const email = document.getElementById('gateEmail').value.trim();
  if(!email){ gateMsg('info', 'Type your email above first.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.href});
  gateMsg(error ? 'err' : 'ok', error ? esc(error.message) : 'Password reset link sent to ' + esc(email) + '.');
});
document.getElementById('signOutBtn').addEventListener('click', async ()=>{
  if(sb) await sb.auth.signOut();
  location.reload();
});
document.getElementById('usersBtn').addEventListener('click', openUsersPanel);
document.getElementById('usersClose').addEventListener('click', closeUsersPanel);
document.getElementById('usersBack').addEventListener('click', closeUsersPanel);
document.getElementById('usersTabs').addEventListener('click', e=>{
  const b = e.target.closest('button[data-tab]');
  if(b){ ADMIN_TAB = b.dataset.tab; renderAdminTabs(); }
});
document.getElementById('talukSel').addEventListener('change', ()=>{ if(CLOUD_ON && ME) restoreFromCloud(); });
initCloud();