// PokéBonk 辅助启动器：带调试端口启动游戏，注入 bot.js 和开关面板。
// 用法：node launcher.mjs ["游戏exe路径"]（不填会自动查找，找到后记在 game-path.txt）
// 不修改游戏文件：用永远返回 false 的条件断点在游戏函数入口调用 bot.js，拿到对局和输入对象。
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { createInterface } from 'node:readline/promises';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 9333;
const CFG = join(here, 'game-path.txt');                                 // 找到的游戏路径存这里，下次直接用

// ---------- 自动找游戏 exe：每台电脑都不用手动改路径 ----------
const isGame = (p) => !!p && /^pokebonk\.exe$/i.test(basename(p)) && existsSync(p); // 必须叫 PokeBonk.exe 且真的存在（排除卸载程序）
const clean = (s) => (s || '').trim().replace(/^["']|["']$/g, '');      // 去掉首尾空格和引号（拖文件进窗口会带引号）
const asExe = (p) => {                                                  // 用户给的是文件夹也行：自动补上 PokeBonk.exe
  p = clean(p); if (!p) return null;                                    // 空的不要
  if (isGame(p)) return p;                                              // 本来就是 exe
  const q = join(p, 'PokeBonk.exe'); return isGame(q) ? q : null;       // 是文件夹就拼上文件名
};

// 用 PowerShell 一次查：正在运行的游戏进程、桌面/开始菜单快捷方式、注册表卸载信息
function fromSystem() {
  const ps = `
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$ErrorActionPreference='SilentlyContinue'
Get-Process PokeBonk | ForEach-Object { $_.Path }
$sh=New-Object -ComObject WScript.Shell
$dirs=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'))
foreach($d in $dirs){ if($d){ Get-ChildItem $d -Recurse -Filter *.lnk | Where-Object { $_.Name -match 'poke' } | ForEach-Object { $sh.CreateShortcut($_.FullName).TargetPath } } }
foreach($k in 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'){
  Get-ItemProperty $k | Where-Object { $_.DisplayName -match 'poke' } | ForEach-Object { $_.InstallLocation; ($_.DisplayIcon -split ',')[0] }
}`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    for (const line of out.split(/\r?\n/)) { const p = asExe(line); if (p) return p; } // 第一个有效的就用
  } catch {}                                                            // PowerShell 不可用就跳过这一步
  return null;
}

// 常见安装位置（Electron 默认装在 %LOCALAPPDATA%\Programs 下）
function fromCommon() {
  const env = process.env;
  const c = [
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'PokeBonk'),  // Electron 单用户安装默认位置
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'pokebonk'),
    env.ProgramFiles && join(env.ProgramFiles, 'PokeBonk'),              // 所有用户安装
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'PokeBonk'),
    join(here, '..', 'PokeBonk'), here,                                 // 和辅助放在同一个文件夹旁边也行
  ];
  for (const d of c) { const p = d && asExe(d); if (p) return p; }      // 第一个存在的就用
  return null;
}

// 最后手段：扫描所有磁盘（限制深度，跳过系统目录，避免太慢）
function fromScan() {
  const skip = /^(windows|\$recycle\.bin|system volume information|programdata|recovery|perflogs|node_modules|\$windows\.~ws|\$winreagent|msocache)$/i;
  const walk = (dir, depth) => {
    let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return null; } // 没权限的目录直接跳过
    for (const e of ents) if (e.isFile() && /^pokebonk\.exe$/i.test(e.name)) return join(dir, e.name); // 当前层先找
    if (depth <= 0) return null;                                        // 到深度上限就不再往下
    for (const e of ents) if (e.isDirectory() && !skip.test(e.name)) { const r = walk(join(dir, e.name), depth - 1); if (r) return r; } // 逐个子目录往下找
    return null;
  };
  for (const L of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {                         // 逐个盘符
    const root = `${L}:\\`; if (!existsSync(root)) continue;            // 没这个盘就跳过
    console.log(`正在搜索 ${root} …`);
    const r = walk(root, 4); if (r && isGame(r)) return r;              // 最多往下 4 层
  }
  return null;
}

async function findExe() {
  const arg = asExe(process.argv[2]); if (arg) return arg;             // 1. 命令行参数
  if (existsSync(CFG)) { const p = asExe(readFileSync(CFG, 'utf8')); if (p) return p; } // 2. 上次记住的路径（游戏挪了就重新找）
  console.log('首次运行，正在自动查找 PokeBonk.exe …');
  let p = fromSystem() || fromCommon() || fromScan();                   // 3. 系统信息 → 常见位置 → 扫盘
  while (!p) {                                                          // 4. 都没找到就让用户拖进来
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question('没找到游戏。请把 PokeBonk.exe（或游戏文件夹）拖进这个窗口，然后按回车：\n> ');
    rl.close();
    p = asExe(ans); if (!p) console.log('这个路径下没有 PokeBonk.exe，请再试一次。');
  }
  try { writeFileSync(CFG, p, 'utf8'); } catch {}                       // 记下来，下次秒开
  console.log('游戏路径：', p);
  return p;
}
const BOT = readFileSync(join(here, 'bot.js'), 'utf8');

// 挂钩点：正则匹配游戏源码，断点打在匹配开头（start）或结尾（end）处。
// cond(m, src) 生成条件表达式：在游戏函数里调用 bot.js，然后返回 false，所以游戏永远不会真的暂停。
// 条件表达式运行在游戏函数的作用域里，能直接用到游戏的局部变量和模块变量（名字从源码里用正则找出来）。
const safe = (expr) => `(()=>{try{return ${expr}}catch(_){return null}})()`; // 取不到就传 null，bot.js 会退回按稀有度
const HOOKS = [
  { name: '每帧走位', re: /let [\w$]+=([\w$]+)\.camYaw,[\w$]+=([\w$]+)\.axis\(/, at: 'start',
    cond: (m) => `(window.__pbBot&&window.__pbBot.frame(${m[1]},${m[2]}),false)` },
  { name: '升级选择', re: /showLevelUp\(([\w$]+),([\w$]+),([\w$]+)\)\{/, at: 'end',
    cond: (m, src) => {
      // 升级卡里的“维生素”只有 id，要用游戏的维生素表（offerCard 里的 XX.get(n.vit).stat）查出它加的是哪项属性
      const vit = /([\w$]+)\.get\([\w$]+\.vit\)\.stat/.exec(src)?.[1];
      const stats = vit ? safe(`${m[2]}.map(o=>o.vit!=null?${vit}.get(o.vit)?.stat??null:null)`) : 'null';
      // 第 3 个参数是游戏的选择回调：(卡, 'reroll' | 'banish')，和点“重抽 / 放逐”按钮效果一样
      return `(window.__pbBot&&window.__pbBot.levelUp(${m[1]},${m[2]},${stats},${m[3]}),false)`;
    } },
  { name: '道具选择', re: /showItemChoice\(([\w$]+),([\w$]+),[\w$]+\)\{/, at: 'end',
    cond: (m, src) => {
      // 道具也只有 id：用游戏自己的道具信息函数（稀有度）和道具表（加成的属性）查出来
      const x = /let [\w$]+=([\w$]+)\([\w$]+\),[\w$]+=[\w$]+\.player\.items\.get\([\w$]+\)\?\?0,[\w$]+=([\w$]+)\.get\(/.exec(src);
      const info = x ? safe(`${m[2]}.map(id=>({rarity:${x[1]}(id)?.rarity??0,stats:(${x[2]}.get(id)?.mods??[]).map(q=>q.stat)}))`) : 'null';
      return `(window.__pbBot&&window.__pbBot.itemChoice(${m[1]},${m[2]},${info}),false)`;
    } },
  { name: '祝福选择', re: /showBlessing\(([\w$]+),[\w$]+,([\w$]+),[\w$]+,[\w$]+\)\{/, at: 'end',   // 祭坛充能完成后的祝福三选一
    cond: (m) => `(window.__pbBot&&window.__pbBot.blessing(${m[1]},${m[2]}),false)` },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return null; }
}

async function main() {
  if (!(await targets())) {
    const EXE = await findExe();                                        // 自动找路径（游戏已带调试端口在运行时不用找）
    console.log('启动 PokéBonk…');
    spawn(EXE, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: 'ignore' }).unref();
  }
  let page;
  for (let i = 0; i < 240 && !page; i++) {          // 最多等 2 分钟（启动画面加载期间会一直等）
    const list = await targets();
    // 只连游戏网页本身（https://pokebonk.com…）。安装目录名里也有 PokeBonk，
    // 之前用 /pokebonk/ 匹配会误连到 file:// 的启动画面，画面一关启动器就跟着退出了。
    page = list?.find((t) => t.type === 'page' && /^https:\/\/([\w-]+\.)?pokebonk\.com/i.test(t.url) && t.webSocketDebuggerUrl);
    if (!page) await sleep(500);
  }
  if (!page) {
    console.error('连不上游戏页面。如果 PokéBonk 已经开着，请先完全关闭它，再运行本启动器。');
    process.exit(1);
  }
  console.log('已连接：', page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  const done = new Set();
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (!p) return;
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
      return;
    }
    if (msg.method === 'Debugger.paused') { send('Debugger.resume').catch(() => {}); return; }
    if (msg.method === 'Debugger.scriptParsed') {
      const { scriptId, url, length } = msg.params;
      if (!/pokebonk\.com\/.*\.js/i.test(url) || /three/i.test(url) || length > 20e6) return;
      let src;
      try { src = (await send('Debugger.getScriptSource', { scriptId })).scriptSource; } catch { return; }
      for (const h of HOOKS) {
        const m = h.re.exec(src);
        if (!m) continue;
        const idx = h.at === 'end' ? m.index + m[0].length : m.index;
        const before = src.slice(0, idx);
        const lineNumber = (before.match(/\n/g) || []).length;
        const columnNumber = idx - (before.lastIndexOf('\n') + 1);
        try {
          await send('Debugger.setBreakpoint', { location: { scriptId, lineNumber, columnNumber }, condition: h.cond(m, src) });
          console.log(`  ✓ 挂钩「${h.name}」 (${url.split('/').pop()})`);
          done.add(h.name);
        } catch (e) { console.log(`  ✗ 挂钩「${h.name}」失败：${e.message}`); }
      }
    }
  };
  ws.onclose = () => { console.log('游戏已关闭，启动器退出。'); process.exit(0); };
  await new Promise((r) => (ws.onopen = r));

  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: BOT });
  await send('Runtime.evaluate', { expression: BOT });
  await send('Debugger.enable');
  await sleep(4000);
  const missing = HOOKS.filter((h) => !done.has(h.name)).map((h) => h.name);
  if (missing.length) console.log(`注意：没找到挂钩点 ${missing.join('、')}（游戏可能更新了代码），对应功能不会生效。`);
  console.log('面板在游戏右上角。保持这个窗口开着；关掉它脚本就停止。');
}

main().catch((e) => { console.error(e); process.exit(1); });
