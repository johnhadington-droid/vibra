const user = JSON.parse(localStorage.getItem("vibraUser") || "null");
const grids = {
    "entry-effect": document.getElementById("entryGrid"),
    emblem: document.getElementById("emblemGrid"),
    frame: document.getElementById("styleGrid"),
    "coin-pack": document.getElementById("coinGrid")
};
const styleTypes = new Set(["frame", "theme", "badge"]);

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
}

function renderWallet() {
    document.getElementById("walletBalance").textContent = user
        ? `Wallet: ${user.wallet.balance} ${user.wallet.currency}`
        : "Wallet: inicia sesión";
    document.getElementById("loginAction").textContent = user ? "Mi perfil" : "Iniciar sesión";
}

function renderItems(items) {
    const owned = user?.ownedCosmetics || [];
    Object.values(grids).forEach(grid => { grid.innerHTML = ""; });

    items.forEach(item => {
        const group = item.type === "entry-effect" ? grids["entry-effect"] : item.type === "emblem" ? grids.emblem : item.type === "coin-pack" ? grids["coin-pack"] : grids.frame;
        const acquired = owned.includes(item.id);
        const visualClass = `${item.type}-${item.value}`;
        const visualContent = item.type === "emblem" ? (item.value === "crown" ? "CROWN" : "VIP") : item.type === "entry-effect" ? "ENTRADA" : item.type === "coin-pack" ? `${item.coins} MONEDAS` : "STYLE";
        group.insertAdjacentHTML("beforeend", `
            <article class="shop-card">
                <div class="shop-visual ${visualClass}"><img class="shop-preview-image" src="${escapeHTML(item.image)}" alt="Vista previa de ${escapeHTML(item.name)}" loading="lazy"><span class="preview-kicker">PREVIEW ANIMADO</span><span class="shop-icon">${visualContent}</span><span class="preview-particle particle-one"></span><span class="preview-particle particle-two"></span><span class="preview-particle particle-three"></span></div>
                <div class="shop-card-body">
                    <h3>${escapeHTML(item.name)}</h3>
                    <p>${escapeHTML(item.description)}</p>
                    <div class="shop-card-footer">
                        <span class="shop-price">${item.type === "coin-pack" ? `${item.coins} monedas · $${item.price} USD` : `$${item.price} USD / $200 MXN`}</span>
                        <button class="buy-button" data-item-id="${item.id}" ${acquired ? "disabled" : ""}>${acquired ? "Adquirido" : "Comprar"}</button>
                    </div>
                    <small class="shop-item-feedback" data-feedback-for="${item.id}"></small>
                </div>
            </article>`);
    });

    document.querySelectorAll(".buy-button:not(:disabled)").forEach(button => {
        button.addEventListener("click", () => buyItem(button.dataset.itemId));
    });
}

async function loadStore() {
    try {
        const response = await fetch("/api/store");
        const items = await response.json();
        renderItems(items.filter(item => item.type === "entry-effect" || item.type === "emblem" || item.type === "coin-pack" || styleTypes.has(item.type)));
    } catch (error) {
        document.getElementById("shopStatus").textContent = "No se pudo cargar el catálogo";
    }
}

async function buyItem(itemId) {
    const feedback = document.getElementById("shopFeedback");
    const button = document.querySelector(`[data-item-id="${itemId}"]`);
    const itemFeedback = document.querySelector(`[data-feedback-for="${itemId}"]`);
    if (!user) {
        feedback.classList.add("error");
        feedback.textContent = "Inicia sesión para comprar cosméticos.";
        return;
    }

    feedback.classList.remove("error");
    feedback.textContent = "Procesando compra...";
    if (button) { button.disabled = true; button.textContent = "Procesando..."; }
    try {
        const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/purchases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId })
        });
        const data = await response.json();
        if (!response.ok) {
            feedback.classList.add("error");
            feedback.textContent = data.error || "No se pudo completar la compra.";
            if (itemFeedback) itemFeedback.textContent = data.error || "No se pudo completar la compra.";
            if (button) { button.disabled = false; button.textContent = "Comprar"; }
            return;
        }
        Object.assign(user, data.user);
        localStorage.setItem("vibraUser", JSON.stringify(user));
        renderWallet();
        feedback.textContent = data.message;
        if (itemFeedback) itemFeedback.textContent = data.message;
        loadStore();
    } catch (error) {
        feedback.classList.add("error");
        feedback.textContent = "No hay conexión con el servidor.";
        if (itemFeedback) itemFeedback.textContent = "No hay conexión con el servidor.";
        if (button) { button.disabled = false; button.textContent = "Comprar"; }
    }
}

document.getElementById("loginAction").addEventListener("click", () => {
    window.location.href = user ? "/perfil.html" : "/";
});

renderWallet();
loadStore();
