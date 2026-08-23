/* ============================================
 * 多米工作台 v1.2 - 主逻辑
 * 数据存储: LocalStorage
 * 修改记录: Minecraft风格 + 奖励密码确认 + 临时日程日期 + 自定义计时器 + 强制横屏 + HTML安全 + 数据迁移
 * ============================================ */

/* ====== 数据层 ====== */
const STORE_KEY = 'duomi_workbench_v2';
const DATA_VERSION = 3;

const DEFAULT_DATA = {
  dataVersion: DATA_VERSION,
  settings: {
    mode: 'holiday',        // 'holiday' | 'school'
    parentPassword: '1234', // 默认密码
    isParentMode: false,
    soundEnabled: true,     // 声音开关
    speechEnabled: true,     // 语音播报开关（V1.2新增：不识字小朋友用）
    homeworkSubjects: ['语文','数学','英语'],  // 作业科目列表（家长管理）
    dailySubjects: {}       // { '2026-08-09': ['语文','数学'] } 每日作业科目
  },
  schedule: {
    holiday: [
      { id: 'h1', day: 'weekday', startTime: '08:00', endTime: '10:00', title: '学而思数学', alarm: true },
      { id: 'h2', day: '1', startTime: '18:30', endTime: '19:30', title: '英语外教课', alarm: true },
      { id: 'h3', day: '3', startTime: '19:00', endTime: '20:30', title: '网球课', alarm: true },
      { id: 'h4', day: '2', startTime: '17:35', endTime: '18:35', title: '新加坡数学网课', alarm: true },
      { id: 'h5', day: '5', startTime: '17:35', endTime: '18:35', title: '新加坡数学网课', alarm: true },
      { id: 'h6', day: '2', startTime: '15:00', endTime: '16:30', title: '游泳课', alarm: true },
      { id: 'h7', day: '4', startTime: '15:00', endTime: '16:30', title: '游泳课', alarm: true },
      { id: 'h8', day: '0', startTime: '15:00', endTime: '16:30', title: '游泳课', alarm: true }
    ],
    school: [],
    custom: []  // 临时日程: { id, date, startTime, endTime, title, alarm }
  },
  tasks: [
    { id: 't1', name: '写作业', icon: '📝', stars: 2, type: 'homework' },
    { id: 't2', name: '阅读', icon: '📚', stars: 2 },
    { id: 't3', name: '运动', icon: '⚽', stars: 2 },
    { id: 't4', name: '钢琴', icon: '🎹', stars: 2 },
    { id: 't5', name: '练字', icon: '✍️', stars: 2 }
  ],
  rewards: [
    { id: 'r1', name: '看动画片30分钟', icon: '📺', cost: 5 },
    { id: 'r2', name: '小零食一份', icon: '🍪', cost: 3 },
    { id: 'r3', name: '去公园玩', icon: '🎠', cost: 10 },
    { id: 'r4', name: '买一个小玩具', icon: '🧸', cost: 20 }
  ],
  starLog: {
    total: 0,
    totalEarned: 0,
    history: []  // { date, time, taskId, taskName, taskIcon, stars }
  },
  checkins: {},   // { '2026-08-08': { 't1': true, 't2': true } }
  redeemed: [],   // { id, rewardId, rewardName, cost, date, time }
  wordCards: [],
  nce1Lesson: 0,
  memos: [],  // { id, text, date }
  mathPractice: {
    lastDate: '',      // '2026-08-09'
    completedCount: 0, // 当天已完成题数
    dailyQuota: 10,    // 每天题数
    bestScore: 0,      // 历史最高正确数
    totalDone: 0,      // 总完成题数
    difficulty: 'easy', // 'easy' | 'medium' | 'hard'
    savedState: null    // 临时保存的答题进度
  },
  funPark: {
    status: 'home',          // 'home' | 'traveling' | 'returned'
    tripStart: null,         // ISO timestamp 旅行开始时间
    tripEnd: null,           // ISO timestamp 旅行结束时间
    destination: null,       // 当前目的地 id
    packedItems: [],         // 当前旅行的行李 [{id, name, icon}]
    postcards: [],           // 明信片收藏 [{id, destId, destName, destIcon, emoji, text, date}]
    souvenirs: [],           // 纪念品收藏 [{id, destId, destName, destIcon, emoji, name, date}]
    lastReturn: null,        // 上次归来的结果 {destName, destIcon, postcard, souvenirs, gems}
    totalTrips: 0            // 总旅行次数
  }
};

let DB = {};

/* ====== HTML 转义函数（P1: 防注入） ====== */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ====== 数据加载（含迁移） ====== */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      DB = JSON.parse(raw);
      // 数据版本迁移
      migrateData(DB);
      // 合并新字段（兼容旧数据）
      DB = deepMerge(structuredClone(DEFAULT_DATA), DB);
    } else {
      // 尝试迁移旧版本数据
      const oldRaw = localStorage.getItem('duomi_workbench_v1');
      if (oldRaw) {
        DB = JSON.parse(oldRaw);
        migrateData(DB);
        DB = deepMerge(structuredClone(DEFAULT_DATA), DB);
        DB.dataVersion = DATA_VERSION;
      } else {
        DB = structuredClone(DEFAULT_DATA);
      }
      saveDB();
    }
  } catch (e) {
    console.error('数据加载失败:', e);
    DB = structuredClone(DEFAULT_DATA);
    try { saveDB(); } catch (e2) {
      toast('数据存储异常，请检查浏览器设置');
    }
  }
}

/* ====== 数据迁移 ====== */
function migrateData(data) {
  if (!data.dataVersion || data.dataVersion < 2) {
    // v1 -> v2: 临时日程增加 date 字段
    if (data.schedule && Array.isArray(data.schedule.custom)) {
      data.schedule.custom = data.schedule.custom.map(c => {
        if (!c.date) {
          c.date = '';
          c._migrated = true;
        }
        return c;
      });
    }
    data.dataVersion = 2;
  }
  // v2 -> v3: 打卡统一宝石数、写作业分科目、宠物累计进化
  if (!data.dataVersion || data.dataVersion < 3) {
    if (Array.isArray(data.tasks)) {
      data.tasks.forEach(t => {
        // 统一宝石数为 2
        t.stars = 2;
        // 写作业标记为 homework 类型
        if (t.name === '写作业' && !t.type) t.type = 'homework';
      });
    }
    // 添加作业科目设置
    if (!data.settings) data.settings = {};
    if (!data.settings.homeworkSubjects) data.settings.homeworkSubjects = ['语文','数学','英语'];
    if (!data.settings.dailySubjects) data.settings.dailySubjects = {};
    data.dataVersion = 3;
  }
}

function deepMerge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/* ====== 数据保存（P0-4: 返回成功/失败） ====== */
function saveDB() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  } catch (e) {
    console.error('保存失败:', e);
    if (e.name === 'QuotaExceededError') {
      toast('存储空间不足，请清理浏览器数据');
    } else {
      toast('数据保存失败，请检查浏览器设置');
    }
    return false;
  }
  // 同步配置到 Supabase（防抖）
  if (typeof syncConfigDebounced === 'function') syncConfigDebounced();
  return true;
}

/* ====== 权限校验（P1: 写操作二次校验） ====== */
function requireParent() {
  if (!DB.settings.isParentMode) {
    toast('请先进入家长模式');
    return false;
  }
  return true;
}

/* ====== 工具函数 ====== */
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayDayNum() { return new Date().getDay(); }

function isWeekday() {
  const d = todayDayNum();
  return d >= 1 && d <= 5;
}

function formatDate() {
  const d = new Date();
  const days = ['周日','周一','周二','周三','周四','周五','周六'];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${days[d.getDay()]}`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ====== 绿宝石飘落动画 ====== */
function starRain(count) {
  const container = document.getElementById('starRain');
  const gems = ['💎', '💠', '🔶', '🔷'];
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const star = document.createElement('div');
      star.className = 'falling-star';
      star.textContent = gems[Math.floor(Math.random() * gems.length)];
      star.style.left = Math.random() * 100 + '%';
      star.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      star.style.fontSize = (24 + Math.random() * 24) + 'px';
      container.appendChild(star);
      setTimeout(() => star.remove(), 3500);
    }, i * 80);
  }
}

/* ====== 提示音（P2: 声音开关） ====== */
let audioCtx = null;
function playChime() {
  if (!DB.settings.soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    // 柔和两音叮咚
    [880, 660].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.5);
    });
  } catch(e) {}
}

/* ====== 语音播报（V1.2新增：不识字小朋友用） ====== */
function speak(text, lang) {
  if (!DB.settings.speechEnabled) return;
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || 'zh-CN';
    u.rate = 0.9;    // 稍慢，适合小朋友
    u.pitch = 1.1;   // 稍高，更亲切
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch(e) {}
}

/* ====== Tab 切换 ====== */
function switchTab(tabName) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  document.querySelector(`.tab-nav-btn[data-tab="${tabName}"]`).classList.add('active');

  // 关闭所有工具面板
  document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('show'));

  // 语音播报Tab名称
  const tabNames = { schedule: '今日日程', tasks: '打卡任务', tools: '学习工具', rewards: '我的奖励', settings: '设置' };
  speak(tabNames[tabName]);

  // 刷新对应页面数据
  if (tabName === 'schedule') renderSchedulePage();
  if (tabName === 'tasks') renderTaskPage();
  if (tabName === 'rewards') renderRewardsPage();
  if (tabName === 'settings') renderSettingsPage();
}

function dayLabel(day) {
  if (day === 'weekday') return '工作日';
  const map = ['周日','周一','周二','周三','周四','周五','周六'];
  return map[parseInt(day)] || day;
}

/* ====== 视图状态 ====== */
let scheduleView = 'today'; // 'today' | 'week'

/* ====== 获取某天课程（P0: 临时日程按日期） ====== */
function getCoursesForDay(dayNum, targetDate) {
  const mode = DB.settings.mode;
  const scheduleList = DB.schedule[mode] || [];
  const customList = DB.schedule.custom || [];
  const weekday = dayNum >= 1 && dayNum <= 5;
  const dateStr = targetDate || todayStr();

  const matched = [];
  scheduleList.forEach(c => {
    if (c.day === 'weekday' && weekday) matched.push(c);
    else if (c.day === String(dayNum)) matched.push(c);
  });
  // 临时日程只匹配对应日期
  customList.forEach(c => {
    if (c.date === dateStr) matched.push(c);
  });
  matched.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return matched;
}

/* ====== 获取本周某天日期 ====== */
function getDateForWeekday(targetDayNum) {
  const today = new Date();
  const todayDay = today.getDay();
  const diff = targetDayNum - todayDay;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
}

/* ====== 渲染：今日日程 ====== */
function renderSchedulePage() {
  document.getElementById('todayDate').textContent = formatDate();
  updateStarDisplay();

  if (scheduleView === 'today') {
    renderTodayView();
  } else {
    renderWeekView();
  }
}

/* ====== 今日视图 ====== */
function renderTodayView() {
  // 今日课程
  const courses = getCoursesForDay(todayDayNum());
  const courseEl = document.getElementById('todayCourseList');
  if (courses.length === 0) {
    courseEl.innerHTML = '<div class="empty-state">今天没有课程 🎉</div>';
  } else {
    courseEl.innerHTML = courses.map(c => `
      <div class="course-item" data-course-title="${esc(c.title)}" data-course-time="${esc(c.startTime)} ${esc(c.endTime)}">
        <div class="course-time">${esc(c.startTime)}<br>${esc(c.endTime)}</div>
        <div class="course-info">
          <div class="course-title">${esc(c.title)}</div>
          <div class="course-type">${c.date ? '临时日程' : esc(dayLabel(c.day))}</div>
        </div>
        <div class="course-alarm">⏰</div>
      </div>
    `).join('');
    // 点击课程项语音播报
    courseEl.querySelectorAll('.course-item').forEach(item => {
      item.addEventListener('click', () => {
        speak(`${item.dataset.courseTitle}，${item.dataset.courseTime}`);
      });
    });
  }

  // 今日待打卡
  const todayCheckins = DB.checkins[todayStr()] || {};
  const tasks = DB.tasks;
  const taskEl = document.getElementById('todayTaskList');
  if (tasks.length === 0) {
    taskEl.innerHTML = '<div class="empty-state">还没有打卡任务</div>';
  } else {
    let todayHtml = '';
    tasks.forEach(t => {
      if (t.type === 'homework') {
        // 写作业 - 显示科目进度
        const subjects = getTodaySubjects();
        const doneCount = subjects.filter(s => todayCheckins['hw_' + s]).length;
        const allDone = subjects.length > 0 && doneCount === subjects.length;
        todayHtml += `
          <div class="today-task-item ${allDone ? 'done' : ''}" data-today-task-name="${esc(t.name)}">
            <div class="today-task-left">
              <span class="today-task-icon">${esc(t.icon)}</span>
              <div>
                <div class="today-task-name">${esc(t.name)} <span class="hw-progress-badge">${doneCount}/${subjects.length}</span></div>
                <div class="today-task-stars">${subjects.map(s => todayCheckins['hw_' + s] ? '✅' : '⬜').join(' ')} ${esc(t.name)}</div>
              </div>
            </div>
            <div class="today-task-check">${allDone ? '✓' : ''}</div>
          </div>
        `;
      } else {
        const done = todayCheckins[t.id];
        todayHtml += `
          <div class="today-task-item ${done ? 'done' : ''}" data-today-task-name="${esc(t.name)}">
            <div class="today-task-left">
              <span class="today-task-icon">${esc(t.icon)}</span>
              <div>
                <div class="today-task-name">${esc(t.name)}</div>
                <div class="today-task-stars">💎 +${esc(t.stars)}</div>
              </div>
            </div>
            <div class="today-task-check">${done ? '✓' : ''}</div>
          </div>
        `;
      }
    });
    taskEl.innerHTML = todayHtml;
    // 语音播报：点击今日任务项
    taskEl.querySelectorAll('.today-task-item').forEach(item => {
      item.addEventListener('click', () => {
        speak(item.dataset.todayTaskName || '');
      });
    });
  }
}

/* ====== 本周视图（P0: 临时日程按日期显示） ====== */
function renderWeekView() {
  const weekEl = document.getElementById('weekSchedule');
  const dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
  const today = todayDayNum();
  let html = '';

  // 周一到周日排列
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  dayOrder.forEach(d => {
    const targetDate = getDateForWeekday(d);
    const courses = getCoursesForDay(d, targetDate);
    const isToday = d === today;
    html += `
      <div class="week-day-card ${isToday ? 'today' : ''}">
        <div class="week-day-header">
          <div class="week-day-name">
            ${dayNames[d]}
            ${isToday ? '<span class="today-tag">今天</span>' : ''}
          </div>
          <span style="font-size:13px;color:var(--text-light)">${courses.length} 门课</span>
        </div>
        <div class="week-course-list">
          ${courses.length === 0
            ? '<div class="week-day-empty">无课程</div>'
            : courses.map(c => `
              <div class="week-course-item">
                <span class="week-course-time">${esc(c.startTime)}-${esc(c.endTime)}</span>
                <span class="week-course-title">${esc(c.title)}</span>
                ${c.date ? '<span style="font-size:11px;color:var(--mc-gold)">临时</span>' : ''}
                <span class="week-course-alarm">⏰</span>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  });

  weekEl.innerHTML = html;
}

/* ====== 获取今日作业科目 ====== */
function getTodaySubjects() {
  const today = todayStr();
  const daily = DB.settings.dailySubjects || {};
  if (daily[today] && daily[today].length > 0) {
    return daily[today];
  }
  return DB.settings.homeworkSubjects || ['语文','数学','英语'];
}

/* ====== 渲染：打卡任务 ====== */
function renderTaskPage() {
  updateStarDisplay();
  const todayCheckins = DB.checkins[todayStr()] || {};
  const taskEl = document.getElementById('taskList');
  if (DB.tasks.length === 0) {
    taskEl.innerHTML = '<div class="empty-state">还没有任务，请家长在设置中添加</div>';
    return;
  }

  let html = '';
  DB.tasks.forEach(t => {
    const done = todayCheckins[t.id];

    if (t.type === 'homework') {
      // 写作业 - 分科目显示
      const subjects = getTodaySubjects();
      const doneCount = subjects.filter(s => todayCheckins['hw_' + s]).length;
      const allDone = subjects.length > 0 && doneCount === subjects.length;
      html += `
        <div class="task-card homework ${allDone ? 'all-done' : ''}" data-task-name="${esc(t.name)}" data-task-stars="${esc(t.stars)}">
          <div class="task-left">
            <span class="task-icon">${esc(t.icon)}</span>
            <div class="task-info">
              <div class="task-name">${esc(t.name)} <span class="hw-progress-badge">${doneCount}/${subjects.length}</span></div>
              <div class="task-stars">每科目 💎 +${esc(t.stars)} 颗绿宝石</div>
            </div>
          </div>
        </div>
        <div class="hw-subjects-row">
          ${subjects.map(subj => {
            const subjKey = 'hw_' + subj;
            const subjDone = todayCheckins[subjKey];
            return `
              <div class="hw-subject-item ${subjDone ? 'done' : ''}" data-subject="${esc(subj)}">
                <span class="hw-subject-name">${esc(subj)}</span>
                <button class="hw-subject-btn ${subjDone ? 'done' : ''}" data-subject="${esc(subj)}" data-task-id="${esc(t.id)}" ${subjDone ? 'disabled' : ''}>
                  ${subjDone ? '✅' : '打卡'}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      html += `
        <div class="task-card ${done ? 'done' : ''}" data-task-name="${esc(t.name)}" data-task-stars="${esc(t.stars)}">
          <div class="task-left">
            <span class="task-icon">${esc(t.icon)}</span>
            <div class="task-info">
              <div class="task-name">${esc(t.name)}</div>
              <div class="task-stars">💎 +${esc(t.stars)} 颗绿宝石</div>
            </div>
          </div>
          <button class="task-checkin-btn ${done ? 'done' : ''}" data-task-id="${esc(t.id)}" ${done ? 'disabled' : ''}>
            ${done ? '✅ 已完成' : '打卡'}
          </button>
        </div>
      `;
    }
  });
  taskEl.innerHTML = html;

  // 绑定普通打卡事件
  document.querySelectorAll('.task-checkin-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      doCheckin(btn.dataset.taskId);
    });
  });

  // 绑定作业科目打卡事件
  document.querySelectorAll('.hw-subject-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      doHomeworkCheckin(btn.dataset.taskId, btn.dataset.subject);
    });
  });

  // 语音播报：点击任务卡片
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const name = card.dataset.taskName;
      const stars = card.dataset.taskStars;
      speak(`${name}，完成可以获得${stars}颗绿宝石`);
    });
  });

  // 语音播报：点击科目项
  document.querySelectorAll('.hw-subject-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      speak(`${item.dataset.subject}作业`);
    });
  });
}

/* ====== 执行打卡 ====== */
function doCheckin(taskId) {
  const today = todayStr();
  if (!DB.checkins[today]) DB.checkins[today] = {};
  if (DB.checkins[today][taskId]) {
    toast('今天已经打过卡啦！');
    return;
  }

  const task = DB.tasks.find(t => t.id === taskId);
  if (!task) return;

  DB.checkins[today][taskId] = true;
  DB.starLog.total += task.stars;
  DB.starLog.totalEarned = (DB.starLog.totalEarned || 0) + task.stars;
  DB.starLog.history.unshift({
    date: today,
    time: new Date().toTimeString().substr(0, 5),
    taskId: task.id,
    taskName: task.name,
    taskIcon: task.icon,
    stars: task.stars
  });

  saveDB();
  // 推送打卡到 Supabase
  if (typeof pushCheckinToSupabase === 'function') pushCheckinToSupabase(task);
  starRain(12);
  playChime();
  speak(`${task.name}，打卡成功！获得${task.stars}颗绿宝石！`);
  toast(`打卡成功！获得 ${task.stars} 💎`);
  renderTaskPage();
  updateStarDisplay();
  checkPetEvolution();
}

/* ====== 执行作业科目打卡 ====== */
function doHomeworkCheckin(taskId, subject) {
  const today = todayStr();
  const subjKey = 'hw_' + subject;
  if (!DB.checkins[today]) DB.checkins[today] = {};
  if (DB.checkins[today][subjKey]) {
    toast('这个科目已经打过卡啦！');
    return;
  }

  const task = DB.tasks.find(t => t.id === taskId);
  if (!task) return;

  DB.checkins[today][subjKey] = true;
  DB.starLog.total += task.stars;
  DB.starLog.totalEarned = (DB.starLog.totalEarned || 0) + task.stars;
  DB.starLog.history.unshift({
    date: today,
    time: new Date().toTimeString().substr(0, 5),
    taskId: subjKey,
    taskName: subject + '作业',
    taskIcon: '📝',
    stars: task.stars
  });

  saveDB();
  if (typeof pushCheckinToSupabase === 'function') pushCheckinToSupabase({ ...task, name: subject + '作业' });
  starRain(12);
  playChime();
  speak(`${subject}作业，打卡成功！获得${task.stars}颗绿宝石！`);
  toast(`${subject}作业打卡成功！获得 ${task.stars} 💎`);
  renderTaskPage();
  updateStarDisplay();
  checkPetEvolution();
}

/* ====== 渲染：我的奖励 ====== */
function renderRewardsPage() {
  updateStarDisplay();
  renderPet();
  document.getElementById('starNumReward').textContent = DB.starLog.total;

  // 奖励池
  const poolEl = document.getElementById('rewardPool');
  if (DB.rewards.length === 0) {
    poolEl.innerHTML = '<div class="empty-state">还没有奖励，请家长在设置中添加</div>';
  } else {
    poolEl.innerHTML = DB.rewards.map(r => {
      const canRedeem = DB.starLog.total >= r.cost;
      return `
        <div class="reward-item" data-reward-name="${esc(r.name)}" data-reward-cost="${esc(r.cost)}">
          <div class="reward-left">
            <span class="reward-icon">${esc(r.icon)}</span>
            <div>
              <div class="reward-name">${esc(r.name)}</div>
              <div class="reward-cost">需要 ${esc(r.cost)} 💎</div>
            </div>
          </div>
          <button class="redeem-btn" data-reward-id="${esc(r.id)}" ${!canRedeem ? 'disabled' : ''}>
            ${canRedeem ? '兑换' : '绿宝石不足'}
          </button>
        </div>
      `;
    }).join('');

    // 点击奖励项语音播报
    poolEl.querySelectorAll('.reward-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // 如果点的是兑换按钮，不播报
        if (e.target.closest('.redeem-btn')) return;
        speak(`${item.dataset.rewardName}，需要${item.dataset.rewardCost}颗绿宝石`);
      });
    });

    document.querySelectorAll('.redeem-btn').forEach(btn => {
      if (!btn.disabled) {
        btn.addEventListener('click', () => openRedeemModal(btn.dataset.rewardId));
      }
    });
  }

  // 打卡历史
  const historyEl = document.getElementById('checkinHistory');
  if (DB.starLog.history.length === 0) {
    historyEl.innerHTML = '<div class="history-empty">还没有打卡记录</div>';
  } else {
    historyEl.innerHTML = DB.starLog.history.slice(0, 30).map(h => `
      <div class="history-item">
        <span class="history-date">${esc(h.date)} ${esc(h.time || '')}</span>
        <span class="history-task">${esc(h.taskIcon)} ${esc(h.taskName)}</span>
        <span class="history-stars">+${esc(h.stars)}💎</span>
      </div>
    `).join('');
  }
}

/* ====== 兑换奖励（P0: 必须经过家长密码确认） ====== */
let pendingRewardId = null;
let isRedeeming = false;  // 防止重复点击

function openRedeemModal(rewardId) {
  if (isRedeeming) return;
  const reward = DB.rewards.find(r => r.id === rewardId);
  if (!reward) return;
  if (DB.starLog.total < reward.cost) {
    toast('绿宝石不足！');
    return;
  }
  pendingRewardId = rewardId;
  document.getElementById('redeemText').textContent = `兑换「${reward.name}」将消耗 ${reward.cost} 颗绿宝石。需要家长确认，请输入家长密码。`;
  document.getElementById('redeemModal').classList.add('show');
}

function confirmRedeem() {
  if (!pendingRewardId || isRedeeming) return;
  isRedeeming = true;
  // 关闭兑换确认弹窗
  document.getElementById('redeemModal').classList.remove('show');
  // 弹出家长密码输入
  openPasswordModal(() => {
    // 密码正确后执行兑换
    const reward = DB.rewards.find(r => r.id === pendingRewardId);
    if (!reward) { isRedeeming = false; return; }
    if (DB.starLog.total < reward.cost) {
      toast('绿宝石不足！');
      isRedeeming = false;
      pendingRewardId = null;
      return;
    }
    // 扣分、记录（一次性完成）
    DB.starLog.total -= reward.cost;
    const redeemId = uid();
    DB.redeemed.unshift({
      id: redeemId,
      rewardId: reward.id,
      rewardName: reward.name,
      cost: reward.cost,
      date: todayStr(),
      time: new Date().toTimeString().substr(0, 5)
    });
    saveDB();
    // 推送兑换到 Supabase
    if (typeof pushRedemptionToSupabase === 'function') pushRedemptionToSupabase(reward, redeemId);
    starRain(6);
    playChime();
    speak(`兑换成功！${reward.name}！`);
    toast(`兑换成功！「${reward.name}」🎉`);
    pendingRewardId = null;
    isRedeeming = false;
    renderRewardsPage();
  }, () => {
    // 取消或密码错误时清理状态
    isRedeeming = false;
    pendingRewardId = null;
  });
}

function closeRedeemModal() {
  document.getElementById('redeemModal').classList.remove('show');
  pendingRewardId = null;
}

/* ====== 渲染：设置 ====== */
function renderSettingsPage() {
  // 模式按钮
  document.getElementById('modeHoliday').classList.toggle('active', DB.settings.mode === 'holiday');
  document.getElementById('modeSchool').classList.toggle('active', DB.settings.mode === 'school');
  updateModeBadge();

  // 声音开关
  const soundSwitch = document.getElementById('soundSwitch');
  soundSwitch.classList.toggle('on', DB.settings.soundEnabled);
  soundSwitch.setAttribute('aria-checked', DB.settings.soundEnabled ? 'true' : 'false');

  // 语音播报开关
  const speechSwitch = document.getElementById('speechSwitch');
  speechSwitch.classList.toggle('on', DB.settings.speechEnabled);
  speechSwitch.setAttribute('aria-checked', DB.settings.speechEnabled ? 'true' : 'false');

  // 家长面板
  const parentBtn = document.getElementById('parentModeBtn');
  const parentPanel = document.getElementById('parentPanel');
  if (DB.settings.isParentMode) {
    parentBtn.textContent = '🚪 退出家长模式';
    parentBtn.classList.add('exit');
    parentPanel.classList.remove('hidden');
    renderParentSchedule();
    renderCustomSchedule();
    renderParentTasks();
    renderParentRewards();
    renderHomeworkSubjects();
  } else {
    parentBtn.textContent = '🔑 进入家长模式';
    parentBtn.classList.remove('exit');
    parentPanel.classList.add('hidden');
  }
}

function updateModeBadge() {
  document.getElementById('modeBadge').textContent = DB.settings.mode === 'holiday' ? '假期模式' : '开学模式';
}

function updateStarDisplay() {
  document.getElementById('starCount').textContent = DB.starLog.total;
  document.getElementById('starNumHome').textContent = DB.starLog.total;
  const rewardNum = document.getElementById('starNumReward');
  if (rewardNum) rewardNum.textContent = DB.starLog.total;
}

/* ====== 家长模式：课表编辑 ====== */
function renderParentSchedule() {
  const mode = DB.settings.mode;
  const list = DB.schedule[mode] || [];
  const el = document.getElementById('scheduleEditList');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state">暂无课程</div>';
  } else {
    el.innerHTML = list.map(c => `
      <div class="edit-item">
        <span class="edit-item-info">${esc(dayLabel(c.day))} | ${esc(c.startTime)}-${esc(c.endTime)} | ${esc(c.title)} ⏰</span>
        <button class="edit-item-delete" data-sch-del="${esc(c.id)}" aria-label="删除课程">🗑️</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-sch-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.schDel;
        showConfirm('删除课程', '确定要删除这门课程吗？', () => {
          if (!requireParent()) return;
          DB.schedule[mode] = DB.schedule[mode].filter(c => c.id !== id);
          saveDB();
          renderParentSchedule();
          toast('已删除');
        });
      });
    });
  }
}

/* ====== 家长模式：临时日程编辑（P0: 按日期） ====== */
function renderCustomSchedule() {
  const list = DB.schedule.custom || [];
  const el = document.getElementById('customScheduleList');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state">暂无临时日程</div>';
  } else {
    el.innerHTML = list.map(c => `
      <div class="edit-item">
        <span class="edit-item-info">${c.date ? esc(c.date) : '未设置日期'} | ${esc(c.startTime)}-${esc(c.endTime)} | ${esc(c.title)} ⏰</span>
        <button class="edit-item-delete" data-custom-del="${esc(c.id)}" aria-label="删除临时日程">🗑️</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-custom-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.customDel;
        showConfirm('删除临时日程', '确定要删除这个临时日程吗？', () => {
          if (!requireParent()) return;
          DB.schedule.custom = DB.schedule.custom.filter(c => c.id !== id);
          saveDB();
          renderCustomSchedule();
          toast('已删除');
        });
      });
    });
  }
}

function addSchedule() {
  if (!requireParent()) return;
  const day = document.getElementById('schDay').value;
  const startTime = document.getElementById('schStart').value;
  const endTime = document.getElementById('schEnd').value;
  const title = document.getElementById('schTitle').value.trim();
  if (!title) { toast('请输入课程名称'); return; }
  if (!startTime || !endTime) { toast('请选择时间'); return; }

  const mode = DB.settings.mode;
  DB.schedule[mode].push({
    id: uid(),
    day: day,
    startTime: startTime,
    endTime: endTime,
    title: title,
    alarm: true
  });
  saveDB();
  document.getElementById('schTitle').value = '';
  renderParentSchedule();
  toast('课程已添加');
}

/* ====== 添加临时日程（P0: 按日期） ====== */
function addCustomSchedule() {
  if (!requireParent()) return;
  const date = document.getElementById('customDate').value;
  const startTime = document.getElementById('customStart').value;
  const endTime = document.getElementById('customEnd').value;
  const title = document.getElementById('customTitle').value.trim();
  if (!date) { toast('请选择日期'); return; }
  if (!title) { toast('请输入课程名称'); return; }
  if (!startTime || !endTime) { toast('请选择时间'); return; }

  DB.schedule.custom.push({
    id: 'custom-' + uid(),
    date: date,
    startTime: startTime,
    endTime: endTime,
    title: title,
    alarm: true
  });
  saveDB();
  document.getElementById('customDate').value = '';
  document.getElementById('customTitle').value = '';
  renderCustomSchedule();
  toast('临时日程已添加');
}

/* ====== 家长模式：任务编辑 ====== */
function renderParentTasks() {
  const el = document.getElementById('tasksEditList');
  if (DB.tasks.length === 0) {
    el.innerHTML = '<div class="empty-state">暂无任务</div>';
  } else {
    el.innerHTML = DB.tasks.map(t => `
      <div class="edit-item">
        <span class="edit-item-info">${esc(t.icon)} ${esc(t.name)} — 💎${esc(t.stars)}</span>
        <button class="edit-item-delete" data-task-del="${esc(t.id)}" aria-label="删除任务">🗑️</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-task-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.taskDel;
        showConfirm('删除任务', '确定要删除这个任务吗？', () => {
          if (!requireParent()) return;
          DB.tasks = DB.tasks.filter(t => t.id !== id);
          saveDB();
          renderParentTasks();
          toast('任务已删除');
        });
      });
    });
  }
}

function addTask() {
  if (!requireParent()) return;
  const name = document.getElementById('taskName').value.trim();
  const icon = document.getElementById('taskIcon').value.trim() || '📌';
  const stars = parseInt(document.getElementById('taskStars').value) || 2;
  if (!name) { toast('请输入任务名称'); return; }
  DB.tasks.push({ id: uid(), name, icon, stars: Math.min(10, Math.max(1, stars)) });
  saveDB();
  document.getElementById('taskName').value = '';
  renderParentTasks();
  toast('任务已添加');
}

/* ====== 家长模式：作业科目管理 ====== */
function renderHomeworkSubjects() {
  const subjects = DB.settings.homeworkSubjects || [];
  const el = document.getElementById('homeworkSubjectsList');
  if (subjects.length === 0) {
    el.innerHTML = '<div class="empty-state">暂无科目</div>';
  } else {
    el.innerHTML = subjects.map(s => `
      <div class="edit-item">
        <span class="edit-item-info">${esc(s)}</span>
        <button class="edit-item-delete" data-hw-subj-del="${esc(s)}" aria-label="删除科目">🗑️</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-hw-subj-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const subj = btn.dataset.hwSubjDel;
        showConfirm('删除科目', `确定要删除科目「${subj}」吗？`, () => {
          if (!requireParent()) return;
          DB.settings.homeworkSubjects = DB.settings.homeworkSubjects.filter(s => s !== subj);
          saveDB();
          renderHomeworkSubjects();
          renderDailySubjects();
          toast('科目已删除');
        });
      });
    });
  }
  renderDailySubjects();
}

function addHomeworkSubject() {
  if (!requireParent()) return;
  const input = document.getElementById('hwSubjectName');
  const name = input.value.trim();
  if (!name) { toast('请输入科目名称'); return; }
  if (!DB.settings.homeworkSubjects) DB.settings.homeworkSubjects = [];
  if (DB.settings.homeworkSubjects.includes(name)) { toast('该科目已存在'); return; }
  DB.settings.homeworkSubjects.push(name);
  saveDB();
  input.value = '';
  renderHomeworkSubjects();
  toast('科目已添加');
}

/* ====== 今日科目选择（家长勾选今日作业科目） ====== */
function renderDailySubjects() {
  const subjects = DB.settings.homeworkSubjects || [];
  const today = todayStr();
  const daily = (DB.settings.dailySubjects || {})[today] || [];
  const el = document.getElementById('dailySubjectsSection');
  if (subjects.length === 0) {
    el.innerHTML = '<div class="empty-state">请先添加科目</div>';
    return;
  }
  el.innerHTML = subjects.map(s => {
    const checked = daily.includes(s);
    return `
      <label class="daily-subject-chip ${checked ? 'checked' : ''}" data-subject="${esc(s)}">
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span>${esc(s)}</span>
      </label>
    `;
  }).join('');
  el.querySelectorAll('.daily-subject-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      e.preventDefault();
      if (!requireParent()) return;
      const subj = chip.dataset.subject;
      if (!DB.settings.dailySubjects) DB.settings.dailySubjects = {};
      if (!DB.settings.dailySubjects[today]) DB.settings.dailySubjects[today] = [];
      const arr = DB.settings.dailySubjects[today];
      const idx = arr.indexOf(subj);
      if (idx >= 0) {
        arr.splice(idx, 1);
      } else {
        arr.push(subj);
      }
      saveDB();
      renderDailySubjects();
      speak(subj + (idx >= 0 ? '已取消' : '已选择'));
    });
  });
}

/* ====== 家长模式：奖励编辑 ====== */
function renderParentRewards() {
  const el = document.getElementById('rewardsEditList');
  if (DB.rewards.length === 0) {
    el.innerHTML = '<div class="empty-state">暂无奖励</div>';
  } else {
    el.innerHTML = DB.rewards.map(r => `
      <div class="edit-item">
        <span class="edit-item-info">${esc(r.icon)} ${esc(r.name)} — ${esc(r.cost)}💎</span>
        <button class="edit-item-delete" data-reward-del="${esc(r.id)}" aria-label="删除奖励">🗑️</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-reward-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.rewardDel;
        showConfirm('删除奖励', '确定要删除这个奖励吗？', () => {
          if (!requireParent()) return;
          DB.rewards = DB.rewards.filter(r => r.id !== id);
          saveDB();
          renderParentRewards();
          toast('奖励已删除');
        });
      });
    });
  }
}

function addReward() {
  if (!requireParent()) return;
  const name = document.getElementById('rewardName').value.trim();
  const icon = document.getElementById('rewardIcon').value.trim() || '🎁';
  const cost = parseInt(document.getElementById('rewardCost').value) || 1;
  if (!name) { toast('请输入奖励名称'); return; }
  DB.rewards.push({ id: uid(), name, icon, cost: Math.max(1, cost) });
  saveDB();
  document.getElementById('rewardName').value = '';
  renderParentRewards();
  toast('奖励已添加');
}

/* ====== 密码相关（P0: 兑换也使用此弹窗） ====== */
function openPasswordModal(callback, onCancel, customHint) {
  const modal = document.getElementById('passwordModal');
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('passwordError');
  const hint = document.getElementById('passwordModalHint');
  input.value = '';
  error.textContent = '';
  hint.textContent = customHint || '请输入4位数字密码';
  modal.classList.add('show');
  setTimeout(() => input.focus(), 100);

  const confirmBtn = document.getElementById('passwordConfirm');
  const cancelBtn = document.getElementById('passwordCancel');

  const onConfirm = () => {
    const val = input.value;
    if (val === DB.settings.parentPassword) {
      cleanup();
      callback();
    } else {
      error.textContent = '密码错误，请重试';
      input.value = '';
      input.focus();
    }
  };

  const onCancelInternal = () => { cleanup(); if (onCancel) onCancel(); };
  const onKey = (e) => {
    if (e.key === 'Enter') onConfirm();
    if (e.key === 'Escape') onCancelInternal();
  };

  function cleanup() {
    modal.classList.remove('show');
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancelInternal);
    input.removeEventListener('keydown', onKey);
  }

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancelInternal);
  input.addEventListener('keydown', onKey);
}

function toggleParentMode() {
  if (DB.settings.isParentMode) {
    DB.settings.isParentMode = false;
    saveDB();
    renderSettingsPage();
    toast('已退出家长模式');
  } else {
    openPasswordModal(() => {
      DB.settings.isParentMode = true;
      saveDB();
      renderSettingsPage();
      toast('家长模式已开启');
    });
  }
}

function changePassword() {
  if (!requireParent()) return;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  if (!/^\d{4}$/.test(newPwd)) { toast('密码需为4位数字'); return; }
  if (newPwd !== confirmPwd) { toast('两次密码不一致'); return; }
  DB.settings.parentPassword = newPwd;
  saveDB();
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  toast('密码已修改');
}

/* ====== 删除确认弹窗（P2: 二次确认） ====== */
let confirmCallback = null;
function showConfirm(title, text, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  confirmCallback = callback;
  document.getElementById('confirmModal').classList.add('show');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('show');
  confirmCallback = null;
}

/* ====== 小宠物系统（P0: Minecraft 风格） ====== */
const PET_LEVELS = [
  { level: 1, minStars: 0,    icon: '🧑',     image: 'images/steve.png',   name: '史蒂夫',     hint: '再获得 {n} 颗绿宝石，史蒂夫会进化！' },
  { level: 2, minStars: 30,   icon: '👩',     image: 'images/alex.png',    name: '爱丽克丝',   hint: '再获得 {n} 颗绿宝石，爱丽克丝会进化！' },
  { level: 3, minStars: 80,   icon: '🤴',     image: 'images/rain.png',    name: '瑞恩',       hint: '再获得 {n} 颗绿宝石，瑞恩会进化！' },
  { level: 4, minStars: 150,  icon: '🧙‍♀️',   image: 'images/stella.png',  name: '斯特拉',     hint: '再获得 {n} 颗绿宝石，斯特拉会进化！' },
  { level: 5, minStars: 300,  icon: '🧙‍♂️',   image: 'images/zephyr.png',  name: '泽菲尔',     hint: '再获得 {n} 颗绿宝石，泽菲尔会进化！' },
  { level: 6, minStars: 600,  icon: '🧝‍♀️',   image: 'images/sirius.png',  name: '赛瑞斯',     hint: '再获得 {n} 颗绿宝石，赛瑞斯会进化！' },
  { level: 7, minStars: 1000, icon: '🐉',     image: 'images/dragon.png',  name: '末影龙',     hint: '🐲 传说级末影龙！你是最强冒险家！继续守护绿宝石吧！' }
];

/* ====== 渲染宠物形象（支持图片/emoji） ====== */
function setPetIcon(container, pet) {
  if (!container) return;
  container.innerHTML = '';
  if (pet && pet.image) {
    const img = document.createElement('img');
    img.src = pet.image;
    img.alt = pet.name || '';
    img.className = 'pet-avatar-img';
    img.onerror = () => {
      // 图片加载失败时回退到 emoji
      container.textContent = pet.icon || '🧑';
    };
    container.appendChild(img);
  } else {
    container.textContent = pet ? pet.icon : '🧑';
  }
}

let lastPetLevel = 1;

function getPetInfo() {
  const stars = DB.starLog.totalEarned || 0;
  let info = PET_LEVELS[0];
  for (let i = PET_LEVELS.length - 1; i >= 0; i--) {
    if (stars >= PET_LEVELS[i].minStars) {
      info = PET_LEVELS[i];
      break;
    }
  }
  const nextLevel = PET_LEVELS.find(l => l.level === info.level + 1);
  const progressEnd = nextLevel ? nextLevel.minStars : info.minStars;
  const progressStart = info.minStars;
  const progress = nextLevel
    ? ((stars - progressStart) / (progressEnd - progressStart)) * 100
    : 100;
  const remaining = nextLevel ? (progressEnd - stars) : 0;
  return { ...info, nextLevel, progress, remaining, progressStart, progressEnd };
}

function renderPet() {
  const pet = getPetInfo();
  setPetIcon(document.getElementById('petAvatar'), pet);
  document.getElementById('petName').textContent = pet.name;
  document.getElementById('petLevelBadge').textContent = 'Lv.' + pet.level;
  document.getElementById('petProgressFill').style.width = Math.min(100, Math.max(0, pet.progress)) + '%';
  document.getElementById('petProgressText').textContent = pet.nextLevel
    ? '累计 ' + (DB.starLog.totalEarned || 0) + ' / ' + pet.progressEnd + ' 💎'
    : '累计 ' + (DB.starLog.totalEarned || 0) + ' 💎 满级！';
  document.getElementById('petHint').textContent = pet.nextLevel
    ? pet.hint.replace('{n}', pet.remaining)
    : pet.hint;
}

function checkPetEvolution() {
  const pet = getPetInfo();
  if (pet.level > lastPetLevel) {
    lastPetLevel = pet.level;
    // 进化动画
    const avatar = document.getElementById('petAvatar');
    avatar.classList.add('evolving');
    setTimeout(() => {
      avatar.classList.remove('evolving');
      avatar.textContent = pet.icon;
    }, 1200);
    starRain(20);
    playChime();
    speak(`恭喜！小宠物进化成了${pet.name}！`);
    setTimeout(() => {
      toast(`🎉 恭喜！小宠物进化成了 ${pet.name} ${pet.icon}！`);
    }, 800);
  }
}

/* ====== 计时器模块（P0: 自定义计时器 + 不增加绿宝石） ====== */
const Timer = {
  mode: 'pomodoro',
  duration: 25 * 60,
  remaining: 25 * 60,
  running: false,
  intervalId: null,

  init() {
    document.getElementById('timerStart').addEventListener('click', () => this.start());
    document.getElementById('timerPause').addEventListener('click', () => this.pause());
    document.getElementById('timerReset').addEventListener('click', () => this.reset());
    // 自定义计时器
    document.getElementById('timerCustomBtn').addEventListener('click', () => this.setCustom());
    document.getElementById('timerCustomInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.setCustom();
    });
    // 切换模式时停止并重置
    document.querySelectorAll('.timer-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.pause(); // 切换模式时停止当前计时
        document.querySelectorAll('.timer-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.mode = tab.dataset.timerTab;
        this.setDefaults();
      });
    });
    this.setDefaults();
  },

  setDefaults() {
    const presetsEl = document.getElementById('timerPresets');
    presetsEl.innerHTML = '';
    if (this.mode === 'pomodoro') {
      this.duration = 25 * 60;
      this.remaining = this.duration;
      this.renderPresets([15, 20, 25, 30, 45], '分钟');
    } else {
      this.duration = 5 * 60;
      this.remaining = this.duration;
      this.renderPresets([1, 3, 5, 10, 15], '分钟');
    }
    this.updateDisplay();
  },

  renderPresets(mins, label) {
    const presetsEl = document.getElementById('timerPresets');
    presetsEl.innerHTML = mins.map(m => `<button class="preset-btn" data-min="${m}">${m}${label}</button>`).join('');
    presetsEl.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.running) this.pause();
        this.duration = parseInt(btn.dataset.min) * 60;
        this.remaining = this.duration;
        this.updateDisplay();
      });
    });
  },

  /* P0: 自定义计时器输入校验 */
  setCustom() {
    const input = document.getElementById('timerCustomInput');
    const val = input.value.trim();
    // 校验：空、非数字
    if (!val) { toast('请输入分钟数'); return; }
    const num = parseInt(val);
    if (isNaN(num)) { toast('请输入有效数字'); return; }
    if (num < 1) { toast('最小为1分钟'); return; }
    if (num > 120) { toast('最大为120分钟'); return; }
    if (!Number.isInteger(parseFloat(val))) { toast('请输入整数'); return; }
    if (this.running) this.pause();
    this.duration = num * 60;
    this.remaining = this.duration;
    this.updateDisplay();
    toast(`已设置 ${num} 分钟`);
    input.value = '';
  },

  start() {
    if (this.running) return;
    if (this.remaining <= 0) this.remaining = this.duration;
    this.running = true;
    // 清除可能残留的旧定时器（避免多个 setInterval）
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      this.remaining--;
      this.updateDisplay();
      if (this.remaining <= 0) {
        this.pause();
        // P0: 计时器结束只播放提示音和Toast，不增加绿宝石
        playChime();
        speak(this.mode === 'pomodoro' ? '番茄钟完成了！' : '时间到了！');
        toast(this.mode === 'pomodoro' ? '🍅 番茄钟完成！' : '⏰ 时间到！');
      }
    }, 1000);
  },

  pause() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  reset() {
    this.pause();
    this.remaining = this.duration;
    this.updateDisplay();
  },

  updateDisplay() {
    const m = Math.floor(this.remaining / 60);
    const s = this.remaining % 60;
    document.getElementById('timerDisplay').textContent =
      `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
};

/* ====== 计算器模块 ====== */
const Calculator = {
  display: '0',
  prev: null,
  op: null,
  waiting: false,

  buttons: [
    'C', '⌫', '%', '÷',
    '7', '8', '9', '×',
    '4', '5', '6', '−',
    '1', '2', '3', '+',
    '0', '.', '='
  ],

  init() {
    const el = document.getElementById('calcButtons');
    el.innerHTML = this.buttons.map(b => {
      let cls = 'calc-btn';
      if (['÷','×','−','+'].includes(b)) cls += ' op';
      if (b === '=') cls += ' eq';
      if (b === 'C') cls += ' clear';
      return `<button class="${cls}" data-key="${b}" aria-label="${b}">${b}</button>`;
    }).join('');
    el.querySelectorAll('.calc-btn').forEach(btn => {
      btn.addEventListener('click', () => this.press(btn.dataset.key));
    });
    this.updateDisplay();
  },

  press(key) {
    if (key >= '0' && key <= '9') this.inputDigit(key);
    else if (key === '.') this.inputDot();
    else if (key === 'C') this.clear();
    else if (key === '⌫') this.backspace();
    else if (key === '%') this.percent();
    else if (['+','−','×','÷'].includes(key)) this.setOp(key);
    else if (key === '=') this.calculate();
  },

  inputDigit(d) {
    if (this.waiting) { this.display = d; this.waiting = false; }
    else { this.display = this.display === '0' ? d : this.display + d; }
    this.updateDisplay();
  },

  inputDot() {
    if (this.waiting) { this.display = '0.'; this.waiting = false; }
    else if (!this.display.includes('.')) this.display += '.';
    this.updateDisplay();
  },

  clear() {
    this.display = '0';
    this.prev = null;
    this.op = null;
    this.waiting = false;
    this.updateDisplay();
  },

  backspace() {
    if (this.display.length > 1) this.display = this.display.slice(0, -1);
    else this.display = '0';
    this.updateDisplay();
  },

  percent() {
    this.display = String(parseFloat(this.display) / 100);
    this.updateDisplay();
  },

  setOp(op) {
    const val = parseFloat(this.display);
    if (this.prev !== null && this.op && !this.waiting) {
      const result = this.compute(this.prev, val, this.op);
      if (result === null) {
        toast('不能除以0');
        this.clear();
        return;
      }
      this.prev = result;
      this.display = String(this.prev);
    } else {
      this.prev = val;
    }
    this.op = op;
    this.waiting = true;
    this.updateDisplay();
  },

  calculate() {
    if (this.op === null || this.prev === null) return;
    const val = parseFloat(this.display);
    const result = this.compute(this.prev, val, this.op);
    if (result === null) {
      toast('不能除以0');
      this.display = '0';
      this.op = null;
      this.prev = null;
      this.waiting = true;
      this.updateDisplay();
      return;
    }
    this.prev = result;
    this.display = String(this.prev);
    this.op = null;
    this.prev = null;
    this.waiting = true;
    this.updateDisplay();
    // 语音朗读计算结果
    speak(`等于${this.display}`);
  },

  compute(a, b, op) {
    switch(op) {
      case '+': return Math.round((a + b) * 1e10) / 1e10;
      case '−': return Math.round((a - b) * 1e10) / 1e10;
      case '×': return Math.round((a * b) * 1e10) / 1e10;
      case '÷':
        if (b === 0) return null;
        return Math.round((a / b) * 1e10) / 1e10;
    }
    return b;
  },

  updateDisplay() {
    let d = this.display;
    if (d.length > 12) d = parseFloat(d).toExponential(6);
    document.getElementById('calcDisplay').textContent = d;
  }
};

/* ====== 拼音表 ====== */
/* 拼音→示范汉字映射：点击时朗读汉字（zh-CN），产生正确的拼音发音 */
const PINYIN_SOUNDS = {
  // 声母
  'b':  { char: '波', example: '玻' },
  'p':  { char: '坡', example: '坡' },
  'm':  { char: '摸', example: '摸' },
  'f':  { char: '佛', example: '佛' },
  'd':  { char: '得', example: '得' },
  't':  { char: '特', example: '特' },
  'n':  { char: '讷', example: '讷' },
  'l':  { char: '勒', example: '勒' },
  'g':  { char: '哥', example: '哥' },
  'k':  { char: '科', example: '科' },
  'h':  { char: '喝', example: '喝' },
  'j':  { char: '鸡', example: '鸡' },
  'q':  { char: '七', example: '七' },
  'x':  { char: '西', example: '西' },
  'zh': { char: '知', example: '知' },
  'ch': { char: '吃', example: '吃' },
  'sh': { char: '狮', example: '狮' },
  'r':  { char: '日', example: '日' },
  'z':  { char: '资', example: '资' },
  'c':  { char: '刺', example: '刺' },
  's':  { char: '丝', example: '丝' },
  'y':  { char: '衣', example: '衣' },
  'w':  { char: '屋', example: '屋' },
  // 韵母
  'a':  { char: '啊', example: '啊' },
  'o':  { char: '喔', example: '喔' },
  'e':  { char: '鹅', example: '鹅' },
  'i':  { char: '衣', example: '衣' },
  'u':  { char: '乌', example: '乌' },
  'ü':  { char: '鱼', example: '鱼' },
  'ai': { char: '爱', example: '爱' },
  'ei': { char: '欸', example: '欸' },
  'ui': { char: '威', example: '威' },
  'ao': { char: '袄', example: '袄' },
  'ou': { char: '欧', example: '欧' },
  'iu': { char: '优', example: '优' },
  'ie': { char: '耶', example: '耶' },
  'üe': { char: '约', example: '约' },
  'er': { char: '儿', example: '儿' },
  'an': { char: '安', example: '安' },
  'en': { char: '恩', example: '恩' },
  'in': { char: '音', example: '音' },
  'un': { char: '温', example: '温' },
  'ün': { char: '晕', example: '晕' },
  'ang':{ char: '昂', example: '昂' },
  'eng':{ char: '亨', example: '亨' },
  'ing':{ char: '英', example: '英' },
  'ong':{ char: '轰', example: '轰' },
  // 声调示例（四声示范字）
  'ā':  { char: '阿', example: '阿' },
  'á':  { char: '啊', example: '啊' },
  'ǎ':  { char: '啊', example: '啊' },
  'à':  { char: '啊', example: '啊' },
  'ō':  { char: '喔', example: '喔' },
  'ó':  { char: '哦', example: '哦' },
  'ǒ':  { char: '哦', example: '哦' },
  'ò':  { char: '哦', example: '哦' },
  'ē':  { char: '婀', example: '婀' },
  'é':  { char: '鹅', example: '鹅' },
  'ě':  { char: '恶', example: '恶' },
  'è':  { char: '饿', example: '饿' },
  'ī':  { char: '衣', example: '衣' },
  'í':  { char: '姨', example: '姨' },
  'ǐ':  { char: '椅', example: '椅' },
  'ì':  { char: '意', example: '意' },
  'ū':  { char: '乌', example: '乌' },
  'ú':  { char: '无', example: '无' },
  'ǔ':  { char: '五', example: '五' },
  'ù':  { char: '物', example: '物' },
  'ǖ':  { char: '迂', example: '迂' },
  'ǘ':  { char: '鱼', example: '鱼' },
  'ǚ':  { char: '雨', example: '雨' },
  'ǜ':  { char: '玉', example: '玉' }
};

const Pinyin = {
  initials: ['b','p','m','f','d','t','n','l','g','k','h','j','q','x','zh','ch','sh','r','z','c','s','y','w'],
  finals: ['a','o','e','i','u','ü','ai','ei','ui','ao','ou','iu','ie','üe','er','an','en','in','un','ün','ang','eng','ing','ong'],
  tones: ['ā','á','ǎ','à','ō','ó','ǒ','ò','ē','é','ě','è','ī','í','ǐ','ì','ū','ú','ǔ','ù','ǖ','ǘ','ǚ','ǜ'],

  init() {
    const el = document.getElementById('pinyinContent');
    const cellHTML = (s) => {
      const info = PINYIN_SOUNDS[s];
      const exChar = info ? info.example : '';
      return `<div class="pinyin-cell" data-pinyin="${esc(s)}">
        <span class="pinyin-text">${esc(s)}</span>
        ${exChar ? `<span class="pinyin-char">${esc(exChar)}</span>` : ''}
      </div>`;
    };
    el.innerHTML = `
      <div class="pinyin-hint">💡 点击拼音听发音，下方汉字为示范字</div>
      <div class="pinyin-section">
        <h4>声母（${this.initials.length}个）</h4>
        <div class="pinyin-grid">
          ${this.initials.map(s => cellHTML(s)).join('')}
        </div>
      </div>
      <div class="pinyin-section">
        <h4>韵母（${this.finals.length}个）</h4>
        <div class="pinyin-grid">
          ${this.finals.map(s => cellHTML(s)).join('')}
        </div>
      </div>
      <div class="pinyin-section">
        <h4>声调示例（四声）</h4>
        <div class="pinyin-grid">
          ${this.tones.map(s => cellHTML(s)).join('')}
        </div>
      </div>
    `;
    // 点击拼音格语音朗读：用中文TTS朗读示范汉字，产生正确的拼音发音
    el.querySelectorAll('.pinyin-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const py = cell.dataset.pinyin;
        const info = PINYIN_SOUNDS[py];
        if (info) {
          // 用中文TTS朗读示范汉字
          speak(info.char, 'zh-CN');
        } else {
          speak(py, 'zh-CN');
        }
      });
    });
  }
};

/* ====== 新概念英语第一册词汇 ====== */
const NCE1_VOCAB = [
  { lesson: 1, title: '第1-2课: Excuse me!', words: [
    { word: 'excuse', phonetic: '/ɪkˈskjuːz/', meaning: '原谅' },
    { word: 'handbag', phonetic: '/ˈhændbæɡ/', meaning: '手提包' },
    { word: 'pardon', phonetic: '/ˈpɑːdn/', meaning: '再说一遍' },
    { word: 'thank you', phonetic: '/θæŋk juː/', meaning: '谢谢你' },
  ]},
  { lesson: 3, title: '第3-4课: Sorry, sir', words: [
    { word: 'sorry', phonetic: '/ˈsɒri/', meaning: '对不起' },
    { word: 'sir', phonetic: '/sɜː/', meaning: '先生' },
    { word: 'cloakroom', phonetic: '/ˈkləʊkruːm/', meaning: '衣帽存放处' },
    { word: 'suit', phonetic: '/suːt/', meaning: '套装' },
    { word: 'school', phonetic: '/skuːl/', meaning: '学校' },
    { word: 'teacher', phonetic: '/ˈtiːtʃə/', meaning: '老师' },
    { word: 'son', phonetic: '/sʌn/', meaning: '儿子' },
    { word: 'daughter', phonetic: '/ˈdɔːtə/', meaning: '女儿' },
  ]},
  { lesson: 5, title: '第5-6课: Nice to meet you', words: [
    { word: 'morning', phonetic: '/ˈmɔːnɪŋ/', meaning: '早上' },
    { word: 'Miss', phonetic: '/mɪs/', meaning: '小姐' },
    { word: 'new', phonetic: '/njuː/', meaning: '新的' },
    { word: 'student', phonetic: '/ˈstjuːdnt/', meaning: '学生' },
    { word: 'French', phonetic: '/frentʃ/', meaning: '法国的' },
    { word: 'German', phonetic: '/ˈdʒɜːmən/', meaning: '德国的' },
    { word: 'nice', phonetic: '/naɪs/', meaning: '美好的' },
    { word: 'meet', phonetic: '/miːt/', meaning: '遇见' },
    { word: 'Japanese', phonetic: '/ˌdʒæpəˈniːz/', meaning: '日本人' },
    { word: 'Korean', phonetic: '/kəˈriːən/', meaning: '韩国人' },
    { word: 'Chinese', phonetic: '/ˌtʃaɪˈniːz/', meaning: '中国人' },
    { word: 'too', phonetic: '/tuː/', meaning: '也' },
  ]},
  { lesson: 7, title: '第7-8课: Are you a teacher?', words: [
    { word: 'name', phonetic: '/neɪm/', meaning: '名字' },
    { word: 'nationality', phonetic: '/ˌnæʃəˈnæləti/', meaning: '国籍' },
    { word: 'job', phonetic: '/dʒɒb/', meaning: '工作' },
    { word: 'keyboard', phonetic: '/ˈkiːbɔːd/', meaning: '键盘' },
    { word: 'operator', phonetic: '/ˈɒpəreɪtə/', meaning: '操作员' },
    { word: 'engineer', phonetic: '/ˌendʒɪˈnɪə/', meaning: '工程师' },
    { word: 'policeman', phonetic: '/pəˈliːsmən/', meaning: '警察' },
    { word: 'hairdresser', phonetic: '/ˈheədresə/', meaning: '理发师' },
    { word: 'housewife', phonetic: '/ˈhaʊswaɪf/', meaning: '家庭主妇' },
    { word: 'milkman', phonetic: '/ˈmɪlkmən/', meaning: '送牛奶的人' },
  ]},
  { lesson: 9, title: '第9-10课: How are you today?', words: [
    { word: 'hello', phonetic: '/həˈləʊ/', meaning: '你好' },
    { word: 'hi', phonetic: '/haɪ/', meaning: '嗨' },
    { word: 'today', phonetic: '/təˈdeɪ/', meaning: '今天' },
    { word: 'well', phonetic: '/wel/', meaning: '身体好' },
    { word: 'fine', phonetic: '/faɪn/', meaning: '很好的' },
    { word: 'thanks', phonetic: '/θæŋks/', meaning: '谢谢' },
    { word: 'goodbye', phonetic: '/ˌɡʊdˈbaɪ/', meaning: '再见' },
    { word: 'see', phonetic: '/siː/', meaning: '见' },
    { word: 'fat', phonetic: '/fæt/', meaning: '胖的' },
    { word: 'thin', phonetic: '/θɪn/', meaning: '瘦的' },
    { word: 'tall', phonetic: '/tɔːl/', meaning: '高的' },
    { word: 'short', phonetic: '/ʃɔːt/', meaning: '矮的' },
    { word: 'dirty', phonetic: '/ˈdɜːti/', meaning: '脏的' },
    { word: 'clean', phonetic: '/kliːn/', meaning: '干净的' },
    { word: 'hot', phonetic: '/hɒt/', meaning: '热的' },
    { word: 'cold', phonetic: '/kəʊld/', meaning: '冷的' },
    { word: 'old', phonetic: '/əʊld/', meaning: '老的' },
    { word: 'young', phonetic: '/jʌŋ/', meaning: '年轻的' },
    { word: 'busy', phonetic: '/ˈbɪzi/', meaning: '忙的' },
    { word: 'lazy', phonetic: '/ˈleɪzi/', meaning: '懒的' },
  ]},
  { lesson: 11, title: '第11-12课: Is this your shirt?', words: [
    { word: 'whose', phonetic: '/huːz/', meaning: '谁的' },
    { word: 'blue', phonetic: '/bluː/', meaning: '蓝色的' },
    { word: 'perhaps', phonetic: '/pəˈhæps/', meaning: '也许' },
    { word: 'white', phonetic: '/waɪt/', meaning: '白色的' },
    { word: 'catch', phonetic: '/kætʃ/', meaning: '抓住' },
    { word: 'father', phonetic: '/ˈfɑːðə/', meaning: '父亲' },
    { word: 'mother', phonetic: '/ˈmʌðə/', meaning: '母亲' },
    { word: 'blouse', phonetic: '/blaʊz/', meaning: '女衬衫' },
    { word: 'sister', phonetic: '/ˈsɪstə/', meaning: '姐妹' },
    { word: 'tie', phonetic: '/taɪ/', meaning: '领带' },
    { word: 'brother', phonetic: '/ˈbrʌðə/', meaning: '兄弟' },
    { word: 'his', phonetic: '/hɪz/', meaning: '他的' },
    { word: 'her', phonetic: '/hɜː/', meaning: '她的' },
  ]},
  { lesson: 13, title: '第13-14课: A new dress', words: [
    { word: 'same', phonetic: '/seɪm/', meaning: '相同的' },
    { word: 'lovely', phonetic: '/ˈlʌvli/', meaning: '可爱的' },
    { word: 'hat', phonetic: '/hæt/', meaning: '帽子' },
    { word: 'green', phonetic: '/ɡriːn/', meaning: '绿色的' },
    { word: 'come', phonetic: '/kʌm/', meaning: '来' },
    { word: 'upstairs', phonetic: '/ˌʌpˈsteəz/', meaning: '楼上' },
    { word: 'smart', phonetic: '/smɑːt/', meaning: '时髦的' },
    { word: 'dress', phonetic: '/dres/', meaning: '连衣裙' },
    { word: 'case', phonetic: '/keɪs/', meaning: '箱子' },
    { word: 'carpet', phonetic: '/ˈkɑːpɪt/', meaning: '地毯' },
    { word: 'dog', phonetic: '/dɒɡ/', meaning: '狗' },
  ]},
  { lesson: 15, title: '第15-16课: Your passports, please', words: [
    { word: 'customs', phonetic: '/ˈkʌstəmz/', meaning: '海关' },
    { word: 'officer', phonetic: '/ˈɒfɪsə/', meaning: '官员' },
    { word: 'Danish', phonetic: '/ˈdeɪnɪʃ/', meaning: '丹麦的' },
    { word: 'friend', phonetic: '/frend/', meaning: '朋友' },
    { word: 'Norwegian', phonetic: '/nɔːˈwiːdʒən/', meaning: '挪威的' },
    { word: 'passport', phonetic: '/ˈpɑːspɔːt/', meaning: '护照' },
    { word: 'black', phonetic: '/blæk/', meaning: '黑色的' },
    { word: 'grey', phonetic: '/ɡreɪ/', meaning: '灰色的' },
    { word: 'red', phonetic: '/red/', meaning: '红色的' },
    { word: 'orange', phonetic: '/ˈɒrɪndʒ/', meaning: '橘色的' },
    { word: 'yellow', phonetic: '/ˈjeləʊ/', meaning: '黄色的' },
  ]},
  { lesson: 17, title: '第17-18课: How do you do?', words: [
    { word: 'employee', phonetic: '/ɪmˈplɔɪiː/', meaning: '雇员' },
    { word: 'hard-working', phonetic: '/ˌhɑːdˈwɜːkɪŋ/', meaning: '勤劳的' },
    { word: 'sales rep', phonetic: '/seɪlz rep/', meaning: '销售代表' },
    { word: 'man', phonetic: '/mæn/', meaning: '男人' },
    { word: 'office', phonetic: '/ˈɒfɪs/', meaning: '办公室' },
    { word: 'assistant', phonetic: '/əˈsɪstənt/', meaning: '助手' },
    { word: 'tall', phonetic: '/tɔːl/', meaning: '高的' },
    { word: 'short', phonetic: '/ʃɔːt/', meaning: '矮的' },
    { word: 'overweight', phonetic: '/ˌəʊvəˈweɪt/', meaning: '超重的' },
    { word: 'funny', phonetic: '/ˈfʌni/', meaning: '滑稽的' },
  ]},
  { lesson: 19, title: '第19-20课: Tired and thirsty', words: [
    { word: 'matter', phonetic: '/ˈmætə/', meaning: '事情' },
    { word: 'children', phonetic: '/ˈtʃɪldrən/', meaning: '孩子们' },
    { word: 'boy', phonetic: '/bɔɪ/', meaning: '男孩' },
    { word: 'tired', phonetic: '/ˈtaɪəd/', meaning: '累的' },
    { word: 'thirsty', phonetic: '/ˈθɜːsti/', meaning: '渴的' },
    { word: 'mum', phonetic: '/mʌm/', meaning: '妈妈' },
    { word: 'sit down', phonetic: '/sɪt daʊn/', meaning: '坐下' },
    { word: 'ice cream', phonetic: '/aɪs kriːm/', meaning: '冰淇淋' },
    { word: 'big', phonetic: '/bɪɡ/', meaning: '大的' },
    { word: 'small', phonetic: '/smɔːl/', meaning: '小的' },
    { word: 'open', phonetic: '/ˈəʊpən/', meaning: '打开的' },
    { word: 'shut', phonetic: '/ʃʌt/', meaning: '关着的' },
    { word: 'light', phonetic: '/laɪt/', meaning: '轻的' },
    { word: 'heavy', phonetic: '/ˈhevi/', meaning: '重的' },
    { word: 'long', phonetic: '/lɒŋ/', meaning: '长的' },
  ]},
  { lesson: 21, title: '第21-22课: Which book?', words: [
    { word: 'give', phonetic: '/ɡɪv/', meaning: '给' },
    { word: 'one', phonetic: '/wʌn/', meaning: '一个' },
    { word: 'which', phonetic: '/wɪtʃ/', meaning: '哪一个' },
    { word: 'empty', phonetic: '/ˈempti/', meaning: '空的' },
    { word: 'full', phonetic: '/fʊl/', meaning: '满的' },
    { word: 'large', phonetic: '/lɑːdʒ/', meaning: '大的' },
    { word: 'little', phonetic: '/ˈlɪtl/', meaning: '小的' },
    { word: 'sharp', phonetic: '/ʃɑːp/', meaning: '锋利的' },
    { word: 'small', phonetic: '/smɔːl/', meaning: '小的' },
    { word: 'big', phonetic: '/bɪɡ/', meaning: '大的' },
    { word: 'blunt', phonetic: '/blʌnt/', meaning: '钝的' },
    { word: 'box', phonetic: '/bɒks/', meaning: '盒子' },
    { word: 'glass', phonetic: '/ɡlɑːs/', meaning: '杯子' },
    { word: 'cup', phonetic: '/kʌp/', meaning: '茶杯' },
    { word: 'bottle', phonetic: '/ˈbɒtl/', meaning: '瓶子' },
    { word: 'tin', phonetic: '/tɪn/', meaning: '罐头' },
  ]},
  { lesson: 23, title: '第23-24课: Which glasses?', words: [
    { word: 'on', phonetic: '/ɒn/', meaning: '在...上面' },
    { word: 'shelf', phonetic: '/ʃelf/', meaning: '架子' },
    { word: 'desk', phonetic: '/desk/', meaning: '书桌' },
    { word: 'table', phonetic: '/ˈteɪbl/', meaning: '桌子' },
    { word: 'plate', phonetic: '/pleɪt/', meaning: '盘子' },
    { word: 'cupboard', phonetic: '/ˈkʌbəd/', meaning: '碗柜' },
    { word: 'cigarette', phonetic: '/ˌsɪɡəˈret/', meaning: '香烟' },
    { word: 'television', phonetic: '/ˈtelɪvɪʒn/', meaning: '电视' },
    { word: 'floor', phonetic: '/flɔː/', meaning: '地板' },
    { word: 'dressing table', phonetic: '/ˈdresɪŋ ˈteɪbl/', meaning: '梳妆台' },
    { word: 'magazine', phonetic: '/ˌmæɡəˈziːn/', meaning: '杂志' },
    { word: 'bed', phonetic: '/bed/', meaning: '床' },
    { word: 'newspaper', phonetic: '/ˈnjuːzpeɪpə/', meaning: '报纸' },
    { word: 'stereo', phonetic: '/ˈsteriəʊ/', meaning: '音响' },
  ]},
  { lesson: 25, title: '第25-26课: Mrs. Smith\'s kitchen', words: [
    { word: 'kitchen', phonetic: '/ˈkɪtʃɪn/', meaning: '厨房' },
    { word: 'right', phonetic: '/raɪt/', meaning: '右边' },
    { word: 'electric', phonetic: '/ɪˈlektrɪk/', meaning: '电动的' },
    { word: 'left', phonetic: '/left/', meaning: '左边' },
    { word: 'cooker', phonetic: '/ˈkʊkə/', meaning: '炊具' },
    { word: 'middle', phonetic: '/ˈmɪdl/', meaning: '中间' },
    { word: 'room', phonetic: '/ruːm/', meaning: '房间' },
    { word: 'cup', phonetic: '/kʌp/', meaning: '茶杯' },
    { word: 'where', phonetic: '/weə/', meaning: '在哪里' },
    { word: 'in', phonetic: '/ɪn/', meaning: '在...里面' },
  ]},
  { lesson: 27, title: '第27-28课: Mrs. Smith\'s living room', words: [
    { word: 'living room', phonetic: '/ˈlɪvɪŋ ruːm/', meaning: '客厅' },
    { word: 'near', phonetic: '/nɪə/', meaning: '靠近' },
    { word: 'window', phonetic: '/ˈwɪndəʊ/', meaning: '窗户' },
    { word: 'armchair', phonetic: '/ˈɑːmtʃeə/', meaning: '扶手椅' },
    { word: 'door', phonetic: '/dɔː/', meaning: '门' },
    { word: 'picture', phonetic: '/ˈpɪktʃə/', meaning: '图画' },
    { word: 'wall', phonetic: '/wɔːl/', meaning: '墙' },
    { word: 'trousers', phonetic: '/ˈtraʊzəz/', meaning: '长裤' },
  ]},
  { lesson: 29, title: '第29-30课: Come in, Amy', words: [
    { word: 'shut', phonetic: '/ʃʌt/', meaning: '关上' },
    { word: 'bedroom', phonetic: '/ˈbedruːm/', meaning: '卧室' },
    { word: 'untidy', phonetic: '/ʌnˈtaɪdi/', meaning: '不整齐的' },
    { word: 'put on', phonetic: '/pʊt ɒn/', meaning: '穿上' },
    { word: 'take off', phonetic: '/teɪk ɒf/', meaning: '脱下' },
    { word: 'turn on', phonetic: '/tɜːn ɒn/', meaning: '打开' },
    { word: 'turn off', phonetic: '/tɜːn ɒf/', meaning: '关掉' },
    { word: 'air', phonetic: '/eə/', meaning: '通风' },
    { word: 'clothes', phonetic: '/kləʊðz/', meaning: '衣服' },
    { word: 'dust', phonetic: '/dʌst/', meaning: '掸灰尘' },
    { word: 'sweep', phonetic: '/swiːp/', meaning: '扫' },
    { word: 'empty', phonetic: '/ˈempti/', meaning: '倒空' },
    { word: 'read', phonetic: '/riːd/', meaning: '读' },
    { word: 'sharpen', phonetic: '/ˈʃɑːpən/', meaning: '削尖' },
  ]},
  { lesson: 31, title: '第31-32课: Where\'s Sally?', words: [
    { word: 'garden', phonetic: '/ˈɡɑːdn/', meaning: '花园' },
    { word: 'under', phonetic: '/ˈʌndə/', meaning: '在...下面' },
    { word: 'tree', phonetic: '/triː/', meaning: '树' },
    { word: 'who', phonetic: '/huː/', meaning: '谁' },
    { word: 'run', phonetic: '/rʌn/', meaning: '跑' },
    { word: 'grass', phonetic: '/ɡrɑːs/', meaning: '草' },
    { word: 'after', phonetic: '/ˈɑːftə/', meaning: '在...之后' },
    { word: 'cat', phonetic: '/kæt/', meaning: '猫' },
    { word: 'type', phonetic: '/taɪp/', meaning: '打字' },
    { word: 'letter', phonetic: '/ˈletə/', meaning: '信' },
    { word: 'basket', phonetic: '/ˈbɑːskɪt/', meaning: '篮子' },
    { word: 'eat', phonetic: '/iːt/', meaning: '吃' },
    { word: 'bone', phonetic: '/bəʊn/', meaning: '骨头' },
    { word: 'tooth', phonetic: '/tuːθ/', meaning: '牙齿' },
    { word: 'cook', phonetic: '/kʊk/', meaning: '做饭' },
    { word: 'milk', phonetic: '/mɪlk/', meaning: '牛奶' },
    { word: 'meal', phonetic: '/miːl/', meaning: '一顿饭' },
    { word: 'drink', phonetic: '/drɪŋk/', meaning: '喝' },
  ]},
  { lesson: 33, title: '第33-34课: A fine day', words: [
    { word: 'day', phonetic: '/deɪ/', meaning: '日子' },
    { word: 'cloud', phonetic: '/klaʊd/', meaning: '云' },
    { word: 'sky', phonetic: '/skaɪ/', meaning: '天空' },
    { word: 'sun', phonetic: '/sʌn/', meaning: '太阳' },
    { word: 'shine', phonetic: '/ʃaɪn/', meaning: '照耀' },
    { word: 'with', phonetic: '/wɪð/', meaning: '和...一起' },
    { word: 'family', phonetic: '/ˈfæməli/', meaning: '家庭' },
    { word: 'walk', phonetic: '/wɔːk/', meaning: '走路' },
    { word: 'over', phonetic: '/ˈəʊvə/', meaning: '在...上方' },
    { word: 'bridge', phonetic: '/brɪdʒ/', meaning: '桥' },
    { word: 'boat', phonetic: '/bəʊt/', meaning: '船' },
    { word: 'river', phonetic: '/ˈrɪvə/', meaning: '河' },
    { word: 'ship', phonetic: '/ʃɪp/', meaning: '轮船' },
    { word: 'aeroplane', phonetic: '/ˈeərəpleɪn/', meaning: '飞机' },
    { word: 'fly', phonetic: '/flaɪ/', meaning: '飞' },
  ]},
  { lesson: 35, title: '第35-36课: Our village', words: [
    { word: 'photograph', phonetic: '/ˈfəʊtəɡrɑːf/', meaning: '照片' },
    { word: 'village', phonetic: '/ˈvɪlɪdʒ/', meaning: '村庄' },
    { word: 'valley', phonetic: '/ˈvæli/', meaning: '山谷' },
    { word: 'between', phonetic: '/bɪˈtwiːn/', meaning: '在...之间' },
    { word: 'hill', phonetic: '/hɪl/', meaning: '小山' },
    { word: 'another', phonetic: '/əˈnʌðə/', meaning: '另一个' },
    { word: 'wife', phonetic: '/waɪf/', meaning: '妻子' },
    { word: 'along', phonetic: '/əˈlɒŋ/', meaning: '沿着' },
    { word: 'bank', phonetic: '/bæŋk/', meaning: '河岸' },
    { word: 'water', phonetic: '/ˈwɔːtə/', meaning: '水' },
    { word: 'swim', phonetic: '/swɪm/', meaning: '游泳' },
    { word: 'building', phonetic: '/ˈbɪldɪŋ/', meaning: '大楼' },
    { word: 'park', phonetic: '/pɑːk/', meaning: '公园' },
    { word: 'into', phonetic: '/ˈɪntə/', meaning: '进入' },
    { word: 'beside', phonetic: '/bɪˈsaɪd/', meaning: '在...旁边' },
    { word: 'off', phonetic: '/ɒf/', meaning: '离开' },
  ]},
  { lesson: 37, title: '第37-38课: Making a bookcase', words: [
    { word: 'bookcase', phonetic: '/ˈbʊkkeɪs/', meaning: '书柜' },
    { word: 'hammer', phonetic: '/ˈhæmə/', meaning: '锤子' },
    { word: 'pink', phonetic: '/pɪŋk/', meaning: '粉色的' },
    { word: 'favorite', phonetic: '/ˈfeɪvərɪt/', meaning: '最喜欢的' },
    { word: 'work', phonetic: '/wɜːk/', meaning: '工作' },
    { word: 'hard', phonetic: '/hɑːd/', meaning: '努力地' },
    { word: 'make', phonetic: '/meɪk/', meaning: '做' },
    { word: 'paint', phonetic: '/peɪnt/', meaning: '刷漆' },
    { word: 'pink', phonetic: '/pɪŋk/', meaning: '粉色的' },
    { word: 'homework', phonetic: '/ˈhəʊmwɜːk/', meaning: '作业' },
    { word: 'listen', phonetic: '/ˈlɪsn/', meaning: '听' },
    { word: 'dish', phonetic: '/dɪʃ/', meaning: '盘子' },
  ]},
  { lesson: 39, title: '第39-40课: Don\'t drop it!', words: [
    { word: 'front', phonetic: '/frʌnt/', meaning: '前面' },
    { word: 'careful', phonetic: '/ˈkeəfl/', meaning: '小心的' },
    { word: 'vase', phonetic: '/vɑːz/', meaning: '花瓶' },
    { word: 'drop', phonetic: '/drɒp/', meaning: '掉落' },
    { word: 'flower', phonetic: '/ˈflaʊə/', meaning: '花' },
    { word: 'show', phonetic: '/ʃəʊ/', meaning: '给...看' },
    { word: 'take', phonetic: '/teɪk/', meaning: '拿' },
    { word: 'send', phonetic: '/send/', meaning: '送给' },
    { word: 'give', phonetic: '/ɡɪv/', meaning: '给' },
    { word: 'cheese', phonetic: '/tʃiːz/', meaning: '奶酪' },
    { word: 'bread', phonetic: '/bred/', meaning: '面包' },
    { word: 'soap', phonetic: '/səʊp/', meaning: '肥皂' },
    { word: 'chocolate', phonetic: '/ˈtʃɒklət/', meaning: '巧克力' },
    { word: 'sugar', phonetic: '/ˈʃʊɡə/', meaning: '糖' },
    { word: 'coffee', phonetic: '/ˈkɒfi/', meaning: '咖啡' },
    { word: 'tea', phonetic: '/tiː/', meaning: '茶' },
  ]},
  { lesson: 41, title: '第41-42课: Penny\'s bag', words: [
    { word: 'bag', phonetic: '/bæɡ/', meaning: '包' },
    { word: 'cheese', phonetic: '/tʃiːz/', meaning: '奶酪' },
    { word: 'bread', phonetic: '/bred/', meaning: '面包' },
    { word: 'soap', phonetic: '/səʊp/', meaning: '肥皂' },
    { word: 'chocolate', phonetic: '/ˈtʃɒklət/', meaning: '巧克力' },
    { word: 'sugar', phonetic: '/ˈʃʊɡə/', meaning: '糖' },
    { word: 'coffee', phonetic: '/ˈkɒfi/', meaning: '咖啡' },
    { word: 'tea', phonetic: '/tiː/', meaning: '茶' },
    { word: 'tobacco', phonetic: '/təˈbækəʊ/', meaning: '烟草' },
    { word: 'piece', phonetic: '/piːs/', meaning: '块' },
    { word: 'bar', phonetic: '/bɑː/', meaning: '条' },
    { word: 'bottle', phonetic: '/ˈbɒtl/', meaning: '瓶' },
    { word: 'pound', phonetic: '/paʊnd/', meaning: '磅' },
    { word: 'quarter', phonetic: '/ˈkwɔːtə/', meaning: '四分之一' },
    { word: 'tin', phonetic: '/tɪn/', meaning: '罐头' },
  ]},
  { lesson: 43, title: '第43-44课: Hurry up!', words: [
    { word: 'boil', phonetic: '/bɔɪl/', meaning: '沸腾' },
    { word: 'kettle', phonetic: '/ˈketl/', meaning: '水壶' },
    { word: 'behind', phonetic: '/bɪˈhaɪnd/', meaning: '在...后面' },
    { word: 'teapot', phonetic: '/ˈtiːpɒt/', meaning: '茶壶' },
    { word: 'now', phonetic: '/naʊ/', meaning: '现在' },
    { word: 'find', phonetic: '/faɪnd/', meaning: '找到' },
    { word: 'hurry', phonetic: '/ˈhʌri/', meaning: '赶快' },
    { word: 'cup', phonetic: '/kʌp/', meaning: '茶杯' },
    { word: 'tea', phonetic: '/tiː/', meaning: '茶' },
    { word: 'biscuit', phonetic: '/ˈbɪskɪt/', meaning: '饼干' },
  ]},
  { lesson: 45, title: '第45-46课: The boss\'s letter', words: [
    { word: 'can', phonetic: '/kæn/', meaning: '能' },
    { word: 'boss', phonetic: '/bɒs/', meaning: '老板' },
    { word: 'minute', phonetic: '/ˈmɪnɪt/', meaning: '分钟' },
    { word: 'ask', phonetic: '/ɑːsk/', meaning: '问' },
    { word: 'handwriting', phonetic: '/ˈhændraɪtɪŋ/', meaning: '书写' },
    { word: 'terrible', phonetic: '/ˈterəbl/', meaning: '糟糕的' },
    { word: 'lift', phonetic: '/lɪft/', meaning: '举起' },
    { word: 'cake', phonetic: '/keɪk/', meaning: '蛋糕' },
    { word: 'biscuit', phonetic: '/ˈbɪskɪt/', meaning: '饼干' },
  ]},
  { lesson: 47, title: '第47-48课: A cup of coffee', words: [
    { word: 'like', phonetic: '/laɪk/', meaning: '喜欢' },
    { word: 'want', phonetic: '/wɒnt/', meaning: '想要' },
    { word: 'fresh', phonetic: '/freʃ/', meaning: '新鲜的' },
    { word: 'egg', phonetic: '/eɡ/', meaning: '鸡蛋' },
    { word: 'butter', phonetic: '/ˈbʌtə/', meaning: '黄油' },
    { word: 'pure', phonetic: '/pjʊə/', meaning: '纯净的' },
    { word: 'honey', phonetic: '/ˈhʌni/', meaning: '蜂蜜' },
    { word: 'ripe', phonetic: '/raɪp/', meaning: '熟的' },
    { word: 'banana', phonetic: '/bəˈnɑːnə/', meaning: '香蕉' },
    { word: 'jam', phonetic: '/dʒæm/', meaning: '果酱' },
    { word: 'sweet', phonetic: '/swiːt/', meaning: '甜的' },
    { word: 'orange', phonetic: '/ˈɒrɪndʒ/', meaning: '橙子' },
    { word: 'whisky', phonetic: '/ˈwɪski/', meaning: '威士忌' },
    { word: 'apple', phonetic: '/ˈæpl/', meaning: '苹果' },
    { word: 'choice', phonetic: '/tʃɔɪs/', meaning: '选择' },
  ]},
  { lesson: 49, title: '第49-50课: At the butcher\'s', words: [
    { word: 'butcher', phonetic: '/ˈbʊtʃə/', meaning: '卖肉的' },
    { word: 'meat', phonetic: '/miːt/', meaning: '肉' },
    { word: 'beef', phonetic: '/biːf/', meaning: '牛肉' },
    { word: 'mince', phonetic: '/mɪns/', meaning: '肉馅' },
    { word: 'chicken', phonetic: '/ˈtʃɪkɪn/', meaning: '鸡' },
    { word: 'truth', phonetic: '/truːθ/', meaning: '真相' },
    { word: 'either', phonetic: '/ˈaɪðə/', meaning: '也(否定)' },
    { word: 'tomato', phonetic: '/təˈmɑːtəʊ/', meaning: '西红柿' },
    { word: 'potato', phonetic: '/pəˈteɪtəʊ/', meaning: '土豆' },
    { word: 'cabbage', phonetic: '/ˈkæbɪdʒ/', meaning: '卷心菜' },
    { word: 'lettuce', phonetic: '/ˈletɪs/', meaning: '生菜' },
    { word: 'pea', phonetic: '/piː/', meaning: '豌豆' },
    { word: 'bean', phonetic: '/biːn/', meaning: '豆子' },
    { word: 'pear', phonetic: '/peə/', meaning: '梨' },
    { word: 'peach', phonetic: '/piːtʃ/', meaning: '桃子' },
    { word: 'grape', phonetic: '/ɡreɪp/', meaning: '葡萄' },
  ]},
  { lesson: 51, title: '第51-52课: A pleasant climate', words: [
    { word: 'Greece', phonetic: '/ɡriːs/', meaning: '希腊' },
    { word: 'climate', phonetic: '/ˈklaɪmət/', meaning: '气候' },
    { word: 'country', phonetic: '/ˈkʌntri/', meaning: '国家' },
    { word: 'pleasant', phonetic: '/ˈpleznt/', meaning: '宜人的' },
    { word: 'weather', phonetic: '/ˈweðə/', meaning: '天气' },
    { word: 'spring', phonetic: '/sprɪŋ/', meaning: '春天' },
    { word: 'windy', phonetic: '/ˈwɪndi/', meaning: '有风的' },
    { word: 'warm', phonetic: '/wɔːm/', meaning: '温暖的' },
    { word: 'rain', phonetic: '/reɪn/', meaning: '下雨' },
    { word: 'summer', phonetic: '/ˈsʌmə/', meaning: '夏天' },
    { word: 'autumn', phonetic: '/ˈɔːtəm/', meaning: '秋天' },
    { word: 'winter', phonetic: '/ˈwɪntə/', meaning: '冬天' },
    { word: 'snow', phonetic: '/snəʊ/', meaning: '下雪' },
    { word: 'January', phonetic: '/ˈdʒænjuəri/', meaning: '一月' },
    { word: 'February', phonetic: '/ˈfebruəri/', meaning: '二月' },
    { word: 'March', phonetic: '/mɑːtʃ/', meaning: '三月' },
    { word: 'April', phonetic: '/ˈeɪprəl/', meaning: '四月' },
    { word: 'May', phonetic: '/meɪ/', meaning: '五月' },
    { word: 'June', phonetic: '/dʒuːn/', meaning: '六月' },
    { word: 'July', phonetic: '/dʒuˈlaɪ/', meaning: '七月' },
    { word: 'August', phonetic: '/ˈɔːɡəst/', meaning: '八月' },
    { word: 'September', phonetic: '/sepˈtembə/', meaning: '九月' },
    { word: 'October', phonetic: '/ɒkˈtəʊbə/', meaning: '十月' },
    { word: 'November', phonetic: '/nəʊˈvembə/', meaning: '十一月' },
    { word: 'December', phonetic: '/dɪˈsembə/', meaning: '十二月' },
  ]},
  { lesson: 53, title: '第53-54课: An interesting climate', words: [
    { word: 'conversation', phonetic: '/ˌkɒnvəˈseɪʃən/', meaning: '谈话' },
    { word: 'interesting', phonetic: '/ˈɪntrəstɪŋ/', meaning: '有趣的' },
    { word: 'Australia', phonetic: '/ɒˈstreɪliə/', meaning: '澳大利亚' },
    { word: 'Australian', phonetic: '/ɒˈstreɪliən/', meaning: '澳大利亚的' },
    { word: 'Canada', phonetic: '/ˈkænədə/', meaning: '加拿大' },
    { word: 'Canadian', phonetic: '/kəˈneɪdiən/', meaning: '加拿大的' },
    { word: 'India', phonetic: '/ˈɪndiə/', meaning: '印度' },
    { word: 'Indian', phonetic: '/ˈɪndiən/', meaning: '印度的' },
    { word: 'Britain', phonetic: '/ˈbrɪtn/', meaning: '英国' },
    { word: 'west', phonetic: '/west/', meaning: '西方' },
    { word: 'east', phonetic: '/iːst/', meaning: '东方' },
    { word: 'north', phonetic: '/nɔːθ/', meaning: '北方' },
    { word: 'south', phonetic: '/saʊθ/', meaning: '南方' },
  ]},
  { lesson: 55, title: '第55-56课: The Sawyer family', words: [
    { word: 'live', phonetic: '/lɪv/', meaning: '居住' },
    { word: 'street', phonetic: '/striːt/', meaning: '街道' },
    { word: 'morning', phonetic: '/ˈmɔːnɪŋ/', meaning: '早上' },
    { word: 'stay', phonetic: '/steɪ/', meaning: '待在' },
    { word: 'house', phonetic: '/haʊs/', meaning: '房子' },
    { word: 'noon', phonetic: '/nuːn/', meaning: '中午' },
    { word: 'usually', phonetic: '/ˈjuːʒuəli/', meaning: '通常' },
    { word: 'together', phonetic: '/təˈɡeðə/', meaning: '一起' },
    { word: 'evening', phonetic: '/ˈiːvnɪŋ/', meaning: '傍晚' },
    { word: 'arrive', phonetic: '/əˈraɪv/', meaning: '到达' },
    { word: 'home', phonetic: '/həʊm/', meaning: '家' },
    { word: 'night', phonetic: '/naɪt/', meaning: '夜里' },
    { word: 'sometimes', phonetic: '/ˈsʌmtaɪmz/', meaning: '有时' },
    { word: 'homework', phonetic: '/ˈhəʊmwɜːk/', meaning: '作业' },
  ]},
  { lesson: 57, title: '第57-58课: An unusual day', words: [
    { word: "o'clock", phonetic: '/əˈklɒk/', meaning: '点钟' },
    { word: 'shop', phonetic: '/ʃɒp/', meaning: '商店' },
    { word: 'moment', phonetic: '/ˈməʊmənt/', meaning: '片刻' },
    { word: 'usually', phonetic: '/ˈjuːʒuəli/', meaning: '通常' },
    { word: 'today', phonetic: '/təˈdeɪ/', meaning: '今天' },
    { word: 'by car', phonetic: '/baɪ kɑː/', meaning: '坐汽车' },
    { word: 'on foot', phonetic: '/ɒn fʊt/', meaning: '步行' },
    { word: 'stay', phonetic: '/steɪ/', meaning: '待在' },
    { word: 'drink', phonetic: '/drɪŋk/', meaning: '喝' },
    { word: 'together', phonetic: '/təˈɡeðə/', meaning: '一起' },
  ]},
  { lesson: 59, title: '第59-60课: Is that all?', words: [
    { word: 'envelope', phonetic: '/ˈenvələʊp/', meaning: '信封' },
    { word: 'writing paper', phonetic: '/ˈraɪtɪŋ peɪpə/', meaning: '信纸' },
    { word: 'shop assistant', phonetic: '/ʃɒp əˈsɪstənt/', meaning: '店员' },
    { word: 'size', phonetic: '/saɪz/', meaning: '尺寸' },
    { word: 'pad', phonetic: '/pæd/', meaning: '便笺簿' },
    { word: 'glue', phonetic: '/ɡluː/', meaning: '胶水' },
    { word: 'chalk', phonetic: '/tʃɔːk/', meaning: '粉笔' },
    { word: 'change', phonetic: '/tʃeɪndʒ/', meaning: '零钱' },
    { word: 'blue', phonetic: '/bluː/', meaning: '蓝色的' },
    { word: 'black', phonetic: '/blæk/', meaning: '黑色的' },
  ]},
  { lesson: 61, title: '第61-62课: A bad cold', words: [
    { word: 'feel', phonetic: '/fiːl/', meaning: '感觉' },
    { word: 'look', phonetic: '/lʊk/', meaning: '看起来' },
    { word: 'must', phonetic: '/mʌst/', meaning: '必须' },
    { word: 'call', phonetic: '/kɔːl/', meaning: '叫' },
    { word: 'doctor', phonetic: '/ˈdɒktə/', meaning: '医生' },
    { word: 'remember', phonetic: '/rɪˈmembə/', meaning: '记得' },
    { word: 'tongue', phonetic: '/tʌŋ/', meaning: '舌头' },
    { word: 'show', phonetic: '/ʃəʊ/', meaning: '给...看' },
    { word: 'mouth', phonetic: '/maʊθ/', meaning: '嘴' },
    { word: 'bad', phonetic: '/bæd/', meaning: '坏的' },
    { word: 'cold', phonetic: '/kəʊld/', meaning: '感冒' },
    { word: 'news', phonetic: '/njuːz/', meaning: '消息' },
    { word: 'headache', phonetic: '/ˈhedeɪk/', meaning: '头痛' },
    { word: 'aspirin', phonetic: '/ˈæsprɪn/', meaning: '阿司匹林' },
    { word: 'earache', phonetic: '/ˈɪəreɪk/', meaning: '耳痛' },
    { word: 'toothache', phonetic: '/ˈtuːθeɪk/', meaning: '牙痛' },
    { word: 'stomach ache', phonetic: '/ˈstʌmək eɪk/', meaning: '胃痛' },
    { word: 'temperature', phonetic: '/ˈtemprətʃə/', meaning: '体温' },
    { word: 'flu', phonetic: '/fluː/', meaning: '流感' },
    { word: 'measles', phonetic: '/ˈmiːzlz/', meaning: '麻疹' },
    { word: 'mumps', phonetic: '/mʌmps/', meaning: '腮腺炎' },
  ]},
  { lesson: 63, title: '第63-64课: Thank you, doctor', words: [
    { word: 'better', phonetic: '/ˈbetə/', meaning: '好些了' },
    { word: 'certainly', phonetic: '/ˈsɜːtnli/', meaning: '当然' },
    { word: 'get up', phonetic: '/ɡet ʌp/', meaning: '起床' },
    { word: 'yet', phonetic: '/jet/', meaning: '还' },
    { word: 'rich', phonetic: '/rɪtʃ/', meaning: '油腻的' },
    { word: 'food', phonetic: '/fuːd/', meaning: '食物' },
    { word: 'remain', phonetic: '/rɪˈmeɪn/', meaning: '保持' },
    { word: 'play', phonetic: '/pleɪ/', meaning: '玩' },
    { word: 'match', phonetic: '/mætʃ/', meaning: '比赛' },
    { word: 'library', phonetic: '/ˈlaɪbrəri/', meaning: '图书馆' },
    { word: 'drive', phonetic: '/draɪv/', meaning: '开车' },
    { word: 'so', phonetic: '/səʊ/', meaning: '如此地' },
    { word: 'quickly', phonetic: '/ˈkwɪkli/', meaning: '快地' },
    { word: 'lean out of', phonetic: '/liːn aʊt əv/', meaning: '探出' },
    { word: 'break', phonetic: '/breɪk/', meaning: '打破' },
  ]},
  { lesson: 65, title: '第65-66课: Not a baby', words: [
    { word: 'absent', phonetic: '/ˈæbsənt/', meaning: '缺席的' },
    { word: 'keep', phonetic: '/kiːp/', meaning: '保持' },
    { word: 'spend', phonetic: '/spend/', meaning: '度过' },
    { word: 'holiday', phonetic: '/ˈhɒlədeɪ/', meaning: '假日' },
    { word: 'country', phonetic: '/ˈkʌntri/', meaning: '乡下' },
    { word: 'lucky', phonetic: '/ˈlʌki/', meaning: '幸运的' },
    { word: 'well', phonetic: '/wel/', meaning: '好吧' },
    { word: 'key', phonetic: '/kiː/', meaning: '钥匙' },
    { word: 'baby', phonetic: '/ˈbeɪbi/', meaning: '婴儿' },
    { word: 'hear', phonetic: '/hɪə/', meaning: '听见' },
    { word: 'enjoy', phonetic: '/ɪnˈdʒɔɪ/', meaning: '享受' },
    { word: 'yourself', phonetic: '/jɔːˈself/', meaning: '你自己' },
    { word: 'mum', phonetic: '/mʌm/', meaning: '妈妈' },
  ]},
  { lesson: 67, title: '第67-68课: The weekend', words: [
    { word: 'weekend', phonetic: '/ˌwiːkˈend/', meaning: '周末' },
    { word: 'Friday', phonetic: '/ˈfraɪdeɪ/', meaning: '星期五' },
    { word: 'Saturday', phonetic: '/ˈsætədeɪ/', meaning: '星期六' },
    { word: 'Sunday', phonetic: '/ˈsʌndeɪ/', meaning: '星期日' },
    { word: 'country', phonetic: '/ˈkʌntri/', meaning: '乡下' },
    { word: 'luck', phonetic: '/lʌk/', meaning: '运气' },
    { word: 'church', phonetic: '/tʃɜːtʃ/', meaning: '教堂' },
    { word: 'dairy', phonetic: '/ˈdeəri/', meaning: '乳品店' },
    { word: 'Monday', phonetic: '/ˈmʌndeɪ/', meaning: '星期一' },
    { word: 'Tuesday', phonetic: '/ˈtjuːzdeɪ/', meaning: '星期二' },
    { word: 'Wednesday', phonetic: '/ˈwenzdeɪ/', meaning: '星期三' },
    { word: 'Thursday', phonetic: '/ˈθɜːzdeɪ/', meaning: '星期四' },
    { word: 'stay', phonetic: '/steɪ/', meaning: '待在' },
  ]},
  { lesson: 69, title: '第69-70课: The car race', words: [
    { word: 'year', phonetic: '/jɪə/', meaning: '年' },
    { word: 'race', phonetic: '/reɪs/', meaning: '比赛' },
    { word: 'town', phonetic: '/taʊn/', meaning: '城镇' },
    { word: 'crowd', phonetic: '/kraʊd/', meaning: '人群' },
    { word: 'stand', phonetic: '/stænd/', meaning: '站立' },
    { word: 'exciting', phonetic: '/ɪkˈsaɪtɪŋ/', meaning: '令人激动的' },
    { word: 'finish', phonetic: '/ˈfɪnɪʃ/', meaning: '结束' },
    { word: 'winner', phonetic: '/ˈwɪnə/', meaning: '获胜者' },
    { word: 'way', phonetic: '/weɪ/', meaning: '路途' },
    { word: 'just', phonetic: '/dʒʌst/', meaning: '正好' },
    { word: 'driver', phonetic: '/ˈdraɪvə/', meaning: '司机' },
    { word: 'engine', phonetic: '/ˈendʒɪn/', meaning: '发动机' },
    { word: 'expensive', phonetic: '/ɪkˈspensɪv/', meaning: '昂贵的' },
    { word: 'cheap', phonetic: '/tʃiːp/', meaning: '便宜的' },
  ]},
  { lesson: 71, title: '第71-72课: He\'s awful!', words: [
    { word: 'phone', phonetic: '/fəʊn/', meaning: '打电话' },
    { word: 'again', phonetic: '/əˈɡen/', meaning: '又' },
    { word: 'say', phonetic: '/seɪ/', meaning: '说' },
    { word: 'awful', phonetic: '/ˈɔːfl/', meaning: '糟糕的' },
    { word: 'answer', phonetic: '/ˈɑːnsə/', meaning: '回答' },
    { word: 'time', phonetic: '/taɪm/', meaning: '次' },
    { word: 'last', phonetic: '/lɑːst/', meaning: '最后的' },
    { word: 'phone', phonetic: '/fəʊn/', meaning: '电话' },
    { word: 'ago', phonetic: '/əˈɡəʊ/', meaning: '以前' },
    { word: 'appointment', phonetic: '/əˈpɔɪntmənt/', meaning: '预约' },
    { word: 'urgent', phonetic: '/ˈɜːdʒənt/', meaning: '紧急的' },
    { word: 'until', phonetic: '/ənˈtɪl/', meaning: '直到' },
  ]},
  { lesson: 73, title: '第73-74课: The way to King Street', words: [
    { word: 'way', phonetic: '/weɪ/', meaning: '路线' },
    { word: 'know', phonetic: '/nəʊ/', meaning: '知道' },
    { word: 'understand', phonetic: '/ˌʌndəˈstænd/', meaning: '明白' },
    { word: 'hand', phonetic: '/hænd/', meaning: '手' },
    { word: 'pocket', phonetic: '/ˈpɒkɪt/', meaning: '口袋' },
    { word: 'phrasebook', phonetic: '/ˈfreɪzbʊk/', meaning: '短语手册' },
    { word: 'phrase', phonetic: '/freɪz/', meaning: '短语' },
    { word: 'slowly', phonetic: '/ˈsləʊli/', meaning: '慢慢地' },
    { word: 'smile', phonetic: '/smaɪl/', meaning: '微笑' },
    { word: 'pleasant', phonetic: '/ˈpleznt/', meaning: '愉快的' },
    { word: 'suddenly', phonetic: '/ˈsʌdənli/', meaning: '突然地' },
    { word: 'cut', phonetic: '/kʌt/', meaning: '割' },
    { word: 'thirsty', phonetic: '/ˈθɜːsti/', meaning: '口渴的' },
  ]},
  { lesson: 75, title: '第75-76课: Uncomfortable shoes', words: [
    { word: 'uncomfortable', phonetic: '/ʌnˈkʌmftəbl/', meaning: '不舒服的' },
    { word: 'shoes', phonetic: '/ʃuːz/', meaning: '鞋子' },
    { word: 'wear', phonetic: '/weə/', meaning: '穿着' },
    { word: 'ago', phonetic: '/əˈɡəʊ/', meaning: '以前' },
    { word: 'buy', phonetic: '/baɪ/', meaning: '买' },
    { word: 'pair', phonetic: '/peə/', meaning: '双' },
    { word: 'fashion', phonetic: '/ˈfæʃən/', meaning: '时尚' },
    { word: 'uncomfortable', phonetic: '/ʌnˈkʌmftəbl/', meaning: '不舒服的' },
    { word: 'style', phonetic: '/staɪl/', meaning: '款式' },
    { word: 'pretty', phonetic: '/ˈprɪti/', meaning: '漂亮的' },
    { word: 'tight', phonetic: '/taɪt/', meaning: '紧的' },
  ]},
  { lesson: 77, title: '第77-78课: Terrible toothache', words: [
    { word: 'appointment', phonetic: '/əˈpɔɪntmənt/', meaning: '预约' },
    { word: 'toothache', phonetic: '/ˈtuːθeɪk/', meaning: '牙痛' },
    { word: 'dentist', phonetic: '/ˈdentɪst/', meaning: '牙医' },
    { word: 'urgent', phonetic: '/ˈɜːdʒənt/', meaning: '紧急的' },
    { word: 'see', phonetic: '/siː/', meaning: '看' },
    { word: 'terrible', phonetic: '/ˈterəbl/', meaning: '糟糕的' },
    { word: 'at the moment', phonetic: '/ət ðə ˈməʊmənt/', meaning: '此刻' },
    { word: 'ready', phonetic: '/ˈredi/', meaning: '准备好的' },
    { word: 'right', phonetic: '/raɪt/', meaning: '右边的' },
    { word: 'cancel', phonetic: '/ˈkænsl/', meaning: '取消' },
    { word: 'at last', phonetic: '/ət lɑːst/', meaning: '终于' },
    { word: 'cancel', phonetic: '/ˈkænsl/', meaning: '取消' },
  ]},
  { lesson: 79, title: '第79-80课: Carol\'s shopping list', words: [
    { word: 'shopping', phonetic: '/ˈʃɒpɪŋ/', meaning: '购物' },
    { word: 'list', phonetic: '/lɪst/', meaning: '清单' },
    { word: 'vegetable', phonetic: '/ˈvedʒtəbl/', meaning: '蔬菜' },
    { word: 'need', phonetic: '/niːd/', meaning: '需要' },
    { word: 'hope', phonetic: '/həʊp/', meaning: '希望' },
    { word: 'thing', phonetic: '/θɪŋ/', meaning: '东西' },
    { word: 'money', phonetic: '/ˈmʌni/', meaning: '钱' },
    { word: 'groceries', phonetic: '/ˈɡrəʊsəriz/', meaning: '食品杂货' },
    { word: 'stationery', phonetic: '/ˈsteɪʃənri/', meaning: '文具' },
    { word: 'newsagent', phonetic: '/ˈnjuːzeɪdʒənt/', meaning: '报刊经销商' },
    { word: 'chemist', phonetic: '/ˈkemɪst/', meaning: '药店' },
    { word: 'bread', phonetic: '/bred/', meaning: '面包' },
    { word: 'cheese', phonetic: '/tʃiːz/', meaning: '奶酪' },
    { word: 'eggs', phonetic: '/eɡz/', meaning: '鸡蛋' },
    { word: 'potatoes', phonetic: '/pəˈteɪtəʊz/', meaning: '土豆' },
    { word: 'tomatoes', phonetic: '/təˈmɑːtəʊz/', meaning: '西红柿' },
  ]},
];

/* ====== 单词卡 ====== */
const WordCards = {
  index: 0,
  flipped: false,
  lessonIdx: 0,

  init() {
    document.getElementById('wordPrev').addEventListener('click', () => this.prev());
    document.getElementById('wordNext').addEventListener('click', () => this.next());
    document.getElementById('wordFlip').addEventListener('click', () => this.flip());
    document.getElementById('wordLessonPrev').addEventListener('click', () => this.prevLesson());
    document.getElementById('wordLessonNext').addEventListener('click', () => this.nextLesson());
    // 恢复上次课次
    if (DB.nce1Lesson && DB.nce1Lesson < NCE1_VOCAB.length) {
      this.lessonIdx = DB.nce1Lesson;
    }
    this.index = 0;
    this.show();
  },

  getCurrentWords() {
    const lesson = NCE1_VOCAB[this.lessonIdx];
    return lesson ? lesson.words : [];
  },

  updateLessonInfo() {
    const lesson = NCE1_VOCAB[this.lessonIdx];
    if (lesson) {
      document.getElementById('wordLessonInfo').textContent = lesson.title;
    }
  },

  prevLesson() {
    if (this.lessonIdx > 0) {
      this.lessonIdx--;
      DB.nce1Lesson = this.lessonIdx;
      saveDB();
      this.index = 0;
      this.show();
      this.updateLessonInfo();
    }
  },

  nextLesson() {
    if (this.lessonIdx < NCE1_VOCAB.length - 1) {
      this.lessonIdx++;
      DB.nce1Lesson = this.lessonIdx;
      saveDB();
      this.index = 0;
      this.show();
      this.updateLessonInfo();
    }
  },

  show() {
    const words = this.getCurrentWords();
    if (words.length === 0) {
      document.getElementById('wordCardWord').textContent = '暂无单词';
      document.getElementById('wordCardPhonetic').textContent = '';
      document.getElementById('wordCardMeaning').textContent = '';
      return;
    }
    if (this.index >= words.length) this.index = 0;
    if (this.index < 0) this.index = words.length - 1;
    const card = words[this.index];
    this.flipped = false;
    document.getElementById('wordCardWord').textContent = card.word;
    document.getElementById('wordCardPhonetic').textContent = card.phonetic || '';
    document.getElementById('wordCardMeaning').textContent = '';
    // 语音朗读英文单词
    speak(card.word, 'en-US');
    this.updateLessonInfo();
  },

  flip() {
    const words = this.getCurrentWords();
    if (words.length === 0) return;
    const card = words[this.index];
    this.flipped = !this.flipped;
    if (this.flipped) {
      document.getElementById('wordCardWord').textContent = card.meaning;
      document.getElementById('wordCardPhonetic').textContent = card.word;
      document.getElementById('wordCardMeaning').textContent = '';
      speak(card.meaning, 'zh-CN');
    } else {
      document.getElementById('wordCardWord').textContent = card.word;
      document.getElementById('wordCardPhonetic').textContent = card.phonetic || '';
      document.getElementById('wordCardMeaning').textContent = '';
      speak(card.word, 'en-US');
    }
  },

  next() {
    this.index++;
    this.show();
  },

  prev() {
    this.index--;
    this.show();
  }
};

/* ====== 备忘录（P1: 使用 textContent 防注入） ====== */
const Memo = {
  init() {
    document.getElementById('memoAddBtn').addEventListener('click', () => this.add());
    document.getElementById('memoInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.add();
    });
    this.render();
  },

  add() {
    const input = document.getElementById('memoInput');
    const text = input.value.trim();
    if (!text) return;
    DB.memos.unshift({ id: uid(), text, date: todayStr() });
    saveDB();
    input.value = '';
    this.render();
    toast('已添加备忘');
  },

  remove(id) {
    DB.memos = DB.memos.filter(m => m.id !== id);
    saveDB();
    this.render();
  },

  render() {
    const el = document.getElementById('memoList');
    if (DB.memos.length === 0) {
      el.innerHTML = '<div class="empty-state">还没有备忘记录</div>';
      return;
    }
    // 使用 DOM 操作而非 innerHTML 拼接用户输入
    el.innerHTML = '';
    DB.memos.forEach(m => {
      const item = document.createElement('div');
      item.className = 'memo-item';

      const textEl = document.createElement('span');
      textEl.className = 'memo-text';
      textEl.textContent = m.text; // 安全：textContent

      const dateEl = document.createElement('span');
      dateEl.className = 'memo-date';
      dateEl.textContent = m.date;

      const delBtn = document.createElement('button');
      delBtn.className = 'memo-delete';
      delBtn.textContent = '🗑️';
      delBtn.setAttribute('aria-label', '删除备忘');
      delBtn.addEventListener('click', () => {
        showConfirm('删除备忘', '确定要删除这条备忘吗？', () => this.remove(m.id));
      });

      item.appendChild(textEl);
      item.appendChild(dateEl);
      item.appendChild(delBtn);
      el.appendChild(item);
    });
  }
};

/* ====== 工具面板开关 ====== */
function openTool(toolName) {
  // 趣味乐园需要家长密码验证才能进入
  if (toolName === 'fun') {
    openPasswordModal(
      () => { _doOpenTool('fun'); },
      () => { /* 取消，不打开 */ },
      '请家长输入密码以开启趣味乐园'
    );
    return;
  }
  _doOpenTool(toolName);
}

function _doOpenTool(toolName) {
  document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('show'));
  const panel = document.getElementById('tool-' + toolName);
  if (panel) {
    panel.classList.add('show');
    panel.setAttribute('aria-hidden', 'false');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (toolName === 'math') MathPractice.showStart();
    if (toolName === 'fun') FunPark.showHome();
  }
  // 语音播报工具名称
  const toolNames = { timer: '计时器', calculator: '计算器', pinyin: '拼音表', words: '单词卡', memo: '备忘录', math: '数学练习', fun: '趣味乐园' };
  speak(toolNames[toolName]);
}

function closeTool(toolName) {
  const panel = document.getElementById('tool-' + toolName);
  if (!panel) return;

  // 数学练习关闭时自动保存进度
  if (toolName === 'math') {
    const quizEl = document.getElementById('mathQuiz');
    if (quizEl && quizEl.style.display !== 'none' && MathPractice.questions.length > 0) {
      MathPractice.saveState();
      toast('练习进度已保存，下次可继续');
    }
  }
  // 趣味乐园关闭时只停止界面刷新定时器，旅行状态不变
  if (toolName === 'fun') {
    if (FunPark.timerId) { clearInterval(FunPark.timerId); FunPark.timerId = null; }
  }

  // 只关闭界面，不清除任何游戏/工具状态
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');

  // 焦点回到对应的工具卡片
  const card = document.querySelector(`.tool-card[data-tool="${toolName}"]`);
  if (card) {
    card.focus();
  }
}

/* ====== 家长面板Tab切换 ====== */
function switchParentTab(tabName) {
  document.querySelectorAll('.parent-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.parent-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.parent-tab-btn[data-parent-tab="${tabName}"]`).classList.add('active');
  document.getElementById('parent-' + tabName).classList.add('active');
}

/* ====== 声音开关 ====== */
function toggleSound() {
  DB.settings.soundEnabled = !DB.settings.soundEnabled;
  saveDB();
  const sw = document.getElementById('soundSwitch');
  sw.classList.toggle('on', DB.settings.soundEnabled);
  sw.setAttribute('aria-checked', DB.settings.soundEnabled ? 'true' : 'false');
  if (DB.settings.soundEnabled) {
    playChime();
    toast('声音已开启');
  } else {
    toast('声音已关闭');
  }
}

/* ====== 语音播报开关（V1.2新增） ====== */
function toggleSpeech() {
  DB.settings.speechEnabled = !DB.settings.speechEnabled;
  saveDB();
  const sw = document.getElementById('speechSwitch');
  sw.classList.toggle('on', DB.settings.speechEnabled);
  sw.setAttribute('aria-checked', DB.settings.speechEnabled ? 'true' : 'false');
  if (DB.settings.speechEnabled) {
    speak('语音播报已开启');
    toast('语音播报已开启');
  } else {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    toast('语音播报已关闭');
  }
}

/* ====== 事件绑定 ====== */
function bindEvents() {
  // Tab导航
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 日程视图切换（今日/本周）
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      scheduleView = btn.dataset.view;
      speak(scheduleView === 'today' ? '今日' : '本周');
      document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + scheduleView).classList.add('active');
      renderSchedulePage();
    });
  });

  // 绿宝石总数卡点击播报
  const starSummary = document.getElementById('starSummaryCard');
  if (starSummary) {
    starSummary.style.cursor = 'pointer';
    starSummary.addEventListener('click', () => {
      speak(`现在有${DB.starLog.total}颗绿宝石`);
    });
  }
  const rewardStarCard = document.querySelector('.reward-star-card');
  if (rewardStarCard) {
    rewardStarCard.style.cursor = 'pointer';
    rewardStarCard.addEventListener('click', () => {
      speak(`现在有${DB.starLog.total}颗绿宝石`);
    });
  }

  // 小宠物卡片点击播报
  const petCard = document.getElementById('petCard');
  if (petCard) {
    petCard.style.cursor = 'pointer';
    petCard.addEventListener('click', () => {
      const pet = getPetInfo();
      speak(`这是${pet.name}，等级${pet.level}`);
    });
  }

  // 工具卡片
  document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', () => openTool(card.dataset.tool));
  });

  // 工具关闭
  document.querySelectorAll('.close-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeTool(btn.dataset.close);
    });
  });

  // 家长面板Tab
  document.querySelectorAll('.parent-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchParentTab(btn.dataset.parentTab));
  });

  // 模式切换（P1: 权限校验）
  document.getElementById('modeHoliday').addEventListener('click', () => {
    speak('假期模式');
    if (!requireParent()) return;
    DB.settings.mode = 'holiday';
    saveDB();
    renderSettingsPage();
    toast('已切换到假期模式');
  });
  document.getElementById('modeSchool').addEventListener('click', () => {
    speak('开学模式');
    if (!requireParent()) return;
    DB.settings.mode = 'school';
    saveDB();
    renderSettingsPage();
    toast('已切换到开学模式');
  });

  // 家长模式
  document.getElementById('parentModeBtn').addEventListener('click', toggleParentMode);

  // 声音开关
  const soundSwitch = document.getElementById('soundSwitch');
  soundSwitch.addEventListener('click', toggleSound);
  soundSwitch.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSound(); }
  });

  // 语音播报开关
  const speechSwitch = document.getElementById('speechSwitch');
  speechSwitch.addEventListener('click', toggleSpeech);
  speechSwitch.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSpeech(); }
  });

  // 添加按钮（P1: 权限校验在函数内部）
  document.getElementById('schAddBtn').addEventListener('click', addSchedule);
  document.getElementById('customAddBtn').addEventListener('click', addCustomSchedule);
  document.getElementById('taskAddBtn').addEventListener('click', addTask);
  document.getElementById('rewardAddBtn').addEventListener('click', addReward);
  document.getElementById('passwordSaveBtn').addEventListener('click', changePassword);
  document.getElementById('hwSubjectAddBtn').addEventListener('click', addHomeworkSubject);
  document.getElementById('hwSubjectName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addHomeworkSubject();
  });

  // 弹窗
  document.getElementById('passwordCancel').addEventListener('click', () => {
    document.getElementById('passwordModal').classList.remove('show');
  });
  document.getElementById('redeemCancel').addEventListener('click', closeRedeemModal);
  document.getElementById('redeemConfirm').addEventListener('click', confirmRedeem);

  // 删除确认弹窗
  document.getElementById('confirmNo').addEventListener('click', closeConfirm);
  document.getElementById('confirmYes').addEventListener('click', () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  });

  // 默认设置临时日程日期为今天
  const customDate = document.getElementById('customDate');
  if (customDate) customDate.value = todayStr();

  // 数学练习
  document.getElementById('mathStartBtn').addEventListener('click', () => MathPractice.start());
  document.getElementById('mathNextBtn').addEventListener('click', () => MathPractice.next());
  document.getElementById('mathRetryBtn').addEventListener('click', () => MathPractice.showStart());
  document.getElementById('mathExitBtn').addEventListener('click', () => MathPractice.exit());
  document.querySelectorAll('.math-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => MathPractice.setDifficulty(btn.dataset.diff));
  });

  // 趣味乐园
  document.getElementById('funPrepareBtn').addEventListener('click', () => FunPark.showPrepare());
  document.getElementById('funCancelPrepare').addEventListener('click', () => FunPark.showHome());
  document.getElementById('funGoBtn').addEventListener('click', () => FunPark.depart());
  // 收下礼物：只保留一套 click 事件（P0-2: 删除 onclick/pointerup/调试日志）
  document.getElementById('funCollectBtn').addEventListener('click', () => {
    const btn = document.getElementById('funCollectBtn');
    if (btn.disabled) return;
    FunPark.collect();
  });
  document.querySelectorAll('.fun-col-tab').forEach(tab => {
    tab.addEventListener('click', () => FunPark.switchCollectionTab(tab.dataset.colTab));
  });
}

/* ====== 数学练习模块（学而思一年级难度，三档可调） ====== */
const MathPractice = {
  questions: [],
  currentIdx: 0,
  correctCount: 0,
  answered: false,  // 当前题是否已作答

  DIFF_CONFIG: {
    easy:   { maxNum: 20,  label: '简单',  icon: '🟢' },
    medium: { maxNum: 50,  label: '中等',  icon: '🟡' },
    hard:   { maxNum: 100, label: '困难',  icon: '🔴' }
  },

  /* ---- 难度切换 ---- */
  setDifficulty(diff) {
    DB.mathPractice = DB.mathPractice || {};
    DB.mathPractice.difficulty = diff;
    saveDB();
    document.querySelectorAll('.math-diff-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.diff === diff);
    });
    toast(`难度已切换为：${this.DIFF_CONFIG[diff].label}`);
  },

  /* ---- 题目生成 ---- */
  genQuestions() {
    const diff = (DB.mathPractice && DB.mathPractice.difficulty) || 'easy';
    const cfg = this.DIFF_CONFIG[diff];
    const max = cfg.maxNum;
    const qs = [];

    // 根据难度选择题型组合
    let types;
    if (diff === 'easy') {
      types = [
        () => this.genAdd(max),
        () => this.genSub(max),
        () => this.genChainAdd(max),
        () => this.genFillBlank(max),
        () => this.genCompare(max),
        () => this.genPattern(max),
      ];
    } else if (diff === 'medium') {
      types = [
        () => this.genAdd(max),
        () => this.genSub(max),
        () => this.genChainSub(max),
        () => this.genMul(9),         // 9×9乘法
        () => this.genFillBlank(max),
        () => this.genTwoStep(max),   // 两步混合运算
        () => this.genPattern(max),
      ];
    } else {
      types = [
        () => this.genAdd(max),
        () => this.genSub(max),
        () => this.genMul(9),
        () => this.genDiv(9),         // 表内除法
        () => this.genTwoStep(max),
        () => this.genThreeStep(max), // 三步运算
        () => this.genCompare(max),
        () => this.genPattern(max),
      ];
    }

    const typeCount = Math.min(types.length, 6);
    for (let i = 0; i < typeCount; i++) qs.push(types[i]());
    for (let i = typeCount; i < 10; i++) qs.push(types[Math.floor(Math.random() * types.length)]());

    // 打乱
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs;
  },

  /* 加法 */
  genAdd(max) {
    const a = 1 + Math.floor(Math.random() * (max - 1));
    const b = 1 + Math.floor(Math.random() * Math.min(max - a, max));
    const ans = a + b;
    return { type: 'choice', prompt: `${a} + ${b} = ?`, answer: ans, choices: this.genChoices(ans, max * 2) };
  },

  /* 减法 */
  genSub(max) {
    const a = Math.floor(max / 2) + Math.floor(Math.random() * (max - Math.floor(max / 2) + 1));
    const b = 1 + Math.floor(Math.random() * (a - 1));
    const ans = a - b;
    return { type: 'choice', prompt: `${a} − ${b} = ?`, answer: ans, choices: this.genChoices(ans, max) };
  },

  /* 连加 */
  genChainAdd(max) {
    const third = Math.max(3, Math.floor(max / 3));
    const a = 1 + Math.floor(Math.random() * third);
    const b = 1 + Math.floor(Math.random() * third);
    const c = 1 + Math.floor(Math.random() * Math.min(third, max - a - b));
    const ans = a + b + c;
    return { type: 'choice', prompt: `${a} + ${b} + ${c} = ?`, answer: ans, choices: this.genChoices(ans, max * 2) };
  },

  /* 连减 */
  genChainSub(max) {
    const half = Math.floor(max / 2);
    const a = half + Math.floor(Math.random() * half);
    const b = 1 + Math.floor(Math.random() * (a / 2 - 1));
    const c = 1 + Math.floor(Math.random() * (a - b - 1));
    const ans = a - b - c;
    return { type: 'choice', prompt: `${a} − ${b} − ${c} = ?`, answer: ans, choices: this.genChoices(ans, max) };
  },

  /* 乘法（九九乘法表范围） */
  genMul(maxFactor) {
    const a = 2 + Math.floor(Math.random() * (maxFactor - 1));
    const b = 2 + Math.floor(Math.random() * (maxFactor - 1));
    const ans = a * b;
    return { type: 'choice', prompt: `${a} × ${b} = ?`, answer: ans, choices: this.genChoices(ans, maxFactor * maxFactor) };
  },

  /* 除法（表内除法，整除） */
  genDiv(maxFactor) {
    const b = 2 + Math.floor(Math.random() * (maxFactor - 1));
    const q = 2 + Math.floor(Math.random() * (maxFactor - 1));
    const a = b * q;
    const ans = q;
    return { type: 'choice', prompt: `${a} ÷ ${b} = ?`, answer: ans, choices: this.genChoices(ans, maxFactor) };
  },

  /* 填空题：a + __ = b */
  genFillBlank(max) {
    const a = 1 + Math.floor(Math.random() * (max - 1));
    const b = a + 1 + Math.floor(Math.random() * (max - a));
    const ans = b - a;
    return { type: 'choice', prompt: `${a} + ▢ = ${b}`, answer: ans, choices: this.genChoices(ans, max), hint: '▢ 里填几？' };
  },

  /* 两步混合运算 */
  genTwoStep(max) {
    const ops = ['+', '−'];
    const op1 = ops[Math.floor(Math.random() * 2)];
    const op2 = ops[Math.floor(Math.random() * 2)];
    let a, b, c, ans;
    if (op1 === '+' && op2 === '+') {
      a = 1 + Math.floor(Math.random() * (max / 2));
      b = 1 + Math.floor(Math.random() * (max / 3));
      c = 1 + Math.floor(Math.random() * Math.max(1, max - a - b));
      ans = a + b + c;
    } else if (op1 === '+' && op2 === '−') {
      a = 1 + Math.floor(Math.random() * (max / 2));
      b = 1 + Math.floor(Math.random() * (max / 3));
      c = 1 + Math.floor(Math.random() * Math.max(1, a + b - 1));
      ans = a + b - c;
    } else if (op1 === '−' && op2 === '+') {
      a = Math.floor(max / 2) + Math.floor(Math.random() * (max / 2));
      b = 1 + Math.floor(Math.random() * (a - 1));
      c = 1 + Math.floor(Math.random() * Math.max(1, max - (a - b)));
      ans = a - b + c;
    } else {
      a = Math.floor(max / 2) + Math.floor(Math.random() * (max / 2));
      b = 1 + Math.floor(Math.random() * (a - 2));
      c = 1 + Math.floor(Math.random() * Math.max(1, a - b - 1));
      ans = a - b - c;
    }
    return { type: 'choice', prompt: `${a} ${op1} ${b} ${op2} ${c} = ?`, answer: ans, choices: this.genChoices(ans, max * 2) };
  },

  /* 三步运算 */
  genThreeStep(max) {
    const a = 1 + Math.floor(Math.random() * (max / 2));
    const b = 2 + Math.floor(Math.random() * 7);
    const c = 1 + Math.floor(Math.random() * (max / 3));
    const d = 1 + Math.floor(Math.random() * (max / 4));
    const ans = a + b - c + d;
    return { type: 'choice', prompt: `${a} + ${b} − ${c} + ${d} = ?`, answer: ans, choices: this.genChoices(ans, max * 2) };
  },

  /* 比大小 */
  genCompare(max) {
    const la = 1 + Math.floor(Math.random() * (max / 2));
    const lb = 1 + Math.floor(Math.random() * (max / 2));
    const ra = 1 + Math.floor(Math.random() * (max / 2));
    const rb = 1 + Math.floor(Math.random() * (max / 2));
    const left = la + lb;
    const right = ra + rb;
    let answer;
    if (left > right) answer = '>';
    else if (left < right) answer = '<';
    else answer = '=';
    return { type: 'choice', prompt: `${la}+${lb} ○ ${ra}+${rb}`, answer: answer, choices: ['>', '<', '='], hint: '○ 里填什么？' };
  },

  /* 找规律 */
  genPattern(max) {
    const start = 1 + Math.floor(Math.random() * 5);
    const step = 1 + Math.floor(Math.random() * Math.max(2, Math.floor(max / 5)));
    const seq = [start, start + step, start + step * 2, start + step * 3];
    const ans = start + step * 4;
    return { type: 'choice', prompt: `${seq[0]}, ${seq[1]}, ${seq[2]}, ${seq[3]}, ?`, answer: ans, choices: this.genChoices(ans, max * 2), hint: '? 处填几？' };
  },

  /* 生成4个选项（含正确答案） */
  genChoices(answer, maxVal) {
    const set = new Set([answer]);
    let tries = 0;
    while (set.size < 4 && tries < 50) {
      tries++;
      let val;
      const r = Math.floor(Math.random() * 7) - 3;
      if (r === 0) {
        val = answer + (Math.random() > 0.5 ? 1 : -1);
      } else {
        val = answer + r;
      }
      if (val < 0) val = Math.abs(val);
      if (val > maxVal) val = maxVal - Math.floor(Math.random() * 3);
      if (val !== answer && val >= 0) set.add(val);
    }
    while (set.size < 4) {
      let val = Math.max(0, answer + set.size);
      if (val === answer) val++;
      set.add(val);
    }
    const arr = Array.from(set);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /* ---- 保存/恢复进度 ---- */
  saveState() {
    DB.mathPractice = DB.mathPractice || {};
    DB.mathPractice.savedState = {
      questions: this.questions,
      currentIdx: this.currentIdx,
      correctCount: this.correctCount,
      difficulty: DB.mathPractice.difficulty || 'easy',
      savedAt: new Date().toISOString()
    };
    saveDB();
  },

  clearState() {
    if (DB.mathPractice) {
      DB.mathPractice.savedState = null;
      saveDB();
    }
  },

  hasSavedState() {
    return DB.mathPractice && DB.mathPractice.savedState && DB.mathPractice.savedState.questions;
  },

  /* ---- 流程控制 ---- */
  showStart() {
    document.getElementById('mathStart').style.display = '';
    document.getElementById('mathQuiz').style.display = 'none';
    document.getElementById('mathResult').style.display = 'none';

    // 恢复难度选择
    const diff = (DB.mathPractice && DB.mathPractice.difficulty) || 'easy';
    document.querySelectorAll('.math-diff-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.diff === diff);
    });

    const mp = DB.mathPractice || {};
    const today = todayStr();
    const doneToday = (mp.lastDate === today) ? (mp.completedCount || 0) : 0;
    const diffCfg = this.DIFF_CONFIG[diff];

    const infoEl = document.getElementById('mathStartInfo');
    if (doneToday >= (mp.dailyQuota || 10)) {
      infoEl.innerHTML = `今天的练习已完成！明天再来吧 💪<br><span class="math-note">（可继续练习，但不重复发绿宝石）</span>`;
      infoEl.style.color = 'var(--mc-emerald)';
      document.getElementById('mathStartBtn').textContent = '再练一组';
    } else if (this.hasSavedState()) {
      const s = DB.mathPractice.savedState;
      infoEl.innerHTML = `📝 有未完成的练习（第 ${s.currentIdx + 1} 题，已答对 ${s.correctCount} 题）`;
      infoEl.style.color = 'var(--mc-gold)';
      document.getElementById('mathStartBtn').textContent = '继续练习';
    } else {
      infoEl.textContent = `今日进度：${doneToday} / ${mp.dailyQuota || 10} 题`;
      infoEl.style.color = 'var(--text-sub)';
      document.getElementById('mathStartBtn').textContent = '开始练习';
    }

    // 更新副标题显示当前难度
    document.querySelector('.math-start-subtitle').textContent = `${diffCfg.icon} ${diffCfg.label} · 学而思一年级 · 每天10题`;

    const statsEl = document.getElementById('mathStartStats');
    const best = mp.bestScore || 0;
    const total = mp.totalDone || 0;
    statsEl.innerHTML = total > 0
      ? `<span class="math-stat-item">🏆 最高 ${best} / 10</span><span class="math-stat-item">📝 累计 ${total} 题</span>`
      : '';
  },

  start() {
    // 检查是否有保存的进度
    if (this.hasSavedState()) {
      const s = DB.mathPractice.savedState;
      this.questions = s.questions;
      this.currentIdx = s.currentIdx;
      this.correctCount = s.correctCount;
      this.clearState();
    } else {
      this.questions = this.genQuestions();
      this.currentIdx = 0;
      this.correctCount = 0;
    }
    this.answered = false;
    document.getElementById('mathStart').style.display = 'none';
    document.getElementById('mathResult').style.display = 'none';
    document.getElementById('mathQuiz').style.display = '';
    this.renderQuestion();
  },

  /* 临时退出（保存进度） */
  exit() {
    this.saveState();
    document.getElementById('mathQuiz').style.display = 'none';
    document.getElementById('mathStart').style.display = '';
    toast('练习已暂停，随时可以继续');
    this.showStart();
  },

  renderQuestion() {
    const q = this.questions[this.currentIdx];
    const total = this.questions.length;
    this.answered = false;

    // 进度
    document.getElementById('mathProgress').textContent = `第 ${this.currentIdx + 1} / ${total} 题`;
    const dotsEl = document.getElementById('mathDots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'math-dot';
      if (i < this.currentIdx) dot.classList.add('done');
      else if (i === this.currentIdx) dot.classList.add('current');
      dotsEl.appendChild(dot);
    }

    // 题目
    const qEl = document.getElementById('mathQuestion');
    qEl.innerHTML = `<div class="math-question-text">${esc(q.prompt)}</div>${q.hint ? `<div class="math-question-hint">${esc(q.hint)}</div>` : ''}`;

    // 答案区域
    const ansEl = document.getElementById('mathAnswerArea');
    ansEl.innerHTML = '';
    q.choices.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'math-choice-btn';
      btn.textContent = c;
      btn.addEventListener('click', () => this.answer(c, btn));
      ansEl.appendChild(btn);
    });

    // 重置反馈
    document.getElementById('mathFeedback').innerHTML = '';
    document.getElementById('mathNextBtn').style.display = 'none';

    // 语音读题
    speak(q.prompt.replace(/▢/g, '方框').replace(/○/g, '圆圈').replace(/[×]/g, '乘').replace(/[÷]/g, '除以').replace(/[−]/g, '减').replace(/[?,]/g, ''));
  },

  answer(val, btn) {
    if (this.answered) return;
    this.answered = true;

    const q = this.questions[this.currentIdx];
    const correct = (String(val) === String(q.answer));
    const allBtns = document.querySelectorAll('.math-choice-btn');
    allBtns.forEach(b => b.disabled = true);

    const fbEl = document.getElementById('mathFeedback');
    if (correct) {
      this.correctCount++;
      btn.classList.add('correct');
      fbEl.innerHTML = '<span class="math-fb-correct">✅ 答对了！</span>';
      playChime();
    } else {
      btn.classList.add('wrong');
      allBtns.forEach(b => {
        if (String(b.textContent) === String(q.answer)) b.classList.add('correct');
      });
      fbEl.innerHTML = `<span class="math-fb-wrong">❌ 正确答案是 ${esc(q.answer)}</span>`;
      speak(`正确答案是${q.answer}`);
    }

    document.getElementById('mathNextBtn').style.display = '';
    document.getElementById('mathNextBtn').textContent =
      (this.currentIdx < this.questions.length - 1) ? '下一题 ➡' : '查看结果 🎉';
  },

  next() {
    if (this.currentIdx < this.questions.length - 1) {
      this.currentIdx++;
      this.renderQuestion();
      // 自动保存进度
      this.saveState();
    } else {
      this.finish();
    }
  },

  finish() {
    this.clearState();
    document.getElementById('mathQuiz').style.display = 'none';
    document.getElementById('mathResult').style.display = '';

    const total = this.questions.length;
    const correct = this.correctCount;
    const today = todayStr();
    const mp = DB.mathPractice || (DB.mathPractice = { lastDate: '', completedCount: 0, dailyQuota: 10, bestScore: 0, totalDone: 0, difficulty: 'easy', savedState: null });

    const isFirstToday = (mp.lastDate !== today);
    let earnedGems = 0;
    if (isFirstToday) {
      earnedGems = correct;
      mp.lastDate = today;
      mp.completedCount = total;
      mp.totalDone = (mp.totalDone || 0) + total;
      if (correct > (mp.bestScore || 0)) mp.bestScore = correct;
      if (earnedGems > 0) {
        DB.starLog.total += earnedGems;
        DB.starLog.totalEarned = (DB.starLog.totalEarned || 0) + earnedGems;
        DB.starLog.history.unshift({
          date: today,
          time: new Date().toTimeString().substr(0, 5),
          taskId: 'math_practice',
          taskName: '数学练习',
          taskIcon: '🔢',
          stars: earnedGems
        });
      }
      saveDB();
      if (earnedGems > 0) {
        starRain(earnedGems * 2 + 4);
        playChime();
      }
    } else {
      mp.totalDone = (mp.totalDone || 0) + total;
      if (correct > (mp.bestScore || 0)) mp.bestScore = correct;
      saveDB();
    }

    const iconEl = document.getElementById('mathResultIcon');
    const titleEl = document.getElementById('mathResultTitle');
    const scoreEl = document.getElementById('mathResultScore');
    const detailEl = document.getElementById('mathResultDetail');

    if (correct === total) {
      iconEl.textContent = '🏆';
      titleEl.textContent = '全部正确！太棒了！';
    } else if (correct >= 8) {
      iconEl.textContent = '🎉';
      titleEl.textContent = '非常棒！';
    } else if (correct >= 6) {
      iconEl.textContent = '💪';
      titleEl.textContent = '继续加油！';
    } else {
      iconEl.textContent = '📚';
      titleEl.textContent = '多练习就会更好！';
    }

    scoreEl.innerHTML = `<span class="math-score-num">${correct}</span><span class="math-score-total"> / ${total}</span>`;

    let detail = `正确 ${correct} 题，错误 ${total - correct} 题`;
    if (earnedGems > 0) {
      detail += `<br>💎 获得 ${earnedGems} 颗绿宝石！`;
    } else if (!isFirstToday) {
      detail += `<br><span class="math-note">（今天的绿宝石已领过，这是额外练习）</span>`;
    }
    detailEl.innerHTML = detail;

    updateStarDisplay();
    checkPetEvolution();
    speak(`练习完成！答对了${correct}题！`);
  },

  init() {
    this.showStart();
  }
};

/* ====== 趣味乐园 - 旅行青蛙游戏 ====== */
const FunPark = {
  // 行李物品定义
  ITEMS: [
    { id: 'riceball', name: '饭团', icon: '🍙', cost: 0, desc: '基本食物，出门必备' },
    { id: 'juice',    name: '果汁', icon: '🧃', cost: 2, desc: '可能带回额外绿宝石' },
    { id: 'camera',   name: '相机', icon: '📷', cost: 3, desc: '多拍一张明信片' },
    { id: 'compass',  name: '指南针', icon: '🧭', cost: 5, desc: '解锁远处目的地' },
    { id: 'backpack', name: '背包', icon: '🎒', cost: 5, desc: '能装更多纪念品' },
    { id: 'lantern',  name: '灯笼', icon: '🏮', cost: 3, desc: '夜间探险更有趣' },
  ],

  // 目的地定义
  DESTINATIONS: [
    {
      id: 'garden', name: '后院花园', icon: '🏡', duration: 1, requires: [],
      postcards: [
        { emoji: '🌻', text: '在后院发现了一朵向日葵，好大好大！' },
        { emoji: '🦋', text: '一只蝴蝶轻轻停在了头上~' },
        { emoji: '🐌', text: '遇到了一只慢吞吞的蜗牛，它好可爱。' },
        { emoji: '🌱', text: '种下了一颗小种子，希望它快快长大！' },
      ],
      souvenirs: [
        { emoji: '🌼', name: '小雏菊' },
        { emoji: '🦋', name: '蝴蝶贴纸' },
        { emoji: '🐌', name: '蜗牛壳' },
        { emoji: '🍀', name: '四叶草' },
      ],
    },
    {
      id: 'forest', name: '小树林', icon: '🌳', duration: 3, requires: ['riceball'],
      postcards: [
        { emoji: '🍄', text: '在树林里发现了一朵红蘑菇！' },
        { emoji: '🐿️', text: '一只小松鼠跳过头顶，好机灵！' },
        { emoji: '🌲', text: '爬上了一棵高高的大松树，看到了整片森林！' },
        { emoji: '🦉', text: '树洞里住着一只猫头鹰，它在眨眼睛呢。' },
      ],
      souvenirs: [
        { emoji: '🍄', name: '红蘑菇' },
        { emoji: '🌰', name: '栗子' },
        { emoji: '🪵', name: '小木块' },
        { emoji: '🍃', name: '漂亮的叶子' },
        { emoji: '🐿️', name: '松果' },
      ],
    },
    {
      id: 'beach', name: '海边沙滩', icon: '🏖️', duration: 3, requires: ['riceball'],
      postcards: [
        { emoji: '🐚', text: '在沙滩上捡到了一个漂亮的贝壳！' },
        { emoji: '🦀', text: '一只小螃蟹横着跑过去了，好好笑！' },
        { emoji: '🌊', text: '踩着浪花跑了好多圈，鞋子都湿啦！' },
        { emoji: '🐠', text: '看到海里有一条彩色的鱼游来游去。' },
      ],
      souvenirs: [
        { emoji: '🐚', name: '海贝壳' },
        { emoji: '🦀', name: '小螃蟹模型' },
        { emoji: '🪸', name: '珊瑚碎片' },
        { emoji: '⭐', name: '海星' },
        { emoji: '🧜‍♀️', name: '美人鱼贴纸' },
      ],
    },
    {
      id: 'mountain', name: '雪山之巅', icon: '🏔️', duration: 5, requires: ['riceball', 'compass'],
      postcards: [
        { emoji: '❄️', text: '山顶上全是白雪！堆了一个小雪人！' },
        { emoji: '🦅', text: '一只老鹰在头顶盘旋，好威风！' },
        { emoji: '⛄', text: '雪人堆好了，给它戴上了一条围巾~' },
        { emoji: '🏔️', text: '站在山顶看到了云海，太壮观了！' },
      ],
      souvenirs: [
        { emoji: '🧊', name: '冰晶' },
        { emoji: '❄️', name: '雪花标本' },
        { emoji: '🦅', name: '老鹰羽毛' },
        { emoji: '🔮', name: '冰宝石' },
        { emoji: '🧣', name: '围巾' },
      ],
    },
    {
      id: 'oldtown', name: '古镇老街', icon: '🏯', duration: 5, requires: ['riceball', 'backpack'],
      postcards: [
        { emoji: '🏮', text: '古镇的红灯笼挂满了整条街，好漂亮！' },
        { emoji: '🍡', text: '在街边买了一串糖葫芦，甜甜的！' },
        { emoji: '🏯', text: '走在青石板路上，感觉穿越到了古代。' },
        { emoji: '🐉', text: '看到了一条舞龙表演，好热闹！' },
      ],
      souvenirs: [
        { emoji: '🏮', name: '小红灯笼' },
        { emoji: '🍡', name: '糖葫芦签子' },
        { emoji: '🪭', name: '小扇子' },
        { emoji: '🧧', name: '红包封' },
        { emoji: '🐲', name: '小龙摆件' },
      ],
    },
    {
      id: 'volcano', name: '火山岛', icon: '🌋', duration: 8, requires: ['riceball', 'compass', 'backpack'],
      postcards: [
        { emoji: '🌋', text: '看到了真正的火山在冒烟！好壮观又好害怕！' },
        { emoji: '🦎', text: '在火山岩上发现了一只火蜥蜴！' },
        { emoji: '🔥', text: '用火山的热气烤了一个红薯，好好吃！' },
        { emoji: '💎', text: '在火山口附近发现了一颗闪闪发光的宝石！' },
      ],
      souvenirs: [
        { emoji: '🌋', name: '火山石' },
        { emoji: '🔥', name: '火焰碎片' },
        { emoji: '💎', name: '火山宝石' },
        { emoji: '🦎', name: '火蜥蜴贴纸' },
        { emoji: '⭐', name: '星之碎片' },
        { emoji: '🌈', name: '彩虹水晶' },
      ],
    },
  ],

  // 临时选择状态
  selectedItems: [],
  selectedDest: null,
  timerId: null,

  /* ---- 初始化 ---- */
  init() {
    this.checkTripStatus();
    this.switchCollectionTab('postcards');
  },

  /* ---- 获取当前宠物信息（复用已有系统） ---- */
  getPetIcon() {
    const pet = getPetInfo();
    return pet.image || pet.icon;
  },

  getPetName() {
    const pet = getPetInfo();
    return pet.name;
  },

  /* ---- 检查旅行状态 ---- */
  checkTripStatus() {
    const fp = DB.funPark || {};
    if (fp.status === 'traveling' && fp.tripEnd) {
      const now = Date.now();
      const end = new Date(fp.tripEnd).getTime();
      if (now >= end) {
        // 旅行结束，生成归来结果
        this.generateReturn();
      }
    }
  },

  /* ---- 显示状态条 ---- */
  updateStatusBar() {
    const fp = DB.funPark || {};
    const bar = document.getElementById('funStatusBar');
    let html = '';
    if (fp.status === 'home') {
      html = '<span class="fun-status-tag home">🏠 在家休息</span>';
    } else if (fp.status === 'traveling') {
      const dest = this.DESTINATIONS.find(d => d.id === fp.destination);
      html = `<span class="fun-status-tag travel">✈️ 旅行中${dest ? ' · ' + dest.icon + ' ' + dest.name : ''}</span>`;
    } else if (fp.status === 'returned') {
      html = '<span class="fun-status-tag returned">🎁 带礼物回来了！</span>';
    } else if (fp.status === 'collecting') {
      html = '<span class="fun-status-tag returned">📦 正在收取礼物…</span>';
    }
    bar.innerHTML = html;
  },

  /* ---- 显示在家画面 ---- */
  showHome() {
    this.checkTripStatus();
    this.updateStatusBar();
    const fp = DB.funPark || {};

    // 隐藏所有画面
    document.getElementById('funHome').style.display = 'none';
    document.getElementById('funPrepare').style.display = 'none';
    document.getElementById('funTraveling').style.display = 'none';
    document.getElementById('funReturn').style.display = 'none';

    if (fp.status === 'traveling') {
      this.showTraveling();
    } else if (fp.status === 'returned' || fp.status === 'collecting') {
      this.showReturn();
    } else {
      // 在家
      document.getElementById('funHome').style.display = '';
      const petIcon = this.getPetIcon();
      const petName = this.getPetName();
      const funAvatar = document.getElementById('funPetAvatarLarge');
      // 区分图片与 emoji
      if (petIcon && petIcon.indexOf('images/') === 0) {
        funAvatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = petIcon;
        img.alt = petName;
        img.className = 'fun-pet-avatar-img';
        funAvatar.appendChild(img);
      } else {
        funAvatar.textContent = petIcon;
      }
      const trips = fp.totalTrips || 0;
      const pcCount = (fp.postcards || []).length;
      const suvCount = (fp.souvenirs || []).length;
      document.getElementById('funPetNameLabel').innerHTML =
        `${esc(petName)}在家休息<br><span class="fun-pet-stats">🚀 已旅行${trips}次 · 📮 ${pcCount}张明信片 · 🎁 ${suvCount}个纪念品</span>`;
    }

    this.renderCollection();
  },

  /* ---- 显示准备画面 ---- */
  showPrepare() {
    this.updateStatusBar();
    document.getElementById('funHome').style.display = 'none';
    document.getElementById('funPrepare').style.display = '';
    this.selectedItems = [];
    this.selectedDest = null;
    this.renderItems();
    this.renderDestinations();
    this.updatePrepareSummary();
  },

  /* ---- 渲染行李选项 ---- */
  renderItems() {
    const el = document.getElementById('funItemsGrid');
    el.innerHTML = this.ITEMS.map(item => {
      const selected = this.selectedItems.includes(item.id);
      const canAfford = item.cost === 0 || DB.starLog.total >= item.cost;
      return `
        <div class="fun-item-card ${selected ? 'selected' : ''} ${!canAfford ? 'disabled' : ''}" data-item-id="${esc(item.id)}">
          <div class="fun-item-icon">${item.icon}</div>
          <div class="fun-item-name">${esc(item.name)}</div>
          <div class="fun-item-cost">${item.cost === 0 ? '免费' : '💎' + item.cost}</div>
          <div class="fun-item-desc">${esc(item.desc)}</div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.fun-item-card').forEach(card => {
      if (!card.classList.contains('disabled')) {
        card.addEventListener('click', () => this.toggleItem(card.dataset.itemId));
      }
    });
  },

  /* ---- 切换物品选择 ---- */
  toggleItem(itemId) {
    const idx = this.selectedItems.indexOf(itemId);
    if (idx >= 0) {
      this.selectedItems.splice(idx, 1);
    } else {
      this.selectedItems.push(itemId);
    }
    this.renderItems();
    this.renderDestinations();
    this.updatePrepareSummary();
    playChime();
  },

  /* ---- 渲染目的地 ---- */
  renderDestinations() {
    const el = document.getElementById('funDestinations');
    el.innerHTML = this.DESTINATIONS.map(dest => {
      const hasAllReq = dest.requires.every(req => this.selectedItems.includes(req));
      const selected = this.selectedDest === dest.id;
      const locked = !hasAllReq;
      const minText = dest.duration < 1 ? Math.round(dest.duration * 60) + '秒' : dest.duration + '分钟';
      return `
        <div class="fun-dest-card ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}" data-dest-id="${esc(dest.id)}">
          <div class="fun-dest-icon">${dest.icon}</div>
          <div class="fun-dest-info">
            <div class="fun-dest-name">${esc(dest.name)}</div>
            <div class="fun-dest-meta">⏱️ ${minText}</div>
          </div>
          ${locked ? '<div class="fun-dest-lock">🔒</div>' : '<div class="fun-dest-check">✓</div>'}
        </div>
      `;
    }).join('');

    el.querySelectorAll('.fun-dest-card:not(.locked)').forEach(card => {
      card.addEventListener('click', () => this.selectDestination(card.dataset.destId));
    });
  },

  /* ---- 选择目的地 ---- */
  selectDestination(destId) {
    this.selectedDest = destId;
    this.renderDestinations();
    this.updatePrepareSummary();
    playChime();
  },

  /* ---- 更新准备摘要 ---- */
  updatePrepareSummary() {
    const el = document.getElementById('funPrepareSummary');
    const goBtn = document.getElementById('funGoBtn');

    let totalCost = 0;
    let itemNames = [];
    this.selectedItems.forEach(id => {
      const item = this.ITEMS.find(i => i.id === id);
      if (item) {
        totalCost += item.cost;
        itemNames.push(item.icon + item.name);
      }
    });

    const dest = this.DESTINATIONS.find(d => d.id === this.selectedDest);
    let html = '';
    let canGo = false;

    if (itemNames.length > 0 || dest) {
      html = '<div class="fun-summary-inner">';
      if (itemNames.length > 0) {
        html += `<div class="fun-summary-row">🎒 行李：${itemNames.join(' · ')}</div>`;
      } else {
        html += '<div class="fun-summary-row hint">请选择行李（至少带上饭团🍙）</div>';
      }
      if (dest) {
        const minText = dest.duration < 1 ? Math.round(dest.duration * 60) + '秒' : dest.duration + '分钟';
        html += `<div class="fun-summary-row">📍 目的地：${dest.icon} ${esc(dest.name)}（${minText}）</div>`;
      } else {
        html += '<div class="fun-summary-row hint">请选择目的地</div>';
      }
      if (totalCost > 0) {
        html += `<div class="fun-summary-row cost">💎 消耗：${totalCost} 颗绿宝石</div>`;
      }
      html += '</div>';

      canGo = dest && this.selectedItems.includes('riceball') && DB.starLog.total >= totalCost;
    }

    el.innerHTML = html;
    goBtn.disabled = !canGo;
  },

  /* ---- 出发！ ---- */
  depart() {
    const dest = this.DESTINATIONS.find(d => d.id === this.selectedDest);
    if (!dest) return;
    if (!this.selectedItems.includes('riceball')) {
      toast('记得带上饭团🍙哦！');
      return;
    }

    // 扣绿宝石
    let totalCost = 0;
    this.selectedItems.forEach(id => {
      const item = this.ITEMS.find(i => i.id === id);
      if (item) totalCost += item.cost;
    });
    if (DB.starLog.total < totalCost) {
      toast('绿宝石不足！');
      return;
    }
    if (totalCost > 0) DB.starLog.total -= totalCost;

    // 记录行李
    const packedItems = this.selectedItems.map(id => {
      const item = this.ITEMS.find(i => i.id === id);
      return { id: item.id, name: item.name, icon: item.icon };
    });

    // 设置旅行状态
    const now = new Date();
    const end = new Date(now.getTime() + dest.duration * 60 * 1000);

    DB.funPark = DB.funPark || {};
    DB.funPark.status = 'traveling';
    DB.funPark.tripStart = now.toISOString();
    DB.funPark.tripEnd = end.toISOString();
    DB.funPark.destination = dest.id;
    DB.funPark.packedItems = packedItems;

    saveDB();
    updateStarDisplay();

    speak(`${this.getPetName()}出发去${dest.name}旅行啦！`);
    toast(`出发！去${dest.icon}${dest.name}旅行！`);
    starRain(4);
    playChime();

    this.showHome();
  },

  /* ---- 显示旅行中画面 ---- */
  showTraveling() {
    document.getElementById('funHome').style.display = 'none';
    document.getElementById('funPrepare').style.display = 'none';
    document.getElementById('funTraveling').style.display = '';

    const fp = DB.funPark;
    const dest = this.DESTINATIONS.find(d => d.id === fp.destination);
    if (!dest) return;

    document.getElementById('funTravelEmoji').textContent = dest.icon;
    document.getElementById('funTravelDest').textContent = `正在${dest.name}旅行...`;

    // 显示行李
    const items = fp.packedItems || [];
    const itemsHtml = items.map(i => i.icon).join(' ');
    document.getElementById('funTravelInfo').innerHTML = `🎒 行李：${itemsHtml || '空空如也'}`;

    this.startTimer();
  },

  /* ---- 启动倒计时 ---- */
  startTimer() {
    if (this.timerId) clearInterval(this.timerId);
    this.updateTimer();
    this.timerId = setInterval(() => {
      this.updateTimer();
    }, 1000);
  },

  /* ---- 更新倒计时显示 ---- */
  updateTimer() {
    const fp = DB.funPark;
    if (!fp || fp.status !== 'traveling' || !fp.tripEnd) {
      if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
      return;
    }

    const now = Date.now();
    const end = new Date(fp.tripEnd).getTime();
    const remaining = end - now;

    if (remaining <= 0) {
      // 旅行结束
      if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
      this.generateReturn();
      this.showReturn();
      return;
    }

    const totalSec = Math.ceil(remaining / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    document.getElementById('funTravelTimer').textContent =
      `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    // 进度条
    const dest = this.DESTINATIONS.find(d => d.id === fp.destination);
    if (dest) {
      const totalMs = dest.duration * 60 * 1000;
      const start = new Date(fp.tripStart).getTime();
      const elapsed = now - start;
      const pct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
      document.getElementById('funTravelProgress').style.width = pct + '%';
    }
  },

  /* ---- 生成归来结果 ---- */
  generateReturn() {
    const fp = DB.funPark;
    const dest = this.DESTINATIONS.find(d => d.id === fp.destination);
    if (!dest) {
      fp.status = 'home';
      saveDB();
      return;
    }

    const items = fp.packedItems || [];
    const hasCamera = items.some(i => i.id === 'camera');
    const hasBackpack = items.some(i => i.id === 'backpack');
    const hasJuice = items.some(i => i.id === 'juice');
    const hasLantern = items.some(i => i.id === 'lantern');

    // 明信片：基础1张，有相机+1张
    const pcCount = 1 + (hasCamera ? 1 : 0);
    const postcards = [];
    const availablePcs = [...dest.postcards];
    for (let i = 0; i < pcCount && availablePcs.length > 0; i++) {
      const idx = Math.floor(Math.random() * availablePcs.length);
      postcards.push(availablePcs.splice(idx, 1)[0]);
    }

    // 纪念品：基础1个，有背包+1-2个
    const suvCount = 1 + (hasBackpack ? 1 + Math.floor(Math.random() * 2) : 0);
    const souvenirs = [];
    const availableSuvs = [...dest.souvenirs];
    for (let i = 0; i < suvCount && availableSuvs.length > 0; i++) {
      const idx = Math.floor(Math.random() * availableSuvs.length);
      souvenirs.push(availableSuvs.splice(idx, 1)[0]);
    }

    // 绿宝石：基础0-1，有果汁+1-2
    let gems = Math.floor(Math.random() * 2);
    if (hasJuice) gems += 1 + Math.floor(Math.random() * 2);
    // 灯笼增加额外发现
    if (hasLantern && Math.random() > 0.5) {
      gems += 1;
    }

    fp.status = 'returned';
    fp.lastReturn = {
      destId: dest.id,
      destName: dest.name,
      destIcon: dest.icon,
      postcards: postcards,
      souvenirs: souvenirs,
      gems: gems,
    };
    fp.totalTrips = (fp.totalTrips || 0) + 1;
    saveDB();
  },

  /* ---- 显示归来画面 ---- */
  showReturn() {
    this.updateStatusBar();
    document.getElementById('funHome').style.display = 'none';
    document.getElementById('funPrepare').style.display = 'none';
    document.getElementById('funTraveling').style.display = 'none';
    document.getElementById('funReturn').style.display = '';

    const fp = DB.funPark;
    const ret = fp.lastReturn;
    if (!ret) {
      this.showHome();
      return;
    }

    // 明信片
    const pcEl = document.getElementById('funPostcard');
    if (ret.postcards && ret.postcards.length > 0) {
      pcEl.innerHTML = ret.postcards.map((pc, i) => `
        <div class="fun-postcard-card" style="animation-delay:${i * 0.2}s">
          <div class="fun-postcard-emoji">${pc.emoji}</div>
          <div class="fun-postcard-text">${esc(pc.text)}</div>
          <div class="fun-postcard-stamp">${esc(ret.destIcon)}</div>
        </div>
      `).join('');
    } else {
      pcEl.innerHTML = '<div class="fun-empty-hint">这次没有拍到明信片</div>';
    }

    // 纪念品
    const suvEl = document.getElementById('funSouvenirs');
    if (ret.souvenirs && ret.souvenirs.length > 0) {
      suvEl.innerHTML = ret.souvenirs.map(s => `
        <div class="fun-souvenir-badge">
          <span class="fun-souvenir-emoji">${s.emoji}</span>
          <span class="fun-souvenir-name">${esc(s.name)}</span>
        </div>
      `).join('');
    } else {
      suvEl.innerHTML = '';
    }

    // 绿宝石
    const gemEl = document.getElementById('funGemsReward');
    if (ret.gems > 0) {
      gemEl.innerHTML = `还带回了 <span class="fun-gem-num">${ret.gems}</span> 💎！`;
    } else {
      gemEl.innerHTML = '';
    }

    speak(`${this.getPetName()}从${ret.destName}回来啦！带了好多礼物！`);
    playChime();
    starRain(8);

    // 滚动到按钮可视区域
    setTimeout(() => {
      const btn = document.getElementById('funCollectBtn');
      if (btn) {
        btn.disabled = false;
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 600);
  },

  /* ---- 收下礼物（P0-3: 状态机 home→traveling→returned→collecting→home） ---- */
  collect() {
    const fp = DB.funPark;
    const ret = fp.lastReturn;

    // P0-3: 只有 returned 状态才能领取，防止重复领取
    if (fp.status !== 'returned') {
      return false;
    }
    if (!ret) {
      fp.status = 'home';
      saveDB();
      this.showHome();
      return true;
    }

    // 进入 collecting 状态，禁用按钮
    fp.status = 'collecting';
    const btn = document.getElementById('funCollectBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在收取…';
    }

    // 备份状态，用于异常或保存失败时回滚（防止明信片/绿宝石重复入账）
    const backup = {
      postcards: fp.postcards.slice(),
      souvenirs: fp.souvenirs.slice(),
      starTotal: DB.starLog.total,
      starEarned: DB.starLog.totalEarned,
      history: DB.starLog.history.slice(),
    };

    try {
      // 保存明信片
      const today = todayStr();
      if (ret.postcards) {
        ret.postcards.forEach(pc => {
          fp.postcards.unshift({
            id: uid(), destId: ret.destId, destName: ret.destName,
            destIcon: ret.destIcon, emoji: pc.emoji, text: pc.text, date: today,
          });
        });
      }

      // 保存纪念品
      if (ret.souvenirs) {
        ret.souvenirs.forEach(s => {
          fp.souvenirs.unshift({
            id: uid(), destId: ret.destId, destName: ret.destName,
            destIcon: ret.destIcon, emoji: s.emoji, name: s.name, date: today,
          });
        });
      }

      // 绿宝石奖励
      if (ret.gems > 0) {
        DB.starLog.total += ret.gems;
        DB.starLog.totalEarned = (DB.starLog.totalEarned || 0) + ret.gems;
        DB.starLog.history.unshift({
          date: today, time: new Date().toTimeString().substr(0, 5),
          taskId: 'fun_park_travel', taskName: '旅行奖励',
          taskIcon: ret.destIcon, stars: ret.gems,
        });
        starRain(ret.gems * 2 + 4);
      }

      // P0-4: 保存成功后才清空 lastReturn
      fp.lastReturn = null;
      fp.status = 'home';
      const saved = saveDB();

      if (!saved) {
        // 保存失败：回滚所有修改，恢复 returned 状态让用户重试
        fp.postcards = backup.postcards;
        fp.souvenirs = backup.souvenirs;
        DB.starLog.total = backup.starTotal;
        DB.starLog.totalEarned = backup.starEarned;
        DB.starLog.history = backup.history;
        fp.status = 'returned';
        fp.lastReturn = ret;
        if (btn) {
          btn.disabled = false;
          btn.textContent = '收下礼物 🎁';
        }
        toast('保存失败，请重试');
        return false;
      }

      updateStarDisplay();
      checkPetEvolution();

      toast('礼物已收下！🎉');
      speak('礼物收好啦！');
      this.showHome();
      return true;
    } catch (err) {
      // 异常回滚：恢复所有修改，恢复按钮，不让用户卡在"正在收取"
      console.error('礼物领取失败:', err);
      fp.postcards = backup.postcards;
      fp.souvenirs = backup.souvenirs;
      DB.starLog.total = backup.starTotal;
      DB.starLog.totalEarned = backup.starEarned;
      DB.starLog.history = backup.history;
      fp.status = 'returned';
      fp.lastReturn = ret;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '收下礼物 🎁';
      }
      toast('领取失败，请重试');
      return false;
    }
  },

  /* ---- 收藏Tab切换 ---- */
  collectionTab: 'postcards',
  switchCollectionTab(tab) {
    this.collectionTab = tab;
    document.querySelectorAll('.fun-col-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.colTab === tab);
    });
    this.renderCollection();
  },

  /* ---- 渲染收藏 ---- */
  renderCollection() {
    const fp = DB.funPark || {};
    const el = document.getElementById('funCollectionContent');

    if (this.collectionTab === 'postcards') {
      const cards = fp.postcards || [];
      if (cards.length === 0) {
        el.innerHTML = '<div class="fun-empty-hint">还没有明信片，让小宠物去旅行吧！</div>';
        return;
      }
      el.innerHTML = cards.map(pc => `
        <div class="fun-postcard-mini">
          <div class="fun-pc-mini-emoji">${pc.emoji}</div>
          <div class="fun-pc-mini-text">${esc(pc.text)}</div>
          <div class="fun-pc-mini-stamp">${pc.destIcon} ${esc(pc.destName)}</div>
          <div class="fun-pc-mini-date">${esc(pc.date)}</div>
        </div>
      `).join('');
    } else {
      const souvs = fp.souvenirs || [];
      if (souvs.length === 0) {
        el.innerHTML = '<div class="fun-empty-hint">还没有纪念品，让小宠物去旅行吧！</div>';
        return;
      }
      el.innerHTML = souvs.map(s => `
        <div class="fun-souvenir-mini">
          <div class="fun-suv-emoji">${s.emoji}</div>
          <div class="fun-suv-name">${esc(s.name)}</div>
          <div class="fun-suv-from">${s.destIcon} ${esc(s.destName)}</div>
        </div>
      `).join('');
    }
  }
};

/* ====== 进入密码锁 ====== */
const APP_PASSWORD = '0328';
const LOCK_KEY = 'duomi_unlocked';

function initAppLock() {
  // 同一浏览器会话内已解锁，不再弹锁
  if (sessionStorage.getItem(LOCK_KEY) === 'yes') {
    hideLock();
    init();
    return;
  }

  var lock = document.getElementById('appLock');
  var input = document.getElementById('lockInput');
  var btn = document.getElementById('lockBtn');
  var err = document.getElementById('lockError');

  lock.style.display = 'flex';
  setTimeout(function() { input.focus(); }, 100);

  function tryUnlock() {
    if (input.value === APP_PASSWORD) {
      err.textContent = '';
      sessionStorage.setItem(LOCK_KEY, 'yes');
      hideLock();
      init();
    } else {
      err.textContent = '密码错误，再试一次';
      input.value = '';
      input.classList.add('shake');
      setTimeout(function() { input.classList.remove('shake'); }, 400);
    }
  }

  btn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') tryUnlock();
  });
}

function hideLock() {
  var lock = document.getElementById('appLock');
  if (lock) lock.style.display = 'none';
}

/* ====== 初始化 ====== */
function init() {
  loadDB();
  bindEvents();
  Timer.init();
  Calculator.init();
  Pinyin.init();
  WordCards.init();
  Memo.init();
  MathPractice.init();
  FunPark.init();
  lastPetLevel = getPetInfo().level;
  updateModeBadge();
  updateStarDisplay();
  renderSchedulePage();
  // 启动 Supabase 云端同步（异步，不阻塞首屏）
  if (typeof startSupabaseSync === 'function') {
    startSupabaseSync().catch(e => console.error('Supabase 同步启动失败:', e));
  }
}

document.addEventListener('DOMContentLoaded', initAppLock);
