/* ============================================
 * 多米工作台 - Supabase 同步层
 * LocalStorage 做本地缓存，Supabase 做云端同步
 * ============================================ */

const SUPABASE_URL = 'https://jhkzkphtjfdtzzgxacrb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impoa3prcGh0amZkdHp6Z3hhY3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMDAzMzYsImV4cCI6MjEwMTc3NjMzNn0.iPHtPn1-87gHhXdwNQ2yqBQlg0-OOsqAQGUjj_9fmsk';

let sb = null;
let syncTimer = null;
let syncBusy = false;

/* ====== 初始化 ====== */
function initSupabase() {
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.error('Supabase 初始化失败:', e);
  }
}

/* ====== 从 Supabase 加载全部数据 ====== */
async function loadFromSupabase() {
  if (!sb) return null;
  try {
    const [
      { data: settings },
      { data: schedule },
      { data: tasks },
      { data: rewards },
      { data: starLog },
      { data: checkins },
      { data: redemptions },
      { data: wordCards },
      { data: memos }
    ] = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).single(),
      sb.from('schedule').select('*').order('created_at'),
      sb.from('tasks').select('*').order('sort_order'),
      sb.from('rewards').select('*').order('sort_order'),
      sb.from('star_log').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('checkins').select('*'),
      sb.from('redemptions').select('*').order('created_at', { ascending: false }),
      sb.from('word_cards').select('*').order('sort_order'),
      sb.from('memos').select('*').order('created_at', { ascending: false })
    ]);

    // 计算绿宝石总数
    const totalEarned = (starLog || []).reduce((s, r) => s + (r.stars || 0), 0);
    const totalRedeemed = (redemptions || []).reduce((s, r) => s + (r.cost || 0), 0);
    const totalStars = totalEarned - totalRedeemed;

    // 构建 checkins 对象: { '2026-08-08': { 't1': true } }
    const checkinObj = {};
    (checkins || []).forEach(c => {
      const d = c.date;
      if (!checkinObj[d]) checkinObj[d] = {};
      checkinObj[d][c.task_id] = true;
    });

    // 构建 schedule 对象
    const schedObj = { holiday: [], school: [], custom: [] };
    (schedule || []).forEach(s => {
      const item = {
        id: s.id,
        day: s.day,
        startTime: s.start_time,
        endTime: s.end_time,
        title: s.title,
        alarm: s.alarm !== false
      };
      if (s.type === 'school') schedObj.school.push(item);
      else if (s.type === 'custom') { item.date = s.date ? s.date : ''; schedObj.custom.push(item); }
      else schedObj.holiday.push(item);
    });

    // 构建 starLog.history
    const history = (starLog || []).map(r => ({
      date: r.date,
      time: r.time,
      taskId: r.task_id,
      taskName: r.task_name,
      taskIcon: r.task_icon,
      stars: r.stars
    }));

    // 构建 redeemed 数组
    const redeemed = (redemptions || []).map(r => ({
      id: r.id,
      rewardId: r.reward_id,
      rewardName: r.reward_name,
      rewardIcon: r.reward_icon,
      cost: r.cost,
      date: r.date,
      time: r.time
    }));

    // 构建 wordCards
    const cards = (wordCards || []).map(w => ({
      word: w.word,
      meaning: w.meaning
    }));

    // 构建 memos
    const memoArr = (memos || []).map(m => ({
      id: m.id,
      text: m.text,
      date: m.date
    }));

    // 返回完整 DB 对象（保留本地 funPark，旅行游戏状态不做云端同步）
    return {
      dataVersion: 2,
      settings: {
        mode: settings?.mode || 'holiday',
        parentPassword: settings?.parent_password || '1234',
        isParentMode: DB.settings?.isParentMode || false,
        soundEnabled: settings?.sound_enabled !== false,
        speechEnabled: settings?.speech_enabled !== false
      },
      schedule: schedObj,
      tasks: (tasks || []).map(t => ({ id: t.id, name: t.name, icon: t.icon, stars: t.stars })),
      rewards: (rewards || []).map(r => ({ id: r.id, name: r.name, icon: r.icon, cost: r.cost })),
      starLog: { total: totalStars, totalEarned, history },
      checkins: checkinObj,
      redeemed,
      wordCards: cards,
      memos: memoArr,
      // funPark 纯本地保存，不同步到云端，但必须从本地保留
      funPark: DB.funPark || null
    };
  } catch (e) {
    console.error('从 Supabase 加载失败:', e);
    return null;
  }
}

/* ====== 配置数据同步（防抖） ====== */
let syncConfigTimer = null;
function syncConfigDebounced() {
  if (!sb) return;
  clearTimeout(syncConfigTimer);
  syncConfigTimer = setTimeout(syncConfigToSupabase, 800);
}

async function syncConfigToSupabase() {
  if (!sb || syncBusy) return;
  syncBusy = true;
  try {
    // 1. settings
    await sb.from('settings').upsert({
      id: 1,
      mode: DB.settings.mode,
      parent_password: DB.settings.parentPassword,
      sound_enabled: DB.settings.soundEnabled,
      speech_enabled: DB.settings.speechEnabled
    });

    // 2. schedule - 先清空再插入
    await sb.from('schedule').delete().neq('id', '___none___');
    const schedRows = [
      ...DB.schedule.holiday.map(c => ({ id: c.id, type: 'holiday', day: c.day, date: null, start_time: c.startTime, end_time: c.endTime, title: c.title, alarm: c.alarm !== false })),
      ...DB.schedule.school.map(c => ({ id: c.id, type: 'school', day: c.day, date: null, start_time: c.startTime, end_time: c.endTime, title: c.title, alarm: c.alarm !== false })),
      ...DB.schedule.custom.map(c => ({ id: c.id, type: 'custom', day: null, date: c.date || null, start_time: c.startTime, end_time: c.endTime, title: c.title, alarm: c.alarm !== false }))
    ];
    if (schedRows.length > 0) await sb.from('schedule').insert(schedRows);

    // 3. tasks
    await sb.from('tasks').delete().neq('id', '___none___');
    const taskRows = DB.tasks.map((t, i) => ({ id: t.id, name: t.name, icon: t.icon, stars: t.stars, sort_order: i + 1 }));
    if (taskRows.length > 0) await sb.from('tasks').insert(taskRows);

    // 4. rewards
    await sb.from('rewards').delete().neq('id', '___none___');
    const rewardRows = DB.rewards.map((r, i) => ({ id: r.id, name: r.name, icon: r.icon, cost: r.cost, sort_order: i + 1 }));
    if (rewardRows.length > 0) await sb.from('rewards').insert(rewardRows);

    // 5. word_cards
    await sb.from('word_cards').delete().neq('id', '0');
    const wordRows = DB.wordCards.map((w, i) => ({ word: w.word, meaning: w.meaning, sort_order: i + 1 }));
    if (wordRows.length > 0) await sb.from('word_cards').insert(wordRows);

    // 6. memos
    await sb.from('memos').delete().neq('id', '___none___');
    const memoRows = DB.memos.map(m => ({ id: m.id, text: m.text, date: m.date }));
    if (memoRows.length > 0) await sb.from('memos').insert(memoRows);

  } catch (e) {
    console.error('同步配置到 Supabase 失败:', e);
  } finally {
    syncBusy = false;
  }
}

/* ====== 打卡写入 Supabase ====== */
async function pushCheckinToSupabase(task) {
  if (!sb) return;
  try {
    const today = todayStr();
    const nowTime = new Date().toTimeString().substr(0, 5);

    // 插入 checkin（唯一约束：date + task_id）
    await sb.from('checkins').upsert({ date: today, task_id: task.id });

    // 插入 star_log
    await sb.from('star_log').insert({
      date: today,
      time: nowTime,
      task_id: task.id,
      task_name: task.name,
      task_icon: task.icon,
      stars: task.stars
    });
  } catch (e) {
    console.error('打卡同步失败:', e);
  }
}

/* ====== 兑换写入 Supabase ====== */
async function pushRedemptionToSupabase(reward, redemptionId) {
  if (!sb) return;
  try {
    await sb.from('redemptions').insert({
      id: redemptionId,
      reward_id: reward.id,
      reward_name: reward.name,
      reward_icon: reward.icon,
      cost: reward.cost,
      date: todayStr(),
      time: new Date().toTimeString().substr(0, 5)
    });
  } catch (e) {
    console.error('兑换同步失败:', e);
  }
}

/* ====== 轮询刷新（老婆手机看孩子打卡用） ====== */
async function pollFromSupabase() {
  if (!sb || syncBusy) return;
  try {
    // 只拉 checkins + star_log + redemptions（高频变化的数据）
    const [
      { data: starLog },
      { data: checkins },
      { data: redemptions }
    ] = await Promise.all([
      sb.from('star_log').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('checkins').select('*'),
      sb.from('redemptions').select('*').order('created_at', { ascending: false })
    ]);

    const totalEarned = (starLog || []).reduce((s, r) => s + (r.stars || 0), 0);
    const totalRedeemed = (redemptions || []).reduce((s, r) => s + (r.cost || 0), 0);
    const totalStars = totalEarned - totalRedeemed;

    // 检测是否有变化
    const newCheckinCount = (checkins || []).length;
    const oldCheckinCount = Object.values(DB.checkins).reduce((s, d) => s + Object.keys(d).length, 0);
    const newRedeemCount = (redemptions || []).length;

    if (newCheckinCount !== oldCheckinCount || newRedeemCount !== DB.redeemed.length || totalEarned !== DB.starLog.totalEarned) {
      // 有变化，更新本地数据
      const checkinObj = {};
      (checkins || []).forEach(c => {
        const d = c.date;
        if (!checkinObj[d]) checkinObj[d] = {};
        checkinObj[d][c.task_id] = true;
      });

      DB.checkins = checkinObj;
      DB.starLog.total = totalStars;
      DB.starLog.totalEarned = totalEarned;
      DB.starLog.history = (starLog || []).map(r => ({
        date: r.date, time: r.time, taskId: r.task_id,
        taskName: r.task_name, taskIcon: r.task_icon, stars: r.stars
      }));
      DB.redeemed = (redemptions || []).map(r => ({
        id: r.id, rewardId: r.reward_id, rewardName: r.reward_name,
        rewardIcon: r.reward_icon, cost: r.cost, date: r.date, time: r.time
      }));

      saveDB();
      renderTaskPage();
      renderRewardsPage();
      updateStarDisplay();
      updateModeBadge();
      console.log('[Supabase] 数据已刷新');
    }
  } catch (e) {
    // 静默失败，不影响使用
    console.debug('[Supabase] 轮询失败:', e.message);
  }
}

/* ====== 启动同步 ====== */
async function startSupabaseSync() {
  initSupabase();
  if (!sb) return;

  // 首次加载云端数据
  const remoteDB = await loadFromSupabase();
  if (remoteDB) {
    // 保留本地 isParentMode 状态
    remoteDB.settings.isParentMode = DB.settings?.isParentMode || false;
    // P0-1: 按字段合并，不整对象替换，保护本地 funPark 等状态
    // 云端有的字段用云端，云端没有的字段保留本地
    for (const key of Object.keys(remoteDB)) {
      DB[key] = remoteDB[key];
    }
    // 确保本地 funPark 不被覆盖（loadFromSupabase 已从 DB.funPark 带回，但二次保险）
    if (!DB.funPark) {
      DB.funPark = {
        status: 'home', tripStart: null, tripEnd: null, destination: null,
        packedItems: [], postcards: [], souvenirs: [], lastReturn: null, totalTrips: 0
      };
    }
    saveDB();
    // 重新渲染全部页面
    renderSchedulePage();
    renderTaskPage();
    renderRewardsPage();
    renderSettingsPage();
    updateModeBadge();
    updateStarDisplay();
    lastPetLevel = getPetInfo().level;
    renderPet();
    console.log('[Supabase] 首次同步完成');
  }

  // 如果云端没有数据（首次使用），把本地数据推上去
  if (remoteDB && remoteDB.tasks.length === 0 && DB.tasks.length > 0) {
    await syncConfigToSupabase();
    console.log('[Supabase] 本地数据已推送');
  }

  // 定时轮询（15秒）
  syncTimer = setInterval(pollFromSupabase, 15000);
}
