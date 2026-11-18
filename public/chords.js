/* Chord parsing, transposition and import. Shared by the browser page and server.js. */
(function(root){
"use strict";
/* ---------------- music theory ---------------- */
const SHARP=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT =["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const LSHARP=["Do","Do#","Re","Re#","Mi","Fa","Fa#","Sol","Sol#","La","La#","Si"];
const LFLAT =["Do","Reb","Re","Mib","Mi","Fa","Solb","Sol","Lab","La","Sib","Si"];
const BASE={C:0,D:2,E:4,F:5,G:7,A:9,B:11,DO:0,RE:2,MI:4,FA:5,SOL:7,LA:9,SI:11};
const SUF="((?:maj|min|dim|aug|sus|add|alt|no|M|m|°|ø|\\+|-|\\d+|[#b]\\d+|\\(|\\)|,)*)";
const RX_ABC=new RegExp("^([A-G])([#b]?)"+SUF+"(?:\\/([A-G])([#b]?))?$");
const RX_LAT=new RegExp("^(Do|Re|Mi|Fa|Sol|La|Si|DO|RE|MI|FA|SOL|LA|SI)([#b]?)"+SUF+"(?:\\/(Do|Re|Mi|Fa|Sol|La|Si|DO|RE|MI|FA|SOL|LA|SI)([#b]?))?$");
const NEUTRAL=/^(\||\|\||\|:|:\||\/|-+|x\d+|\(x\d+\)|\*+|N\.?C\.?|\.{2,}|%|>|→)$/i;
function noteIdx(n,acc){let i=BASE[n.toUpperCase()];if(acc==="#")i++;else if(acc==="b")i--;return (i+12)%12}
function parseChord(tok){
  let m=tok.match(RX_ABC),latin=false;
  if(!m){m=tok.match(RX_LAT);latin=!!m}
  if(!m)return null;
  return {root:noteIdx(m[1],m[2]),flat:m[2]==="b",suf:m[3]||"",bass:m[4]?noteIdx(m[4],m[5]):null,latin};
}
function splitTok(t){const m=t.match(/^([(\[]*)(.*?)([)\]\.,]*)$/);return m?[m[1],m[2],m[3]]:["",t,""]}
function isChordTok(t){const [,c]=splitTok(t);return c!==""&&!!parseChord(c)}
function isLabel(line){return /^\s*\[[^\]]{1,40}\]\s*$/.test(line)}
function isChordLine(line){
  if(isLabel(line))return false;
  const toks=line.trim().split(/\s+/).filter(Boolean);
  if(!toks.length)return false;
  let ch=0,other=0;
  for(const t of toks){ if(isChordTok(t))ch++; else if(!NEUTRAL.test(t))other++; }
  return ch>0&&ch/(ch+other)>0.5;
}
function isSection(line){
  const t=line.trim();
  return isLabel(t) ||
    /^(intro|verse|verso|estrofa|chorus|coro|estribillo|bridge|puente|pre-?chorus|pre-?coro|outro|final|solo|interlude|interludio|instrumental|riff|tag|refrain|refrão|ponte)\b[^a-z]{0,12}:?$/i.test(t) ||
    /^(intro|verse|verso|estrofa|chorus|coro|estribillo|bridge|puente|outro|solo)\s*\d*\s*:/i.test(t)&&t.length<24;
}
const FLAT_KEYS_MAJ=new Set([5,10,3,8,1,6]); // F Bb Eb Ab Db Gb
const FLAT_KEYS_MIN=new Set([2,7,0,5,10,3]); // Dm Gm Cm Fm Bbm Ebm
function keyInfo(str){const c=str&&parseChord(str.trim());if(!c)return null;return {root:c.root,minor:/^m(?!aj)/.test(c.suf)||/^min/.test(c.suf),latin:c.latin,flat:c.flat}}
function detectKey(body){
  for(const l of (body||"").split("\n")){ if(isChordLine(l)){ for(const t of l.trim().split(/\s+/)){const [,c]=splitTok(t);const p=parseChord(c);if(p){return nameNote(p.root,p.flat,p.latin)+(/^m(?!aj)/.test(p.suf)?"m":"")}} } }
  return "";
}
function nameNote(i,flat,latin){return (latin?(flat?LFLAT:LSHARP):(flat?FLAT:SHARP))[(i%12+12)%12]}
/* opts: {semi, preferFlat (bool|null), notation:'auto'|'abc'|'latin'} */
function renderChord(p,o){
  const latin=o.notation==="latin"?true:o.notation==="abc"?false:p.latin;
  const flat=o.preferFlat==null?p.flat:o.preferFlat;
  let s=nameNote(p.root+o.semi,flat,latin)+p.suf;
  if(p.bass!=null)s+="/"+nameNote(p.bass+o.semi,flat,latin);
  return s;
}
function transposeTok(t,o){const [a,c,b]=splitTok(t);const p=parseChord(c);return p?a+renderChord(p,o)+b:t}
/* returns array of {text, chord:boolean} pieces keeping columns */
function transposeChordLine(line,o){
  const re=/\S+/g;let m,out="",pieces=[];
  while((m=re.exec(line))){
    const nt=(o.semi===0&&o.notation==="auto")?m[0]:transposeTok(m[0],o);
    let pos=Math.max(m.index,out.length+(out.length?1:0));
    const pad=" ".repeat(pos-out.length);
    pieces.push({text:pad,chord:false});pieces.push({text:nt,chord:isChordTok(m[0])});
    out+=pad+nt;
  }
  return pieces;
}
function transposeBody(body,o){
  return body.split("\n").map(l=>isChordLine(l)?transposeChordLine(l,o).map(p=>p.text).join(""):l).join("\n");
}
function sheetOpts(song,semi,notation){
  const k=keyInfo(song.key)||keyInfo(detectKey(song.body));
  let preferFlat=null;
  if(k&&(semi!==0||notation!=="auto")){const r=(k.root+semi+12)%12;preferFlat=k.minor?FLAT_KEYS_MIN.has(r):FLAT_KEYS_MAJ.has(r)}
  return {semi,preferFlat,notation};
}
function keyLabel(song,semi,notation){
  const k=keyInfo(song.key)||keyInfo(detectKey(song.body));
  if(!k)return "";
  const o=sheetOpts(song,semi,notation);
  return renderChord({root:k.root,flat:k.flat,suf:k.minor?"m":"",bass:null,latin:k.latin},o);
}

/* ---------------- import: ChordPro / Ultimate Guitar / plain ---------------- */
function importText(raw){
  let title="",artist="",key="";
  let t=(raw||"").replace(/\r\n?/g,"\n").replace(/ /g," ").replace(/\t/g,"    ");
  t=t.replace(/\[\/?tab\]/gi,"").replace(/\[ch\](.*?)\[\/ch\]/gi,"$1");
  const out=[];
  for(let line of t.split("\n")){
    const d=line.trim().match(/^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i);
    if(d){
      const k=d[1].toLowerCase(),v=d[2]||"";
      if(k==="title"||k==="t")title=v;
      else if(k==="artist"||k==="subtitle"||k==="st")artist=artist||v;
      else if(k==="key")key=v;
      else if(/^(c|comment|ci|comment_italic|cb)$/.test(k))out.push(v);
      else if(/^(soc|start_of_chorus)$/.test(k))out.push("[Chorus]");
      else if(/^(sov|start_of_verse)$/.test(k))out.push("[Verse]");
      else if(/^(sob|start_of_bridge)$/.test(k))out.push("[Bridge]");
      else if(/^(eoc|end_of_chorus|eov|end_of_verse|eob|end_of_bridge)$/.test(k))out.push("");
      continue;
    }
    // inline ChordPro: [G]words
    const inl=[...line.matchAll(/\[([^\]\s]{1,14})\]/g)];
    if(inl.length&&!isLabel(line)&&inl.every(m=>parseChord(m[1]))){
      let ch="",ly="",i=0;
      const re=/\[([^\]\s]{1,14})\]/g;let m;
      while((m=re.exec(line))){
        ly+=line.slice(i,m.index);i=re.lastIndex;
        let pos=ly.length;
        if(ch.length&&pos<ch.length+1){pos=ch.length+1;ly=ly.padEnd(pos," ")}
        ch=ch.padEnd(pos," ")+m[1];
      }
      ly+=line.slice(i);
      out.push(ch.replace(/\s+$/,""));
      if(ly.trim())out.push(ly.replace(/\s+$/,""));
      continue;
    }
    out.push(line.replace(/\s+$/,""));
  }
  let body=out.join("\n").replace(/\n{3,}/g,"\n\n").replace(/^\n+|\n+$/g,"");
  if(!key)key=detectKey(body);
  return {title,artist,key,body};
}
function trimToSong(text){
  const lines=String(text||"").replace(/\r/g,"").split("\n");const idx=[];
  lines.forEach((l,i)=>{if(isChordLine(l))idx.push(i)});
  if(idx.length<2)return null;
  return lines.slice(Math.max(0,idx[0]-3),Math.min(lines.length,idx[idx.length-1]+3)).join("\n");
}
const api={parseChord,isChordTok,isChordLine,isSection,keyInfo,detectKey,nameNote,renderChord,transposeTok,transposeChordLine,transposeBody,sheetOpts,keyLabel,importText,trimToSong};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.Chords=api;
})(typeof self!=="undefined"?self:this);
