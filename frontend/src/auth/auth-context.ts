import { createContext } from 'react'
import type { ApiRequestOptions } from '../lib/api-client'
import type { PapelUsuario } from './roles'

export interface AuthSession {
  accessToken: string
  usuario: string
  papel: PapelUsuario
  expiresIn: string
  expiresAt: number
}

export interface AuthContextValue {
  session: AuthSession | null
  isLoading: boolean
  login: (usuario: string, senha: string) => Promise<void>
  logout: () => void
  authenticatedRequest: <T>(
    path: string,
    options?: Omit<ApiRequestOptions, 'token'>,
  ) => Promise<T | undefined>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
