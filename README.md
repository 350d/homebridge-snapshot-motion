# Homebridge Snapshot Motion

A lightweight motion sensor plugin for Homebridge that detects motion based on changes in snapshot image size — perfect for cameras and intercoms that provide only static image snapshots.

## 🔍 Problem

Some intercoms and IP cameras (such as **Loxone Intercom XL**) do not provide a native motion detection feature or RTSP stream compatible with HomeKit Secure Video (HKSV). These devices often expose only a JPEG/MJPEG snapshot over HTTP — insufficient for full automation and HKSV features.

## ✅ Solution

This plugin monitors a camera's snapshot URL and detects motion by measuring changes in **image file size** between snapshots. If a noticeable change in size occurs (indicating motion, light changes, etc.), the plugin triggers a **HomeKit Motion Sensor** and optionally calls a **webhook URL**.

HomeKit Secure Video will still perform video analysis on its own, so a basic motion trigger is enough to enable full HKSV recording.

## 📸 How It Works

* Periodically checks the snapshot image using an HTTP `GET` request with `Range: bytes=0-0` (downloads just the image header)
* Compares the `Content-Length` (or `Content-Range`) value with a historical average/median
* Adjusts for image format-specific header sizes (e.g. JPEG \~623 bytes) to improve accuracy
* Triggers motion if the percentage difference exceeds configured thresholds
* Prevents loops by clearing and restarting a **cooldown timer** on each detection
* Optional webhook request is sent when motion is detected

## 💡 Use Cases

* Add motion detection to intercoms and MJPEG-only cameras
* Trigger automation from HomeKit based on motion
* Integrate basic snapshot-based motion sensing into systems like Loxone, Scrypted, or low-end RTSP devices

---

## ⚙️ Configuration

Add an accessory to your Homebridge `config.json`:

```json
{
  "accessories": [
    {
      "accessory": "SnapshotMotion",
      "name": "Door Motion Sensor",
      "snapshotUrl": "http://your-camera/snapshot.jpg",
      "webhookUrl": "http://your-system/motion",
      "minChangePercent": 3,
      "maxChangePercent": 95,
      "checkInterval": 500,
      "motionCooldown": 10,
      "historyLimit": 32,
      "debug": true
    }
  ]
}
```

### 🔧 Options

| Key                | Type    | Description                                                       |
| ------------------ | ------- | ----------------------------------------------------------------- |
| `accessory`        | string  | Must be `"SnapshotMotion"`                                        |
| `name`             | string  | Name of the sensor in HomeKit                                     |
| `snapshotUrl`      | string  | **Required**. URL to fetch the snapshot image                     |
| `webhookUrl`       | string  | (Optional) GET request sent on motion detection                   |
| `minChangePercent` | number  | Minimum % change in size to trigger motion (e.g. `3` for 3%)      |
| `maxChangePercent` | number  | Maximum % to accept (e.g. avoid flashes, default `95`)            |
| `checkInterval`    | number  | How often to check for image size change (in ms)                  |
| `motionCooldown`   | number  | Cooldown period in seconds before another motion event is allowed |
| `historyLimit`     | number  | Size of history buffer for stable baseline size (default: 32)     |
| `debug`            | boolean | Enable verbose logging in Homebridge logs                         |

---

## 🧪 Technical Notes

* Uses `GET` with a `Range: bytes=0-0` header to avoid downloading the entire image.
* Attempts to estimate image payload size by subtracting format-specific header bytes (e.g., 623 bytes for JPEG).
* Maintains a rolling history of snapshot sizes and compares against the **median** of past values (for noise immunity).
* Automatically avoids double-triggering by using a single `cooldownTimer`, cleared and restarted on each new detection.

---

## 💠 Developed by

**Vladimir Sobolev**
🔗	[https://github.com/350d](https://github.com/350d)
𝕏	[@350d](https://twitter.com/350d)

---

## 📜 License

MIT © 2025

