const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { messagingApi, validateSignature } = require('@line/bot-sdk');
const admin = require('firebase-admin');

const app = express();

const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new messagingApi.MessagingApiClient(lineConfig);

const SELF_USER_ID = process.env.LINE_SELF_USER_ID;

// グループIDをFirestoreから取得（env varはフォールバック）
async function getGroupId() {
  const db = getDb();
  if (db) {
    try {
      const snap = await db.collection('config').doc('lineConfig').get();
      if (snap.exists && snap.data()?.groupId) return snap.data().groupId;
    } catch (e) {
      console.warn('[getGroupId] Firestore読取失敗:', e?.message);
    }
  }
  return process.env.LINE_GROUP_ID || null;
}

// FIREBASE_PRIVATE_KEY の堅牢なパース
// Herokuダッシュボードでのコピペ時にダブルクォートや\\nが混入しやすいため多重対応
function parseFirebasePrivateKey(raw) {
  if (!raw) return null;
  let key = raw.trim();
  // ダブルクォート囲みを除去（JSON文字列として貼り付けた場合）
  if (key.startsWith('"') && key.endsWith('"')) {
    try { key = JSON.parse(key); } catch { key = key.slice(1, -1); }
  }
  // シングルクォート囲みを除去
  if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
  // リテラル \n（2文字）を実際の改行に変換
  key = key.replace(/\\n/g, '\n');
  // Windows改行を正規化
  key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return key;
}

// Firebase Admin初期化（環境変数から認証情報を読み込む）
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = parseFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      console.log('[Firebase Admin] 初期化成功: projectId=' + projectId);
    } catch (e) {
      console.error('[Firebase Admin] 初期化失敗:', e?.message ?? e);
      console.error('[Firebase Admin] 秘密鍵の先頭行:', privateKey.split('\n')[0]);
    }
  } else {
    console.warn('[Firebase Admin] 未設定: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY が必要です');
  }
}

function getDb() {
  if (!admin.apps.length) return null;
  return admin.firestore();
}

// LINE Webhook署名検証ミドルウェア（webhookエンドポイント専用）
function verifyLineSignature(req, res, next) {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.rawBody, lineConfig.channelSecret, signature)) {
    return res.status(403).json({ error: 'Invalid signature' });
  }
  next();
}

// rawBodyを保持するためwebhook前にjsonパース
app.use((req, res, next) => {
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })(req, res, next);
});

// CORS: 設定済みオリジン + VercelプレビューURL + localhostを許可
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const configured = process.env.ALLOWED_ORIGIN || '';
    if (
      configured === '*' ||
      origin === configured ||
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost')
    ) {
      callback(null, true);
    } else {
      console.warn(`[CORS] blocked: ${origin}`);
      callback(null, false);
    }
  },
}));

// ヘルスチェック
app.get('/health', (_req, res) => res.json({ ok: true }));

// グループにシフト連絡（GIDはFirestoreから動的取得）
app.post('/line/group/shift', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ ok: false, message: 'message required' });
    const groupId = await getGroupId();
    if (!groupId) return res.status(400).json({ ok: false, message: 'グループIDが未設定です。グループで「グループ登録」と送信してください。' });
    await client.pushMessage({ to: groupId, messages: [{ type: 'text', text: message }] });
    res.json({ ok: true, message: '送信しました' });
  } catch (e) { next(e); }
});

// グループに当日ポジション配置連絡（GIDはFirestoreから動的取得）
app.post('/line/group/position', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ ok: false, message: 'message required' });
    const groupId = await getGroupId();
    if (!groupId) return res.status(400).json({ ok: false, message: 'グループIDが未設定です。グループで「グループ登録」と送信してください。' });
    await client.pushMessage({ to: groupId, messages: [{ type: 'text', text: message }] });
    res.json({ ok: true, message: '送信しました' });
  } catch (e) { next(e); }
});

// 自分への連絡
app.post('/line/self', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    await client.pushMessage({ to: SELF_USER_ID, messages: [{ type: 'text', text: message }] });
    res.json({ ok: true, message: '送信しました' });
  } catch (e) { next(e); }
});

// 管理者全員に通知（role=adminのmembersのlineUserId + LINE_SELF_USER_ID）
app.post('/line/notify-admins', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ ok: false, message: 'message required' });
    const db = getDb();
    if (!db) return res.status(500).json({ ok: false, message: 'Firebase未接続' });

    const adminSnap = await db.collection('members').where('role', '==', 'admin').get();
    const adminLineIds = adminSnap.docs.map(d => d.data().lineUserId).filter(Boolean);

    // 開発者（LINE_SELF_USER_ID）も含める
    const selfId = process.env.LINE_SELF_USER_ID;
    if (selfId && !adminLineIds.includes(selfId)) adminLineIds.push(selfId);

    if (adminLineIds.length === 0) return res.json({ ok: true, message: '通知対象なし（LINE未登録）' });

    await Promise.allSettled(
      adminLineIds.map(uid =>
        client.pushMessage({ to: uid, messages: [{ type: 'text', text: message }] })
      )
    );
    res.json({ ok: true, message: `${adminLineIds.length}名に通知しました` });
  } catch (e) { next(e); }
});

// 出勤依頼の個別送信（shiftRequestInvitesをFirestoreに作成 + LINE通知）
app.post('/shift-request/send-invites', async (req, res, next) => {
  try {
    const { requestId, date, place, timeLabel, targetMembers, comment, sendToGroup, groupMessage } = req.body;
    if (!requestId || !targetMembers || !Array.isArray(targetMembers)) {
      return res.status(400).json({ ok: false, message: '必須パラメータが不足しています' });
    }
    const db = getDb();
    if (!db) return res.status(500).json({ ok: false, message: 'Firebase未接続' });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    // shiftRequestInvitesを一括作成
    for (const m of targetMembers) {
      const ref = db.collection('shiftRequestInvites').doc();
      const data = {
        requestId,
        date: date ?? '',
        place: place ?? '',
        timeLabel: timeLabel ?? '',
        memberName: m.memberName,
        lineUserId: m.lineUserId,
        response: 'pending',
        sentAt: now,
      };
      if (comment) data.comment = comment;
      batch.set(ref, data);
    }
    await batch.commit();

    // 個別にLINE DM送信
    const dmText = [
      '【出勤依頼が届いています】',
      `${date} ${place} ${timeLabel}`,
      comment ? `\nコメント: ${comment}` : '',
      '\nウェブアプリの「お知らせ」から回答してください。',
    ].join('\n').trim();

    const dmTasks = targetMembers.map(m =>
      client.pushMessage({ to: m.lineUserId, messages: [{ type: 'text', text: dmText }] })
    );

    // グループ送信（任意）
    if (sendToGroup && groupMessage) {
      const groupId = await getGroupId();
      if (groupId) {
        dmTasks.push(client.pushMessage({ to: groupId, messages: [{ type: 'text', text: groupMessage }] }));
      }
    }

    await Promise.allSettled(dmTasks);
    res.json({ ok: true, message: `${targetMembers.length}名に送信しました` });
  } catch (e) { next(e); }
});

// 出勤依頼への回答処理（confirmedシフト作成 + 管理者全員LINE通知）
app.post('/shift-request/respond', async (req, res, next) => {
  try {
    const { inviteId, requestId, memberName, response, adjustedTimeStart, adjustedTimeEnd, userComment } = req.body;
    if (!inviteId || !requestId || !memberName || !response) {
      return res.status(400).json({ ok: false, message: '必須パラメータが不足しています' });
    }

    const db = getDb();
    if (!db) return res.status(500).json({ ok: false, message: 'Firebase未接続' });

    const requestRef = db.collection('shiftRequests').doc(requestId);
    const inviteRef = db.collection('shiftRequestInvites').doc(inviteId);
    let resultShiftId = null;
    let result;

    if (response === 'accepted' || response === 'adjusted') {
      await db.runTransaction(async (tx) => {
        const requestSnap = await tx.get(requestRef);
        const inviteSnap = await tx.get(inviteRef);

        if (!requestSnap.exists) throw new Error('REQUEST_NOT_FOUND');
        if (!inviteSnap.exists) throw new Error('INVITE_NOT_FOUND');

        const requestData = requestSnap.data();
        const inviteData = inviteSnap.data();

        if (inviteData.response !== 'pending') throw new Error('ALREADY_RESPONDED');
        if (requestData.acceptedCount >= requestData.requiredCount) throw new Error('FULL');

        const newCount = requestData.acceptedCount + 1;
        tx.update(requestRef, {
          acceptedCount: newCount,
          status: newCount >= requestData.requiredCount ? 'closed' : 'pending',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // confirmed シフトを直接作成（Firebase Admin SDK）
        const shiftRef = db.collection('shifts').doc();
        resultShiftId = shiftRef.id;

        const shiftData = {
          memberName,
          date: requestData.date,
          status: 'confirmed',
          place: requestData.place,
          irregular: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          version: 1,
          subject: `出勤 ${memberName}`,
        };

        if (response === 'adjusted' && adjustedTimeStart && adjustedTimeEnd) {
          shiftData.timeType = 'time';
          shiftData.timeStart = adjustedTimeStart;
          shiftData.timeEnd = adjustedTimeEnd;
        } else if (requestData.timeType === 'template' && requestData.template) {
          shiftData.timeType = 'template';
          shiftData.template = requestData.template;
        } else {
          shiftData.timeType = 'time';
          shiftData.timeStart = requestData.timeStart ?? '20:00';
          shiftData.timeEnd = requestData.timeEnd ?? '02:00';
        }

        tx.set(shiftRef, shiftData);

        const inviteUpdate = {
          response,
          respondedAt: admin.firestore.FieldValue.serverTimestamp(),
          resultShiftId,
        };
        if (adjustedTimeStart) inviteUpdate.adjustedTimeStart = adjustedTimeStart;
        if (adjustedTimeEnd) inviteUpdate.adjustedTimeEnd = adjustedTimeEnd;
        if (userComment) inviteUpdate.userComment = userComment;
        tx.update(inviteRef, inviteUpdate);
      });
      result = 'accepted';
    } else if (response === 'rejected') {
      const rejUpdate = {
        response: 'rejected',
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (userComment) rejUpdate.userComment = userComment;
      await inviteRef.update(rejUpdate);
      result = 'rejected';
    }

    // 管理者全員 + 開発者にLINE通知
    try {
      const requestSnap = await requestRef.get();
      const requestData = requestSnap.exists ? requestSnap.data() : {};
      const inviteSnap = await inviteRef.get();
      const inviteData = inviteSnap.exists ? inviteSnap.data() : {};

      const remaining = Math.max(0, (requestData.requiredCount ?? 0) - (requestData.acceptedCount ?? 0));
      const responseLabel = (response === 'accepted' || response === 'adjusted') ? '出勤します' : '不可です';
      const dateLabel = inviteData.date ?? requestData.date ?? '';
      const placeLabel = inviteData.place ?? requestData.place ?? '';
      const timeLabelVal = inviteData.timeLabel ?? '';

      const commentLine = userComment ? `\nコメント: ${userComment}` : '';
      const notifyMsg = `【出勤依頼結果通知】\n${dateLabel} ${placeLabel} ${timeLabelVal}\n${memberName}: ${responseLabel}${commentLine}\n残り${remaining}人`;

      const adminSnap = await db.collection('members').where('role', '==', 'admin').get();
      const adminLineIds = adminSnap.docs.map(d => d.data().lineUserId).filter(Boolean);
      const selfId = process.env.LINE_SELF_USER_ID;
      if (selfId && !adminLineIds.includes(selfId)) adminLineIds.push(selfId);

      await Promise.allSettled(
        adminLineIds.map(uid =>
          client.pushMessage({ to: uid, messages: [{ type: 'text', text: notifyMsg }] })
        )
      );
    } catch (notifyErr) {
      // 通知失敗はログのみ（メイン処理には影響させない）
      console.error('[shift-request/respond] 管理者通知失敗:', notifyErr?.message);
      await notifySelfError('shift-request/respond 管理者通知', response, notifyErr?.message ?? String(notifyErr)).catch(() => {});
    }

    res.json({ ok: true, result, message: '回答を送信しました', shiftId: resultShiftId });
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (msg === 'FULL') return res.json({ ok: false, result: 'full', message: '定員に達しました（先着順）' });
    if (msg === 'ALREADY_RESPONDED') return res.json({ ok: false, result: 'already', message: '既に回答済みです' });
    if (msg === 'REQUEST_NOT_FOUND') return res.status(404).json({ ok: false, message: '出勤依頼が見つかりません' });
    next(e);
  }
});

// 個別チャット連絡
app.post('/line/dm', async (req, res, next) => {
  try {
    const { lineUserId, message } = req.body;
    if (!lineUserId || !message) return res.status(400).json({ error: 'lineUserId and message required' });
    await client.pushMessage({ to: lineUserId, messages: [{ type: 'text', text: message }] });
    res.json({ ok: true, message: '送信しました' });
  } catch (e) { next(e); }
});

// LINE Webhook受信
app.post('/line/webhook', verifyLineSignature, async (req, res) => {
  res.sendStatus(200);
  const events = req.body?.events ?? [];
  for (const event of events) {
    try {
      await handleLineEvent(event);
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error('[webhook error]', { eventType: event.type, source: event.source, error: msg });
      await notifySelfError('webhookイベント処理エラー', event.type, msg).catch(() => {});
    }
  }
});

// ──────────────────────────────────────────────────────────
// シフト日付問い合わせ機能 — ヘルパー群
// ──────────────────────────────────────────────────────────

const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

// テンプレ帯の時間定義（config.tsと同期。LAST=閉店、翌日時刻は00:00形式）
const TEMPLATE_TIMES = {
  A: { start: '20:00', end: 'LAST' },
  B: { start: '20:30', end: '02:00' },
  C: { start: '21:30', end: 'LAST' },
  D: { start: '22:00', end: '02:00' },
};

// JST の今日 (UTC基準Dateオブジェクト)
function todayJST() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toDateStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS_JP[d.getUTCDay()]})`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS_JP[d.getUTCDay()]})`;
}

// h<9（新形式 "02:00"）または h>=24（旧形式 "26:00"）を "翌XX:XX" に変換
function displayTime(value) {
  if (!value || value === 'LAST') return value;
  const parts = value.split(':');
  if (parts.length !== 2) return value;
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return value;
  if (h >= 24) return `翌${String(h - 24).padStart(2, '0')}:${parts[1]}`;
  if (h < 9) return `翌${String(h).padStart(2, '0')}:${parts[1]}`;
  return value;
}

function getShiftTimeLabel(shift) {
  if (shift.timeType === 'time' && shift.timeStart && shift.timeEnd) {
    return `${displayTime(shift.timeStart)}〜${displayTime(shift.timeEnd)}`;
  }
  if (shift.timeType === 'template' && shift.template && TEMPLATE_TIMES[shift.template]) {
    const t = TEMPLATE_TIMES[shift.template];
    return `${t.start}〜${displayTime(t.end)}`;
  }
  if (shift.timeType === 'other') return 'その他';
  return '';
}

// 全角数字・区切り文字を半角に正規化
function normStr(s) {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[／]/g, '/')
    .replace(/[．]/g, '.')
    .replace(/[ー−‐–—]/g, '-');
}

// M/D 形式の年を決定（180日以上前なら来年）
function resolveYMD(year, month, day, today) {
  let d = new Date(Date.UTC(year, month - 1, day));
  if (today - d > 180 * 86400 * 1000) d = new Date(Date.UTC(year + 1, month - 1, day));
  return d;
}

// キーワード → { type, dates, label }
function resolveDateKeyword(kw, today) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  if (['今日', 'きょう', '本日'].includes(kw)) {
    return { type: 'single', dates: [toDateStr(today)], label: '今日' };
  }
  if (['明日', 'あした', 'あす', '翌日'].includes(kw)) {
    return { type: 'single', dates: [toDateStr(addDays(today, 1))], label: '明日' };
  }
  if (['明後日', 'あさって'].includes(kw)) {
    return { type: 'single', dates: [toDateStr(addDays(today, 2))], label: '明後日' };
  }
  if (kw === '今週') {
    // 今日から7日間（月曜基準ではなく当日起算）
    const dates = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(today, i)));
    return { type: 'range', dates, label: `今週 ${formatDateShort(dates[0])}〜${formatDateShort(dates[6])}` };
  }
  if (kw === '来週') {
    const dow = today.getUTCDay();
    const mon = addDays(today, dow === 0 ? 1 : 8 - dow);
    const dates = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(mon, i)));
    return { type: 'range', dates, label: `来週 ${formatDateShort(dates[0])}〜${formatDateShort(dates[6])}` };
  }
  if (kw === '今月') {
    const end = new Date(Date.UTC(y, m + 1, 0));
    const days = end.getUTCDate() - today.getUTCDate() + 1;
    const dates = Array.from({ length: days }, (_, i) => toDateStr(addDays(today, i)));
    return { type: 'range', dates, label: `${m + 1}月（本日以降）` };
  }
  if (kw === '来月') {
    const first = new Date(Date.UTC(y, m + 1, 1));
    const end = new Date(Date.UTC(y, m + 2, 0));
    const dates = Array.from({ length: end.getUTCDate() }, (_, i) => toDateStr(addDays(first, i)));
    return { type: 'range', dates, label: `${m + 2}月` };
  }
  return null;
}

/**
 * メッセージテキストを日付 + 任意の名前として解析
 * 戻り値: { type, dates, label, queryName } | null
 *
 * 対応フォーマット:
 *   今日 / 明日 / 明後日 / 今週 / 来週 / 今月 / 来月
 *   7/21 / 7.21 / 7-21 / 7月21日 / 7月21 （半角・全角両対応）
 *   2025/7/21 / 2025-7-21 / 2025.7.21
 *   上記 + スペース + 名前 で名前絞り込み（例: 7/21 山田太郎）
 */
function parseDateMessage(raw) {
  const text = normStr(raw.trim());
  const today = todayJST();
  const y = today.getUTCFullYear();

  const KW_PATTERN = /^(今日|きょう|本日|明日|あした|あす|翌日|明後日|あさって|今週|来週|今月|来月)([\s　]+(.+))?$/;
  const kwM = text.match(KW_PATTERN);
  if (kwM) {
    const resolved = resolveDateKeyword(kwM[1], today);
    if (resolved) return { ...resolved, queryName: kwM[3]?.trim() || null };
  }

  // YYYY/M/D or YYYY-M-D or YYYY.M.D
  const fullYearM = text.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})([\s　]+(.+))?$/);
  if (fullYearM) {
    const date = new Date(Date.UTC(+fullYearM[1], +fullYearM[2] - 1, +fullYearM[3]));
    return { type: 'single', dates: [toDateStr(date)], label: null, queryName: fullYearM[5]?.trim() || null };
  }

  // M月D日 or M月D
  const kanjiM = text.match(/^(\d{1,2})月(\d{1,2})日?([\s　]+(.+))?$/);
  if (kanjiM) {
    const date = resolveYMD(y, +kanjiM[1], +kanjiM[2], today);
    return { type: 'single', dates: [toDateStr(date)], label: null, queryName: kanjiM[4]?.trim() || null };
  }

  // M/D or M-D or M.D
  const slashM = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})([\s　]+(.+))?$/);
  if (slashM) {
    const mo = +slashM[1], d = +slashM[2];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const date = resolveYMD(y, mo, d, today);
      return { type: 'single', dates: [toDateStr(date)], label: null, queryName: slashM[4]?.trim() || null };
    }
  }

  return null;
}

// Firestoreから確定・未承認シフトを取得（不可=timeType:'none'は除外）
// 戻り値: { [date]: { confirmed: Shift[], plan: Shift[] } }
async function fetchShifts(db, dates) {
  if (!db || dates.length === 0) return {};
  const sorted = [...dates].sort();
  const minDate = sorted[0];
  const maxDate = sorted[sorted.length - 1];

  const snap = await db.collection('shifts')
    .where('date', '>=', minDate)
    .where('date', '<=', maxDate)
    .get();

  const dateSet = new Set(dates);
  const result = {};
  snap.docs.forEach((doc) => {
    const s = doc.data();
    // 不可（timeType:'none'）・否認済・削除申請は除外
    if (
      (s.status === 'confirmed' || s.status === 'plan') &&
      s.timeType !== 'none' &&
      dateSet.has(s.date)
    ) {
      if (!result[s.date]) result[s.date] = { confirmed: [], plan: [] };
      if (s.status === 'confirmed') result[s.date].confirmed.push(s);
      else result[s.date].plan.push(s);
    }
  });
  return result;
}

// 名前の正規化（スペース除去で照合）
function normName(n) { return (n || '').replace(/[\s　]/g, ''); }

// 1日分のレスポンス文字列を生成
// dayData: { confirmed: Shift[], plan: Shift[] }
function buildSingleDayReply(dateStr, dayData, queryName, label) {
  const { confirmed, plan } = dayData;
  const dateLabel = label || formatDateFull(dateStr);

  if (queryName) {
    const qn = normName(queryName);
    const hit = confirmed.find((s) => normName(s.memberName) === qn);
    if (!hit) {
      const pending = plan.find((s) => normName(s.memberName) === qn);
      if (pending) return `📅 ${dateLabel}\n\n「${queryName}」さんのシフトはまだ未承認です。`;
      return `📅 ${dateLabel}\n\n「${queryName}」さんの確定シフトはありません。`;
    }
    const tl = getShiftTimeLabel(hit);
    let msg = `📅 ${dateLabel}\n✅ ${hit.subject}`;
    if (tl) msg += `\n⏰ ${tl}`;
    if (hit.place) msg += `\n📍 ${hit.place}`;
    return msg;
  }

  if (confirmed.length === 0 && plan.length === 0) {
    return `📅 ${dateLabel}のシフト\n\nこの日の確定シフトはありません。`;
  }

  const pendingNote = plan.length > 0 ? `・未承認${plan.length}件` : '';
  let msg = `📅 ${dateLabel}のシフト（確定${confirmed.length}名${pendingNote}）\n`;
  for (const s of confirmed) {
    const tl = getShiftTimeLabel(s);
    msg += `\n✅ ${s.subject}`;
    if (tl) msg += `\n   ⏰ ${tl}`;
    if (s.place) msg += `\n   📍 ${s.place}`;
  }
  return msg;
}

// 期間分のレスポンス文字列を生成
// byDate: { [date]: { confirmed: Shift[], plan: Shift[] } }
function buildRangeReply(dates, byDate, rangeLabel, queryName) {
  let msg = `📅 ${rangeLabel}のシフト`;
  let totalDays = 0;

  for (const date of dates) {
    const { confirmed: allConfirmed, plan: allPlan } = byDate[date] || { confirmed: [], plan: [] };
    const confirmed = queryName
      ? allConfirmed.filter((s) => normName(s.memberName) === normName(queryName))
      : allConfirmed;
    const plan = queryName
      ? allPlan.filter((s) => normName(s.memberName) === normName(queryName))
      : allPlan;

    if (confirmed.length === 0 && plan.length === 0) continue;
    totalDays++;

    const pendingNote = plan.length > 0 ? `・未承認${plan.length}件` : '';
    msg += `\n\n▸ ${formatDateFull(date)}（確定${confirmed.length}名${pendingNote}）`;
    for (const s of confirmed) {
      const tl = getShiftTimeLabel(s);
      msg += `\n  ✅ ${s.subject}`;
      if (tl) msg += `\n     ⏰ ${tl}`;
      if (s.place) msg += `\n     📍 ${s.place}`;
    }
  }

  if (totalDays === 0) {
    msg += '\n\n該当するシフトはありません。';
  }

  // LINEの文字数上限（5000字）に合わせて切り捨て
  if (msg.length > 4800) {
    msg = msg.slice(0, 4800) + '\n…（件数が多いため省略）';
  }
  return msg;
}

// ──────────────────────────────────────────────────────────
// エラー通知・グループ登録ヘルパー
// ──────────────────────────────────────────────────────────

async function notifySelfError(context, eventType, errorMsg) {
  const selfId = process.env.LINE_SELF_USER_ID;
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  if (!selfId || !token) {
    console.error('[notifySelfError] LINE_SELF_USER_ID または CHANNEL_ACCESS_TOKEN が未設定のため通知スキップ');
    return;
  }
  const text = `[システムエラー]\n場所: ${context}\nイベント: ${eventType}\nエラー: ${errorMsg}\n時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;
  try {
    await client.pushMessage({ to: selfId, messages: [{ type: 'text', text }] });
  } catch (e) {
    console.error('[notifySelfError] LINE通知失敗:', e?.message ?? e);
  }
}

async function handleGroupRegistration(newGroupId, senderUserId, db) {
  const selfId = process.env.LINE_SELF_USER_ID;
  let notifyText;

  if (db) {
    const configRef = db.collection('config').doc('lineConfig');
    const snap = await configRef.get();
    const existingGroupId = snap.exists ? snap.data()?.groupId : null;

    if (!existingGroupId) {
      await configRef.set(
        { groupId: newGroupId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      notifyText = `[グループ登録完了]\n✅ 新規登録しました。\nGID: ${newGroupId}`;
      console.log('[webhook] グループ登録 新規:', newGroupId);
    } else if (existingGroupId === newGroupId) {
      notifyText = `[グループ登録]\nℹ️ 既に同じGIDが登録済みです。\nGID: ${newGroupId}`;
    } else {
      notifyText = `[グループ登録 競合]\n⚠️ 別のGIDが既に登録されています。\n管理画面からGIDを削除してから再登録してください。\n\n登録済GID: ${existingGroupId}\n新規GID: ${newGroupId}`;
    }
  } else {
    notifyText = '[グループ登録] Firebase未接続のため登録できませんでした。';
  }

  const pushTasks = [];
  if (selfId) {
    pushTasks.push(client.pushMessage({ to: selfId, messages: [{ type: 'text', text: notifyText }] }));
  }
  if (senderUserId && senderUserId !== selfId) {
    pushTasks.push(client.pushMessage({ to: senderUserId, messages: [{ type: 'text', text: notifyText }] }));
  }
  await Promise.allSettled(pushTasks);
}

// ──────────────────────────────────────────────────────────
// 名前変更トークン発行（FirestoreにAdmin SDKで書き込む）
// ──────────────────────────────────────────────────────────

async function generateNameChangeToken(db, forMember) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 60 * 60 * 1000;
  await db.collection('nameChangeTokens').doc(token).set({
    createdAt: now,
    expiresAt,
    used: false,
    forMember: forMember ?? null,
  });
  const frontUrl = process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN || '';
  const link = frontUrl ? `${frontUrl}/name-setup?token=${token}` : `（FRONTEND_URL未設定）token=${token}`;
  const expStr = new Date(expiresAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  return { token, link, expStr };
}

// ──────────────────────────────────────────────────────────
// 開発者専用コマンドハンドラ（SELF_USER_IDからのDMのみ実行）
// ──────────────────────────────────────────────────────────

const DEV_HELP_TEXT = `🛠 開発者コマンド

📝 名前変更リンク発行
  名前変更
  名前変更 山田花子
（1時間有効・1回限り）

📅 シフト確認（共通）
  今日 / 今週 / 7/21 など`;

async function handleDevCommand(text, replyToken, db) {
  if (text === 'ヘルプ') {
    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: DEV_HELP_TEXT }] });
    return true;
  }

  const ncMatch = text.match(/^名前変更(?:[\s　]+(.+))?$/);
  if (ncMatch) {
    const forMember = ncMatch[1]?.trim() || null;
    if (!db) {
      await client.replyMessage({ replyToken, messages: [{ type: 'text', text: '❌ Firebase未接続のためトークン発行できません。' }] });
      return true;
    }
    const { link, expStr } = await generateNameChangeToken(db, forMember);
    const msg = [
      '🔗 名前変更リンクを発行しました',
      `⏰ 有効期限: ${expStr} まで（60分間）`,
      forMember ? `👤 対象: ${forMember} さん` : '👤 対象: 誰でも使用可',
      '⚠️  1回限り有効',
      '',
      link,
    ].join('\n');
    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: msg }] });
    return true;
  }

  return false;
}

// ──────────────────────────────────────────────────────────
// メインイベントハンドラ
// ──────────────────────────────────────────────────────────

async function handleLineEvent(event) {
  const db = getDb();

  // 友達追加: 登録案内を送信
  if (event.type === 'follow') {
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: '本チャットに、以下の形式でメッセージを送ってください。\n\n【名前登録 あなたの名前】\n\n例）名前登録 田中太郎\n\n※名前はシフト管理システムに登録されているものと完全一致が必要です。\n※1通として送信してください。（余分な言葉はエラーになります）\n\n\n━━━━━━━━━━━━\n📅 シフト確認の使い方\n登録後は日付を送信するとその日の確定シフトを返信します。\n\n例: 今日 / 今月\n━━━━━━━━━━━━',
      }],
    });
    return;
  }

  // グループ参加: 案内メッセージを返信
  if (event.type === 'join' && event.source?.type === 'group') {
    console.log(`[webhook] グループ参加: groupId=${event.source.groupId}`);
    try {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'シフト管理システムBotが参加しました。\n\n管理者がこのグループで「グループ登録」と送信すると、グループへのシフト連絡が有効になります。' }],
      });
    } catch (e) {
      console.warn('[webhook] グループ参加返信失敗:', e?.message);
    }
    return;
  }

  // テキストメッセージ
  if (event.type === 'message' && event.message?.type === 'text') {
    const text = event.message.text.trim();
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;
    const sourceType = event.source?.type;

    // ① グループ登録（グループのみ）
    if (text === 'グループ登録' && sourceType === 'group') {
      await handleGroupRegistration(event.source.groupId, lineUserId, db);
      return;
    }

    // ② 開発者専用コマンド（SELF_USER_IDからのDMのみ）
    if (sourceType === 'user' && lineUserId === SELF_USER_ID) {
      const handled = await handleDevCommand(text, replyToken, db);
      if (handled) return;
    }

    // ③ 名前登録（「名前登録 名前」形式）
    const newMatch = text.match(/^名前登録[\s　]+(.+)$/);
    const oldMatch = !newMatch && text.match(/^登録\s*[:：]\s*(.+)$/);
    const nameMatch = newMatch || oldMatch;

    if (nameMatch) {
      console.log(`[webhook] 名前登録試行: userId=${lineUserId} text="${text}"`);
      const raw = nameMatch[1].trim();

      if (raw.includes(' ') || raw.includes('　') || raw.length > 15) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: '名前の形式が正しくありません。\n\n名前のみを入力してください。\n例）名前登録 田中太郎' }],
        });
        return;
      }

      const memberName = raw;
      let replyText;

      if (db && lineUserId) {
        const [nameSnap, lineIdSnap] = await Promise.all([
          db.collection('members').where('name', '==', memberName).limit(1).get(),
          db.collection('members').where('lineUserId', '==', lineUserId).limit(1).get(),
        ]);

        if (nameSnap.empty) {
          console.log(`[webhook] 名前不一致: "${memberName}" は membersコレクションに存在しない`);
          const frontendUrl = process.env.FRONTEND_URL ?? 'https://shift-control-app-shifter.vercel.app';
          let nameList = '（取得失敗）';
          try {
            const membersSnap = await db.collection('members').orderBy('name').get();
            nameList = membersSnap.empty ? '（まだ登録者なし）' : membersSnap.docs.map((d) => `・${d.data().name}`).join('\n');
          } catch (_) {}
          replyText = `「${memberName}」はメンバー一覧に見つかりません。\n\nまずシフト管理システムにログインして名前を登録してください：\n${frontendUrl}/login\n\n現在の登録名簿:\n${nameList}\n\n上記の名前と完全一致させて再度お試しください。`;

        } else if (!lineIdSnap.empty && lineIdSnap.docs[0].id !== nameSnap.docs[0].id) {
          const existingName = lineIdSnap.docs[0].data().name;
          replyText = `このLINEアカウントは既に「${existingName}」として登録されています。\n\n1つのLINEアカウントで登録できる名前は1つのみです。`;

        } else {
          const nameDoc = nameSnap.docs[0];
          const existingLineId = nameDoc.data().lineUserId;

          if (existingLineId && existingLineId !== lineUserId) {
            replyText = `「${memberName}」という名前は既に別のLINEアカウントで登録済みです。\n\n変更したい場合は管理者に現在の登録を削除してもらってから再送信してください。`;
          } else if (existingLineId === lineUserId) {
            replyText = `${memberName}さんのLINEアカウントは既に登録済みです。\nシフト連絡は引き続き届きます。`;
          } else {
            console.log(`[webhook] 名前登録成功: "${memberName}" → userId=${lineUserId}`);
            await nameDoc.ref.update({
              lineUserId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            replyText = `${memberName}さんのLINEアカウントを登録しました。\nシフト連絡が届くようになります。\n\n📅 日付を送信するとその日の確定シフトを確認できます。\n例: 7/21 / 今日 / 今週`;
          }
        }
      } else {
        replyText = 'サーバーエラーが発生しました。管理者に連絡してください。';
      }

      await client.replyMessage({ replyToken, messages: [{ type: 'text', text: replyText }] });
      return;
    }

    // ④ 日付問い合わせ
    const dateQuery = parseDateMessage(text);
    if (dateQuery) {
      if (!db) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: 'データベースに接続できません。しばらくしてから再度お試しください。' }],
        });
        return;
      }

      console.log(`[webhook] 日付問い合わせ: userId=${lineUserId} type=${dateQuery.type} dates=${dateQuery.dates.length}件 name=${dateQuery.queryName ?? 'なし'}`);

      const byDate = await fetchShifts(db, dateQuery.dates);
      let replyMsg;

      if (dateQuery.type === 'single') {
        const dayData = byDate[dateQuery.dates[0]] || { confirmed: [], plan: [] };
        replyMsg = buildSingleDayReply(dateQuery.dates[0], dayData, dateQuery.queryName, dateQuery.label);
      } else {
        replyMsg = buildRangeReply(dateQuery.dates, byDate, dateQuery.label, dateQuery.queryName);
      }

      await client.replyMessage({ replyToken, messages: [{ type: 'text', text: replyMsg }] });
      return;
    }

    // ⑥ 未認識メッセージ（スキップ）
    console.log(`[webhook] 未認識メッセージ（スキップ）: userId=${lineUserId} text="${text}"`);
  }
}

app.use((err, _req, res, _next) => {
  const msg = err?.message ?? String(err);
  console.error('[server error]', { path: _req?.path, method: _req?.method, error: msg });
  notifySelfError('APIエンドポイント', `${_req?.method} ${_req?.path}`, msg).catch(() => {});
  res.status(500).json({ ok: false, message: msg });
});

// Express の外側で発生した未捕捉エラーを LINE に通知してからプロセス終了
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[unhandledRejection]', msg);
  notifySelfError('unhandledRejection', 'Promise', msg).catch(() => {}).finally(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  const msg = err?.message ?? String(err);
  console.error('[uncaughtException]', msg);
  notifySelfError('uncaughtException', 'process', msg).catch(() => {}).finally(() => process.exit(1));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`back server on port ${PORT}`));
