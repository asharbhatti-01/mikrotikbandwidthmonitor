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

/** Decode one word length from buffer, returns [length, bytesConsumed] or null if not enough data */
function decodeLength(buf: Buffer, offset: number): [number, number] | null {
  if (offset >= buf.length) return null
  const b = buf[offset]
  if (b < 0x80) return [b, 1]
  if (offset + 1 >= buf.length) return null
  if ((b & 0xc0) === 0x80) return [((b & 0x3f) << 8) | buf[offset + 1], 2]
  if (offset + 2 >= buf.length) return null
  if ((b & 0xe0) === 0xc0) return [((b & 0x1f) << 16) | (buf[offset + 1] << 8) | buf[offset + 2], 3]
  if (offset + 3 >= buf.length) return null
  if ((b & 0xf0) === 0xe0) return [((b & 0x0f) << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3], 4]
  if (offset + 4 >= buf.length) return null
  return [(buf[offset + 1] << 24) | (buf[offset + 2] << 16) | (buf[offset + 3] << 8) | buf[offset + 4], 5]
}

/** Decode all words from a buffer. Returns array of words and remaining buffer. */
function decodeWords(buf: Buffer): { sentences: string[][]; remaining: Buffer } {
  const sentences: string[][] = []
  let current: string[] = []
  let offset = 0

  while (offset < buf.length) {
    const result = decodeLength(buf, offset)
    if (!result) break

    const [wordLen, lenBytes] = result
    offset += lenBytes

    if (wordLen === 0) {
      // End of sentence
      if (current.length > 0) {
        sentences.push(current)
        current = []
      }
      continue
    }

    if (offset + wordLen > buf.length) {
      // Not enough data yet
      offset -= lenBytes
      break
    }

    current.push(buf.subarray(offset, offset + wordLen).toString('utf-8'))
    offset += wordLen
  }

  return { sentences, remaining: buf.subarray(offset) }
}

/** Parse =key=value words into a map */
function wordsToAttrs(words: string[]): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const word of words) {
    if (word.startsWith('=')) {
      const eqIdx = word.indexOf('=', 1)
      if (eqIdx > 1) {
        attrs[word.substring(1, eqIdx)] = word.substring(eqIdx + 1)
      }
    }
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

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const { sentences, remaining } = decodeWords(buf)
      buf = remaining

      for (const words of sentences) {
        const tag = words[0] // !done, !re, !trap, !fatal

        if (phase === 'login') {
          if (tag === '!trap' || tag === '!fatal') {
            clearTimeout(timeout)
            socket.destroy()
            resolve({ success: false, error: 'Login failed — invalid credentials' })
            return
          }
          if (tag === '!done') {
            phase = 'resource'
            socket.write(encodeSentence(['/system/resource/print']))
            continue
          }
        }

        if (phase === 'resource') {
          if (tag === '!re') {
            const attrs = wordsToAttrs(words)
            result.success = true
            result.rosVersion = attrs['version']
            result.boardName = attrs['board-name']
            result.model = attrs['platform'] || 'MikroTik'
            result.cpuLoad = attrs['cpu-load'] ? parseInt(attrs['cpu-load'], 10) : undefined
            result.freeMemory = attrs['free-memory'] ? parseInt(attrs['free-memory'], 10) : undefined
            result.totalMemory = attrs['total-memory'] ? parseInt(attrs['total-memory'], 10) : undefined
            result.uptime = parseUptime(attrs['uptime'])
          }
          if (tag === '!done') {
            phase = 'interface'
            socket.write(encodeSentence(['/interface/print']))
            continue
          }
        }

        if (phase === 'interface') {
          if (tag === '!re') {
            const attrs = wordsToAttrs(words)
            if (attrs['name']) {
              result.interfaces!.push({
                name: attrs['name'],
                rxBytes: parseInt(attrs['rx-byte'] || '0', 10),
                txBytes: parseInt(attrs['tx-byte'] || '0', 10),
                running: attrs['running'] === 'true',
              })
            }
          }
          if (tag === '!done') {
            clearTimeout(timeout)
            socket.destroy()
            resolve(result)
            return
          }
        }
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: err.message })
    })
  })
}

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
