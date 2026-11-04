// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

/* No cached, simulated or unknown vehicle state authorises an image. */
class ParkGuard {
    constructor(clock) {
        this.clock = clock || Date.now;
        this.speed = null;
        this.stage = null;
        this.speedAt = null;
        this.stageAt = null;
        this.maxAge = 2500;
    }

    updateSpeed(v) {
        const raw = v && v.speedVehicleCentreOfGravity;
        this.speed = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 65535 ? raw / 64 : null;
        this.speedAt = this.speed === null ? null : this.clock();
    }

    updateStage(v, field) {
        const raw = v && v[field];
        let value;
        if (field === 'statusActualStageDrive') value = ({ P: 'P', R: 'R', N: 'N', D: 'D', 1: 'P', 2: 'R', 3: 'N', 4: 'D' })[raw];
        else value = ({ P: 'P', R: 'R', N: 'N', 1: 'N', 2: 'R', 3: 'P', 4: '?' })[raw];
        // An invalid update revokes authorisation, including an ambiguous N/P.
        this.stage = value || null;
        this.stageAt = this.stage === null ? null : this.clock();
    }

    invalidate(kind) {
        if (!kind || kind === 'speed') { this.speed = null; this.speedAt = null; }
        if (!kind || kind === 'stage') { this.stage = null; this.stageAt = null; }
    }

    reason() {
        const now = this.clock();
        if (this.speedAt === null || this.stageAt === null) return 'Waiting for live speed and Park signals';
        if (now - this.speedAt > this.maxAge || now - this.stageAt > this.maxAge || now < this.speedAt || now < this.stageAt) return 'Vehicle signals are stale';
        if (this.stage !== 'P') return 'Select Park before using the HUD test';
        if (this.speed !== 0) return 'The car must be stationary';
        return '';
    }
    allowed() { return this.reason() === ''; }
}

module.exports = { ParkGuard };
