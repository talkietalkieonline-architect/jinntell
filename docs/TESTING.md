# Смоук-тест JinnTell

Быстрая проверка, что ядро платформы живо. Ничего не меняет (только читает).

## Запуск
```bash
ssh jinntell "docker exec -i jinntell-backend-1 python - < /root/jinntell/backend/scripts/smoke_test.py"
```
Или внутри сервера:
```bash
cd /root/jinntell && docker exec -i jinntell-backend-1 python - < backend/scripts/smoke_test.py
```

## Что проверяет (9 пунктов)
БД/агенты · эмбеддинги · RAG-поиск (Костя ПДД) · Guardian сверка (ловит выдумку, пропускает верное) · Guardian вход (ловит инъекции) · память помощника · гео-движок (haversine + структура) · мониторинг (Агент Админ) · публичный конфиг.

Итог: `ИТОГ: N/9 пройдено` + `ВСЁ ЗЕЛЁНОЕ ✓` или список `[FAIL]`.

## Когда гонять
После деплоя бэкенда, после правок в RAG/Guardian/гео/памяти, или просто чтобы убедиться, что всё на месте.
