const user = JSON.parse(localStorage.getItem("vibraUser") || "null");
const form = document.getElementById("profileForm");
const feedback = document.getElementById("profileFeedback");

if (!user || !user.id) {
    window.location.href = "/";
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
}

function profileEmblemMarkup(emblems = []) {
    return emblems.map(emblem => `<span class="profile-name-emblem" title="${escapeHTML(emblem.label)}">${escapeHTML(emblem.icon)}</span>`).join("");
}

function profileEmblems() {
    return user.emblems || (user.role === "superadmin" ? [
        { icon: "♛", label: "SUPER ADMIN" },
        { icon: "★", label: "ESTRELLA" },
        { icon: "♚", label: "VIP" }
    ] : []);
}

function renderProfile() {
    const displayName = user.displayName || user.username;
    const photo = document.getElementById("profilePhoto");
    const cosmetics = user.cosmetics || { frame: "classic", theme: "ivory", badge: "newcomer" };
    document.body.classList.toggle("superadmin-profile", user.role === "superadmin");
    photo.textContent = user.avatarUrl ? "" : displayName.charAt(0).toUpperCase();
    photo.style.backgroundImage = user.avatarUrl ? `url("${user.avatarUrl}")` : "";
    photo.dataset.frame = cosmetics.frame;
    document.body.dataset.theme = cosmetics.theme;
    document.getElementById("profileName").innerHTML = `${escapeHTML(displayName)} ${profileEmblemMarkup(profileEmblems())}`;
    document.getElementById("adminCrown").classList.toggle("visible", user.role === "superadmin");
    document.getElementById("adminCrown").textContent = user.profileTitle || "ADMIN";
    document.querySelector(".profile-editor > p:nth-of-type(3)").textContent = user.hasAllCosmetics ? "Perfil único · acceso total a emblemas, badges y estilos." : "Cada edición cuesta $2 USD.";
    document.getElementById("newUserEmblem").classList.toggle("visible", user.newUser === true && user.role !== "superadmin");
    document.getElementById("profileHandle").textContent = `@${user.username}${user.location ? ` · ${user.location}` : ""}`;
    document.getElementById("profileBio").textContent = user.bio || "Aún no has añadido una biografía.";
    const wallet = user.wallet || { balance: 0, coins: 0 };
    document.getElementById("walletValue").textContent = `${wallet.balance} ${wallet.currency || "VIBRA"}`;
    document.getElementById("coinsValue").textContent = Number(user.vibraCoins ?? wallet.coins ?? 0).toLocaleString("es-MX");
    document.getElementById("followersValue").textContent = Number(user.followerCount || 0).toLocaleString("es-MX");
    document.getElementById("followingValue").textContent = Number(user.followingCount || 0).toLocaleString("es-MX");
    document.getElementById("levelValue").textContent = user.level;
    document.getElementById("statusValue").textContent = user.status;
    document.getElementById("displayName").value = displayName;
    document.getElementById("avatarUrl").value = user.avatarUrl || "";
    document.getElementById("location").value = user.location || "";
    document.getElementById("bio").value = user.bio || "";
    document.getElementById("frame").value = cosmetics.frame;
    document.getElementById("theme").value = cosmetics.theme;
    document.getElementById("badge").value = cosmetics.badge;
    document.getElementById("cosmeticLabel").textContent = user.hasAllCosmetics ? "Colección completa · distintivo Estrella" : `Distintivo: ${cosmetics.badge === "star" ? "Estrella" : cosmetics.badge === "rising" ? "En ascenso" : "Nuevo"}`;
    document.getElementById("bankStatus").textContent = user.hasBankAccount ? "Cuenta SPEI configurada" : "Aún no has configurado una cuenta SPEI.";
}

async function loadStore() {
    const storeGrid = document.getElementById("storeGrid");
    try {
        const response = await fetch("/api/store");
        const items = await response.json();
        const owned = user.ownedCosmetics || [];
        storeGrid.innerHTML = items.filter(item => item.type !== "coin-pack").map(item => {
            const isOwned = owned.includes(item.id);
            return `<article class="store-item"><img class="store-item-image" src="${escapeHTML(item.image)}" alt="Vista previa de ${escapeHTML(item.name)}" loading="lazy"><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.description)}</p><button class="store-buy" data-item-id="${item.id}" ${isOwned ? "disabled" : ""}>${isOwned ? "Adquirido" : `$${item.usdPrice || item.price} USD / $${item.priceMxn || 200} MXN`}</button><small class="store-item-feedback" data-feedback-for="${item.id}"></small></article>`;
        }).join("");
        storeGrid.querySelectorAll(".store-buy:not(:disabled)").forEach(button => {
            button.addEventListener("click", () => buyCosmetic(button.dataset.itemId));
        });
    } catch (error) {
        storeGrid.innerHTML = "No se pudo cargar la tienda.";
    }
}

async function buyCosmetic(itemId) {
    const storeFeedback = document.getElementById("storeFeedback");
    const button = document.querySelector(`[data-item-id="${itemId}"]`);
    const itemFeedback = document.querySelector(`[data-feedback-for="${itemId}"]`);
    storeFeedback.textContent = "Procesando compra...";
    if (button) { button.disabled = true; button.textContent = "Procesando..."; }
    try {
        const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/purchases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId })
        });
        const data = await response.json();
        if (!response.ok) {
            storeFeedback.classList.add("error");
            storeFeedback.textContent = data.error || "No se pudo completar la compra.";
            if (itemFeedback) itemFeedback.textContent = data.error || "No se pudo completar la compra.";
            if (button) { button.disabled = false; button.textContent = "Comprar"; }
            return;
        }
        storeFeedback.classList.remove("error");
        storeFeedback.textContent = data.message;
        if (itemFeedback) itemFeedback.textContent = data.message;
        Object.assign(user, data.user);
        localStorage.setItem("vibraUser", JSON.stringify(user));
        renderProfile();
        loadStore();
    } catch (error) {
        storeFeedback.classList.add("error");
        storeFeedback.textContent = "No hay conexión con el servidor.";
        if (itemFeedback) itemFeedback.textContent = "No hay conexión con el servidor.";
        if (button) { button.disabled = false; button.textContent = "Comprar"; }
    }
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    feedback.classList.remove("error");
    feedback.textContent = "Procesando edición de $2 USD...";

    try {
        const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const updatedUser = await response.json();

        if (!response.ok) {
            feedback.classList.add("error");
            feedback.textContent = updatedUser.error || "No se pudo guardar el perfil.";
            return;
        }

        localStorage.setItem("vibraUser", JSON.stringify(updatedUser));
        Object.assign(user, updatedUser);
        renderProfile();
        feedback.textContent = "Perfil actualizado correctamente.";
    } catch (error) {
        feedback.classList.add("error");
        feedback.textContent = "No hay conexión con el servidor.";
    }
});

document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("vibraUser");
    localStorage.removeItem("username");
    window.location.href = "/";
});

renderProfile();
loadStore();
