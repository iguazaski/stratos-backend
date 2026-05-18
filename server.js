// server.js — BACKEND SEGURO STRATOS v15.3 (EDICIÓN PERSISTENCIA ABSOLUTA CLOUD)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET = "STRATOS_QUANT_MEGA_SECRET_2026"; 
const MONGO_URI = "mongodb+srv://iwazoski:Rosa08%24@stratos.thpkjnz.mongodb.net/stratos?retryWrites=true&w=majority&appName=Stratos";

mongoose.connect(MONGO_URI)
  .then(() => console.log('🔴 Base de Datos Colmena Conectada con Éxito (Canal Cloud)'))
  .catch(err => console.error('Error de conexión en MongoDB:', err));

// ============================================================
// ESQUEMA DE BASE DE DATOS TOTALMENTE PERSISTENTE POR OPERADOR
// ============================================================
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operador'], default: 'operador' },
  activeIp: { type: String, default: null },
  bankroll: { type: Number, default: 100.00 },
  kellyFraction: { type: Number, default: 0.25 },
  maxExposure: { type: Number, default: 0.15 },
  isBlocked: { type: Boolean, default: false },
  // 💾 NUEVO ALMACENAMIENTO DE SEGURIDAD EN LA NUBE:
  activePicks: { type: Array, default: [] },
  history: { type: Array, default: [] },
  stats: {
    type: Object,
    default: { total: 0, ganadas: 0, perdidas: 0, profit: 0 }
  }
});

const ConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'system_config' },
  apiKeysPool: { type: String, default: '' } 
});

const User = mongoose.model('User', UserSchema);
const Config = mongoose.model('Config', ConfigSchema);

const getCleanClientIp = (req) => {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
  return ip;
};

const authMiddleware = async (req, res, next) => {
  const token = req.headers['authorization'];
  const clientIp = getCleanClientIp(req);
  if (!token) return res.status(401).json({ error: 'Acceso denegado.' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    const user = await User.findById(req.user.id);
    if (!user || user.isBlocked) return res.status(403).json({ error: 'Sesión restringida.' });
    if (user.activeIp && user.activeIp !== clientIp) return res.status(403).json({ error: 'Multi-IP detectada.' });
    next();
  } catch (err) { res.status(400).json({ error: 'Token inválido.' }); }
};

// 1. LOGIN CON RECUPERACIÓN COMPLETA DE ESTADO DESDE MONGODB
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const clientIp = getCleanClientIp(req);
  try {
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || user.isBlocked) return res.status(400).json({ error: 'Fallo de acceso.' });
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Contraseña incorrecta.' });
    
    user.activeIp = clientIp;
    await user.save();
    
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    
    // Devolvemos absolutamente todo el progreso guardado de este usuario en internet
    res.json({ 
      token, role: user.role, username: user.username, 
      bankroll: user.bankroll, kellyFraction: user.kellyFraction, maxExposure: user.maxExposure,
      activePicks: user.activePicks, history: user.history, stats: user.stats
    });
  } catch (err) { res.status(500).json({ error: 'Error interno de red.' }); }
});

// 2. SINCRONIZADOR GLOBAL: GUARDA DE UN SOLO GOLPE CUALQUIER CAMBIO DEL OPERADOR
app.post('/api/user/update-profile', authMiddleware, async (req, res) => {
  const { bankroll, kellyFraction, maxExposure, activePicks, history, stats } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (bankroll !== undefined) user.bankroll = bankroll;
    if (kellyFraction !== undefined) user.kellyFraction = kellyFraction;
    if (maxExposure !== undefined) user.maxExposure = maxExposure;
    if (activePicks !== undefined) user.activePicks = activePicks;
    if (history !== undefined) user.history = history;
    if (stats !== undefined) user.stats = stats;
    
    await user.save();
    res.json({ success: 'Estado cloud sincronizado con éxito.' });
  } catch (err) { res.status(500).json({ error: 'Error al resguardar datos.' }); }
});

// 3. REGISTRAR OPERADORES
app.post('/api/admin/create-user', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denegado.' });
  const { newUsername, newPassword, newRole } = req.body;
  try {
    const userExists = await User.findOne({ username: newUsername.toLowerCase() });
    if (userExists) return res.status(400).json({ error: 'Usuario existente.' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await User.create({ username: newUsername.toLowerCase(), password: hashedPassword, role: newRole || 'operador' });
    res.json({ success: `Operador @${newUsername.toUpperCase()} inyectado con éxito.` });
  } catch (err) { res.status(500).json({ error: 'Fallo al procesar alta.' }); }
});

app.get('/api/admin/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denegado.' });
  try { res.json(await User.find({}, '-password')); } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.delete('/api/admin/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denegado.' });
  try {
    const target = await User.findById(req.params.id);
    if (target.username === 'admin') return res.status(400).json({ error: 'Protegido.' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: 'Purgado.' });
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.post('/api/admin/users/:id/toggle-block', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denegado.' });
  try {
    const target = await User.findById(req.params.id);
    if (target.username === 'admin') return res.status(400).json({ error: 'Protegido.' });
    target.isBlocked = !target.isBlocked;
    if (target.isBlocked) target.activeIp = null;
    await target.save();
    res.json({ success: 'Estado conmutado.' });
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.post('/api/admin/config', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denegado.' });
  try {
    let config = await Config.findOne({ key: 'system_config' });
    if (!config) config = new Config({ key: 'system_config' });
    config.apiKeysPool = req.body.apiKeysPool;
    await config.save();
    res.json({ success: 'Pool de llaves guardado.' });
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

// RADAR: ESCANEO COGNITIVO COMPLETO
app.post('/api/scan', authMiddleware, async (req, res) => {
  try {
    const config = await Config.findOne({ key: 'system_config' });
    if (!config || !config.apiKeysPool) return res.status(400).json({ error: 'Pool vacío.' });
    const keys = config.apiKeysPool.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const targetKey = keys[Math.floor(Math.random() * keys.length)];
    
    const googleResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${targetKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.body.prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { responseMimeType: "application/json" }
      }),
    });
    res.json(await googleResponse.json());
  } catch (err) { res.status(500).json({ error: 'Fallo de radar.' }); }
});

// MOTOR DE RESOLUCIÓN DE APUESTAS AUTOMÁTICO
app.post('/api/settle', authMiddleware, async (req, res) => {
  const { activePicks } = req.body;
  if (!activePicks || activePicks.length === 0) return res.json({ resoluciones: [] });
  try {
    const config = await Config.findOne({ key: 'system_config' });
    const keys = config.apiKeysPool.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const targetKey = keys[Math.floor(Math.random() * keys.length)];

    const promptAuditoria = `Actúa como un auditor oficial de resultados deportivos. Revisa internet en tiempo real para encontrar los marcadores finales y estadísticas de estos partidos. Determina si la línea sugerida se cumplió (GANADA) o no (PERDIDA).
    Lista de apuestas: ${JSON.stringify(activePicks)}
    Devuelve estrictamente un JSON estructurado con este formato:
    { "resoluciones": [ { "id": "id_de_la_apuesta", "resultado": "GANADA o PERDIDA", "analisis": "Escribe una frase corta indicando el marcador final real encontrado que verifique la resolución." } ] }`;

    const googleResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${targetKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptAuditoria }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { responseMimeType: "application/json" }
      }),
    });

    const googleData = await googleResponse.json();
    let rawText = googleData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText) return res.json(JSON.parse(rawText.trim()));
    throw new Error("Respuesta vacía del auditor.");
  } catch (err) { res.status(500).json({ error: 'Fallo de escrutinio.' }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`⚡ Servidor STRATOS operando en Puerto ${PORT}`));

async function crearPrimerAdmin() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("stratos123", salt);
      await User.create({ username: "admin", password: hashedPassword, role: "admin", bankroll: 100.00, kellyFraction: 0.25, maxExposure: 0.15 });
    }
  } catch (err) {}
}
mongoose.connection.once('open', crearPrimerAdmin);