# Postman GET walk report

- Base: http://127.0.0.1:4020/api/v1
- Collection GETs: 253
- Exercised: 100
- Skipped (path params): 55

## By folder
| Folder | Hits | 2xx/3xx | Statuses |
|---|---:|---:|---|
| App | 48 | 39 | {"200":39,"400":3,"404":4,"500":2} |
| Organizer | 22 | 18 | {"200":18,"400":2,"404":2} |
| Staff | 8 | 0 | {"403":8} |
| Manager | 2 | 0 | {"404":2} |
| Admin Panel | 20 | 18 | {"200":18,"400":2} |

## 5xx sample
```json
[
  {
    "folder": "App",
    "name": "App/Monri Payments/redirect to walletPay",
    "path": "/app/payments/monri/wallet-pay",
    "status": 500,
    "ms": 809
  },
  {
    "folder": "App",
    "name": "App/Monri Payments/create web-pay-session",
    "path": "/app/payments/monri/web-pay-session",
    "status": 500,
    "ms": 845
  }
]
```