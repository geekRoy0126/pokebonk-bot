// PokéBonk 辅助脚本（页面端）。由 launcher.mjs 注入到游戏页面。
// 只在离线 / 非排名的单人局运行；检测到排名局、合作、对战时自动暂停（这一项不可关闭）。
(() => {                                         // 立即执行函数：把所有变量关在自己的作用域里，不污染游戏
  if (window.__pbBot && !window.__pbReload) return; // 已经注入过一次就不再重复注入（页面重载/启动器重复执行时）
  if (window.__pbBot?.stop) window.__pbBot.stop(); // 热更新（window.__pbReload = true 时）：先停掉旧版本
  window.__pbReload = false;
  const timers = [], keyHandlers = [];          // 本版本开的定时器和热键监听，stop() 时全部清掉
  const every = (f, ms) => timers.push(setInterval(f, ms));

  // ==================== 设置 ====================
  const SETTINGS_KEY = 'pbBot.settings.v4';      // 设置保存在浏览器 localStorage 里的键名
  const defaults = {                             // 所有开关的默认值
    autoMove: true,       // 自动走位（总开关：收集、躲怪都靠它）
    autoDodge: true,      // 被包围时自动滑铲脱身（Shift）
    autoJump: true,       // 自动跳跃（Space），防止被高墙卡住
    jumpMode: 'always',   // always 不停地跳 | stuck 只在卡住时跳
    autoUlt: true,        // 终极技自动释放（R）：攒着等怪多再放
    ultMin: 12,           // 10 米内至少多少只怪才放终极技
    iaBoost: 2,           // 地图互动点的整体倍率（越大越爱去互动点，少捡零碎的金币经验）
    clearMob: true,       // 怪多时优先清怪（在怪群外圈绕着打）
    clearMin: 30,         // 15 米内至少多少只怪算“怪多”
    restartOnCatch: false, // 用精灵球抓到宝可梦后自动重开这一局
    ultDive: true,        // 终极技好了就冲进怪最多的地方放，放完马上跑开
    hunt: true,           // 主动击杀值得打的宝可梦：捕捉目标、闪光、宝藏怪、精英、首领
    fight: true,          // 打怪升级：附近有怪就靠过去绕着打
    fightW: 3,            // 打怪的优先级（和捡东西比；越大越爱打怪；面板可调）
    fightDist: 5,         // 打怪时和怪保持的距离（米）
    xpW: 2,               // 经验球的优先级（0 = 不专门去捡，只顺路吸；面板可调）
    autoPick: true,       // 升级时自动选卡
    autoItem: true,       // 精灵球/道具选择时自动选
    autoBless: true,      // 祭坛祝福自动选
    autoModal: true,      // 其它“选一张卡”的弹窗卡住 3 秒后自动选第一张
    prefer: 'farm',       // 选卡策略：farm 刷奖励 | rarity 稀有度 | moves 招式 | stats 属性
    usePlan: true,        // 方案（配置计划）里的卡和道具最优先
    autoReroll: true,     // 三张升级卡全是垃圾卡时自动重抽
    keepReroll: 0,        // 重抽次数留几次不用
    autoBanish: true,     // 总出现的垃圾卡自动放逐
    keepBanish: 1,        // 放逐次数留几次不用
    flee: true,           // 死亡保护：血量低时放下一切，逃跑 + 找回血
    fleeHp: 30,           // 血量低于百分之多少开始逃
    watchdog: true,       // 挂机看门狗：长时间卡住 / 弹窗关不掉时自动重开这一局
    watchMin: 2,          // 卡住多少分钟算挂了
    getMeta: true,        // 局外资源（Bonk 代币、任务线索）
    getMons: true,        // 精灵：捕捉虚弱的野生精灵
    freeCage: true,       // 精灵：花钱解救笼子里的精灵（钱够时）
    getLoot: true,        // 地上的金币、经验、道具、招式学习器
    openFree: true,       // 免费精灵球 / 超级球
    openPaid: true,       // 付费精灵球（钱够时；排在免费的之后）
    useMisc: true,        // 其它安全互动：Magnemite、浆果、岩石、卡比兽、祭坛、挑战祭坛
    risky: true,          // 高风险互动：诅咒祭坛/诅咒球、耿鬼祭坛、钻角犀兽（变难换奖励）
    useNpc: true,         // 其它全部：商店、老虎机、百变怪、催眠貘、多边兽、化石、道场、巢穴、Bill（弹窗用最简单的方式处理）
    bossAt3: true,        // 区域剩 3 分钟时去召唤首领
    portal: true,         // 有传送门就进
    autoRestart: false,   // 对局结束后自动开始下一局
    restartDelay: 5,      // 自动下一局前等待的秒数
    maxRuns: 0,           // 最多自动刷几局（0 = 不限）
    collapsed: false,     // 面板是否折叠
    x: null, y: null,     // 面板拖动后的位置
  };
  let cfg = { ...defaults };                     // 当前生效的设置，先复制一份默认值
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {} // 读取上次保存的设置覆盖默认值；读不到就忽略
  if (cfg.xpW === 4 && !cfg.xpWSet) cfg.xpW = 2;
  if (cfg.fightW === 6 && !cfg.fightWSet) cfg.fightW = 3;  // 旧默认打怪权重 6 太高，换成 3（自己改过的不动）  // 旧版本存下的默认值 4 太高，自动换成新的默认值 2（自己在面板改过的不动）
  const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); } catch {} }; // 把当前设置写回 localStorage

  const state = {                                // 运行状态（面板读取它来显示）
    altar: null,               // 正在充能的祭坛 { o, since, best, bestAt }
    altarBan: new WeakMap(),   // 充失败的祭坛 → 到什么时候之前不再去
    allowed: false,            // 当前对局是否允许脚本运行
    reason: '等待对局开始…',   // 面板状态栏文字
    lastFrame: 0,              // 最后一次收到游戏帧的时间
    run: null,                 // 最近一局的对局对象
    runAllowed: false,         // 最近一局是否允许运行（自动下一局只在允许的局之后触发）
    runsDone: 0,               // 本次启动后自动刷完的局数
    totalKills: 0,             // 自动刷完的局累计击杀
    restartAt: 0,              // 上次自动点“再来一局”的时间
    restartTimer: null,        // 等待自动下一局的计时器
    lastUse: 0, lastDodge: 0, lastUlt: 0, lastThrow: 0, // 各动作上次触发的时间（防止连发）
    target: '',                // 当前正在去拿的东西（面板显示）
    modalEl: null,             // 当前正在处理的弹窗元素
    modalSeen: 0,              // 这个弹窗第一次出现的时间
    modalStep: 0,              // 处理到第几步：0 还没动 / 1 已经选过一次 / 2 正在关闭
    modalOurs: false,          // 这个弹窗是不是脚本自己互动打开的（只有自己打开的才会去关）
    session: null,             // 最近一次脚本互动：{ kind 种类, start 时间, acted 是否已经在弹窗里选过 }
    oursGoneAt: 0,             // 上一个脚本打开的弹窗消失的时间
    exitTry: 0,                // 上次尝试关闭弹窗的时间
    visited: new WeakMap(),    // 已经互动过的东西 → 时间（同一个东西不反复去）
    stuckX: 0, stuckZ: 0, stuckAt: 0, // 卡墙检测：上次记录的位置和时间
    stuckFor: 0,               // 已经连续卡了多少秒
    sidestep: null,            // 卡太久时临时绕路的方向 { x, z, until }
    holdSpace: false,          // 脚本是不是正按着空格（滑翔用），只松开自己按的
    log: [],                   // 面板底部的最近动作记录
  };
  const log = (msg) => { state.log.unshift(new Date().toLocaleTimeString() + ' ' + msg); state.log.length = Math.min(state.log.length, 6); }; // 记一条动作日志，只保留最近 6 条

  // ==================== 【在线/排名模式检测】（始终开启，不可关闭） ====================
  // 返回 [是否允许运行, 面板上显示的状态文字]。
  // 数据来源：run.meta.ticket —— 开局时游戏向服务器 POST /runs 得到的“对局票据”：
  //   ticket.offline = true  → 连不上服务器、选择离线游玩（不计进度/排名）
  //   ticket.id 为空         → 同上，没有服务器端对局
  //   ticket.ranked          → 服务器判定这局是否进排行榜
  // 所有自动功能（走位、收集、互动、捕捉、首领、传送门、选卡、选道具、祝福、弹窗、自动下一局）都先经过这里。
  function checkAllowed(run) {
    const t = run?.meta?.ticket;                               // 取出这局的对局票据
    if (!t) return [false, '没有对局信息，已暂停'];         // 读不到票据 → 保守暂停
    if (run.coop) return [false, '合作局，已暂停'];          // 多人合作
    if (run.duel) return [false, '对战局，已暂停'];          // 对战
    if (t.offline || !t.id) return [true, '离线局，运行中'];  // 离线局 → 允许
    if (t.ranked === false) return [true, '非排名局，运行中']; // 服务器明确不计排名 → 允许
    return [false, '排名局，已暂停'];                         // 其余（排名局）→ 暂停
  }
  // =====================================================================================

  // ==================== 目标优先级 ====================
  // 权重越大越优先；实际排序 = 距离 ÷ 权重 × 目标附近怪物的惩罚。0 = 不去。
  // 优先级大致是：局外资源 / 精灵 > 免费宝箱 > 地上的钱和道具 > 其它免费互动 > 付费的 > 经验球。
  const PICKUP_W = {                             // 地上拾取物（游戏内部种类名 → 权重）
    candy: 9,                                    // 神奇糖果
    chestkey: 10,                                // 宝箱钥匙
    coin: 6,                                     // 金币
    'tm-swords': 8, 'tm-agility': 8, 'tm-iron': 8, 'tm-thunder': 8, 'tm-payday': 8, // 招式学习器
    magnet: 8, bomb: 6, repel: 5,                // 磁铁、炸弹、驱虫喷雾
    heal: 2,                                     // 回血（残血时会提高）
    xp: 1.2,                                     // 经验球（太多了，权重最低）
  };
  const PICKUP_KINDS = ['xp', 'coin', 'heal', 'magnet', 'bomb', 'repel', 'candy', 'chestkey', 'tm-swords', 'tm-agility', 'tm-iron', 'tm-thunder', 'tm-payday']; // 游戏里拾取物种类的顺序（kind[i] 是这里的下标）

  // 最后的首领关（游戏的判断：第 4 区是圣域；没有圣域的地图第 3 区就是最终战）
  const isFinal = (run) => !run.endless && !run.tower && !run.expedition && (run.sanctuary || run.stage >= 4 || (run.stage >= 3 && !run.biome?.sanctuary));
  const bossTime = (run) => !run.endless && !run.tower && !run.expedition && ((run.stageTime || 0) >= 420 || isFinal(run)); // 最终关：一进来就主动去开首领 // 普通区域每区 600 秒，≥420 秒 = 剩 3 分钟

  // 能不能融合：至少两个“单独的”招式（不是融合招式、没被合并、不是随机/天气类）升到了 8 级（游戏融合机的要求）
  const moveSig = (run) => (run.player?.moves || []).map((m) => m ? (m.def?.id ?? '?') + ':' + (m.level || 0) : '-').join(','); // 招式组合的“指纹”
  // 友友球队伍满了没有（游戏：队伍上限 = 局外队伍格数 + 船票道具；满了再抓会弹出“换掉谁”的窗口）
  const teamFull = (run) => { const al = run.allies; try { return !!al && (al.team?.length ?? 0) >= al.cap; } catch { return false; } };
  function fuseReady(run) {
    if (state.billSkipSig && state.billSkipSig === moveSig(run)) return false;   // 这套招式只能融合出 MissingNo. → 招式变了之前不再去
    const mv = run.player?.moves || [];
    return mv.filter((m) => m && !m.def?.fusion && !m.link && !(m.parents?.length) && !['random', 'weather', 'fusion'].includes(m.def?.arch) && (m.level || 0) >= 8).length >= 2;
  }
  const isPurple = (o) => o && ((o.kind === 'altar' && (o.data?.tier === 2 || o.data?.tier === 3)) || o.kind === 'greed'); // 紫色（史诗/耿鬼）和金色祭坛
  const purpleOk = (run) => false;               // 金色、紫色祭坛：永远不开
  function objectWeight(run, o) {                // 地图互动物的权重（0 = 不碰）
    if (!o || (o.used && o.kind !== 'portal')) return 0;      // 已经用过的跳过（传送门除外）
    const seen = state.visited.get(o);                        // 脚本互动过的：NPC 类这一区不再去；传送门 20 秒后再试；
    if (seen && performance.now() - seen < (o.kind === 'bill' ? 60000 : NPC_KINDS.has(o.kind) ? Infinity : o.kind === 'portal' ? 1500 : 4000)) return 0; // 宝箱等 4 秒后还没打开就再试（游戏开箱有 1.7 秒冷却）；传送门 1.5 秒后再按一次（附近有没开的超级球时游戏要按两次）
    const ia = run.interactables, gold = run.gold || 0, hp = run.player.hp / run.player.maxHp;
    if (o.kind === 'bonk' || o.data?.lead) return cfg.getMeta ? 16 : 0;         // 局外资源：Bonk 代币、任务线索
    switch (o.kind) {
      case 'freechest': return cfg.openFree ? 15 : 0;                           // 超级球（免费）
      case 'chest': {
        if (o.data?.gift) return cfg.openFree ? 15 : 0;                         // 赠送的精灵球（免费）
        let cost = Infinity; try { cost = ia.chestCost(); } catch {}
        return cfg.openPaid && gold >= cost ? 15 : 0;                            // 付费精灵球：钱够才去，排在免费的后面
      }
      case 'cage': {                                                            // 笼子里的精灵：花钱解救
        let cost = Infinity; try { cost = ia.cageCost(); } catch {}
        return cfg.freeCage && gold >= cost ? 15 : 0;  // 解救笼中精灵：第 4 优先（和祭坛、精灵球同档）
      }
      case 'magnet': return cfg.useMisc ? 14 : 0;                               // Magnemite：吸全图经验
      case 'berry': return cfg.useMisc && hp < 0.7 ? 4 + (1 - hp) * 6 : 0;     // 浆果：回 50% 血，越残越优先
      case 'rock': return cfg.useMisc ? 14 : 0;                                 // 岩石：打碎掉钱
      case 'snorlax': return cfg.useMisc ? 15 : 0;                              // 卡比兽
      case 'altar': return cfg.useMisc && !o.data?.sealed && (!isPurple(o) || purpleOk(run)) && !((state.altarBan.get(o) || 0) > performance.now()) ? 15 : 0;              // 祝福祭坛：站进圈里充能
      case 'challenge': return cfg.useMisc && hp > 0.5 && (run.player.level || 0) >= 30 ? 15 : 0; // 挑战：30 级以后才去                 // 挑战祭坛：打赢一波给超级球（血量够才去）
      case 'cursed': case 'cursedchest': return cfg.risky && hp > 0.5 ? 15 : 0;  // 诅咒祭坛 / 诅咒球
      case 'greed': return 0;                                                   // 紫色耿鬼祭坛：不开
      case 'rhydon': return cfg.risky && hp > 0.6 ? 14 : 0;                      // 钻角犀兽
      case 'boss': case 'shrine':                                               // 召唤首领
        return cfg.bossAt3 && !run.bossSpawned && bossTime(run) ? 9 : 0;
      case 'portal':                                                            // 传送门
        return cfg.portal ? 6 : 0;
      case 'ditto': return cfg.useNpc && run.player.items?.size ? 14 : 0;      // 百变怪：复制一个道具（有道具才去）
      case 'meowth': return cfg.useNpc ? 14 : 0;                                // 喵喵商店：买第一个买得起的
      case 'dojo': return cfg.useNpc && (run.player.level || 0) >= 30 ? 15 : 0; // 道场挑战：30 级以后才去
      case 'bill': return cfg.useNpc && fuseReady(run) ? 25 : 0;            // Bill 融合机：两个招式都满 8 级才去
      case 'porygon': case 'nest': return cfg.useNpc ? 14 : 0; // 多边兽、道场、巢穴、Bill：选第一个
      case 'slots': return cfg.useNpc ? 6 : 0;                                  // 老虎机：转一次就走
      case 'fossil': return cfg.useNpc && hp > 0.6 ? 15 : 0; // 化石（翼龙）：选第二个选项                    // 化石：花最大血量复活，血多才去
      case 'hypno': return cfg.useNpc ? 6 : 0;                                  // 催眠貘：打开后直接点“完成”，不忘招式
      default: return 0;                         // 爬塔/远征模式专用的东西不碰
    }
  }
  const PAID_KINDS = new Set(['chest', 'cage', 'meowth', 'slots', 'boss', 'shrine', 'portal']); // 要花钱的（还有首领/传送门这种不算“免费互动”的）
  const NEEDS_STAY = new Set(['altar']);         // 这些要站在圈里等，不是按 E
  const WALK_ONLY = new Set(['bonk']);           // 这些走过去碰到就自动捡，不用按 E
  const NPC_KINDS = new Set(['meowth', 'slots', 'ditto', 'hypno', 'porygon', 'dojo', 'nest', 'bill', 'fossil']); // 用了不会消失的，一区只去一次

  // ==================== 自动走位（收集 + 躲怪） ====================
  let wander = Math.random() * Math.PI * 2;      // 附近没东西时随机游走的方向（弧度），初始随机
  function banAltar(o, why) {                   // 祭坛充失败：2 分钟内不再去这个祭坛
    state.altarBan.set(o, performance.now() + 120000); state.altar = null; log(`放弃祭坛（${why}），先不管它`);
  }
  function breakoutDir(run) {                    // 被困在地图边：找一个往里走、怪最少的方向
    const p = run.player.pos, en = run.enemies, lim = run.terrain?.walkLim || 1e9;
    const cl = Math.hypot(p.x, p.z) || 1;
    let best = null, bestT = Infinity;
    for (let a = 0; a < 16; a++) {
      const ux = Math.cos(a * Math.PI / 8), uz = Math.sin(a * Math.PI / 8);
      const inward = (-p.x * ux - p.z * uz) / cl;                       // 1 = 正对地图中心
      if (inward < 0.2) continue;                                       // 只考虑往里走的方向
      let t = -inward * 2;
      for (const ahead of [6, 14]) {                                    // 这个方向前面会不会又撞到边
        const ax = p.x + ux * ahead, az = p.z + uz * ahead;
        if (Math.abs(ax) > 0.92 * lim || Math.abs(az) > 0.92 * lim) t += 5;
      }
      if (en) for (let i = 0; i < en.n; i++) {                          // 这个方向上的怪：越近越正对越糟
        if (!en.alive[i] || en.dying?.[i] > 0 || en.charm?.[i] > 0) continue;
        const ex = en.x[i] - p.x, ez = en.z[i] - p.z, d = Math.hypot(ex, ez);
        if (d > 16 || d < 1e-3) continue;
        const c = (ex * ux + ez * uz) / d;
        if (c > 0.3) t += c * c * 4 / Math.max(1, d);
      }
      if (t < bestT) { bestT = t; best = [ux, uz]; }
    }
    return best || [-p.x / cl, -p.z / cl];
  }
  function steer(run, info) {                    // 计算这一帧想走的方向，返回世界坐标里的单位向量 [x, z]，或 null（不动）
    const p = run.player?.pos;                   // 玩家位置（地面是 x-z 平面）
    const en = run.enemies;                      // 敌人池：一组按下标对齐的数组（x[i]、z[i]、alive[i]…）
    if (!p || !en) return null;                  // 还没加载好就不动
    const cap = run.capture;                     // 捕捉流程：fight/roaming（要先打虚弱）→ weakened（能扔球）
    const capIdx = cap?.state === 'weakened' ? cap.index : -1;                       // 已经虚弱、可以扔球的
    let capFight = cap && (cap.state === 'fight' || cap.state === 'roaming') ? cap.index : -1; // 要先打到虚弱的
    // 抓宝可梦最优先：捕捉目标不设时间上限，一直打到能扔球为止（只有逃命、区域快结束时才放下）
    // 友友球（Amigo Ball）：头目宝可梦被打倒后会趴下，9 米内按 E 扔友友球，收下它当队友
    const al = run.allies, amigoIdx = cfg.getMons && !teamFull(run) && al?.state === 'down' && al.down >= 0 && en.alive[al.down] ? al.down : -1;
    let alphaIdx = -1;                           // 头目宝可梦：已改到“打怪”那一档（见下面 hunts），这里不再强制去打
    if (false) {
      let ad = 40;
      for (let i = 0; i < en.n; i++) {
        if (!en.alive[i] || en.dying?.[i] > 0 || en.charm?.[i] > 0 || !((en.flags?.[i] || 0) & 2) || (en.flags[i] & 4)) continue;
        const d = Math.hypot(en.x[i] - p.x, en.z[i] - p.z); if (d < ad) { ad = d; alphaIdx = i; }
      }
    }
    const capturing = cfg.getMons && (capIdx >= 0 || capFight >= 0 || amigoIdx >= 0 || alphaIdx >= 0) && (run.stageTime || 0) < 565;
    const bossIdx = run.boss?.alive ? run.boss.bossIndex : -1;                      // 场上的首领
    let rx = 0, rz = 0, danger = 0, close = 0;   // rx/rz：躲避推力；danger：危险程度；close：贴身敌人数
    let nearD = Infinity, nx = 0, nz = 0;        // 最近敌人的距离，以及指向它的方向
    const R = 10;                                // 10 米内的敌人会产生躲避推力
    const foes = [];                             // 附近敌人坐标（给目标算“周围有多少怪”用）
    const hunts = [];                            // 值得主动去打的宝可梦：[下标, 权重, 名称, 保持距离]
    for (let i = 0; i < en.n; i++) {             // 遍历敌人池
      if (!en.alive[i] || en.dying?.[i] > 0 || en.charm?.[i] > 0) continue; // 跳过：空槽、正在死亡、被魅惑（友方）的
      const dx = p.x - en.x[i], dz = p.z - en.z[i];                         // 从敌人指向玩家
      const d = Math.hypot(dx, dz) - (en.radius?.[i] || 0.5);               // 到敌人边缘的距离
      if (d < 40) foes.push(en.x[i], en.z[i]);
      if (i === capIdx || i === amigoIdx) continue; // 要扔球的那只不躲
      // 要击杀的宝可梦（游戏给敌人打的标记）：捕捉目标 128、闪光 2048、宝藏怪 16384、精英 1 / 头目 2 / 图腾 4096
      const f = en.flags?.[i] || 0;
      if (cfg.hunt) {
        if (i === capFight) hunts.push([i, 9.5, '打虚弱再抓', 5]);
        else if (i === bossIdx) hunts.push([i, 6, '打首领', 11]); // 首领伤害高，离远点打
        else if (f & 2048) hunts.push([i, 16, '闪光宝可梦', 5]);
        else if (f & 16384) hunts.push([i, 8, '宝藏宝可梦', 5]);
        else if (f & 2) hunts.push([i, cfg.fightW + 0.5, teamFull(run) ? '打头目（队伍满了，只拿奖励）' : '打头目（打倒扔友友球）', 6]); // 头目：和打怪同一档（略高一点点）
        else if (f & (1 | 4096)) hunts.push([i, cfg.fightW, '精英宝可梦', 6]);
      }
      if (d < nearD) { nearD = d; nx = -dx; nz = -dz; }
      if (d < 2.5) close++;                      // 2.5 米内算贴身
      if (d < 10) info.near10++;                 // 10 米内的数量（终极技用）
      if (i === bossIdx && d < 15) info.bossNear = true;                    // 首领在 15 米内（终极技用）
      if (i === bossIdx) info.bossD = d;                                    // 离首领多远（滑铲用）
      const isBoss = i === bossIdx;
      if (d < (isBoss ? 16 : R)) {             // 首领：16 米内就开始躲
        const w = (i === capFight || i === alphaIdx ? 0.4 : isBoss ? 3 : 1) / Math.max(0.3, d * d) * (isBoss ? 4 : 1); // 越近权重越大；要打的那只推力小一点；首领推力大得多
        rx += dx * w; rz += dz * w; danger += w;
      }
    }
    info.danger = danger; info.close = close;
    const hp = run.player.hp / run.player.maxHp;
    const lowHp = hp < 0.35;                     // 残血
    const hurt = hp < 0.45;                      // 受伤了：打法保守一点（离怪远些、不进怪堆捡东西）
    const crowd = (x, z) => { let c = 0; for (let j = 0; j < foes.length; j += 2) if (Math.hypot(foes[j] - x, foes[j + 1] - z) < 5) c++; return c; }; // 某点 5 米内有几只怪

    // ---- 刚召唤完首领：首领会出现在召唤点，4 秒内直接往反方向跑开 ----
    if (state.escapeFrom && performance.now() < state.escapeFrom.until) {
      const ex = p.x - state.escapeFrom.x, ez = p.z - state.escapeFrom.z, ed = Math.hypot(ex, ez) || 1;
      let ux = ex / ed, uz = ez / ed;
      if (ed < 0.5) { ux = -p.x / (Math.hypot(p.x, p.z) || 1); uz = -p.z / (Math.hypot(p.x, p.z) || 1); } // 正站在召唤点上：往地图中心跑
      info.escaping = true; state.target = state.escapeFrom.label || '召唤后跑开';
      return [ux, uz];
    }

    // ---- 死亡保护：血量低于设定值、附近有怪 → 放下所有目标，只管回血和逃跑 ----
    const lim0 = run.terrain?.walkLim || 1e9;
    const fleeAt = bossIdx >= 0 ? Math.max(cfg.fleeHp, 45) : cfg.fleeHp; // 首领在场时至少 45% 就开始逃
    if (cfg.flee && hp < fleeAt / 100 && nearD < 15) {
      info.fleeing = true;
      if (state.altar) banAltar(state.altar.o, '血量低，先逃跑');  // 正在充祭坛也放弃
      // 1) 25 米内有“周围没怪”的回血（回血球 / 浆果）→ 去吃
      let hx = 0, hz = 0, hd = Infinity;
      const tryHeal = (x, z) => { const d = Math.hypot(x - p.x, z - p.z); if (d < 25 && d < hd && crowd(x, z) === 0) { hd = d; hx = x; hz = z; } };
      const pk0 = run.pickups;
      if (pk0) for (let i = 0; i < pk0.n; i++) if (pk0.alive[i] && PICKUP_KINDS[pk0.kind[i]] === 'heal') tryHeal(pk0.x[i], pk0.z[i]);
      for (const o of run.interactables?.list || []) if (o.kind === 'berry' && !o.used) tryHeal(o.x, o.z);
      let fx, fz;
      if (hd < Infinity) { fx = (hx - p.x) / hd; fz = (hz - p.z) / hd; state.target = '残血：去回血'; }
      else {
        // 2) 没有安全的回血 → 在 16 个方向里找怪最少、离边缘最远的方向逃
        let bestT = Infinity; fx = 0; fz = 0;
        for (let a = 0; a < 16; a++) {
          const ux = Math.cos(a * Math.PI / 8), uz = Math.sin(a * Math.PI / 8);
          let t = 0;
          for (let j = 0; j < foes.length; j += 2) {
            const ex = foes[j] - p.x, ez = foes[j + 1] - p.z, d = Math.hypot(ex, ez);
            if (d > 15 || d < 1e-3) continue;
            const c = (ex * ux + ez * uz) / d;   // 这个方向上有没有怪（1 = 正对着怪）
            if (c > 0) t += c * c / Math.max(1, d);
          }
          for (const ahead of [10, 25]) {                                  // 往这个方向走 10 米 / 25 米会不会撞到地图边
            const ax = p.x + ux * ahead, az = p.z + uz * ahead;
            if (Math.abs(ax) > 0.85 * lim0 || Math.abs(az) > 0.85 * lim0) t += ahead === 10 ? 6 : 3;
          }
          const pr = Math.hypot(p.x, p.z) / lim0;                          // 已经靠边了：越靠边越偏向往地图中心跑
          if (pr > 0.6) t -= ((-p.x * ux - p.z * uz) / (Math.hypot(p.x, p.z) || 1)) * (pr - 0.6) * 8;
          if (t < bestT) { bestT = t; fx = ux; fz = uz; }
        }
        state.target = '残血：逃跑';
      }
      const dx = fx + rx * 2, dz = fz + rz * 2;  // 再叠加两倍的躲怪推力
      const len = Math.hypot(dx, dz);
      return len > 1e-3 ? [dx / len, dz / len] : null;
    }

    // 第 2 优先：剩 3 分钟开首领 / 首领打完进传送门 —— 这时不冲大招、不充祭坛
    const billObj = cfg.useNpc && (run.stageTime || 0) < 560 && fuseReady(run) ?
      (run.interactables?.list || []).find((o) => o.kind === 'bill' && objectWeight(run, o) > 0) : null; // 招式够级了、地图上有融合机
    const urgent = !!billObj || (cfg.bossAt3 && bossTime(run) && !run.bossSpawned) ||
      (cfg.portal && run.stageCleared && state.clearedAt && performance.now() - state.clearedAt > 15000);

    // ---- 第 3 优先：终极技冲脸：大招好了、血够 → 冲到怪最密的地方（放大招在 frame 里做），放完跑开 ----
    const u0 = run.ult, nowD = performance.now();
    if (!capturing && !urgent && cfg.autoUlt && cfg.ultDive && u0?.ready && u0.active <= 0 && hp >= 0.5 && nowD > (state.diveBanUntil || 0) &&
        !(info.bossD != null && info.bossD < 16) && (run.stageTime || 0) < 570) {
      let bx = 0, bz = 0, bc = 0;                // 找 30 米内“周围 8 米怪最多”的那只怪的位置
      for (let a = 0; a < foes.length; a += 2) {
        if (Math.hypot(foes[a] - p.x, foes[a + 1] - p.z) > 30) continue;
        let c = 0;
        for (let j = 0; j < foes.length; j += 2) if (Math.abs(foes[j] - foes[a]) < 8 && Math.abs(foes[j + 1] - foes[a + 1]) < 8) c++;
        if (c > bc) { bc = c; bx = foes[a]; bz = foes[a + 1]; }
      }
      if (bc >= Math.max(5, Math.min(cfg.ultMin, 15))) {       // 那里的怪够多才冲
        if (!state.diveSince) state.diveSince = nowD;
        if (nowD - state.diveSince > 7000) { state.diveSince = 0; state.diveBanUntil = nowD + 10000; } // 冲了 7 秒还没放出去 → 放弃 10 秒
        else {
          const dx = bx - p.x, dz = bz - p.z, dd = Math.hypot(dx, dz) || 1;
          info.diving = true; info.diveFrom = [bx, bz]; info.diveD = dd; state.target = `大招冲怪群（${bc} 只）`;
          return [dx / dd, dz / dd];
        }
      } else state.diveSince = 0;
    } else state.diveSince = 0;


    // ---- 第 4 优先：祭坛：进了圈就坚持充到 100%；失败（被迫逃跑 / 60 秒没充满 / 12 秒没进度）→ 这个祭坛 2 分钟内不管 ----
    const nowA = performance.now(), iaList = run.interactables?.list || [];
    if (capturing && state.altar) state.altar = null;  // 有宝可梦要抓：先不充祭坛（不算失败）
    const prePurple = state.purpleTarget && !run.bossSpawned && bossTime(run);    // 正在开首领前的紫色祭坛
    if (urgent && state.altar && !(prePurple && state.altar.o === state.purpleTarget)) banAltar(state.altar.o, '先去开首领/传送门');
    if (!state.altar && cfg.useMisc && !capturing && (!urgent || prePurple)) {           // 走进了某个祭坛的圈 → 锁定它
      for (const o of iaList) {
        if (o.kind !== 'altar' || o.used || o.data?.sealed || (state.altarBan.get(o) || 0) > nowA) continue;
        if (isPurple(o) && !purpleOk(run)) continue;                          // 紫色祭坛 7 分钟前不充
        if (Math.hypot(o.x - p.x, o.z - p.z) < (o.r || 3) + 0.5) { state.altar = { o, since: nowA, best: o.charge ?? 0, bestAt: nowA }; log('开始充祭坛'); break; }
      }
    }
    if (state.altar && !capturing) {
      const A = state.altar, o = A.o, ch = o.charge ?? 0, st0 = run.stageTime || 0;
      if (ch > A.best + 0.005) { A.best = ch; A.bestAt = nowA; }
      if (o.used || ch >= 1 || !iaList.includes(o)) { state.altar = null; if (o.used || ch >= 1) log('祭坛充满'); }
      else if (nowA - A.since > 60000) banAltar(o, '60 秒没充满');
      else if (nowA - A.bestAt > 12000) banAltar(o, '12 秒没进度');
      else if (st0 >= 565 || (cfg.bossAt3 && bossTime(run) && !run.bossSpawned && st0 >= 540)) banAltar(o, '时间不够了');
      else {
        const r0 = o.r || 3, dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1;
        let gx = 0, gz = 0;
        if (d > r0 * 0.45) { gx = dx / d * 1.5; gz = dz / d * 1.5; }   // 离圈中心远了就拉回来
        const av = Math.hypot(rx, rz);                                  // 圈中心附近可以小幅躲怪
        if (av > 1e-3) { const k = Math.min(1, av) * (d < r0 * 0.45 ? 0.8 : 0.3); gx += rx / av * k; gz += rz / av * k; }
        state.target = `祭坛充能 ${Math.round(ch * 100)}%`;
        const gl = Math.hypot(gx, gz);
        return gl > 0.05 ? [gx / gl, gz / gl] : null;
      }
    }

    // ---- 选目标：所有候选里“距离 ÷ 权重 × 怪物惩罚”最小的 ----
    let best = null, bestCost = Infinity;
    const prevT = state.curTarget;               // 上一帧选中的目标
    const consider = (x, z, w, label, stay, keep, crowdK = 0.6, maxD = 110, next = 0) => { // keep = 要打的目标保持的距离（风筝）；crowdK = 附近有怪时降权多少；next = 到下一站的距离
      if (!(w > 0)) return;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > maxD) return;                      // 太远的不考虑（地图互动点不限距离）
      let cost = (d + 2 + 0.5 * next) / w * (1 + crowdK * crowd(x, z)); // 走过去的距离 + 一半“下一站”的距离：顺路的一串优先，少走回头路
      if (prevT && prevT.label === label && Math.hypot(prevT.x - x, prevT.z - z) < 1.5) cost *= 0.7; // 还是上一个目标：打七折，别为了差不多的目标来回换方向
      if (cost < bestCost) { bestCost = cost; best = { x, z, d, label, stay, keep }; }
    };
    const ia = run.interactables;
    // ---- 强制目标：剩 3 分钟一定去召唤首领；首领打完一定去传送门 ----
    let forced = null; state.wantHeal = false;
    const nearestObj = (kinds) => {              // 地图上最近的某类互动物（不限距离）
      let o0 = null, d0 = Infinity;
      for (const o of ia?.list || []) if (kinds.includes(o.kind) && !o.used) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < d0) { d0 = d; o0 = o; } }
      return o0;
    };
    if (cfg.bossAt3 && bossTime(run) && !run.bossSpawned) {
      // 血量 ≥ 65% 才去召唤（不够就先正常捡回血）；区域时间到 540 秒不管血量都去
      let g = null;                              // 7 分钟：先去开紫色祭坛（520 秒前），再召唤首领
      if ((run.stageTime || 0) < 520 && !isFinal(run)) for (const o of ia?.list || []) if (isPurple(o) && !o.used && objectWeight(run, o) > 0 && (!g || Math.hypot(o.x - p.x, o.z - p.z) < Math.hypot(g.x - p.x, g.z - p.z))) g = o;
      state.purpleTarget = g;
      const o = nearestObj(['boss', 'shrine']);
      if (g) forced = { x: g.x, z: g.z, label: g.kind === 'greed' ? 'greed' : '紫色祭坛', stay: g.kind === 'altar' };
      else if (o && (hp >= 0.65 || (run.stageTime || 0) >= 540)) forced = { x: o.x, z: o.z, label: o.kind };
      else if (o) state.wantHeal = true;
    } else if (cfg.portal && run.stageCleared) {
      if (!state.clearedAt) state.clearedAt = performance.now();         // 首领刚倒下：先花 15 秒捡它掉的东西
      if (performance.now() - state.clearedAt > 15000) {
        // 进门前先开掉 45 米内没开的免费球（不开的话游戏会拦一下）；区域时间到 570 秒就不管了，必须在 600 秒前出去
        const free = (ia?.list || []).filter((o) => !o.used && (o.kind === 'freechest' || (o.kind === 'chest' && o.data?.gift)) && Math.hypot(o.x - p.x, o.z - p.z) < 45)
          .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        const o = free && (run.stageTime || 0) < 570 ? free : nearestObj(['portal']);
        if (o) forced = { x: o.x, z: o.z, label: o.kind };
      }
    } else state.clearedAt = 0;

    if (billObj) forced = { x: billObj.x, z: billObj.z, label: 'bill' }; // 第 2 优先：去融合机融合招式（排在开首领/传送门前面）
    if (capturing) {                             // 抓宝可梦：压过所有其它目标
      if (capIdx >= 0) forced = { x: en.x[capIdx], z: en.z[capIdx], label: '抓宝可梦：扔精灵球', keep: 0 };
      else if (amigoIdx >= 0) forced = { x: en.x[amigoIdx], z: en.z[amigoIdx], label: '抓宝可梦：扔友友球', keep: 0 };
      else if (capFight >= 0) forced = { x: en.x[capFight], z: en.z[capFight], label: '抓宝可梦：打虚弱', keep: 2.5, noOrbit: true };
      else forced = { x: en.x[alphaIdx], z: en.z[alphaIdx], label: '抓宝可梦：打倒头目（友友球）', keep: 6 };
    }
    const lockIdx = capturing ? (capFight >= 0 ? capFight : alphaIdx >= 0 ? alphaIdx : -1) : -1;
    if (lockIdx >= 0) { run.lockTarget = lockIdx; state.lockSet = true; }           // 锁定要削弱的宝可梦（攻击集中打它）
    else if (state.lockSet) { if (run.lockTarget >= 0) run.lockTarget = -1; state.lockSet = false; } // 抓完解除脚本设的锁定
    if (forced && !(lowHp && danger > 0.15)) {   // 强制目标（残血又危险时先保命）
      best = forced;
    } else {
      if (cfg.getMons && capIdx >= 0) consider(en.x[capIdx], en.z[capIdx], 10, '捕捉精灵'); // 虚弱的精灵：最优先，过去扔球
      if (!lowHp) for (const [i, w, label, keep] of hunts) consider(en.x[i], en.z[i], w, label, false, keep); // 要击杀的宝可梦（残血时不去）
      // 打怪升级：经验主要靠杀怪。附近有怪就靠过去，保持在攻击距离上绕着打（血量够时）
      if (cfg.fight && !lowHp && nearD < 30) consider(p.x + nx, p.z + nz, cfg.fightW, '打怪升级', false, hurt ? cfg.fightDist + 3 : cfg.fightDist); // nx/nz 指向最近的怪
      const iaW = new Map();                     // 先算出所有要去的互动点和它们的权重
      if (ia?.list) for (const o of ia.list) { const w = objectWeight(run, o); if (w) iaW.set(o, w); }
      const iaPts = [...iaW.keys()];
      const nextHop = (o) => { let m = Infinity; for (const q of iaPts) if (q !== o) { const dd = Math.hypot(q.x - o.x, q.z - o.z); if (dd < m) m = dd; } return m === Infinity ? 0 : Math.min(m, 60); };
      for (const o of iaPts) {                   // 地图互动物
        let w = iaW.get(o);
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        // 远处的东西降权：35 米外只有 1/3 权重（局外资源、首领、传送门、免费球不降），免得满地图乱跑不打怪
        w *= cfg.iaBoost;                        // 地图互动点整体加权（尽量多去拿；面板可调），远处也不降权
        // 免费的互动（不花钱）：越近权重越大，乘上 1 + 2 × (1 - 距离/30)，贴脸时 ×3，30 米外 ×1
        if (!PAID_KINDS.has(o.kind) || o.data?.gift) w *= 1 + 2 * Math.max(0, 1 - d / 30);
        consider(o.x, o.z, w, o.kind, NEEDS_STAY.has(o.kind), 0, 0.3, Infinity, nextHop(o)); // 互动点：整张地图都去；考虑下一站，按最短路线一串串拿
      }
      const pk = run.pickups;                    // 地上拾取物
      if (cfg.getLoot && pk) for (let i = 0; i < pk.n; i++) {
        if (!pk.alive[i]) continue;
        const kind = PICKUP_KINDS[pk.kind[i]];
        let w = PICKUP_W[kind] ?? 2;
        if (kind === 'heal') w = lowHp ? 9 : state.wantHeal && hp < 0.65 ? 8 : hurt ? 7 : hp < 0.8 ? 3 : 0.5; // 回血：残血 / 召唤首领前血不够时最优先，满血不去
        if (kind === 'xp') w = cfg.xpW;          // 经验球：升级要靠它
        consider(pk.x[i], pk.z[i], w, kind, false, 0, (kind === 'xp' || kind === 'coin') && !hurt ? 0.2 : 0.5); // 经验和金币在怪堆里：血多时只稍微降权，受伤了就绕开怪堆
      }
      if (lowHp && best && best.label !== 'heal' && best.label !== 'berry' && danger > 0.15) best = null; // 残血又危险时只去回血
      // 怪多了（15 米内 ≥ 设定数量）：优先清怪。最安全的打法 = 在怪群外圈保持距离绕圈打，躲怪推力照常
      if (cfg.clearMob && !lowHp && hp >= 0.4) {
        let cx = 0, cz = 0, cn = 0;
        for (let j = 0; j < foes.length; j += 2) if (Math.hypot(foes[j] - p.x, foes[j + 1] - p.z) < 15) { cx += foes[j]; cz += foes[j + 1]; cn++; }
        if (cn >= cfg.clearMin) {
          cx /= cn; cz /= cn;
          let rad = 0; for (let j = 0; j < foes.length; j += 2) if (Math.hypot(foes[j] - p.x, foes[j + 1] - p.z) < 15) rad += Math.hypot(foes[j] - cx, foes[j + 1] - cz);
          rad /= cn;                             // 怪群的平均半径
          best = { x: cx, z: cz, label: `清怪（${cn} 只，外圈绕打）`, keep: rad + (hurt ? 7 : 5) }; // 离怪群边缘 5 米（受伤 7 米）绕着打
        }
      }
    }

    state.curTarget = best ? { x: best.x, z: best.z, label: best.label } : null; // 给下一帧做“目标粘性”
    let gx = 0, gz = 0;                          // 目标吸引力
    state.target = best ? best.label : '';
    if (best) {
      const dx = best.x - p.x, dz = best.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (best.keep) {                           // 要打的宝可梦：保持在攻击距离上绕圈（风筝），让自动攻击打它
        const ux = dx / d, uz = dz / d;
        const radial = d > best.keep + (best.noOrbit ? 0.5 : 1.5) ? 1.2 : d < best.keep - 1.5 ? -1 : 0; // 远了靠近，近了后退
        const orbit = best.noOrbit ? 0 : 0.8;    // 捕捉目标：不绕圈，贴着打
        gx += ux * radial - uz * orbit; gz += uz * radial + ux * orbit;           // 再加一点侧向移动绕着它转
      } else {
        const pull = best.stay && d < 2 ? 0 : 1.2; // 祭坛到了圈中心就站着不动
        gx += dx / d * pull; gz += dz / d * pull;
      }
    } else if (nearD < Infinity && nearD > 7 && !lowHp) {   // 没东西可拿：靠近敌人让自动攻击打到它们
      const d = Math.hypot(nx, nz) || 1; gx += nx / d * 0.7; gz += nz / d * 0.7;
    } else if (nearD === Infinity) {             // 看不到敌人：随机游走
      wander += (Math.random() - 0.5) * 0.1;
      gx = Math.cos(wander) * 0.5; gz = Math.sin(wander) * 0.5;
    }
    // 金色、紫色祭坛的圈别踩进去（站在圈里游戏就会开始充能）
    if (!purpleOk(run)) for (const o of run.interactables?.list || []) {
      if (!isPurple(o) || o.used) continue;
      const ox = p.x - o.x, oz = p.z - o.z, od = Math.hypot(ox, oz) || 1, rr = (o.r || 4.5) + 1.5;
      if (od < rr) { gx += ox / od * 2; gz += oz / od * 2; }
    }
    // 远离地图边缘
    const lim = run.terrain?.walkLim;
    if (lim) {
      const edge = (bossIdx >= 0 ? 0.7 : 0.85) * lim; // 首领在场时离边远一点，免得被逼到角落
      if (Math.abs(p.x) > edge) gx -= Math.sign(p.x) * (Math.abs(p.x) - edge) / (lim - edge) * 2;
      if (Math.abs(p.z) > edge) gz -= Math.sign(p.z) * (Math.abs(p.z) - edge) / (lim - edge) * 2;
    }
    // 躲怪：去拿东西的路上也一直叠加远离怪物的推力；残血时推力更大
    const k = lowHp ? 3 : capturing ? 0.4 : bossIdx >= 0 ? 1.8 : hurt ? 1.8 : best ? 1.2 : 1.6; // 首领在场时更怕挨打；去召唤首领的路上也照常躲怪
    let dx = gx + rx * k, dz = gz + rz * k;      // 最终方向 = 目标吸引力 + 躲避推力
    if (lim) {                                   // 已经贴边：往墙外走的分量去掉（沿墙滑），再加一点往里的力
      if (Math.abs(p.x) > 0.93 * lim && Math.sign(dx) === Math.sign(p.x)) dx = -Math.sign(p.x) * 0.3;
      if (Math.abs(p.z) > 0.93 * lim && Math.sign(dz) === Math.sign(p.z)) dz = -Math.sign(p.z) * 0.3;
    }
    const len = Math.hypot(dx, dz);
    if (!(len > 1e-3)) return null;              // 几乎为零（或 NaN）就不动
    return [dx / len, dz / len];
  }

  // ==================== 每帧 ====================
  // 由游戏的玩家更新函数调用（条件断点，永不真正暂停）。run = 对局，input = 输入。
  function frame(run, input) {
    try {
      const now = performance.now();
      state.lastFrame = now;                     // 面板用它判断“是否在对局中”
      if (state.run !== run) {                   // 新的一局
        state.run = run;                         // 记下当前对局（自动下一局、面板用）
        const orig = run.dispose;                // 回主菜单时游戏会调用 dispose()：套一层，记下“这局已经没了”
        if (typeof orig === 'function' && !run.__pbWrapped) {
          run.__pbWrapped = true;
          run.dispose = function (...a) { this.__pbDisposed = true; return orig.apply(this, a); };
        }
      }
      if (state.holdSpace) { input.keys.delete('Space'); state.holdSpace = false; }   // 先松开上一帧脚本自己按住的空格（不管后面要不要继续）
      const [ok, why] = checkAllowed(run);       // 排名检测
      state.allowed = ok; state.reason = why; state.runAllowed = ok;
      if (!ok) return;                           // 不允许 → 本帧什么都不做
      if (run.state !== 'play' || run.player?.dead) return;  // 暂停/死亡中不操作

      const info = { danger: 0, close: 0, near10: 0, bossNear: false, bossD: null, fleeing: false, escaping: false };
      let dir = steer(run, info);                // 算方向，同时统计周围情况（自动走位关了也要统计，终极技要用）

      // --- 自动终极技（R）：攒着，周围怪多的时候再放 ---
      // 放的条件（任一）：10 米内怪物数 ≥ 设定值；首领在 15 米内；快死了（血 < 30%）且身边至少 5 只
      const u = run.ult, hpR = run.player.hp / run.player.maxHp;
      if (cfg.autoUlt && u && u.ready && u.active <= 0 && now - state.lastUlt > 1000 &&
          (info.near10 >= cfg.ultMin || info.bossNear || (hpR < 0.3 && info.near10 >= 5) ||
           (info.diving && info.near10 >= 5 && (info.diveD < 4 || now - state.diveSince > 3500)))) { // 大招冲脸：冲到怪群中间（或冲了 3.5 秒）就放
        state.lastUlt = now;
        try { u.fire(); log(`释放终极技（周围 ${info.near10} 只${info.bossNear ? '，首领在旁' : ''}）`); } catch {}
        if (cfg.ultDive && !info.bossNear) {     // 放完大招：3 秒内往反方向跑出怪群（复用“召唤后跑开”的逻辑）
          const pp = run.player.pos, nb = info.diveFrom || [pp.x - (dir?.[0] || 0), pp.z - (dir?.[1] || 0)];
          state.escapeFrom = { x: nb[0], z: nb[1], until: now + 3000, label: '放完大招跑开' };
        }
        state.diveSince = 0;
      }

      // --- 捕捉精灵：虚弱的精灵在 9 米内就扔球 ---
      const cap = run.capture;
      if (cfg.getMons && cap?.state === 'weakened' && now - state.lastThrow > 1000) {
        try { if (cap.canThrow()) { state.lastThrow = now; cap.throwBall(); log('扔精灵球捕捉'); } } catch {}
      }
      if (cfg.getMons && run.allies?.state === 'down' && !teamFull(run) && now - state.lastThrow > 1000) { // 队伍满了就不扔 // 打倒的头目：扔友友球收为队友
        try { if (run.allies.canThrow()) { state.lastThrow = now; run.allies.throwBall(); log('扔友友球'); } } catch {}
      }

      // --- 自动互动（E）：站到想要的东西旁边就用 ---
      const ia = run.interactables, near = ia?.nearest;     // nearest = 当前能按 E 的那个
      const busyForced = state.target === 'boss' || state.target === 'shrine' || state.target === 'portal'; // 正赶去召唤首领 / 进传送门
      if (near && !NEEDS_STAY.has(near.kind) && !WALK_ONLY.has(near.kind) && !(busyForced && NPC_KINDS.has(near.kind)) && objectWeight(run, near) > 0 && now - state.lastUse > 800) {
        state.lastUse = now;
        state.visited.set(near, now);            // 记下来，同一个东西不反复去
        state.session = { kind: near.kind, start: now, acted: false }; // 弹窗处理器要知道是谁打开的、选过没有
        if (near.kind === 'boss' || near.kind === 'shrine') state.escapeFrom = { x: near.x, z: near.z, until: now + 4000 }; // 召唤首领后跑开
        try { ia.interact(near); log('互动：' + cn(near.kind)); } catch {}
      }

      if (!cfg.autoMove) return;                 // 自动走位关闭 → 不接管移动
      if (input.stickX || input.stickY) return;  // 手柄/触屏摇杆在用 → 让给玩家

      // --- 自动闪避（Shift 滑铲）：被贴身包围时 ---
      const nearBoss = info.bossD != null && info.bossD < 7;            // 首领贴近了
      const dodgeCd = info.fleeing || nearBoss || info.escaping ? 1200 : 2000;  // 逃跑 / 首领贴近 / 召唤后跑开时滑铲更频繁
      if (cfg.autoDodge && run.player.grounded && (nearBoss || info.escaping || (info.fleeing ? info.close >= 1 : info.close >= 3 || info.danger > 4)) && now - state.lastDodge > dodgeCd) {
        state.lastDodge = now;
        input.pressed.add('ShiftLeft');          // 等同于按一下左 Shift，游戏在同一帧稍后读取
      }

      // --- 看门狗：自动走位开着，却在 watchMin 分钟里一直没离开 3 米范围 → 真卡死了，重开这一局 ---
      const wp = run.player.pos;
      if (!state.wdAt || Math.hypot(wp.x - state.wdX, wp.z - state.wdZ) > 3) { state.wdX = wp.x; state.wdZ = wp.z; state.wdAt = now; }
      else if (cfg.watchdog && now - state.wdAt > cfg.watchMin * 60000) { state.wdAt = now; restartRun(run, `${cfg.watchMin} 分钟没移动`); return; }

      // --- 自动跳跃 + 防卡墙 ---
      let moveDir = dir;
      const pl = run.player, pos = pl.pos;
      if (now - state.stuckAt > 500) {           // 每 0.5 秒看一次走了多远
        const moved = Math.hypot(pos.x - state.stuckX, pos.z - state.stuckZ);
        state.stuckFor = dir && moved < 0.4 ? state.stuckFor + 0.5 : 0; // 想走却几乎没动 → 卡住了
        state.stuckX = pos.x; state.stuckZ = pos.z; state.stuckAt = now;
        const limE = run.terrain?.walkLim || 1e9;
        const atEdge = Math.abs(pos.x) > 0.88 * limE || Math.abs(pos.z) > 0.88 * limE;   // 在地图边上
        if (atEdge && state.stuckFor >= 1 && dir) {  // 贴边卡住 1 秒：突围
          const b = breakoutDir(run);
          state.sidestep = { x: b[0], z: b[1], until: now + 2500 };
          state.stuckFor = 0; log('贴边被困，突围');
          if (cfg.autoDodge && pl.grounded && now - state.lastDodge > 800) { state.lastDodge = now; input.pressed.add('ShiftLeft'); } // 滑铲冲出去
        } else if (state.stuckFor >= 2 && dir) { // 不在边上、卡了 2 秒还没跳过去：往左或右绕 1.2 秒
          const s = Math.random() < 0.5 ? 1 : -1;
          state.sidestep = { x: -dir[1] * s, z: dir[0] * s, until: now + 1200 };
          state.stuckFor = 0; log('卡墙，绕路');
        }
      }
      if (state.sidestep && now < state.sidestep.until) moveDir = [state.sidestep.x, state.sidestep.z];
      const stuck = state.stuckFor >= 0.5;
      if (cfg.autoJump && moveDir && (cfg.jumpMode === 'always' || stuck)) {
        if (pl.grounded) input.pressed.add('Space');                                 // 在地上：跳
        else if (stuck && pl.jumpsLeft > 0 && pl.vel?.y < 0) input.pressed.add('Space'); // 卡住且在下落：用二段跳
        if (stuck && !pl.grounded && (pl.floats || pl.types?.includes?.('flying')) && !input.keys.has('Space')) {
          input.keys.add('Space'); state.holdSpace = true;                           // 会飞/浮空的：按住空格滑翔上高台
        }
      }

      if (!moveDir) return;
      dir = moveDir;
      const yaw = run.camYaw || 0;               // 相机水平朝向；移动输入是相对相机的
      // 游戏里：前 = (-sin yaw, -cos yaw)，右 = (cos yaw, -sin yaw)
      const fwd = dir[0] * -Math.sin(yaw) + dir[1] * -Math.cos(yaw);
      const right = dir[0] * Math.cos(yaw) + dir[1] * -Math.sin(yaw);
      input.stickX = right; input.stickY = fwd;  // 写入虚拟摇杆；键盘方向键优先于它
    } catch (e) { /* 不影响游戏 */ }
  }

  // ==================== 自动选择 ====================
  const FARM = { xpGain: 6, gold: 6, luck: 4, pickupRange: 2 };        // 刷奖励：经验、金钱优先，其次幸运、拾取范围
  const BAD = { difficulty: -30, eliteSpawn: -20, enemyAmount: -30, eliteDamage: -10 }; // 让游戏变难的属性卡：大幅扣分，基本不会选
  const DPS = { damage: 5, attackSpeed: 5, area: 3, projectiles: 4, critChance: 3, critDamage: 2, special: 3, physical: 3, maxHp: 2, armor: 2 }; // 输出和保命属性的加分
  const farmBonus = (stats) => Math.max(0, ...(stats || []).map((s) => FARM[s] || 0));

  // 选卡优先级（farm 模式）：学新技能 3000 > 金钱/经验 1000 > 稀有度每星 100 > 伤害类 50 > 速度 20 > 保命 10；变难的卡 -2000
  const ECO = new Set(['gold', 'xpGain']);
  const DMG = new Set(['damage', 'attackSpeed', 'critChance', 'critDamage', 'area', 'projectiles', 'special', 'physical', 'duration', 'statusChance', 'pierce', 'cooldown']);
  const SPD = new Set(['moveSpeed', 'speed']);
  const LIVE = new Set(['maxHp', 'armor', 'regen', 'shieldMax', 'overheal', 'lifesteal', 'evasion', 'heal']);
  function tier(stats, noBad = false) {          // noBad = true：不扣“变难”的分（祭坛祝福用）                         // 一组属性里最好的那一档
    let t = 0;
    for (const st of stats || []) t = Math.max(t, ECO.has(st) ? 1000 : DMG.has(st) ? 50 : SPD.has(st) ? 20 : LIVE.has(st) ? 10 : st === 'luck' || st === 'pickupRange' ? 5 : 0);
    if (!noBad && (stats || []).some((st) => BAD[st])) t -= 2000;
    return t;
  }
  function score(o, stat) {                      // 升级卡打分；stat = 属性卡加的属性
    const r = (o.rarity ?? 0);
    const move = o.kind === 'newMove' || o.kind === 'upMove';
    const isStat = o.kind === 'newVit' || o.kind === 'upVit';
    if (cfg.prefer === 'farm') {                 // 刷奖励（也要打得过）：输出 > 稀有度 > 经验/金钱
      const pl = state.run?.player;
      const freeSlot = pl ? pl.moves.filter((m, i) => i < (pl.moveSlots ?? pl.moves.length) && !m).length > 0 : true; // 还有空的招式槽
      let s = r * 100 + tier([stat]);            // 金钱/经验 > 稀有度 > 伤害 > 速度 > 保命
      if (o.kind === 'newMove') s += freeSlot ? 3000 : 0;        // 学新技能：最优先（有空招式槽时），压过金钱/经验
      if (o.kind === 'upMove') s += 50;
      return s;
    }
    if (cfg.prefer === 'moves') return (move ? 100 : 0) + r * 10 + (o.kind === 'upMove' ? 5 : 0);
    if (cfg.prefer === 'stats') return (isStat ? 100 : 0) + r * 10 + farmBonus([stat]);
    return r * 10 + (o.kind === 'upMove' ? 3 : 0) + (o.kind === 'newMove' ? 2 : 0);
  }

  function clickCard(selector, index, tries = 20) { // 点击弹窗里的第 index 张卡；还没渲染出来就重试
    const cards = document.querySelectorAll(selector);
    if (cards[index]) { cards[index].click(); return; }
    if (tries > 0) setTimeout(() => clickCard(selector, index, tries - 1), 100);
  }
  const pickBest = (arr, f) => { let b = 0, bs = -Infinity; arr.forEach((x, i) => { const s = f(x, i); if (s > bs) { bs = s; b = i; } }); return b; };

  // ---- 方案（游戏里的“配置计划”）：方案里的招式 / 维生素 / 道具最优先 ----
  // 和游戏自己判断“这张卡在你的方案里”的规则一样：run.planSnap = { moves, vits, items }
  function getPlan(run) {
    try { if (!run.planSnap && typeof run.snapPlan === 'function') run.snapPlan(); } catch {}
    return run.planSnap || null;
  }
  function inPlan(run, o) {                      // 升级卡是不是在方案里
    const plan = getPlan(run);
    if (!plan || !cfg.usePlan) return false;
    if (o.kind === 'newVit' || o.kind === 'upVit') return !!plan.vits?.includes(o.vit);
    const id = o.kind === 'newMove' ? o.id : run.player?.moves?.[o.slot]?.def?.id;
    if (o.kind === 'newMove' && run.favs?.some?.((f) => f.id === o.id)) return true;     // 收藏的招式也算
    return id != null && !!plan.moves?.includes(id);
  }
  const itemInPlan = (run, id) => cfg.usePlan && !!getPlan(run)?.items?.includes(id); // 道具是不是在方案里

  // 垃圾卡：普通稀有度、加的属性对刷奖励没用的属性卡（招式卡永远不算垃圾）
  const isJunk = (o, stat, run) => (o.kind === 'newVit' || o.kind === 'upVit') && (o.rarity ?? 0) === 0 && farmBonus([stat]) === 0 && !(run && inPlan(run, o)); // 方案里的卡永远不算垃圾
  const seenOffers = new WeakMap();              // 每局：卡的 key → 出现过几次

  function levelUp(run, offers, stats, cb) {     // 升级界面；cb = 游戏的选择回调，能“重抽 / 放逐”
    try {
      const [ok] = checkAllowed(run);            // 排名检测
      if (!ok || !cfg.autoPick || !offers?.length) return;
      if (!seenOffers.has(run)) seenOffers.set(run, new Map());
      const seen = seenOffers.get(run);
      offers.forEach((o) => o.key && seen.set(o.key, (seen.get(o.key) || 0) + 1)); // 记录每张卡出现的次数

      if (typeof cb === 'function') {
        // 放逐：同一张垃圾卡已经出现 3 次以上，而且还有放逐次数（留 cfg.keepBanish 次不用）→ 放逐它，这局不再出现
        const bi = offers.findIndex((o, i) => o.key && isJunk(o, stats?.[i], run) && seen.get(o.key) >= 3);
        if (cfg.autoBanish && bi >= 0 && (run.banishes || 0) > cfg.keepBanish) {
          log(`放逐第 ${bi + 1} 张（总是出现的垃圾卡）`);
          setTimeout(() => cb(offers[bi], 'banish'), 400);   // 游戏会马上给一组新卡，这个函数会被再调用一次
          return;
        }
        // 重抽：三张全是垃圾卡，而且还有重抽次数 → 换一批
        if (cfg.autoReroll && (run.rerolls || 0) > cfg.keepReroll && offers.every((o, i) => isJunk(o, stats?.[i], run))) {
          log('三张都不好，重抽');
          setTimeout(() => cb(null, 'reroll'), 400);
          return;
        }
      }
      const best = pickBest(offers, (o, i) => score(o, stats?.[i]) + (inPlan(run, o) ? 5000 : 0)); // 方案里的卡最优先
      log(`升级选第 ${best + 1} 张：` + offers.map((o, i) => `${o.kind}${o.rarity ? '★' + o.rarity : ''}${stats?.[i] ? '/' + stats[i] : ''}`).join(' '));
      setTimeout(() => clickCard('.cards .card.offer', best), 400);
    } catch {}
  }

  function itemChoice(run, items, info) {        // 精灵球/道具选择：最稀有的，同稀有度时经验/金钱优先
    try {
      const [ok] = checkAllowed(run);            // 排名检测
      if (!ok || !cfg.autoItem || !items?.length) return;
      const best = info ? pickBest(info, (d, i) => (itemInPlan(run, items[i]) ? 5000 : 0) + (d?.rarity ?? 0) * 100 + tier(d?.stats)) : 0; // 方案里的道具最优先
      log(`道具选第 ${best + 1} 个`);
      setTimeout(() => clickCard('.cards button.card', best), 400);
    } catch {}
  }

  function blessing(run, opts) {                 // 祭坛祝福：选最稀有的
    try {
      const [ok] = checkAllowed(run);            // 排名检测
      if (!ok || !cfg.autoBless || !opts?.length) return;
      const best = pickBest(opts, (o) => (o?.rarity ?? 0) * 100 + tier((o?.mods || []).map((m) => m?.stat ?? m), true)); // 和升级卡同样的优先级，但不排除变难的祝福
      log(`祝福选第 ${best + 1} 个`);
      setTimeout(() => clickCard('.cards button.card', best), 400);
    } catch {}
  }

  // ==================== 其它弹窗：最简单的处理方式 ====================
  // 第 1 步（弹窗出现 2.5 秒后）：选第一个能选的——
  //   商店：第一个买得起的；老虎机：转一次；其它卡片弹窗（遗物、百变怪、多边兽、道场、契约…）：第一张能点的卡。
  //   催眠貘不选（选了会忘掉招式）。
  // 第 2 步（再过 2.5 秒还开着）：点退出按钮（完成 / 离开 / 现在不要）。只关脚本自己互动打开的弹窗，你自己打开的不关。
  function handleModal(run, now) {
    const m = document.querySelector('.modal');  // 游戏所有弹窗都用 .modal 外壳
    if (state.modalEl && state.modalEl !== m && state.modalOurs) state.oursGoneAt = now; // 脚本打开的弹窗刚消失（商店买完会马上换一个新的）
    if (!m || !run || run.state === 'over' || m.classList.contains('sm-modal') || !checkAllowed(run)[0]) { // 排名检测
      state.modalEl = m || null; if (!m) state.modalOurs = false; return;
    }
    if (m.querySelector('.card.offer')) return;  // 升级弹窗交给 levelUp()
    if (m.querySelector('.pz-end')) return;      // 暂停菜单：永远不碰
    const visible = (b) => !b.disabled && b.style.opacity !== '0.45';  // 灰掉的（买不起/已满）不点
    const isShop = !!m.querySelector('.price'), isSlots = !!m.querySelector('.sl-msg');
    // 单件道具（免费球/超级球开出来的）：“拿取”（绿色大按钮）+“出售”。直接拿，绝不出售
    const take = !isSlots && !m.querySelector('.cards') && m.querySelector('.actions button.btn.green.big');
    if (take) {
      if (cfg.autoItem && state.modalEl !== m) { state.modalEl = m; setTimeout(() => { if (take.isConnected) { take.click(); log('拿取道具'); } }, 400); }
      return;
    }
    if (!cfg.autoModal) return;
    if (m.classList.contains('bm-modal')) {      // Bill 融合机
      if (state.billModal === m) return;
      if (state.modalEl !== m) { state.modalEl = m; state.modalSeen = now; return; }
      if (now - state.modalSeen < 1200) return;
      state.billModal = m;
      const rows = [...m.querySelectorAll('.bm-row:not(.off)')];  // 所有“已经可以融合”的组合
      const isMissingNo = () => /missings*no/i.test(m.querySelector('.bm-detail')?.textContent || ''); // 融合结果是 MissingNo. → 不要
      const close = (why) => { [...m.querySelectorAll('button.btn.ghost')].pop()?.click(); log(why); };
      if (!rows.length) { close('融合机：还没有能融合的'); return; }
      const tryRow = (k) => {                    // 一个一个试：选中组合 → 看结果是不是 MissingNo. → 不是就融合
        if (!m.isConnected) return;
        if (k >= rows.length) { state.billSkipSig = state.run ? moveSig(state.run) : null; close('融合机：只能融合出 MissingNo.，不融合'); return; }
        rows[k].click();
        setTimeout(() => {
          m.querySelector('.bm-tab:not([disabled])')?.click();    // 第一个页签 = 融合（不是“合并”）
          setTimeout(() => {
            if (isMissingNo()) { tryRow(k + 1); return; }
            const go = m.querySelector('.bm-go'); if (go && !go.disabled) { go.click(); log('融合招式'); }
          }, 400);
        }, 400);
      };
      tryRow(0);
      return;
    }
    const ses = state.session;                   // 最近一次脚本互动
    if (state.modalEl !== m) {                   // 新弹窗：重新开始计时
      // 算“脚本打开的”：互动后 3 秒内出现，或者紧接着上一个脚本弹窗出现（商店买完重新生成）
      const ours = !!ses && (now - ses.start < 3000 || now - (state.oursGoneAt || 0) < 1500);
      state.modalEl = m; state.modalSeen = now; state.modalStep = 0; state.modalOurs = ours; state.exitTry = 0;
    }
    const ours = state.modalOurs;
    const age = now - state.modalSeen;
    if (state.modalStep === 0 && age > 2500) {
      state.modalStep = 1;
      if (ours && (ses.acted || ses.kind === 'hypno')) return;        // 这次互动已经选过一次 / 催眠貘 → 不再选，等着关
      if (!ours && (isShop || isSlots)) return;                       // 你自己打开的商店、老虎机不碰
      if (ours) ses.acted = true;                                      // 每次互动只买一样 / 只转一次
      if (isSlots) { const spin = m.querySelector('button.btn.green.big'); if (spin) { spin.click(); log('老虎机转一次'); } return; }
      const ok = m.querySelector('.price.ok');                         // 商店：标着“买得起”的价格
      const cards = [...m.querySelectorAll('.cards button.card')].filter(visible);
      const fossil = ours && ses.kind === 'fossil' && cards.length >= 2;              // 化石（翼龙）：选第二个选项
      const card = isShop ? ok?.closest('button.card') : fossil ? cards[1] : cards[0];
      if (card) { card.click(); log(isShop ? '商店买一样' : fossil ? '化石选第二个' : '弹窗选第一个'); }
      return;
    }
    // 还开着、是脚本打开的 → 关掉；每 2 秒试一次（老虎机转动时“离开”点不动），最多试 20 秒
    if (state.modalStep >= 1 && age > 5000 && ours && age < 25000 && now - (state.exitTry || 0) > 2000) {
      state.modalStep = 2; state.exitTry = now;
      const exit = m.querySelector('.shop-exit') ||                    // 商店/催眠貘的“完成”
        [...m.querySelectorAll('button.btn.ghost')].filter((b) => visible(b) && !/₽/.test(b.textContent)).pop(); // “离开 / 现在不要”；带 ₽ 的是“卖掉换钱”，不点
      if (exit) { exit.click(); log('关闭弹窗'); }
    }
  }

  // ==================== 看门狗 ====================
  // 重开这一局：和暂停菜单里点“重新开始”一样（run.ui 就是游戏的 HUD）。60 秒内最多一次。
  function restartRun(run, why) {
    const now = performance.now();
    if (!cfg.watchdog || now - (state.wdLast || 0) < 60000 || !checkAllowed(run)[0]) return; // 排名检测
    state.wdLast = now; state.wdRestarts = (state.wdRestarts || 0) + 1;
    log(`看门狗：${why}，重开这一局`);
    try { // 先尽量关掉挡着的弹窗（带 ₽ 的是“卖掉换钱”，不点）
      const b = document.querySelector('.modal .shop-exit') || [...document.querySelectorAll('.modal .actions button.btn.ghost')].find((x) => !/₽/.test(x.textContent));
      b?.click();
    } catch {}
    setTimeout(() => { try { run.ui?.onRestart?.(); } catch {} }, 500);
  }
  // 弹窗卡住：对局停在某个弹窗（不是你按的暂停菜单）超过 watchMin 分钟 → 重开
  function watchModal(run, now) {
    const m = document.querySelector('.modal');
    const stuckModal = run && run.state !== 'play' && run.state !== 'over' && !run.__pbDisposed && m && !m.querySelector('.pz-end') && !m.classList.contains('sm-modal');
    if (!stuckModal) { state.wdModalSince = 0; return; }
    if (!state.wdModalSince) state.wdModalSince = now;
    else if (now - state.wdModalSince > cfg.watchMin * 60000) { state.wdModalSince = 0; restartRun(run, `弹窗卡了 ${cfg.watchMin} 分钟`); }
  }

  // ==================== 定时检查：卡住的弹窗、自动下一局 ====================
  every(() => {
    try {
      const run = state.run, now = performance.now();
      handleModal(run, now);                     // 其它弹窗：用最简单的方式处理
      if (run) {                                 // 精灵球抓到了没有：这一局“已抓到”的数量变多 = 抓到了
        const n = (run.stats?.captured?.length || 0) + (run.stats?.shinies?.length || 0);
        const cs = run.capture?.state, thrownOk = state.capWas === 'throwing' && cs === 'done'; // 扔出去的球 → done = 抓到（逃跑是从别的状态变 done）
        state.capWas = cs;
        if (state.catchRun !== run) { state.catchRun = run; state.catchCount = n; }   // 新的一局：记下起始数量
        else if (n > state.catchCount || thrownOk) {   // 已经在联盟里的宝可梦再抓到不会记数，所以两种判断都用
          state.catchCount = n; state.caughtN = (state.caughtN || 0) + 1; log('抓到了！');
          if (cfg.restartOnCatch && !state.catchAt) state.catchAt = now;             // 5 秒后自动重开
        }
      }
      if (state.catchAt && now - state.catchAt > 5000) {                // 抓到 5 秒后：重开这一局
        state.catchAt = 0;
        if (cfg.restartOnCatch && run && checkAllowed(run)[0]) {       // 排名检测
          log('抓到宝可梦，自动重开这一局'); state.catchRestarts = (state.catchRestarts || 0) + 1;
          try { const b = document.querySelector('.modal .shop-exit') || [...document.querySelectorAll('.modal .actions button.btn.ghost')].find((x) => !/₽/.test(x.textContent)); b?.click(); } catch {}
          setTimeout(() => { try { run.ui?.onRestart?.(); } catch {} }, 500);
        }
      }
      watchModal(run, now);                      // 看门狗：弹窗卡太久就重开

      // 离线确认框：自动下一局刚点完、服务器连不上时——选“离线游玩（不计）”
      if (now - state.restartAt < 20000) {
        const btns = document.querySelectorAll('.season-modal .cl-mbtns button'); // 顺序：取消 / 离线游玩 / 重试
        if (btns.length === 3) { btns[1].click(); log('离线游玩'); state.restartAt = 0; }
      }
      if (!cfg.autoRestart || !run || run.state !== 'over' || state.restartTimer) return;
      if (!state.runAllowed) return;             // 刚结束的这局不允许（排名局等）→ 不自动开下一局
      const again = document.querySelector('.sm-modal button.btn.green.big'); // 结算界面的“再来一局”
      if (!again) return;
      if (cfg.maxRuns > 0 && state.runsDone >= cfg.maxRuns) { cfg.autoRestart = false; save(); log('已达局数上限，停止'); return; }
      state.runsDone++;
      state.totalKills += run.stats?.kills || 0;
      log(`第 ${state.runsDone} 局结束，${cfg.restartDelay} 秒后开始下一局`);
      state.restartTimer = setTimeout(() => {
        state.restartTimer = null;
        const btn = document.querySelector('.sm-modal button.btn.green.big');
        if (cfg.autoRestart && btn) { state.restartAt = performance.now(); state.run = null; btn.click(); }
      }, cfg.restartDelay * 1000);
    } catch {}
  }, 500);

  // ==================== 面板 UI ====================
  const TOGGLES = [                              // [分区, [[设置名, 显示文字, 快捷键], …]]
    ['移动', [['autoMove', '自动走位 + 收集', 'F8'], ['autoDodge', '被包围时滑铲'], ['autoJump', '自动跳跃（防卡墙）', 'F6']]],
    ['优先收集', [['getMeta', '局外资源（Bonk、线索）'], ['getMons', '捕捉虚弱的精灵'], ['freeCage', '解救笼中精灵（花钱）'],
      ['openFree', '免费精灵球'], ['getLoot', '金币 / 道具 / 经验'], ['openPaid', '付费精灵球（钱够时）']]],
    ['互动', [['useMisc', 'Magnemite / 浆果 / 岩石 / 祭坛'], ['risky', '诅咒/耿鬼/钻角犀兽（变难换奖励）'],
      ['useNpc', '商店/老虎机/百变怪/道场等（选第一个）'], ['bossAt3', '剩 3 分钟召唤首领'], ['portal', '有传送门就进']]],
    ['战斗', [['fight', '打怪升级优先（靠近绕着打）'], ['autoUlt', '自动终极技 (R)，怪多再放'], ['ultDive', '大招好了冲进怪群放，放完跑开'], ['clearMob', '怪多时优先清怪（外圈绕打）'], ['hunt', '主动击杀：捕捉目标/闪光/宝藏/精英/首领']]],
    ['保命', [['flee', '残血时逃跑 + 找回血']]],
    ['选择', [['autoPick', '自动选升级卡', 'F9'], ['usePlan', '方案里的卡/道具最优先'], ['autoReroll', '三张都是垃圾卡时重抽'], ['autoBanish', '总出现的垃圾卡放逐'], ['autoItem', '精灵球里的东西自动选'], ['autoBless', '祝福自动选'], ['autoModal', '其它弹窗自动选/关闭']]],
    ['刷局', [['autoRestart', '结束后自动下一局', 'F10'], ['watchdog', '看门狗：卡死时自动重开'], ['restartOnCatch', '精灵球抓到宝可梦后自动重开']]],
  ];
  const KIND_CN = { candy: '神奇糖果', chestkey: '宝箱钥匙', coin: '金币', xp: '经验', heal: '回血', magnet: '磁铁', bomb: '炸弹', repel: '喷雾',
    bonk: 'Bonk', freechest: '超级球', chest: '精灵球', cage: '笼中精灵', berry: '浆果', rock: '岩石', snorlax: '卡比兽', altar: '祭坛',
    challenge: '挑战祭坛', boss: '召唤首领', shrine: '召唤首领', portal: '传送门', cursed: '诅咒祭坛', cursedchest: '诅咒球', greed: '耿鬼祭坛', rhydon: '钻角犀兽',
    meowth: '喵喵商店', slots: '老虎机', ditto: '百变怪', hypno: '催眠貘', porygon: '多边兽', dojo: '道场', nest: '巢穴', bill: 'Bill', fossil: '化石' };
  const cn = (k) => KIND_CN[k] || (k?.startsWith('tm-') ? '招式学习器' : k);

  function panel() {
    if (document.getElementById('pb-bot')) return;
    const el = document.createElement('div');
    el.id = 'pb-bot';
    // 样式：深色半透明卡片，分区标题，开关做成小拨杆；.on 绿 = 运行，.off 红 = 暂停
    el.innerHTML = `
      <style>
        #pb-bot{position:fixed;top:12px;right:12px;z-index:2147483647;width:260px;max-height:calc(100vh - 24px);overflow:auto;
          background:rgba(18,20,28,.92);color:#e8eaf2;font:12.5px/1.45 system-ui,"Microsoft YaHei",sans-serif;border-radius:10px;
          box-shadow:0 6px 24px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08);user-select:none}
        #pb-bot .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:move;background:rgba(255,255,255,.04);border-radius:10px 10px 0 0}
        #pb-bot .hd b{flex:1;font-size:13px}
        #pb-bot .hd button{background:none;border:0;color:#aab;font-size:15px;cursor:pointer;padding:0 4px}
        #pb-bot .st{margin:8px 10px 2px;padding:4px 8px;border-radius:6px;font-weight:600;text-align:center}
        #pb-bot .on{background:#1d5e36;color:#c9f7d8}#pb-bot .off{background:#6b2525;color:#ffd6d6}
        #pb-bot .tg{margin:2px 10px 4px;font-size:11.5px;color:#9aa1b8;text-align:center;min-height:16px}
        #pb-bot .sec{padding:4px 10px 6px;border-top:1px solid rgba(255,255,255,.06)}
        #pb-bot .sec h4{margin:4px 0 2px;font-size:11px;letter-spacing:.08em;color:#8f96b0;font-weight:600}
        #pb-bot .row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;cursor:pointer}
        #pb-bot .row kbd{font:10px monospace;color:#8f96b0;border:1px solid #444a5e;border-radius:3px;padding:0 3px;margin-left:4px}
        #pb-bot .sw{position:relative;width:30px;height:16px;border-radius:8px;background:#3a3f52;flex:none;transition:background .15s}
        #pb-bot .sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#cfd3e0;transition:left .15s}
        #pb-bot .sw.y{background:#2f9e5a}#pb-bot .sw.y::after{left:16px;background:#fff}
        #pb-bot select,#pb-bot input[type=number]{background:#262a39;color:#e8eaf2;border:1px solid #444a5e;border-radius:4px;padding:1px 4px;font:inherit}
        #pb-bot input[type=number]{width:52px}
        #pb-bot .stats{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}
        #pb-bot .stats span{color:#8f96b0}#pb-bot .stats b{float:right;color:#fff;font-weight:600}
        #pb-bot .log{font-size:11px;color:#9aa1b8;white-space:pre-line;min-height:14px}
        #pb-bot.min .body{display:none}
      </style>
      <div class="hd"><b>PokéBonk 辅助</b><button id="pb-min" title="折叠 (F7)">–</button></div>
      <div class="st off" id="pb-st">等待对局开始…</div>
      <div class="tg" id="pb-tg"></div>
      <div class="body">
        <div id="pb-toggles"></div>
        <div class="sec"><h4>策略</h4>
          <label class="row">终极技：10 米内至少几只怪 <input type="number" id="pb-ult" min="1" max="60"></label>
          <label class="row">清怪：15 米内至少几只 <input type="number" id="pb-clr" min="5" max="200"></label>
          <label class="row">互动点倍率（1-5）<input type="number" id="pb-iab" min="1" max="5"></label>
          <label class="row">打怪优先级（0-10）<input type="number" id="pb-fw" min="0" max="10"></label>
          <label class="row">经验球优先级（0-10）<input type="number" id="pb-xpw" min="0" max="10"></label>
          <label class="row">血量低于 % 开始逃跑 <input type="number" id="pb-flee" min="5" max="90"></label>
          <label class="row">重抽留几次不用 <input type="number" id="pb-kr" min="0" max="20"></label>
          <label class="row">放逐留几次不用 <input type="number" id="pb-kb" min="0" max="20"></label>
          <label class="row">看门狗：卡住几分钟重开 <input type="number" id="pb-wd" min="1" max="30"></label>
          <label class="row">跳跃方式 <select id="pb-jump">
            <option value="always">一直跳</option><option value="stuck">只在卡住时跳</option></select></label>
          <label class="row">升级卡优先 <select id="pb-pref">
            <option value="farm">刷奖励（稀有+经验/金钱）</option><option value="rarity">只看稀有度</option>
            <option value="moves">招式优先</option><option value="stats">属性优先</option></select></label>
          <label class="row">下一局前等待（秒）<input type="number" id="pb-delay" min="0" max="60"></label>
          <label class="row">最多刷几局（0=不限）<input type="number" id="pb-max" min="0" max="999"></label>
        </div>
        <div class="sec"><h4>统计</h4><div class="stats" id="pb-stats"></div></div>
        <div class="sec"><h4>记录</h4><div class="log" id="pb-log"></div></div>
        <div class="sec" style="color:#8f96b0;font-size:11px">WASD/方向键随时手动接管 · 排名局/合作/对战自动暂停</div>
      </div>`;
    document.documentElement.appendChild(el);
    const $ = (id) => el.querySelector('#' + id);

    const sws = {};                              // 设置名 → 拨杆元素
    for (const [title, items] of TOGGLES) {      // 生成各分区的开关
      const sec = document.createElement('div'); sec.className = 'sec';
      sec.innerHTML = `<h4>${title}</h4>`;
      for (const [key, label, hot] of items) {
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<span>${label}${hot ? `<kbd>${hot}</kbd>` : ''}</span><i class="sw"></i>`;
        row.onclick = () => { cfg[key] = !cfg[key]; save(); sync(); };  // 点一下切换并保存
        sws[key] = row.querySelector('.sw');
        sec.appendChild(row);
      }
      $('pb-toggles').appendChild(sec);
    }
    const pref = $('pb-pref'), delay = $('pb-delay'), max = $('pb-max'), jump = $('pb-jump');
    jump.onchange = () => { cfg.jumpMode = jump.value; save(); };   // 切换跳跃方式
    const ult = $('pb-ult');
    ult.onchange = () => { cfg.ultMin = Math.max(1, Math.min(60, Math.floor(+ult.value || 12))); save(); sync(); }; // 终极技门槛
    const num = (id, key, lo, hi, def) => { const e = $(id); e.onchange = () => { const v = Math.floor(+e.value); cfg[key] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; save(); sync(); }; return e; };
    const fleeIn = num('pb-flee', 'fleeHp', 5, 90, 30), krIn = num('pb-kr', 'keepReroll', 0, 20, 0),
      kbIn = num('pb-kb', 'keepBanish', 0, 20, 1), wdIn = num('pb-wd', 'watchMin', 1, 30, 2), xpIn = num('pb-xpw', 'xpW', 0, 10, 2), fwIn = num('pb-fw', 'fightW', 0, 10, 3), clrIn = num('pb-clr', 'clearMin', 5, 200, 30), iabIn = num('pb-iab', 'iaBoost', 1, 5, 2);
    fwIn.addEventListener('change', () => { cfg.fightWSet = true; save(); });
    xpIn.addEventListener('change', () => { cfg.xpWSet = true; save(); });   // 记住是自己改过的 // 数字设置：超出范围自动夹回去
    function sync() {                            // 把设置同步到界面
      for (const k in sws) sws[k].classList.toggle('y', !!cfg[k]);
      pref.value = cfg.prefer; delay.value = cfg.restartDelay; max.value = cfg.maxRuns; jump.value = cfg.jumpMode; ult.value = cfg.ultMin;
      fleeIn.value = cfg.fleeHp; krIn.value = cfg.keepReroll; kbIn.value = cfg.keepBanish; wdIn.value = cfg.watchMin; xpIn.value = cfg.xpW; fwIn.value = cfg.fightW; clrIn.value = cfg.clearMin; iabIn.value = cfg.iaBoost;
      el.classList.toggle('min', cfg.collapsed);
      $('pb-min').textContent = cfg.collapsed ? '+' : '–';
    }
    sync();
    pref.onchange = () => { cfg.prefer = pref.value; save(); };
    delay.onchange = () => { cfg.restartDelay = Math.max(0, Math.min(60, +delay.value || 0)); save(); sync(); };
    max.onchange = () => { cfg.maxRuns = Math.max(0, Math.floor(+max.value || 0)); save(); sync(); };
    $('pb-min').onclick = () => { cfg.collapsed = !cfg.collapsed; save(); sync(); };

    // 拖动：按住标题栏移动面板，位置会记住
    const hd = el.querySelector('.hd');
    const place = () => {
      if (cfg.x != null) {                       // 记住的位置超出窗口（比如换了窗口大小）→ 拉回屏幕内，至少露出标题栏
        cfg.x = Math.max(0, Math.min(innerWidth - 120, cfg.x)); cfg.y = Math.max(0, Math.min(innerHeight - 300, cfg.y));
        el.style.left = cfg.x + 'px'; el.style.top = cfg.y + 'px'; el.style.right = 'auto';
      }
      const top = el.getBoundingClientRect().top;  // 面板太长时在窗口内滚动，不会伸到屏幕外
      el.style.maxHeight = Math.max(120, innerHeight - top - 8) + 'px'; el.style.overflowY = 'auto';
    };
    place();
    addEventListener('resize', place);           // 窗口大小变了也重新摆
    hd.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = (ev) => { cfg.x = Math.max(0, Math.min(innerWidth - 60, ev.clientX - ox)); cfg.y = Math.max(0, Math.min(innerHeight - 30, ev.clientY - oy)); place(); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); save(); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });

    // 面板上的点击/按键不传给游戏
    for (const ev of ['mousedown', 'mouseup', 'click', 'keydown', 'pointerdown', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());

    // 快捷键（捕获阶段，比游戏先收到）
    const onKey = (e) => {
      const map = { F6: 'autoJump', F7: 'collapsed', F8: 'autoMove', F9: 'autoPick', F10: 'autoRestart' };
      const k = map[e.code];
      if (!k) return;
      cfg[k] = !cfg[k]; save(); sync(); e.preventDefault();
      if (k === 'autoRestart' && !cfg.autoRestart && state.restartTimer) { clearTimeout(state.restartTimer); state.restartTimer = null; } // 关掉时取消正在等待的下一局
    };
    addEventListener('keydown', onKey, true); keyHandlers.push(onKey);

    // 每 0.3 秒刷新状态栏、当前目标、统计和记录
    every(() => {
      const st = $('pb-st'), run = state.run;
      // 游戏开着弹窗（选道具、升级、商店）或暂停时不会调用每帧函数，所以不能只看“最近有没有帧”：
      // 对局对象还在、没结束，并且（1.5 秒内有帧 / 不是“进行中”状态 / 屏幕上有弹窗）都算在对局中
      const fresh = performance.now() - state.lastFrame < 1500;
      const inRun = !!run && run.state !== 'over' && !run.__pbDisposed && (fresh || run.state !== 'play' || !!document.querySelector('.modal'));
      const busy = inRun && !fresh;              // 对局中但游戏停着（选择中 / 暂停）
      st.textContent = state.restartTimer ? '准备下一局…' : inRun ? state.reason + (busy ? '（选择中）' : '') : '不在对局中';
      st.className = 'st ' + ((inRun && state.allowed) || state.restartTimer ? 'on' : 'off');
      $('pb-tg').textContent = inRun && state.allowed && state.target ? '正在去拿：' + cn(state.target) : '';
      const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      const left = run && !run.endless && !run.tower && !run.expedition ? fmt(Math.max(0, 600 - (run.stageTime || 0))) : '-';
      const cell = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
      $('pb-stats').innerHTML =
        cell('本局时间', run ? fmt(run.time || 0) : '-') + cell('区域剩余', left) +
        cell('等级', run?.player?.level ?? '-') + cell('金钱', run ? Math.floor(run.gold || 0) : '-') +
        cell('击杀', run?.stats?.kills ?? '-') + cell('已刷局数', state.runsDone) + cell('累计击杀', state.totalKills);
      $('pb-log').textContent = state.log.join('\n');
    }, 300);
  }

  function stop() {                              // 停掉这个版本：清定时器、热键、面板（热更新用）
    timers.forEach(clearInterval); keyHandlers.forEach((h) => removeEventListener('keydown', h, true));
    if (state.restartTimer) clearTimeout(state.restartTimer);
    document.getElementById('pb-bot')?.remove();
  }
  window.__pbBot = { frame, levelUp, itemChoice, blessing, cfg, state, stop }; // 给启动器的条件断点调用
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', panel); else panel(); // 页面加载完再画面板
})();
