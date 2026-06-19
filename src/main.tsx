import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// StrictMode не используем: в dev он намеренно дважды монтирует компоненты,
// из-за чего эффекты с реальными side-effect'ами (Tauri-команды update_templates,
// fetchKillswitch) запускаются параллельно дважды — конкурируют за tmp-файлы и
// сетевой канал. Для desktop-приложения с однократным запуском проверки нам это
// только мешает; преимущества StrictMode (отлов багов в SPA) не релевантны.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
