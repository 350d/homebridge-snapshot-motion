'use strict';

const http = require('http');
const https = require('https');
const request = require('request');

var Service, Characteristic;

const HttpAgent = new http.Agent({
	keepAlive: true,
	maxSockets: 1,
});
const HttpsAgent = new https.Agent({
	keepAlive: true,
	maxSockets: 1,
});

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory('homebridge-snapshot-motion', 'SnapshotMotionSensor', SnapshotMotionSensorAccessory);
};

class SnapshotMotionSensorAccessory {
	constructor(log, config) {
		this.log = config.debug ? log : function(){};
		this.name = config.name || 'Snapshot Motion Sensor';
		this.snapshotUrl = config.snapshotUrl;
		this.minChangePercent = config.minChangePercent || 2;
		this.maxChangePercent = config.maxChangePercent || 75;
		this.checkInterval = config.checkInterval || 5000;
		this.cooldownSeconds = config.cooldownSeconds || 10;
		this.cooldownTimer = null;
		this.webhookUrl = config.webhookUrl || null;
		this.motionDetected = false;
		this.lastMotion = 0;

		this.service = new Service.MotionSensor(this.name);
		this.service.getCharacteristic(Characteristic.MotionDetected)
			.onGet(() => this.motionDetected);

		this.requestOptions = {
			url: config.snapshotUrl,
			method: 'GET',
			headers: {
				'Connection': 'keep-alive',
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache',
				'Accept': 'image/jpeg,image/*;q=0.8,*/*;q=0.5',
				'Accept-Encoding': 'identity',
				'User-Agent': 'HomebridgeSnapshotMotionSensor',
				'Range': 'bytes=0-0',
			},
			agent: config.snapshotUrl.startsWith('https://') ? HttpsAgent : HttpAgent,
		};

		this.sizeHistory = [];
		this.historyLimit = config.historyLimit || 32;
		this.lastSize = 0;
		
		this.monitoring = () => {
			const now = Date.now();
			if (this.motionDetected && now - this.lastMotion < this.cooldownSeconds * 1000) {
				this.log('Cooldown...');
				this.sizeHistory.push(median(this.sizeHistory));
				setTimeout(this.monitoring, this.checkInterval);
				return;
			}

			request(this.requestOptions, (error, response) => {
				if (error || !response) {
					this.log('Request failed');
					setTimeout(this.monitoring, this.checkInterval);
					return;
				}

				const contentType = response.headers['content-type'] || '';

				let size = 0;
				let headerCorrection = 0;

				if (contentType.includes('jpeg')) {
					headerCorrection = 623;
				} else if (contentType.includes('png')) {
					headerCorrection = 67;
				} else if (contentType.includes('webp')) {
					headerCorrection = 90;
				}

				if (response.headers['content-length']) {
					size = parseInt(response.headers['content-length'], 10);
				}
				if (response.headers['content-range']) {
					const match = response.headers['content-range'].match(/\/(\d+)$/);
					size = match ? parseInt(match[1], 10) : 0;
				}

				if (size > headerCorrection) size -= headerCorrection;

				if (this.sizeHistory.length <= this.historyLimit / 2) {
					this.log('Collecting history: ' + ~~(this.sizeHistory.length*100/(this.historyLimit / 2)) + '%');
					this.sizeHistory.push(size, size);
					setTimeout(this.monitoring, this.checkInterval);
					return;
				}

				const reference = Math.min(this.sizeHistory[0], median(this.sizeHistory));
				const diff = Math.abs(size - reference);
				const percent = (diff / reference) * 100;

				this.lastSize = size;

				if (percent >= this.minChangePercent && percent <= this.maxChangePercent) {
					this.log('Motion detected! Change: ' + percent.toFixed(2) + '% Reference: ' + ~~reference + ' Size: ' + size);
					this.motionDetected = true;
					this.lastMotion = now;
					this.accumulatedDelta = 0;

					this.sizeHistory.push(reference);

					this.service.updateCharacteristic(Characteristic.MotionDetected, true);

					// Send webhook GET request if configured
					if (this.webhookUrl) {
						request(this.webhookUrl, (err, res) => {
							if (err) this.log(`Webhook error: ${err.message}`);
							else this.log(`Webhook sent: ${res.statusCode}`);
						});
					}

					if (this.cooldownTimer) {
						clearTimeout(this.cooldownTimer);
						this.cooldownTimer = null;
					}

					this.cooldownTimer = setTimeout(() => {
						this.motionDetected = false;
						this.service.updateCharacteristic(Characteristic.MotionDetected, false);
						this.cooldownTimer = null;
					}, this.cooldownSeconds * 1000);

				} else {
					this.log('Motion delta: ' + percent.toFixed(2) + '% Reference: ' + ~~reference + ' Size: ' + size);
					this.sizeHistory.push(size);
				}

				this.sizeHistory = this.sizeHistory.slice(-this.historyLimit);

				setTimeout(this.monitoring, this.checkInterval);
			});
		}

		this.monitoring();
	}

	getServices() {
		return [this.service];
	}
}

function average(arr) {
	if (!arr.length) return 0;
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
	if (!arr.length) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 !== 0
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2;
}