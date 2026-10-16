// Dónde se guardan grupos, jugadores e intentos.
// Con firebaseConfig: Firestore + login anónimo (cada celular es un jugador).
// Sin config: modo prueba con localStorage, solo en este dispositivo.
//
// Estructura (igual en los dos modos):
//   groups/{gid}                 { name, owner, ownerName, status, round, startDay, schedule[] }
//   groups/{gid}/members/{uid}   { name }
//   groups/{gid}/plays/{uid_round_day}  { uid, round, day, used, changuis, scores[], best }

import { firebaseConfig } from './firebase-config.js';
import { ATTEMPTS, applyResult, emptyPlay } from './tournament.js';

const FB = '10.12.2';

export async function connect() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    try {
      return await firebaseAdapter(firebaseConfig);
    } catch (e) {
      console.error('Firebase no conectó', e);
      const local = localAdapter();
      local.error = 'No se pudo conectar con Firebase. Revisá la configuración y que esté activado el acceso anónimo.';
      return local;
    }
  }
  return localAdapter();
}

const playId = (uid, round, day) => `${uid}_${round}_${day}`;
const noAttempts = () => Object.assign(new Error('Ya usaste tus 3 intentos de hoy.'), { code: 'sin-intentos' });

async function firebaseAdapter(config) {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-firestore.js`),
  ]);
  const { getAuth, signInAnonymously, onAuthStateChanged } = authMod;
  const { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, runTransaction, serverTimestamp } = fs;

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const user = await new Promise((res, rej) => {
    const off = onAuthStateChanged(auth, u => {
      if (u) { off(); res(u); } else signInAnonymously(auth).catch(e => { off(); rej(e); });
    });
  });
  const uid = user.uid;

  return {
    mode: 'firebase',
    uid,
    async createGroup(name, ownerName) {
      const ref = doc(collection(db, 'groups'));
      await setDoc(ref, { name, owner: uid, ownerName, status: 'waiting', round: 1, startDay: null, schedule: [], createdAt: serverTimestamp() });
      await setDoc(doc(db, 'groups', ref.id, 'members', uid), { name: ownerName, joinedAt: serverTimestamp() });
      return ref.id;
    },
    async getGroup(gid) {
      const s = await getDoc(doc(db, 'groups', gid));
      return s.exists() ? { id: gid, ...s.data() } : null;
    },
    async updateGroup(gid, patch) {
      await updateDoc(doc(db, 'groups', gid), patch);
    },
    async listMembers(gid) {
      const q = await getDocs(collection(db, 'groups', gid, 'members'));
      return q.docs.map(d => ({ uid: d.id, name: d.data().name }));
    },
    async joinGroup(gid, name) {
      await setDoc(doc(db, 'groups', gid, 'members', uid), { name, joinedAt: serverTimestamp() }, { merge: true });
    },
    async getPlays(gid, round) {
      const q = await getDocs(query(collection(db, 'groups', gid, 'plays'), where('round', '==', round)));
      return q.docs.map(d => d.data());
    },
    async beginAttempt(gid, round, day) {
      const ref = doc(db, 'groups', gid, 'plays', playId(uid, round, day));
      return runTransaction(db, async tx => {
        const s = await tx.get(ref);
        const p = s.exists() ? s.data() : emptyPlay(uid, round, day);
        if (p.used >= ATTEMPTS) throw noAttempts();
        p.used += 1;
        tx.set(ref, p);
        return p;
      });
    },
    async finishAttempt(gid, round, day, score, threshold) {
      const ref = doc(db, 'groups', gid, 'plays', playId(uid, round, day));
      return runTransaction(db, async tx => {
        const s = await tx.get(ref);
        const res = applyResult(s.exists() ? s.data() : emptyPlay(uid, round, day), score, threshold);
        tx.set(ref, res.play);
        return res;
      });
    },
  };
}

function localAdapter() {
  const KEY = 'argengame:localdb';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { groups: {} }; } catch (e) { return { groups: {} }; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
  const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  let uid;
  try { uid = localStorage.getItem('argengame:uid'); if (!uid) { uid = 'local' + rid(); localStorage.setItem('argengame:uid', uid); } } catch (e) { uid = 'local' + rid(); }
  const grp = (d, gid) => d.groups[gid];

  return {
    mode: 'local',
    uid,
    async createGroup(name, ownerName) {
      const d = load(), gid = rid();
      d.groups[gid] = { data: { name, owner: uid, ownerName, status: 'waiting', round: 1, startDay: null, schedule: [] }, members: { [uid]: { name: ownerName } }, plays: {} };
      save(d);
      return gid;
    },
    async getGroup(gid) {
      const g = grp(load(), gid);
      return g ? { id: gid, ...g.data } : null;
    },
    async updateGroup(gid, patch) {
      const d = load();
      Object.assign(grp(d, gid).data, patch);
      save(d);
    },
    async listMembers(gid) {
      const g = grp(load(), gid);
      return g ? Object.entries(g.members).map(([u, m]) => ({ uid: u, name: m.name })) : [];
    },
    async joinGroup(gid, name) {
      const d = load();
      grp(d, gid).members[uid] = { name };
      save(d);
    },
    async getPlays(gid, round) {
      const g = grp(load(), gid);
      return g ? Object.values(g.plays).filter(p => p.round === round) : [];
    },
    async beginAttempt(gid, round, day) {
      const d = load(), g = grp(d, gid), id = playId(uid, round, day);
      const p = g.plays[id] || emptyPlay(uid, round, day);
      if (p.used >= ATTEMPTS) throw noAttempts();
      p.used += 1;
      g.plays[id] = p;
      save(d);
      return p;
    },
    async finishAttempt(gid, round, day, score, threshold) {
      const d = load(), g = grp(d, gid), id = playId(uid, round, day);
      const res = applyResult(g.plays[id] || emptyPlay(uid, round, day), score, threshold);
      g.plays[id] = res.play;
      save(d);
      return res;
    },
    // Solo modo prueba: jugadores de mentira para probar el ranking sin otro celular.
    async addBot(gid) {
      const d = load(), g = grp(d, gid);
      const names = ['Toto', 'Lali', 'Pocho', 'Vicky', 'Chino', 'Maru', 'Tano', 'Flor'];
      const used = new Set(Object.values(g.members).map(m => m.name));
      const name = names.find(n => !used.has(n)) || 'Bot ' + (Object.keys(g.members).length + 1);
      g.members['bot' + rid()] = { name, bot: true };
      save(d);
    },
    async simulateBots(gid, round, day) {
      const d = load(), g = grp(d, gid);
      let changed = false;
      for (const [u, m] of Object.entries(g.members)) {
        if (!m.bot) continue;
        for (let k = 0; k <= day; k++) {
          const id = playId(u, round, k);
          if (g.plays[id]) continue;
          const best = 3 + Math.floor(Math.random() * 30);
          g.plays[id] = { uid: u, round, day: k, used: 1 + Math.floor(Math.random() * 3), changuis: 0, scores: [best], best };
          changed = true;
        }
      }
      if (changed) save(d);
    },
  };
}
