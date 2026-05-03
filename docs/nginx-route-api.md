# Nginx Route API

## Muc tieu

Python service nay chay tren server Nginx public va nhan request HTTP de:

- add route
- update route
- delete route
- validate Nginx config
- reload Nginx

Service thay the huong SSH shell truc tiep tu app Next.js.

## File can deploy len server Nginx

- `scripts/nginx_route_api.py`
- `scripts/nginx-route-api.service`
- `scripts/nginx-route-api.env.example`

## Cai dat nhanh tren server Nginx

1. Copy service code:

```bash
sudo mkdir -p /opt/orbitstack/scripts /etc/orbitstack
sudo cp scripts/nginx_route_api.py /opt/orbitstack/scripts/nginx_route_api.py
sudo cp scripts/nginx-route-api.service /etc/systemd/system/nginx-route-api.service
sudo cp scripts/nginx-route-api.env.example /etc/orbitstack/nginx-route-api.env
```

2. Sua token va allowed client IP:

```bash
sudo nano /etc/orbitstack/nginx-route-api.env
```

3. Bat service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nginx-route-api
sudo systemctl status nginx-route-api --no-pager
```

4. Test health:

```bash
curl http://127.0.0.1:9055/health
```

## Env can dat cho Next.js

```env
NGINX_ROUTE_API_BASE_URL=http://20.41.119.30:9055
NGINX_ROUTE_API_TOKEN=change-this-token
NGINX_ROUTE_DOMAIN=orbitstack.app
NGINX_ROUTE_TARGET_PORT=80
```

## API

### Health

```http
GET /health
```

### Add route

```http
POST /routes
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "route_key": "demo-vm",
  "hostname": "demo",
  "target_ip": "10.0.0.25",
  "target_port": 80,
  "domain": "orbitstack.app"
}
```

### Update or upsert route

```http
PUT /routes/demo-vm
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "hostname": "demo",
  "target_ip": "10.0.0.25",
  "target_port": 80,
  "domain": "orbitstack.app"
}
```

### Delete route

```http
DELETE /routes/demo-vm
Authorization: Bearer <token>
```
