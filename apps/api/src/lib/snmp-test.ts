import * as dgram from 'dgram'

interface SnmpTestResult {
  success: boolean
  sysDescr?: string
  rosVersion?: string
  error?: string
}

// OID 1.3.6.1.2.1.1.1.0 (sysDescr) encoded as BER
const SYSDESCR_OID = Buffer.from([
  0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00,
])

function buildSnmpV2cGetRequest(community: string, requestId: number): Buffer {
  const communityBuf = Buffer.from(community, 'utf-8')
  const reqIdBuf = Buffer.from([
    0x02, 0x04,
    (requestId >> 24) & 0xff, (requestId >> 16) & 0xff,
    (requestId >> 8) & 0xff, requestId & 0xff,
  ])
  const errorStatus = Buffer.from([0x02, 0x01, 0x00])
  const errorIndex = Buffer.from([0x02, 0x01, 0x00])
  const nullValue = Buffer.from([0x05, 0x00])
  const varbind = Buffer.concat([
    Buffer.from([0x30, SYSDESCR_OID.length + nullValue.length]),
    SYSDESCR_OID, nullValue,
  ])
  const varbindList = Buffer.concat([
    Buffer.from([0x30, varbind.length]),
    varbind,
  ])
  const pduBody = Buffer.concat([reqIdBuf, errorStatus, errorIndex, varbindList])
  const pdu = Buffer.concat([
    Buffer.from([0xa0, pduBody.length]),
    pduBody,
  ])
  const version = Buffer.from([0x02, 0x01, 0x01]) // SNMP v2c = 1
  const communityTlv = Buffer.concat([
    Buffer.from([0x04, communityBuf.length]),
    communityBuf,
  ])
  const innerLen = version.length + communityTlv.length + pdu.length
  return Buffer.concat([
    Buffer.from([0x30, innerLen]),
    version, communityTlv, pdu,
  ])
}

function parseSnmpResponse(data: Buffer): string | null {
  // Quick and dirty: find an OCTET STRING (tag 0x04) after the OID
  const oidPos = data.indexOf(Buffer.from([0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00]))
  if (oidPos < 0) return null
  // Skip past the OID TLV, look for next 0x04 tag
  for (let i = oidPos + 8; i < data.length - 2; i++) {
    if (data[i] === 0x04) {
      const len = data[i + 1]
      if (len > 0 && i + 2 + len <= data.length) {
        return data.subarray(i + 2, i + 2 + len).toString('utf-8')
      }
    }
  }
  return null
}

export function testSnmpConnection(
  ip: string,
  community: string,
  version: 'v2c' | 'v3',
): Promise<SnmpTestResult> {
  if (version === 'v3') {
    return Promise.resolve({ success: false, error: 'SNMP v3 not yet supported — use v2c' })
  }

  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    const timeout = setTimeout(() => {
      socket.close()
      resolve({ success: false, error: 'SNMP request timed out (5s)' })
    }, 5_000)

    const requestId = Math.floor(Math.random() * 0x7fffffff)
    const packet = buildSnmpV2cGetRequest(community, requestId)

    socket.on('message', (msg) => {
      clearTimeout(timeout)
      socket.close()
      const sysDescr = parseSnmpResponse(msg)
      if (!sysDescr) {
        resolve({ success: true, sysDescr: '(empty response)' })
        return
      }
      const rosMatch = sysDescr.match(/RouterOS\s+(\S+)/i)
      resolve({
        success: true,
        sysDescr,
        rosVersion: rosMatch?.[1],
      })
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      socket.close()
      resolve({ success: false, error: err.message })
    })

    socket.send(packet, 161, ip)
  })
}
