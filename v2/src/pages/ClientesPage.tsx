import { useState } from 'react'
import { Users, UserCheck, Plus, Search, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'
import { Modal } from '@/components/ui/modal'
import { LoadingState } from '@/components/ui/skeleton'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { PassageiroForm } from '@/components/passageiros/PassageiroForm'
import { useClientes } from '@/hooks/useClientes'
import { usePassageiros } from '@/hooks/usePassageiros'
import { formatarData } from '@/lib/utils'
import type { Cliente, Passageiro } from '@/types/database'

type Aba = 'clientes' | 'passageiros'

const tipoOptions = [
  { value: '', label: 'Todos os tipos' },
  { value: 'pessoa_fisica', label: 'Pessoa Física' },
  { value: 'pessoa_juridica', label: 'Pessoa Jurídica' },
]

const tipoLabels: Record<string, string> = {
  pessoa_fisica: 'Pessoa Física',
  pessoa_juridica: 'Pessoa Jurídica',
}

export function ClientesPage() {
  const [aba, setAba] = useState<Aba>('clientes')

  // Clientes
  const [searchCliente, setSearchCliente] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [modalCliente, setModalCliente] = useState<{
    open: boolean
    cliente: Cliente | null
  }>({ open: false, cliente: null })

  // Passageiros
  const [searchPassageiro, setSearchPassageiro] = useState('')
  const [modalPassageiro, setModalPassageiro] = useState<{
    open: boolean
    passageiro: Passageiro | null
  }>({ open: false, passageiro: null })

  const clientesQuery = useClientes()
  const passageirosQuery = usePassageiros()

  const clientesFiltrados = (clientesQuery.data ?? []).filter((c) => {
    const s = searchCliente.toLowerCase()
    const matchSearch =
      !s ||
      c.nome.toLowerCase().includes(s) ||
      (c.cpf_cnpj ?? '').includes(s) ||
      (c.email ?? '').toLowerCase().includes(s)
    const matchTipo = !filterTipo || c.tipo === filterTipo
    return matchSearch && matchTipo
  })

  const passageirosFiltrados = (passageirosQuery.data ?? []).filter((p) => {
    const s = searchPassageiro.toLowerCase()
    return (
      !s ||
      p.nome.toLowerCase().includes(s) ||
      (p.cpf ?? '').includes(s) ||
      (p.passaporte ?? '').toLowerCase().includes(s)
    )
  })

  const abrirNovoCliente = () => setModalCliente({ open: true, cliente: null })
  const abrirEditarCliente = (c: Cliente) => setModalCliente({ open: true, cliente: c })
  const fecharModalCliente = () => setModalCliente({ open: false, cliente: null })

  const abrirNovoPassageiro = () => setModalPassageiro({ open: true, passageiro: null })
  const abrirEditarPassageiro = (p: Passageiro) => setModalPassageiro({ open: true, passageiro: p })
  const fecharModalPassageiro = () => setModalPassageiro({ open: false, passageiro: null })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Clientes e Passageiros
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {clientesQuery.data?.length ?? 0} clientes
            {' · '}
            {passageirosQuery.data?.length ?? 0} passageiros
          </p>
        </div>
        {aba === 'clientes' ? (
          <Button size="sm" onClick={abrirNovoCliente}>
            <Plus className="h-3.5 w-3.5" />
            Nova Pessoa
          </Button>
        ) : (
          <Button size="sm" onClick={abrirNovoPassageiro}>
            <Plus className="h-3.5 w-3.5" />
            Novo Passageiro
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => setAba('clientes')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            aba === 'clientes'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Clientes
        </button>
        <button
          type="button"
          onClick={() => setAba('passageiros')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            aba === 'passageiros'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          Passageiros
        </button>
      </div>

      {/* ── Aba Clientes ── */}
      {aba === 'clientes' && (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div className="flex-1 min-w-48">
                <Input
                  placeholder="Buscar por nome, CPF/CNPJ ou e-mail…"
                  value={searchCliente}
                  onChange={(e) => setSearchCliente(e.target.value)}
                  leftIcon={<Search className="h-3.5 w-3.5" />}
                />
              </div>
              <div className="w-48">
                <Select
                  options={tipoOptions}
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value)}
                />
              </div>
              {(searchCliente || filterTipo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchCliente('')
                    setFilterTipo('')
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </Card>

          <Card>
            {clientesQuery.isLoading ? (
              <LoadingState rows={5} />
            ) : clientesQuery.error ? (
              <div className="p-4">
                <Alert variant="destructive" title="Erro ao carregar clientes">
                  {(clientesQuery.error as Error).message}
                </Alert>
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={
                  searchCliente || filterTipo
                    ? 'Nenhum cliente encontrado'
                    : 'Nenhum cliente cadastrado'
                }
                description={
                  searchCliente || filterTipo
                    ? 'Tente ajustar os filtros.'
                    : 'Adicione o primeiro cliente da sua agência.'
                }
                action={
                  !searchCliente && !filterTipo ? (
                    <Button size="sm" onClick={abrirNovoCliente}>
                      <Plus className="h-3.5 w-3.5" />
                      Nova Pessoa
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Tipo</TableHead>
                    <TableHead className="hidden lg:table-cell">CPF / CNPJ</TableHead>
                    <TableHead className="hidden lg:table-cell">Telefone</TableHead>
                    <TableHead className="hidden xl:table-cell">E-mail</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesFiltrados.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => abrirEditarCliente(c)}
                    >
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="default">{tipoLabels[c.tipo] ?? c.tipo}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {c.cpf_cnpj ?? '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {c.telefone ?? '—'}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground max-w-[200px] truncate">
                        {c.email ?? '—'}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirEditarCliente(c)
                          }}
                          aria-label={`Editar ${c.nome}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {/* ── Aba Passageiros ── */}
      {aba === 'passageiros' && (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div className="flex-1 min-w-48">
                <Input
                  placeholder="Buscar por nome, CPF ou passaporte…"
                  value={searchPassageiro}
                  onChange={(e) => setSearchPassageiro(e.target.value)}
                  leftIcon={<Search className="h-3.5 w-3.5" />}
                />
              </div>
              {searchPassageiro && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchPassageiro('')}
                >
                  Limpar
                </Button>
              )}
            </div>
          </Card>

          <Card>
            {passageirosQuery.isLoading ? (
              <LoadingState rows={5} />
            ) : passageirosQuery.error ? (
              <div className="p-4">
                <Alert variant="destructive" title="Erro ao carregar passageiros">
                  {(passageirosQuery.error as Error).message}
                </Alert>
              </div>
            ) : passageirosFiltrados.length === 0 ? (
              <EmptyState
                icon={<UserCheck className="h-6 w-6" />}
                title={
                  searchPassageiro
                    ? 'Nenhum passageiro encontrado'
                    : 'Nenhum passageiro cadastrado'
                }
                description={
                  searchPassageiro
                    ? 'Tente ajustar a busca.'
                    : 'Adicione o primeiro passageiro da sua agência.'
                }
                action={
                  !searchPassageiro ? (
                    <Button size="sm" onClick={abrirNovoPassageiro}>
                      <Plus className="h-3.5 w-3.5" />
                      Novo Passageiro
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Nacionalidade</TableHead>
                    <TableHead className="hidden lg:table-cell">CPF</TableHead>
                    <TableHead className="hidden lg:table-cell">Passaporte</TableHead>
                    <TableHead className="hidden xl:table-cell">Venc. Passaporte</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {passageirosFiltrados.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => abrirEditarPassageiro(p)}
                    >
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {p.nacionalidade}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {p.cpf ?? '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-xs">
                        {p.passaporte ?? '—'}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground">
                        {p.passaporte_venc ? formatarData(p.passaporte_venc) : '—'}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirEditarPassageiro(p)
                          }}
                          aria-label={`Editar ${p.nome}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {/* Modal Clientes */}
      <Modal
        open={modalCliente.open}
        onClose={fecharModalCliente}
        title={modalCliente.cliente ? 'Editar Cliente' : 'Novo Cliente'}
        size="lg"
      >
        <ClienteForm
          cliente={modalCliente.cliente}
          onSuccess={fecharModalCliente}
          onCancel={fecharModalCliente}
        />
      </Modal>

      {/* Modal Passageiros */}
      <Modal
        open={modalPassageiro.open}
        onClose={fecharModalPassageiro}
        title={modalPassageiro.passageiro ? 'Editar Passageiro' : 'Novo Passageiro'}
        size="md"
      >
        <PassageiroForm
          passageiro={modalPassageiro.passageiro}
          onSuccess={fecharModalPassageiro}
          onCancel={fecharModalPassageiro}
        />
      </Modal>
    </div>
  )
}
