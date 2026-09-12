const socket = io();

let currentUser = JSON.parse(localStorage.getItem("vibraUser") || "null");

const accountModal = document.getElementById("accountModal");
const profileModal = document.getElementById("profileModal");
const accountForm = document.getElementById("accountForm");
const accountFeedback = document.getElementById("accountFeedback");
const loginModal = document.getElementById("loginModal");
const forgotModal = document.getElementById("forgotModal");
const resetModal = document.getElementById("resetModal");
const broadcastModal = document.getElementById("broadcastModal");
const watchModal = document.getElementById("watchModal");
const streamsContainer = document.getElementById("streams");
const welcomeModal = document.getElementById("welcomeModal");
const profileEditorModal = document.getElementById("profileEditorModal");
let currentStream = null;
let localMediaStream = null;
let pendingViewerIds = new Set();
const peerConnections = new Map();
const rtcConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function connectionBadgeClass(badge) {
    if (!badge) return "";
    return badge.id === "connected-3h" ? "badge-frame-three" : badge.id === "connected-2h" ? "badge-frame-two" : "badge-frame-one";
}

function emblemMarkup(emblems = []) {
    return emblems.map(emblem => `<span class="name-emblem" title="${escapeHTML(emblem.label)}">${escapeHTML(emblem.icon)}</span>`).join("");
}

function currentUserEmblems() {
    return currentUser?.emblems || (currentUser?.role === "superadmin" ? [
        { icon: "♛", label: "SUPER ADMIN" },
        { icon: "★", label: "ESTRELLA" },
        { icon: "♚", label: "VIP" }
    ] : []);
}

function identifyCurrentUser() {
    if (currentUser?.id) socket.emit("identify-user", currentUser.id);
}

function showFeedback(element, message, isError = true) {
    element.textContent = message;
    element.classList.toggle("error", isError);
}

function showAccountModal() {
    showFeedback(accountFeedback, "", false);
    accountForm.reset();
    accountModal.classList.add("active");
    document.getElementById("accountUsername").focus();
}

function closeModal(modal) {
    modal.classList.remove("active");
}

function setVideoStatus(message) {
    document.getElementById("videoStatus").textContent = message;
}

function stopVideoSession() {
    peerConnections.forEach(connection => connection.close());
    peerConnections.clear();
    pendingViewerIds.clear();
    if (localMediaStream) {
        localMediaStream.getTracks().forEach(track => track.stop());
        localMediaStream = null;
    }
    document.getElementById("localVideo").srcObject = null;
    document.getElementById("remoteVideo").srcObject = null;
}

function createPeerConnection(socketId, streamId, isViewer) {
    const connection = new RTCPeerConnection(rtcConfiguration);
    peerConnections.set(socketId, connection);
    connection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("webrtc-ice-candidate", {
                targetSocketId: socketId,
                streamId,
                candidate: event.candidate
            });
        }
    };
    if (isViewer) {
        connection.ontrack = event => {
            document.getElementById("remoteVideo").srcObject = event.streams[0];
            setVideoStatus("");
        };
    }
    return connection;
}

async function offerVideoToViewer(viewerId) {
    if (!localMediaStream || !currentStream) {
        pendingViewerIds.add(viewerId);
        return;
    }
    const connection = createPeerConnection(viewerId, currentStream.id, false);
    localMediaStream.getTracks().forEach(track => connection.addTrack(track, localMediaStream));
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    socket.emit("webrtc-offer", { targetSocketId: viewerId, streamId: currentStream.id, offer });
}

async function startBroadcasterVideo() {
    try {
        localMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById("localVideo").srcObject = localMediaStream;
        setVideoStatus("Tu cámara está en vivo");
        const waitingViewers = [...pendingViewerIds];
        pendingViewerIds.clear();
        await Promise.all(waitingViewers.map(offerVideoToViewer));
    } catch (error) {
        setVideoStatus("Permite la cámara y el micrófono para transmitir video");
    }
}

function prepareViewerVideo() {
    setVideoStatus("Esperando video del broadcaster...");
    socket.emit("viewer-ready", { streamId: currentStream.id });
}

function updateUserButton() {
    const loginButton = document.getElementById("loginButton");
    if (!currentUser) {
        loginButton.textContent = "Iniciar sesión";
        loginButton.classList.remove("admin-login-button");
        return;
    }

    if (currentUser.role === "superadmin" || currentUser.role === "moderator") {
        const roleLabel = currentUser.role === "superadmin" ? "♛ SUPER ADMIN" : "MOD";
        loginButton.innerHTML = `<span class="admin-button-label">${roleLabel}</span><span>${escapeHTML(currentUser.username)}</span>`;
        loginButton.classList.add("admin-login-button");
        loginButton.classList.remove("new-user-login-button");
        return;
    }

    loginButton.innerHTML = currentUser.newUser
        ? `<span class="new-user-label">NUEVO</span><span>${escapeHTML(currentUser.username)}</span>`
        : escapeHTML(currentUser.username);
    loginButton.classList.remove("admin-login-button");
    loginButton.classList.toggle("new-user-login-button", currentUser.newUser === true);
}

function showProfile() {
    if (!currentUser) {
        showAccountModal();
        return;
    }

    const profileAvatar = document.getElementById("profileAvatar");
    profileAvatar.textContent = currentUser.avatarUrl ? "" : currentUser.username.charAt(0).toUpperCase();
    profileAvatar.style.backgroundImage = currentUser.avatarUrl ? `url("${escapeHTML(currentUser.avatarUrl)}")` : "";
    document.getElementById("profileDetails").innerHTML = `
        <strong>${escapeHTML(currentUser.displayName || currentUser.username)}</strong><br>
        @${escapeHTML(currentUser.username)}${currentUser.location ? `<br>${escapeHTML(currentUser.location)}` : ""}<br>
        ${escapeHTML(currentUser.bio || "Tu perfil aún no tiene biografía.")}<br>
        Wallet: ${currentUser.wallet.balance} ${escapeHTML(currentUser.wallet.currency)}<br>
        Nivel: ${escapeHTML(currentUser.level)}<br>
        Status: ${escapeHTML(currentUser.status)}
    `;
    profileModal.classList.add("active");
}

async function createAccount(event) {
    event.preventDefault();
    showFeedback(accountFeedback, "Creando cuenta...", false);

    const data = await request("/api/users", accountForm);

    if (data.error) {
        showFeedback(accountFeedback, data.error);
        return;
    }

    currentUser = data;
    localStorage.setItem("vibraUser", JSON.stringify(currentUser));
    localStorage.setItem("username", currentUser.username);
    updateUserButton();
    closeModal(accountModal);
    window.location.href = "/perfil.html";
}

function openProfileEditor() {
    document.getElementById("profileDisplayName").value = currentUser.displayName || currentUser.username;
    document.getElementById("profileAvatarUrl").value = currentUser.avatarUrl || "";
    document.getElementById("profileLocation").value = currentUser.location || "";
    document.getElementById("profileBio").value = currentUser.bio || "";
    document.getElementById("profileFeedback").textContent = "";
    profileEditorModal.classList.add("active");
}

async function updateProfile(event) {
    event.preventDefault();
    const feedback = document.getElementById("profileFeedback");
    showFeedback(feedback, "Guardando perfil...", false);

    try {
        const response = await fetch(`/api/users/${encodeURIComponent(currentUser.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(event.target)))
        });
        const data = await response.json();
        if (!response.ok) {
            showFeedback(feedback, data.error || "No se pudo guardar el perfil.");
            return;
        }

        currentUser = data;
        localStorage.setItem("vibraUser", JSON.stringify(currentUser));
        updateUserButton();
        closeModal(profileEditorModal);
        showProfile();
    } catch (error) {
        showFeedback(feedback, "No hay conexión con el servidor.");
    }
}

async function login(event) {
    event.preventDefault();
    const feedback = document.getElementById("loginFeedback");
    showFeedback(feedback, "Iniciando sesión...", false);
    const data = await request("/api/auth/login", document.getElementById("loginForm"));

    if (data.error) {
        showFeedback(feedback, data.error);
        return;
    }

    currentUser = data;
    localStorage.setItem("vibraUser", JSON.stringify(currentUser));
    localStorage.setItem("username", currentUser.username);
    updateUserButton();
    closeModal(loginModal);
    document.getElementById("loginForm").reset();
}

async function requestPasswordReset(event) {
    event.preventDefault();
    const feedback = document.getElementById("forgotFeedback");
    showFeedback(feedback, "Generando código...", false);
    const data = await request("/api/auth/forgot-password", document.getElementById("forgotForm"));

    if (data.error) {
        showFeedback(feedback, data.error);
        return;
    }

    showFeedback(feedback, data.developmentToken
        ? `Código temporal: ${data.developmentToken}`
        : data.message, false);
    if (data.developmentToken) {
        document.getElementById("resetToken").value = data.developmentToken;
        setTimeout(() => {
            closeModal(forgotModal);
            resetModal.classList.add("active");
        }, 700);
    }
}

async function resetPassword(event) {
    event.preventDefault();
    const feedback = document.getElementById("resetFeedback");
    showFeedback(feedback, "Actualizando contraseña...", false);
    const data = await request("/api/auth/reset-password", document.getElementById("resetForm"));

    if (data.error) {
        showFeedback(feedback, data.error);
        return;
    }

    showFeedback(feedback, data.message, false);
    document.getElementById("resetForm").reset();
    setTimeout(() => {
        closeModal(resetModal);
        loginModal.classList.add("active");
    }, 900);
}

async function request(url, form) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const data = await response.json();
        return response.ok ? data : { error: data.error || "No se pudo completar la solicitud." };
    } catch (error) {
        return { error: "No hay conexión con el servidor." };
    }
}

function renderStreams(streams) {
    streamsContainer.innerHTML = "";

    if (!streams.length) {
        streamsContainer.innerHTML = `<div class="loading empty-streams"><strong>No hay broadcasters en vivo</strong><span>Inicia una sala para activar el video y el chat.</span><button class="gold-button" type="button" id="emptyStartBroadcast">Iniciar un directo</button></div>`;
        document.getElementById("emptyStartBroadcast").addEventListener("click", () => {
            if (!currentUser) {
                showAccountModal();
                return;
            }
            broadcastModal.classList.add("active");
        });
        return;
    }

    streams.forEach(stream => {
        const card = document.createElement("article");
        card.className = "stream-card broadcaster-card";
        card.innerHTML = `
            <div class="stream-card-photo">
                <span class="status-live">EN VIVO</span>
                <div class="stream-card-copy"><h3>${escapeHTML(stream.title)}</h3><p>${escapeHTML(stream.username)}</p></div>
            </div>
            <div class="stream-card-info"><strong>${escapeHTML(stream.username)}</strong><span>${stream.viewers || 0} espectadores</span><small class="stream-chat-hint">Abrir sala + chat</small></div>
        `;
        card.addEventListener("click", () => openStream(stream));
        streamsContainer.appendChild(card);
    });
}

async function loadStreams() {
    try {
        const response = await fetch("/api/streams");
        renderStreams(await response.json());
    } catch (error) {
        streamsContainer.innerHTML = `<div class="loading">No hay conexión con el servidor de directos.</div>`;
    }
}

async function createBroadcast(event) {
    event.preventDefault();
    const feedback = document.getElementById("broadcastFeedback");

    if (!currentUser) {
        closeModal(broadcastModal);
        showAccountModal();
        return;
    }

    showFeedback(feedback, "Iniciando broadcast...", false);

    const form = document.getElementById("broadcastForm");
    const payload = {
        title: form.title.value,
        userId: currentUser.id
    };

    try {
        const response = await fetch("/api/streams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            showFeedback(feedback, data.error || "No se pudo iniciar el broadcast.");
            return;
        }

        closeModal(broadcastModal);
        form.reset();
        openStream(data);
    } catch (error) {
        showFeedback(feedback, "No hay conexión con el servidor.");
    }
}

function openStream(stream) {
    stopVideoSession();
    currentStream = stream;
    document.getElementById("watchTitle").textContent = stream.title;
    document.getElementById("watchHost").textContent = `Transmitiendo ${stream.username}`;
    document.getElementById("giftBroadcaster").textContent = stream.username;
    document.getElementById("chatMessages").innerHTML = "";
    document.getElementById("moderationFeedback").textContent = "";
    document.getElementById("chatUserInfo").hidden = true;
    document.getElementById("localVideo").hidden = currentUser?.id !== stream.ownerId;
    document.getElementById("remoteVideo").hidden = currentUser?.id === stream.ownerId;
    watchModal.classList.add("active");
    socket.emit("join-stream", stream.id);
    if (currentUser?.id === stream.ownerId) {
        startBroadcasterVideo();
    } else {
        prepareViewerVideo();
    }
    loadGifts();
}

function canModerateCurrentStream() {
    return Boolean(currentUser && currentStream && (currentUser.role === "superadmin" || currentUser.role === "moderator" || currentUser.id === currentStream.ownerId));
}

async function loadGifts() {
    const giftGrid = document.getElementById("giftGrid");
    try {
        const response = await fetch("/api/gifts");
        const gifts = await response.json();
        giftGrid.innerHTML = gifts.map(gift => `<button class="gift-item" type="button" data-gift-id="${escapeHTML(gift.id)}"><span>${gift.icon}</span><strong>${escapeHTML(gift.name)}</strong><small>${gift.price} VIBRA</small></button>`).join("");
        giftGrid.querySelectorAll(".gift-item").forEach(button => button.addEventListener("click", () => sendGift(button.dataset.giftId)));
    } catch (error) {
        giftGrid.innerHTML = "<small>No se pudieron cargar los regalos.</small>";
    }
}

async function sendGift(giftId) {
    const feedback = document.getElementById("giftFeedback");
    if (!currentUser) {
        feedback.textContent = "Inicia sesión para enviar regalos.";
        return;
    }
    feedback.textContent = "Enviando regalo...";
    try {
        const response = await fetch(`/api/streams/${encodeURIComponent(currentStream.id)}/gifts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUser.id, giftId })
        });
        const data = await response.json();
        if (!response.ok) {
            feedback.textContent = data.error || "No se pudo enviar el regalo.";
            return;
        }
        currentUser = data.user;
        localStorage.setItem("vibraUser", JSON.stringify(currentUser));
        feedback.textContent = data.message;
    } catch (error) {
        feedback.textContent = "No hay conexión con el servidor.";
    }
}

function showChatUser(user) {
    if (!user) return;
    const avatar = document.getElementById("chatUserAvatar");
    avatar.textContent = user.avatarUrl ? "" : user.displayName.charAt(0).toUpperCase();
    const badge = user.connectionBadges?.[user.connectionBadges.length - 1];
    avatar.className = `chat-user-avatar ${connectionBadgeClass(badge)}`.trim();
    avatar.style.backgroundImage = user.avatarUrl ? `url("${escapeHTML(user.avatarUrl)}")` : "";
    document.getElementById("chatUserName").textContent = user.displayName;
    document.getElementById("chatUserHandle").textContent = `@${user.username}`;
    document.getElementById("chatUserLevel").textContent = `Nivel ${user.level}`;
    document.getElementById("chatUserBadge").textContent = badge ? `MARCO ${badge.label}` : "";
    document.getElementById("chatUserDetails").textContent = [user.status, user.location, user.bio].filter(Boolean).join(" · ");
    document.getElementById("chatUserInfo").hidden = false;
}

function sendChatMessage(event) {
    event.preventDefault();
    if (!currentStream) return;
    if (!currentUser) {
        closeModal(watchModal);
        loginModal.classList.add("active");
        return;
    }

    const input = document.getElementById("messageInput");
    const message = input.value.trim();
    if (!message) return;
    socket.emit("chat-message", { streamId: currentStream.id, userId: currentUser.id, username: currentUser.username, message });
    input.value = "";
}

document.getElementById("loginButton").addEventListener("click", () => {
    if (currentUser) {
        window.location.href = "/perfil.html";
        return;
    }
    loginModal.classList.add("active");
});
document.getElementById("startButton").addEventListener("click", showAccountModal);
document.getElementById("heroStartButton").addEventListener("click", showAccountModal);
document.getElementById("closeAccount").addEventListener("click", () => closeModal(accountModal));
document.getElementById("closeLogin").addEventListener("click", () => closeModal(loginModal));
document.getElementById("closeForgot").addEventListener("click", () => closeModal(forgotModal));
document.getElementById("closeReset").addEventListener("click", () => closeModal(resetModal));
document.getElementById("openLogin").addEventListener("click", () => {
    closeModal(accountModal);
    loginModal.classList.add("active");
});
document.getElementById("openForgot").addEventListener("click", () => {
    closeModal(loginModal);
    forgotModal.classList.add("active");
});
document.getElementById("closeProfile").addEventListener("click", () => closeModal(profileModal));
document.getElementById("openProfileEditor").addEventListener("click", openProfileEditor);
document.getElementById("closeProfileEditor").addEventListener("click", () => closeModal(profileEditorModal));
document.getElementById("profileForm").addEventListener("submit", updateProfile);
document.getElementById("welcomeContinue").addEventListener("click", () => {
    closeModal(welcomeModal);
    openProfileEditor();
});
document.getElementById("logoutButton").addEventListener("click", () => {
    currentUser = null;
    localStorage.removeItem("vibraUser");
    localStorage.removeItem("username");
    updateUserButton();
    closeModal(profileModal);
});
accountForm.addEventListener("submit", createAccount);
document.getElementById("loginForm").addEventListener("submit", login);
document.getElementById("forgotForm").addEventListener("submit", requestPasswordReset);
document.getElementById("resetForm").addEventListener("submit", resetPassword);
document.getElementById("openBroadcast").addEventListener("click", () => {
    if (!currentUser) {
        showAccountModal();
        return;
    }
    broadcastModal.classList.add("active");
});
document.getElementById("closeBroadcast").addEventListener("click", () => closeModal(broadcastModal));
document.getElementById("closeWatch").addEventListener("click", () => {
    stopVideoSession();
    closeModal(watchModal);
});
document.getElementById("broadcastForm").addEventListener("submit", createBroadcast);
document.getElementById("chatForm").addEventListener("submit", sendChatMessage);
document.getElementById("closeChatUserInfo").addEventListener("click", () => {
    document.getElementById("chatUserInfo").hidden = true;
});

document.getElementById("menuButton").addEventListener("click", () => {
    document.getElementById("dropdownMenu").classList.toggle("active");
});

    socket.on("streams-updated", renderStreams);
    socket.on("viewer-ready", ({ streamId, viewerId }) => {
        if (currentStream?.id === streamId && currentUser?.id === currentStream.ownerId) {
            offerVideoToViewer(viewerId);
        }
    });
    socket.on("webrtc-offer", async ({ streamId, broadcasterId, offer }) => {
        if (currentStream?.id !== streamId) return;
        const connection = createPeerConnection(broadcasterId, streamId, true);
        await connection.setRemoteDescription(offer);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        socket.emit("webrtc-answer", { targetSocketId: broadcasterId, streamId, answer });
    });
    socket.on("webrtc-answer", async ({ streamId, viewerId, answer }) => {
        if (currentStream?.id !== streamId) return;
        const connection = peerConnections.get(viewerId);
        if (connection) await connection.setRemoteDescription(answer);
    });
    socket.on("webrtc-ice-candidate", async ({ streamId, fromSocketId, candidate }) => {
        if (currentStream?.id !== streamId) return;
        const connection = peerConnections.get(fromSocketId);
        if (connection && candidate) await connection.addIceCandidate(candidate);
    });
    socket.on("connection-badges-updated", user => {
        currentUser = user;
        localStorage.setItem("vibraUser", JSON.stringify(user));
        updateUserButton();
    });
    socket.on("chat-message", data => {
        const message = document.createElement("p");
        message.className = "chat-message-bubble";
        message.dataset.messageId = data.messageId;
        const adminLabel = data.role === "superadmin" ? '<span class="chat-admin">♛ ADMIN</span>' : data.role === "moderator" ? '<span class="chat-admin">MODERADOR</span>' : "";
        const newUserLabel = data.newUser && !["superadmin", "moderator"].includes(data.role) ? '<span class="chat-new-user">NUEVO</span>' : "";
        const selectedUser = data.chatUser || (currentUser && data.username === currentUser.username ? {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName || currentUser.username,
            level: currentUser.level || "Bronce",
            status: currentUser.status || "Activo",
            location: currentUser.location || "",
            bio: currentUser.bio || "",
            avatarUrl: currentUser.avatarUrl || "",
            emblems: currentUserEmblems(),
            connectionBadges: currentUser.connectionBadges || []
        } : null);
        const moderationControls = canModerateCurrentStream() && selectedUser?.id !== currentUser.id
            ? '<span class="moderation-tools"><button type="button" data-moderation="delete">Borrar</button><button type="button" data-moderation="timeout">Silenciar</button></span>'
            : "";
        message.innerHTML = `${adminLabel}${newUserLabel}<button class="chat-user-trigger" type="button">${emblemMarkup(selectedUser?.emblems)}${escapeHTML(data.username)}</button> ${escapeHTML(data.message)}${moderationControls}`;
        const userButton = message.querySelector(".chat-user-trigger");
        userButton.addEventListener("click", () => showChatUser(selectedUser));
        message.querySelectorAll("[data-moderation]").forEach(button => button.addEventListener("click", event => {
            event.stopPropagation();
            if (event.currentTarget.dataset.moderation === "delete") {
                socket.emit("moderation-delete-message", { streamId: currentStream.id, messageId: data.messageId });
            } else if (selectedUser?.id) {
                socket.emit("moderation-timeout", { streamId: currentStream.id, targetUserId: selectedUser.id });
                document.getElementById("moderationFeedback").textContent = `${selectedUser.username} silenciado durante 10 minutos.`;
            }
        }));
        message.addEventListener("click", event => {
            if (!event.target.closest("[data-moderation]") && event.target !== userButton) showChatUser(selectedUser);
        });
        document.getElementById("chatMessages").appendChild(message);
    });
    socket.on("chat-message-removed", ({ messageId }) => {
        document.querySelector(`[data-message-id="${messageId}"]`)?.remove();
    });
    socket.on("user-muted", ({ userId }) => {
        if (currentUser?.id !== userId) return;
        document.getElementById("moderationFeedback").textContent = "Has sido silenciado durante 10 minutos.";
        document.getElementById("messageInput").disabled = true;
    });
    socket.on("moderation-denied", ({ message }) => {
        document.getElementById("moderationFeedback").textContent = message;
    });
    socket.on("gift-sent", data => {
        const giftMessage = document.createElement("p");
        giftMessage.className = "gift-chat-message";
        giftMessage.textContent = `${data.gift.icon} ${data.sender} envió ${data.gift.name} a ${data.broadcaster}`;
        document.getElementById("chatMessages").appendChild(giftMessage);
    });

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

updateUserButton();
identifyCurrentUser();
loadStreams();