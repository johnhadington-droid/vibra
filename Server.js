require("dotenv").config();
const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { sendPayout } = require("./services/FaucetPay");

const app = express();
const httpsKeyPath = process.env.HTTPS_KEY_PATH || path.join(__dirname, "certs", "localhost-key.pem");
const httpsCertPath = process.env.HTTPS_CERT_PATH || path.join(__dirname, "certs", "localhost.pem");
const useHttps = fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath);
const server = useHttps
    ? https.createServer({ key: fs.readFileSync(httpsKeyPath), cert: fs.readFileSync(httpsCertPath) }, app)
    : http.createServer(app);
const io = new Server(server);
const connectionSessions = new Map();

const PORT = Number(process.env.PORT) || 3000;
const PROFILE_EDIT_FEE = 2;
const broadcastGifts = [
    { id: "rose", name: "Rosa", icon: "🌹", price: 5 },
    { id: "spark", name: "Destello", icon: "✨", price: 10 },
    { id: "crown", name: "Corona", icon: "👑", price: 25 },
    { id: "heart", name: "Corazón", icon: "💖", price: 15 },
    { id: "coffee", name: "Café", icon: "☕", price: 8 },
    { id: "fire", name: "Fuego", icon: "🔥", price: 30 },
    { id: "diamond", name: "Diamante", icon: "💎", price: 50 },
    { id: "galaxy", name: "Galaxia", icon: "🌌", price: 100 }
];
const CONNECTION_BADGES = [
    { id: "connected-1h", label: "1 HORA", requiredMs: 60 * 60 * 1000 },
    { id: "connected-2h", label: "2 HORAS", requiredMs: 2 * 60 * 60 * 1000 },
    { id: "connected-3h", label: "3 HORAS", requiredMs: 3 * 60 * 60 * 1000 }
];

// ==============================
// CONFIGURACIÓN
// ==============================

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ==============================
// DATOS TEMPORALES
// ==============================

let streams = [];
const dataDirectory = path.join(__dirname, "data");
const usersFile = path.join(dataDirectory, "users.json");
const storeItems = [
    { id: "frame-gold", type: "frame", value: "gold", name: "Marco Dorado", description: "Un marco elegante para tu foto.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=85" },
    { id: "frame-live", type: "frame", value: "live", name: "Marco Live", description: "Destaca cuando estás transmitiendo.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=500&q=85" },
    { id: "frame-ruby", type: "frame", value: "ruby", name: "Marco Rubí", description: "Un borde intenso para destacar tu perfil.", price: 12, currency: "USD", image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=500&q=85" },
    { id: "frame-mint", type: "frame", value: "mint", name: "Marco Menta", description: "Un acabado fresco y luminoso.", price: 12, currency: "USD", image: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=500&q=85" },
    { id: "frame-neon", type: "frame", value: "neon", name: "Marco Neón", description: "Una línea brillante para tu identidad.", price: 15, currency: "USD", image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=500&q=85" },
    { id: "theme-night", type: "theme", value: "night", name: "Tema Noche", description: "Una apariencia profunda para tu perfil.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=700&q=85" },
    { id: "theme-rose", type: "theme", value: "rose", name: "Tema Rosa", description: "Un estilo cálido y diferente.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=700&q=85" },
    { id: "badge-rising", type: "badge", value: "rising", name: "Badge En Ascenso", description: "Para broadcasters que están creciendo.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=500&q=85" },
    { id: "badge-star", type: "badge", value: "star", name: "Badge Estrella", description: "Un distintivo premium para tu perfil.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=500&q=85" },
    { id: "entry-spark", type: "entry-effect", value: "spark", name: "Entrada Spark", description: "Destellos dorados cuando entras al chat room.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=700&q=85" },
    { id: "entry-neon", type: "entry-effect", value: "neon", name: "Entrada Neon", description: "Una entrada brillante para llamar la atención.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=700&q=85" },
    { id: "emblem-crown", type: "emblem", value: "crown", name: "Emblema Crown", description: "Corona junto a tu nombre en el chat room.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1577083288073-40892c0860a4?auto=format&fit=crop&w=500&q=85" },
    { id: "emblem-vip", type: "emblem", value: "vip", name: "Emblema VIP", description: "Identidad VIP junto a tus mensajes.", price: 10, currency: "USD", image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=500&q=85" },
    { id: "coins-899", type: "coin-pack", value: "899", coins: 899, name: "Paquete de monedas", description: "899 monedas para enviar a tus broadcasters favoritos.", price: 15, currency: "USD", image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=700&q=85" }
];

function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch (error) {
        fs.mkdirSync(dataDirectory, { recursive: true });
        fs.writeFileSync(usersFile, "[]", "utf8");
        return [];
    }
}

function saveUsers(users) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const temporaryFile = `${usersFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(users, null, 2), "utf8");
    fs.renameSync(temporaryFile, usersFile);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derivedKey}`;
}

function passwordMatches(password, storedHash) {
    const [salt, storedKey] = String(storedHash).split(":");
    if (!salt || !storedKey) return false;

    const derivedKey = crypto.scryptSync(password, salt, 64);
    const expectedKey = Buffer.from(storedKey, "hex");
    return derivedKey.length === expectedKey.length && crypto.timingSafeEqual(derivedKey, expectedKey);
}

function encryptBankData(data) {
    if (!process.env.BANK_DATA_KEY) {
        throw new Error("Falta BANK_DATA_KEY para proteger los datos bancarios.");
    }

    const key = Buffer.from(process.env.BANK_DATA_KEY, "hex");
    if (key.length !== 32) throw new Error("BANK_DATA_KEY debe tener 64 caracteres hexadecimales.");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

function userEmblems(user) {
    if (user.role === "superadmin") {
        return [
            { icon: "♛", label: "SUPER ADMIN" },
            { icon: "★", label: "ESTRELLA" },
            { icon: "♚", label: "VIP" }
        ];
    }

    const emblems = [];
    if (user.role === "moderator") emblems.push({ icon: "◆", label: "MOD" });
    if (user.cosmetics?.badge === "star" || user.ownedCosmetics?.includes("badge-star")) emblems.push({ icon: "★", label: "ESTRELLA" });
    if (user.cosmetics?.badge === "rising" || user.ownedCosmetics?.includes("badge-rising")) emblems.push({ icon: "↑", label: "ASCENSO" });
    if (user.ownedCosmetics?.includes("emblem-vip")) emblems.push({ icon: "♚", label: "VIP" });
    if (user.ownedCosmetics?.includes("emblem-crown")) emblems.push({ icon: "♛", label: "CROWN" });
    return emblems;
}

function publicUser(user) {
    const { passwordHash, resetToken, resetTokenExpiresAt, ...safeUser } = user;
    const isSuperAdmin = user.role === "superadmin";
    const followers = Array.isArray(user.followers) ? user.followers : [];
    const following = Array.isArray(user.following) ? user.following : [];
    return {
        ...safeUser,
        role: user.role || "user",
            emblems: userEmblems(user),
            isUniqueProfile: isSuperAdmin,
            hasAllCosmetics: isSuperAdmin,
            profileTitle: isSuperAdmin ? "SUPER ADMIN" : null,
            newUser: user.newUser === true,
            cosmetics: {
            frame: isSuperAdmin ? "neon" : user.cosmetics?.frame || "classic",
            theme: isSuperAdmin ? "night" : user.cosmetics?.theme || "ivory",
            badge: isSuperAdmin ? "star" : user.cosmetics?.badge || "newcomer"
        },
        ownedCosmetics: isSuperAdmin ? storeItems.map(item => item.id) : user.ownedCosmetics || []
        ,hasBankAccount: Boolean(user.bankDataEncrypted),
        followerCount: followers.length,
        followingCount: following.length,
        vibraCoins: user.wallet?.coins || 0,
        connectionBadges: (isSuperAdmin ? CONNECTION_BADGES.map(badge => badge.id) : user.connectionBadges || []).map(badgeId => CONNECTION_BADGES.find(item => item.id === badgeId)).filter(Boolean),
        totalConnectedMs: user.totalConnectedMs || 0
    };
}

function sessionUser(socket) {
    const session = connectionSessions.get(socket.id);
    return session ? users.find(item => item.id === session.userId) : null;
}

function canModerate(user, stream) {
    return Boolean(user && stream && (user.role === "superadmin" || user.role === "moderator" || user.id === stream.ownerId));
}

function isMuted(stream, userId) {
    const mutedUntil = stream.mutedUsers?.[userId] || 0;
    if (mutedUntil <= Date.now()) {
        if (stream.mutedUsers) delete stream.mutedUsers[userId];
        return false;
    }
    return true;
}

function updateConnectionBadges(socket, session) {
    const user = users.find(item => item.id === session.userId);
    if (!user) return;

    const connectedMs = (user.totalConnectedMs || 0) + (Date.now() - session.startedAt);
    user.connectionBadges = user.connectionBadges || [];
    const earnedBadges = CONNECTION_BADGES.filter(badge => connectedMs >= badge.requiredMs);
    const newBadge = earnedBadges.find(badge => !user.connectionBadges.includes(badge.id));
    if (!newBadge) return;

    user.connectionBadges = earnedBadges.map(badge => badge.id);
    saveUsers(users);
    socket.emit("connection-badges-updated", publicUser(user));
}

setInterval(() => {
    connectionSessions.forEach((session, socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) updateConnectionBadges(socket, session);
    });
}, 60 * 1000);

function profileFields(user) {
    return {
        displayName: user.displayName || user.username,
        bio: user.bio || "",
        location: user.location || "",
        avatarUrl: user.avatarUrl || ""
    };
}

let users = loadUsers();


// ==============================
// SOCKET.IO
// ==============================

io.on("connection", (socket) => {

    console.log(
        "Usuario conectado:",
        socket.id
    );

    socket.emit("streams-updated", streams.map(({ messages, ...publicStream }) => publicStream));

    socket.on("identify-user", (userId) => {
        const user = users.find(item => item.id === String(userId || ""));
        if (!user) return;
        connectionSessions.set(socket.id, { userId: user.id, startedAt: Date.now() });
        socket.emit("connection-badges-updated", publicUser(user));
    });


    // Entrar a una transmisión

    socket.on("join-stream", (streamId) => {

        if (!streamId) return;

        const stream = streams.find(item => item.id === streamId);
        const user = sessionUser(socket);
        if (!stream || stream.bannedUserIds?.includes(user?.id)) {
            socket.emit("moderation-denied", { message: "No puedes entrar en esta sala." });
            return;
        }

        socket.join(streamId);

        console.log(
            `${socket.id} entró al directo ${streamId}`
        );

    });

    socket.on("viewer-ready", ({ streamId } = {}) => {
        if (!streamId || !streams.some(stream => stream.id === streamId)) return;
        socket.to(streamId).emit("viewer-ready", { streamId, viewerId: socket.id });
    });

    socket.on("webrtc-offer", ({ targetSocketId, streamId, offer } = {}) => {
        if (!targetSocketId || !streamId || !offer) return;
        io.to(targetSocketId).emit("webrtc-offer", { streamId, broadcasterId: socket.id, offer });
    });

    socket.on("webrtc-answer", ({ targetSocketId, streamId, answer } = {}) => {
        if (!targetSocketId || !streamId || !answer) return;
        io.to(targetSocketId).emit("webrtc-answer", { streamId, viewerId: socket.id, answer });
    });

    socket.on("webrtc-ice-candidate", ({ targetSocketId, streamId, candidate } = {}) => {
        if (!targetSocketId || !streamId || !candidate) return;
        io.to(targetSocketId).emit("webrtc-ice-candidate", { streamId, fromSocketId: socket.id, candidate });
    });


    // Chat

    socket.on("chat-message", (data) => {

        if (
            !data ||
            !data.streamId ||
            !data.username ||
            !data.message
        ) {
            return;
        }


        const username =
            String(data.username)
                .substring(0, 30);

        const message =
            String(data.message)
                .substring(0, 300);

        const user = users.find(item => item.id === String(data.userId || "") || item.username === username);
        const stream = streams.find(item => item.id === String(data.streamId));
        if (!stream || !user || sessionUser(socket)?.id !== user.id || isMuted(stream, user.id)) return;

        const chatUser = user ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName || user.username,
            level: user.level || "Bronce",
            status: user.status || "Activo",
            location: user.location || "",
            bio: user.bio || "",
            avatarUrl: user.avatarUrl || "",
            emblems: userEmblems(user),
            connectionBadges: (user.connectionBadges || []).map(badgeId => CONNECTION_BADGES.find(item => item.id === badgeId)).filter(Boolean)
        } : null;


        io.to(data.streamId).emit(
            "chat-message",
            {
                messageId: crypto.randomUUID(),
                username,
                message,
                role: user?.role || "user",
                newUser: user?.newUser === true,
                chatUser
            }
        );

    });

    socket.on("moderation-delete-message", ({ streamId, messageId } = {}) => {
        const stream = streams.find(item => item.id === streamId);
        if (!messageId || !canModerate(sessionUser(socket), stream)) return;
        io.to(streamId).emit("chat-message-removed", { messageId });
    });

    socket.on("moderation-timeout", ({ streamId, targetUserId, durationMs = 10 * 60 * 1000 } = {}) => {
        const stream = streams.find(item => item.id === streamId);
        const moderator = sessionUser(socket);
        if (!targetUserId || !canModerate(moderator, stream) || moderator.id === targetUserId) return;
        stream.mutedUsers = stream.mutedUsers || {};
        stream.mutedUsers[targetUserId] = Date.now() + Math.min(Math.max(Number(durationMs) || 0, 10 * 1000), 60 * 60 * 1000);
        io.to(streamId).emit("user-muted", { userId: targetUserId });
    });


    // Likes

    socket.on("like", (streamId) => {

        if (!streamId) return;

        io.to(streamId).emit(
            "like"
        );

    });


    // Desconexión

    socket.on("disconnect", () => {

        const session = connectionSessions.get(socket.id);
        if (session) {
            const user = users.find(item => item.id === session.userId);
            if (user) {
                user.totalConnectedMs = (user.totalConnectedMs || 0) + (Date.now() - session.startedAt);
                saveUsers(users);
            }
            connectionSessions.delete(socket.id);
        }

        console.log(
            "Usuario desconectado:",
            socket.id
        );

    });

});

// ==============================
// API - OBTENER DIRECTOS
// ==============================

app.get("/api/streams", (req, res) => {

    res.json(streams.map(({ messages, ...stream }) => stream));

});


// ==============================
// API - PAGOS FAUCEPAY BTC / LTC
// ==============================

app.post("/api/payouts/faucetpay", async (req, res) => {

    if (!process.env.FAUCETPAY_ADMIN_SECRET || req.get("x-admin-secret") !== process.env.FAUCETPAY_ADMIN_SECRET) {
        return res.status(401).json({ error: "Solicitud de pago no autorizada." });
    }

    const account = String(req.body.account || "").trim();
    const currency = String(req.body.currency || "").trim().toUpperCase();
    const amount = Number(req.body.amount);

    if (!account || !["BTC", "LTC"].includes(currency) || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Indica una cuenta FaucetPay, una moneda BTC/LTC y un monto válido." });
    }

    try {
        const result = await sendPayout({
            account,
            amount,
            currency,
            ipAddress: req.ip
        });
        res.json({ success: true, currency, amount, faucetPay: result });
    } catch (error) {
        console.error("FaucetPay payout error:", error.message);
        res.status(502).json({ error: error.message });
    }
});


// ==============================
// API - CREAR CUENTA
// ==============================

app.post("/api/users", (req, res) => {

    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (username.length < 3 || !email || password.length < 6) {
        return res.status(400).json({
            error: "Completa un nombre de al menos 3 caracteres, un correo válido y una contraseña de 6 caracteres."
        });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: "Escribe un correo válido." });
    }

    if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({ error: "Ese nombre de usuario ya está registrado." });
    }

    if (users.some(user => user.email === email)) {
        return res.status(409).json({ error: "Ese correo ya está registrado." });
    }

    const user = {
        id: crypto.randomUUID(),
        username: username.substring(0, 30),
        displayName: username.substring(0, 30),
        role: "user",
        followers: [],
        following: [],
        newUser: true,
        connectionBadges: [],
        totalConnectedMs: 0,
        bio: "",
        location: "",
        avatarUrl: "",
        cosmetics: {
            frame: "classic",
            theme: "ivory",
            badge: "newcomer"
        },
        ownedCosmetics: [],
        email,
        passwordHash: hashPassword(password),
        wallet: {
            balance: 100,
            currency: "VIBRA",
            coins: 0
        },
        level: "Bronce",
        status: "Activo",
        createdAt: new Date().toISOString()
    };

    users.push(user);
    saveUsers(users);

    res.status(201).json(publicUser(user));
});

app.post("/api/users/:id/follow", (req, res) => {
    const target = users.find(item => item.id === req.params.id);
    const follower = users.find(item => item.id === String(req.body.followerId || ""));
    if (!target || !follower) return res.status(404).json({ error: "Usuario no encontrado." });
    if (target.id === follower.id) return res.status(400).json({ error: "No puedes seguirte a ti mismo." });

    target.followers = Array.isArray(target.followers) ? target.followers : [];
    follower.following = Array.isArray(follower.following) ? follower.following : [];
    if (!target.followers.includes(follower.id)) target.followers.push(follower.id);
    if (!follower.following.includes(target.id)) follower.following.push(target.id);
    saveUsers(users);
    res.json({ user: publicUser(follower), profile: publicUser(target) });
});

app.delete("/api/users/:id/follow", (req, res) => {
    const target = users.find(item => item.id === req.params.id);
    const follower = users.find(item => item.id === String(req.body.followerId || ""));
    if (!target || !follower) return res.status(404).json({ error: "Usuario no encontrado." });

    target.followers = (target.followers || []).filter(id => id !== follower.id);
    follower.following = (follower.following || []).filter(id => id !== target.id);
    saveUsers(users);
    res.json({ user: publicUser(follower), profile: publicUser(target) });
});


// ==============================
// API - ACTUALIZAR PERFIL
// ==============================

app.put("/api/users/:id", (req, res) => {

    const user = users.find(item => item.id === req.params.id);

    if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const displayName = String(req.body.displayName || "").trim();
    const bio = String(req.body.bio || "").trim();
    const location = String(req.body.location || "").trim();
    const avatarUrl = String(req.body.avatarUrl || "").trim();
    const frame = String(req.body.frame || "classic");
    const theme = String(req.body.theme || "ivory");
    const badge = String(req.body.badge || "newcomer");
    const bankName = String(req.body.bankName || "").trim();
    const accountHolder = String(req.body.accountHolder || "").trim();
    const clabe = String(req.body.clabe || "").replace(/\s/g, "");

    if (displayName.length < 2 || displayName.length > 40) {
        return res.status(400).json({ error: "El nombre visible debe tener entre 2 y 40 caracteres." });
    }

    if (bio.length > 180 || location.length > 60) {
        return res.status(400).json({ error: "La biografía o ubicación supera el límite permitido." });
    }

    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        return res.status(400).json({ error: "La foto debe ser una URL que empiece por http o https." });
    }

    if (!["classic", "gold", "live", "ruby", "mint", "neon"].includes(frame) || !["ivory", "night", "rose"].includes(theme) || !["newcomer", "rising", "star"].includes(badge)) {
        return res.status(400).json({ error: "Ese cosmético no está disponible." });
    }

    const ownedCosmetics = user.ownedCosmetics || [];
    const requestedCosmetics = [
        frame === "classic" ? null : `frame-${frame}`,
        theme === "ivory" ? null : `theme-${theme}`,
        badge === "newcomer" ? null : `badge-${badge}`
    ].filter(Boolean);
    if (user.role !== "superadmin" && requestedCosmetics.some(itemId => !ownedCosmetics.includes(itemId))) {
        return res.status(403).json({ error: "Compra ese cosmético en la tienda antes de equiparlo." });
    }

    if (clabe) {
        if (!/^\d{18}$/.test(clabe) || !bankName || !accountHolder) {
            return res.status(400).json({ error: "Para SPEI indica banco, titular y una CLABE válida de 18 dígitos." });
        }
        try {
            user.bankDataEncrypted = encryptBankData({ bankName, accountHolder, clabe });
        } catch (error) {
            return res.status(503).json({ error: "Configura BANK_DATA_KEY en el servidor antes de guardar datos bancarios." });
        }
    }

    if (!user.wallet || user.wallet.balance < PROFILE_EDIT_FEE) {
        return res.status(402).json({ error: `Necesitas ${PROFILE_EDIT_FEE} VIBRA para personalizar tu perfil.` });
    }

    user.wallet.balance -= PROFILE_EDIT_FEE;
    Object.assign(user, { displayName, bio, location, avatarUrl, cosmetics: { frame, theme, badge } });
    saveUsers(users);
    res.json(publicUser(user));
});


// ==============================
// API - TIENDA DE COSMETICOS
// ==============================

app.get("/api/store", (req, res) => {
    res.json(storeItems);
});

app.post("/api/users/:id/purchases", (req, res) => {

    const user = users.find(item => item.id === req.params.id);
    const item = storeItems.find(storeItem => storeItem.id === req.body.itemId);

    if (!user || !item) {
        return res.status(404).json({ error: "Artículo no encontrado." });
    }

    if (item.type === "coin-pack") {
        return res.status(402).json({ error: "El paquete de monedas requiere checkout de Mercado Pago." });
    }

    user.ownedCosmetics = user.ownedCosmetics || [];
    if (user.ownedCosmetics.includes(item.id)) {
        return res.status(409).json({ error: "Ya tienes este cosmético." });
    }

    if ((user.wallet?.balance || 0) < item.price) {
        return res.status(400).json({ error: `Necesitas ${item.price} VIBRA para comprarlo.` });
    }

    user.wallet.balance -= item.price;
    user.ownedCosmetics.push(item.id);
    saveUsers(users);
    res.json({ user: publicUser(user), item, message: `${item.name} añadido a tu inventario.` });
});


// ==============================
// API - INICIAR SESION
// ==============================

app.post("/api/auth/login", (req, res) => {

    const identifier = String(req.body.identifier || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = users.find(item =>
        item.email.toLowerCase() === identifier ||
        item.username.toLowerCase() === identifier
    );

    if (!user || !passwordMatches(password, user.passwordHash)) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    res.json(publicUser(user));
});


// ==============================
// API - SOLICITAR RECUPERACION
// ==============================

app.post("/api/auth/forgot-password", (req, res) => {

    const email = String(req.body.email || "").trim().toLowerCase();
    const user = users.find(item => item.email === email);

    if (!user) {
        return res.json({
            message: "Si el correo existe, recibirás instrucciones para recuperar tu cuenta."
        });
    }

    user.resetToken = crypto.randomBytes(24).toString("hex");
    user.resetTokenExpiresAt = Date.now() + 15 * 60 * 1000;
    saveUsers(users);

    res.json({
        message: "Se generó un código temporal de recuperación.",
        developmentToken: user.resetToken
    });
});


// ==============================
// API - CAMBIAR CONTRASEÑA
// ==============================

app.post("/api/auth/reset-password", (req, res) => {

    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    const user = users.find(item =>
        item.resetToken === token &&
        item.resetTokenExpiresAt > Date.now()
    );

    if (!user) {
        return res.status(400).json({ error: "Código inválido o vencido." });
    }

    user.passwordHash = hashPassword(password);
    delete user.resetToken;
    delete user.resetTokenExpiresAt;
    saveUsers(users);

    res.json({ message: "Contraseña actualizada correctamente." });
});


// ==============================
// API - CREAR DIRECTO
// ==============================

app.post("/api/streams", (req, res) => {

    const {
        title,
        userId
    } = req.body;


    const user = users.find(item => item.id === String(userId || "").trim());
    const streamUsername = user?.username;

    if (!title || !user) {

        return res.status(400).json({

            error: "Necesitas una cuenta real para iniciar un directo."

        });

    }


    const stream = {

        id: Date.now().toString(),

        title:
            String(title)
                .substring(0, 100),

        username:
            String(streamUsername)
                .substring(0, 30),

        ownerId: user.id,

        viewers: 0,

        createdAt:
            new Date().toISOString()

    };


    streams.push(stream);

    io.emit("streams-updated", streams.map(({ messages, ...publicStream }) => publicStream));


    console.log(
        "Nuevo directo:",
        stream
    );


    const { messages, ...publicStream } = stream;
    res.json(publicStream);

});

app.get("/api/gifts", (req, res) => {
    res.json(broadcastGifts);
});

app.post("/api/streams/:id/gifts", (req, res) => {
    const stream = streams.find(item => item.id === req.params.id);
    const sender = users.find(item => item.id === String(req.body.userId || "").trim());
    const gift = broadcastGifts.find(item => item.id === req.body.giftId);
    const broadcaster = stream ? users.find(item => item.id === stream.ownerId) : null;

    if (!stream || !sender || !gift || !broadcaster) {
        return res.status(404).json({ error: "No se encontró la sala o el regalo." });
    }

    if (sender.id === broadcaster.id) {
        return res.status(400).json({ error: "No puedes enviarte regalos a ti mismo." });
    }

    if ((sender.wallet?.balance || 0) < gift.price) {
        return res.status(402).json({ error: `Necesitas ${gift.price} VIBRA para enviar este regalo.` });
    }

    sender.wallet.balance -= gift.price;
    broadcaster.wallet = broadcaster.wallet || { balance: 0, currency: "VIBRA", coins: 0 };
    broadcaster.wallet.balance += gift.price;
    saveUsers(users);

    io.to(stream.id).emit("gift-sent", {
        gift,
        sender: sender.username,
        broadcaster: broadcaster.username
    });

    res.json({ user: publicUser(sender), gift, message: `${gift.icon} Enviaste ${gift.name} a ${broadcaster.username}.` });
});


// ==============================
// API - ELIMINAR DIRECTO
// ==============================

app.delete(
    "/api/streams/:id",
    (req, res) => {

        const id =
            req.params.id;


        streams =
            streams.filter(
                stream =>
                    stream.id !== id
            );

        io.emit("streams-updated", streams.map(({ messages, ...publicStream }) => publicStream));


        res.json({

            success: true

        });

    }
);


// ==============================
// RUTA PRINCIPAL
// ==============================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});


// ==============================
// INICIAR SERVIDOR
// ==============================

server.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            "      VIBRALIVE INICIADO"
        );
        console.log(
            "================================"
        );
        console.log("");
        console.log(
            `Servidor: ${useHttps ? "https" : "http"}://localhost:${PORT}`
        );
        console.log("");
        console.log(
            "Servidor listo para recibir usuarios."
        );
        console.log("");

    }
);
