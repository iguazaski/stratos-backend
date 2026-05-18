// server.js — BACKEND SEGURO STRATOS v15.2 (EDICIÓN MULTI-PERFIL CLOUD)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

// Token secreto de encriptación para firmar las sesiones de operador
const JWT_SECRET = "STRATOS_QUANT_MEGA_SECRET_2026"; 

// CONEXIÓN GLOBAL NATIVA CLOUD
const MONGO_URI = "mongodb+srv://iwazoski:Rosa08%24@stratos.thpkjnz.mongodb.net/stratos?retryWrites=true&w=majority&appName=Stratos";

mongoose.connect(MONGO_URI)
  .then(() => console.log('🔴 Base de Datos Colmena Conectada con Éxito (Canal Cloud)'))
  .catch(err => console.error('Error de conexión en MongoDB:', err));

// ============================================================
// MODELOS DE DATOS (ESQUEMAS CON AJUSTES INDIVIDUALES)
// ============================================================
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operador'], default: 'operador' },
  activeIp: { type: String, default: null },
  // Cada usuario guarda sus propios datos financieros de forma aislada
  bankroll: { type: Number, default: 100.00 },
  kellyFraction: { type: Number, default: 0.25 },
  maxExposure: { type: Number, default: 0.15 }
});

const ConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'system_config' },
  apiKeysPool: { type: String, default: 'AIzaSyBdvGSeawJOS6yRzAiNCA7Vn_qexeeUP60' }
});

const User = mongoose.model('User', UserSchema);
const Config = mongoose.model('Config', ConfigSchema);

// ============================================================
// MIDDLEWARE DE SEGURIDAD (VERIFICACIÓN DE TOKEN E IP)
// ============================================================
const authMiddleware = async (req, res, next) => {
  const token = req.headers['authorization'];
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!token) return res.status(401).json({ error: 'Acceso denegado. Falta token de autenticación.' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no registrado.' });

    if (user.activeIp && user.activeIp !== clientIp) {
      return res.status(403).json({ error: 'ALERTA DE SEGURIDAD: Intento de multi-sesión IP detectado.' });
    }

    next();
  } catch (err) {
    res.status(400).json({ error: 'Sesión inválida o expirada.' });
  }
};

// ============================================================
// ENDPOINTS OPERATIVOS API
// ============================================================

// 1. INICIO DE SESIÓN (Devuelve los parámetros guardados de este usuario)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(400).json({ error: 'Usuario no registrado en el sistema.' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Contraseña incorrecta.' });

    user.activeIp = clientIp;
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    
    // Entregamos el token y sus finanzas personales guardadas
    res.json({ 
      token, 
      role: user.role, 
      username: user.username,
      bankroll: user.bankroll,
      kellyFraction: user.kellyFraction,
      maxExposure: user.maxExposure
    });
  } catch (err) {
    res.status(500).json({ error: 'Error en la verificación de seguridad.' });
  }
});

// 2. CREACIÓN EXTERNA DE USUARIOS (EXCLUSIVO CREADOR / ADMIN)
app.post('/api/admin/create-user', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Denegado. Rango Administrador requerido.' });

  const { newUsername, newPassword, newRole } = req.body;

  try {
    const userExists = await User.findOne({ username: newUsername.toLowerCase() });
    if (userExists) return res.status(400).json({ error: 'El identificador de operador ya existe.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const newUser = new User({
      username: newUsername.toLowerCase(),
      password: hashedPassword,
      role: newRole || 'operador'
    });

    await newUser.save();
    res.json({ success: `Operador @${newUsername.toUpperCase()} inyectado en la colmena con éxito.` });
  } catch (err) {
    res.status(500).json({ error: 'Fallo al procesar el alta en la base de datos.' });
  }
});

// 3. ACTUALIZAR SÓLO LAS LLAVES DE GOOGLE (EXCLUSIVO ADMIN — Las finanzas se removieron de aquí)
app.post('/api/admin/config', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Restringido. Solo el creador puede alterar los canales.' });

  const { apiKeysPool } = req.body;

  try {
    let config = await Config.findOne({ key: 'system_config' });
    if (!config) config = new Config({ key: 'system_config' });

    if (apiKeysPool) config.apiKeysPool = apiKeysPool;

    await config.save();
    res.json({ success: 'Pool central de API Keys actualizado en la nube con éxito.' });
  } catch (err) {
    res.status(500).json({ error: 'Fallo al resguardar la configuración cloud.' });
  }
});

// 4. ACTUALIZAR PARÁMETROS INDIVIDUALES (Accesible por CUALQUIER usuario para sus propias finanzas)
app.post('/api/user/update-profile', authMiddleware, async (req, res) => {
  const { bankroll, kellyFraction, maxExposure } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no registrado.' });

    if (bankroll !== undefined) user.bankroll = bankroll;
    if (kellyFraction !== undefined) user.kellyFraction = kellyFraction;
    if (maxExposure !== undefined) user.maxExposure = maxExposure;

    await user.save();
    res.json({ 
      success: 'Ajustes de riesgo sincronizados.', 
      bankroll: user.bankroll, 
      kellyFraction: user.kellyFraction, 
      maxExposure: user.maxExposure 
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar finanzas personales en la nube.' });
  }
});

// 5. PROXY DE RADAR PROTEGIDO
app.post('/api/scan', authMiddleware, async (req, res) => {
  const { prompt } = req.body;
  try {
    const config = await Config.findOne({ key: 'system_config' });
    const keys = config ? config.apiKeysPool.split(',').map(k => k.trim()) : ['AIzaSyBdvGSeawJOS6yRzAiNCA7Vn_qexeeUP60'];
    const targetKey = keys[Math.floor(Math.random() * keys.length)]; 
    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${targetKey}`;

    const googleResponse = await fetch(googleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      }),
    });

    const googleData = await googleResponse.json();
    res.json(googleData);
  } catch (err) {
    res.status(500).json({ error: 'Fallo crítico en el túnel de escaneo del servidor.' });
  }
});

// 6. CIERRE DE SESIÓN SEGURO
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { activeIp: null });
    res.json({ success: 'Sesión e IP liberadas correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al desconectar terminal.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`⚡ Servidor STRATOS operando en Puerto ${PORT}`));

// INYECTOR MAESTRO AUTOMÁTICO
async function crearPrimerAdmin() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("stratos123", salt);
      await User.create({
        username: "admin",
        password: hashedPassword,
        role: "admin",
        bankroll: 100.00,
        kellyFraction: 0.25,
        maxExposure: 0.15
      });
      console.log("👤 Base de datos limpia detectada e inyectada.");
    }
  } catch (err) {
    console.error("Error en la siembra de base de datos:", err);
  }
}
mongoose.connection.once('open', crearPrimerAdmin);