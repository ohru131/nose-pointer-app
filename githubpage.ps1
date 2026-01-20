# 1) main にいることを確認
git checkout main
git pull origin main

# 2) 既存ファイルをバックアップ
if (Test-Path .\client\src\main.tsx) { Copy-Item .\client\src\main.tsx .\client\src\main.tsx.bak -Force }

# 3) 新しい main.tsx を書き込む
@'
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import App from "./App";
import "./index.css";

const base = (import.meta.env.BASE_URL as string) || "/";

createRoot(document.getElementById("root")!).render(
  <Router base={base}>
    <App />
  </Router>
);
'@ | Set-Content -Path .\client\src\main.tsx -Encoding utf8

# 4) コミットして push
git add .\client\src\main.tsx
git commit -m "fix: use wouter Router with import.meta.env.BASE_URL as base for GitHub Pages"
git push origin main