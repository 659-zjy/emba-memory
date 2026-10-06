const fs = require('fs');
const vm = require('vm');
const path = process.argv[2];
const html = fs.readFileSync(path, 'utf8');
const re = /<script>([\s\S]*?)<\/script>/g;
let m, code = '';
while((m = re.exec(html)) !== null) code += m[1] + '\n';

const mkEl = () => ({
  classList:{add(){},remove(){},toggle(){}}, style:{}, dataset:{},
  addEventListener(){}, setAttribute(){}, getAttribute(){return null},
  innerHTML:'', textContent:'', value:'',
  querySelector(){ return mkEl(); }, querySelectorAll(){ return []; }
});
const documentStub = {
  querySelector(){ return mkEl(); }, querySelectorAll(){ return []; }, createElement(){ return mkEl(); }
};
const localStorageStub = (() => { let s = {}; return {
  getItem(k){ return s[k] !== undefined ? s[k] : null; },
  setItem(k,v){ s[k]=String(v); }, removeItem(k){ delete s[k]; }
};})();
const sandbox = {
  document: documentStub, localStorage: localStorageStub, location: { hash:'#/today' },
  window: { addEventListener(){}, scrollTo(){} }, confirm: () => true, console, setTimeout, alert(){}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const t = sandbox.todayStr;
const y = sandbox.addDays(t(), -1);
const tm = sandbox.addDays(t(), 1);
const IV = [1,2,4,7,15];
let pass = 0, fail = 0;
function eq(name, got, want){
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if(g === w){ pass++; console.log('PASS', name, '=', g); }
  else { fail++; console.error('FAIL', name, 'got', g, 'want', w); }
}
function expectNoThrow(name, fn){
  try { fn(); pass++; console.log('PASS', name, '(no throw)'); }
  catch(e){ fail++; console.error('FAIL', name, 'threw:', e.message); }
}

let ri = sandbox.roundInfo();
eq('day1 round=1', ri.round, 1);
eq('day1 dayInRound=1', ri.dayInRound, 1);

eq('todayNewIds len 34', sandbox.todayNewIds().length, 34);
const __nids1 = sandbox.todayNewIds().slice().sort((a,b)=>a-b).join(',');
const __nids2 = sandbox.todayNewIds().slice().sort((a,b)=>a-b).join(',');
eq('todayNewIds stable within day', __nids1, __nids2);

eq('total learning days', Math.ceil(167/34), 5);
eq('last day new count', 167 - 4*34, 31);

const r1 = sandbox.rec(1); r1.learned = y; r1.ivs = IV.slice(); r1.done = []; r1.extra = [];
const r2 = sandbox.rec(2); r2.learned = y; r2.ivs = IV.slice(); r2.done = [1,2,3,4]; r2.extra = [];
const r3 = sandbox.rec(3); r3.learned = y; r3.ivs = IV.slice(); r3.done = []; r3.extra = [];

eq('card1 interval0 due', sandbox.dueIntervals(1).length, 1);
eq('card1 isDue', sandbox.isDue(1), true);
eq('card2 isDue (interval0 missing)', sandbox.isDue(2), true);
eq('card3 isDue', sandbox.isDue(3), true);
eq('dueIds count 3', sandbox.dueIds().length, 3);

sandbox.startSession('review', [1,2,3]);
sandbox.rateCurrent('good');
eq('card1 done=[0]', r1.done, [0]);
eq('card1 not due after good', sandbox.isDue(1), false);
eq('card1 not mastered', r1.mastered, false);
sandbox.rateCurrent('good');
eq('card2 mastered', r2.mastered, true);
eq('card2 masteredDate today', r2.masteredDate, t());
sandbox.rateCurrent('forgot');
eq('card3 extra includes tomorrow', r3.extra.includes(tm), true);
eq('card3 done empty after forgot', r3.done, []);
expectNoThrow('card3 requeued then rated good', () => sandbox.rateCurrent('good'));
eq('card3 done=[0] after requeue-good', r3.done, [0]);

sandbox.startSession('study', [4,5,6,7,8]);
expectNoThrow('study 5 cards rated', () => {
  for(let i=0;i<5;i++) sandbox.rateCurrent('good');
});
eq('card4 learned today', sandbox.rec(4).learned, t());
eq('card8 learned today', sandbox.rec(8).learned, t());
eq('card9 not learned', sandbox.rec(9).learned, null);
eq('card4 ivs set', sandbox.rec(4).ivs, IV);
eq('card4 not due today (learned today)', sandbox.isDue(4), false);
const __n3 = sandbox.todayNewIds();
eq('todayNewIds excludes learned', __n3.every(id => !sandbox.rec(id).learned), true);

eq('log learn=5', sandbox.logRec().learn, 5);
eq('log good>=6', sandbox.logRec().good >= 6, true);
eq('log forgot=1', sandbox.logRec().forgot, 1);

// 8. 备份导出/导入
const r1c = sandbox.rec(1).learned; // 卡1今天已学（复习测试所学）
const backup = sandbox.exportRaw();
eq('backup has EBA1 prefix', backup.indexOf('EBA1:'), 0);
const s2 = sandbox.parseBackup(backup);
eq('parseBackup returns v1 state', s2 && s2.v, 1);
eq('parseBackup preserves card1', s2.cards['1'] && s2.cards['1'].learned, r1c);
eq('parseBackup rejects garbage', sandbox.parseBackup('hello'), null);
eq('parseBackup rejects empty', sandbox.parseBackup(''), null);
// parseQuestions 文档式（## 标题即问题、正文即答案）
const __pq = sandbox.parseQuestions('# 章标题\n## 什么是交叉编译？\n交叉编译是在一种平台上编译出另一种平台可运行程序的过程，因为目标平台与开发平台不同。\n\n## 什么是设备树？\n设备树是一种描述硬件信息的数据结构，由 DTS 编译成 DTB 供内核解析使用。');
eq('doc-style parse count', __pq.length, 2);
eq('doc-style q1', __pq[0].q, '什么是交叉编译？');
eq('doc-style q2', __pq[1].q, '什么是设备树？');


console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
