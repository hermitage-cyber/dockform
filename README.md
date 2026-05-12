# Dockform Portable

Портативное Windows-приложение для автоматического формирования юридических документов из Word-шаблонов.

## Разработка

```bash
npm install
npm run tauri dev
```

Откроется десктоп-окно с горячей перезагрузкой.

## Сборка

```bash
npm run tauri build
```

Артефакты — в `src-tauri/target/release/`.

## Документация

- [CLAUDE.md](CLAUDE.md) — правила работы с кодом
- [plan.md](plan.md) — пошаговый план разработки
- [ARCHITECTURE.md](ARCHITECTURE.md) — техническое устройство
- [docs/template-authoring.md](docs/template-authoring.md) — как добавить шаблон
- [docs/release.md](docs/release.md) — как выпустить релиз
