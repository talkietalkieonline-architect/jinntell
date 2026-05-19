#!/bin/bash
# ═══════════════════════════════════════════════
#  JINNTELL — Скрипт первого деплоя на VPS
#  Запуск: chmod +x deploy.sh && ./deploy.sh
# ═══════════════════════════════════════════════

set -e

echo "╔═══════════════════════════════════════╗"
echo "║       JINNTELL — Deploy Script          ║"
echo "╚═══════════════════════════════════════╝"

# ── 1. Проверка .env ──
if [ ! -f .env ]; then
    echo "❌ Файл .env не найден!"
    echo "   Создайте его: cp env.template .env"
    echo "   И заполните значения."
    exit 1
fi

source .env

if [ "$SECRET_KEY" = "CHANGE_ME_GENERATE_WITH_OPENSSL" ] || [ -z "$SECRET_KEY" ]; then
    echo "❌ Сгенерируйте SECRET_KEY в .env:"
    echo "   openssl rand -hex 32"
    exit 1
fi

if [ "$POSTGRES_PASSWORD" = "CHANGE_ME_STRONG_PASSWORD_HERE" ] || [ -z "$POSTGRES_PASSWORD" ]; then
    echo "❌ Установите POSTGRES_PASSWORD в .env"
    exit 1
fi

DOMAIN=${DOMAIN:-jinntell.ru}
echo "🌐 Домен: $DOMAIN"

# ── 2. Создаём директории для certbot ──
mkdir -p certbot/conf certbot/www

# ── 3. Первый запуск — без SSL (для получения сертификата) ──
if [ ! -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    echo ""
    echo "📋 SSL-сертификат не найден. Получаем через Let's Encrypt..."
    echo ""

    # Создаём временный nginx конфиг без SSL
    mkdir -p nginx/conf.d
    cat > nginx/conf.d/default.conf << 'NGINX_TEMP'
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX_TEMP

    echo "🔨 Собираем и запускаем сервисы (HTTP-режим)..."
    docker compose -f docker-compose.prod.yml up -d --build postgres redis backend frontend nginx

    echo "⏳ Ждём запуска nginx..."
    sleep 10

    echo "🔐 Получаем SSL-сертификат..."
    docker compose -f docker-compose.prod.yml run --rm certbot \
        certonly --webroot -w /var/www/certbot \
        -d "$DOMAIN" -d "www.$DOMAIN" \
        --email "admin@$DOMAIN" \
        --agree-tos --no-eff-email

    # Восстанавливаем полный nginx конфиг с SSL
    echo "🔄 Переключаем nginx на HTTPS..."
    cat > nginx/conf.d/default.conf << NGINX_SSL
# HTTP → HTTPS redirect + Let's Encrypt
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\\\$host\\\$request_uri;
    }
}

# HTTPS — основной сервер
server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }

    location /_next/static/ {
        proxy_pass http://frontend:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
NGINX_SSL

    docker compose -f docker-compose.prod.yml restart nginx
    echo "✅ SSL-сертификат получен и nginx перезапущен!"
else
    echo "✅ SSL-сертификат найден."
    echo "🔨 Собираем и запускаем сервисы..."
    docker compose -f docker-compose.prod.yml up -d --build
fi

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║         🚀 JINNTELL ЗАПУЩЕН!           ║"
echo "╠═══════════════════════════════════════╣"
echo "║  https://$DOMAIN"
echo "║  Админка: https://$DOMAIN/admin"
echo "║                                       ║"
echo "║  Логи:    docker compose -f docker-compose.prod.yml logs -f"
echo "║  Стоп:    docker compose -f docker-compose.prod.yml down"
echo "║  Рестарт: docker compose -f docker-compose.prod.yml restart"
echo "╚═══════════════════════════════════════╝"
