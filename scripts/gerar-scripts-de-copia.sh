#!/usr/bin/env bash
# =============================================================================
#  gerar-scripts-de-copia.sh
#
#  Atualiza os dois scripts que copiam o projeto sem "git clone":
#    • scripts/baixar-sonora.sh  → reescreve a lista de arquivos embutida
#    • scripts/sonora-offline.sh → recria o instalador com o projeto embutido
#
#  Roda sozinho no GitHub Actions a cada push na main
#  (.github/workflows/scripts-de-copia.yml). Para rodar à mão, faça
#  "git add" das mudanças antes e depois:  bash scripts/gerar-scripts-de-copia.sh
# =============================================================================
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

REPO="${SONORA_REPO:-Lajuro/sonora-studio}"
BAIXAR="scripts/baixar-sonora.sh"
OFFLINE="scripts/sonora-offline.sh"

COMMIT="$(git rev-parse --short HEAD)"
COMMIT_DATE="$(git log -1 --format=%cs HEAD)"
if [ -n "$(git status --porcelain -- . ":(exclude)$BAIXAR" ":(exclude)$OFFLINE")" ]; then
  COMMIT="$COMMIT + alterações locais"
fi

# ------------------------------------------------------------ manifesto ----
MANIFEST="$(mktemp)"
PAYLOAD="$(mktemp)"
trap 'rm -f "$MANIFEST" "$PAYLOAD" "$PAYLOAD.b64"' EXIT

git ls-files -s -z | while IFS= read -r -d '' entry; do
  meta="${entry%%$'\t'*}"
  path="${entry#*$'\t'}"
  mode="${meta%% *}"
  [ -f "$path" ] || continue
  case "$path" in
    "$BAIXAR" | "$OFFLINE") sha="-" ;;
    *) sha="$(git hash-object --no-filters -- "$path")" ;;
  esac
  printf '%s %s %s\n' "$mode" "$sha" "$path"
done >"$MANIFEST"

TOTAL="$(grep -c . "$MANIFEST")"

awk -v commit="$COMMIT" -v list="$MANIFEST" '
  /^# >>> MANIFESTO/ {
    print
    print "MANIFEST_COMMIT=\"" commit "\""
    print "manifest() {"
    print "  cat <<'"'"'MANIFESTO'"'"'"
    while ((getline line < list) > 0) print line
    print "MANIFESTO"
    print "}"
    skip = 1
    next
  }
  /^# <<< MANIFESTO/ { skip = 0 }
  !skip { print }
' "$BAIXAR" >"$BAIXAR.tmp"
mv "$BAIXAR.tmp" "$BAIXAR"
chmod +x "$BAIXAR"
echo "✓ $BAIXAR: lista com $TOTAL arquivos (commit $COMMIT)"

# --------------------------------------------------- instalador offline ----
# tar determinístico: mesmo conteúdo gera exatamente o mesmo arquivo
TAR_OPTS=(--owner=0 --group=0 --numeric-owner --mtime=@0)
tar --sort=name -cf /dev/null --files-from /dev/null 2>/dev/null && TAR_OPTS+=(--sort=name)

git ls-files -z | grep -zv "^$OFFLINE\$" | while IFS= read -r -d '' f; do
  [ -f "$f" ] && printf '%s\0' "$f"
done | tar "${TAR_OPTS[@]}" --null -T - -cf - | gzip -9n >"$PAYLOAD"

if base64 -w 76 </dev/null >/dev/null 2>&1; then
  base64 -w 76 "$PAYLOAD" >"$PAYLOAD.b64"
else
  base64 -b 76 -i "$PAYLOAD" >"$PAYLOAD.b64"
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHA256="$(sha256sum "$PAYLOAD" | cut -d' ' -f1)"
else
  SHA256="$(shasum -a 256 "$PAYLOAD" | cut -d' ' -f1)"
fi
FILES_IN="$(tar -tzf "$PAYLOAD" | grep -vc '/$')"
SIZE_KB="$(($(wc -c <"$PAYLOAD") / 1024))"

{
  cat <<'HEAD'
#!/usr/bin/env bash
if grep -q $'\r' "$0" 2>/dev/null; then tr -d '\r' <"$0" >"$0.lf" && SONORA_LF_COPY="$0.lf" exec bash "$0.lf" "$@"; fi #
HEAD
  cat <<EOF
# =============================================================================
#  sonora-offline.sh  (gerado por scripts/gerar-scripts-de-copia.sh, não edite)
#
#  Instalador SEM rede do repositório $REPO: o projeto inteiro
#  está aqui dentro (tar.gz em base64). Use quando nem o baixar-sonora.sh
#  consegue acessar o GitHub. Basta copiar este arquivo e rodar.
#
#  Origem: commit $COMMIT de $COMMIT_DATE · $FILES_IN arquivos · ${SIZE_KB} KB compactado
#
#  Uso (no Windows, rode no Git Bash):
#    bash sonora-offline.sh                 # cria a pasta ./sonora-studio
#    bash sonora-offline.sh minha-pasta     # escolhe a pasta de destino
#    bash sonora-offline.sh --forcar        # aceita pasta que já tem arquivos
# =============================================================================
set -euo pipefail

SHA256="$SHA256"
COMMIT="$COMMIT"
EOF
  cat <<'BODY'
DEST="sonora-studio"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --forcar | --force | -f) FORCE=1 ;;
    -h | --ajuda | --help) sed -n '4,/^# =====/p' "${SONORA_LF_COPY:-$0}" | sed 's/^# \{0,1\}//' | grep -v '^=====' ; exit 0 ;;
    -*) echo "Opção desconhecida: $arg" >&2; exit 1 ;;
    *) DEST="$arg" ;;
  esac
done

die() { echo "✗ $*" >&2; exit 1; }

main() {
  if [ -e "$DEST" ] && [ ! -d "$DEST" ]; then die "\"$DEST\" já existe e não é uma pasta."; fi
  if [ -d "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ] && [ "$FORCE" = 0 ]; then
    die "A pasta \"$DEST\" já tem arquivos. Escolha outra pasta ou use --forcar."
  fi
  command -v tar >/dev/null 2>&1 || die "Preciso do tar instalado."

  WORK="$(mktemp -d 2>/dev/null || mktemp -d -t sonora)"
  trap 'rm -rf "$WORK"; [ -n "${SONORA_LF_COPY:-}" ] && rm -f "$SONORA_LF_COPY"; true' EXIT
  local work="$WORK"

  echo "› Extraindo o Sonora (commit $COMMIT)…"
  payload | tr -d '\r\n ' >"$work/p.b64"
  if ! base64 -d <"$work/p.b64" >"$work/p.tgz" 2>/dev/null; then
    if ! base64 -D <"$work/p.b64" >"$work/p.tgz" 2>/dev/null; then
      openssl base64 -d -A <"$work/p.b64" >"$work/p.tgz" || die "Não consegui decodificar (falta base64/openssl)."
    fi
  fi

  local actual=""
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$work/p.tgz" | cut -d' ' -f1)"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$work/p.tgz" | cut -d' ' -f1)"
  fi
  if [ -n "$actual" ] && [ "$actual" != "$SHA256" ]; then
    die "O conteúdo não confere (o arquivo foi alterado ou cortado ao copiar). Copie de novo o script inteiro."
  fi
  [ -n "$actual" ] && echo "✓ Integridade conferida (SHA-256)"

  mkdir -p "$DEST"
  tar -xzf "$work/p.tgz" -C "$DEST"
  # o próprio instalador também faz parte do repositório
  local self="${SONORA_LF_COPY:-$0}"
  if [ -f "$self" ] && [ -d "$DEST/scripts" ]; then cp "$self" "$DEST/scripts/sonora-offline.sh"; fi
  chmod +x "$DEST"/scripts/*.sh 2>/dev/null || true
  echo "✓ Projeto extraído em $DEST ($(tar -tzf "$work/p.tgz" | grep -vc '/$') arquivos)"
  echo
  echo "Próximos passos"
  echo "  cd \"$DEST\""
  echo "  npm install"
  echo "  npm run dev        # abre em http://localhost:3000"
}

payload() {
  cat <<'PAYLOAD'
BODY
  cat "$PAYLOAD.b64"
  cat <<'TAIL'
PAYLOAD
}

main
TAIL
} >"$OFFLINE"
chmod +x "$OFFLINE"
echo "✓ $OFFLINE: $FILES_IN arquivos, ${SIZE_KB} KB compactado"
