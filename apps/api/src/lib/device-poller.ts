import { eq } from 'drizzle-orm'
import { db } from './db.js'
import { devices, deviceMetrics } from '@mikrotik/db/schema'
import { testRestConnection } from './routeros-rest.js'
import { testBinaryApiConnection } from './routeros-api.js'
import { decryptCredential } from './encryption.js'

const POLL_INTERVAL = 30_000 // 30 seconds

export function startDevicePoller() {
  console.log('[poller] Starting device poller (every 30s)')
  poll() // immediate first poll
  setInterval(poll, POLL_INTERVAL)
}

async function poll() {
  try {
    const allDevices = await db
      .select()
      .from(devices)

    for (const device of allDevices) {
      if (device.connectionType === 'agent' || device.connectionType === 'snmp') {
        continue // agent uses push, snmp handled separately
      }

      if (!device.ipAddress) continue

      try {
        const username = device.apiUsernameEnc
          ? decryptCredential(device.apiUsernameEnc)
          : 'admin'
        const password = device.apiPasswordEnc
          ? decryptCredential(device.apiPasswordEnc)
          : ''

        let result: {
          success: boolean
          rosVersion?: string
          boardName?: string
          model?: string
        }

        if (device.connectionType === 'rest') {
          result = await testRestConnection(
            device.ipAddress,
            device.apiPort ?? 443,
            username,
            password,
          )
        } else {
          result = await testBinaryApiConnection(
            device.ipAddress,
            device.apiPort ?? 8728,
            username,
            password,
          )
        }

        if (result.success) {
          await db
            .update(devices)
            .set({
              status: 'online',
              lastSeenAt: new Date(),
              rosVersion: result.rosVersion ?? device.rosVersion,
              boardName: result.boardName ?? device.boardName,
              model: result.model ?? device.model,
              updatedAt: new Date(),
            })
            .where(eq(devices.id, device.id))
        } else {
          // Mark offline if previously online and now unreachable
          if (device.status === 'online') {
            await db
              .update(devices)
              .set({ status: 'offline', updatedAt: new Date() })
              .where(eq(devices.id, device.id))
          }
        }
      } catch (err) {
        console.error(`[poller] Error polling device ${device.name}:`, err)
      }
    }
  } catch (err) {
    console.error('[poller] Poll cycle error:', err)
  }
}
