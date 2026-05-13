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
from urllib.parse import parse_qs, urlparse


LOGGER = logging.getLogger("orbitstack.nginx_route_api")
ROUTE_KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
HOSTNAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
LISTEN_PATTERN = re.compile(r"listen\s+(\d+)\s+ssl http2;")
SERVER_NAME_PATTERN = re.compile(r"server_name\s+([a-z0-9-]+)\.([a-z0-9.-]+);")
PROXY_PASS_PATTERN = re.compile(r"proxy_pass\s+http://([0-9.]+):(\d+);")


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


def validate_port(value: Any, field_name: str) -> int:
  try:
    port = int(value)
  except (TypeError, ValueError) as error:
    raise RouteValidationError(f"{field_name} khong hop le.") from error

  if port < 1 or port > 65535:
    raise RouteValidationError(f"{field_name} phai nam trong khoang 1-65535.")

  return port


def parse_optional_port(value: Any, field_name: str) -> int | None:
  if value is None or value == "":
    return None

  return validate_port(value, field_name)


def render_server_block(
  hostname: str,
  domain: str,
  listen_port: int,
  target_ip: str,
  target_port: int,
) -> str:
  full_host = f"{hostname}.{domain}"
  return f"""server {{
    listen {listen_port} ssl http2;
    listen [::]:{listen_port} ssl http2;
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


def extract_server_blocks(raw: str) -> list[str]:
  blocks: list[str] = []
  current: list[str] = []
  depth = 0
  inside_server = False

  for line in raw.splitlines():
    stripped = line.strip()
    opens = line.count("{")
    closes = line.count("}")

    if not inside_server and stripped.startswith("server") and "{" in line:
      inside_server = True
      current = [line]
      depth = opens - closes

      if depth <= 0:
        blocks.append("\n".join(current))
        current = []
        inside_server = False
        depth = 0

      continue

    if not inside_server:
      continue

    current.append(line)
    depth += opens - closes

    if depth <= 0:
      blocks.append("\n".join(current))
      current = []
      inside_server = False
      depth = 0

  return blocks


def parse_routes_from_config(route_key: str, config_path: Path) -> list[dict[str, Any]]:
  raw = config_path.read_text(encoding="utf-8")
  entries: list[dict[str, Any]] = []

  for block in extract_server_blocks(raw):
    listen_match = LISTEN_PATTERN.search(block)
    server_name_match = SERVER_NAME_PATTERN.search(block)
    proxy_pass_match = PROXY_PASS_PATTERN.search(block)

    if not listen_match or not server_name_match or not proxy_pass_match:
      continue

    hostname, domain = server_name_match.groups()
    target_ip, target_port = proxy_pass_match.groups()
    listen_port = int(listen_match.group(1))

    entries.append(
      {
        "route_key": route_key,
        "hostname": hostname,
        "domain": domain,
        "fqdn": f"{hostname}.{domain}",
        "target_ip": target_ip,
        "target_port": int(target_port),
        "listen_port": listen_port,
        "config_path": str(config_path),
      },
    )

  return entries


class RouteManager:
  def __init__(self, config: Config) -> None:
    self.config = config

  def _route_filename_pattern(self, route_key: str) -> re.Pattern[str]:
    return re.compile(rf"^orbitstack-vm-{re.escape(route_key)}(?:-\d+)?\.conf$")

  def _matching_route_paths(self, route_key: str) -> list[Path]:
    pattern = self._route_filename_pattern(route_key)
    matches = [
      path
      for path in self.config.config_dir.glob("orbitstack-vm-*.conf")
      if pattern.fullmatch(path.name)
    ]
    return sorted(matches, key=lambda path: path.name)

  def _entry_path(self, route_key: str, listen_port: int) -> Path:
    return self.config.config_dir / f"orbitstack-vm-{route_key}-{listen_port}.conf"

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

  def _restore_snapshot(self, route_key: str, snapshot: dict[Path, str]) -> None:
    current_paths = self._matching_route_paths(route_key)

    for path in current_paths:
      if path not in snapshot:
        path.unlink(missing_ok=True)

    for path, content in snapshot.items():
      self._write_atomic(path, content)

  def _persist_entries(self, route_key: str, entries: list[dict[str, Any]]) -> None:
    target_paths = self._matching_route_paths(route_key)
    snapshot = {
      path: path.read_text(encoding="utf-8")
      for path in target_paths
    }

    try:
      for path in target_paths:
        path.unlink(missing_ok=True)

      for entry in sorted(entries, key=lambda item: item["listen_port"]):
        self._write_atomic(
          self._entry_path(route_key, entry["listen_port"]),
          render_server_block(
            entry["hostname"],
            entry["domain"],
            entry["listen_port"],
            entry["target_ip"],
            entry["target_port"],
          ),
        )

      self._nginx_test_and_reload()
    except Exception:
      self._restore_snapshot(route_key, snapshot)
      raise

  def list(self, route_key: str) -> list[dict[str, Any]]:
    safe_route_key = sanitize_route_key(route_key)
    entries_by_port: dict[int, dict[str, Any]] = {}

    for config_path in self._matching_route_paths(safe_route_key):
      for entry in parse_routes_from_config(safe_route_key, config_path):
        entries_by_port[entry["listen_port"]] = entry

    if not entries_by_port:
      raise FileNotFoundError(f"Route {safe_route_key} khong ton tai.")

    return sorted(entries_by_port.values(), key=lambda item: item["listen_port"])

  def get(self, route_key: str, listen_port: int | None = None) -> dict[str, Any]:
    routes = self.list(route_key)

    if listen_port is None:
      return next((route for route in routes if route["listen_port"] == 443), routes[0])

    for route in routes:
      if route["listen_port"] == listen_port:
        return route

    raise FileNotFoundError(f"Route {sanitize_route_key(route_key)}:{listen_port} khong ton tai.")

  def upsert(
    self,
    route_key: str,
    hostname: str,
    target_ip: str,
    target_port: int,
    domain: str,
    listen_port: int,
    previous_listen_port: int | None = None,
  ) -> dict[str, Any]:
    safe_route_key = sanitize_route_key(route_key)
    safe_hostname = validate_hostname(hostname)
    safe_target_ip = validate_target_ip(target_ip)
    safe_target_port = validate_port(target_port, "target_port")
    safe_listen_port = validate_port(listen_port, "listen_port")
    safe_previous_listen_port = (
      validate_port(previous_listen_port, "previous_listen_port")
      if previous_listen_port is not None
      else None
    )
    safe_domain = domain.strip().lower() or self.config.domain

    try:
      existing_routes = self.list(safe_route_key)
    except FileNotFoundError:
      existing_routes = []

    ports_to_replace = {safe_listen_port}
    if safe_previous_listen_port is not None:
      ports_to_replace.add(safe_previous_listen_port)

    next_routes = [
      route for route in existing_routes if route["listen_port"] not in ports_to_replace
    ]
    next_route = {
      "route_key": safe_route_key,
      "hostname": safe_hostname,
      "domain": safe_domain,
      "fqdn": f"{safe_hostname}.{safe_domain}",
      "target_ip": safe_target_ip,
      "target_port": safe_target_port,
      "listen_port": safe_listen_port,
      "config_path": str(self._entry_path(safe_route_key, safe_listen_port)),
    }
    next_routes.append(next_route)

    self._persist_entries(safe_route_key, next_routes)
    return next_route

  def delete(self, route_key: str, listen_port: int | None = None) -> dict[str, Any]:
    safe_route_key = sanitize_route_key(route_key)

    if listen_port is None:
      target_paths = self._matching_route_paths(safe_route_key)
      snapshot = {
        path: path.read_text(encoding="utf-8")
        for path in target_paths
      }

      try:
        for path in target_paths:
          path.unlink(missing_ok=True)
        self._nginx_test_and_reload()
      except Exception:
        self._restore_snapshot(safe_route_key, snapshot)
        raise

      return {
        "route_key": safe_route_key,
        "deleted": True,
      }

    safe_listen_port = validate_port(listen_port, "listen_port")
    existing_routes = self.list(safe_route_key)
    next_routes = [
      route for route in existing_routes if route["listen_port"] != safe_listen_port
    ]

    if len(next_routes) == len(existing_routes):
      raise FileNotFoundError(f"Route {safe_route_key}:{safe_listen_port} khong ton tai.")

    self._persist_entries(safe_route_key, next_routes)
    return {
      "route_key": safe_route_key,
      "listen_port": safe_listen_port,
      "deleted": True,
    }


MANAGER = RouteManager(CONFIG)


class Handler(BaseHTTPRequestHandler):
  server_version = "OrbitStackRouteAPI/1.1"

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

  def _resolve_listen_port(self) -> int | None:
    parsed = urlparse(self.path)
    query = parse_qs(parsed.query)
    raw_port = query.get("listen_port", [None])[0]
    return parse_optional_port(raw_port, "listen_port")

  def do_GET(self) -> None:
    parsed = urlparse(self.path)
    path = parsed.path.rstrip("/")

    if path == "/health":
      self._json_response(HTTPStatus.OK, {"ok": True, "service": "nginx-route-api"})
      return

    if path.startswith("/routes/"):
      if not self._require_auth():
        return

      try:
        route_key = self._resolve_route_key()
        listen_port = self._resolve_listen_port()
        routes = MANAGER.list(route_key)
        route = MANAGER.get(route_key, listen_port)
      except FileNotFoundError as error:
        self._json_response(HTTPStatus.NOT_FOUND, {"ok": False, "error": str(error)})
        return
      except RouteValidationError as error:
        self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
        return
      except Exception as error:
        LOGGER.exception("GET /routes failed")
        self._json_response(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(error)})
        return

      self._json_response(HTTPStatus.OK, {"ok": True, "route": route, "routes": routes})
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
        target_port=payload.get("target_port", 3000),
        domain=str(payload.get("domain") or CONFIG.domain),
        listen_port=payload.get("listen_port", 443),
        previous_listen_port=parse_optional_port(
          payload.get("previous_listen_port"),
          "previous_listen_port",
        ),
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
        target_port=payload.get("target_port", 3000),
        domain=str(payload.get("domain") or CONFIG.domain),
        listen_port=payload.get("listen_port", 443),
        previous_listen_port=parse_optional_port(
          payload.get("previous_listen_port"),
          "previous_listen_port",
        ),
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
      listen_port = self._resolve_listen_port()
      result = MANAGER.delete(route_key, listen_port)
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
