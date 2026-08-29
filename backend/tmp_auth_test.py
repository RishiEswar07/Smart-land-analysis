import json
import urllib.request
import urllib.error

BASE_URL = 'http://127.0.0.1:8000/api/v1'

for action in ['register', 'login']:
    data = {
        'register': {'name': 'Demo User', 'email': 'demo.user@example.com', 'password': 'DemoPass123'},
        'login': {'email': 'demo.user@example.com', 'password': 'DemoPass123'},
    }[action]
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        f'{BASE_URL}/auth/{action}',
        data=payload,
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(action.upper(), resp.status)
            print(resp.read().decode())
    except urllib.error.HTTPError as err:
        print(action.upper(), 'HTTP', err.code)
        print(err.read().decode())
    except Exception as err:
        print(action.upper(), 'ERR', err)
