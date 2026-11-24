const API_PREFIX = '/api'

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string
  headers?: HeadersInit
  signal?: AbortSignal
}

interface ApiErrorResponse {
  error?: {
    code?: unknown
    message?: unknown
  }
}

export class ApiError extends Error {
  public readonly status: number
  public readonly code: string

  public constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T | undefined> {
  const headers = new Headers(options.headers)
  const request: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    signal: options.signal,
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    request.body = JSON.stringify(options.body)
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(apiPath(path), request)
  const responseText = await response.text()

  if (!response.ok) {
    throw createApiError(response, responseText)
  }

  if (!responseText) {
    return undefined
  }

  try {
    return JSON.parse(responseText) as T
  } catch {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'A API retornou uma resposta que nao e JSON valido.',
    )
  }
}

function apiPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError('O caminho da API deve ser relativo e iniciar com "/".')
  }

  if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) {
    return path
  }

  return `${API_PREFIX}${path}`
}

function createApiError(response: Response, responseText: string): ApiError {
  let payload: ApiErrorResponse | undefined

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as ApiErrorResponse
    } catch {
      payload = undefined
    }
  }

  const code = payload?.error?.code
  const message = payload?.error?.message

  return new ApiError(
    response.status,
    typeof code === 'string' ? code : 'HTTP_ERROR',
    typeof message === 'string' && message.trim()
      ? message
      : `A requisicao falhou com status HTTP ${response.status}.`,
  )
}
