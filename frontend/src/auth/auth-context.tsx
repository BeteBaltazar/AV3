import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiRequest, type ApiRequestOptions } from '../lib/api-client'
import { AuthContext, type AuthSession } from './auth-context'
import { isPapelUsuario } from './roles'

interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: string
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const logout = useCallback(() => {
    setSession(null)
  }, [])

  const login = useCallback(async (usuario: string, senha: string) => {
    setIsLoading(true)
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { usuario, senha },
      })

      if (
        !response ||
        response.tokenType !== 'Bearer' ||
        typeof response.accessToken !== 'string' ||
        typeof response.expiresIn !== 'string'
      ) {
        throw new ApiError(502, 'INVALID_LOGIN_RESPONSE', 'A API retornou dados de login invalidos.')
      }

      const claims = readTokenClaims(response.accessToken)
      if (
        !claims ||
        !isPapelUsuario(claims.role) ||
        typeof claims.exp !== 'number' ||
        !Number.isFinite(claims.exp) ||
        claims.exp * 1000 <= Date.now()
      ) {
        throw new ApiError(502, 'INVALID_ACCESS_TOKEN', 'A API retornou um token sem papel reconhecido.')
      }

      setSession({
        accessToken: response.accessToken,
        usuario: usuario.trim(),
        papel: claims.role,
        expiresIn: response.expiresIn,
        expiresAt: claims.exp * 1000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    let timeout: number | undefined
    const checkExpiration = () => {
      const remaining = session.expiresAt - Date.now()
      if (remaining <= 0) {
        setSession((current) =>
          current?.accessToken === session.accessToken ? null : current,
        )
        return
      }

      timeout = window.setTimeout(
        checkExpiration,
        Math.min(remaining, 2_147_483_647),
      )
    }

    checkExpiration()
    return () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout)
      }
    }
  }, [session])

  const authenticatedRequest = useCallback(
    async <T,>(
      path: string,
      options: Omit<ApiRequestOptions, 'token'> = {},
    ): Promise<T | undefined> => {
      if (!session) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Entre novamente para continuar.')
      }

      try {
        return await apiRequest<T>(path, { ...options, token: session.accessToken })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setSession(null)
        }
        throw error
      }
    },
    [session],
  )

  const value = useMemo(
    () => ({ session, isLoading, login, logout, authenticatedRequest }),
    [session, isLoading, login, logout, authenticatedRequest],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function readTokenClaims(token: string): { role: unknown; exp: unknown } | null {
  const payload = token.split('.')[1]
  if (!payload) {
    return null
  }

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(paddedBase64), (character) =>
      character.charCodeAt(0),
    )
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes))

    if (
      typeof claims !== 'object' ||
      claims === null ||
      !('role' in claims) ||
      !('exp' in claims)
    ) {
      return null
    }

    return { role: claims.role, exp: claims.exp }
  } catch {
    return null
  }
}
