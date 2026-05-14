import urllib.request
import json

url = "http://127.0.0.1:8001/ask"
data = {"course_id": "test", "question": "valid JSON object matching this schema"}
headers = {"Content-Type": "application/json"}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        print("Success:", response.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
