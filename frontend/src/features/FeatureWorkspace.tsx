import { useState } from 'react'
import type { FeatureId } from '../auth/roles'
import { useAuth } from '../auth/use-auth'
import { obterNomePapel, obterOpcoesAcesso } from '../auth/roles'
import {
  OrganizationsScreen,
  ContractsScreen,
  LotsScreen,
  EquipmentScreen,
  TrackingScreen,
  ReportsScreen,
  UsersScreen,
  ParametersScreen,
} from './screens'
import './features.css'

const titles: Record<FeatureId, string> = {
  usuarios: 'Contas de acesso',
  organizacoes: 'Organizações',
  contratos: 'Contratos',
  lotes: 'Lotes',
  equipamentos: 'Equipamentos',
  rastreamento: 'Rastreabilidade',
  relatorios: 'Relatórios',
  parametros: 'Parâmetros globais',
}

export function FeatureWorkspace() {
  const { session } = useAuth()
  const options = session ? obterOpcoesAcesso(session.papel) : []
  const [activeFeature, setActiveFeature] = useState<FeatureId>(
    options[0]?.id ?? 'organizacoes',
  )

  if (!session) {
    return null
  }

  const visibleFeature = options.some(({ id }) => id === activeFeature)
    ? activeFeature
    : options[0]?.id ?? 'organizacoes'

  return (
    <section className="workspace">
      <aside className="workspace-sidebar" aria-label="Navegação principal">
        <span className="sidebar-label">MENU PRINCIPAL</span>
        <nav className="workspace-nav">
          {options.map((option) => (
            <button
              aria-current={visibleFeature === option.id ? 'page' : undefined}
              className={`nav-item${visibleFeature === option.id ? ' is-active' : ''}`}
              key={option.id}
              onClick={() => setActiveFeature(option.id)}
              type="button"
            >
              <span className="nav-indicator" aria-hidden="true" />
              <span>
                <strong>{option.titulo}</strong>
                <small>{option.descricao}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="account-avatar" aria-hidden="true">
            {session.usuario.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{session.usuario}</strong>
            <small>{obterNomePapel(session.papel)}</small>
          </span>
        </div>
      </aside>

      <div className="workspace-content">
        <header className="workspace-heading">
          <div>
            <span className="section-kicker">GREENCODE / OPERAÇÃO</span>
            <h1>{titles[visibleFeature]}</h1>
          </div>
          <span className="role-chip">{obterNomePapel(session.papel)}</span>
        </header>
        <FeatureScreen key={visibleFeature} feature={visibleFeature} />
      </div>
    </section>
  )
}

function FeatureScreen({ feature }: { feature: FeatureId }) {
  switch (feature) {
    case 'usuarios':
      return <UsersScreen />
    case 'organizacoes':
      return <OrganizationsScreen />
    case 'contratos':
      return <ContractsScreen />
    case 'lotes':
      return <LotsScreen />
    case 'equipamentos':
      return <EquipmentScreen />
    case 'rastreamento':
      return <TrackingScreen />
    case 'relatorios':
      return <ReportsScreen />
    case 'parametros':
      return <ParametersScreen />
  }
}
