import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { ApiError } from '../lib/api-client'
import { useAuth } from '../auth/use-auth'
import { PAPEIS_USUARIO } from '../auth/roles'
import {
  ESTADOS_FISICOS,
  STATUS_RASTREAMENTO,
  TIPOS_EQUIPAMENTO,
  type ContratoApi,
  type EquipamentoApi,
  type LoteApi,
  type MovimentacaoApi,
  type OrganizacaoApi,
  type ParametrosApi,
  type RastreamentoApi,
  type RelatorioOrganizacaoApi,
  type StatusRastreamentoApi,
  type UsuarioApi,
} from './api-types'

interface FeedbackState {
  kind: 'success' | 'error'
  message: string
}

function useApiData<T>(path: string | null) {
  const { authenticatedRequest } = useAuth()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(path !== null)

  const reload = useCallback(async () => {
    if (path === null) {
      return undefined
    }
    try {
      const result = await authenticatedRequest<T>(path)
      setData(result ?? null)
      setError('')
      return result
    } catch (cause) {
      setError(errorMessage(cause))
      return undefined
    } finally {
      setLoading(false)
    }
  }, [authenticatedRequest, path])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  return { data, error, loading, reload }
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Não foi possível conectar à API. Verifique a conexão e tente novamente.'
  }

  switch (error.status) {
    case 400:
      return `Revise os dados informados. ${error.message}`
    case 401:
      return 'Sua sessão expirou ou não é mais válida. Entre novamente para continuar.'
    case 403:
      return 'Você não tem permissão para realizar esta operação.'
    case 404:
      return 'O registro solicitado não foi encontrado. Confira o identificador e tente novamente.'
    case 409:
      switch (error.code) {
        case 'VERSION_CONFLICT':
          return error.message
        case 'CONFLICT':
          return `Já existe um registro com um dos identificadores informados. ${error.message}`
        case 'REFERENCE_CONFLICT':
        case 'RELATED_LOTS':
          return `Este registro está relacionado a outros dados e não pode ser alterado ou excluído desta forma. ${error.message}`
        case 'INVALID_TRANSITION':
          return `A operação não é permitida para o estado atual do registro. ${error.message}`
        case 'SELF_DELETE':
          return 'Não é possível excluir a própria conta.'
        default:
          return `A operação entrou em conflito com o estado atual dos dados. ${error.message}`
      }
    default:
      if (error.status >= 500) {
        return 'O serviço encontrou um erro inesperado. Tente novamente mais tarde.'
      }
      return error.message
  }
}

function useAction() {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [busy, setBusy] = useState(false)
  const actionInProgress = useRef(false)

  const run = useCallback(async (
    action: () => Promise<unknown>,
    success: string,
    refreshOnVersionConflict?: () => Promise<boolean | void>,
    onError?: (error: unknown) => void,
  ) => {
    if (actionInProgress.current) return false
    actionInProgress.current = true
    setFeedback(null)
    setBusy(true)
    try {
      await action()
      setFeedback({ kind: 'success', message: success })
      return true
    } catch (error) {
      onError?.(error)
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        try {
          const refreshed = await refreshOnVersionConflict?.()
          setFeedback({
            kind: 'error',
            message: refreshed === false
              ? 'O registro foi alterado por outra requisição. Não foi possível recarregar os dados atuais; nenhuma alteração foi reenviada. Consulte uma versão atual com um perfil autorizado antes de tentar novamente.'
              : refreshOnVersionConflict
                ? 'O registro foi alterado por outra requisição. Os dados atuais foram recarregados; revise-os antes de tentar novamente. A alteração não foi reenviada.'
                : 'O registro foi alterado por outra requisição. Recarregue os dados atuais e revise-os antes de tentar novamente. A alteração não foi reenviada.',
          })
        } catch (refreshError) {
          setFeedback({
            kind: 'error',
            message: `O registro foi alterado por outra requisição, mas não foi possível recarregar os dados atuais. A alteração não foi reenviada. ${errorMessage(refreshError)}`,
          })
        }
      } else {
        setFeedback({ kind: 'error', message: errorMessage(error) })
      }
      return false
    } finally {
      actionInProgress.current = false
      setBusy(false)
    }
  }, [])

  return { feedback, busy, run }
}

function Feedback({ value }: { value: FeedbackState | null }) {
  if (!value) {
    return null
  }
  return (
    <p className={`feedback feedback-${value.kind}`} role={value.kind === 'error' ? 'alert' : 'status'}>
      {value.message}
    </p>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="feature-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function TextField({
  label,
  name,
  type = 'text',
  required = false,
  defaultValue,
  min,
  max,
  step,
  placeholder,
  value,
  onChange,
  error,
  readOnly = false,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string | number
  min?: string | number
  max?: string | number
  step?: string | number
  placeholder?: string
  value?: string | number
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  error?: string
  readOnly?: boolean
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        aria-describedby={error ? `${name}-error` : undefined}
        aria-invalid={error ? true : undefined}
        defaultValue={defaultValue}
        max={max}
        min={min}
        name={name}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        step={step}
        type={type}
        value={value}
        onChange={onChange}
      />
      {error && <small className="field-error" id={`${name}-error`}>{error}</small>}
    </label>
  )
}

function SelectField({
  label,
  name,
  values,
  required = true,
  defaultValue,
}: {
  label: string
  name: string
  values: readonly string[]
  required?: boolean
  defaultValue?: string
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select defaultValue={defaultValue ?? values[0]} name={name} required={required}>
        {!required && <option value="">Selecione</option>}
        {values.map((value) => (
          <option key={value} value={value}>
            {humanize(value)}
          </option>
        ))}
      </select>
    </label>
  )
}

function SubmitButton({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <button className="primary-button" disabled={busy} type="submit">
      {busy ? 'Processando...' : children}
    </button>
  )
}

function TableMessage({
  loading,
  error,
  empty,
}: {
  loading: boolean
  error: string
  empty: boolean
}) {
  if (loading) {
    return <p className="table-message">Carregando dados...</p>
  }
  if (error) {
    return <p className="table-message table-error">{error}</p>
  }
  if (empty) {
    return <p className="table-message">Nenhum registro encontrado.</p>
  }
  return null
}

function humanize(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .split('_')
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1))
    .join(' ')
}

function dateLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

function dateTimeValue(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function formValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? '').trim()
}

export function UsersScreen() {
  const { authenticatedRequest, session } = useAuth()
  const { data: users, error, loading, reload } = useApiData<UsuarioApi[]>('/usuarios')
  const { feedback, busy, run } = useAction()
  const [selected, setSelected] = useState<UsuarioApi | null>(null)

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const ok = await run(
      () => authenticatedRequest('/usuarios', {
        method: 'POST',
        body: {
          usuario: formValue(form, 'usuario'),
          senha: formValue(form, 'senha'),
          papel: formValue(form, 'papel'),
        },
      }),
      'Usuário criado.',
    )
    if (ok) {
      form.reset()
      await reload()
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = event.currentTarget
    const senha = formValue(form, 'novaSenha')
    const body: { version: number; papel: string; senha?: string } = {
      version: selected.version,
      papel: formValue(form, 'papel'),
    }
    if (senha) body.senha = senha
    const ok = await run(
      () => authenticatedRequest(`/usuarios/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        body,
      }),
      'Usuário atualizado.',
      async () => {
        const currentUsers = await reload()
        if (!currentUsers) return false
        setSelected(currentUsers.find((user) => user.id === selected.id) ?? null)
        return true
      },
    )
    if (ok) {
      setSelected(null)
      await reload()
    }
  }

  async function deleteUser(user: UsuarioApi) {
    if (user.usuario === session?.usuario) {
      return
    }
    if (!window.confirm(`Excluir a conta de ${user.usuario}?`)) return
    const ok = await run(
      () => authenticatedRequest(`/usuarios/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        body: { version: user.version },
      }),
      'Usuário excluído.',
      async () => Boolean(await reload()),
    )
    if (ok) await reload()
  }

  return (
    <div className="screen-stack">
      <Feedback value={feedback} />
      <Panel title="Criar usuário" description="Cadastre uma conta e atribua um dos papéis disponíveis.">
        <form className="form-grid" onSubmit={createUser}>
          <TextField label="Usuário" name="usuario" required />
          <TextField label="Senha inicial" name="senha" type="password" required />
          <SelectField label="Papel" name="papel" values={PAPEIS_USUARIO} />
          <SubmitButton busy={busy}>Criar usuário</SubmitButton>
        </form>
      </Panel>

      {selected && (
        <Panel title={`Editar ${selected.usuario}`}>
          <form className="form-grid" onSubmit={updateUser}>
            <SelectField label="Novo papel" name="papel" values={PAPEIS_USUARIO} defaultValue={selected.papel} />
            <TextField label="Nova senha (opcional)" name="novaSenha" type="password" />
            <span className="version-note">Versão atual: {selected.version}</span>
            <SubmitButton busy={busy}>Salvar alterações</SubmitButton>
          </form>
        </Panel>
      )}

      <Panel title="Usuários cadastrados">
        <TableMessage loading={loading} error={error} empty={!users?.length} />
        {!!users?.length && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Usuário</th><th>Papel</th><th>Versão</th><th>Ações</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.usuario}</td>
                    <td>{humanize(user.papel)}</td>
                    <td>{user.version}</td>
                    <td className="row-actions">
                      <button className="text-button" disabled={busy} onClick={() => setSelected(user)} type="button">Editar</button>
                      <button
                        className="text-button text-danger"
                        disabled={busy || user.usuario === session?.usuario}
                        onClick={() => void deleteUser(user)}
                        type="button"
                      >Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

export function OrganizationsScreen() {
  const { authenticatedRequest, session } = useAuth()
  const { data: organizations, error, loading, reload } =
    useApiData<OrganizacaoApi[]>('/organizacoes?activeOnly=false')
  const { feedback, busy, run } = useAction()
  const [cnpjError, setCnpjError] = useState('')
  const canCreate = session?.papel === 'ADMINISTRADOR' || session?.papel === 'OPERADOR_CADASTRO'
  const canAdminister = session?.papel === 'ADMINISTRADOR'

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(
      ['razaoSocial', 'cnpj', 'inscricaoEstadual', 'enderecoCompleto', 'telefone', 'email']
        .map((name) => [name, formValue(form, name)]),
    )
    const ok = await run(
      () => authenticatedRequest('/organizacoes', { method: 'POST', body }),
      'Organização cadastrada.',
      undefined,
      (error) => {
        if (error instanceof ApiError && error.code === 'INVALID_CNPJ') {
          setCnpjError(error.message)
        }
      },
    )
    if (ok) {
      form.reset()
      setCnpjError('')
      await reload()
    }
  }

  async function deactivate(organization: OrganizacaoApi) {
    if (!window.confirm(`Desativar ${organization.razaoSocial}?`)) return
    const ok = await run(
      () => authenticatedRequest(`/organizacoes/${encodeURIComponent(organization.id)}/desativacao`, {
        method: 'POST',
        body: { version: organization.version },
      }),
      'Organização desativada.',
      async () => Boolean(await reload()),
    )
    if (ok) await reload()
  }

  async function deleteOrganization(organization: OrganizacaoApi) {
    if (!window.confirm(`Excluir permanentemente ${organization.razaoSocial}?`)) return
    const ok = await run(
      () => authenticatedRequest(`/organizacoes/${encodeURIComponent(organization.id)}`, {
        method: 'DELETE',
        body: { version: organization.version },
      }),
      'Organização excluída.',
      async () => Boolean(await reload()),
    )
    if (ok) await reload()
  }

  return (
    <div className="screen-stack">
      <Feedback value={feedback} />
      {canCreate && (
        <Panel title="Cadastrar organização" description="Informe os dados cadastrais da organização.">
          <form className="form-grid" onSubmit={createOrganization}>
            <TextField label="Razão social" name="razaoSocial" required />
            <TextField
              error={cnpjError}
              label="CNPJ"
              name="cnpj"
              onChange={() => setCnpjError('')}
              placeholder="00.000.000/0000-00"
              required
            />
            <TextField label="Inscrição estadual" name="inscricaoEstadual" required />
            <TextField label="Endereço completo" name="enderecoCompleto" required />
            <TextField label="Telefone" name="telefone" required type="tel" />
            <TextField label="E-mail" name="email" required type="email" />
            <SubmitButton busy={busy}>Cadastrar organização</SubmitButton>
          </form>
        </Panel>
      )}

      <Panel title="Organizações" description="Registros devolvidos pela API para o seu perfil.">
        <TableMessage loading={loading} error={error} empty={!organizations?.length} />
        {!!organizations?.length && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Razão social</th><th>CNPJ</th><th>Contrato</th><th>Status</th>{canAdminister && <th>Ações</th>}</tr></thead>
              <tbody>
                {organizations.map((organization) => (
                  <tr key={organization.id}>
                    <td><strong>{organization.razaoSocial}</strong><small className="cell-subtitle">{organization.email}</small></td>
                    <td>{organization.cnpj}</td>
                    <td>{organization.contratoVigente ? 'Vigente' : 'Sem contrato vigente'}</td>
                    <td><span className={`status-pill ${organization.ativo ? 'status-active' : 'status-inactive'}`}>{organization.ativo ? 'Ativa' : 'Inativa'}</span></td>
                    {canAdminister && (
                      <td className="row-actions">
                        {organization.ativo && <button className="text-button" disabled={busy} onClick={() => void deactivate(organization)} type="button">Desativar</button>}
                        {!organization.ativo && <button className="text-button text-danger" disabled={busy} onClick={() => void deleteOrganization(organization)} type="button">Excluir</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

export function ContractsScreen() {
  const { authenticatedRequest, session } = useAuth()
  const canCreate = session?.papel === 'ADMINISTRADOR' || session?.papel === 'OPERADOR_CADASTRO'
  const canRenew = canCreate
  const canLookup = session?.papel === 'ADMINISTRADOR' || session?.papel === 'AUDITOR'
  const { data: organizations } = useApiData<OrganizacaoApi[]>('/organizacoes')
  const { feedback, busy, run } = useAction()
  const [contract, setContract] = useState<ContratoApi | null>(null)
  const [renewalVersion, setRenewalVersion] = useState('')
  const [renewalDate, setRenewalDate] = useState('')

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = {
      dataAssinatura: new Date(formValue(form, 'dataAssinatura')).toISOString(),
      dataVencimento: new Date(formValue(form, 'dataVencimento')).toISOString(),
      clausulas: formValue(form, 'clausulas'),
      valorMensal: Number(formValue(form, 'valorMensal')),
      renovacaoAutomatica: formValue(form, 'renovacaoAutomatica') === 'true',
    }
    const organizationId = formValue(form, 'organizacaoId')
    const ok = await run(
      async () => {
        const created = await authenticatedRequest<ContratoApi>(
          `/organizacoes/${encodeURIComponent(organizationId)}/contratos`,
          { method: 'POST', body },
        )
        if (created) {
          setContract(created)
          setRenewalVersion(String(created.version))
          setRenewalDate(dateTimeValue(created.dataVencimento))
        }
      },
      'Contrato criado.',
    )
    if (ok) form.reset()
  }

  async function lookupContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = formValue(event.currentTarget, 'contratoId')
    setContract(null)
    setRenewalVersion('')
    setRenewalDate('')
    await run(
      async () => {
        const result = await authenticatedRequest<ContratoApi>(
          `/contratos/${encodeURIComponent(id)}`,
        )
        setContract(result ?? null)
        setRenewalVersion(result ? String(result.version) : '')
        setRenewalDate(result ? dateTimeValue(result.dataVencimento) : '')
      },
      'Contrato carregado.',
    )
  }

  async function renewContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const id = formValue(form, 'contratoId')
    const version = Number(renewalVersion)
    const date = new Date(formValue(form, 'dataVencimento')).toISOString()
    await run(
      async () => {
        const updated = await authenticatedRequest<ContratoApi>(
          `/contratos/${encodeURIComponent(id)}`,
          { method: 'PATCH', body: { version, dataVencimento: date } },
        )
        if (updated) {
          setContract(updated)
          setRenewalVersion(String(updated.version))
          setRenewalDate(dateTimeValue(updated.dataVencimento))
        }
      },
      'Data de vencimento atualizada.',
      async () => {
        if (!canLookup) {
          setRenewalVersion('')
          return false
        }
        const current = await authenticatedRequest<ContratoApi>(
          `/contratos/${encodeURIComponent(id)}`,
        )
        if (!current) return false
        setContract(current)
        setRenewalVersion(String(current.version))
        return true
      },
    )
  }

  return (
    <div className="screen-stack">
      <Feedback value={feedback} />
      {canCreate && (
        <Panel title="Criar contrato">
          <form className="form-grid" onSubmit={createContract}>
            <label className="form-field form-field-wide">
              <span>Organização</span>
              <select name="organizacaoId" required>
                <option value="">Selecione uma organização</option>
                {organizations?.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.razaoSocial}</option>
                ))}
              </select>
            </label>
            <TextField label="Data de assinatura" name="dataAssinatura" required type="datetime-local" />
            <TextField label="Data de vencimento" name="dataVencimento" required type="datetime-local" />
            <TextField label="Valor mensal" name="valorMensal" min={0} required step="0.01" type="number" />
            <SelectField label="Renovação automática" name="renovacaoAutomatica" values={['true', 'false']} />
            <label className="form-field form-field-wide">
              <span>Cláusulas</span>
              <textarea maxLength={10000} name="clausulas" required rows={3} />
            </label>
            <SubmitButton busy={busy}>Criar contrato</SubmitButton>
          </form>
        </Panel>
      )}

      {canLookup && (
        <Panel title="Consultar contrato" description="Não há rota de listagem de contratos; consulte por identificador.">
          <form className="inline-form" onSubmit={lookupContract}>
            <TextField label="Identificador do contrato" name="contratoId" required />
            <button className="secondary-button" disabled={busy} type="submit">{busy ? 'Consultando...' : 'Consultar'}</button>
          </form>
        </Panel>
      )}

      {canRenew && (
        <Panel title="Renovar contrato" description="Informe o identificador e a versão atual do contrato.">
          <form className="form-grid" key={contract?.id ?? 'contract-renew-form'} onSubmit={renewContract}>
            <TextField label="Identificador do contrato" name="contratoId" defaultValue={contract?.id} required />
            <TextField label="Versão atual" name="version" value={renewalVersion} min={1} readOnly required type="number" />
            <TextField label="Novo vencimento" name="dataVencimento" value={renewalDate} onChange={(event) => setRenewalDate(event.target.value)} required type="datetime-local" />
            <SubmitButton busy={busy}>Atualizar vencimento</SubmitButton>
          </form>
        </Panel>
      )}

      {contract && (
        <Panel title="Contrato selecionado">
          <dl className="detail-grid">
            <dt>ID</dt><dd className="monospace">{contract.id}</dd>
            <dt>Organização</dt><dd className="monospace">{contract.organizacaoId}</dd>
            <dt>Assinatura</dt><dd>{dateLabel(contract.dataAssinatura)}</dd>
            <dt>Vencimento</dt><dd>{dateLabel(contract.dataVencimento)}</dd>
            <dt>Valor mensal</dt><dd>{formatCurrency(contract.valorMensal)}</dd>
            <dt>Versão</dt><dd>{contract.version}</dd>
          </dl>
        </Panel>
      )}
    </div>
  )
}

function EquipmentFields({ includeState = false }: { includeState?: boolean }) {
  return (
    <>
      <SelectField label="Tipo de equipamento" name="tipo" values={TIPOS_EQUIPAMENTO} />
      <TextField label="Código de barras interno" name="codigoBarrasInterno" required />
      <TextField label="Marca" name="marca" required />
      <TextField label="Modelo" name="modelo" required />
      <TextField label="Ano de fabricação" name="anoFabricacao" min={1} required type="number" />
      <TextField label="Peso (kg)" name="pesoQuilogramas" min={0} required step="0.01" type="number" />
      {includeState && <SelectField label="Estado físico" name="estadoFisico" values={ESTADOS_FISICOS} />}
    </>
  )
}

export function LotsScreen() {
  const { authenticatedRequest, session } = useAuth()
  const canCreate = session?.papel === 'ADMINISTRADOR' || session?.papel === 'GESTOR_ALMOXARIFADO'
  const canTriage = canCreate
  const canDelete = session?.papel === 'ADMINISTRADOR'
  const canList = session?.papel === 'ADMINISTRADOR' || session?.papel === 'AUDITOR'
  const { data: lots, error, loading, reload } = useApiData<LoteApi[]>(canList ? '/lotes' : null)
  const { data: organizations } = useApiData<OrganizacaoApi[]>(
    session?.papel === 'GESTOR_ALMOXARIFADO' ? null : '/organizacoes',
  )
  const { feedback, busy, run } = useAction()
  const [recentLots, setRecentLots] = useState<LoteApi[]>([])
  const [staleLotIds, setStaleLotIds] = useState<string[]>([])
  const visibleLots = canList ? lots ?? [] : recentLots

  async function createLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const organizationId = formValue(form, 'organizacaoId')
    const body = {
      dataEntrada: new Date(formValue(form, 'dataEntrada')).toISOString(),
      organizacaoId: organizationId,
      notaFiscal: formValue(form, 'notaFiscal'),
      transportadora: formValue(form, 'transportadora'),
      observacoes: formValue(form, 'observacoes'),
      equipamentos: [{
        tipo: formValue(form, 'tipo'),
        codigoBarrasInterno: formValue(form, 'codigoBarrasInterno'),
        marca: formValue(form, 'marca'),
        modelo: formValue(form, 'modelo'),
        anoFabricacao: Number(formValue(form, 'anoFabricacao')),
        pesoQuilogramas: Number(formValue(form, 'pesoQuilogramas')),
        estadoFisico: formValue(form, 'estadoFisico'),
      }],
    }
    const ok = await run(
      async () => {
        const created = await authenticatedRequest<LoteApi>('/lotes', { method: 'POST', body })
        if (created) setRecentLots((current) => [created, ...current])
      },
      'Lote e equipamento registrados.',
    )
    if (ok) {
      form.reset()
      if (canList) await reload()
    }
  }

  async function triageLot(lot: LoteApi) {
    const ok = await run(
      async () => {
        const updated = await authenticatedRequest<LoteApi>(`/lotes/${encodeURIComponent(lot.id)}/triagem`, {
          method: 'POST',
          body: { version: lot.version },
        })
        if (updated) {
          setRecentLots((current) => current.map((item) => item.id === updated.id ? updated : item))
        }
      },
      'Triagem concluída e movimentações registradas.',
      async () => {
        if (canList) return Boolean(await reload())
        setStaleLotIds((current) => current.includes(lot.id) ? current : [...current, lot.id])
        return false
      },
    )
    if (ok && canList) await reload()
  }

  async function deleteLot(lot: LoteApi) {
    if (!window.confirm(`Excluir o lote ${lot.id}? Somente lotes vazios podem ser excluídos.`)) return
    const ok = await run(
      () => authenticatedRequest(`/lotes/${encodeURIComponent(lot.id)}`, {
        method: 'DELETE',
        body: { version: lot.version },
      }),
      'Lote excluído.',
      async () => Boolean(await reload()),
    )
    if (ok) {
      setRecentLots((current) => current.filter((item) => item.id !== lot.id))
      await reload()
    }
  }

  async function addEquipment(event: FormEvent<HTMLFormElement>, lot: LoteApi) {
    event.preventDefault()
    const form = event.currentTarget
    const equipment = {
      tipo: formValue(form, 'tipo'),
      codigoBarrasInterno: formValue(form, 'codigoBarrasInterno'),
      marca: formValue(form, 'marca'),
      modelo: formValue(form, 'modelo'),
      anoFabricacao: Number(formValue(form, 'anoFabricacao')),
      pesoQuilogramas: Number(formValue(form, 'pesoQuilogramas')),
      estadoFisico: formValue(form, 'estadoFisico'),
    }
    const ok = await run(
      async () => {
        const updated = await authenticatedRequest<LoteApi>(
          `/lotes/${encodeURIComponent(lot.id)}/equipamentos`,
          { method: 'POST', body: { version: lot.version, equipamentos: [equipment] } },
        )
        if (updated) {
          setRecentLots((current) =>
            current.map((item) => item.id === updated.id ? updated : item),
          )
        }
      },
      'Equipamento adicionado ao lote.',
      async () => {
        if (canList) return Boolean(await reload())
        setStaleLotIds((current) => current.includes(lot.id) ? current : [...current, lot.id])
        return false
      },
    )
    if (ok) {
      form.reset()
      if (canList) await reload()
    }
  }

  return (
    <div className="screen-stack">
      <Feedback value={feedback} />
      {canCreate && (
        <Panel title="Registrar chegada de lote" description="A API valida a organização e a data de entrada.">
          <form className="form-grid" onSubmit={createLot}>
            {session?.papel === 'GESTOR_ALMOXARIFADO' ? (
              <TextField label="ID da organização" name="organizacaoId" required />
            ) : (
              <label className="form-field">
                <span>Organização</span>
                <select name="organizacaoId" required>
                  <option value="">Selecione uma organização</option>
                  {organizations?.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.razaoSocial}</option>
                  ))}
                </select>
              </label>
            )}
            <TextField label="Data de entrada" name="dataEntrada" required type="datetime-local" />
            <TextField label="Nota fiscal" name="notaFiscal" required />
            <TextField label="Transportadora" name="transportadora" required />
            <TextField label="Observações" name="observacoes" />
            <span className="form-field form-field-wide equipment-form-label">Equipamento recebido</span>
            <EquipmentFields includeState />
            <SubmitButton busy={busy}>Registrar lote</SubmitButton>
          </form>
        </Panel>
      )}

      {(canList || recentLots.length > 0) && (
        <Panel title={canList ? 'Lotes cadastrados' : 'Lotes desta sessão'} description={!canList ? 'Seu perfil não possui rota de consulta de lotes. Os registros abaixo foram criados nesta sessão.' : undefined}>
          <TableMessage loading={canList && loading} error={canList ? error : ''} empty={!visibleLots.length} />
          {!!visibleLots.length && (
            <div className="lot-list">
              {visibleLots.map((lot) => (
                <article className="lot-card" key={lot.id}>
                  <div className="lot-card-heading">
                    <div><span className="area-number">LOTE</span><h3>{lot.notaFiscal}</h3></div>
                    <span className="status-pill status-active">{humanize(lot.statusProcessamento)}</span>
                  </div>
                  <dl className="compact-details">
                    <div><dt>Entrada</dt><dd>{dateLabel(lot.dataEntrada)}</dd></div>
                    <div><dt>Organização</dt><dd className="monospace">{lot.organizacaoId}</dd></div>
                    <div><dt>Equipamentos</dt><dd>{lot.equipamentos.length}</dd></div>
                    <div><dt>Versão</dt><dd>{lot.version}</dd></div>
                  </dl>
                  {staleLotIds.includes(lot.id) && (
                    <p className="access-note" role="status">
                      Esta versão ficou desatualizada. As operações neste lote foram bloqueadas; consulte um perfil autorizado para verificar os dados atuais.
                    </p>
                  )}
                  {lot.equipamentos.map((equipment) => (
                    <p className="lot-equipment" key={equipment.id}>
                      {equipment.codigoBarrasInterno} · {humanize(equipment.tipo)} · {humanize(equipment.statusRastreamento)}
                    </p>
                  ))}
                  <div className="lot-actions">
                    {canTriage && !staleLotIds.includes(lot.id) && lot.statusProcessamento === 'RECEBIDO' && (
                      <button className="secondary-button" disabled={busy} onClick={() => void triageLot(lot)} type="button">Processar triagem</button>
                    )}
                    {canTriage && !staleLotIds.includes(lot.id) && (
                      <details className="inline-details">
                        <summary>Adicionar equipamento</summary>
                        <form className="form-grid compact-form" onSubmit={(event) => void addEquipment(event, lot)}>
                          <EquipmentFields includeState />
                          <SubmitButton busy={busy}>Adicionar equipamento</SubmitButton>
                        </form>
                      </details>
                    )}
                    {canDelete && lot.equipamentos.length === 0 && (
                      <button className="text-button text-danger" disabled={busy} onClick={() => void deleteLot(lot)} type="button">Excluir lote vazio</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

export function EquipmentScreen() {
  const { authenticatedRequest, session } = useAuth()
  const canList = session?.papel === 'ADMINISTRADOR' || session?.papel === 'AUDITOR'
  const canUpdate = session?.papel === 'ADMINISTRADOR' || session?.papel === 'GESTOR_ALMOXARIFADO'
  const canDelete = session?.papel === 'ADMINISTRADOR'
  const { data: equipment, error, loading, reload } =
    useApiData<EquipamentoApi[]>(canList ? '/equipamentos' : null)
  const { feedback, busy, run } = useAction()
  const [code, setCode] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [equipmentVersion, setEquipmentVersion] = useState('')

  async function refreshEquipment(id?: string): Promise<boolean> {
    const currentEquipment = await reload()
    if (!currentEquipment) return false
    if (id) {
      const current = currentEquipment.find((item) => item.id === id)
      setEquipmentVersion(current ? String(current.version) : '')
    }
    return true
  }

  async function updatePhysicalState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const id = equipmentId.trim()
    const version = Number(equipmentVersion)
    const state = formValue(form, 'estadoFisico')
    const justification = formValue(form, 'justificativa')
    const ok = await run(
      async () => {
        const updated = await authenticatedRequest<EquipamentoApi>(
          `/equipamentos/${encodeURIComponent(id)}/estado-fisico`,
          {
            method: 'PATCH',
            body: { version, estadoFisico: state, ...(justification ? { justificativa: justification } : {}) },
          },
        )
        if (updated) setEquipmentVersion(String(updated.version))
      },
      'Estado físico atualizado.',
      async () => {
        if (canList) return refreshEquipment(id)
        setEquipmentVersion('')
        return false
      },
    )
    if (ok && canList) await reload()
  }

  async function moveToDismantle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = equipmentId.trim()
    const version = Number(equipmentVersion)
    const ok = await run(
      async () => {
        const updated = await authenticatedRequest<EquipamentoApi>(
          `/equipamentos/${encodeURIComponent(id)}/desmonte`,
          { method: 'POST', body: { version } },
        )
        if (updated) setEquipmentVersion(String(updated.version))
      },
      'Equipamento enviado para desmonte.',
      async () => {
        if (canList) return refreshEquipment(id)
        setEquipmentVersion('')
        return false
      },
    )
    if (ok && canList) await reload()
  }

  async function generateBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const query = new URLSearchParams({
      tipo: formValue(form, 'tipo'),
      sequencia: formValue(form, 'sequencia'),
    })
    await run(
      async () => {
        const result = await authenticatedRequest<{ codigo: string }>(`/codigos-barras?${query}`)
        if (result) setCode(result.codigo)
      },
      'Código interno gerado.',
    )
  }

  async function unlinkEquipment(item: EquipamentoApi) {
    const ok = await run(
      () => authenticatedRequest(`/equipamentos/${encodeURIComponent(item.id)}/desvinculacao`, {
        method: 'POST',
        body: { version: item.version },
      }),
      'Equipamento desvinculado do lote.',
      canList ? () => refreshEquipment(item.id) : undefined,
    )
    if (ok) await reload()
  }

  async function deleteEquipment(item: EquipamentoApi) {
    if (!window.confirm(`Excluir o equipamento ${item.codigoBarrasInterno}?`)) return
    const ok = await run(
      () => authenticatedRequest(`/equipamentos/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        body: { version: item.version },
      }),
      'Equipamento excluído.',
      async () => Boolean(await reload()),
    )
    if (ok) await reload()
  }

  return (
    <div className="screen-stack">
      <Feedback value={feedback} />
      {canUpdate && (
        <>
          <Panel title="Atualizar estado físico" description="A API exige justificativa se houver queda de duas ou mais categorias.">
            <form className="form-grid" onSubmit={updatePhysicalState}>
              <TextField label="ID do equipamento" name="equipamentoId" value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} required />
              <TextField label="Versão atual" name="version" value={equipmentVersion} onChange={(event) => setEquipmentVersion(event.target.value)} min={1} required type="number" />
              <SelectField label="Novo estado físico" name="estadoFisico" values={ESTADOS_FISICOS} />
              <TextField label="Justificativa (se exigida)" name="justificativa" />
              <SubmitButton busy={busy}>Atualizar estado</SubmitButton>
            </form>
          </Panel>
          <Panel title="Registrar desmonte" description="Disponível somente após a triagem do lote.">
            <form className="inline-form" onSubmit={moveToDismantle}>
              <TextField label="ID do equipamento" name="equipamentoId" value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} required />
              <TextField label="Versão atual" name="version" value={equipmentVersion} onChange={(event) => setEquipmentVersion(event.target.value)} min={1} required type="number" />
              <button className="secondary-button" disabled={busy} type="submit">Enviar para desmonte</button>
            </form>
          </Panel>
          {(session?.papel === 'GESTOR_ALMOXARIFADO' || session?.papel === 'ADMINISTRADOR') && (
            <Panel title="Gerar código de barras">
              <form className="inline-form" onSubmit={generateBarcode}>
                <SelectField label="Tipo de equipamento" name="tipo" values={TIPOS_EQUIPAMENTO} />
                <TextField label="Sequência" name="sequencia" min={0} required type="number" />
                <button className="secondary-button" disabled={busy} type="submit">Gerar código</button>
              </form>
              {code && <p className="generated-code">{code}</p>}
            </Panel>
          )}
        </>
      )}

      {canList && (
        <Panel title="Equipamentos" description="Selecione um registro para preencher ID e versão nos formulários.">
          <TableMessage loading={loading} error={error} empty={!equipment?.length} />
          {!!equipment?.length && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Código</th><th>Tipo</th><th>Estado</th><th>Rastreamento</th><th>Versão</th><th>Ações</th></tr></thead>
                <tbody>
                  {equipment.map((item) => (
                    <tr key={item.id}>
                      <td><button className="text-button monospace" onClick={() => { setCode(item.id); setEquipmentId(item.id); setEquipmentVersion(String(item.version)) }} type="button">{item.codigoBarrasInterno}</button><small className="cell-subtitle monospace">{item.id}</small></td>
                      <td>{humanize(item.tipo)}</td>
                      <td>{humanize(item.estadoFisico)}</td>
                      <td>{humanize(item.statusRastreamento)}</td>
                      <td>{item.version}</td>
                      <td className="row-actions">
                        <button className="text-button" onClick={() => { setCode(item.id); setEquipmentId(item.id); setEquipmentVersion(String(item.version)) }} type="button">Usar ID</button>
                        {canUpdate && item.loteId && <button className="text-button" disabled={busy} onClick={() => void unlinkEquipment(item)} type="button">Desvincular</button>}
                        {canDelete && <button className="text-button text-danger" disabled={busy} onClick={() => void deleteEquipment(item)} type="button">Excluir</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {canUpdate && code && <p className="access-note">ID selecionado/gerado: <span className="monospace">{code}</span></p>}
    </div>
  )
}

export function TrackingScreen() {
  const { authenticatedRequest } = useAuth()
  const { feedback, busy, run } = useAction()
  const [tracking, setTracking] = useState<RastreamentoApi | null>(null)

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = formValue(event.currentTarget, 'equipamentoId')
    setTracking(null)
    await run(
      async () => {
        const result = await authenticatedRequest<RastreamentoApi>(
          `/equipamentos/${encodeURIComponent(id)}/rastreamento`,
        )
        if (result) setTracking(result)
      },
      'Rastreabilidade carregada.',
    )
  }

  return (
    <div className="screen-stack">
      <Panel title="Consultar rastreabilidade" description="Informe o ID do equipamento para carregar lote, organização e movimentações.">
        <form className="inline-form" onSubmit={lookup}>
          <TextField label="ID do equipamento" name="equipamentoId" required />
          <button className="secondary-button" disabled={busy} type="submit">{busy ? 'Consultando...' : 'Consultar'}</button>
        </form>
        <Feedback value={feedback} />
      </Panel>

      {tracking && (
        <>
          <Panel title="Equipamento">
            <dl className="detail-grid">
              <dt>Código</dt><dd>{tracking.equipamento.codigoBarrasInterno}</dd>
              <dt>Tipo / modelo</dt><dd>{humanize(tracking.equipamento.tipo)} · {tracking.equipamento.marca} {tracking.equipamento.modelo}</dd>
              <dt>Estado físico</dt><dd>{humanize(tracking.equipamento.estadoFisico)}</dd>
              <dt>Status</dt><dd>{humanize(tracking.equipamento.statusRastreamento)}</dd>
              <dt>Lote</dt><dd className="monospace">{tracking.lote.id}</dd>
              <dt>Organização</dt><dd>{tracking.organizacao.razaoSocial}</dd>
            </dl>
          </Panel>
          <Panel title="Histórico de movimentações">
            {!tracking.movimentacoes.length ? (
              <p className="table-message">Este equipamento ainda não possui movimentações registradas.</p>
            ) : (
              <div className="timeline">
                {tracking.movimentacoes.map((movement: MovimentacaoApi) => (
                  <article className="timeline-item" key={movement.id}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <div>
                      <strong>{humanize(movement.destino)}</strong>
                      <p>{humanize(movement.origem)} → {humanize(movement.destino)}</p>
                      <small>{dateLabel(movement.dataHora)} · {movement.responsavel}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

export function ReportsScreen() {
  const { authenticatedRequest } = useAuth()
  const { data: organizations } = useApiData<OrganizacaoApi[]>('/organizacoes')
  const { feedback, busy, run } = useAction()
  const [statusEquipment, setStatusEquipment] = useState<EquipamentoApi[] | null>(null)
  const [financialContracts, setFinancialContracts] = useState<ContratoApi[] | null>(null)
  const [organizationReport, setOrganizationReport] = useState<RelatorioOrganizacaoApi | null>(null)

  async function reportStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const status = formValue(event.currentTarget, 'status') as StatusRastreamentoApi
    setStatusEquipment(null)
    await run(
      async () => {
        const result = await authenticatedRequest<EquipamentoApi[]>(
          `/relatorios/status/${encodeURIComponent(status)}`,
        )
        setStatusEquipment(result ?? [])
      },
      'Relatório por status carregado.',
    )
  }

  async function reportFinancial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const inicio = new Date(`${formValue(form, 'inicio')}T00:00:00`).toISOString()
    const fim = new Date(`${formValue(form, 'fim')}T23:59:59.999`).toISOString()
    const query = new URLSearchParams({ inicio, fim })
    setFinancialContracts(null)
    await run(
      async () => {
        const result = await authenticatedRequest<ContratoApi[]>(`/relatorios/financeiro?${query}`)
        setFinancialContracts(result ?? [])
      },
      'Relatório financeiro carregado.',
    )
  }

  async function reportOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const id = formValue(form, 'organizacaoId')
    const inicio = new Date(`${formValue(form, 'inicio')}T00:00:00`).toISOString()
    const fim = new Date(`${formValue(form, 'fim')}T23:59:59.999`).toISOString()
    const query = new URLSearchParams({ dataInicio: inicio, dataFim: fim })
    setOrganizationReport(null)
    await run(
      async () => {
        const result = await authenticatedRequest<RelatorioOrganizacaoApi>(
          `/relatorios/organizacoes/${encodeURIComponent(id)}?${query}`,
        )
        setOrganizationReport(result ?? null)
      },
      'Relatório da organização carregado.',
    )
  }

  return (
    <div className="screen-stack">
      <Feedback value={feedback} />
      <Panel title="Equipamentos por status">
        <form className="inline-form" onSubmit={reportStatus}>
          <SelectField label="Status de rastreamento" name="status" values={STATUS_RASTREAMENTO} />
          <button className="secondary-button" disabled={busy} type="submit">Gerar relatório</button>
        </form>
        {statusEquipment && <EquipmentReport items={statusEquipment} />}
      </Panel>

      <Panel title="Relatório financeiro" description="Contratos assinados no intervalo informado.">
        <form className="inline-form" onSubmit={reportFinancial}>
          <TextField label="Início" name="inicio" required type="date" />
          <TextField label="Fim" name="fim" required type="date" />
          <button className="secondary-button" disabled={busy} type="submit">Consultar</button>
        </form>
        {financialContracts && (
          <div className="report-result">
            <p>{financialContracts.length} contrato(s) encontrado(s).</p>
            {financialContracts.map((contract) => (
              <p className="report-line" key={contract.id}>
                {contract.organizacaoId} · {dateLabel(contract.dataAssinatura)} · {formatCurrency(contract.valorMensal)}
              </p>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Relatório por organização">
        <form className="form-grid" onSubmit={reportOrganization}>
          <label className="form-field form-field-wide">
            <span>Organização</span>
            <select name="organizacaoId" required>
              <option value="">Selecione uma organização</option>
              {organizations?.map((organization) => <option key={organization.id} value={organization.id}>{organization.razaoSocial}</option>)}
            </select>
          </label>
          <TextField label="Início" name="inicio" required type="date" />
          <TextField label="Fim" name="fim" required type="date" />
          <SubmitButton busy={busy}>Gerar relatório</SubmitButton>
        </form>
        {organizationReport && (
          <div className="report-result">
            <h3>{organizationReport.organizacao.razaoSocial}</h3>
            <p>{organizationReport.lotes.length} lote(s) no período.</p>
            {organizationReport.lotes.map((lot) => (
              <p className="report-line" key={lot.id}>{lot.notaFiscal} · {dateLabel(lot.dataEntrada)} · {humanize(lot.statusProcessamento)}</p>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function EquipmentReport({ items }: { items: EquipamentoApi[] }) {
  if (!items.length) {
    return <p className="table-message">Nenhum equipamento neste status.</p>
  }
  return (
    <div className="table-scroll report-table">
      <table>
        <thead><tr><th>Código</th><th>Tipo</th><th>Marca / modelo</th><th>Estado</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.codigoBarrasInterno}</td>
              <td>{humanize(item.tipo)}</td>
              <td>{item.marca} {item.modelo}</td>
              <td>{humanize(item.estadoFisico)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ParametersScreen() {
  const { authenticatedRequest } = useAuth()
  const { data: parameters, error, loading, reload } =
    useApiData<ParametrosApi>('/parametros-globais')
  const { feedback, busy, run } = useAction()
  const [aliquotasError, setAliquotasError] = useState('')

  async function updateParameters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!parameters) return
    const form = event.currentTarget
    const aliquotasText = formValue(form, 'aliquotasImpostos')
    let aliquotasImpostos: Record<string, number> | undefined

    if (aliquotasText) {
      aliquotasImpostos = {}
      for (const entry of aliquotasText.split(',')) {
        const [rawName, rawValue] = entry.split('=')
        const name = rawName?.trim()
        const value = Number(rawValue)
        if (!name || rawValue === undefined || !Number.isFinite(value)) {
          setAliquotasError('Use o formato NOME=0.18 e separe as alíquotas por vírgula.')
          return
        }
        aliquotasImpostos[name] = value
      }
    }
    setAliquotasError('')

    const coefficientText = formValue(form, 'coeficienteDepreciacao')
    const body = {
      version: parameters.version,
      ...(aliquotasImpostos ? { aliquotasImpostos } : {}),
      ...(coefficientText ? { coeficienteDepreciacao: Number(coefficientText) } : {}),
    }
    const ok = await run(
      () => authenticatedRequest('/parametros-globais', { method: 'PATCH', body }),
      'Parâmetros atualizados.',
      async () => Boolean(await reload()),
    )
    if (ok) await reload()
  }

  return (
    <div className="screen-stack">
      <Feedback value={feedback} />
      <Panel title="Parâmetros atuais">
        <TableMessage loading={loading} error={error} empty={!parameters} />
        {parameters && (
          <dl className="detail-grid">
            <dt>Coeficiente de depreciação</dt><dd>{parameters.coeficienteDepreciacao}</dd>
            <dt>Alíquotas de impostos</dt>
            <dd>{Object.entries(parameters.aliquotasImpostos).map(([name, value]) => `${name}: ${value}`).join(' · ') || 'Nenhuma configurada'}</dd>
            <dt>Versão</dt><dd>{parameters.version}</dd>
          </dl>
        )}
      </Panel>
      {parameters && (
        <Panel title="Atualizar parâmetros" description="As frações devem estar entre 0 e 1. Deixe um campo vazio para mantê-lo.">
          <form className="form-grid" onSubmit={updateParameters}>
            <TextField label="Coeficiente de depreciação" name="coeficienteDepreciacao" min={0} max={1} step="0.01" type="number" />
            <TextField
              error={aliquotasError}
              label="Alíquotas (ex.: ICMS=0.18, IPI=0.1)"
              name="aliquotasImpostos"
              onChange={() => setAliquotasError('')}
            />
            <span className="version-note">Versão usada na atualização: {parameters.version}</span>
            <SubmitButton busy={busy}>Salvar parâmetros</SubmitButton>
          </form>
        </Panel>
      )}
    </div>
  )
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
