(()=>{'use strict';
const KEY='tcg-assist-v4',ROSTER_KEY='tcg-assist-roster-v5',$=x=>document.querySelector(x),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const A=[['draw','開始ドロー'],['energy','エネルギー手貼り'],['support','サポート'],['retreat','にげる'],['stadium','スタジアム']];
const blank=()=>Object.fromEntries(A.map(a=>[a[0],false]));
const game=first=>({first,half:1,sides:{self:6,opp:6},flags:{},events:[],result:null,started:Date.now()});
const initial=()=>({players:{self:{name:'プレイヤー1',color:'#54a9ff'},opp:{name:'プレイヤー2',color:'#ff6579'}},version:5,mode:'bo3',duration:50*60*1000,clock:{used:0,since:null,running:false},games:[game('self')],index:0,history:[],undo:[],confirm:true,coin:null,matchEnd:false});
let s;try{s=JSON.parse(localStorage.getItem(KEY))||initial();if(![4,5].includes(s.version))throw Error('migration')}catch{s=initial()}
const PALETTE=['#54a9ff','#ff6579','#4dd7ac','#ffd47b','#b39aff','#ff9f60','#ff77bd','#aebdcb'];
let roster=[];try{roster=JSON.parse(localStorage.getItem(ROSTER_KEY))||[]}catch{};if(!Array.isArray(roster))roster=[];
const persistRoster=()=>{try{localStorage.setItem(ROSTER_KEY,JSON.stringify(roster.slice(-100)))}catch{}};
const addRoster=n=>{n=n.trim().slice(0,32);if(n&&!roster.includes(n)){roster.push(n);persistRoster()}};
if(!s.players)s.players={self:{name:'プレイヤー1',color:PALETTE[0]},opp:{name:'プレイヤー2',color:PALETTE[1]}};
let setupCoin=null;
let modal='',pending=null;const g=()=>s.games[s.index],owner=(gg,h)=>h%2?gg.first:(gg.first==='self'?'opp':'self'),who=()=>owner(g(),g().half),name=w=>s.players?.[w]?.name||(w==='self'?'プレイヤー1':'プレイヤー2'),rnd=(gg,w)=>Math.floor((gg.half+(gg.first===w?1:0))/2),flags=()=>g().flags[g().half]||blank();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){console.warn(e)}};
const snapshot=()=>JSON.stringify({...s,undo:[]});
function mutate(label,fn){s.undo.push(snapshot());if(s.undo.length>60)s.undo.shift();fn();s.history.unshift({at:Date.now(),game:s.index+1,label});if(s.history.length>500)s.history.length=500;save();render()}
function undo(){if(!s.undo.length)return;const list=s.undo,prev=JSON.parse(list.pop());Object.assign(s,prev,{undo:list});save();render()}
const used=()=>s.clock.used+(s.clock.running&&s.clock.since?Math.max(0,Date.now()-s.clock.since):0),remain=()=>Math.max(0,s.duration-used()),fmt=t=>{let n=Math.ceil(Math.max(0,t)/1000);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
function pause(){s.clock.used=used();s.clock.running=false;s.clock.since=null}
function toggleClock(){if(s.matchEnd)return;if(s.clock.running)pause();else{s.clock.running=true;s.clock.since=Date.now()}save();render()}
function winnerFromSides(){return g().sides.self<g().sides.opp?'self':g().sides.opp<g().sides.self?'opp':'draw'}
function tally(){let wins={self:0,opp:0},draws=0;for(const x of s.games){if(x.result?.winner==='self')wins.self++;else if(x.result?.winner==='opp')wins.opp++;else if(x.result?.winner==='draw')draws++}return {...wins,draws}}
function complete(reason,winner){
 if(g().result||s.matchEnd)return;
 mutate(`第${s.index+1}ゲーム終了：${winner==='draw'?'引き分け':name(winner)+'の勝ち'}（${reason}）`,()=>{
  g().result={winner,reason,sides:{...g().sides},at:Date.now()};
  const t=tally();
  if(s.mode==='bo1'||t.self>=2||t.opp>=2||s.games.length>=3){s.matchEnd=true;pause()}
 });
 modal=s.matchEnd?'match-result':'game-result';render();
}
function matchWinner(){const t=tally();return t.self>t.opp?'self':t.opp>t.self?'opp':'draw'}
function timeout(){
 if(!s.clock.running||remain()>0||s.matchEnd)return;
 const wasFinished=!!g().result;
 const winner=winnerFromSides();
 mutate(wasFinished?'マッチ時間切れ':'時間切れ・残りサイド判定',()=>{
  pause();
  if(!wasFinished)g().result={winner,reason:'時間切れ・サイド判定',sides:{...g().sides},at:Date.now()};
  s.matchEnd=true;
 });
 modal='match-result';render();
}
function side(w,d){if(g().result)return;let n=g().sides[w]+d;if(n<0||n>6)return;mutate(`${name(w)}のサイド ${g().sides[w]}→${n}`,()=>{g().sides[w]=n})}
function action(k){if(g().result||(k==='support'&&g().half===1))return;mutate(`${name(who())}：${A.find(a=>a[0]===k)[1]} ${flags()[k]?'取消':'済'}`,()=>{g().flags[g().half]??=blank();g().flags[g().half][k]=!g().flags[g().half][k]})}
function next(force=false){
 if(g().result||s.matchEnd)return;
 // サイド0はターン終了操作をもってゲーム確定。未使用アクションの確認は挟まない。
 if(g().sides.self===0||g().sides.opp===0){
  complete('サイド0・ターン終了',winnerFromSides());return;
 }
 if(!force&&s.confirm&&(!flags().energy||!flags().support)){modal='confirm';render();return}
 modal='';mutate('ターン終了',()=>g().half++);
}
function newGame(){
 if(!g().result||s.matchEnd||s.games.length>=3)return;
 if(remain()<=0&&s.clock.running){timeout();return}
 // ダイアログを先に閉じてから描画する。以前は描画後に閉じていたため画面に残っていた。
 modal='';
 mutate('次のゲームを開始',()=>{
  const first=g().first==='self'?'opp':'self';
  s.games.push(game(first));s.index++;
  // BO3共通タイマーはリセットしない
 });
}
function randomFace(){const a=new Uint32Array(1);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(a);else a[0]=Math.floor(Math.random()*4294967296);return a[0]%2?'ウラ':'オモテ'}
function toss(){const face=randomFace();mutate('コイントス：'+face,()=>{s.coin={face,at:Date.now()}})}
function coinWidget(face,buttonId){return `<div class="coin-widget"><div class="coin-disc ${face==='ウラ'?'tails':'heads'}" aria-label="コイン ${face||'未実施'}">${face||'？'}</div><button class="btn small" id="${buttonId}">コイントス</button></div>`}
function nameOptions(){return [...new Set([...roster,s.players.self.name,s.players.opp.name])].map(n=>`<option value="${esc(n)}"></option>`).join('')}
function colorOptions(selected){return PALETTE.map(c=>`<option value="${c}" ${c===selected?'selected':''}>${({'#54a9ff':'ブルー','#ff6579':'レッド','#4dd7ac':'グリーン','#ffd47b':'イエロー','#b39aff':'パープル','#ff9f60':'オレンジ','#ff77bd':'ピンク','#aebdcb':'グレー'})[c]}</option>`).join('')}

function score(w){const n=g().sides[w],t=tally();return `<div class="panel player ${w}" style="--player-color:${s.players[w].color}"><div><div class="eyebrow">${name(w)} · ${w===g().first?'先攻':'後攻'}</div><div class="who">${s.mode==='bo3'?'勝利 '+t[w]+' / 2':''}</div><div class="eyebrow">${rnd(g(),w)}回目の番 ${who()===w&&!g().result?'● 操作中':''}</div><div class="eyebrow">残りサイド</div></div><div class="side-ctrl"><button class="btn small" data-side="${w}" data-delta="-1" ${n===0||g().result?'disabled':''}>−</button><div class="side">${n}</div><button class="btn small" data-side="${w}" data-delta="1" ${n===6||g().result?'disabled':''}>＋</button></div></div>`}
function panel(w){const active=who()===w&&!g().result,first=active&&g().half===1,f=active?flags():blank();return `<section class="panel action-panel ${w} ${active?'is-active':'is-inactive'}" style="--player-color:${s.players[w].color}"><div class="section-title"><h2>${name(w)} <small>${w===g().first?'先攻':'後攻'}</small></h2><span class="chip">${active?'● 操作中':'待機中'}</span></div>${first?'<div class="warning">先攻初手：サポート・ワザ使用不可。最初の自分の番は通常進化不可。</div>':active&&rnd(g(),w)===1?'<div class="warning">最初の自分の番は通常進化不可。</div>':''}<div class="actions">${A.map(([k,label])=>{let locked=!active||(k==='support'&&first);return `<button class="action ${f[k]?'done':''} ${locked?'locked':''}" data-action="${k}" ${locked?'disabled':''}><strong>${f[k]?'✓ ':''}${label}</strong><span>${k==='support'&&first?'先攻初手は不可':!active?'手番待ち':f[k]?'使用済み・タップで訂正':'タップで記録'}</span></button>`}).join('')}<div class="action locked"><strong>⚔ ワザ</strong><span>${first?'先攻初手は不可':'使用後は通常番終了'}</span></div></div></section>`}
function render(){const t=tally(),r=g().result;$('#app').innerHTML=`<div class="shell"><header class="top"><div><div class="brand">⚡ TCG ASSIST <span class="chip">v7.0 · 2人共有</span></div><div class="subtitle">${s.mode.toUpperCase()} / 第${s.index+1}ゲーム / オフライン保存</div></div><div class="top-actions"><button class="btn small" id="settings">⚙ 設定</button><button class="btn small" id="stats">▤ 分析</button><button class="btn small" id="new">＋ 新規マッチ</button></div></header><div class="match-strip"><strong>${s.mode==='bo3'?'BO3・2勝先取':'BO1・1ゲーム勝負'}</strong><span>ゲーム ${s.index+1} / ${s.mode==='bo3'?3:1}</span><span>勝利：${esc(name("self"))} ${t.self} − ${t.opp} ${esc(name("opp"))} ${t.draws?'｜引分 '+t.draws:''}</span></div><div class="scoreboard">${score('self')}<div class="panel center-score">${coinWidget(s.coin?.face,"coin-inline")}<div class="phase">${r?'ゲーム終了':name(who())+'の番'}</div><div class="turn-number">${g().half}ターン目</div><div class="clock ${remain()===0?'expired':''}" id="clock">${fmt(remain())}</div><div class="eyebrow">マッチ共通残り時間・${s.duration/60000}分</div><button class="btn small" id="timer" ${s.matchEnd?'disabled':''}>${s.clock.running?'⏸ 一時停止':'▶ 開始 / 再開'}</button></div>${score('opp')}</div>${r?`<div class="result-banner"><strong>${s.matchEnd?'マッチ終了：'+(matchWinner()==='draw'?'引き分け':name(matchWinner())+'の勝利'):'第'+(s.index+1)+'ゲーム：'+(r.winner==='draw'?'引き分け':name(r.winner)+'の勝利')}！</strong> ${esc(r.reason)} ${s.matchEnd?'<span>最終結果確定</span>':'<button class="btn primary" id="next-game">次のゲームへ →</button>'}</div>`:''}<div class="shared-panels">${panel('self')}${panel('opp')}</div><div class="bottom-grid"><section class="panel"><div class="section-title"><h2>対戦操作</h2><span class="chip">${name(who())}</span></div><div class="foot-controls"><button class="btn" id="undo" ${s.undo.length?'':'disabled'}>↶ Undo</button><button class="btn primary" id="next" ${r?'disabled':''}>ターン終了 →</button></div><div class="foot-controls"><button class="btn" id="finish" ${r?'disabled':''}>ゲーム終了・勝敗登録</button></div><p class="notice">BO3は3ゲームを通じて50分または75分の共通時計です。時間切れのサイド判定は独自ルールで、公式裁定とは異なります。</p></section><section class="panel"><div class="section-title"><h2>ゲーム結果</h2></div><div class="stat-list">${s.games.map((x,i)=>`<span>第${i+1}ゲーム</span><strong>${x.result?(x.result.winner==='draw'?'引き分け':name(x.result.winner)+' 勝ち'):'進行中'}</strong>`).join('')}<span>残りサイド ${esc(name("self"))} / ${esc(name("opp"))}</span><strong>${g().sides.self} / ${g().sides.opp}</strong></div></section><section class="panel"><div class="section-title"><h2>操作履歴</h2></div><ul class="log">${s.history.slice(0,7).map(x=>`<li>${new Date(x.at).toLocaleTimeString('ja-JP')} / G${x.game} ${esc(x.label)}</li>`).join('')||'<li>記録なし</li>'}</ul></section></div><p class="notice">カード効果による例外は自動判定しません。公式大会での端末使用は大会規定を確認してください。</p></div>${dialogHtml()}`;bind();tick()}
function dialogHtml(){if(!modal)return '';let html='';if(modal==='new')html=`<h2>新しいマッチ</h2><p>現在の対戦を初期化します。必要なら先にCSVを書き出してください。</p><datalist id="player-names">${nameOptions()}</datalist><div class="setup-players">${['self','opp'].map((w,i)=>`<div class="setup-player"><label>プレイヤー${i+1}<input id="player-${w}" list="player-names" maxlength="32" value="${esc(name(w))}" placeholder="プレイヤー名"></label><label>イメージカラー<select id="color-${w}">${colorOptions(s.players[w].color)}</select></label></div>`).join('')}</div><div class="setup-coin"><strong>先攻後攻を決める</strong>${coinWidget(setupCoin?.face,'setup-toss')}<p id="setup-coin-help">コインのオモテ・ウラを決めてトス。結果を見て先攻を選択してください。</p></div><label class="setting">形式 <select id="mode"><option value="bo1">BO1（1ゲーム）</option><option value="bo3">BO3（最大3ゲーム・2勝先取）</option></select></label><label class="setting">持ち時間 <select id="duration"><option value="50">50分（BO3共通）</option><option value="75">75分（BO3共通）</option></select></label><label class="setting">先攻 <select id="first"><option value="self">${esc(name("self"))}</option><option value="opp">${esc(name("opp"))}</option></select></label><button class="btn primary" id="start-match">マッチ開始</button>`;

else if(modal==='settings')html=`<h2>設定</h2><label class="setting"><input type="checkbox" id="confirm" ${s.confirm?'checked':''}> ターン終了前の未使用確認</label><p>対戦タイマーはマッチ開始時に設定します。BO3は全ゲーム共通の時計です。ゲーム間も計時を継続し、50分または75分から選べます。</p>`;
else if(modal==='confirm')html=`<h2>ターン終了の確認</h2><p>${!flags().energy?'エネルギー手貼りが未記録です。<br>':''}${!flags().support?'サポートが未記録です。':''}</p><button class="btn primary" id="force-next">このまま終了</button>`;
else if(modal==='finish')html=`<h2>ゲーム終了・勝敗登録</h2><p>残りサイド ${esc(name("self"))}：${g().sides.self}枚 / ${esc(name("opp"))}：${g().sides.opp}枚</p><p>通常終了の勝者を選択してください。サイド判定で終了することもできます。</p><button class="btn" data-win="self">${esc(name("self"))}勝利</button><button class="btn" data-win="opp">${esc(name("opp"))}勝利</button><button class="btn" data-win="draw">引き分け</button><button class="btn primary" id="side-judge">サイドで判定</button>`;
else if(modal==='game-result')html=`<h2>🏆 第${s.index+1}ゲーム終了</h2><p>残りサイド ${esc(name('self'))}：${g().sides.self}枚 / ${esc(name('opp'))}：${g().sides.opp}枚</p><h2>${g().result.winner==='draw'?'引き分け':esc(name(g().result.winner))+'の勝利！'}</h2><p>ゲーム結果を記録しました。BO3の共通タイマーは引き続き進みます。</p><button class="btn primary" id="modal-next-game">次のゲームへ →</button>`;
else if(modal==='match-result')html=`<h2>🏆 マッチ終了</h2><p>${s.mode.toUpperCase()} / ${esc(name('self'))} ${tally().self}勝 − ${tally().opp}勝 ${esc(name('opp'))}</p><h2>${matchWinner()==='draw'?'マッチ引き分け':esc(name(matchWinner()))+' のマッチ勝利！'}</h2><p>${g().result?.reason==='時間切れ・サイド判定'?'時間切れ時の残りサイドにより最終ゲームを判定しました。':'ゲーム結果が確定しました。'} タイマーは停止しています。</p><button class="btn" id="modal-stats">対戦分析を見る</button>`;
else if(modal==='stats')html=`<h2>対戦分析</h2><div class="stat-list">${s.games.map((gg,i)=>`<span>第${i+1}ゲーム</span><strong>${gg.result?(gg.result.winner==='draw'?'引き分け':name(gg.result.winner)):'進行中'}</strong>${['self','opp'].map(w=>A.map(([k,label])=>`<span>G${i+1} ${name(w)} / ${label}</span><strong>${Object.entries(gg.flags).filter(([h,f])=>owner(gg,+h)===w&&f[k]).length}回</strong>`).join('')).join('')}`).join('')}</div><p><button class="btn primary" id="csv">CSVを書き出す</button></p>`;
return `<div class="modal-back" id="backdrop"><div class="modal" role="dialog" aria-modal="true">${html}${modal==='game-result'?'':'<div><button class="btn ghost" id="close">閉じる</button></div>'}</div></div>`}
function exportCSV(){const rows=[['game','turn','player','draw','energy','support','retreat','stadium','winner','reason','side_p1','side_p2']];s.games.forEach((gg,i)=>{Object.entries(gg.flags).forEach(([h,f])=>rows.push([i+1,h,name(owner(gg,+h)),...A.map(a=>f[a[0]]?1:0),'','','','']));rows.push([i+1,'','','','','','','',gg.result?.winner||'',gg.result?.reason||'',gg.result?.sides?.self??gg.sides.self,gg.result?.sides?.opp??gg.sides.opp])});const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');let u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='tcg-assist-v6-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function bind(){document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>side(b.dataset.side,+b.dataset.delta));document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));$('#timer').onclick=toggleClock;$('#undo').onclick=undo;$('#next').onclick=()=>next();$('#coin-inline').onclick=toss;$('#new').onclick=()=>{setupCoin=null;modal='new';render()};$('#settings').onclick=()=>{modal='settings';render()};$('#stats').onclick=()=>{modal='stats';render()};$('#finish').onclick=()=>{modal='finish';render()};if($('#next-game'))$('#next-game').onclick=newGame;if(!modal)return;if($('#modal-next-game'))$('#modal-next-game').onclick=newGame;if($('#modal-stats'))$('#modal-stats').onclick=()=>{modal='stats';render()};if($('#close'))$('#close').onclick=()=>{modal='';render()};$('#backdrop').onclick=e=>{if(e.target.id==='backdrop'&&modal!=='game-result'){modal='';render()}};if($('#setup-toss'))$('#setup-toss').onclick=()=>{setupCoin={face:randomFace()};const d=document.querySelector('.setup-coin .coin-disc');if(d){d.textContent=setupCoin.face;d.className='coin-disc '+(setupCoin.face==='ウラ'?'tails':'heads');}const h=$('#setup-coin-help');if(h)h.textContent='結果：'+setupCoin.face+'。先攻を選択してマッチを開始してください。'};
for(const w of ['self','opp']){const inp=$('#player-'+w);if(inp)inp.oninput=()=>{const sel=$('#first');if(sel)sel.querySelector(`option[value="${w}"]`).textContent=inp.value||('プレイヤー'+(w==='self'?1:2))}};if($('#confirm'))$('#confirm').onchange=e=>{s.confirm=e.target.checked;save()};if($('#force-next'))$('#force-next').onclick=()=>next(true);if($('#start-match'))$('#start-match').onclick=()=>{if(!confirm('現在のマッチ記録を初期化しますか？'))return;let m=$('#mode').value,d=Number($('#duration').value),f=$('#first').value;
const players={};for(const w of ['self','opp']){players[w]={name:($('#player-'+w).value.trim().slice(0,32)|| (w==='self'?'プレイヤー1':'プレイヤー2')),color:$('#color-'+w).value};addRoster(players[w].name)}
if(players.self.name===players.opp.name){alert('プレイヤー名は別々にしてください。');return}
s=initial();s.players=players;s.coin=setupCoin?{...setupCoin,at:Date.now()}:null;s.mode=m;s.duration=d*60000;s.games=[game(f)];modal='';save();render()};document.querySelectorAll('[data-win]').forEach(b=>b.onclick=()=>{complete('手動登録',b.dataset.win);modal='';render()});if($('#side-judge'))$('#side-judge').onclick=()=>{complete('サイド判定（手動）',winnerFromSides());modal='';render()};if($('#csv'))$('#csv').onclick=exportCSV}
function tick(){let el=$('#clock');if(el)el.textContent=fmt(remain());timeout()}
render();setInterval(tick,250);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(console.warn);
})();
