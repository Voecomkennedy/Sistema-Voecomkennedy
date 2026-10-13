#!/bin/zsh
# Execução exclusivamente interativa no Mac mini. Nunca recebe senha por argumento,
# variável de ambiente, arquivo do projeto ou histórico do shell.
set -euo pipefail

volume='/Volumes/HD externo'
root="$volume/Codex-eval-preparation/backups/Sistema-Voecomkennedy"
project='qryobmqrkzddcvlvgfrp'
host='aws-1-sa-east-1.pooler.supabase.com'

if [[ ! -t 0 || ! -d "$volume" ]]; then
  print -u2 'Terminal interativo e HD externo montado são obrigatórios.'
  exit 2
fi
for program in pg_dump pg_restore shasum mktemp; do
  if ! command -v "$program" >/dev/null; then
    print -u2 "Programa ausente: $program"
    exit 2
  fi
done

# Força o prompt nativo do PostgreSQL, que não ecoa o que a pessoa digita.
unset PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGHOST PGPORT PGUSER PGDATABASE
export PGPASSFILE=/dev/null PGSSLMODE=require PGCONNECT_TIMEOUT=10
umask 077
mkdir -p "$root"
backup_dir="$(mktemp -d "$root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
partial="$backup_dir/database.dump.partial"

print "BACKUP PostgreSQL — Sistema Voecomkennedy"
print "Projeto principal: $project"
print "Destino no HD externo: $backup_dir"
print 'Digite a senha EXISTENTE somente no próximo prompt Password: do PostgreSQL.'
print 'A digitação ficará invisível. Não envie a senha pelo chat.'
print 'Se não souber a senha, pressione Ctrl+C. Nada será redefinido.'

pg_dump --host="$host" --port=5432 --username="postgres.$project" \
  --dbname=postgres --password --format=custom --file="$partial"
pg_restore --list "$partial" >/dev/null
mv "$partial" "$backup_dir/database.dump"
(cd "$backup_dir" && shasum -a 256 database.dump > database.dump.sha256)
date -u +%Y-%m-%dT%H:%M:%SZ > "$backup_dir/DATABASE_DUMP_OK"
print "Dump PostgreSQL criado e estrutura verificada em: $backup_dir"
print 'Ainda faltam inventário/cópia de arquivos e restauração isolada; não aplique migrações.'
