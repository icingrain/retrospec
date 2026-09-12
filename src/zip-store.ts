type ZipEntry = {
  readonly name: string
  readonly bytes: Uint8Array
}

type BuiltEntry = {
  readonly local: Uint8Array
  readonly central: Uint8Array
}

const textEncoder = new TextEncoder()

export function createStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  let offset = 0
  const builtEntries: BuiltEntry[] = []
  const localFiles: Uint8Array[] = []

  for (const entry of entries) {
    const built = buildEntry(entry, offset)
    builtEntries.push(built)
    localFiles.push(built.local, entry.bytes)
    offset += built.local.byteLength + entry.bytes.byteLength
  }

  const centralOffset = offset
  const centralDirectory = concatBytes(builtEntries.map((entry) => entry.central))
  const end = endOfCentralDirectory(entries.length, centralDirectory.byteLength, centralOffset)
  return concatBytes([...localFiles, centralDirectory, end])
}

function buildEntry(entry: ZipEntry, offset: number): BuiltEntry {
  const name = textEncoder.encode(entry.name)
  const crc = crc32(entry.bytes)
  return {
    local: localHeader(name, entry.bytes.byteLength, crc),
    central: centralHeader(name, entry.bytes.byteLength, crc, offset),
  }
}

function localHeader(name: Uint8Array, size: number, crc: number): Uint8Array {
  const header = new Uint8Array(30 + name.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint32(14, crc, true)
  view.setUint32(18, size, true)
  view.setUint32(22, size, true)
  view.setUint16(26, name.byteLength, true)
  header.set(name, 30)
  return header
}

function centralHeader(name: Uint8Array, size: number, crc: number, offset: number): Uint8Array {
  const header = new Uint8Array(46 + name.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint32(16, crc, true)
  view.setUint32(20, size, true)
  view.setUint32(24, size, true)
  view.setUint16(28, name.byteLength, true)
  view.setUint32(42, offset, true)
  header.set(name, 46)
  return header
}

function endOfCentralDirectory(entryCount: number, size: number, offset: number): Uint8Array {
  const end = new Uint8Array(22)
  const view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, entryCount, true)
  view.setUint16(10, entryCount, true)
  view.setUint32(12, size, true)
  view.setUint32(16, offset, true)
  return end
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const byteLength = parts.reduce((total, part) => total + part.byteLength, 0)
  const output = new Uint8Array(byteLength)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = updateCrc(crc ^ byte)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function updateCrc(initial: number): number {
  let crc = initial
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return crc
}

export function encodeUtf8(value: string): Uint8Array {
  return textEncoder.encode(value)
}
