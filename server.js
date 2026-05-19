// server.js — BACKEND ESTRATOS v16.1: PARLAMENTO CON CORS BLINDADO
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Configuración de CORS blindada para tu dominio en Vercel
app.use(cors({
  origin: [
    "https://stratos-oficial-2026.vercel.app", 
    "https://stratos-oficial-2026.vercel.app/"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "STRATOS_QUANT_MEGA_SECRET_2026"; 
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://iwazoski:Rosa08%24@stratos.thpkjnz.mongodb.net/stratos?retryWrites=true&w=majority&appName=Stratos";

mongoose.connect(MONGO_URI)
  .then(() => console.log('🔴 Base de Datos Colmena Conectada (Canal Cloud)'))
  .catch(err => console.error('Error de conexión en MongoDB:', err));

// Esquemas
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operador'], default: 'operador' },
  activeIp: { type: String, default: null },
  bankroll: { type: Number, default: 100.00 },
  activePicks: { type: Array, default: [] },
  history: { type: Array, default: [] },
  stats: { type: Object, default: { total: 0, ganadas: 0, perdidas: 0, profit: 0 } }
});

const User = mongoose.model('User', UserSchema);

const authMiddleware = async (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Acceso denegado.' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) { res.status(400).json({ error: 'Token inválido.' }); }
};

// --- API PARLAMENTO ESTRATÉGICO ---
app.post('/api/scan', authMiddleware, async (req, res) => {
    try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: req.body.prompt }] }], tools: [{ google_search: {} }] })
        });
        const geminiData = await geminiRes.json();
        const rawData = geminiData.candidates[0].content.parts[0].text;

        const [groqRes, cohereRes, mistralRes] = await Promise.all([
            fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.GROQ_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: "llama3-70b-8192", messages: [{ role: "user", content: `Analiza este JSON y recalcula staks: ${rawData}` }] })
            }),
            fetch('https://api.cohere.ai/v1/chat', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.COHERE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Audita este riesgo: ${rawData}` })
            }),
            fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.MISTRAL_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: "mistral-large-latest", messages: [{ role: "user", content: `Veredicto final: ${rawData}` }] })
            })
        ]);

        const mistralData = await mistralRes.json();
        res.json({ status: "Parlamento completado", data: mistralData.choices[0].message.content });
    } catch (err) { res.status(500).json({ error: 'Fallo en el parlamento.' }); }
});

// --- AUTENTICACIÓN ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user });
});

app.post('/api/user/update-profile', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id);
    Object.assign(user, req.body);
    await user.save();
    res.json({ success: 'Estado guardado.' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚡ Parlamento STRATOS operando en Puerto ${PORT}`));