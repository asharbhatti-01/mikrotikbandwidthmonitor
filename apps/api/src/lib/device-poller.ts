import { eq } from 'drizzle-orm'
import { db } from './db.js'
import { devices, deviceMetrics } from '@mikrotik/db/schema'
import { collectRouterMetrics, type RouterOSMetrics } from './routeros-api.js'
import { decryptCredential } from './encryption.js'

const POLL_INTERVAL = 30_000 // 30 seconds

export function startDevicePoller() {
  console.log('[poller] Starting device poller (every 30s)')
  poll()
  setInterval(poll, POLL_INTERVAL)
}

async function poll() {
  try {
    const allDevices = await db.select().from(devices)

    for (const device of allDevices) {
      if (device.connectionType === 'agent' || device.connectionType === 'snmp') continue
      if (!device.ipAddress) continue

      try {
        const username = device.apiUsernameEnc
          ? decryptCredential(device.apiUsernameEnc)
          : 'admin'
        const password = device.apiPasswordEnc
          ? decryptCredential(device.apiPasswordEnc)
          : ''

        const metrics = await collectRouterMetrics(
          device.ipAddress,
          device.apiPort ?? 8728,
          username,
          password,
        )

        if (metrics.success) {
          // Update device status + info
          await db
            .update(devices)
            .set({
              status: 'online',
              lastSeenAt: new Date(),
              rosVersion: metrics.rosVersion ?? device.rosVersion,
              boardName: metrics.boardName ?? device.boardName,
              model: metrics.model ?? device.model,
              uptimeSeconds: metrics.uptime ? BigInt(metrics.uptime) : device.uptimeSeconds,
              updatedAt: new Date(),
            })
            .where(eq(devices.id, device.id))

          // Store metric snapshot
          if (metrics.cpuLoad !== undefined || metrics.freeMemory !== undefined) {
            await db.insert(deviceMetrics).values({
              deviceId: device.id,
              collectedAt: new Date(),
              cpuLoad: metrics.cpuLoad ?? null,
              freeMemory: metrics.freeMemory ?? null,
              totalMemory: metrics.totalMemory ?? null,
              uptime: metrics.uptime ? BigInt(metrics.uptime) : null,
              interfaces: JSON.stringify(metrics.interfaces ?? []),
            })
          }

          console.log(`[poller] ${device.name}: online | CPU ${metrics.cpuLoad}% | Mem ${formatBytes(metrics.freeMemory)}/${formatBytes(metrics.totalMemory)} | ${metrics.interfaces?.length ?? 0} ifaces`)
        } else {
          if (device.status === 'online') {
            await db
              .update(devices)
              .set({ status: 'offline', updatedAt: new Date() })
              .where(eq(devices.id, device.id))
            console.log(`[poller] ${device.name}: went offline — ${metrics.error}`)
          }
        }
      } catch (err) {
        console.error(`[poller] Error polling ${device.name}:`, err)
      }
    }
  } catch (err) {
    console.error('[poller] Poll cycle error:', err)
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '?'
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)}GB`
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)}MB`
  return `${(bytes / 1024).toFixed(0)}KB`
}
