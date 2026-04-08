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
  parts.push(encodeLength(0)) // empty word terminates sentence
  return Buffer.concat(parts)
}

export function testBinaryApiConnection(
  ip: string,
  port: number,
  username: string,
  password: string,
): Promise<ConnectionTestResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ success: false, error: 'Connection timed out (10s)' })
    }, 10_000)

    const socket = net.createConnection({ host: ip, port }, () => {
      // Send login
      socket.write(encodeSentence(['/login', `=name=${username}`, `=password=${password}`]))
    })

    let buf = Buffer.alloc(0)
    let loggedIn = false
    const result: ConnectionTestResult = { success: false }

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      // Simple parse: look for key strings in accumulated data
      const text = buf.toString('utf-8')

      if (!loggedIn && text.includes('!done')) {
        if (text.includes('!trap')) {
          clearTimeout(timeout)
          socket.destroy()
          resolve({ success: false, error: 'Login failed — invalid credentials' })
          return
        }
        loggedIn = true
        buf = Buffer.alloc(0)
        socket.write(encodeSentence(['/system/resource/print']))
        return
      }

      if (loggedIn && text.includes('!done')) {
        clearTimeout(timeout)
        // Parse =key=value pairs from the response
        const versionMatch = text.match(/=version=([^\x00=]+)/)
        const boardMatch = text.match(/=board-name=([^\x00=]+)/)
        const platformMatch = text.match(/=platform=([^\x00=]+)/)

        result.success = true
        if (versionMatch) result.rosVersion = versionMatch[1]
        if (boardMatch) result.boardName = boardMatch[1]
        if (platformMatch) result.model = platformMatch[1]

        socket.destroy()
        resolve(result)
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: err.message })
    })
  })
}
