// Audio synthesis engine using the Web Audio API
// Self-contained, zero external files required

class SynthAudioEngine {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.isPlayingBgm = false;
        this.currentBgm = null;
        this.schedulerTimer = null;
        
        // Sequencer settings
        this.bpm = 130;
        this.currentStep = 0;
        this.nextNoteTime = 0.0;
        this.stepsPerBar = 16;
        this.barLength = 16;
        this.tracks = {};
    }

    init() {
        if (this.ctx) return;
        
        // Create audio context
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn("Web Audio API not supported in this browser");
            return;
        }
        
        this.ctx = new AudioContextClass();
        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.value = 0.4; // Default master volume
        this.masterVolume.connect(this.ctx.destination);
        
        console.log("Audio Context initialized successfully");
        
        // Create noise buffer for explosion sounds
        this.createNoiseBuffer();
    }

    setVolume(value) {
        if (this.masterVolume) {
            this.masterVolume.gain.value = Math.max(0, Math.min(1, value));
        }
    }

    createNoiseBuffer() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
    }

    // --- SFX SYNTHESIS ---

    playSFX(type) {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;

        try {
            switch (type) {
                case 'laser':
                    this.synthLaser(now);
                    break;
                case 'double':
                    this.synthDoubleLaser(now);
                    break;
                case 'missile':
                    this.synthMissileLaunch(now);
                    break;
                case 'explosion_small':
                    this.synthExplosion(now, 0.15, 800, 100);
                    break;
                case 'explosion_large':
                    this.synthExplosion(now, 0.4, 400, 40);
                    break;
                case 'explosion_boss':
                    this.synthBossExplosion(now);
                    break;
                case 'capsule':
                    this.synthCapsuleGet(now);
                    break;
                case 'power_select':
                    this.synthPowerSelect(now);
                    break;
                case 'power_activate':
                    this.synthPowerActivate(now);
                    break;
                case 'shield_hit':
                    this.synthShieldHit(now);
                    break;
                case 'player_death':
                    this.synthPlayerDeath(now);
                    break;
                case 'warning':
                    this.synthWarning(now);
                    break;
            }
        } catch (e) {
            console.error("Error playing SFX: ", e);
        }
    }

    synthLaser(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, time);
        osc.frequency.exponentialRampToValueAtTime(110, time + 0.12);
        
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.12);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + 0.13);
    }

    synthDoubleLaser(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, time);
        osc.frequency.exponentialRampToValueAtTime(300, time + 0.08);
        
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.08);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + 0.09);
    }

    synthMissileLaunch(time) {
        if (!this.noiseBuffer) return;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(100, time);
        filter.frequency.exponentialRampToValueAtTime(1000, time + 0.2);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.25);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolume);
        
        noise.start(time);
        noise.stop(time + 0.26);
    }

    synthExplosion(time, duration, startFreq, endFreq) {
        if (!this.noiseBuffer) return;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(startFreq, time);
        filter.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.linearRampToValueAtTime(0.01, time + duration);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolume);
        
        noise.start(time);
        noise.stop(time + duration + 0.01);
    }

    synthBossExplosion(time) {
        for (let i = 0; i < 6; i++) {
            const delay = i * 0.15;
            const size = (i === 5) ? 0.8 : 0.3;
            const freq = (i === 5) ? 150 : 300;
            
            setTimeout(() => {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                this.synthExplosion(now, size, freq, 30);
                
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(80, now);
                osc.frequency.linearRampToValueAtTime(20, now + size);
                gain.gain.setValueAtTime(0.4 * size, now);
                gain.gain.linearRampToValueAtTime(0.01, now + size);
                osc.connect(gain);
                gain.connect(this.masterVolume);
                osc.start(now);
                osc.stop(now + size);
            }, delay * 1000);
        }
    }

    synthCapsuleGet(time) {
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, time + i * 0.06);
            
            gain.gain.setValueAtTime(0.12, time + i * 0.06);
            gain.gain.setValueAtTime(0.12, time + i * 0.06 + 0.05);
            gain.gain.linearRampToValueAtTime(0.01, time + i * 0.06 + 0.07);
            
            osc.connect(gain);
            gain.connect(this.masterVolume);
            
            osc.start(time + i * 0.06);
            osc.stop(time + i * 0.06 + 0.08);
        });
    }

    synthPowerSelect(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, time);
        osc.frequency.setValueAtTime(554, time + 0.05);
        
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.1);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + 0.1);
    }

    synthPowerActivate(time) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(300, time);
        osc1.frequency.linearRampToValueAtTime(900, time + 0.2);
        
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(305, time);
        osc2.frequency.linearRampToValueAtTime(905, time + 0.2);
        
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.2);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterVolume);
        
        osc1.start(time);
        osc1.stop(time + 0.2);
        osc2.start(time);
        osc2.stop(time + 0.2);
    }

    synthShieldHit(time) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1500, time);
        osc1.frequency.linearRampToValueAtTime(800, time + 0.15);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1550, time);
        osc2.frequency.linearRampToValueAtTime(820, time + 0.15);
        
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.15);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterVolume);
        
        osc1.start(time);
        osc1.stop(time + 0.15);
        osc2.start(time);
        osc2.stop(time + 0.15);
    }

    synthPlayerDeath(time) {
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, time);
            filter.frequency.linearRampToValueAtTime(50, time + 0.8);
            
            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.4, time);
            noiseGain.gain.linearRampToValueAtTime(0.01, time + 0.8);
            
            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.masterVolume);
            
            noise.start(time);
            noise.stop(time + 0.8);
        }
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.linearRampToValueAtTime(40, time + 0.8);
        
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.8);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + 0.8);
    }

    synthWarning(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(660, time);
        osc.frequency.setValueAtTime(587, time + 0.15);
        
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.setValueAtTime(0.2, time + 0.25);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.3);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + 0.3);
    }

    // --- SEQUENCER BGM SYSTEM ---

    playBGM(trackName) {
        this.init();
        if (!this.ctx) return;
        
        this.stopBGM();
        this.isPlayingBgm = true;
        this.currentBgm = trackName;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime;
        
        this.setupTracks(trackName);
        this.scheduler();
    }

    stopBGM() {
        this.isPlayingBgm = false;
        if (this.schedulerTimer) {
            clearTimeout(this.schedulerTimer);
            this.schedulerTimer = null;
        }
    }

    setupTracks(trackName) {
        const A2 = 110, C3 = 130.81, D3 = 146.83, E3 = 164.81, G3 = 196.00;
        const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392.00, A4 = 440;
        const E5 = 659.25, G5 = 783.99, A5 = 880;

        this.tracks = {
            bass: [],
            melody: [],
            drums: []
        };

        if (trackName === 'title') {
            this.bpm = 110;
            this.tracks.bass =   [A2, A2, E3, A2, G3, G3, D3, G3, C3, C3, G3, C3, E3, E3, 123.47, E3];
            this.tracks.melody = [A4, 0,  E4, 0,  C4, 0,  D4, 0,  E4, 0,  G4, 0,  E4, D4, C4, 0];
            this.tracks.drums =  [1,  0,  2,  0,  1,  0,  2,  0,  1,  0,  2,  0,  1,  1,  2,  0];
        } 
        else if (trackName === 'stage1') {
            this.bpm = 130;
            this.tracks.bass =   [A2, A2, A2, A2, C3, C3, C3, C3, D3, D3, D3, D3, G3, G3, E3, G3];
            this.tracks.melody = [A4, 0,  A4, E4, 0,  G4, A4, 0,  523.25, 0, 587.33, 523.25, A4, G4, A4, 0];
            this.tracks.drums =  [1,  2,  1,  2,  1,  2,  1,  2,  1,  2,  1,  2,  1,  1,  2,  2];
        } 
        else if (trackName === 'stage2') {
            this.bpm = 140;
            const F2 = 87.31, G2 = 98.00;
            this.tracks.bass =   [A2, A2, A2, A2, F2, F2, F2, F2, G2, G2, G2, G2, A2, A2, E3, D3];
            this.tracks.melody = [523.25, A4, 0, E4, G4, A4, 0, 523.25, 0, 587.33, 659.25, 0, 587.33, 523.25, A4, G4];
            this.tracks.drums =  [1,  0,  2,  1,  1,  0,  2,  0,  1,  0,  2,  1,  1,  0,  2,  1];
        } 
        else if (trackName === 'stage3') {
            this.bpm = 150;
            this.tracks.bass =   [A2, E3, A2, E3, C3, G3, C3, G3, D3, A3, D3, A3, E3, 246.94, E3, G3];
            this.tracks.melody = [659.25, 0, 880, 0, 783.99, 0, 659.25, 0, 587.33, 0, 783.99, 0, 659.25, 587.33, 523.25, 587.33];
            this.tracks.drums =  [1,  2,  1,  2,  1,  2,  1,  2,  1,  2,  1,  2,  1,  2,  1,  2];
        } 
        else if (trackName === 'boss') {
            this.bpm = 145;
            const Bb2 = 116.54, B2 = 123.47;
            this.tracks.bass =   [A2, Bb2, B2, C3, C3, B2, Bb2, A2, A2, Bb2, B2, C3, D3, 155.56, E3, 174.61];
            this.tracks.melody = [A4, 0,  622.25, 0, 587.33, 0, 523.25, 0, 622.25, 587.33, 523.25, A4, 523.25, A4, 311.13, 0];
            this.tracks.drums =  [1,  2,  2,  1,  2,  2,  1,  2,  2,  1,  2,  2,  1,  1,  2,  2];
        } 
        else if (trackName === 'gameover') {
            this.bpm = 90;
            this.tracks.bass =   [A2, 0, A2, 0, 87.31, 0, 87.31, 0, C3, 0, C3, 0, G2, 0, G2, 0];
            this.tracks.melody = [E4, 0, D4, 0, C4, 0, 246.94, 0, A3, 0, 0, 0, 0, 0, 0, 0];
            this.tracks.drums =  [1,  0,  0,  0,  2,  0,  0,  0,  1,  0,  0,  0,  2,  0,  0,  0];
        }
    }

    scheduler() {
        if (!this.isPlayingBgm) return;
        
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.schedulePlay(this.currentStep, this.nextNoteTime);
            this.advanceStep();
        }
        
        this.schedulerTimer = setTimeout(() => this.scheduler(), 25);
    }

    advanceStep() {
        const secondsPerBeat = 60.0 / this.bpm;
        const stepDuration = secondsPerBeat / 4;
        this.nextNoteTime += stepDuration;
        
        this.currentStep = (this.currentStep + 1) % this.stepsPerBar;
    }

    schedulePlay(step, time) {
        if (!this.isPlayingBgm) return;

        const bassFreq = this.tracks.bass[step];
        if (bassFreq && bassFreq > 0) {
            this.playBassNote(bassFreq, time);
        }

        const melFreq = this.tracks.melody[step];
        if (melFreq && melFreq > 0) {
            this.playMelodyNote(melFreq, time);
        }

        const drumType = this.tracks.drums[step];
        if (drumType === 1) {
            this.playSynthKick(time);
        } else if (drumType === 2) {
            this.playSynthSnare(time);
        }
    }

    playBassNote(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        
        const secondsPerBeat = 60.0 / this.bpm;
        const duration = (secondsPerBeat / 4) * 0.9;
        
        gain.gain.setValueAtTime(0.18, time);
        gain.gain.linearRampToValueAtTime(0.01, time + duration);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + duration);
    }

    playMelodyNote(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);
        
        const vibrato = this.ctx.createOscillator();
        const vibratoGain = this.ctx.createGain();
        vibrato.frequency.value = 6;
        vibratoGain.gain.value = freq * 0.01;
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        
        const secondsPerBeat = 60.0 / this.bpm;
        const duration = (secondsPerBeat / 4) * 0.8;
        
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.005, time + duration);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        vibrato.start(time);
        osc.start(time);
        
        vibrato.stop(time + duration);
        osc.stop(time + duration);
    }

    playSynthKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
        
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.12);
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + 0.13);
    }

    playSynthSnare(time) {
        if (!this.noiseBuffer) return;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, time);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.1);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolume);
        
        noise.start(time);
        noise.stop(time + 0.11);
    }
}

const SynthAudio = new SynthAudioEngine();
window.SynthAudio = SynthAudio;
