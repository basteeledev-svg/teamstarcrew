function normalizeBase(raw) {
  if (!raw) return ''
  let base = String(raw).trim()
  if (!base) return ''
  if (!base.startsWith('/')) base = `/${base}`
  if (base.endsWith('/')) base = base.slice(0, -1)
  return base === '/' ? '' : base
}

export const BASE_PATH = normalizeBase(import.meta.env.VITE_BASE_PATH || '')

export function apiPath(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${BASE_PATH}${p}`
}

export function wsPath() {
  return apiPath('/ws')
}

export function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${wsPath()}`
}
