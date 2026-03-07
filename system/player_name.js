(function () {
    const NAME_KEY = "casino_player_name";

    function showNameModal() {
        const overlay = document.createElement("div");
        overlay.id = "name-modal-overlay";
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.95);
            z-index: 9999; display: flex; align-items: center; justify-content: center;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;
        overlay.innerHTML = `
            <div style="
                background: #1a0b2e; border: 2px solid #f1c40f; border-radius: 12px;
                padding: 36px 30px; width: 90%; max-width: 340px; text-align: center;
                box-shadow: 0 0 40px rgba(241,196,15,0.25);
            ">
                <div style="font-size: 2rem; margin-bottom: 10px;">🎰</div>
                <h2 style="color: #f1c40f; margin: 0 0 8px; letter-spacing: 3px; font-size: 1.2rem;">WELCOME</h2>
                <p style="color: #888; margin: 0 0 22px; font-size: 0.9rem;">What should we call you?</p>
                <input id="name-modal-input" type="text" maxlength="20"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                    placeholder="Your name"
                    style="
                        width: 100%; padding: 12px; font-size: 1.1rem; text-align: center;
                        background: #000; color: #f1c40f; border: 1px solid #555;
                        border-radius: 6px; box-sizing: border-box; margin-bottom: 16px;
                        outline: none;
                    "
                >
                <button id="name-modal-submit" style="
                    width: 100%; padding: 13px; background: #f1c40f; color: #111;
                    border: none; border-radius: 6px; font-weight: bold;
                    font-size: 1rem; cursor: pointer; letter-spacing: 1px;
                ">LET'S PLAY</button>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = overlay.querySelector("#name-modal-input");
        const submit = overlay.querySelector("#name-modal-submit");

        // Auto-focus after short delay (works on mobile too)
        setTimeout(() => input.focus(), 100);

        function saveName() {
            const name = input.value.trim();
            if (!name) {
                input.style.borderColor = "#e74c3c";
                input.focus();
                return;
            }
            // Save single value — no list, no history
            localStorage.setItem(NAME_KEY, name);
            overlay.remove();
        }

        submit.addEventListener("click", saveName);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveName(); });
        input.addEventListener("input", () => { input.style.borderColor = "#555"; });
    }

    // Only show if name hasn't been set yet
    if (!localStorage.getItem(NAME_KEY)) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", showNameModal);
        } else {
            showNameModal();
        }
    }
})();