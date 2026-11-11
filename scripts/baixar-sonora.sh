#!/usr/bin/env bash
if grep -q $'\r' "$0" 2>/dev/null; then tr -d '\r' <"$0" >"$0.lf" && SONORA_LF_COPY="$0.lf" exec bash "$0.lf" "$@"; fi #
# =============================================================================
#  baixar-sonora.sh
#
#  Copia o repositório Lajuro/sonora-studio para a sua máquina SEM usar
#  "git clone". Útil em redes corporativas onde o GitHub abre no navegador,
#  mas o protocolo do git é bloqueado.
#
#  Ele tenta, nesta ordem, até um funcionar:
#    1. zip   → baixa o pacote .tar.gz/.zip do repositório (um download só)
#    2. api   → lista os arquivos pela API do GitHub e baixa um por um
#    3. lista → usa a lista de arquivos embutida neste script e baixa um por um
#  Nos modos 2 e 3 cada arquivo é conferido pelo hash do git (SHA-1), então a
#  cópia fica idêntica ao repositório.
#
#  Uso (no Windows, rode no Git Bash):
#    bash baixar-sonora.sh                  # cria a pasta ./sonora-studio
#    bash baixar-sonora.sh minha-pasta      # escolhe a pasta de destino
#    bash baixar-sonora.sh --git --instalar # já cria um repositório git local e roda npm install
#
#  Opções:
#    --ref <branch|tag|commit>  versão a baixar (padrão: main)
#    --metodo auto|zip|api|lista
#    --git          inicia um repositório git local com um commit da cópia
#    --instalar     roda "npm install" no final
#    --inseguro     ignora erros de certificado (proxy corporativo que intercepta HTTPS)
#    --forcar       aceita pasta de destino que já tem arquivos (sobrescreve)
#    -h, --ajuda    mostra esta ajuda
#
#  Variáveis opcionais (para proxy ou espelho interno do GitHub):
#    HTTPS_PROXY, SONORA_REPO, SONORA_ARCHIVE_BASE, SONORA_RAW_BASE,
#    SONORA_API_BASE, SONORA_WEB_BASE
# =============================================================================

set -euo pipefail

REPO="${SONORA_REPO:-Lajuro/sonora-studio}"
REF="${SONORA_REF:-main}"
ARCHIVE_BASE="${SONORA_ARCHIVE_BASE:-https://codeload.github.com}"
RAW_BASE="${SONORA_RAW_BASE:-https://raw.githubusercontent.com}"
API_BASE="${SONORA_API_BASE:-https://api.github.com}"
WEB_BASE="${SONORA_WEB_BASE:-https://github.com}"

DEST=""
METHOD="auto"
DO_GIT=0
DO_INSTALL=0
INSECURE=0
FORCE=0

# ----------------------------------------------------------------- saída ----
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m' C_DIM=$'\033[2m' C_BOLD=$'\033[1m'
  C_OK=$'\033[32m' C_WARN=$'\033[33m' C_ERR=$'\033[31m' C_ACC=$'\033[35m'
else
  C_RESET="" C_DIM="" C_BOLD="" C_OK="" C_WARN="" C_ERR="" C_ACC=""
fi
info() { printf '%s\n' "${C_ACC}›${C_RESET} $*"; }
ok() { printf '%s\n' "${C_OK}✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_WARN}!${C_RESET} $*" >&2; }
die() {
  printf '%s\n' "${C_ERR}✗ $*${C_RESET}" >&2
  exit 1
}
dim() { printf '%s\n' "${C_DIM}$*${C_RESET}"; }

ajuda() {
  sed -n '3,/^# =====/p' "${SONORA_LF_COPY:-$0}" 2>/dev/null | sed 's/^# \{0,1\}//' | grep -v '^=====' || true
  exit 0
}

# ------------------------------------------------------------ argumentos ----
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?informe a ref}"; shift 2 ;;
    --ref=*) REF="${1#*=}"; shift ;;
    --metodo | --method) METHOD="${2:?informe o método}"; shift 2 ;;
    --metodo=* | --method=*) METHOD="${1#*=}"; shift ;;
    --git) DO_GIT=1; shift ;;
    --instalar | --install) DO_INSTALL=1; shift ;;
    --inseguro | --insecure | -k) INSECURE=1; shift ;;
    --forcar | --force | -f) FORCE=1; shift ;;
    -h | --ajuda | --help) ajuda ;;
    -*) die "Opção desconhecida: $1 (use --ajuda)" ;;
    *) DEST="$1"; shift ;;
  esac
done

case "$METHOD" in auto | zip | api | lista) ;; *) die "Método inválido: $METHOD (use auto, zip, api ou lista)" ;; esac
[ -n "$DEST" ] || DEST="${REPO##*/}"

# ---------------------------------------------------------- ferramentas ----
if command -v curl >/dev/null 2>&1; then
  DL=curl
  DL_OPTS=(-fsSL --retry 2 --connect-timeout 20 --max-time 600 -A "sonora-baixar/1.0")
  [ "$INSECURE" = 1 ] && DL_OPTS+=(-k)
elif command -v wget >/dev/null 2>&1; then
  DL=wget
  DL_OPTS=(-q --tries=2 --timeout=60 -U "sonora-baixar/1.0")
  [ "$INSECURE" = 1 ] && DL_OPTS+=(--no-check-certificate)
else
  die "Preciso do curl ou do wget instalado."
fi

HAS_GIT=0
command -v git >/dev/null 2>&1 && HAS_GIT=1

download() { # url destino
  mkdir -p "$(dirname "$2")"
  if [ "$DL" = curl ]; then
    curl "${DL_OPTS[@]}" -o "$2" "$1" 2>"$WORK/ultimo-erro.txt"
  else
    wget "${DL_OPTS[@]}" -O "$2" "$1" 2>"$WORK/ultimo-erro.txt"
  fi
}

last_error() {
  [ -s "$WORK/ultimo-erro.txt" ] && head -c 300 "$WORK/ultimo-erro.txt" | tr '\n' ' '
  return 0
}

urlencode() {
  local LC_ALL=C s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [A-Za-z0-9._~/-]) out+="$c" ;;
      *) out+=$(printf '%%%02X' "'$c") ;;
    esac
  done
  printf '%s' "$out"
}

# Hash do git (SHA-1 de "blob <tamanho>\0<conteúdo>") sem precisar de repositório.
blob_sha() {
  if [ "$HAS_GIT" = 1 ]; then
    git hash-object --no-filters -- "$1"
    return
  fi
  local size
  size=$(wc -c <"$1")
  size="${size//[[:space:]]/}"
  if command -v sha1sum >/dev/null 2>&1; then
    { printf 'blob %s\0' "$size"; cat -- "$1"; } | sha1sum | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    { printf 'blob %s\0' "$size"; cat -- "$1"; } | shasum -a 1 | cut -d' ' -f1
  else
    echo "?"
  fi
}

# ------------------------------------------------------------ preparação ----
if [ -e "$DEST" ] && [ ! -d "$DEST" ]; then die "\"$DEST\" já existe e não é uma pasta."; fi
if [ -d "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ] && [ "$FORCE" = 0 ]; then
  die "A pasta \"$DEST\" já tem arquivos. Escolha outra pasta ou use --forcar."
fi

WORK="$(mktemp -d 2>/dev/null || mktemp -d -t sonora)"
STAGE="$WORK/repo"
cleanup() {
  rm -rf "$WORK"
  [ -n "${SONORA_LF_COPY:-}" ] && rm -f "$SONORA_LF_COPY"
  return 0
}
trap cleanup EXIT
mkdir -p "$STAGE"

printf '\n%s\n' "${C_BOLD}Sonora · cópia sem git clone${C_RESET}"
dim "  repositório: $REPO   versão: $REF   destino: $DEST"
[ "$INSECURE" = 1 ] && warn "Verificação de certificado desligada (--inseguro)."
echo

# ------------------------------------------------------ método 1: pacote ----
try_archive() {
  local url
  info "Tentando baixar o pacote do repositório…"
  for url in "$ARCHIVE_BASE/$REPO/tar.gz/$REF" "$WEB_BASE/$REPO/archive/$REF.tar.gz"; do
    dim "  $url"
    if download "$url" "$WORK/repo.tar.gz" && tar -tzf "$WORK/repo.tar.gz" >/dev/null 2>&1; then
      rm -rf "$STAGE" && mkdir -p "$STAGE"
      if tar -xzf "$WORK/repo.tar.gz" -C "$STAGE" --strip-components=1 && [ -f "$STAGE/package.json" ]; then
        ok "Pacote .tar.gz baixado"
        return 0
      fi
    else
      dim "  falhou: $(last_error)"
    fi
  done
  if command -v unzip >/dev/null 2>&1; then
    for url in "$ARCHIVE_BASE/$REPO/zip/$REF" "$WEB_BASE/$REPO/archive/$REF.zip"; do
      dim "  $url"
      if download "$url" "$WORK/repo.zip"; then
        rm -rf "$WORK/unzip" && mkdir -p "$WORK/unzip"
        if unzip -q -o "$WORK/repo.zip" -d "$WORK/unzip" 2>/dev/null; then
          local inner
          inner="$(find "$WORK/unzip" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
          if [ -n "$inner" ] && [ -f "$inner/package.json" ]; then
            rm -rf "$STAGE" && mv "$inner" "$STAGE"
            ok "Pacote .zip baixado"
            return 0
          fi
        fi
      else
        dim "  falhou: $(last_error)"
      fi
    done
  fi
  return 1
}

# ------------------------------------------ métodos 2 e 3: arquivo a arquivo --
FAILED=()
MISMATCH=()

fetch_list() { # arquivo com linhas "modo sha caminho"
  local list="$1" total n=0 mode sha path enc base got actual
  total=$(grep -c . "$list" || true)
  [ "$total" -gt 0 ] || return 1
  rm -rf "$STAGE" && mkdir -p "$STAGE"
  FAILED=()
  MISMATCH=()
  while read -r mode sha path <&3; do
    [ -n "${path:-}" ] || continue
    n=$((n + 1))
    if [ -t 1 ]; then printf '\r\033[K  %s[%3d/%d]%s %s' "$C_DIM" "$n" "$total" "$C_RESET" "$path"; fi
    enc="$(urlencode "$path")"
    got=0
    for base in "$RAW_BASE/$REPO/$REF" "$WEB_BASE/$REPO/raw/$REF"; do
      if download "$base/$enc" "$STAGE/$path"; then
        got=1
        break
      fi
    done
    if [ "$got" = 0 ]; then
      FAILED+=("$path")
      # se os primeiros arquivos já falham, não adianta insistir
      if [ "$n" -ge 3 ] && [ "${#FAILED[@]}" -eq "$n" ]; then
        [ -t 1 ] && printf '\n'
        dim "  falhou: $(last_error)"
        return 1
      fi
      continue
    fi
    [ "$mode" = "100755" ] && chmod +x "$STAGE/$path"
    if [ "$sha" != "-" ]; then
      actual="$(blob_sha "$STAGE/$path")"
      if [ "$actual" != "?" ] && [ "$actual" != "$sha" ]; then MISMATCH+=("$path"); fi
    fi
  done 3<"$list"
  [ -t 1 ] && printf '\r\033[K'
  ok "$((n - ${#FAILED[@]})) de $n arquivos baixados"
  [ "${#FAILED[@]}" -eq 0 ]
}

list_from_api() {
  info "Tentando listar os arquivos pela API do GitHub…"
  local url="$API_BASE/repos/$REPO/git/trees/$(urlencode "$REF")?recursive=1"
  dim "  $url"
  if ! download "$url" "$WORK/tree.json"; then
    dim "  falhou: $(last_error)"
    return 1
  fi
  if command -v node >/dev/null 2>&1; then
    node -e '
      const t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
      if (t.truncated) process.exit(3)
      for (const e of t.tree || []) if (e.type === "blob") console.log(`${e.mode} ${e.sha} ${e.path}`)
    ' "$WORK/tree.json" >"$WORK/lista-api.txt" || return 1
  else
    local py=""
    command -v python3 >/dev/null 2>&1 && py=python3
    [ -z "$py" ] && command -v python >/dev/null 2>&1 && py=python
    [ -n "$py" ] || { dim "  sem node/python para ler a resposta"; return 1; }
    "$py" -c '
import json, sys
t = json.load(open(sys.argv[1], encoding="utf-8"))
if t.get("truncated"): sys.exit(3)
for e in t.get("tree", []):
    if e.get("type") == "blob": print(e["mode"], e["sha"], e["path"])
' "$WORK/tree.json" >"$WORK/lista-api.txt" || return 1
  fi
  [ -s "$WORK/lista-api.txt" ]
}

try_api() {
  list_from_api || return 1
  ok "$(grep -c . "$WORK/lista-api.txt") arquivos na lista"
  info "Baixando arquivo por arquivo…"
  fetch_list "$WORK/lista-api.txt" || return 1
  if [ "${#MISMATCH[@]}" -gt 0 ]; then
    warn "Conteúdo diferente do esperado em: ${MISMATCH[*]}"
    return 1
  fi
  return 0
}

try_manifest() {
  info "Usando a lista de arquivos embutida no script (gerada do commit $MANIFEST_COMMIT)…"
  manifest >"$WORK/lista-embutida.txt"
  fetch_list "$WORK/lista-embutida.txt" || return 1
  if [ "${#MISMATCH[@]}" -gt 0 ]; then
    warn "${#MISMATCH[@]} arquivo(s) mudaram depois que esta lista foi gerada."
    warn "Eles foram baixados na versão atual, mas arquivos novos podem ter ficado de fora:"
    printf '    %s\n' "${MISMATCH[@]}" >&2
    warn "Se precisar da cópia exata, use scripts/sonora-offline.sh."
  fi
  return 0
}

# -------------------------------------------------------------- execução ----
main() {
  USED=""
  case "$METHOD" in
    zip) try_archive && USED="pacote" ;;
    api) try_api && USED="API + arquivos" ;;
    lista) try_manifest && USED="lista embutida" ;;
    auto)
      if try_archive; then
        USED="pacote"
      elif try_api; then
        USED="API + arquivos"
      elif try_manifest; then
        USED="lista embutida"
      fi
      ;;
  esac

  if [ -z "$USED" ]; then
    echo
    printf '%s\n' "${C_ERR}✗ Não consegui baixar o repositório por nenhum caminho.${C_RESET}" >&2
    [ "${#FAILED[@]}" -gt 0 ] && warn "Arquivos que falharam: ${FAILED[*]:0:10}"
    cat >&2 <<EOF

  O que tentar:
   • Se o erro fala de certificado/SSL, rode de novo com --inseguro
     (o proxy da empresa provavelmente intercepta o HTTPS).
   • Se a empresa usa proxy, defina antes: export HTTPS_PROXY=http://proxy:porta
   • Confirme que o repositório está público: $WEB_BASE/$REPO
   • Plano B sem rede: abra scripts/sonora-offline.sh no GitHub, copie o
     conteúdo para um arquivo e rode com "bash". Ele já traz o projeto inteiro.
EOF
    exit 1
  fi

  for essential in package.json src/app/page.tsx; do
    [ -f "$STAGE/$essential" ] || die "A cópia ficou incompleta (faltou $essential)."
  done

  mkdir -p "$DEST"
  (
    shopt -s dotglob nullglob
    cp -R "$STAGE"/* "$DEST"/
  )
  FILES=$(find "$DEST" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l | tr -d ' ')
  echo
  ok "Repositório copiado para ${C_BOLD}$DEST${C_RESET} ($FILES arquivos, via $USED)"

  if [ "$DO_GIT" = 1 ]; then
    if [ "$HAS_GIT" = 1 ]; then
      (
        cd "$DEST"
        git init -q
        git checkout -q -b main 2>/dev/null || true
        git add -A
        if [ -z "$(git config user.name || true)" ]; then export GIT_AUTHOR_NAME="Sonora" GIT_COMMITTER_NAME="Sonora"; fi
        if [ -z "$(git config user.email || true)" ]; then export GIT_AUTHOR_EMAIL="sonora@local" GIT_COMMITTER_EMAIL="sonora@local"; fi
        git commit -q -m "Cópia de $REPO ($REF) baixada sem git clone"
        git remote add origin "$WEB_BASE/$REPO.git" 2>/dev/null || true
      )
      ok "Repositório git local criado (branch main, remote origin)"
    else
      warn "git não encontrado: pulei o --git"
    fi
  fi

  if [ "$DO_INSTALL" = 1 ]; then
    if command -v npm >/dev/null 2>&1; then
      info "Rodando npm install…"
      (cd "$DEST" && npm install)
      ok "Dependências instaladas"
    else
      warn "npm não encontrado: instale o Node.js 20+ e rode npm install na pasta."
    fi
  fi

  cat <<EOF

${C_BOLD}Próximos passos${C_RESET}
  cd "$DEST"
$([ "$DO_INSTALL" = 1 ] || echo "  npm install")
  npm run dev        ${C_DIM}# abre em http://localhost:3000${C_RESET}

EOF
}

# >>> MANIFESTO (gerado por scripts/gerar-scripts-de-copia.sh, não edite à mão)
MANIFEST_COMMIT="4928954 + alterações locais"
manifest() {
  cat <<'MANIFESTO'
100644 94beb5ffd8903a2c22cb68b0d6a117b7f6a7c6db .gitattributes
100644 23ff445eff83e41410e7335d2ad5ba0253f8416a .github/workflows/scripts-de-copia.yml
100644 5ef6a520780202a1d6addd833d800ccb1ecac0bb .gitignore
100644 af3b7c84114bafeee578bf1adff2ef74af2cc6a2 AGENTS.md
100644 9a8f647b4f6137b71e080dc6d180f73c1d7d64ec README.md
100644 2a427859bad941eca428977a1f77c6df68f8e0ae components.json
100644 05e726d1b4201bc8c7716d2b058279676582e8c0 eslint.config.mjs
100644 717c7c78315c43d2efff5fcad1c3a0effb73f9e4 next.config.ts
100644 81c8048e7092cddd4168eeea1f7e4ea4984dafe1 package-lock.json
100644 d7a1dc1329925d3dc40267f809934fb26536f99b package.json
100755 - scripts/baixar-sonora.sh
100644 fcac6d398d809399420ab06514fa2a379c632fca scripts/check.ts
100755 6622e9714a166ae607117fab085364a2e1a50d11 scripts/gerar-scripts-de-copia.sh
100755 - scripts/sonora-offline.sh
100644 a4490bfc608468ffa15940811d7e7cb08c637ef2 src/app/error.tsx
100644 c3300c3437c3c002d29ba3b9e5141a396a7f8dcf src/app/globals.css
100644 c212c3d58dffc99ef2a5efa0143ddc320e8f5666 src/app/icon.svg
100644 293af07010716ed40cbffba711b36cb1eee49ae5 src/app/layout.tsx
100644 79b11b4dc3f7d585d357907480494997d80f1d48 src/app/page.tsx
100644 c856dca8328815c8a7e7e12d5f4b444989f5a673 src/components/providers.tsx
100644 9670c7fe9ac5696b9ae0e6a29e4d27789ecdcb59 src/components/studio/app-shell.tsx
100644 7ca3af30f52f0ec63dbd182a8c4782d42d619a2a src/components/studio/collection-dialog.tsx
100644 f6f00f808b569d03088081434752d6eb71fef6d3 src/components/studio/command-palette.tsx
100644 994691b9a23317d5fe46ebfeaecf3468e98857cc src/components/studio/export-panel.tsx
100644 026859925f77070013a237b8655f1cd7256db384 src/components/studio/fx.tsx
100644 daa4144c599d8dbf7a77cca12ec1afee45db7159 src/components/studio/header.tsx
100644 4eedb918d45fa76dab5930cb36502b8c1a8d2733 src/components/studio/history-sidebar.tsx
100644 d40bc17b68f0938e78c04dd03f71a4e74abeaa91 src/components/studio/layer-meta.tsx
100644 8691d0ce6dd11e7b6bd2e013162f1aa9acb86c17 src/components/studio/layer-timeline.tsx
100644 37f47744580ce2eacc5add766f537753dd25a655 src/components/studio/logo.tsx
100644 d9ed8a6b06b79bad1451166fce9d7d0418cd8503 src/components/studio/mini-wave.tsx
100644 50f129a908e0af664777133b516a2cd3b07e4787 src/components/studio/prompt-preview.tsx
100644 89612af8f7f848713579ffcb2464c1fa7fe0bc88 src/components/studio/quick-tweaks.tsx
100644 cc7592e1e2677f12d5b85c937cb72d8eb560043e src/components/studio/recipe-editor.tsx
100644 b540b459f5cdec8df284d460fef46be8346707ff src/components/studio/recipe-preview.tsx
100644 b6e58352b093581617360a7a5604fd755b645677 src/components/studio/refine-popover.tsx
100644 0e705430389ab8e3d02d8c27b8eba41a4a26c003 src/components/studio/settings-dialog.tsx
100644 c7b18ead3179bd30cdbdadcf5091b6e539ecc018 src/components/studio/shortcuts-dialog.tsx
100644 e3881aab6529b520912ea13c1210843417e57106 src/components/studio/spectrum.tsx
100644 04bbaaa2bcf42f77dc6dd30608fcd29488b12118 src/components/studio/step-prompt.tsx
100644 fdacca2e263497e73c0fba49a2cd293170477cae src/components/studio/step-recipe.tsx
100644 9e0204e7bf52f133bb11bd14a910a46a096bb9df src/components/studio/step-sound.tsx
100644 fdad408599401eb92cf1560ac8b8709638d7e0b3 src/components/studio/studio-root.tsx
100644 dedf50b098d976dc0c257d1c488beefee020ed3f src/components/studio/waveform.tsx
100644 6a1ce6b041a37212c1f16c00d7ac16c8c748d12b src/components/ui/alert-dialog.tsx
100644 837196ca26a6382662bb5d60c661f71605462ed9 src/components/ui/badge.tsx
100644 18407c9c49e4499a6bcb018a780ef72ad2fb84de src/components/ui/button.tsx
100644 cf02f4845b73e9895881a1a2e1b00a52bc576cd4 src/components/ui/card.tsx
100644 f952f172b1091ece62f179944b1569cde455a13c src/components/ui/command.tsx
100644 4153cb682d666acfed0ac1a3d8edae2324a805d4 src/components/ui/context-menu.tsx
100644 b3ded21495ad4813658244f673d7515903e76710 src/components/ui/dialog.tsx
100644 a789efd1e1333b27b451eeb46ebc574ef1c931db src/components/ui/dropdown-menu.tsx
100644 7cbf144670a3c152a406b70cc862ca17f12f08c9 src/components/ui/input-group.tsx
100644 7aa671b8616521b253353547db474097e502fdf0 src/components/ui/input.tsx
100644 2c12278c3cfd08de3bba6517addf6f28305a1610 src/components/ui/kbd.tsx
100644 5aff7469c384001a3f1b49cc5cf8871b10f10386 src/components/ui/label.tsx
100644 f56f71b86f9f0db3a50baf3c2f47afda0bca77c3 src/components/ui/popover.tsx
100644 49a1ff40078572b579a0b284b15529c369267da6 src/components/ui/progress.tsx
100644 786dd9c489b28bf1505026b89a992f72691137ac src/components/ui/resizable.tsx
100644 6e7681147e574150d7b45fa01bd55adf2e3e5d5b src/components/ui/scroll-area.tsx
100644 cdd962b57e703492b8318292eb78c8c7206d267e src/components/ui/select.tsx
100644 c340a95405a9bfe6eb34c29c7018583db1b29d25 src/components/ui/separator.tsx
100644 aed448997710f9199b3c0e00c964ffc33e98c746 src/components/ui/sheet.tsx
100644 b7f61b3aa51edcfcce89bb38fb161fc251cf983c src/components/ui/skeleton.tsx
100644 02314177d5435c26308e90569f9b652a4dfec593 src/components/ui/slider.tsx
100644 9280ee52ffedac56107a4880828f61fac897c7f8 src/components/ui/sonner.tsx
100644 c7bc52effc8e89ba86122524de71f583ec4e1765 src/components/ui/switch.tsx
100644 b1705f8f8590e068877b65864a74e83a175af5af src/components/ui/tabs.tsx
100644 5141de794cdc57aa317c8beba328a7284475d767 src/components/ui/textarea.tsx
100644 b8bebe367623d6b965e416747fc38edd7771373f src/components/ui/toggle-group.tsx
100644 3be8a09be968caa2b623710a926ad055c79f7e26 src/components/ui/toggle.tsx
100644 37ba16ac3cc9e9834fe7bf545bec1e9107266f7d src/components/ui/tooltip.tsx
100644 35598fec12fdbba51b6af74911a44ab4159d091f src/hooks/use-playback.ts
100644 97a4d73d23e6284b16e41c685c0de9f917f4638a src/lib/audio/bulk.ts
100644 73ce1ccfcf90918b208b05b6ff6c3175e709e53a src/lib/audio/dsp.ts
100644 5b45ec9e444999dcfbe3e5c0635f5ec85e04c5e2 src/lib/audio/effects.ts
100644 bd419426bda20ecbc07975f09410d3364db214cc src/lib/audio/encoders/flac.ts
100644 605e224bae7b1ada42cbfa4296fe7de21cbf8008 src/lib/audio/encoders/mp3.ts
100644 1fde619714a086d90225aa448e7bf34c3877edd7 src/lib/audio/encoders/pcm.ts
100644 c25339df3dec527e499c447045017b25b3c1b60f src/lib/audio/engine.ts
100644 b07a710a28739efd11da398d818147b85e546a34 src/lib/audio/export.ts
100644 b74443313df15a615c2431b66bc8ee9f488e9be8 src/lib/audio/params.ts
100644 2f4caf6c8cd333b5c4fa7209b4f0266273c98048 src/lib/audio/peaks.ts
100644 165c9b2cead9a93e2c1ab1ecd036c0fac0c099f4 src/lib/audio/player.ts
100644 464ac9389211865255eb98b8aa158e386a711b70 src/lib/audio/voices.ts
100644 ebb20f12f87e02d1a4d22c428b72b2d376b8f321 src/lib/helpers.ts
100644 3f9da1bf2ce1bab65716403f362b37b156e8ff1b src/lib/history-model.ts
100644 cfc60fb7c1513d0c77f1c979690182707297d360 src/lib/library.ts
100644 379faab8d026ff3e8cbe162ad3054b82254ea2e8 src/lib/recipe/completion.ts
100644 258c732d3d72d8581a5418c0150a663d25bae2fb src/lib/recipe/examples.ts
100644 44854f7728367cb873515ab4e045801fb30f3386 src/lib/recipe/notes.ts
100644 80735558db32fdbe9f1a50fa25c3ce032afe759e src/lib/recipe/parse.ts
100644 145d7eb9f500e51c53f637ce5578b755032fa1af src/lib/recipe/prompt.ts
100644 ce2505d9ef2a042211f58c6fda2d61b2264b3381 src/lib/recipe/schema.ts
100644 b5a3ace915ab7602de56408ed8fd5e21e6806e4b src/lib/recipe/share.ts
100644 fcb9c5a2c6acf82d1f75151a9cf31c6344ba0452 src/lib/recipe/transform.ts
100644 f815ded4d7865413255682a8b1f8f95beb620d0a src/lib/utils.ts
100644 443b4e08b71b8cef949b1217bf046590ce1b2289 src/stores/history.ts
100644 e5e91c09bdc7bbd24f8819b6397cdf6e637628bd src/stores/settings.ts
100644 03a620d10943e721598c802b32325484c578c93e src/stores/studio.ts
100644 f629a2f913601c301e793579f5395ae421dcb15b src/stores/ui.ts
100644 cf9c65d3e0676a0169374d827f7abb97497789ef tsconfig.json
MANIFESTO
}
# <<< MANIFESTO

main
