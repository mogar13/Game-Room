/**
 * CASINO OS - SYSTEM AUDIO MODULE
 * Manages global audio state, preloading, browser audio unlocking, and mute toggling.
 */

window.SystemAudio = {
    isMuted: localStorage.getItem("casino_muted") === "true",
    tracks: {}, 
    unlocked: false,

    init: function() {
        this.preload();
        this.bindUnlockEvents();
    },

    preload: function() {
        // Path assumes it's being called from games/game_name/ folder.
        const basePath = "../../system/audio/";
        
        this.tracks = {
            chipTable: new Audio(basePath + 'chip-lay-3.ogg'),
            chipStack: [
                new Audio(basePath + 'chip-lay-1.ogg'),
                new Audio(basePath + 'chip-lay-2.ogg')
            ],
            card: [
                new Audio(basePath + 'card-slide-6.ogg'),
                new Audio(basePath + 'cardPlace2.ogg')
            ],
            win: new Audio(basePath + 'victory.mp3'),
            click: new Audio(basePath + 'click1.mp3'),
            exit: new Audio(basePath + 'switch4.ogg'),
            roulette: new Audio(basePath + 'roulette.mp3'),
            lose: new Audio(basePath + 'lose.ogg'),
            tie: new Audio(basePath + 'tie.ogg'),
            shuffle: new Audio(basePath + 'shuffle.mp3')
        };
    },

    bindUnlockEvents: function() {
        // Browsers block audio until the user interacts with the page
        const unlock = () => this.unlockAudioContext();
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
    },

    unlockAudioContext: function() {
        if (this.unlocked) return;
        
        // Play and immediately pause a silent sound to unlock the context
        if (this.tracks.click) {
            this.tracks.click.volume = 0; 
            this.tracks.click.play().then(() => {
                this.tracks.click.pause();
                this.tracks.click.currentTime = 0;
                this.tracks.click.volume = 1; 
                this.unlocked = true;
                console.log("Casino OS: Audio context unlocked.");
            }).catch(e => console.log("Casino OS: Audio unlock failed:", e));
        }
    },

    play: function(type) {
        if (this.isMuted) return;
        
        let sound = this.tracks[type];
        if (!sound) return;

        // Handle arrays of sounds (for random variations like chips and cards)
        if (Array.isArray(sound)) {
            let randomTrack = sound[Math.floor(Math.random() * sound.length)];
            randomTrack.currentTime = 0;
            randomTrack.play().catch(e => console.log("Casino OS: Audio play failed:", e));
        } else {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Casino OS: Audio play failed:", e));
        }
    },

    toggleMute: function() {
        this.isMuted = !this.isMuted;
        localStorage.setItem("casino_muted", this.isMuted);
        
        // Play a click if unmuted to give immediate feedback
        if (!this.isMuted) this.play('click');

        // Emit an event so the UI can update the icon automatically
        if (window.SystemUI && typeof window.SystemUI.emit === 'function') {
            window.SystemUI.emit("audio_muted_changed", this.isMuted);
        }
        
        return this.isMuted;
    }
};

// Auto-initialize the audio engine
window.SystemAudio.init();