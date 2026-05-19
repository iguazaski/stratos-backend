// server.js — STRATOS BACKEND v17.1 — RENDER-PROOF
// Fix: fetch polyfill + arranque robusto + todos los endpoints restaurados

'use strict';

// POLYFILL FETCH para Node.js < 18
if (typeof fetch === 'undefined') {
  try {
    const nodeFetch = require('node-fetch');
    global.fetch = nodeFetch.default || nodeFetch;
  } catch(e) {
    console.warn('node-fetch no encontrado. Usa Node 18+ o instala node-fetch@2');
  }
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Manejadores globales — evitan crash del proceso
process.on('uncaughtException', err => console.error('[UNCAUGHT]', err.message));
process.on('unhandledRejection', reason => console.error('[REJECTION]', reason));

// ============================================================
// CORS — Flexible: acepta Vercel, localhost y *.vercel.app
// ============================================================
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.endsWith('.vercel.app') ||
      origin === 'https://stratos-oficial-2026.vercel.app'
    ) return cb(null, true);
    cb(null, true); // Temporal — restringe en producción final
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================
// VARIABLES
// ============================================================
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'STRATOS_SECRET_v17_CAMBIA_EN_PROD';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://iwazoski:Rosa08%24@stratos.thpkjnz.mongodb.net/stratos?retryWrites=true&w=majority';

// ============================================================
// MONGODB — Con reconexión automática
// ============================================================
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB conectado');
  } catch(e) {
    console.error('MongoDB error:', e.message, '— reintentando en 10s');
    setTimeout(connectDB, 10000);
  }
};
mongoose.connection.on('disconnected', () => setTimeout(connectDB, 5000));

// ============================================================
// SCHEMAS
// ============================================================
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin','operador'], default: 'operador' },
  isBlocked: { type: Boolean, default: false },
  activeIp: String,
  bankroll: { type: Number, default: 100 },
  kellyFraction: { type: Number, default: 0.25 },
  maxExposure: { type: Number, default: 0.15 },
  activePicks: { type: Array, default: [] },
  shadowPicks: { type: Array, default: [] },
  history: { type: Array, default: [] },
  stats: { type: Object, default: { total:0, ganadas:0, perdidas:0, profit:0, clv_positivo:0 } },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
}));

const Config = mongoose.model('Config', new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
}));

// ============================================================
// MIDDLEWARES AUTH
// ============================================================
const auth = async (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Token requerido.' });
  try {
    const v = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(v.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });
    if (user.isBlocked) return res.status(403).json({ error: 'Bloqueado.' });
    req.user = v; req.userDoc = user; next();
  } catch { res.status(400).json({ error: 'Token inválido.' }); }
};

const admin = (req, res, next) => {
  if (req.userDoc?.role !== 'admin') return res.status(403).json({ error: 'Solo admin.' });
  next();
};

// Helper: fetch con timeout
const fetchTimeout = (promise, ms = 30000) =>
  Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), ms))]);

// ============================================================
// STRATOS PROMPT MAESTRO
// ============================================================
const STRATOS_PROMPT = `Eres STRATOS v17.1, sistema de inteligencia cuantitativa para apuestas de valor (+EV) en fútbol europeo.

REGLAS:
- USA SIEMPRE Google Search para datos REALES de HOY
- Solo recomienda mercados con EV > +5%
- Kelly Fraccionado: stake_kelly_pct = (EV/(odds-1)) * 0.25, máximo 0.05
- Nomenclatura 1WIN exacta: "Total (Más/Menos)", "Hándicap 1", "Hándicap 2", "Total tarjetas amarillas", "Ambos equipos marcan — Sí/No", "Doble Oportunidad"

DEVUELVE SOLO JSON (sin backticks ni texto extra):
{
  "sincronizacion": "descripción breve",
  "partidos": [{
    "id": "id-unico",
    "liga": "Liga",
    "local": "Equipo L",
    "visitante": "Equipo V",
    "match": "Equipo L vs Equipo V",
    "fecha": "DD/MM/YYYY HH:MM",
    "type": "TIRO_AL_BLANCO",
    "reason": "análisis de 3-4 frases con datos reales verificados",
    "montecarlo": {
      "victoria_local": 0.0, "empate": 0.0, "victoria_visitante": 0.0,
      "over_25": 0.0, "btts": 0.0, "xg_total": 0.0, "marcador_probable": "X-Y"
    },
    "jugadas": [{
      "mercado_1win": "nombre exacto",
      "seleccion": "descripción",
      "prob_stratos": 0.65,
      "cuota_minima_aceptable": 1.75,
      "ev_estimado": 0.12,
      "stake_kelly_pct": 0.03,
      "nivel_confianza": "ALTO",
      "abogado_diablo": "riesgo principal"
    }],
    "reglas_aplicadas": ["Regla aplicada"]
  }],
  "panel_resumen": { "jugadas_verdes": 0, "partidos_analizados": 0 }
}`;

// ============================================================
// HEALTH CHECK (Render lo usa para detectar que el servidor vive)
// ============================================================
app.get('/', (req, res) => res.json({ status: 'STRATOS OPERATIVO', version: '17.1', ts: new Date().toISOString() }));
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', uptime: process.uptime() }));

// ============================================================
// AUTH
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Datos incompletos.' });
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user || user.isBlocked) return res.status(401).json({ error: 'Credenciales inválidas o cuenta bloqueada.' });
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Credenciales inválidas.' });
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token, role: user.role, username: user.username,
      bankroll: user.bankroll, kellyFraction: user.kellyFraction, maxExposure: user.maxExposure,
      activePicks: user.activePicks || [], shadowPicks: user.shadowPicks || [],
      history: user.history || [], stats: user.stats || { total:0, ganadas:0, perdidas:0, profit:0, clv_positivo:0 }
    });
  } catch(e) { console.error('login:', e.message); res.status(500).json({ error: 'Error interno.' }); }
});

// ============================================================
// PERFIL
// ============================================================
app.post('/api/user/update-profile', auth, async (req, res) => {
  try {
    const allowed = ['bankroll','kellyFraction','maxExposure','activePicks','shadowPicks','history','stats'];
    const upd = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) upd[f] = req.body[f]; });
    await User.findByIdAndUpdate(req.user.id, { $set: upd });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Error sync.' }); }
});

// ============================================================
// SCAN
// ============================================================
app.post('/api/scan', auth, async (req, res) => {
  try {
    const GOOGLE_KEY = process.env.GOOGLE_KEY;
    if (!GOOGLE_KEY) return res.status(503).json({ error: 'GOOGLE_KEY no configurada en Render → Environment.' });

    const { ligas, customPrompt } = req.body;
    const ligasStr = Array.isArray(ligas) && ligas.length > 0 ? ligas.join(', ') : 'LaLiga, Premier League, Serie A, Bundesliga, Ligue 1';
    const today = new Date().toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const query = customPrompt || `HOY: ${today}. Ligas: ${ligasStr}. Analiza próximas 72h con lesiones, alineaciones y árbitros. Dame las 3-5 mejores oportunidades +EV para 1WIN.`;

    let geminiRaw;
    try {
      const r = await fetchTimeout(fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_KEY}`,
        { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            contents:[{parts:[{text:`${STRATOS_PROMPT}\n\nCONSULTA: ${query}`}]}],
            tools:[{google_search:{}}],
            generationConfig:{ temperature:0.3, maxOutputTokens:8192 }
          })
        }
      ), 45000);
      const d = await r.json();
      geminiRaw = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!geminiRaw) return res.status(503).json({ error: 'Gemini no respondió. Verifica la GOOGLE_KEY en Render.' });
    } catch(e) { return res.status(503).json({ error: `Gemini error: ${e.message}` }); }

    let parsed;
    try {
      parsed = JSON.parse(geminiRaw.replace(/```json/gi,'').replace(/```/g,'').trim());
    } catch {
      const m = geminiRaw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { return res.status(500).json({ error: 'JSON inválido del motor.' }); }}
      else return res.status(500).json({ error: 'Sin JSON en respuesta.' });
    }

    // Validación Groq opcional
    const GROQ_KEY = process.env.GROQ_KEY;
    if (GROQ_KEY && parsed?.partidos?.length > 0) {
      try {
        const gr = await fetchTimeout(fetch('https://api.groq.com/openai/v1/chat/completions', {
          method:'POST',
          headers:{'Authorization':`Bearer ${GROQ_KEY}`,'Content-Type':'application/json'},
          body: JSON.stringify({ model:'llama3-70b-8192', temperature:0.1, max_tokens:4096,
            messages:[{ role:'user', content:`Audita risk: limita stake_kelly_pct a max 0.05 en cada jugada. Devuelve SOLO el JSON corregido: ${JSON.stringify(parsed)}` }]
          })
        }), 20000);
        const gd = await gr.json();
        const gt = gd?.choices?.[0]?.message?.content;
        if (gt) { try { const gp = JSON.parse(gt.replace(/```json/gi,'').replace(/```/g,'').trim()); if(gp?.partidos) parsed = gp; } catch {} }
      } catch {}
    }

    res.json({
      status: 'success',
      sincronizacion: parsed.sincronizacion || `${parsed.partidos?.length || 0} partidos`,
      partidos: parsed.partidos || [],
      panel_resumen: parsed.panel_resumen || {}
    });
  } catch(e) { console.error('scan:', e.message); res.status(500).json({ error: e.message }); }
});

// ============================================================
// SETTLE
// ============================================================
app.post('/api/settle', auth, async (req, res) => {
  try {
    const { activePicks } = req.body;
    if (!activePicks?.length) return res.json({ resoluciones: [] });
    const GOOGLE_KEY = process.env.GOOGLE_KEY;
    if (!GOOGLE_KEY) return res.json({ resoluciones: [] });

    const today = new Date().toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' });
    const prompt = `HOY: ${today}. Verifica resultados FINALES de:\n${activePicks.map(p=>`ID:${p.id}|${p.match}|${p.market_1win} ${p.seleccion}(@${p.userOdds})`).join('\n')}\nSolo partidos TERMINADOS. JSON: {"resoluciones":[{"id":"...","resultado":"GANADA","marcador_final":"X-Y","analysis":"frase breve"}]}`;

    try {
      const r = await fetchTimeout(fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_KEY}`,
        { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], tools:[{google_search:{}}], generationConfig:{temperature:0.1,maxOutputTokens:2048} })
        }
      ), 30000);
      const d = await r.json();
      const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const p = JSON.parse(raw.replace(/```json/gi,'').replace(/```/g,'').trim());
        return res.json({ resoluciones: p.resoluciones || [] });
      }
    } catch(e) { console.error('settle:', e.message); }
    res.json({ resoluciones: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// ADMIN ENDPOINTS
// ============================================================
app.get('/api/admin/users', auth, admin, async (req,res) => {
  try { res.json(await User.find({},'-password').sort({createdAt:-1})); }
  catch(e) { res.status(500).json({error:'Error usuarios.'}); }
});

app.post('/api/admin/create-user', auth, admin, async (req,res) => {
  try {
    const { newUsername, newPassword, newRole } = req.body;
    if (!newUsername || !newPassword) return res.status(400).json({error:'Datos incompletos.'});
    if (await User.findOne({username:newUsername.toLowerCase().trim()})) return res.status(400).json({error:'Ya existe.'});
    await new User({username:newUsername.toLowerCase().trim(), password:await bcrypt.hash(newPassword,12), role:newRole||'operador'}).save();
    res.json({success:`@${newUsername.toUpperCase()} creado.`});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/admin/users/:id/toggle-block', auth, admin, async (req,res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({error:'No encontrado.'});
    if (user.username==='admin') return res.status(403).json({error:'No se puede bloquear admin.'});
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({success:true, isBlocked:user.isBlocked});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.delete('/api/admin/users/:id', auth, admin, async (req,res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({error:'No encontrado.'});
    if (user.username==='admin') return res.status(403).json({error:'No se elimina admin.'});
    await User.findByIdAndDelete(req.params.id);
    res.json({success:`@${user.username.toUpperCase()} eliminado.`});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/admin/config', auth, admin, async (req,res) => {
  try {
    const { apiKeysPool } = req.body;
    if (apiKeysPool !== undefined) await Config.findOneAndUpdate({key:'apiKeysPool'},{value:apiKeysPool},{upsert:true});
    res.json({success:'Configuración guardada.'});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/admin/stats', auth, admin, async (req,res) => {
  try {
    const users = await User.find({}, 'username bankroll stats activePicks role');
    res.json({
      globalStats: {
        totalOperadores: users.length,
        totalApuestas: users.reduce((s,u)=>s+(u.stats?.total||0),0),
        totalGanadas: users.reduce((s,u)=>s+(u.stats?.ganadas||0),0),
        totalPerdidas: users.reduce((s,u)=>s+(u.stats?.perdidas||0),0),
        profitGlobal: +users.reduce((s,u)=>s+(u.stats?.profit||0),0).toFixed(2),
        posicionesAbiertas: users.reduce((s,u)=>s+(u.activePicks?.length||0),0),
      },
      usuarios: users
    });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ============================================================
// ARRANQUE — Puerto primero, luego MongoDB
// ============================================================
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`STRATOS Backend v17.1 en puerto ${PORT}`);
  await connectDB();
  // Crear admin si no existe
  try {
    if (!await User.findOne({username:'admin'})) {
      await new User({username:'admin', password:await bcrypt.hash('admin2026',12), role:'admin', bankroll:0}).save();
      console.log('Admin creado: admin / admin2026 — CAMBIA LA CONTRASEÑA');
    }
  } catch(e) { console.error('initAdmin:', e.message); }
});