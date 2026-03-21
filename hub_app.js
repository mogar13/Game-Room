// --- 1. HUB AUDIO ENGINE ---
const hubAudio = {
    click: new Audio('system/audio/click1.mp3'),
    win: new Audio('system/audio/win.ogg') 
};

function playHubSound(type) {
    if (!hubAudio[type]) return;
    hubAudio[type].currentTime = 0;
    hubAudio[type].play().catch(e => console.log("Audio blocked by browser."));
}

// Wire hub sounds to all static interactive elements (cards wired after fetch)
document.querySelectorAll('.hub-interactive').forEach(el => {
    el.addEventListener('click', () => playHubSound('click'));
});

// --- 1.5 REWARDS BUG FIX (GUEST BLOCKER) ---
// Intercepts the rewards module to prevent it from auto-firing for guests
if (window.SystemRewards) {
    const originalCheck = window.SystemRewards.checkDailyLogin;
    window.SystemRewards.checkDailyLogin = function() {
        if (window.SystemAuth && !window.SystemAuth.isLoggedIn()) return;
        if (originalCheck) originalCheck.apply(this, arguments);
    };
    
    // Catch any secondary modal popups Claude might have used
    if (typeof window.SystemRewards.showModal === 'function') {
        const originalShow = window.SystemRewards.showModal;
        window.SystemRewards.showModal = function() {
            if (window.SystemAuth && !window.SystemAuth.isLoggedIn()) return;
            if (originalShow) originalShow.apply(this, arguments);
        };
    }
}

// --- 2. PROFILE BANNER & DAILY BONUS (REFACTORED FOR CASINO OS 2.0) ---
const bonusBtn = document.getElementById("daily-bonus-btn");

function updateBonusUI() {
    if (!window.SystemProfile || !window.SystemRewards) return;

    const loggedIn = window.SystemAuth ? window.SystemAuth.isLoggedIn() : false;

    const loggedInEl  = document.getElementById("auth-logged-in");
    const loggedOutEl = document.getElementById("auth-logged-out");
    if (loggedInEl)  loggedInEl.classList.toggle("hidden",  !loggedIn);
    if (loggedOutEl) loggedOutEl.classList.toggle("hidden", loggedIn);

    if (!loggedIn) return;

    // 1. Sync the HUD securely through the Profile API
    const profile = SystemProfile.getProfile();
    document.getElementById("display-player-name").innerText = profile.name;
    const bannerAvatar = document.getElementById("display-player-avatar");
    if (bannerAvatar) bannerAvatar.innerText = profile.avatar || "👤";
    document.getElementById("display-player-money").innerText = profile.bankroll;

    // 2. Sync the XP & Level UI
    const levelBadge = document.getElementById("display-player-level");
    const titleText = document.getElementById("display-player-title");
    const xpFill = document.getElementById("xp-bar-fill");
    const xpText = document.getElementById("xp-text");
    
    if (levelBadge) levelBadge.innerText = `Lv.${profile.level}`;
    
    // Check if they have a custom purchased title, otherwise use level-based
    if (titleText) {
        if (profile.title && profile.title !== "Newcomer") {
            titleText.innerText = profile.title;
        } else {
            titleText.innerText = typeof SystemProfile.getLevelTitle === 'function' ? SystemProfile.getLevelTitle() : "Newcomer";
        }
    }

    if (xpFill && xpText) {
        const thresholds = [0, 500, 2000, 5000, 10000, 25000];
        let nextLvlXP = thresholds[profile.level] || 25000; 
        let prevLvlXP = thresholds[profile.level - 1] || 0;
        let xpIntoLevel = profile.xp - prevLvlXP;
        let xpNeeded = nextLvlXP - prevLvlXP;
        let pct = (xpIntoLevel / xpNeeded) * 100;
        if (pct > 100) pct = 100;
        if (profile.level >= 6) {
            xpFill.style.width = `100%`;
            xpText.innerText = "MAX LEVEL";
        } else {
            xpFill.style.width = `${pct}%`;
            xpText.innerText = `${profile.xp} / ${nextLvlXP} XP`;
        }
    }

    // 3. Sync the Bonus Button state with the Rewards API
    const todayStr = SystemRewards.getTodayString();
    if (SystemRewards.data.lastClaim === todayStr) {
        bonusBtn.disabled = true;
        bonusBtn.innerText = "Claimed Today";
        bonusBtn.style.background = "#444";
        bonusBtn.style.color = "#888";
    } else {
        bonusBtn.disabled = false;
        bonusBtn.innerText = "Claim Daily Bonus";
        bonusBtn.style.background = "#2ecc71";
        bonusBtn.style.color = "#000";
    }

    // 4. Handle Dev & Logout Visibility (FIXED)
    const devBtn = document.getElementById("sys-dev-btn");
    const logoutBtn = document.getElementById("sys-logout-btn");
    const isForerunner = window.SystemAuth && SystemAuth.getActiveUsername() === "forerunner" && SystemProfile.isDev();
    
    if (devBtn) {
        if (isForerunner) devBtn.classList.remove("dev-only");
        else devBtn.classList.add("dev-only");
    }
    if (logoutBtn) {
        if (loggedIn) logoutBtn.classList.remove("dev-only");
        else logoutBtn.classList.add("dev-only");
    }
}

// Make globally available so system_rewards.js can trigger UI updates after claiming
window.updateBonusButton = updateBonusUI;

// --- DEV TOOLS & LOGOUT ---
function openDevMenu() {
    const modal = document.getElementById("modal-dev-tools");
    if (modal) { modal.classList.remove("hidden"); return; }
}

function wireAuthModals() {
    const modalLogin    = document.getElementById("modal-login");
    const modalRegister = document.getElementById("modal-register");

    const openLogin = document.getElementById("btn-open-login");
    const openReg   = document.getElementById("btn-open-register");
    if (openLogin) openLogin.addEventListener("click", () => {
        if (modalLogin)    modalLogin.classList.remove("hidden");
        if (modalRegister) modalRegister.classList.add("hidden");
    });
    if (openReg) openReg.addEventListener("click", () => {
        if (modalRegister) modalRegister.classList.remove("hidden");
        if (modalLogin)    modalLogin.classList.add("hidden");
    });

    const closeLogin = document.getElementById("close-login-btn");
    const closeReg   = document.getElementById("close-register-btn");
    if (closeLogin) closeLogin.addEventListener("click", () => modalLogin && modalLogin.classList.add("hidden"));
    if (closeReg)   closeReg.addEventListener("click",   () => modalRegister && modalRegister.classList.add("hidden"));

    const gotoReg   = document.getElementById("link-goto-register");
    const gotoLogin = document.getElementById("link-goto-login");
    if (gotoReg) gotoReg.addEventListener("click", (e) => {
        e.preventDefault();
        if (modalLogin)    modalLogin.classList.add("hidden");
        if (modalRegister) modalRegister.classList.remove("hidden");
    });
    if (gotoLogin) gotoLogin.addEventListener("click", (e) => {
        e.preventDefault();
        if (modalRegister) modalRegister.classList.add("hidden");
        if (modalLogin)    modalLogin.classList.remove("hidden");
    });

    const submitLogin = document.getElementById("btn-submit-login");
    if (submitLogin) submitLogin.addEventListener("click", async () => {
        const username = (document.getElementById("login-username")?.value || "").trim();
        const password = (document.getElementById("login-password")?.value || "").trim();
        const errorEl  = document.getElementById("login-error");
        if (errorEl) errorEl.classList.add("hidden");
        const result = window.SystemAuth ? await SystemAuth.login(username, password) : { ok: false, error: "Auth not loaded." };
        if (result.ok) {
            if (modalLogin) modalLogin.classList.add("hidden");
            playHubSound('win');
            setTimeout(updateBonusUI, 0);
        } else {
            if (errorEl) { errorEl.innerText = result.error; errorEl.classList.remove("hidden"); }
        }
    });

    const submitReg = document.getElementById("btn-submit-register");
    if (submitReg) submitReg.addEventListener("click", async () => {
        const username = (document.getElementById("register-username")?.value || "").trim();
        const password = (document.getElementById("register-password")?.value || "").trim();
        const question = (document.getElementById("register-security-question")?.value || "").trim();
        const answer   = (document.getElementById("register-security-answer")?.value || "").trim();
        const errorEl  = document.getElementById("register-error");
        if (errorEl) errorEl.classList.add("hidden");
        const result = window.SystemAuth ? await SystemAuth.register(username, password, question, answer) : { ok: false, error: "Auth not loaded." };
        if (result.ok) {
            if (modalRegister) modalRegister.classList.add("hidden");
            playHubSound('win');
            setTimeout(updateBonusUI, 0);
        } else {
            if (errorEl) { errorEl.innerText = result.error; errorEl.classList.remove("hidden"); }
        }
    });

    const modalForgot = document.getElementById("modal-forgot-password");
    const linkForgot  = document.getElementById("link-forgot-password");
    const closeForgot = document.getElementById("close-forgot-btn");
    if (linkForgot) linkForgot.addEventListener("click", () => {
        if (modalForgot) modalForgot.classList.remove("hidden");
        if (modalLogin)  modalLogin.classList.add("hidden");
        const errEl = document.getElementById("forgot-error");
        const sucEl = document.getElementById("forgot-success");
        if (errEl) errEl.classList.add("hidden");
        if (sucEl) sucEl.classList.add("hidden");
    });
    if (closeForgot) closeForgot.addEventListener("click", () => modalForgot && modalForgot.classList.add("hidden"));

    const submitForgot = document.getElementById("btn-submit-forgot");
    let forgotStep = 1;

    const linkBackToLogin = document.getElementById("link-back-to-login");
    if (linkBackToLogin) linkBackToLogin.addEventListener("click", () => {
        if (modalForgot) modalForgot.classList.add("hidden");
        if (modalLogin)  modalLogin.classList.remove("hidden");
        const errEl = document.getElementById("forgot-error");
        const sucEl = document.getElementById("forgot-success");
        if (errEl) errEl.classList.add("hidden");
        if (sucEl) sucEl.classList.add("hidden");
        forgotStep = 1;
        if (submitForgot) submitForgot.innerText = "CONTINUE";
        const step2 = document.getElementById("forgot-step-2");
        if (step2) step2.classList.add("hidden");
    });

    if (submitForgot) submitForgot.addEventListener("click", () => {
        const errEl = document.getElementById("forgot-error");
        const sucEl = document.getElementById("forgot-success");
        if (errEl) errEl.classList.add("hidden");
        if (sucEl) sucEl.classList.add("hidden");

        if (forgotStep === 1) {
            const username = (document.getElementById("forgot-username")?.value || "").trim().toLowerCase();
            const question = window.SystemAuth ? SystemAuth.getSecurityQuestion(username) : null;
            if (!question) {
                if (errEl) { errEl.innerText = "User not found."; errEl.classList.remove("hidden"); }
                return;
            }
            const questionLabels = {
                game:       "What is your favorite video game of all time?",
                character:  "Who is your favorite fictional character?",
                movie:      "What was the first movie you saw in theaters?",
                karaoke:    "What is your go-to karaoke song?",
                superpower: "If you had a superpower, what would it be?"
            };
            const step2 = document.getElementById("forgot-step-2");
            const qText = document.getElementById("forgot-question-text");
            if (qText) qText.innerText = questionLabels[question] || question;
            if (step2) step2.classList.remove("hidden");
            submitForgot.innerText = "VERIFY ANSWER";
            forgotStep = 2;
        } else {
            const username = (document.getElementById("forgot-username")?.value || "").trim().toLowerCase();
            const answer   = (document.getElementById("forgot-security-answer")?.value || "").trim();
            const result   = window.SystemAuth ? SystemAuth.verifySecurityAnswer(username, answer) : { ok: false, error: "Auth not loaded." };
            if (result.ok) {
                if (sucEl) { sucEl.innerText = `Your password is: ${result.password}`; sucEl.classList.remove("hidden"); }
                const step2 = document.getElementById("forgot-step-2");
                if (step2) step2.classList.add("hidden");
                submitForgot.innerText = "CONTINUE";
                forgotStep = 1;
            } else {
                if (errEl) { errEl.innerText = result.error; errEl.classList.remove("hidden"); }
            }
        }
    });

    const triggerClickOnEnter = (inputId, buttonId) => {
        const input = document.getElementById(inputId);
        if (input) input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const btn = document.getElementById(buttonId);
                if (btn) btn.click();
            }
        });
    };
    
    triggerClickOnEnter("login-username", "btn-submit-login");
    triggerClickOnEnter("login-password", "btn-submit-login");
    triggerClickOnEnter("register-username", "btn-submit-register");
    triggerClickOnEnter("register-password", "btn-submit-register");
    triggerClickOnEnter("register-security-question", "btn-submit-register");
    triggerClickOnEnter("register-security-answer", "btn-submit-register");
    triggerClickOnEnter("forgot-username", "btn-submit-forgot");
    triggerClickOnEnter("forgot-security-answer", "btn-submit-forgot");

    document.querySelectorAll(".dev-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".dev-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".dev-tab-content").forEach(c => c.classList.add("hidden"));
            tab.classList.add("active");
            const panel = document.getElementById(tab.dataset.target);
            if (panel) panel.classList.remove("hidden");
        });
    });
}

function wireDevModal() {
    const modal = document.getElementById("modal-dev-tools");
    const closeBtn = document.getElementById("close-dev-btn");

    if (!modal) return;

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

    // Economy Tab
    const econTarget = document.getElementById("dev-econ-target");
    const econAmount = document.getElementById("dev-econ-amount");
    const econAdd = document.getElementById("dev-econ-add");
    const econSub = document.getElementById("dev-econ-sub");

    if (econAdd) econAdd.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const target = econTarget.value;
        const amount = parseInt(econAmount.value) || 0;
        if (amount > 0) {
            const res = SystemAuth.admin.modifyMoney(target, amount);
            alert(res.message || res.error);
            updateBonusUI();
        }
    });
    
    if (econSub) econSub.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const target = econTarget.value;
        const amount = parseInt(econAmount.value) || 0;
        if (amount > 0) {
            const res = SystemAuth.admin.modifyMoney(target, -amount);
            alert(res.message || res.error);
            updateBonusUI();
        }
    });

    // Progression Tab
    const progTarget = document.getElementById("dev-prog-target");
    const progAmount = document.getElementById("dev-prog-amount");
    const progAdd = document.getElementById("dev-prog-add");
    const progSub = document.getElementById("dev-prog-sub");

    if (progAdd) progAdd.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const target = progTarget.value;
        const amount = parseInt(progAmount.value) || 0;
        if (amount > 0) {
            const res = SystemAuth.admin.modifyXP(target, amount);
            alert(res.message || res.error);
            updateBonusUI();
        }
    });

    if (progSub) progSub.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const target = progTarget.value;
        const amount = parseInt(progAmount.value) || 0;
        if (amount > 0) {
            const res = SystemAuth.admin.modifyXP(target, -amount);
            alert(res.message || res.error);
            updateBonusUI();
        }
    });

    // Admin Tab
    const adminTarget = document.getElementById("dev-admin-target");
    const adminReset = document.getElementById("dev-admin-reset");
    const adminDelete = document.getElementById("dev-admin-delete");

    if (adminReset) adminReset.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const target = adminTarget.value;
        if (!target) { alert("Target Username is REQUIRED for Admin actions."); return; }
        if (confirm(`Are you absolutely sure you want to RESET progress for '${target}'?`)) {
            const res = SystemAuth.admin.resetProgress(target);
            alert(res.message || res.error);
            updateBonusUI();
        }
    });

    if (adminDelete) adminDelete.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const target = adminTarget.value;
        if (!target) { alert("Target Username is REQUIRED for Admin actions."); return; }
        if (confirm(`Are you absolutely sure you want to DELETE the account '${target}'? This cannot be undone.`)) {
            const res = SystemAuth.admin.deleteAccount(target);
            alert(res.message || res.error);
            if (res.ok && (!SystemAuth.isLoggedIn() || SystemAuth.getActiveUsername() === target)) {
                window.location.reload(); 
            }
        }
    });

    // Rewards Tab
    const rewTarget = document.getElementById("dev-rew-target");
    const rewAchId = document.getElementById("dev-rew-ach-id");
    const rewUnlock = document.getElementById("dev-rew-unlock");
    const rewLock = document.getElementById("dev-rew-lock");
    const rewDaily = document.getElementById("dev-rew-daily");

    if (rewUnlock) rewUnlock.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const res = SystemAuth.admin.toggleAchievement(rewTarget.value, rewAchId.value, true);
        alert(res.message || res.error);
        if (res.ok && typeof renderTrophyRoom === 'function') renderTrophyRoom();
    });

    if (rewLock) rewLock.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const res = SystemAuth.admin.toggleAchievement(rewTarget.value, rewAchId.value, false);
        alert(res.message || res.error);
        if (res.ok && typeof renderTrophyRoom === 'function') renderTrophyRoom();
    });

    if (rewDaily) rewDaily.addEventListener("click", () => {
        if (!window.SystemAuth || !window.SystemAuth.admin) return;
        const res = SystemAuth.admin.resetDailyBonus(rewTarget.value);
        alert(res.message || res.error);
        updateBonusUI();
    });
}

function systemLogout() {
    const modal = document.getElementById("modal-logout");
    const text = document.getElementById("logout-prompt-text");
    if (!modal) return;
    
    if (window.SystemAuth && window.SystemAuth.isLoggedIn()) {
        if (text) text.innerText = "Are you sure you want to log out of your account?";
    } else {
        if (text) text.innerText = "Deactivate Developer Mode and return to standard Player account?";
    }
    modal.classList.remove("hidden");
}

function wireProfileEdit() {
    const btnEdit = document.getElementById("btn-edit-profile");
    const modalEdit = document.getElementById("modal-edit-profile");
    const closeEdit = document.getElementById("close-edit-btn");
    const submitEdit = document.getElementById("btn-submit-edit");
    
    if (btnEdit) {
        btnEdit.addEventListener("click", () => {
            playHubSound('click');
            if (!window.SystemAuth || !window.SystemAuth.isLoggedIn()) return;
            
            const profile = window.SystemProfile.getProfile();
            const currentName = profile.name;
            const currentAvatar = profile.avatar || "👤";
            const currentColor = profile.chatColor || "#ffffff";
            const currentTitle = profile.title || "Newcomer";
            
            document.getElementById("edit-username").value = currentName;
            document.getElementById("edit-error").classList.add("hidden");
            
            // Dynamically inject all unlocked Avatars
            const avatarGrid = document.getElementById("avatar-grid");
            const baseAvatars = ["👤", "🤖", "👽", "👾", "👻", "🤠", "🐱‍👤"];
            const ownedAvatars = window.SystemStore ? window.SystemStore.getOwnedItemsByType('avatar').map(i => i.value) : [];
            const allAvatars = [...new Set([...baseAvatars, ...ownedAvatars])];
            
            avatarGrid.innerHTML = allAvatars.map(av => 
                `<span class="avatar-option ${av === currentAvatar ? 'active-avatar' : ''}" 
                       style="border: 2px solid ${av === currentAvatar ? 'var(--accent-color)' : 'transparent'}; 
                              border-radius: 8px; padding: 2px; 
                              background: ${av === currentAvatar ? 'rgba(0,210,255,0.2)' : 'transparent'}; 
                              transition: 0.2s;">${av}</span>`
            ).join("");
            
            document.getElementById("edit-avatar-val").value = currentAvatar;
            
            // Rebind avatar clicks for the new dynamically generated grid
            avatarGrid.querySelectorAll(".avatar-option").forEach(el => {
                el.addEventListener("click", (e) => {
                    avatarGrid.querySelectorAll(".avatar-option").forEach(opt => {
                        opt.classList.remove("active-avatar");
                        opt.style.borderColor = "transparent";
                        opt.style.background = "transparent";
                    });
                    e.target.classList.add("active-avatar");
                    e.target.style.borderColor = "var(--accent-color)";
                    e.target.style.background = "rgba(0,210,255,0.2)";
                    document.getElementById("edit-avatar-val").value = e.target.innerText;
                });
            });

            // Dynamically inject Title and Color dropdowns based on Store Inventory
            let extraControls = document.getElementById("edit-extra-controls");
            if (!extraControls) {
                extraControls = document.createElement("div");
                extraControls.id = "edit-extra-controls";
                extraControls.style.display = "flex";
                extraControls.style.flexDirection = "column";
                extraControls.style.gap = "10px";
                const errEl = document.getElementById("edit-error");
                errEl.parentNode.insertBefore(extraControls, submitEdit);
            }
            
            const ownedColors = window.SystemStore ? window.SystemStore.getOwnedItemsByType('color') : [];
            const colorOptions = `<option value="#ffffff" ${currentColor==='#ffffff'?'selected':''}>White (Default)</option>` + 
                ownedColors.map(c => `<option value="${c.value}" ${currentColor===c.value?'selected':''}>${c.name}</option>`).join("");
                
            const ownedTitles = window.SystemStore ? window.SystemStore.getOwnedItemsByType('title') : [];
            const titles = ["Newcomer"];
            if (profile.level >= 2) titles.push("Regular");
            if (profile.level >= 3) titles.push("Veteran");
            if (profile.level >= 4) titles.push("Pro");
            if (profile.level >= 5) titles.push("Master");
            if (profile.level >= 6) titles.push("Legend");
            ownedTitles.forEach(t => titles.push(t.value));
            const titleOptions = [...new Set(titles)].map(t => `<option value="${t}" ${currentTitle===t?'selected':''}>${t}</option>`).join("");

            extraControls.innerHTML = `
                <div style="text-align: center; color: #aaa; font-size: 0.8rem; margin-bottom: -5px;">Chat Color</div>
                <select id="edit-color-val" class="auth-input" style="padding: 10px; border-radius: 8px; border: 1px solid #3a1c61; background: rgba(0,0,0,0.7); color: #fff; font-family: 'Roboto', sans-serif; font-size: 0.9rem; outline: none; cursor: pointer;">
                    ${colorOptions}
                </select>
                <div style="text-align: center; color: #aaa; font-size: 0.8rem; margin-bottom: -5px;">Title</div>
                <select id="edit-title-val" class="auth-input" style="padding: 10px; border-radius: 8px; border: 1px solid #3a1c61; background: rgba(0,0,0,0.7); color: #fff; font-family: 'Roboto', sans-serif; font-size: 0.9rem; outline: none; cursor: pointer;">
                    ${titleOptions}
                </select>
            `;
            
            if (modalEdit) modalEdit.classList.remove("hidden");
        });
    }
    
    if (closeEdit) closeEdit.addEventListener("click", () => {
        playHubSound('click');
        if (modalEdit) modalEdit.classList.add("hidden");
    });
    
    if (submitEdit) {
        submitEdit.addEventListener("click", async () => {
            playHubSound('click');
            const newName = document.getElementById("edit-username").value;
            const newAvatar = document.getElementById("edit-avatar-val").value;
            const newColorEl = document.getElementById("edit-color-val");
            const newColor = newColorEl ? newColorEl.value : undefined;
            const newTitleEl = document.getElementById("edit-title-val");
            const newTitle = newTitleEl ? newTitleEl.value : undefined;
            const errorEl = document.getElementById("edit-error");
            
            const originalText = submitEdit.innerText;
            submitEdit.innerText = "SAVING...";
            submitEdit.disabled = true;
            
            const res = await window.SystemAuth.updateProfile(newName, newAvatar, newTitle, newColor);
            
            if (res.ok) {
                if (modalEdit) modalEdit.classList.add("hidden");
                updateBonusUI();
                if (typeof openProfilePanel === 'function') {
                    document.getElementById("pp-name").innerText = window.SystemProfile.getProfile().name;
                    const ppAvatar = document.getElementById("pp-avatar");
                    if (ppAvatar) ppAvatar.innerText = newAvatar;
                }
            } else {
                if (errorEl) {
                    errorEl.innerText = res.error;
                    errorEl.classList.remove("hidden");
                }
            }
            submitEdit.innerText = originalText;
            submitEdit.disabled = false;
        });

        const editInput = document.getElementById("edit-username");
        if (editInput) {
            editInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    submitEdit.click();
                }
            });
        }
    }
}

function wireBugReporter() {
    const bugBtns = document.querySelectorAll(".btn-report-bug");
    const modalBug = document.getElementById("modal-bug-report");
    const closeBug = document.getElementById("close-bug-btn");
    const submitBug = document.getElementById("btn-submit-bug");
    
    bugBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            playHubSound('click');
            document.getElementById("bug-title").value = "";
            document.getElementById("bug-desc").value = "";
            document.getElementById("bug-error").classList.add("hidden");
            document.getElementById("bug-success").classList.add("hidden");
            if (modalBug) modalBug.classList.remove("hidden");
        });
    });
    
    if (closeBug) closeBug.addEventListener("click", () => {
        playHubSound('click');
        if (modalBug) modalBug.classList.add("hidden");
    });
    
    if (submitBug) submitBug.addEventListener("click", () => {
        playHubSound('click');
        const title = document.getElementById("bug-title").value.trim();
        const desc = document.getElementById("bug-desc").value.trim();
        const errorEl = document.getElementById("bug-error");
        const successEl = document.getElementById("bug-success");
        
        if (!title || !desc) {
            errorEl.innerText = "Please fill out both the title and description.";
            errorEl.classList.remove("hidden");
            successEl.classList.add("hidden");
            return;
        }
        
        if (!navigator.onLine || !window.dbUpdate || !window.dbRef || !window.db) {
            errorEl.innerText = "You must be online to report a bug.";
            errorEl.classList.remove("hidden");
            successEl.classList.add("hidden");
            return;
        }
        
        const username = (window.SystemAuth && window.SystemAuth.isLoggedIn()) ? window.SystemAuth.getActiveUsername() : "Guest";
        const reportId = "bug_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        
        const payload = {
            title: title,
            description: desc,
            reportedBy: username,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            status: "open"
        };
        
        window.dbUpdate(window.dbRef(window.db, `bug_reports/${reportId}`), payload)
            .then(() => {
                errorEl.classList.add("hidden");
                successEl.classList.remove("hidden");
                document.getElementById("bug-title").value = "";
                document.getElementById("bug-desc").value = "";
                
                setTimeout(() => {
                    if (modalBug) modalBug.classList.add("hidden");
                    successEl.classList.add("hidden");
                }, 2000);
            })
            .catch(e => {
                errorEl.innerText = "Failed to submit report. Try again later.";
                errorEl.classList.remove("hidden");
            });
    });
}

function wireGlobalChat() {
    const toggleBtn = document.getElementById("chat-toggle-btn");
    const chatPanel = document.getElementById("chat-panel");
    const closeBtn = document.getElementById("close-chat-btn");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("btn-send-chat");
    const messagesContainer = document.getElementById("chat-messages");

    if (!toggleBtn || !chatPanel) return;

    toggleBtn.addEventListener("click", () => {
        playHubSound('click');
        
        // REFACTORED: Remove the invisibility cloak first
        chatPanel.classList.remove("hidden");
        
        // REFACTORED: Toggle slide class
        chatPanel.classList.toggle("chat-panel-open");
        
        if (chatPanel.classList.contains("chat-panel-open")) {
            chatInput.focus();
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            // Wait for slide animation (220ms) then add hidden back for performance
            setTimeout(() => {
                if (!chatPanel.classList.contains("chat-panel-open")) {
                    chatPanel.classList.add("hidden");
                }
            }, 230);
        }
    });

    closeBtn.addEventListener("click", () => {
        playHubSound('click');
        // REFACTORED: Close correctly
        chatPanel.classList.remove("chat-panel-open");
        setTimeout(() => {
            if (!chatPanel.classList.contains("chat-panel-open")) {
                chatPanel.classList.add("hidden");
            }
        }, 230);
    });

    const sendMessage = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        
        if (!window.SystemAuth || !window.SystemAuth.isLoggedIn()) {
            alert("You must be signed in to use the Global Chat.");
            return;
        }
        
        if (!navigator.onLine || !window.dbUpdate || !window.dbRef || !window.db) {
            alert("You must be online to chat.");
            return;
        }

        const profile = window.SystemProfile.getProfile();
        const username = profile.name;
        const avatar = profile.avatar || "👤";
        const chatColor = profile.chatColor || "#ffffff";
        const isDev = profile.isDev || false;
        
        const msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        const payload = {
            text: text,
            username: username,
            avatar: avatar,
            isDev: isDev,
            chatColor: chatColor,
            timestamp: Date.now()
        };
        
        window.dbUpdate(window.dbRef(window.db, `global_chat/${msgId}`), payload).catch(e => console.error("Chat send failed", e));
        chatInput.value = "";
        playHubSound('click');
    };

    sendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    });

    // Bootloader to wait for Firebase to initialize
    let chatBooted = false;
    const chatWaitInterval = setInterval(() => {
        if (window.hubFirebaseReady && typeof window.db !== 'undefined' && typeof window.dbOnValue !== 'undefined') {
            clearInterval(chatWaitInterval);
            if (chatBooted) return;
            chatBooted = true;
            
            const chatRef = window.dbRef(window.db, 'global_chat');
            window.dbOnValue(chatRef, (snapshot) => {
                const data = snapshot.val();
                if (!data) return;

                const msgs = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
                const recentMsgs = msgs.slice(-50); // Keep only the latest 50 messages
                
                const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;

                messagesContainer.innerHTML = recentMsgs.map(msg => {
                    const date = new Date(msg.timestamp);
                    const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const nameClass = msg.isDev ? "chat-username dev-name" : "chat-username";
                    const nameColor = msg.chatColor || (msg.isDev ? '' : '#ffffff');
                    const nameStyle = msg.isDev ? '' : `color: ${nameColor};`;
                    
                    // Basic sanitize to prevent code injection
                    const safeText = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    
                    return `
                        <div class="chat-msg">
                            <div class="chat-avatar">${msg.avatar || '👤'}</div>
                            <div class="chat-content">
                                <div class="chat-meta">
                                    <span class="${nameClass}" style="${nameStyle}">${msg.username}</span>
                                    <span class="chat-time">${timeStr}</span>
                                </div>
                                <div class="chat-text">${safeText}</div>
                            </div>
                        </div>
                    `;
                }).join('');

                if (isAtBottom || !chatPanel.classList.contains("chat-panel-open")) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            });
        }
    }, 200);
}

function wireLeaderboards() {
    const lbBtns = document.querySelectorAll(".btn-leaderboards");
    const modalLb = document.getElementById("modal-leaderboards");
    const closeLb = document.getElementById("close-lb-btn");
    const lbTabs = document.querySelectorAll(".lb-tab");
    const lbList = document.getElementById("lb-list");
    const lbLoading = document.getElementById("lb-loading");

    let currentSort = "bankroll";
    let cachedUsers = [];

    const renderLb = () => {
        lbList.innerHTML = "";
        let sorted = [...cachedUsers];

        if (currentSort === "bankroll") {
            sorted.sort((a, b) => (b.profile?.bankroll || 0) - (a.profile?.bankroll || 0));
        } else if (currentSort === "level") {
            // Sort by exact XP
            sorted.sort((a, b) => (b.profile?.xp || 0) - (a.profile?.xp || 0));
        } else if (currentSort === "wins") {
            sorted.sort((a, b) => {
                const aWins = a.stats?.wins || a.profile?.wins || 0;
                const bWins = b.stats?.wins || b.profile?.wins || 0;
                return bWins - aWins;
            });
        }

        // Take top 50 to prevent crazy lag
        sorted = sorted.slice(0, 50);

        sorted.forEach((u, index) => {
            const rank = index + 1;
            let rankHtml = `<span class="lb-rank">${rank}</span>`;
            if (rank === 1) rankHtml = `<span class="lb-rank lb-rank-1">🥇</span>`;
            else if (rank === 2) rankHtml = `<span class="lb-rank lb-rank-2">🥈</span>`;
            else if (rank === 3) rankHtml = `<span class="lb-rank lb-rank-3">🥉</span>`;

            let statText = "";
            if (currentSort === "bankroll") {
                statText = `$${(u.profile?.bankroll || 0).toLocaleString()}`;
            } else if (currentSort === "level") {
                statText = `Lv.${u.profile?.level || 1} <span style="font-size:0.6rem; color:#aaa;">(${u.profile?.xp || 0} XP)</span>`;
            } else if (currentSort === "wins") {
                statText = `${u.stats?.wins || u.profile?.wins || 0} Wins`;
            }

            const name = u.profile?.name || "Unknown";
            const avatar = u.profile?.avatar || "👤";

            const row = document.createElement("div");
            row.className = "lb-row";
            row.innerHTML = `
                ${rankHtml}
                <div class="lb-avatar">${avatar}</div>
                <div class="lb-name">${name}</div>
                <div class="lb-stat" style="color: ${currentSort==='bankroll' ? '#2ecc71' : currentSort==='level' ? '#f1c40f' : '#3498db'};">${statText}</div>
            `;
            lbList.appendChild(row);
        });
    };

    const fetchAndRender = async () => {
        lbLoading.classList.remove("hidden");
        lbList.classList.add("hidden");
        
        if (!navigator.onLine || !window.dbGet || !window.dbRef || !window.db) {
            lbLoading.innerText = "Leaderboards require an internet connection.";
            return;
        }

        try {
            const snap = await window.dbGet(window.dbRef(window.db, "users"));
            if (snap.exists()) {
                const data = snap.val();
                cachedUsers = Object.values(data);
                lbLoading.classList.add("hidden");
                lbList.classList.remove("hidden");
                renderLb();
            } else {
                lbLoading.innerText = "No players found.";
            }
        } catch(e) {
            lbLoading.innerText = "Failed to fetch rankings.";
        }
    };

    lbBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            playHubSound('click');
            if (modalLb) modalLb.classList.remove("hidden");
            fetchAndRender();
        });
    });

    if (closeLb) closeLb.addEventListener("click", () => {
        playHubSound('click');
        if (modalLb) modalLb.classList.add("hidden");
    });

    lbTabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            playHubSound('click');
            lbTabs.forEach(t => t.classList.remove("active"));
            e.target.classList.add("active");
            currentSort = e.target.dataset.sort;
            renderLb();
        });
    });
}

function renderStore() {
    if (!window.SystemStore) return;
    const profile = window.SystemProfile.getProfile();
    const balDisplay = document.getElementById('store-balance-display');
    if (balDisplay) balDisplay.innerText = `$${profile.bankroll.toLocaleString()}`;
    
    const tabsConfig = {
        'store-tab-profile': ['avatar', 'color'],
        'store-tab-table': ['deck', 'cardback', 'dice'],
        'store-tab-misc': ['title']
    };

    for (const [tabId, types] of Object.entries(tabsConfig)) {
        const container = document.getElementById(tabId);
        if (!container) continue;
        container.innerHTML = '';
        
        const items = Object.values(SystemStore.CATALOG).filter(i => types.includes(i.type));
        items.forEach(item => {
            const owned = SystemStore.ownsItem(item.id);
            const div = document.createElement('div');
            div.className = `store-item ${owned ? 'owned' : ''}`;
            
            let iconHtml = '';
            if (item.type === 'avatar') iconHtml = `<div class="store-icon" style="font-size:2.5rem;">${item.value}</div>`;
            else if (item.type === 'color') iconHtml = `<div class="store-icon"><div class="color-preview" style="background:${item.value}"></div></div>`;
            else if (item.type === 'cardback') iconHtml = `<div class="store-icon"><img src="system/images/cards/standard/${item.value}" /></div>`;
            else if (item.type === 'deck') iconHtml = `<div class="store-icon" style="font-size:2.5rem;">🃏</div>`;
            else if (item.type === 'dice') iconHtml = `<div class="store-icon" style="font-size:2.5rem;">🎲</div>`;
            else if (item.type === 'title') iconHtml = `<div class="store-icon" style="font-size:2rem;">📜</div>`;
            
            let actionHtml = '';
            if (owned) {
                const loadout = window.SystemProfile.getLoadout ? window.SystemProfile.getLoadout() : {};
                const isEquipped = loadout[item.type] === item.id;
                if (isEquipped) {
                    actionHtml = `<button class="btn-equip hub-interactive" disabled style="background:#2ecc71; color:#000; border:none; font-weight:bold; cursor:default; padding:8px; border-radius:4px; width:100%;">✓ EQUIPPED</button>`;
                } else {
                    actionHtml = `<button class="btn-equip hub-interactive" data-type="${item.type}" data-id="${item.id}" style="background:transparent; color:#f1c40f; border:1px solid #f1c40f; font-weight:bold; cursor:pointer; padding:8px; border-radius:4px; width:100%;">EQUIP</button>`;
                }
            } else {
                actionHtml = `<button class="btn-buy hub-interactive" data-id="${item.id}">$${item.price.toLocaleString()}</button>`;
            }
            
            div.innerHTML = `
                ${iconHtml}
                <div class="store-name">${item.name}</div>
                <div class="store-desc">${item.desc}</div>
                ${actionHtml}
            `;
            container.appendChild(div);
        });
    }
    
    document.querySelectorAll('.btn-buy').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            playHubSound('click');
            const id = e.target.dataset.id;
            if (!window.SystemStore.ownsItem(id)) {
                const originalText = e.target.innerText;
                e.target.innerText = "...";
                e.target.disabled = true;
                const res = await window.SystemStore.buyItem(id);
                if (res.ok) {
                    playHubSound('win');
                    renderStore(); // Re-render to show OWNED stamp and new balance
                } else {
                    alert(res.error);
                    e.target.innerText = originalText;
                    e.target.disabled = false;
                }
            }
        });
    });

    document.querySelectorAll('.btn-equip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.disabled) return;
            playHubSound('click');
            const id = e.target.dataset.id;
            const type = e.target.dataset.type;
            if (window.SystemProfile && window.SystemProfile.setLoadout) {
                window.SystemProfile.setLoadout(type, id);
                renderStore(); 
            }
        });
    });
}

function wireStore() {
    const storeBtns = document.querySelectorAll(".btn-store");
    const modalStore = document.getElementById("modal-store");
    const closeStore = document.getElementById("close-store-btn");
    const storeTabs = document.querySelectorAll(".store-tab");

    storeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            playHubSound('click');
            if (!window.SystemAuth || !window.SystemAuth.isLoggedIn()) {
                const modalLogin = document.getElementById('modal-login');
                if (modalLogin) modalLogin.classList.remove('hidden');
                return;
            }
            if (modalStore) {
                modalStore.classList.remove("hidden");
                renderStore();
            }
        });
    });

    if (closeStore) closeStore.addEventListener("click", () => {
        playHubSound('click');
        if (modalStore) modalStore.classList.add("hidden");
    });

    storeTabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            playHubSound('click');
            storeTabs.forEach(t => t.classList.remove("active"));
            e.target.classList.add("active");
            
            document.querySelectorAll(".store-grid").forEach(g => g.classList.add("hidden"));
            const targetGrid = document.getElementById(e.target.dataset.tab);
            if (targetGrid) targetGrid.classList.remove("hidden");
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Inject Dev/Logout buttons into the banner if they don't exist
    const bannerActions = document.querySelector(".profile-right");
    if (bannerActions && !document.getElementById("sys-dev-btn")) {
        const devBtnHTML = `<button id="sys-dev-btn" class="sys-btn dev-only" style="background:#f1c40f; color:#000; border:none; margin-bottom:10px;">🛠️ DEV TOOLS</button>`;
        const logoutBtnHTML = `<button id="sys-logout-btn" class="sys-btn-logout dev-only">LOGOUT</button>`;
        bannerActions.insertAdjacentHTML('afterbegin', logoutBtnHTML);
        bannerActions.insertAdjacentHTML('afterbegin', devBtnHTML);

        document.getElementById("sys-dev-btn").addEventListener("click", openDevMenu);
        document.getElementById("sys-logout-btn").addEventListener("click", systemLogout);
    }

    const confirmLogoutBtn = document.getElementById("btn-confirm-logout");
    const cancelLogoutBtn = document.getElementById("btn-cancel-logout");
    
    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener("click", () => {
            playHubSound('click');
            document.getElementById("modal-logout").classList.add("hidden");
        });
    }
    
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            playHubSound('click');
            document.getElementById("modal-logout").classList.add("hidden");
            if (window.SystemAuth && window.SystemAuth.isLoggedIn()) {
                SystemAuth.logout();
            } else {
                SystemProfile.data.isDev = false;
                SystemProfile.data.name = "Player";
                SystemProfile.saveProfile();
            }
            updateBonusUI();
            window.location.reload();
        });
    }

    const syncBtn = document.getElementById("btn-cloud-sync");
    if (syncBtn) {
        syncBtn.addEventListener("click", async () => {
            playHubSound('click');
            const originalText = syncBtn.innerHTML;
            syncBtn.innerHTML = "⏳ SYNCING...";
            syncBtn.disabled = true;
            
            if (window.SystemAuth && typeof window.SystemAuth.forceSync === 'function') {
                const res = await SystemAuth.forceSync();
                alert(res.message || res.error);
                updateBonusUI();
                if (typeof openProfilePanel === 'function') openProfilePanel(); // refresh panel stats
            } else {
                alert("Cloud Sync is not available.");
            }
            
            syncBtn.innerHTML = originalText;
            syncBtn.disabled = false;
        });
    }

    wireAuthModals();
    wireDevModal();
    wireProfileEdit();
    wireBugReporter();
    wireGlobalChat();
    wireLeaderboards();
    wireStore();
    setTimeout(updateBonusUI, 0);
    
    // If the Event Emitter is ready, listen for future money changes
    if (window.SystemUI && typeof window.SystemUI.on === 'function') {
        window.SystemUI.on("money_changed", updateBonusUI);
    }

    // Global Escape key listener to close active modals
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const modalsToClose = [
                "modal-login", "modal-register", "modal-forgot-password",
                "modal-dev-tools", "modal-logout", "achievements-modal",
                "modal-edit-profile", "modal-bug-report", "modal-leaderboards",
                "modal-store"
            ];
            modalsToClose.forEach(id => {
                const m = document.getElementById(id);
                if (m && !m.classList.contains("hidden")) {
                    m.classList.add("hidden");
                }
            });
            
            const lpOverlay = document.getElementById("launch-panel-overlay");
            if (lpOverlay && !lpOverlay.classList.contains("lp-hidden")) {
                lpOverlay.classList.add("lp-hidden");
            }

            const chatPanel = document.getElementById("chat-panel");
            // REFACTORED: Close correctly
            if (chatPanel && chatPanel.classList.contains("chat-panel-open")) {
                chatPanel.classList.remove("chat-panel-open");
                setTimeout(() => {
                    if (!chatPanel.classList.contains("chat-panel-open")) {
                        chatPanel.classList.add("hidden");
                    }
                }, 230);
            }

            if (typeof closeProfilePanel === 'function') closeProfilePanel();
        }
    });
});

bonusBtn.addEventListener("click", () => {
    if (bonusBtn.disabled) return;
    if (window.SystemAuth && !window.SystemAuth.isLoggedIn()) return;
    playHubSound('click');
    if (window.SystemRewards) {
        // This will launch the new AAA reward modal
        SystemRewards.checkDailyLogin(); 
    }
});

// --- 3. THEME LOGIC ---
const savedTheme = localStorage.getItem('shack_theme') || 'default';

// Made global so the onclick attribute in HTML can find it
window.changeTheme = function(theme) {
  document.body.className = ''; 
  if (theme !== 'default') document.body.classList.add('theme-' + theme);
  localStorage.setItem('shack_theme', theme);
  const themeSelect = document.getElementById('theme-dropdown');
  if (themeSelect) themeSelect.value = theme;
};

changeTheme(savedTheme);

// --- 4. CAROUSEL, SEARCH & CATEGORY LOGIC ---
const searchInput = document.getElementById('game-search');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const dotsContainer = document.getElementById('pagination-dots');
const grid = document.getElementById('game-grid');
const catBtns = document.querySelectorAll('.cat-btn');

let allCards = [];
let currentPage = parseInt(localStorage.getItem('hub_current_page')) || 1;
const itemsPerPage = 6;
let filteredCards = [];
let currentCategory = 'all';

function renderCarousel() {
    const totalPages = Math.ceil(filteredCards.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    localStorage.setItem('hub_current_page', currentPage);

    allCards.forEach(card => card.style.display = 'none');

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const visibleNow = filteredCards.slice(start, end);

    visibleNow.forEach(card => card.style.display = 'flex');

    // Show category headers only if at least one card in that category is visible on this page
    document.querySelectorAll('.cat-section-header').forEach(header => {
        const cat = header.dataset.cat;
        const hasVisible = visibleNow.some(card => card.dataset.cat === cat);
        header.style.display = hasVisible ? '' : 'none';
    });

    prevBtn.style.visibility = currentPage === 1 ? 'hidden' : 'visible';
    nextBtn.style.visibility = currentPage === totalPages ? 'hidden' : 'visible';

    dotsContainer.innerHTML = '';
    for(let i = 1; i <= totalPages; i++) {
        const dot = document.createElement('div');
        dot.className = `dot ${i === currentPage ? 'active' : ''}`;
        dot.onclick = () => { playHubSound('click'); currentPage = i; renderCarousel(); };
        dotsContainer.appendChild(dot);
    }
}

function applyFilters() {
    const term = searchInput.value.toLowerCase();
    filteredCards = allCards.filter(card => {
        const nameMatch = card.querySelector('h2').innerText.toLowerCase().includes(term);
        const tagsMatch = (card.dataset.name || "").includes(term);
        const searchMatch = nameMatch || tagsMatch;
        
        let catMatch = true;
        if (currentCategory !== 'all') {
            const badgesText = card.querySelector('.card-badges').innerText.toLowerCase();
            catMatch = badgesText.includes(currentCategory);
        }
        
        return searchMatch && catMatch;
    });
    currentPage = 1;
    renderCarousel();
}

if(searchInput) searchInput.addEventListener('input', applyFilters);

catBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        catBtns.forEach(b => b.classList.remove('active-cat'));
        e.target.classList.add('active-cat');
        currentCategory = e.target.dataset.filter;
        applyFilters();
    });
});

if(prevBtn) prevBtn.addEventListener('click', () => { currentPage--; renderCarousel(); });
if(nextBtn) nextBtn.addEventListener('click', () => { currentPage++; renderCarousel(); });

let touchStartX = 0;
let touchEndX = 0;
if(grid) {
    grid.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    grid.addEventListener('touchend', e => { 
        touchEndX = e.changedTouches[0].screenX; 
        handleSwipe(); 
    }, {passive: true});
}

function handleSwipe() {
    const swipeThreshold = 50; 
    if (touchEndX < touchStartX - swipeThreshold) {
        if (currentPage < Math.ceil(filteredCards.length / itemsPerPage)) {
            playHubSound('click'); currentPage++; renderCarousel();
        }
    }
    if (touchEndX > touchStartX + swipeThreshold) {
        if (currentPage > 1) {
            playHubSound('click'); currentPage--; renderCarousel();
        }
    }
}

// --- 5. FAVORITES LOGIC ---
let favorites = JSON.parse(localStorage.getItem('hub_favorites')) || [];

function toggleFavorite(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (favorites.includes(id)) {
        favorites = favorites.filter(f => f !== id);
    } else {
        favorites.push(id);
    }
    localStorage.setItem('hub_favorites', JSON.stringify(favorites));
    renderFavorites();
    updateStarIcons();
}

function renderFavorites() {
    const bar = document.getElementById('favorites-bar');
    bar.innerHTML = '';
    if (favorites.length === 0) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    favorites.forEach(id => {
        const card = allCards.find(c => c.dataset.id === id);
        if(card) {
            const iconUrl = card.querySelector('.card-icon').style.backgroundImage;
            const url = card.getAttribute('href');
            const name = card.querySelector('h2').innerText;
            const a = document.createElement('a');
            a.href = url;
            a.className = 'fav-shortcut hub-interactive';
            a.innerHTML = `<div class="fav-shortcut-icon" style="background-image: ${iconUrl}"></div><span>${name}</span>`;
            // Route through launch panel instead of direct iframe load
            a.addEventListener('click', (e) => {
                e.preventDefault();
                openLaunchPanel(card);
            });
            bar.appendChild(a);
        }
    });
}

function updateStarIcons() {
    allCards.forEach(card => {
        const id = card.dataset.id;
        const star = card.querySelector('.fav-btn');
        if(favorites.includes(id)) {
            star.innerHTML = '★';
            star.classList.add('is-fav');
        } else {
            star.innerHTML = '☆';
            star.classList.remove('is-fav');
        }
    });
}

// --- 6. TROPHY ROOM (ACHIEVEMENTS VIEWER) ---
const btnAchievements = document.getElementById("btn-achievements");
const modalAchievements = document.getElementById("achievements-modal");
const closeAchBtn = document.getElementById("close-ach-btn");
const achList = document.getElementById("ach-list");

function renderTrophyRoom() {
    if (!window.SystemAchievements) return;
    
    // Force a fresh sync from local storage
    if (typeof window.SystemAchievements.loadData === 'function') {
        window.SystemAchievements.loadData();
    }
    
    achList.innerHTML = "";
    const list = SystemAchievements.list;
    const unlockedIds = SystemAchievements.data.unlocked;
    
    let unlockedCount = 0;
    const totalCount = Object.keys(list).length;

    // Loop through every achievement in the system
    Object.keys(list).forEach(key => {
        const ach = list[key];
        const isUnlocked = unlockedIds.includes(key);
        if (isUnlocked) unlockedCount++;

        const card = document.createElement("div");
        card.className = `ach-card ${isUnlocked ? 'unlocked' : 'locked'}`;
        
        card.innerHTML = `
            <div class="ach-icon">${isUnlocked ? ach.icon : '🔒'}</div>
            <div class="ach-info">
                <div class="ach-title">${ach.name}</div>
                <div class="ach-desc">${ach.desc}</div>
                <div class="ach-rewards">
                    <span class="ach-rxp">+${ach.xp} XP</span>
                    <span class="ach-rmoney">+$${ach.chips}</span>
                </div>
            </div>
            ${isUnlocked ? '<div style="color: #f1c40f; font-size: 1.5rem; font-weight: bold;">✓</div>' : ''}
        `;
        achList.appendChild(card);
    });

    document.getElementById("ach-count").innerText = `${unlockedCount} / ${totalCount} Unlocked`;
}

if (btnAchievements) {
    btnAchievements.addEventListener("click", () => {
        playHubSound('click');
        renderTrophyRoom();
        modalAchievements.classList.remove("hidden");
    });
}

if (closeAchBtn) {
    closeAchBtn.addEventListener("click", () => {
        playHubSound('click');
        modalAchievements.classList.add("hidden");
    });
}

// --- 7. IFRAME GAME LOADER (message listener) ---
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CASINO_OS_CLOSE_GAME') {
        
        // 🐛 MOBILE BUG FIX: Ensure the parent window also drops fullscreen
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(()=>{});
        } else if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen().catch(()=>{});
        }

        const container = document.getElementById('os-game-container');
        const frame = document.getElementById('os-game-frame');

        // Hide the iframe and clear the source to stop the game processes
        // NOTE: save the URL BEFORE clearing frame.src — it will be '' immediately after
        const closingFrameUrl = frame.src || '';
        container.style.display = 'none';
        frame.src = '';

        // Force the Hub to re-read localStorage so stats & achievements from the iframe sync instantly
        // CRITICAL FIX: Save the new data back to the user's auth account immediately
        if (window.SystemProfile) window.SystemProfile.loadProfile();
        if (window.SystemAuth) window.SystemAuth.saveCurrentUserData(); 
        if (window.SystemStats) window.SystemStats.loadData();
        if (window.SystemAchievements) window.SystemAchievements.loadData();

        // Update the Hub UI so new XP and Money instantly reflect
        if (typeof updateBonusUI === 'function') updateBonusUI();
        renderRecentlyPlayed();

        // Delete waiting rooms for the game that just closed so they never pile up in Firebase
        if (window.db && window.dbGet && window.dbRemove && window.dbRef) {
            const frameUrl = closingFrameUrl;
            const closingGame = rawGameData.find(g => frameUrl.includes(g.url.split('/').pop()));
            console.log('[Hub] Close game fired. frameUrl:', frameUrl);
            console.log('[Hub] Matched game:', closingGame ? closingGame.id : 'NONE');
            console.log('[Hub] roomPath:', closingGame ? closingGame.roomPath : 'N/A');
            if (closingGame && closingGame.roomPath) {
                const roomsRef = window.dbRef(window.db, closingGame.roomPath);
                window.dbGet(roomsRef).then(snap => {
                    const rooms = snap.val();
                    console.log('[Hub] Rooms found at', closingGame.roomPath, ':', rooms ? Object.keys(rooms).length : 0);
                    if (!rooms) return;
                    Object.keys(rooms).forEach(code => {
                        console.log('[Hub] Room', code, 'status:', rooms[code].status);
                        if (rooms[code].status === 'waiting') {
                            console.log('[Hub] Deleting room:', code);
                            window.dbRemove(window.dbRef(window.db, `${closingGame.roomPath}/${code}`));
                        }
                    });
                }).catch(err => { console.error('[Hub] dbGet error:', err); });
            } else {
                console.warn('[Hub] Skipping room cleanup — no closingGame or no roomPath');
            }
        } else {
            console.warn('[Hub] Skipping room cleanup — Firebase not ready. db:', !!window.db, 'dbGet:', !!window.dbGet, 'dbRemove:', !!window.dbRemove);
        }
    }
});

// --- 8. PLAYER PROFILE PANEL ---
function openProfilePanel() {
    if (!window.SystemProfile || !window.SystemStats || !window.SystemAchievements) return;

    // Force sync before building the panel
    if (window.SystemProfile.loadProfile) window.SystemProfile.loadProfile();
    if (window.SystemStats.loadData) window.SystemStats.loadData();
    if (window.SystemAchievements.loadData) window.SystemAchievements.loadData();

    const profile = SystemProfile.getProfile();
    const globalStats = SystemStats.getStats();
    const unlockedAchs = SystemAchievements.data.unlocked;
    const achList = SystemAchievements.list;

    // Header
    document.getElementById('pp-name').innerText = profile.name;
    const ppAvatar = document.getElementById('pp-avatar');
    if (ppAvatar) ppAvatar.innerText = profile.avatar || "👤";
    
    // Custom purchased titles vs fallback
    const ppTitle = document.getElementById('pp-title');
    if (ppTitle) {
        if (profile.title && profile.title !== "Newcomer") {
            ppTitle.innerText = profile.title;
        } else {
            ppTitle.innerText = SystemProfile.getLevelTitle ? SystemProfile.getLevelTitle() : "Newcomer";
        }
    }

    document.getElementById('pp-level').innerText = `Lv.${profile.level}`;
    document.getElementById('pp-money').innerText = `$${profile.bankroll.toLocaleString()}`;

    // XP bar
    const thresholds = [0, 500, 2000, 5000, 10000, 25000];
    const nextXP = thresholds[profile.level] || 25000;
    const prevXP = thresholds[profile.level - 1] || 0;
    const pct = profile.level >= 6 ? 100 : Math.min(100, ((profile.xp - prevXP) / (nextXP - prevXP)) * 100);
    document.getElementById('pp-xp-fill').style.width = pct + '%';
    document.getElementById('pp-xp-text').innerText = profile.level >= 6 ? 'MAX' : `${profile.xp} / ${nextXP} XP`;

    // Career stats
    const played = globalStats ? globalStats.gamesPlayed : 0;
    const wins   = globalStats ? globalStats.wins : 0;
    const losses = globalStats ? globalStats.losses : 0;
    const wr     = played > 0 ? Math.round((wins / played) * 100) + '%' : '—';
    document.getElementById('pp-played').innerText  = played;
    document.getElementById('pp-wins').innerText    = wins;
    document.getElementById('pp-losses').innerText  = losses;
    document.getElementById('pp-winrate').innerText = wr;

    // Achievements
    const achRow = document.getElementById('pp-ach-row');
    achRow.innerHTML = '';
    unlockedAchs.slice(0, 8).forEach(id => {
        const ach = achList[id];
        if (!ach) return;
        const span = document.createElement('span');
        span.className = 'pp-ach-icon';
        span.title = ach.name;
        span.innerText = ach.icon;
        achRow.appendChild(span);
    });
    document.getElementById('pp-ach-count').innerText =
        `${unlockedAchs.length} / ${Object.keys(achList).length} unlocked`;

    // Top games by wins
    const gamesData = SystemStats.data.games;
    const topGames = Object.entries(gamesData)
        .filter(([, s]) => s.gamesPlayed > 0)
        .sort(([, a], [, b]) => b.wins - a.wins)
        .slice(0, 5);

    const topGamesEl = document.getElementById('pp-top-games');
    topGamesEl.innerHTML = '';
    if (topGames.length === 0) {
        topGamesEl.innerHTML = '<div class="pp-no-games">No games played yet</div>';
    } else {
        topGames.forEach(([id, s]) => {
            const card = allCards.find(c => c.dataset.id === id);
            const name = card ? card.querySelector('h2').innerText : id;
            const row = document.createElement('div');
            row.className = 'pp-game-row';
            row.innerHTML = `
                <span class="pp-game-name">${name}</span>
                <span class="pp-game-stats">🏆 ${s.wins} &nbsp;·&nbsp; 🎮 ${s.gamesPlayed}</span>
            `;
            topGamesEl.appendChild(row);
        });
    }

    // Show panel
    document.getElementById('profile-panel-overlay').classList.remove('hidden');
    document.getElementById('profile-panel').classList.remove('hidden');
}

function closeProfilePanel() {
    document.getElementById('profile-panel-overlay').classList.add('hidden');
    document.getElementById('profile-panel').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    const nameEl = document.getElementById('display-player-name');
    if (nameEl) nameEl.addEventListener('click', () => { playHubSound('click'); openProfilePanel(); });

    const closeBtn = document.getElementById('pp-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { playHubSound('click'); closeProfilePanel(); });

    const overlay = document.getElementById('profile-panel-overlay');
    if (overlay) overlay.addEventListener('click', closeProfilePanel);
});

// --- 8. RECENTLY PLAYED ---
const RECENT_KEY = 'hub_recently_played';
const RECENT_MAX = 5;

function getRecentlyPlayed() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch(e) { return []; }
}

function addRecentlyPlayed(gameId) {
    let recent = getRecentlyPlayed();
    recent = recent.filter(id => id !== gameId);
    recent.unshift(gameId);
    if (recent.length > RECENT_MAX) recent = recent.slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function renderRecentlyPlayed() {
    const bar = document.getElementById('recently-played-bar');
    if (!bar) return;
    const recent = getRecentlyPlayed();
    if (recent.length === 0) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    const list = bar.querySelector('.rp-list');
    if (!list) return;
    list.innerHTML = '';
    recent.forEach(id => {
        const card = allCards.find(c => c.dataset.id === id);
        if (!card) return;
        const iconUrl = card.querySelector('.card-icon').style.backgroundImage;
        const url = card.getAttribute('href');
        const name = card.querySelector('h2').innerText;
        const chip = document.createElement('a');
        chip.href = url;
        chip.className = 'rp-chip hub-interactive';
        chip.dataset.recentId = id;
        chip.innerHTML = `<div class="rp-icon" style="background-image:${iconUrl}"></div><span>${name}</span>`;
        list.appendChild(chip);
    });
    // Wire rp chip clicks through the launch panel
    list.querySelectorAll('.rp-chip').forEach(chip => {
        chip.addEventListener('click', function(e) {
            e.preventDefault();
            const id = this.dataset.recentId;
            const card = allCards.find(c => c.dataset.id === id);
            if (card) openLaunchPanel(card);
        });
    });
}

// --- 9. LAUNCH PANEL ---
function launchGame(gameUrl) {
    const frame = document.getElementById('os-game-frame');
    const container = document.getElementById('os-game-container');
    frame.src = gameUrl;
    container.style.display = 'block';
}

function openLaunchPanel(cardEl) {
    playHubSound('click');
    const gameUrl  = cardEl.getAttribute('href');
    const gameName = cardEl.querySelector('h2').innerText;
    const iconStyle = cardEl.querySelector('.card-icon').style.backgroundImage;
    const hasOnline = cardEl.querySelector('.b-online') !== null;
    const gameId   = cardEl.dataset.id;
    const gameData = rawGameData.find(g => g.id === gameId);
    const iconParam = gameData ? '&icon=' + encodeURIComponent(gameData.icon) : '';

    // Build or reuse overlay
    let overlay = document.getElementById('launch-panel-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'launch-panel-overlay';
        document.body.appendChild(overlay);
    }

    const onlineBtn = hasOnline ? `
        <button class="lp-btn lp-btn-online" id="lp-btn-online">
            👥 Play Online
        </button>` : '';

    overlay.innerHTML = `
        <div class="lp-box">
            <button class="lp-close" id="lp-close">&times;</button>
            <div class="lp-icon" style="background-image:${iconStyle}"></div>
            <div class="lp-title">${gameName}</div>
            <div class="lp-buttons">
                <button class="lp-btn lp-btn-solo" id="lp-btn-solo">🎮 Solo / AI</button>
                ${onlineBtn}
            </div>
        </div>
    `;
    overlay.classList.remove('lp-hidden');

    document.getElementById('lp-close').addEventListener('click', () => {
        overlay.classList.add('lp-hidden');
    });
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.add('lp-hidden');
    });

    document.getElementById('lp-btn-solo').addEventListener('click', () => {
        overlay.classList.add('lp-hidden');
        addRecentlyPlayed(gameId);
        launchGame(gameUrl + '?solo=1' + iconParam);
    });

    if (hasOnline) {
        document.getElementById('lp-btn-online').addEventListener('click', () => {
            if (window.SystemAuth && !window.SystemAuth.isLoggedIn()) {
                overlay.classList.add('lp-hidden');
                const modalLogin = document.getElementById('modal-login');
                if (modalLogin) modalLogin.classList.remove('hidden');
                return;
            }
            overlay.classList.add('lp-hidden');
            addRecentlyPlayed(gameId);
            launchGame(gameUrl + '?mode=online' + iconParam);
        });
    }
}

// --- 10. CARD GENERATION FROM games.json ---
let rawGameData = []; // Store raw json for the scanner

async function initCards() {
    let games = [];
    try {
        // Cache buster so Netlify doesn't serve a stale games.json
        const res = await fetch('games.json?v=' + Date.now());
        games = await res.json();
        rawGameData = games;
    } catch(e) {
        console.error('Game Shack: Failed to load games.json', e);
        return;
    }

    // Group games by category for Steam-style section headers
    const categoryLabels = {
        'board':  '🎲 Board Games',
        'casino': '🃏 Casino',
        'card':   '🂡 Card Games',
        'arcade': '🕹 Arcade'
    };
    const grouped = {};
    games.forEach(game => {
        const cat = game.category || 'board';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(game);
    });

    // Render each category group with a header
    Object.entries(grouped).forEach(([cat, catGames]) => {
        // Section header — sits outside the grid, spans full width
        const header = document.createElement('div');
        header.className = 'cat-section-header';
        header.dataset.cat = cat;
        header.innerText = categoryLabels[cat] || cat.toUpperCase();
        grid.appendChild(header);

        catGames.forEach(game => {
            const iconStyle = game.iconStyle ? ` ${game.iconStyle}` : '';
            const badgesHTML = game.badges.map(b => {
                const cls = b.includes('Online') ? 'b-online' : b.includes('Solo') ? 'b-solo' : '';
                return `<span class="badge ${cls}">${b}</span>`;
            }).join(' ');

            const stats = (window.SystemStats) ? window.SystemStats.getStats(game.id) : null;
            const wins   = stats ? stats.wins : 0;
            const played = stats ? stats.gamesPlayed : 0;

            const a = document.createElement('a');
            a.href = game.url;
            a.className = 'game-card hub-interactive';
            a.dataset.id = game.id;
            a.dataset.name = game.searchTags;
            a.dataset.cat = game.category;
            a.innerHTML = `
                <div class="fav-btn hub-interactive">☆</div>
                <div class="card-icon" style="background-image: url('${game.icon}');${iconStyle}"></div>
                <h2>${game.name}</h2>
                <div class="card-badges">${badgesHTML}</div>
                <div class="card-stats">
                    <span class="card-stat">🏆 ${wins}</span>
                    <span class="card-stat-sep">·</span>
                    <span class="card-stat">🎮 ${played}</span>
                </div>
                <div class="card-play-btn">▶ PLAY</div>
            `;
            grid.appendChild(a);
        });
    });

    // Rebuild allCards from the now-populated DOM
    allCards = Array.from(document.querySelectorAll('.game-card'));
    filteredCards = [...allCards];

    // Wire hub click sound to each new card
    allCards.forEach(card => {
        card.addEventListener('click', () => playHubSound('click'));
    });

    // Wire fav star buttons
    allCards.forEach(card => {
        const star = card.querySelector('.fav-btn');
        if (star) {
            star.addEventListener('click', (e) => toggleFavorite(card.dataset.id, e));
        }
    });

    // Wire card clicks to launch panel instead of direct iframe load
    allCards.forEach(card => {
        card.addEventListener('click', function(e) {
            e.preventDefault();
            openLaunchPanel(this);
        });
    });

    // Initial render
    renderFavorites();
    updateStarIcons();
    renderRecentlyPlayed();
    renderCarousel();
    
    // Boot the live multiplayer scanner after cards exist.
    // Firebase is a type="module" script which runs AFTER regular scripts.
    // We wait for window.hubFirebaseReady (set by the module) before scanning.
    // Retry every 100ms for up to 5 seconds.
    let dbWaitAttempts = 0;
    const dbWaitInterval = setInterval(() => {
        dbWaitAttempts++;
        if (window.hubFirebaseReady === true && typeof window.db !== 'undefined' && typeof window.dbOnValue !== 'undefined') {
            clearInterval(dbWaitInterval);
            scanActiveMatches();
        } else if (dbWaitAttempts >= 50) {
            clearInterval(dbWaitInterval);
            console.warn('Game Shack: Firebase not ready after 5s — live scanner skipped.');
        }
    }, 100);
}

initCards();

// --- 11. LIVE MULTIPLAYER SCANNER ---
let activeMatchesListeners = [];

function scanActiveMatches() {
    // Only run if Firebase is connected
    if (typeof window.db === 'undefined' || typeof window.dbRef === 'undefined') return;

    const bar = document.getElementById('active-matches-bar');
    const list = bar.querySelector('.am-list');

    // Clean up old listeners
    activeMatchesListeners.forEach(off => off());
    activeMatchesListeners = [];

    // Filter down to only games that have a known Firebase room path
    const onlineGames = rawGameData.filter(g => g.badges.includes("👥 Online") && g.roomPath);

    onlineGames.forEach(game => {
        const roomRef = window.dbRef(window.db, game.roomPath);
        
        const listener = window.dbOnValue(roomRef, (snapshot) => {
            const rooms = snapshot.val();
            if (!rooms) {
                removeMatchesForGame(game.id);
                return;
            }

            // Collect every roomCode that is currently active and joinable
            const THIRTY_MINS = 30 * 60 * 1000;
            const now = Date.now();
            const activeCodes = [];
            Object.keys(rooms).forEach(roomCode => {
                const roomData = rooms[roomCode];
                // Skip rooms older than 30 minutes — they are ghosts from abandoned sessions
                if (roomData.createdAt && (now - roomData.createdAt) > THIRTY_MINS) return;
                
                const isJoinable = roomData.status === "waiting" || roomData.status === "playing";
                const seats = roomData.seats || [];
                // Default hasOpenSeat to true for games that don't use a seats array (e.g. ttt)
                const hasOpenSeat = seats.length === 0 || seats.some(s => s && (s.type === 'ai' || s.type === 'empty' || s.type === 'open'));

                if (isJoinable && hasOpenSeat) {
                    activeCodes.push(roomCode);
                    // Try to grab the host's name safely depending on how the game stores it
                    let hostName = "Player";
                    if (seats[0] && seats[0].name) hostName = seats[0].name;
                    else if (roomData.p1Name) hostName = roomData.p1Name;
                    
                    const humanCount = seats.filter(s => s && s.type === 'human').length;
                    const totalSeats = Math.max(seats.length, 2);

                    upsertMatchChip(game, roomCode, hostName, humanCount, totalSeats);
                }
            });

            if (activeCodes.length === 0) {
                // No active joinable rooms at all — remove all chips for this game
                removeMatchesForGame(game.id);
            } else {
                // Remove chips for rooms that used to be joinable but no longer are
                const list = document.querySelector('.am-list');
                const staleChips = list.querySelectorAll(`.am-chip[data-game-id="${game.id}"]`);
                staleChips.forEach(chip => {
                    if (!activeCodes.includes(chip.dataset.roomCode)) {
                        chip.remove();
                    }
                });
                // Keep the bar visible as long as any chips remain
                const bar = document.getElementById('active-matches-bar');
                if (list.children.length === 0) bar.classList.add('hidden');
            }
        });
        
        activeMatchesListeners.push(listener);
    });
}

function upsertMatchChip(game, roomCode, hostName, humanCount, totalSeats) {
    const list = document.querySelector('.am-list');
    const bar = document.getElementById('active-matches-bar');
    // Key by game + roomCode — one chip per open room, exactly as intended
    const chipId = `am-chip-${game.id}-${roomCode}`;

    let chip = document.getElementById(chipId);
    if (!chip) {
        chip = document.createElement('a');
        chip.id = chipId;
        chip.className = 'rp-chip am-chip hub-interactive';
        chip.dataset.gameId = game.id;
        chip.dataset.roomCode = roomCode;
        list.appendChild(chip);
        bar.classList.remove('hidden');
    }

    // Set innerHTML first, then onclick — so the handler is always on the final element
    chip.innerHTML = `
        <div class="rp-icon" style="background-image:url('${game.icon}')"></div>
        <span class="am-host">${hostName}</span>
        <span style="color:#aaa;"> — ${game.name} <span style="color:#3498db; font-size:0.65rem; margin-left:4px; font-weight:bold;">(👤 ${humanCount}/${totalSeats})</span></span>
        <span class="am-join-tag">JOIN</span>
    `;

    chip.onclick = (e) => {
        e.preventDefault();
        playHubSound('win');
        addRecentlyPlayed(game.id);
        const chipIconParam = game.icon ? '&icon=' + encodeURIComponent(game.icon) : '';
        launchGame(`${game.url}?mode=online&join=${roomCode}${chipIconParam}`);
    };
}

function removeMatchesForGame(gameId) {
    const list = document.querySelector('.am-list');
    const bar = document.getElementById('active-matches-bar');
    
    const chips = list.querySelectorAll(`.am-chip[data-game-id="${gameId}"]`);
    chips.forEach(c => c.remove());
    
    if (list.children.length === 0) {
        bar.classList.add('hidden');
    }
}