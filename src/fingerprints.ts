import { Database } from "bun:sqlite"
import { ensureProjectRegistry } from "./registry"
import type {
  FileFingerprintCandidate,
  FileFingerprintSelection,
  ProjectPaths,
  RecordFileFingerprintsInput,
} from "./types"

type StoredFileFingerprint = {
  readonly content_sha256: string
  readonly size_bytes: number
}

export async function selectChangedFiles<T extends FileFingerprintCandidate>(
  paths: ProjectPaths,
  files: readonly T[],
): Promise<FileFingerprintSelection<T>> {
  await ensureFileFingerprintTable(paths)
  const db = new Database(paths.registryDb, { readonly: true })
  try {
    const query = db.query<StoredFileFingerprint, [string]>(
      `select content_sha256, size_bytes
       from file_fingerprints
       where file_path = ?`,
    )
    const changedFiles: T[] = []
    const unchangedFiles: T[] = []

    for (const file of files) {
      const stored = query.get(file.relativePath)
      if (stored?.content_sha256 === file.contentHash && stored.size_bytes === file.sizeBytes) {
        unchangedFiles.push(file)
      } else {
        changedFiles.push(file)
      }
    }

    return { changedFiles, unchangedFiles }
  } finally {
    db.close()
  }
}

export async function recordAnalyzedFileFingerprints<T extends FileFingerprintCandidate>(
  paths: ProjectPaths,
  input: RecordFileFingerprintsInput<T>,
): Promise<void> {
  await ensureFileFingerprintTable(paths)
  const db = new Database(paths.registryDb, { create: true })
  try {
    const upsert = db.query(
      `insert into file_fingerprints
       (file_path, content_sha256, size_bytes, last_analyzed_at, last_retro_run_id)
       values (?, ?, ?, ?, ?)
       on conflict(file_path) do update set
         content_sha256 = excluded.content_sha256,
         size_bytes = excluded.size_bytes,
         last_analyzed_at = excluded.last_analyzed_at,
         last_retro_run_id = excluded.last_retro_run_id`,
    )

    for (const file of input.files) {
      upsert.run(
        file.relativePath,
        file.contentHash,
        file.sizeBytes,
        input.analyzedAt,
        input.retroRunId,
      )
    }
  } finally {
    db.close()
  }
}

async function ensureFileFingerprintTable(paths: ProjectPaths): Promise<void> {
  await ensureProjectRegistry(paths)
  const db = new Database(paths.registryDb, { create: true })
  try {
    db.exec(`
      create table if not exists file_fingerprints (
        file_path text primary key,
        content_sha256 text not null,
        size_bytes integer not null,
        last_analyzed_at text not null,
        last_retro_run_id text
      );
    `)
  } finally {
    db.close()
  }
}
