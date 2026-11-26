import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface DownloadResult {
  filePath: string;
  fileSize: number;
  sha256: string;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

export function parseExpectedSha256(
  checksumText: string,
  targetAssetName: string
): string | null {
  const lines = checksumText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const lowerTarget = targetAssetName.toLowerCase();

  for (const line of lines) {
    // Format: "<64hex>  filename" or "<64hex> *filename" or "SHA256 (filename) = <64hex>"
    const standardMatch = /^([a-f0-9]{64})\s+[*]?(.+)$/i.exec(line);
    if (standardMatch) {
      const hash = standardMatch[1].toLowerCase();
      const filePart = path.basename(standardMatch[2].trim()).toLowerCase();
      if (filePart === lowerTarget) {
        return hash;
      }
    }

    const bsdMatch = /^sha256\s*\(([^)]+)\)\s*=\s*([a-f0-9]{64})$/i.exec(line);
    if (bsdMatch) {
      const filePart = path.basename(bsdMatch[1].trim()).toLowerCase();
      if (filePart === lowerTarget) {
        return bsdMatch[2].toLowerCase();
      }
    }
  }

  // Single-hash file (e.g. foo.exe.sha256 containing just the 64-char hex digest)
  if (lines.length === 1) {
    const bare = /^([a-f0-9]{64})$/i.exec(lines[0]);
    if (bare) return bare[1].toLowerCase();
  }

  return null;
}

export class DownloadService {
  async downloadFile(params: {
    url: string;
    destDir: string;
    fileName: string;
    token?: string;
    onProgress?: (percent: number, downloadedBytes: number, totalBytes: number) => void;
  }): Promise<DownloadResult> {
    fs.mkdirSync(params.destDir, { recursive: true });
    const safeName = sanitizeFileName(params.fileName);
    const finalPath = path.join(params.destDir, safeName);
    const partPath = `${finalPath}.part`;

    const headers: Record<string, string> = {
      'User-Agent': 'ASTA-Hub/1.0',
    };
    if (params.token && params.token.trim()) {
      headers.Authorization = `Bearer ${params.token.trim()}`;
    }

    const res = await fetch(params.url, { headers, redirect: 'follow' });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${params.fileName} (HTTP ${res.status})`);
    }

    const totalBytes = Number(res.headers.get('content-length') ?? 0);
    const hasher = crypto.createHash('sha256');
    const writeStream = fs.createWriteStream(partPath);
    const reader = res.body.getReader();

    let downloadedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        downloadedBytes += chunk.length;
        hasher.update(chunk);

        await new Promise<void>((resolve, reject) => {
          const ok = writeStream.write(chunk, (err) => {
            if (err) reject(err);
          });
          if (ok) resolve();
          else writeStream.once('drain', resolve);
        });

        if (params.onProgress) {
          const percent =
            totalBytes > 0
              ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
              : -1;
          params.onProgress(percent, downloadedBytes, totalBytes);
        }
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.once('error', reject);
      });

      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      fs.renameSync(partPath, finalPath);

      const sha256 = hasher.digest('hex');
      if (params.onProgress) {
        params.onProgress(100, downloadedBytes, totalBytes || downloadedBytes);
      }

      return {
        filePath: finalPath,
        fileSize: downloadedBytes,
        sha256,
      };
    } catch (err) {
      writeStream.destroy();
      if (fs.existsSync(partPath)) {
        try {
          fs.unlinkSync(partPath);
        } catch {
          // ignore cleanup failure
        }
      }
      throw err;
    }
  }

  async fetchExpectedChecksum(
    checksumUrl: string | null,
    assetName: string,
    token?: string
  ): Promise<string | null> {
    if (!checksumUrl) return null;
    try {
      const headers: Record<string, string> = { 'User-Agent': 'ASTA-Hub/1.0' };
      if (token && token.trim()) {
        headers.Authorization = `Bearer ${token.trim()}`;
      }
      const res = await fetch(checksumUrl, { headers, redirect: 'follow' });
      if (!res.ok) return null;
      const text = await res.text();
      return parseExpectedSha256(text, assetName);
    } catch {
      return null;
    }
  }
}
