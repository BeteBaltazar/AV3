import { useState, type FormEvent } from 'react'
import { AuthProvider } from './auth/auth-context.tsx'
import { obterNomePapel } from './auth/roles'
import { useAuth } from './auth/use-auth'
import { ApiError } from './lib/api-client'
import { FeatureWorkspace } from './features/FeatureWorkspace'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <GreencodeApp />
    </AuthProvider>
  )
}

function GreencodeApp() {
  const { session, logout } = useAuth()

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Greencode, início">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span className="brand-name">greencode</span>
        </a>
        {session ? (
          <div className="account-bar">
            <span className="account-identity">
              <strong>{session.usuario}</strong>
              <span>{obterNomePapel(session.papel)}</span>
            </span>
            <button className="logout-button" type="button" onClick={logout}>
              Sair
            </button>
          </div>
        ) : (
          <span className="topbar-label">Logística reversa</span>
        )}
      </header>

      {session ? <AuthenticatedHome /> : <Welcome />}

      <footer className="page-footer">
        <span>Greencode</span>
        <span>Uma iniciativa para um futuro mais circular.</span>
      </footer>
    </main>
  )
}

function Welcome() {
  return (
    <>
      <section className="welcome" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="status-dot" aria-hidden="true" />
            Plataforma de economia circular
          </span>
          <h1 id="welcome-title">
            Dando um novo ciclo
            <br />
            para a <span>tecnologia.</span>
          </h1>
          <p>
            Uma base para acompanhar a logística reversa de equipamentos
            eletrônicos, do recebimento à destinação responsável.
          </p>
          <div className="development-note">
            <span className="note-icon" aria-hidden="true">
              &#10003;
            </span>
            <span>Acesse a plataforma com sua conta Greencode</span>
          </div>
        </div>
        <LoginForm />
      </section>

      <section className="areas" aria-labelledby="areas-title">
        <div className="section-heading">
          <div>
            <span className="section-kicker">O GREENCODE</span>
            <h2 id="areas-title">Uma operação, muitos ciclos.</h2>
          </div>
          <span className="section-count">01 — 03</span>
        </div>

        <div className="area-grid">
          <article className="area-card">
            <span className="area-number">01</span>
            <h3>Organizações</h3>
            <p>Cadastros e contratos em um só lugar.</p>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </article>
          <article className="area-card">
            <span className="area-number">02</span>
            <h3>Lotes e equipamentos</h3>
            <p>Acompanhe entradas, triagens e movimentações.</p>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </article>
          <article className="area-card">
            <span className="area-number">03</span>
            <h3>Rastreabilidade</h3>
            <p>Consulte o histórico de cada equipamento.</p>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </article>
        </div>
      </section>
    </>
  )
}

function LoginForm() {
  const { login, isLoading } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    try {
      await login(usuario, senha)
      setSenha('')
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setErrorMessage('Não foi possível conectar à API. Verifique se o servidor está disponível e tente novamente.')
      } else if (error.status === 401) {
        setErrorMessage('Usuário ou senha inválidos.')
      } else if (error.status >= 500) {
        setErrorMessage('O serviço encontrou um erro inesperado. Tente novamente mais tarde.')
      } else {
        setErrorMessage(error.message)
      }
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <span className="section-kicker">ACESSO À PLATAFORMA</span>
      <h2>Bem-vindo de volta</h2>
      <p className="login-description">Entre com suas credenciais para continuar.</p>

      <label className="form-field">
        <span>Usuário</span>
        <input
          autoComplete="username"
          name="usuario"
          onChange={(event) => {
            setUsuario(event.target.value)
            setErrorMessage('')
          }}
          required
          value={usuario}
        />
      </label>

      <label className="form-field">
        <span>Senha</span>
        <input
          autoComplete="current-password"
          name="senha"
          onChange={(event) => {
            setSenha(event.target.value)
            setErrorMessage('')
          }}
          required
          type="password"
          value={senha}
        />
      </label>

      {errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}

      <button className="login-button" disabled={isLoading} type="submit">
        {isLoading ? 'Verificando...' : 'Entrar'}
        {!isLoading && <span aria-hidden="true">→</span>}
      </button>
      <p className="login-footnote">Sua sessão termina quando o token expirar.</p>
    </form>
  )
}

function AuthenticatedHome() {
  const { session } = useAuth()
  if (!session) {
    return null
  }

  return (
    <FeatureWorkspace />
  )
}

export default App
