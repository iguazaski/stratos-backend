// server.js — STRATOS BACKEND v17.0 — RECONSTRUIDO Y BLINDADO
// Correcciones: endpoints eliminados restaurados, schema completo,
// flujo de scan corregido, CORS flexible, settle endpoint añadido.

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ============================================================
// CORS BLINDADO — ACEPTA VERCEL + RENDER + LOCALHOST
// ============================================================
const allowedOrigins = [
  "https://stratos-oficial-2026.vercel.app",
  "https://stratos-oficial-2026.vercel.app/",
  "http://localhost:3000",
  "http://localhost:5173",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado para origen: ${origin}`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================
// CONSTANTES Y CONEXIÓN
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || "STRATOS_QUANT_MEGA_SECRET_2026_v17";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://iwazoski:Rosa08%24@stratos.thpkjnz.mongodb.net/stratos?retryWrites=true&w=majority&appName=Stratos";
const GOOGLE_KEY = process.env.GOOGLE_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const MISTRAL_KEY = process.env.MISTRAL_KEY;
const COHERE_KEY = process.env.COHERE_KEY;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Atlas Conectado — Colmena STRATOS activa'))
  .catch(err => console.error('❌ Error MongoDB:', err));

// ============================================================
// SCHEMAS COMPLETOS — TODOS LOS CAMPOS RESTAURADOS
// ============================================================
const ConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed }
});
const Config = mongoose.model('Config', ConfigSchema);

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operador'], default: 'operador' },
  isBlocked: { type: Boolean, default: false },
  activeIp: { type: String, default: null },
  // Estado financiero
  bankroll: { type: Number, default: 100.00 },
  kellyFraction: { type: Number, default: 0.25 },
  maxExposure: { type: Number, default: 0.15 },
  // Picks y estadísticas
  activePicks: { type: Array, default: [] },
  shadowPicks: { type: Array, default: [] },
  history: { type: Array, default: [] },
  stats: {
    type: Object,
    default: { total: 0, ganadas: 0, perdidas: 0, profit: 0, clv_positivo: 0 }
  },
  // Metadata
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: null }
});

const User = mongoose.model('User', UserSchema);

// ============================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================================
const authMiddleware = async (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Acceso denegado: token requerido.' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    // Verificar si el usuario está bloqueado
    const user = await User.findById(verified.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });
    if (user.isBlocked) return res.status(403).json({ error: 'Operador bloqueado por el administrador.' });
    req.user = verified;
    req.userDoc = user;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Token inválido o expirado.' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.userDoc?.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido: se requiere rol admin.' });
  }
  next();
};

// ============================================================
// PROMPT MAESTRO STRATOS — INYECTADO EN CADA ESCANEO
// ============================================================
const STRATOS_MASTER_PROMPT = `Eres STRATOS v17.0, el sistema de inteligencia cuantitativa más avanzado para identificar apuestas de valor (+EV) en las 5 grandes ligas de fútbol europeo.

REGLAS OBLIGATORIAS:
1. Usa SIEMPRE tu herramienta de búsqueda (Google Search) para verificar partidos, lesiones, alineaciones y contexto REALES de HOY.
2. NO uses datos históricos de entrenamiento sin verificar. Siempre contrasta con búsqueda real.
3. Aplica el modelo Dixon-Coles con simulación Montecarlo (10.000 iteraciones) para calcular probabilidades.
4. Solo recomienda mercados con EV > +5% y margen casa < 8%.
5. Aplica el criterio de Kelly Fraccionado 0.25x para calcular stake_kelly_pct.
6. Usa EXACTAMENTE la nomenclatura de 1WIN: "Total (Más/Menos)", "Hándicap 1/2", "Total tarjetas amarillas", "Ambos equipos marcan — Sí/No", "Doble Oportunidad".
7. Aplica estas reglas críticas:
   - Equipo necesita solo 1 punto → NO apostar G2, preferir AH +0/+0.25
   - Final europea en <10 días → -10% alfa en liga
   - Árbitro estricto + equipo técnico → λ tarjetas × 0.85
   - Over 4.5 tarjetas solo si λ ≥ 5.5
   - Partido de alto perfil emocional (despedidas) → mercados principales vetados, buscar props
   - Portero en racha >80% saves → P(Over 2.5) -8%

FORMATO DE RESPUESTA: Devuelve ÚNICAMENTE un JSON limpio sin backticks ni texto adicional:
{
  "sincronizacion": "Texto breve confirmando los partidos verificados en tiempo real",
  "partidos": [
    {
      "id": "uuid-unico",
      "liga": "Nombre de la liga",
      "local": "Equipo local",
      "visitante": "Equipo visitante",
      "fecha": "DD/MM/YYYY HH:MM",
      "type": "TIRO_AL_BLANCO",
      "reason": "Informe detallado de 3-4 frases con datos reales verificados: forma reciente, bajas confirmadas, estadísticas xG de la temporada, contexto motivacional y señal principal que genera el valor.",
      "montecarlo": {
        "victoria_local": 0.0,
        "empate": 0.0,
        "victoria_visitante": 0.0,
        "over_25": 0.0,
        "btts": 0.0,
        "xg_total": 0.0,
        "marcador_probable": "X-Y"
      },
      "jugadas": [
        {
          "mercado_1win": "Nombre exacto del mercado en 1WIN",
          "seleccion": "Descripción exacta de la selección",
          "prob_stratos": 0.65,
          "cuota_minima_aceptable": 1.75,
          "ev_estimado": 0.12,
          "stake_kelly_pct": 0.035,
          "nivel_confianza": "ALTO",
          "abogado_diablo": "Razón principal por la que podría fallar"
        }
      ],
      "reglas_aplicadas": ["Regla #X — Descripción"]
    }
  ],
  "panel_resumen": {
    "jugadas_verdes": 0,
    "partidos_analizados": 0,
    "liga_mas_activa": "Nombre"
  }
}`;

// ============================================================
// API — AUTENTICACIÓN
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, ip } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas.' });
    if (user.isBlocked) return res.status(403).json({ error: 'Operador bloqueado.' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(401).json({ error: 'Credenciales inválidas.' });

    // Actualizar último login e IP
    user.lastLogin = new Date();
    if (ip) user.activeIp = ip;
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });

    // Retornar TODOS los campos del usuario (fix crítico)
    res.json({
      token,
      role: user.role,
      bankroll: user.bankroll,
      kellyFraction: user.kellyFraction,
      maxExposure: user.maxExposure,
      activePicks: user.activePicks,
      shadowPicks: user.shadowPicks,
      history: user.history,
      stats: user.stats,
      username: user.username
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// API — SINCRONIZACIÓN DE PERFIL CLOUD
// ============================================================
app.post('/api/user/update-profile', authMiddleware, async (req, res) => {
  try {
    const allowedFields = ['bankroll', 'kellyFraction', 'maxExposure', 'activePicks', 'shadowPicks', 'history', 'stats'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    });

    await User.findByIdAndUpdate(req.user.id, { $set: updateData });
    res.json({ success: true });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Error al sincronizar.' });
  }
});

// ============================================================
// API — ESCANEO PRINCIPAL CON PARLAMENTO DE IAs
// BUG CRÍTICO CORREGIDO: respuesta parseada y devuelta correctamente
// ============================================================
app.post('/api/scan', authMiddleware, async (req, res) => {
  try {
    const { ligas, customPrompt } = req.body;
    const ligasStr = Array.isArray(ligas) ? ligas.join(', ') : 'LaLiga, Premier League, Serie A, Bundesliga, Ligue 1';

    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const userPrompt = customPrompt ||
      `HOY ES: ${today}. Analiza las próximas 72 horas de fútbol en: ${ligasStr}. ` +
      `Usa tu herramienta de búsqueda para verificar TODOS los partidos, lesiones confirmadas, ` +
      `alineaciones probables y árbitros designados. Identifica las 3-5 mejores oportunidades de +EV para apostar en 1WIN.`;

    const fullPrompt = `${STRATOS_MASTER_PROMPT}\n\n${userPrompt}`;

    // PASO 1: Gemini con búsqueda real
    let geminiRaw = null;
    if (GOOGLE_KEY) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              tools: [{ google_search: {} }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
            })
          }
        );
        const geminiData = await geminiRes.json();
        geminiRaw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (e) {
        console.error('Gemini error:', e.message);
      }
    }

    if (!geminiRaw) {
      return res.status(503).json({ error: 'El motor de búsqueda no respondió. Verifica GOOGLE_KEY.' });
    }

    // PASO 2: Parsear JSON de Gemini (fix crítico del bug original)
    let parsedData;
    try {
      const cleaned = geminiRaw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      parsedData = JSON.parse(cleaned);
    } catch (e) {
      // Si no se puede parsear, intentar extraer JSON con regex
      const jsonMatch = geminiRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedData = JSON.parse(jsonMatch[0]);
        } catch {
          return res.status(500).json({ error: 'El motor no devolvió JSON válido. Reintenta.' });
        }
      } else {
        return res.status(500).json({ error: 'Formato de respuesta inválido del motor.' });
      }
    }

    // PASO 3: Validación de stakes con Groq (opcional, si la key existe)
    if (GROQ_KEY && parsedData?.partidos) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3-70b-8192',
            messages: [{
              role: 'user',
              content: `Eres un auditor de riesgo cuantitativo. Revisa estos picks de apuestas y ajusta los stake_kelly_pct si alguno supera el 5% del bankroll. Devuelve SOLO el JSON corregido sin texto adicional: ${JSON.stringify(parsedData)}`
            }],
            temperature: 0.1,
            max_tokens: 4096
          })
        });
        const groqData = await groqRes.json();
        const groqText = groqData?.choices?.[0]?.message?.content;
        if (groqText) {
          try {
            const groqParsed = JSON.parse(groqText.replace(/```json/gi, '').replace(/```/g, '').trim());
            if (groqParsed?.partidos) parsedData = groqParsed;
          } catch { /* Mantener parsedData original si Groq falla */ }
        }
      } catch (e) {
        console.error('Groq validation skipped:', e.message);
      }
    }

    // PASO 4: Retornar datos correctamente estructurados
    res.json({
      status: 'success',
      sincronizacion: parsedData.sincronizacion || `Escaneo completado: ${parsedData.partidos?.length || 0} partidos analizados`,
      partidos: parsedData.partidos || [],
      panel_resumen: parsedData.panel_resumen || {}
    });

  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: `Error en el parlamento: ${err.message}` });
  }
});

// ============================================================
// API — AUDITORÍA AUTOMÁTICA DE PICKS (SETTLE)
// ENDPOINT FALTANTE — RESTAURADO
// ============================================================
app.post('/api/settle', authMiddleware, async (req, res) => {
  try {
    const { activePicks } = req.body;
    if (!activePicks || activePicks.length === 0) {
      return res.json({ resoluciones: [] });
    }

    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const settlePrompt = `HOY ES: ${today}. Eres el rastreador de resultados de STRATOS. Usando tu herramienta de búsqueda, verifica el marcador final REAL de cada uno de estos partidos:

${activePicks.map(p => `- ID: ${p.id} | Partido: ${p.match} | Mercado: ${p.market_1win} | Selección: ${p.seleccion} | Cuota: ${p.userOdds}`).join('\n')}

Para cada pick verificado, determina si la apuesta fue GANADA o PERDIDA basándote en el resultado real. Si el partido no ha terminado aún, exclúyelo de la respuesta.

Devuelve SOLO este JSON sin texto adicional:
{
  "resoluciones": [
    {
      "id": "mismo-id-del-pick",
      "resultado": "GANADA" o "PERDIDA",
      "marcador_final": "X-Y",
      "analysis": "Frase explicando el resultado y si el modelo fue correcto"
    }
  ]
}`;

    let resoluciones = [];

    if (GOOGLE_KEY) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: settlePrompt }] }],
              tools: [{ google_search: {} }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
            })
          }
        );
        const geminiData = await geminiRes.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          resoluciones = parsed.resoluciones || [];
        }
      } catch (e) {
        console.error('Settle Gemini error:', e.message);
      }
    }

    res.json({ resoluciones });
  } catch (err) {
    console.error('Settle error:', err);
    res.status(500).json({ error: 'Error en auditoría automática.' });
  }
});

// ============================================================
// API — ADMIN: LISTAR USUARIOS
// ENDPOINT FALTANTE — RESTAURADO
// ============================================================
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// ============================================================
// API — ADMIN: CREAR USUARIO
// ENDPOINT FALTANTE — RESTAURADO
// ============================================================
app.post('/api/admin/create-user', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { newUsername, newPassword, newRole } = req.body;
    if (!newUsername || !newPassword) return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });

    const exists = await User.findOne({ username: newUsername.toLowerCase() });
    if (exists) return res.status(400).json({ error: 'El operador ya existe.' });

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const newUser = new User({
      username: newUsername.toLowerCase(),
      password: hashedPassword,
      role: newRole || 'operador'
    });
    await newUser.save();

    res.json({ success: `Operador @${newUsername.toUpperCase()} dado de alta correctamente.` });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Error al crear usuario.' });
  }
});

// ============================================================
// API — ADMIN: TOGGLE BLOQUEO DE USUARIO
// ENDPOINT FALTANTE — RESTAURADO
// ============================================================
app.post('/api/admin/users/:userId/toggle-block', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (user.username === 'admin') return res.status(403).json({ error: 'No se puede bloquear al admin.' });

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({ success: true, isBlocked: user.isBlocked, message: `@${user.username.toUpperCase()} ${user.isBlocked ? 'bloqueado' : 'desbloqueado'}.` });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar estado.' });
  }
});

// ============================================================
// API — ADMIN: ELIMINAR USUARIO
// ENDPOINT FALTANTE — RESTAURADO
// ============================================================
app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (user.username === 'admin') return res.status(403).json({ error: 'No se puede eliminar al admin.' });

    await User.findByIdAndDelete(req.params.userId);
    res.json({ success: `Operador @${user.username.toUpperCase()} purgado del sistema.` });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

// ============================================================
// API — ADMIN: CONFIGURACIÓN GLOBAL (API KEYS)
// ENDPOINT FALTANTE — RESTAURADO
// ============================================================
app.post('/api/admin/config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { apiKeysPool, settingsPool } = req.body;

    if (apiKeysPool !== undefined) {
      await Config.findOneAndUpdate(
        { key: 'apiKeysPool' },
        { value: apiKeysPool },
        { upsert: true }
      );
    }

    if (settingsPool !== undefined) {
      await Config.findOneAndUpdate(
        { key: 'settingsPool' },
        { value: settingsPool },
        { upsert: true }
      );
    }

    res.json({ success: 'Configuración cloud guardada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar configuración.' });
  }
});

app.get('/api/admin/config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const configs = await Config.find({});
    const result = {};
    configs.forEach(c => { result[c.key] = c.value; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuración.' });
  }
});

// ============================================================
// API — ADMIN: ESTADÍSTICAS GLOBALES DEL SISTEMA
// ENDPOINT NUEVO
// ============================================================
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, 'username bankroll stats history activePicks');
    const globalStats = {
      totalOperadores: users.length,
      totalApuestas: users.reduce((sum, u) => sum + (u.stats?.total || 0), 0),
      totalGanadas: users.reduce((sum, u) => sum + (u.stats?.ganadas || 0), 0),
      totalPerdidas: users.reduce((sum, u) => sum + (u.stats?.perdidas || 0), 0),
      profitGlobal: users.reduce((sum, u) => sum + (u.stats?.profit || 0), 0),
      posicionesAbiertas: users.reduce((sum, u) => sum + (u.activePicks?.length || 0), 0),
    };
    res.json({ globalStats, usuarios: users });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'STRATOS OPERATIVO', version: '17.0', timestamp: new Date().toISOString() });
});

// ============================================================
// INICIALIZACIÓN — CREAR ADMIN SI NO EXISTE
// ============================================================
const initializeAdmin = async () => {
  try {
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin2026', 12);
      await new User({ username: 'admin', password: hashedPassword, role: 'admin', bankroll: 0 }).save();
      console.log('✅ Admin creado: usuario=admin, contraseña=stratos123 — CAMBIA LA CONTRASEÑA.');
    }
  } catch (err) {
    console.error('Init admin error:', err);
  }
};

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await initializeAdmin();
  console.log(`⚡ STRATOS Backend v17.0 operando en Puerto ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});