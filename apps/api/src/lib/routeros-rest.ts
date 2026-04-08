export interface ConnectionTestResult {
  success: boolean
  rosVersion?: string
  boardName?: string
  model?: string
  error?: string
}

export async function testRestConnection(
  ip: string,
  port: number,
  username: string,
  password: string,
): Promise<ConnectionTestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const auth = Buffer.from(`${username}:${password}`).toString('base64')
    const res = await fetch(`https://${ip}:${port}/rest/system/resource`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
      // @ts-ignore — Bun supports this for self-signed certs
      tls: { rejectUnauthorized: false },
    })

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const data = (await res.json()) as Record<string, string>
    return {
      success: true,
      rosVersion: data['version'],
      boardName: data['board-name'],
      model: data['platform'],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort')) return { success: false, error: 'Connection timed out (10s)' }
    return { success: false, error: msg }
  } finally {
    clearTimeout(timeout)
  }
}
