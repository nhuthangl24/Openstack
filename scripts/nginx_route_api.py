#!/usr/bin/env python3
from __future__ import annotations

import ipaddress
import json
import logging
import os
import re
import secrets
import subprocess
import tempfile
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


LOGGER = logging.getLogger("orbitstack.nginx_route_api")
ROUTE_KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
HOSTNAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


@dataclass(frozen=True)
class Config:
  host: str
  port: int
  token: str
  domain: str
  config_dir: Path
  cert_path: str
  key_path: str
  nginx_bin: str
  systemctl_bin: str
  nginx_service_name: str
  allowed_client_networks: tuple[ipaddress._BaseNetwork, ...]
  allowed_target_networks: tuple[ipaddress._BaseNetwork, ...]


def read_required_env(name: str) -> str:
  value = os.environ.get(name, "").strip()

  if not value:
    raise RuntimeError(f"Missing required environment variable {name}")

  return value


def parse_networks(raw_value: str, default_value: str) -> tuple[ipaddress._BaseNetwork, ...]:
  items = [item.strip() for item in (raw_value or default_value).split(",") if item.strip()]
  return tuple(ipaddress.ip_network(item, strict=False) for item in items)


CONFIG = Config(
  host=os.environ.get("ROUTE_MANAGER_HOST", "127.0.0.1").strip() or "127.0.0.1",
  port=int(os.environ.get("ROUTE_MANAGER_PORT", "9055")),
  token=read_required_env("ROUTE_MANAGER_TOKEN"),
  domain=os.environ.get("ROUTE_MANAGER_DOMAIN", "orbitstack.app").strip() or "orbitstack.app",
  config_dir=Path(os.environ.get("ROUTE_MANAGER_CONFIG_DIR", "/etc/nginx/conf.d")).resolve(),
  cert_path=os.environ.get(
    "ROUTE_MANAGER_CERT_PATH",
    "/etc/letsencrypt/live/orbitstack.app/fullchain.pem",
  ).strip(),
  key_path=os.environ.get(
    "ROUTE_MANAGER_KEY_PATH",
    "/etc/letsencrypt/live/orbitstack.app/privkey.pem",
  ).strip(),
  nginx_bin=os.environ.get("ROUTE_MANAGER_NGINX_BIN", "/usr/sbin/nginx").strip(),
  systemctl_bin=os.environ.get("ROUTE_MANAGER_SYSTEMCTL_BIN", "/usr/bin/systemctl").strip(),
  nginx_service_name=os.environ.get("ROUTE_MANAGER_NGINX_SERVICE", "nginx").strip() or "nginx",
  allowed_client_networks=parse_networks(
    os.environ.get("ROUTE_MANAGER_ALLOWED_CLIENT_CIDRS", ""),
    "127.0.0.1/32",
  ),
  allowed_target_networks=parse_networks(
    os.environ.get("ROUTE_MANAGER_ALLOWED_TARGET_CIDRS", ""),
    "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
  ),
)


class RouteValidationError(ValueError):
  pass


def sanitize_route_key(value: str) -> str:
  safe = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
  safe = re.sub(r"-+", "-", safe).strip("-")

  if not safe or not ROUTE_KEY_PATTERN.fullmatch(safe):
    raise RouteValidationError("route_key khong hop le.")

  return safe


def validate_hostname(value: str) -> str:
  hostname = value.strip().lower()

  if not HOSTNAME_PATTERN.fullmatch(hostname):
    raise RouteValidationError("hostname khong hop le.")

  return hostname


def validate_target_ip(value: str) -> str:
  try:
    address = ipaddress.ip_address(value.strip())
  except ValueError as error:
    raise RouteValidationError("target_ip khong hop le.") from error

  if not any(address in network for network in CONFIG.allowed_target_networks):
    raise RouteValidationError("target_ip nam ngoai dai mang duoc phep.")

  return str(address)


def validate_target_port(value: Any) -> int:
  try:
    port = int(value)
  except (TypeError, ValueError) as error:
    raise RouteValidationError("target_port khong hop le.") from error

  if port < 1 or port > 65535:
    raise RouteValidationError("target_port phai nam trong khoang 1-65535.")

  return port


def render_server_block(hostname: str, domain: str, target_ip: str, target_port: int) -> str:
  full_host = f"{hostname}.{domain}"
  return f"""server {{
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {full_host};

    ssl_certificate     {CONFIG.cert_path};
    ssl_certificate_key {CONFIG.key_path};

    location / {{
        proxy_pass http://{target_ip}:{target_port};
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        proxy_cache_bypass $http_upgrade;
    }}
}}
"""


class RouteManager:
  def __init__(self, config: Config) -> None:
    self.config = config

  def _route_path(self, route_key: str) -> Path:
    return self.config.config_dir / f"orbitstack-vm-{route_key}.conf"

  def _nginx_test_and_reload(self) -> None:
    subprocess.run([self.config.nginx_bin, "-t"], check=True, capture_output=True, text=True)
    subprocess.run(
      [self.config.systemctl_bin, "reload", self.config.nginx_service_name],
      check=True,
      capture_output=True,
      text=True,
    )

  def _write_atomic(self, target_path: Path, content: str) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(
      "w",
      dir=target_path.parent,
      prefix=f".{target_path.name}.",
      delete=False,
      encoding="utf-8",
    ) as handle:
      handle.write(content)
      temp_path = Path(handle.name)

    os.replace(temp_path, target_path)

  def upsert(self, route_key: str, hostname: str, target_ip: str, target_port: int, domain: str) -> dict[str, Any]:
    safe_route_key = sanitize_route_key(route_key)
    safe_hostname = validate_hostname(hostname)
    safe_target_ip = validate_target_ip(target_ip)
    safe_target_port = validate_target_port(target_port)
    safe_domain = domain.strip().lower() or self.config.domain

    target_path = self._route_path(safe_route_key)
    previous = target_path.read_text(encoding="utf-8") if target_path.exists() else None

    try:
      self._write_atomic(
        target_path,
        render_server_block(safe_hostname, safe_domain, safe_target_ip, safe_target_port),
      )
      self._nginx_test_and_reload()
    except Exception:
      if previous is None:
        target_path.unlink(missing_ok=True)
      else:
        target_path.write_text(previous, encoding="utf-8")
      raise

    return {
      "route_key": safe_route_key,
      "hostname": safe_hostname,
      "domain": safe_domain,
      "fqdn": f"{safe_hostname}.{safe_domain}",
      "target_ip": safe_target_ip,
      "target_port": safe_target_port,
      "config_path": str(target_path),
    }

  def delete(self, route_key: str) -> dict[str, Any]:
    safe_route_key = sanitize_route_key(route_key)
    target_path = self._route_path(safe_route_key)
    previous = target_path.read_text(encoding="utf-8") if target_path.exists() else None

    try:
      target_path.unlink(missing_ok=True)
      self._nginx_test_and_reload()
    except Exception:
      if previous is not None:
        target_path.write_text(previous, encoding="utf-8")
      raise

    return {
      "route_key": safe_route_key,
      "deleted": True,
      "config_path": str(target_path),
    }


MANAGER = RouteManager(CONFIG)


class Handler(BaseHTTPRequestHandler):
  server_version = "OrbitStackRouteAPI/1.0"

  def log_message(self, fmt: str, *args: Any) -> None:
    LOGGER.info("%s - %s", self.client_address[0], fmt % args)

  def _json_response(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    self.send_response(status.value)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def _read_json(self) -> dict[str, Any]:
    content_length = int(self.headers.get("Content-Length", "0"))
    raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
    try:
      payload = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as error:
      raise RouteValidationError("JSON body khong hop le.") from error

    if not isinstance(payload, dict):
      raise RouteValidationError("JSON body phai la object.")

    return payload

  def _require_auth(self) -> bool:
    client_ip = ipaddress.ip_address(self.client_address[0])

    if not any(client_ip in network for network in CONFIG.allowed_client_networks):
      self._json_response(
        HTTPStatus.FORBIDDEN,
        {"ok": False, "error": "Client IP khong duoc phep."},
      )
      return False

    auth_header = self.headers.get("Authorization", "")
    expected = f"Bearer {CONFIG.token}"

    if not secrets.compare_digest(auth_header, expected):
      self._json_response(
        HTTPStatus.UNAUTHORIZED,
        {"ok": False, "error": "Token khong hop le."},
      )
      return False

    return True

  def _resolve_route_key(self) -> str:
    parsed = urlparse(self.path)
    path = parsed.path.rstrip("/")
    prefix = "/routes/"

    if not path.startswith(prefix):
      raise RouteValidationError("Route path khong hop le.")

    route_key = path[len(prefix):].strip()

    if not route_key:
      raise RouteValidationError("Thieu route_key.")

    return route_key

  def do_GET(self) -> None:
    if urlparse(self.path).path.rstrip("/") == "/health":
      self._json_response(HTTPStatus.OK, {"ok": True, "service": "nginx-route-api"})
      return

    self._json_response(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})

  def do_POST(self) -> None:
    if not self._require_auth():
      return

    parsed = urlparse(self.path)

    if parsed.path.rstrip("/") != "/routes":
      self._json_response(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
      return

    try:
      payload = self._read_json()
      result = MANAGER.upsert(
        route_key=str(payload.get("route_key", "")),
        hostname=str(payload.get("hostname", "")),
        target_ip=str(payload.get("target_ip", "")),
        target_port=payload.get("target_port", 80),
        domain=str(payload.get("domain") or CONFIG.domain),
      )
    except RouteValidationError as error:
      self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
      return
    except subprocess.CalledProcessError as error:
      detail = (error.stderr or error.stdout or str(error)).strip()
      self._json_response(HTTPStatus.BAD_GATEWAY, {"ok": False, "error": detail})
      return
    except Exception as error:
      LOGGER.exception("POST /routes failed")
      self._json_response(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(error)})
      return

    self._json_response(HTTPStatus.CREATED, {"ok": True, "route": result})

  def do_PUT(self) -> None:
    if not self._require_auth():
      return

    try:
      route_key = self._resolve_route_key()
      payload = self._read_json()
      result = MANAGER.upsert(
        route_key=route_key,
        hostname=str(payload.get("hostname", "")),
        target_ip=str(payload.get("target_ip", "")),
        target_port=payload.get("target_port", 80),
        domain=str(payload.get("domain") or CONFIG.domain),
      )
    except RouteValidationError as error:
      self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
      return
    except subprocess.CalledProcessError as error:
      detail = (error.stderr or error.stdout or str(error)).strip()
      self._json_response(HTTPStatus.BAD_GATEWAY, {"ok": False, "error": detail})
      return
    except Exception as error:
      LOGGER.exception("PUT /routes failed")
      self._json_response(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(error)})
      return

    self._json_response(HTTPStatus.OK, {"ok": True, "route": result})

  def do_DELETE(self) -> None:
    if not self._require_auth():
      return

    try:
      route_key = self._resolve_route_key()
      result = MANAGER.delete(route_key)
    except RouteValidationError as error:
      self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
      return
    except subprocess.CalledProcessError as error:
      detail = (error.stderr or error.stdout or str(error)).strip()
      self._json_response(HTTPStatus.BAD_GATEWAY, {"ok": False, "error": detail})
      return
    except Exception as error:
      LOGGER.exception("DELETE /routes failed")
      self._json_response(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(error)})
      return

    self._json_response(HTTPStatus.OK, {"ok": True, "route": result})


def main() -> None:
  logging.basicConfig(
    level=os.environ.get("ROUTE_MANAGER_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
  )
  server = ThreadingHTTPServer((CONFIG.host, CONFIG.port), Handler)
  LOGGER.info("Starting nginx route API on %s:%s", CONFIG.host, CONFIG.port)
  server.serve_forever()


if __name__ == "__main__":
  main()
