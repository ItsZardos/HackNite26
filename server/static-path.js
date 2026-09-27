// Reject alternate Windows separators before resolving a request on disk.
export function isPublicPath(relativePath) {
  return /^(reader|public)\//.test(relativePath)
    && !relativePath.includes('\\')
    && !relativePath.includes('\0')
    && !relativePath.split('/').includes('..');
}
