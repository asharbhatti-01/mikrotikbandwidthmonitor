import * as net from 'net'
import type { ConnectionTestResult } from './routeros-rest.js'

function encodeLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len])
  if (len < 0x4000) return Buffer.from([((len >> 8) & 0x3f) | 0x80, len & 0xff])
  if (len < 0x200000)
    return Buffer.from([((len >> 16) & 0x1f) | 0xc0, (len >> 8) & 0xff, len & 0xff])
  if (len < 0x10000000)
    return Buffer.from([((len >> 24) & 0x0f) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff])
  return Buffer.from([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff])
}

function encodeWord(word: string): Buffer {
  const data = Buffer.from(word, 'utf-8')
  return Buffer.concat([encodeLength(data.length), data])
}

function encodeSentence(words: string[]): Buffer {
  const parts = words.map(encodeWord)
  parts.push(encodeLength(0))
  return Buffer.concat(parts)
}

/** Strip control characters from RouterOS API responses */
function clean(val: string): string {
  return val.replace(/[\x00-\x1f]/g, '').trim()
}

/** Parse =key=value pairs from raw API response text */
function parseAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const regex = /=([^=\x00]+)=([^\x00]*)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    attrs[clean(match[1])] = clean(match[2])
  }
  return attrs
}

export interface RouterOSMetrics {
  success: boolean
  rosVersion?: string
  boardName?: string
  model?: string
  cpuLoad?: number
  freeMemory?: number
  totalMemory?: number
  uptime?: number
  interfaces?: { name: string; rxBytes: number; txBytes: number; running: boolean }[]
  error?: string
}

/**
 * Connect to RouterOS Binary API, login, fetch /system/resource and /interface.
 * Returns full metrics suitable for both testing and polling.
 */
export function collectRouterMetrics(
  ip: string,
  port: number,
  username: string,
  password: string,
): Promise<RouterOSMetrics> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ success: false, error: 'Connection timed out (10s)' })
    }, 10_000)

    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(encodeSentence(['/login', `=name=${username}`, `=password=${password}`]))
    })

    let buf = Buffer.alloc(0)
    let phase: 'login' | 'resource' | 'interface' = 'login'
    const result: RouterOSMetrics = { success: false, interfaces: [] }
    let resourceText = ''

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const text = buf.toString('utf-8')

      if (phase === 'login') {
        if (text.includes('!trap')) {
          clearTimeout(timeout)
          socket.destroy()
          resolve({ success: false, error: 'Login failed — invalid credentials' })
          return
        }
        if (text.includes('!done')) {
          phase = 'resource'
          buf = Buffer.alloc(0)
          socket.write(encodeSentence(['/system/resource/print']))
          return
        }
      }

      if (phase === 'resource') {
        if (text.includes('!done')) {
          const attrs = parseAttributes(text)
          result.success = true
          result.rosVersion = attrs['version']
          result.boardName = attrs['board-name']
          result.model = attrs['platform'] || 'MikroTik'
          result.cpuLoad = attrs['cpu-load'] ? parseInt(attrs['cpu-load'], 10) : undefined
          result.freeMemory = attrs['free-memory'] ? parseInt(attrs['free-memory'], 10) : undefined
          result.totalMemory = attrs['total-memory'] ? parseInt(attrs['total-memory'], 10) : undefined
          result.uptime = parseUptime(attrs['uptime'])

          phase = 'interface'
          buf = Buffer.alloc(0)
          socket.write(encodeSentence(['/interface/print']))
          return
        }
      }

      if (phase === 'interface') {
        if (text.includes('!done')) {
          // Parse all !re blocks for interfaces
          const blocks = text.split(/(?=!re)/)
          for (const block of blocks) {
            if (!block.startsWith('!re')) continue
            const attrs = parseAttributes(block)
            if (attrs['name']) {
              result.interfaces!.push({
                name: attrs['name'],
                rxBytes: parseInt(attrs['rx-byte'] || '0', 10),
                txBytes: parseInt(attrs['tx-byte'] || '0', 10),
                running: attrs['running'] === 'true',
              })
            }
          }

          clearTimeout(timeout)
          socket.destroy()
          resolve(result)
          return
        }
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: err.message })
    })
  })
}

/** Parse RouterOS uptime string like "3w2d5h30m10s" to seconds */
function parseUptime(uptime?: string): number | undefined {
  if (!uptime) return undefined
  let total = 0
  const weeks = uptime.match(/(\d+)w/)
  const days = uptime.match(/(\d+)d/)
  const hours = uptime.match(/(\d+)h/)
  const mins = uptime.match(/(\d+)m/)
  const secs = uptime.match(/(\d+)s/)
  if (weeks) total += parseInt(weeks[1]) * 604800
  if (days) total += parseInt(days[1]) * 86400
  if (hours) total += parseInt(hours[1]) * 3600
  if (mins) total += parseInt(mins[1]) * 60
  if (secs) total += parseInt(secs[1])
  return total || undefined
}

/** Backward compat: simple test that returns ConnectionTestResult */
export function testBinaryApiConnection(
  ip: string,
  port: number,
  username: string,
  password: string,
): Promise<ConnectionTestResult> {
  return collectRouterMetrics(ip, port, username, password).then((m) => ({
    success: m.success,
    rosVersion: m.rosVersion,
    boardName: m.boardName,
    model: m.model,
    error: m.error,
  }))
}
