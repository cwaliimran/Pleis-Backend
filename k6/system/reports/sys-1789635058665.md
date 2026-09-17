# Pleis System / Load Test Report

- **Run ID:** sys-1789635058665
- **Target:** http://127.0.0.1:4020/api/v1
- **Started:** 2026-09-17T08:50:58.665Z
- **Finished:** 2026-09-17T08:52:48.651Z
- **Concurrency:** 25
- **Load duration:** 75s
- **Total requests:** 1620
- **OK:** 1620
- **Fail/soft-fail:** 0

## Seed / discovery
```json
{
  "guestUser": {
    "basicInfo": {
      "_id": "6aab7ba23b9b64b16deb5d35",
      "profileIcon": "https://pleis-images-ceeshqhnf7avgnan.z02.azurefd.net/pleisappcontainerdev/noimage.png",
      "firstName": "Guest",
      "lastName": "User",
      "email": "guest@pleis.com",
      "phoneNumber": {
        "code": "",
        "number": ""
      },
      "language": "en",
      "publicId": "85882692",
      "companyDetails": null
    },
    "accountState": {
      "companyDetails": null,
      "twoFactorAuth": false,
      "userType": "guest",
      "status": "active",
      "profileCompleted": true,
      "verificationStatus": {
        "email": "verified",
        "phoneNumber": "pending"
      },
      "userglobalwallets": [],
      "revenue": 0,
      "lastLogin": null
    },
    "preferences": {
      "notifications": {
        "email": true,
        "push": true
      }
    },
    "metadata": {
      "timezone": "UTC",
      "createdAt": "2026-09-17T05:33:22.427Z",
      "updatedAt": "2026-09-17T08:47:26.781Z",
      "__v": 0
    }
  },
  "adminUser": {
    "basicInfo": {
      "_id": "6aab7ba33b9b64b16deb5d5a",
      "profileIcon": "https://pleis-images-ceeshqhnf7avgnan.z02.azurefd.net/pleisappcontainerdev/noimage.png",
      "firstName": "Pleis",
      "lastName": "Admin",
      "email": "admin@pleis.com",
      "phoneNumber": {
        "code": "",
        "number": ""
      },
      "language": "en",
      "publicId": "14727438",
      "companyDetails": null
    },
    "accountState": {
      "companyDetails": null,
      "twoFactorAuth": false,
      "userType": "admin",
      "status": "active",
      "profileCompleted": true,
      "verificationStatus": {
        "email": "verified",
        "phoneNumber": "pending"
      },
      "userglobalwallets": [],
      "revenue": 0,
      "lastLogin": null
    },
    "preferences": {
      "notifications": {
        "email": true,
        "push": true
      }
    },
    "metadata": {
      "timezone": "UTC",
      "createdAt": "2026-09-17T05:33:23.176Z",
      "updatedAt": "2026-09-17T08:47:28.747Z",
      "__v": 0
    }
  },
  "discovered": {
    "orgCount": 10,
    "venueCount": 10,
    "userCount": 3,
    "eventCount": 0,
    "orgId": "6aab92339a7dd9a391c33adb",
    "countries": 250
  },
  "users": [
    {
      "type": "user",
      "email": "loaduser.sys-1789635058665.0@example.com",
      "status": 201,
      "message": "Signup successful",
      "id": "6aabaa0c99a48c668b372384"
    },
    {
      "type": "user",
      "email": "loaduser.sys-1789635058665.1@example.com",
      "status": 201,
      "message": "Signup successful",
      "id": "6aabaa0d99a48c668b372391"
    },
    {
      "type": "user",
      "email": "loaduser.sys-1789635058665.2@example.com",
      "status": 201,
      "message": "Signup successful",
      "id": "6aabaa0f99a48c668b37239e"
    },
    {
      "type": "organizer",
      "email": "loadorg.sys-1789635058665.0@example.com",
      "status": 201,
      "message": "Signup successful",
      "id": "6aabaa1099a48c668b3723ac"
    },
    {
      "type": "organizer",
      "email": "loadorg.sys-1789635058665.1@example.com",
      "status": 201,
      "message": "Signup successful",
      "id": "6aabaa1199a48c668b3723ba"
    }
  ],
  "_organizerIds": [
    "6aabaa1099a48c668b3723ac",
    "6aabaa1199a48c668b3723ba"
  ],
  "organization": {
    "status": 201,
    "message": "Organization created successfully",
    "id": "6aabaa1299a48c668b3723c5",
    "organizerId": "6aabaa1099a48c668b3723ac"
  },
  "menu": {
    "status": 201,
    "message": "Menu created successfully",
    "id": "6aabaa1399a48c668b3723cb"
  }
}
```

## Endpoint performance

| Endpoint | Reqs | OK | Fail | p50 | p95 | p99 | max | Statuses |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| L.health | 100 | 100 | 0 | 1 | 4 | 8 | 10 | {"200":100} |
| L.apiRoot | 100 | 100 | 0 | 1 | 5 | 7 | 10 | {"200":100} |
| L.guest.nearby | 100 | 100 | 0 | 797 | 1021 | 1089 | 1161 | {"200":100} |
| L.guest.trending | 100 | 100 | 0 | 894 | 1154 | 1180 | 1202 | {"200":100} |
| L.guest.foryou.orgs | 100 | 100 | 0 | 1254 | 1521 | 1557 | 1569 | {"200":100} |
| L.countries | 100 | 100 | 0 | 1562 | 1700 | 1832 | 1906 | {"200":100} |
| L.guest.popular | 100 | 100 | 0 | 1323 | 1595 | 1649 | 1668 | {"200":100} |
| L.admin.orgs | 100 | 100 | 0 | 1336 | 1598 | 1619 | 1629 | {"200":100} |
| L.admin.venues | 100 | 100 | 0 | 1363 | 1614 | 1648 | 1653 | {"200":100} |
| L.faqs | 100 | 100 | 0 | 1637 | 1913 | 2118 | 2168 | {"200":100} |
| L.privacy | 100 | 100 | 0 | 1652 | 1941 | 2011 | 2142 | {"200":100} |
| L.app.org.profile | 99 | 99 | 0 | 812 | 966 | 1240 | 1240 | {"200":99} |
| L.admin.events | 99 | 99 | 0 | 1326 | 1540 | 1743 | 1743 | {"200":99} |
| L.guest.menu | 99 | 99 | 0 | 1321 | 1600 | 1778 | 1778 | {"200":99} |
| L.admin.dashboard | 99 | 99 | 0 | 1329 | 1615 | 1702 | 1702 | {"200":99} |
| L.admin.users | 99 | 99 | 0 | 1354 | 1586 | 1601 | 1601 | {"200":99} |
| admin.users.create.user | 3 | 3 | 0 | 1437 | 1590 | 1590 | 1590 | {"201":3} |
| admin.users.create.organizer | 2 | 2 | 0 | 1405 | 1450 | 1450 | 1450 | {"201":2} |
| auth.login.guest | 1 | 1 | 0 | 1542 | 1542 | 1542 | 1542 | {"200":1} |
| auth.login.admin | 1 | 1 | 0 | 1693 | 1693 | 1693 | 1693 | {"200":1} |
| locations.countries | 1 | 1 | 0 | 1621 | 1621 | 1621 | 1621 | {"200":1} |
| settings/settings/privacy-policy | 1 | 1 | 0 | 1836 | 1836 | 1836 | 1836 | {"200":1} |
| settings/settings/terms-conditions | 1 | 1 | 0 | 1613 | 1613 | 1613 | 1613 | {"200":1} |
| settings/settings/about-us | 1 | 1 | 0 | 1709 | 1709 | 1709 | 1709 | {"200":1} |
| settings/settings/faqs | 1 | 1 | 0 | 2018 | 2018 | 2018 | 2018 | {"200":1} |
| admin.organizations.list | 1 | 1 | 0 | 1398 | 1398 | 1398 | 1398 | {"200":1} |
| admin.venues.list | 1 | 1 | 0 | 2266 | 2266 | 2266 | 2266 | {"200":1} |
| admin.users.list | 1 | 1 | 0 | 1396 | 1396 | 1396 | 1396 | {"200":1} |
| admin.events.list | 1 | 1 | 0 | 1326 | 1326 | 1326 | 1326 | {"200":1} |
| app.orgs.nearby | 1 | 1 | 0 | 805 | 805 | 805 | 805 | {"200":1} |
| app.popular.events | 1 | 1 | 0 | 1425 | 1425 | 1425 | 1425 | {"200":1} |
| tags.global | 1 | 1 | 0 | 1349 | 1349 | 1349 | 1349 | {"200":1} |
| categories.via.admin | 1 | 1 | 0 | 807 | 807 | 807 | 807 | {"200":1} |
| app.menu.items | 1 | 1 | 0 | 1318 | 1318 | 1318 | 1318 | {"200":1} |
| admin.organizations.create | 1 | 1 | 0 | 832 | 832 | 832 | 832 | {"201":1} |
| admin.menu.create | 1 | 1 | 0 | 1057 | 1057 | 1057 | 1057 | {"201":1} |
| post.health | 1 | 1 | 0 | 1 | 1 | 1 | 1 | {"200":1} |
| post.api | 1 | 1 | 0 | 1 | 1 | 1 | 1 | {"200":1} |

## Error sample (0 total)
```json
[]
```

## Verdict notes
- HTTP 429 count: **0**
- HTTP 5xx count: **0**
- Admin/guest login: admin OK, guest OK
- No 5xx observed under this load profile.