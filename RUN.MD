cd /d D:\Code\web\VaultLink\backend
flask --app app run --host 0.0.0.0 --port 5000

cd /d D:\Code\web\VaultLink\frontend
npm run dev -- --port 5173

cd /d D:\Code\web\VaultLink\backend
pip install -r requirements.txt
copy .env.example .env
flask --app app run --host 0.0.0.0 --port 5000
