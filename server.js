// server.js — BACKEND SEGURO STRATOS v15.2 (CONEXIÓN CLÁSICA BLINDADA)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

// Token secreto para firmar las sesiones de usuario
const JWT_SECRET = "STRATOS_QUANT_MEGA_SECRET_2026"; 

// CONEXIÓN GLOBAL SHARDED (Formato Clásico inmune a bloqueos de Router)
const MONGO_URI = "mongodb://iwazoski:Rosa08%24@ac-0wch6k0-shard-00-00.thpkjnz.mongodb.net:27017,ac-0wch6k0-shard-00-01.thpkjnz.mongodb.net:27017,ac-0wch6k0-shard-00-02.thpkjnz.mongodb.net:27017/?ssl=true&replicaSet=atlas-12uyoa-shard-0&authSource=admin&appName=Stratos";

mongoose.connect(MONGO_URI)
  .then(() => console.log('🔴 Base de Datos Colmena Conectada con Éxito (Canal Clásico)'))
  .catch(err => console.error('Error de conexión en MongoDB:', err));

// ============================================================
// MODELOS DE DATOS (ESQUEMAS)
// ============================================================
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operador'], default: 'operador' },
  activeIp: { type: String, default: null } 
});

const ConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'system_config' },
  apiKeysPool: { type: String, default: 'AIzaSyBdvGSeawJOS6yRzAiNCA7Vn_qexeeUP60' },
  bankroll: { type: Number, default: 100.00 },
  kellyFraction: { type: Number, default: 0.25 },
  maxExposure: { type: Number, default: 0.15 }
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

    // CORTAFUEGOS DE IP: Si la IP cambia durante la sesión activa, bloquea el acceso
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

// 1. INICIO DE SESIÓN CON ENLACE DE DIRECCIÓN IP ESTRICTO
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(400).json({ error: 'Usuario no registrado en el sistema.' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Contraseña incorrecta.' });

    // Fijamos la IP del dispositivo en la base de datos para esta sesión activa
    user.activeIp = clientIp;
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, role: user.role, username: user.username });
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

// 3. ACTUALIZAR PARÁMETROS GLOBALES Y API KEYS EN LA NUBE (EXCLUSIVO ADMIN)
app.post('/api/admin/config', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Restringido. Solo el creador puede reconfigurar los canales.' });

  const { apiKeysPool, bankroll, kellyFraction, maxExposure } = req.body;

  try {
    let config = await Config.findOne({ key: 'system_config' });
    if (!config) config = new Config({ key: 'system_config' });

    if (apiKeysPool) config.apiKeysPool = apiKeysPool;
    if (bankroll) config.bankroll = bankroll;
    if (kellyFraction) config.kellyFraction = kellyFraction;
    if (maxExposure) config.maxExposure = maxExposure;

    await config.save();
    res.json({ success: 'Configuración de red y llaves actualizada globalmente.' });
  } catch (err) {
    res.status(500).json({ error: 'Fallo al resguardar la configuración cloud.' });
  }
});

// 4. PROXY DE RADAR PROTEGIDO (Oculta las llaves y realiza las búsquedas)
app.post('/api/scan', authMiddleware, async (req, res) => {
  const { prompt } = req.body;

  try {
    const config = await Config.findOne({ key: 'system_config' });
    const keys = config ? config.apiKeysPool.split(',').map(k => k.trim()) : ['AIzaSyBdvGSeawJOS6yRzAiNCA7Vn_qexeeUP60'];
    
    // Rotación balanceada aleatoria entre el pool de llaves en la nube
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

// 5. CIERRE DE SESIÓN SEGURO (LIBERACIÓN DE IP)
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { activeIp: null });
    res.json({ success: 'Sesión e IP liberadas correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al desconectar terminal.' });
  }
});

// ESCUCHA OPERATIVA DEL PUERTO CENTRAL
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`⚡ Servidor STRATOS operando en Puerto ${PORT}`));

// ============================================================
// INYECTOR MAESTRO AUTOMÁTICO (SEMILLA DE ACCESO BASE)
// ============================================================
async function crearPrimerAdmin() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("stratos123", salt);
      
      await User.create({
        username: "admin",
        password: hashedPassword,
        role: "admin"
      });
      console.log("👤 Base de datos limpia detectada.");
      console.log("👤 Primer Administrador inyectado: admin / stratos123");
    }
  } catch (err) {
    console.error("Error en la siembra de base de datos:", err);
  }
}

// Ejecutar inyección cuando la base de datos abra el canal de escucha
mongoose.connection.once('open', crearPrimerAdmin);