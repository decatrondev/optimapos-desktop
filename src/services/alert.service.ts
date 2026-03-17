/**
 * Alert service — plays a notification sound when a new order arrives.
 * Uses the Web Audio API to generate a two-tone chime programmatically.
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    return audioContext;
}

/**
 * Plays a two-tone kitchen alert chime.
 * First tone: 880Hz (A5), second tone: 1100Hz (C#6) — bright and attention-grabbing.
 */
export function playAlertSound(): void {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        // Create a gain envelope for a clean chime
        const masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
        masterGain.gain.setValueAtTime(0.4, now);

        // First chime
        playTone(ctx, masterGain, 880, now, 0.25);
        // Second chime (higher pitch, slight delay)
        playTone(ctx, masterGain, 1100, now + 0.3, 0.25);
        // Third chime (octave up, for urgency)
        playTone(ctx, masterGain, 1320, now + 0.6, 0.35);
    } catch (e) {
        console.warn('[Alert] Could not play sound:', e);
    }
}

function playTone(ctx: AudioContext, destination: AudioNode, frequency: number, startTime: number, duration: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
}

/**
 * Play alert sound repeatedly for new orders.
 * Returns a stop function.
 */
export function playRepeatingAlert(intervalMs = 3000, repeatCount = 3): () => void {
    let count = 0;
    playAlertSound();
    count++;

    const interval = setInterval(() => {
        if (count >= repeatCount) {
            clearInterval(interval);
            return;
        }
        playAlertSound();
        count++;
    }, intervalMs);

    return () => clearInterval(interval);
}
