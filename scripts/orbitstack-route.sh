#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
ROUTE_KEY="${2:-}"
HOSTNAME_LABEL="${3:-}"
TARGET_IP="${4:-}"
TARGET_PORT="${5:-80}"
DOMAIN="${6:-orbitstack.app}"
CONFIG_DIR="${ORBITSTACK_NGINX_CONFIG_DIR:-/etc/nginx/conf.d}"
SAFE_ROUTE_KEY="$(printf '%s' "$ROUTE_KEY" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-')"
CONFIG_PATH="${CONFIG_DIR}/orbitstack-vm-${SAFE_ROUTE_KEY}.conf"
FULL_HOST=""

if [[ -z "$ACTION" || -z "$ROUTE_KEY" ]]; then
  echo "Usage:"
  echo "  orbitstack-route.sh upsert <route-key> <hostname-label> <target-ip> [target-port] [domain]"
  echo "  orbitstack-route.sh remove <route-key>"
  exit 1
fi

if [[ ! "$SAFE_ROUTE_KEY" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid route key"
  exit 1
fi

case "$ACTION" in
  upsert)
    if [[ -z "$HOSTNAME_LABEL" || -z "$TARGET_IP" ]]; then
      echo "Missing hostname label or target IP"
      exit 1
    fi

    HOSTNAME_LABEL="$(printf '%s' "$HOSTNAME_LABEL" | tr '[:upper:]' '[:lower:]')"
    FULL_HOST="${HOSTNAME_LABEL}.${DOMAIN}"

    if [[ ! "$HOSTNAME_LABEL" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
      echo "Invalid hostname label"
      exit 1
    fi

    if [[ ! "$TARGET_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
      echo "Invalid target IP"
      exit 1
    fi

    if [[ ! "$TARGET_PORT" =~ ^[0-9]+$ ]]; then
      echo "Invalid target port"
      exit 1
    fi

    mkdir -p "$CONFIG_DIR"

    cat > "$CONFIG_PATH" <<EOF
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${FULL_HOST};

    ssl_certificate     /etc/letsencrypt/live/orbitstack.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/orbitstack.app/privkey.pem;

    location / {
        proxy_pass http://${TARGET_IP}:${TARGET_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    ;;

  remove)
    rm -f "$CONFIG_PATH"
    ;;

  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac

nginx -t
systemctl reload nginx
