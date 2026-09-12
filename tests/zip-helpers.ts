export function zipSignature(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.slice(0, 2))
}

export function listZipCentralDirectoryEntryNames(bytes: Uint8Array): readonly string[] {
  const names: string[] = []
  const endOfCentralDirectoryOffset = findEndOfCentralDirectoryOffset(bytes)
  const entryCount = readUint16(bytes, endOfCentralDirectoryOffset + 10)
  const centralDirectoryOffset = readUint32(bytes, endOfCentralDirectoryOffset + 16)
  let offset = centralDirectoryOffset

  for (let entry = 0; entry < entryCount; entry += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) {
      throw new Error("missing ZIP central directory record")
    }

    const nameLength = readUint16(bytes, offset + 28)
    const extraLength = readUint16(bytes, offset + 30)
    const commentLength = readUint16(bytes, offset + 32)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    names.push(new TextDecoder().decode(bytes.slice(nameStart, nameEnd)))
    offset = nameEnd + extraLength + commentLength
  }

  return names
}

function findEndOfCentralDirectoryOffset(bytes: Uint8Array): number {
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      return offset
    }
  }

  throw new Error("missing ZIP end of central directory record")
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
}
