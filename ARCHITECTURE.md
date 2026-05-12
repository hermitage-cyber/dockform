# ARCHITECTURE.md

Этот документ описывает техническое устройство Dockform Portable: как разделена ответственность между слоями, какие потоки данных, какие форматы файлов. Если ты хочешь понять, **что делает программа**, сначала смотри `TZ.md`. Если хочешь понять, **как именно она это делает** — этот файл.

## 1. Обзор

Dockform Portable — однооконное десктоп-приложение на Tauri 2. Состоит из двух слоёв:

- **Frontend (React/TypeScript)** — отвечает за UI, ввод и валидацию данных, рендер формы по YAML-конфигу, генерацию `.docx` через docxtemplater.
- **Backend (Rust)** — отвечает за работу с файловой системой, аргументами командной строки, сетевыми запросами, плагином автообновления.

Оба слоя общаются через **Tauri commands** (типизированные RPC-вызовы). UI никогда не работает с файлами или сетью напрямую — всё проходит через Rust. Это даёт строгий контроль над тем, что приложение умеет делать (capabilities), и делает безопасность управляемой.

```
┌─────────────────────────────────────────────────────────┐
│                  React UI (WebView2)                     │
│  pages → components → lib (form-evaluator, generator)    │
└─────────────────────────────────────────────────────────┘
                          ↕  Tauri commands (RPC)
┌─────────────────────────────────────────────────────────┐
│                    Rust Backend                          │
│  commands/ → templates, files, drafts, network, updater  │
└─────────────────────────────────────────────────────────┘
                          ↕
       ┌──────────────────┴──────────────────┐
       ↓                                      ↓
┌──────────────┐                      ┌─────────────────┐
│  File System │                      │  GitHub (HTTPS) │
│  (рядом с    │                      │  raw + releases │
│   .exe)      │                      │                 │
└──────────────┘                      └─────────────────┘
```

## 2. Слои и ответственность

### Frontend (`src/`)

- Рендер всех экранов (выбор режима, список шаблонов, форма, диалоги).
- Валидация формы (react-hook-form + zod), вычисление `visible_if`.
- Сборка данных формы и подстановка их в `.docx` через docxtemplater.
- Управление состоянием UI (текущий экран, выбранный шаблон, значения формы, статус сетевых операций).
- НЕ работает с файлами и сетью напрямую — только через Tauri commands.

### Backend (`src-tauri/src/`)

- Чтение аргументов командной строки (`--mode=...`).
- Чтение/запись файлов в папках рядом с `.exe`.
- Парсинг YAML-конфигов шаблонов и JSON-справочников.
- Сетевые запросы к GitHub (kill switch, manifest, обновления приложения).
- Открытие системных диалогов и Проводника.
- Управление окном (размер, позиция, заголовок).

### Файловая система

Всё хранится **рядом с `.exe`** — это фундаментальное требование портативности. Никаких `%APPDATA%`, `%TEMP%`, `Documents`. Структура:

```
{папка_с_exe}/
├── dockform.exe
├── templates/{pretenzii|documentation}/*.{docx,yaml}
├── dictionaries/*.json
├── cache/
│   ├── window.json
│   ├── last_killswitch.json
│   ├── last_manifest.json
│   └── drafts/*.json
└── output/                    # опционально, по умолчанию сюда сохраняются документы
```

Если папки `cache/` или `output/` не существуют — они создаются при первом обращении.

### Сеть (только по HTTPS)

Только три эндпоинта на GitHub:
- `https://raw.githubusercontent.com/{owner}/{repo}/main/killswitch.json`
- `https://raw.githubusercontent.com/{owner}/{repo}/main/manifest.json` + raw-ссылки на конкретные `.docx`/`.json` по манифесту.
- `https://github.com/{owner}/{repo}/releases/latest/download/latest.json` — для tauri-plugin-updater.

Все запросы с таймаутом 5 секунд. Любая сетевая ошибка не блокирует работу приложения — используется последнее известное локальное состояние.

## 3. Tauri Commands — API между слоями

Все команды регистрируются в `src-tauri/src/main.rs` через `tauri::generate_handler![...]`. На фронте обёртки лежат в `src/lib/tauri.ts`. Ниже — полный контракт.

### App / mode

| Команда | Сигнатура | Описание |
|---------|-----------|----------|
| `get_app_mode` | `() → Option<String>` | Возвращает значение `--mode=...` из argv. `None` — если не задан. |
| `get_window_state` | `() → WindowState` | Читает `cache/window.json`, возвращает `{width, height}`. |
| `save_window_state` | `(width, height) → ()` | Записывает в `cache/window.json`. Вызывается на закрытие окна. |

### Templates / dictionaries

| Команда | Сигнатура | Описание |
|---------|-----------|----------|
| `list_templates` | `(mode: String) → Vec<TemplateConfig>` | Сканирует `templates/{mode}/`, парсит YAML, отдаёт список. Невалидные конфиги логируются, не падают. |
| `read_template` | `(path: String) → Vec<u8>` | Читает `.docx` как байты. Путь относительно папки exe. |
| `list_dictionaries` | `() → HashMap<String, Vec<DictEntry>>` | Возвращает все JSON из `dictionaries/`, ключ — имя файла без расширения. |

### Files / output

| Команда | Сигнатура | Описание |
|---------|-----------|----------|
| `save_file_dialog` | `(default_name: String) → Option<String>` | Открывает «Сохранить как…», возвращает выбранный путь или `None` (отмена). |
| `write_file` | `(path: String, bytes: Vec<u8>) → ()` | Записывает байты по пути. |
| `open_in_explorer` | `(path: String) → ()` | Открывает Проводник Windows с выделенным файлом (`explorer.exe /select,...`). |

### Drafts

| Команда | Сигнатура | Описание |
|---------|-----------|----------|
| `save_draft` | `(key: String, json: String) → ()` | Записывает в `cache/drafts/{key}.json`. |
| `load_draft` | `(key: String) → Option<DraftData>` | Возвращает `{savedAt, values}` или `None`. |
| `delete_draft` | `(key: String) → ()` | Удаляет файл черновика. |

`key` имеет формат `{mode}__{template_filename_without_ext}`.

### Network

| Команда | Сигнатура | Описание |
|---------|-----------|----------|
| `check_killswitch` | `() → KillswitchStatus` | Запрашивает `killswitch.json`. При успехе — кеширует. При неудаче — возвращает кеш. |
| `sync_manifest` | `() → SyncReport` | Скачивает `manifest.json`, сравнивает с локальным, скачивает изменённые файлы. Возвращает что обновилось/удалилось. |
| `check_app_update` | `() → Option<UpdateInfo>` | Запрашивает у tauri-plugin-updater наличие обновления. |
| `apply_app_update` | `() → ()` | Триггерит загрузку и установку обновления через плагин. |

### Типы (общие для Rust и TS)

```ts
type TemplateConfig = {
  template: string;          // имя .docx файла
  title: string;
  description?: string;
  output_filename: {
    pattern: string;         // "{ikz}_{date}.docx"
    fields: string[];        // обязательные поля для имени
  };
  fields: FieldConfig[];
};

type FieldConfig = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'radio' | 'dropdown' | 'dictionary' | 'date';
  required?: boolean;
  options?: string[];        // для radio/dropdown
  source?: string;           // для dictionary, имя справочника
  display?: string;          // для dictionary, паттерн отображения
  fills?: Record<string, string>;  // для dictionary, что автозаполнить
  visible_if?: string;       // выражение
  placeholder?: string;
  help_text?: string;
};

type KillswitchStatus = {
  active: boolean;
  message?: string;
  source: 'network' | 'cache' | 'default';
};

type SyncReport = {
  added: string[];
  updated: string[];
  deleted: string[];
  errors: string[];
};

type DraftData = {
  saved_at: string;          // ISO 8601
  template: string;          // имя шаблона на момент сохранения
  values: Record<string, any>;
};
```

## 4. Поток запуска приложения

Последовательность от двойного клика по ярлыку до открытого окна с готовым к работе UI:

```
1. ОС запускает dockform.exe с аргументом --mode=documentation
2. Rust main():
   - Парсит argv, сохраняет mode в state
   - Читает cache/window.json (или дефолт 1000×750)
   - Создаёт окно с заголовком "Dockform — Документация"
3. WebView2 загружает фронтенд
4. React main.tsx:
   - Вызывает get_app_mode() → "documentation"
   - Если mode === null → показывает экран выбора режима
   - Иначе → переходит к экрану списка шаблонов
5. Параллельно (фоном, не блокируя UI):
   ├── check_killswitch()
   │   └── если active=false → показать модалку, заблокировать UI
   ├── list_templates("documentation")
   │   └── отрисовать карточки шаблонов
   └── sync_manifest()
       ├── скачать manifest.json
       ├── для изменённых файлов — скачать заново
       └── после успеха — перевызвать list_templates() для актуализации
6. После shy_manifest() (с задержкой 1-2 сек чтобы не толкаться):
   └── check_app_update()
       └── если есть новая версия → ненавязчивый тост
```

Если интернета нет, шаги kill switch / sync_manifest / app_update просто не отрабатывают, приложение продолжает работать с локальным состоянием. **Время старта без сети ≤ 3 секунды, с сетью ≤ 5 секунд.**

## 5. Поток создания документа

Пользовательский сценарий от выбора шаблона до сохранённого `.docx`:

```
1. На экране списка шаблонов: клик по карточке
   → переход на /form/{template_id}
   → получаем TemplateConfig из стейта (уже загружен на старте)
2. На экране формы:
   ├── load_draft(key) → если есть, показать тост "Восстановить?"
   ├── DynamicForm рендерит поля по config.fields
   ├── При вводе — автосохранение черновика (debounce 500ms)
   └── При выборе dictionary-поля — автозаполнение fills-полей
3. Клик "Сформировать документ":
   ├── react-hook-form валидирует
   ├── Если поля для имени файла пусты → ошибка
   ├── Сборка имени: подстановка значений + {date}
   └── save_file_dialog(default_name) → пользователь выбирает путь
4. Если выбран путь:
   ├── read_template(path) → байты .docx
   ├── new Docxtemplater(zip, {delimiters: {start:'{', end:'}'}})
   ├── doc.render(formValues)
   ├── doc.getZip().generate({type:'uint8array'})
   └── write_file(savePath, bytes)
5. После успешной записи:
   ├── delete_draft(key) — черновик больше не нужен
   ├── модалка "Документ сохранён"
   │   ├── [Открыть папку] → open_in_explorer(savePath)
   │   └── [ОК] → возврат к списку шаблонов
   └── сброс формы
```

## 6. Форматы файлов

### 6.1. Template config (`templates/{mode}/{name}.yaml`)

```yaml
template: 44_tovar_smp_ktru.docx     # имя соседнего .docx
title: "Закупка товара (СМП, КТРУ)"
description: "44-ФЗ, поставка товара, малый бизнес, КТРУ"

output_filename:
  pattern: "{ikz}_{date}.docx"
  fields: [ikz]                      # обязательные для генерации имени

fields:
  - name: ikz
    label: "ИКЗ"
    type: text
    required: true
    placeholder: "26 цифр"
    help_text: "Идентификационный код закупки"

  - name: zam
    label: "Заместитель"
    type: dictionary
    source: deputies                  # → dictionaries/deputies.json
    display: "{fio} ({position})"
    fills:
      Фам_Имя_Отч_зама_им_пад: fio_im
      Фам_Имя_Отч_зама_род_пад: fio_rod
      должность_зама: position

  - name: применяется_запрет
    label: "Применяется запрет по 1875-ФЗ?"
    type: radio
    options: ["Да", "Нет"]
    required: true

  - name: пункт_тз_запрет
    label: "Пункт ТЗ для запрета"
    type: text
    visible_if: "применяется_запрет == 'Да'"
```

### 6.2. Dictionary (`dictionaries/{name}.json`)

```json
[
  {
    "fio": "Иванов И.И.",
    "fio_im": "Иванов Иван Иванович",
    "fio_rod": "Иванова Ивана Ивановича",
    "position": "Заместитель начальника управления"
  },
  {
    "fio": "Петрова Е.С.",
    "fio_im": "Петрова Елена Сергеевна",
    "fio_rod": "Петровой Елены Сергеевны",
    "position": "Заместитель начальника отдела"
  }
]
```

Ключи произвольные — какие нужны для подстановки в шаблоны и `fills`.

### 6.3. Manifest (`manifest.json` в корне репо)

```json
{
  "version": 1,
  "generated_at": "2026-05-08T10:30:00Z",
  "templates": {
    "pretenzii/претензия_по_срокам.docx": "a1b2c3d4...",
    "pretenzii/претензия_по_срокам.yaml": "e5f6a7b8...",
    "documentation/44_tovar_smp_ktru.docx": "c9d0e1f2..."
  },
  "dictionaries": {
    "deputies.json": "1a2b3c4d..."
  }
}
```

Хеши — SHA-256 в hex. Генерируется скриптом `scripts/build_manifest.py` перед коммитом.

### 6.4. Killswitch (`killswitch.json` в корне репо)

```json
{
  "active": true,
  "message": ""
}
```

При `active: false` приложение блокируется и показывает `message`. Поле `message` можно оставить пустым — тогда показывается дефолтный текст.

### 6.5. Draft (`cache/drafts/{key}.json`)

```json
{
  "saved_at": "2026-05-08T14:32:11Z",
  "template": "44_tovar_smp_ktru.yaml",
  "values": {
    "ikz": "2026...",
    "применяется_запрет": "Да",
    "пункт_тз_запрет": ""
  }
}
```

Поле `template` фиксирует, какая версия конфига была на момент сохранения. При восстановлении сверяется с текущим набором полей.

### 6.6. Window state (`cache/window.json`)

```json
{
  "width": 1100,
  "height": 800,
  "x": 200,
  "y": 100
}
```

`x`, `y` — опциональные (при нескольких мониторах могут пригодиться). Записывается на close-event окна.

## 7. Kill Switch — детали

```
Старт приложения
    ↓
Rust: check_killswitch()
    ├── HTTP GET https://raw.githubusercontent.com/.../killswitch.json (timeout 3s)
    │   ├── 200 OK → парсим, кешируем в cache/last_killswitch.json
    │   └── ошибка / таймаут → читаем cache/last_killswitch.json
    │       └── если кеша нет → возвращаем {active: true, source: 'default'}
    └── Возвращаем во фронт
    ↓
Front:
    ├── status.active === true → продолжаем
    └── status.active === false → блокирующая модалка
        ├── Заголовок: "Использование приложения прекращено"
        ├── Текст: status.message
        └── Единственная кнопка: "Закрыть" → app.exit()
```

**Принципиальный компромисс.** Защита от обхода ограничена. Если у пользователя нет интернета и нет кешированного `killswitch.json` — приложение работает (`active: true` по умолчанию). Если есть кеш с `active: true`, а потом владелец репо ставит `false` и пользователь блокирует сеть — приложение продолжит работать. Это сознательное допущение в пользу офлайн-режима.

## 8. Обновление шаблонов и справочников

```
Rust: sync_manifest()
    ├── HTTP GET .../manifest.json (timeout 5s)
    │   └── при ошибке → возвращаем пустой SyncReport
    ├── Читаем cache/last_manifest.json (если нет — пустой)
    ├── diff = вычислить (added, updated, deleted)
    ├── Для каждого added/updated:
    │   ├── HTTP GET https://raw.../{path}
    │   ├── Сверить SHA-256 (защита от подмены в transit)
    │   └── Записать в templates/ или dictionaries/
    ├── Для каждого deleted:
    │   └── Удалить локальный файл
    ├── Сохранить новый manifest как cache/last_manifest.json
    └── Вернуть SyncReport во фронт
```

Если пользователь в этот момент находится в форме (а не в списке шаблонов) — фронт получает `SyncReport`, видит, что текущий шаблон в списке `updated`, и показывает тост в правом нижнем углу: «Шаблон обновлён, перезагрузить форму? [Да] [Не сейчас]». Без согласия пользователя ничего не подменяется.

## 9. Обновление приложения

Используется `tauri-plugin-updater`. Процесс:

```
1. На старте приложения (после kill switch и manifest sync):
   front: const update = await check();
2. Если update !== null:
   front: показать ненавязчивый тост "Доступна версия X.Y.Z. Установить? [Да] [Позже]"
3. При согласии:
   front: await update.downloadAndInstall(progressCallback)
   - плагин качает .nsis-installer (или .msi) с GitHub release
   - проверяет подпись (минисайн ed25519)
   - запускает инсталлятор → перезапуск приложения
```

**Подпись релизов.** При сборке Tauri генерирует артефакт + `.sig`-файл. Публичный ключ зашит в `tauri.conf.json` в поле `plugins.updater.pubkey`. Плагин на стороне клиента проверяет подпись перед установкой. Это защищает от подмены файлов в репо или MITM.

**Где живёт приватный ключ.** Только у разработчика, локально и в зашифрованном бэкапе. **Не коммитить в репо.** Если ключ утерян — выпустить новую версию с новым ключом нельзя без боли (потребуется ручная установка одной версии у всех пользователей с обновлённым публичным ключом, дальше снова работает автообновление).

**Формат latest.json** (генерируется при релизе):
```json
{
  "version": "1.2.0",
  "notes": "Список изменений",
  "pub_date": "2026-05-15T10:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../releases/download/v1.2.0/dockform_1.2.0_x64-setup.nsis.zip"
    }
  }
}
```

## 10. Состояние фронтенда

Стейт-менеджмент — **React Context + useState/useReducer**, без redux/zustand. Объём состояния маленький, оверхед не оправдан.

Глобальный контекст `<AppContext>`:
```ts
type AppState = {
  mode: 'pretenzii' | 'documentation' | null;
  templates: TemplateConfig[];          // загружается на старте
  dictionaries: Record<string, DictEntry[]>;  // загружается на старте
  killswitchStatus: KillswitchStatus | null;
  syncStatus: 'idle' | 'syncing' | 'done' | 'error';
  appUpdate: UpdateInfo | null;
};
```

Локальный стейт формы — внутри `<DynamicForm>` через `react-hook-form`. Не подниматься в глобальный контекст — там этому не место.

## 11. Обработка ошибок

| Тип ошибки | Реакция |
|------------|---------|
| Невалидный YAML конфига шаблона | Лог в консоль Rust, шаблон не появляется в списке. Ошибка не показывается пользователю (но видна разработчику в `npm run tauri dev`). |
| Шаблон есть, .docx отсутствует | То же самое — пропускается, лог. |
| Ошибка генерации .docx (битый шаблон, невалидный синтаксис) | Модалка с текстом ошибки от docxtemplater + кнопка «Сообщить разработчику» (просто копирует текст в буфер). |
| Ошибка записи файла (нет прав, недостаточно места) | Модалка «Не удалось сохранить файл: {причина}». |
| Сетевая ошибка | Не показывается пользователю. Просто в фоне ничего не обновилось. |
| Ошибка применения обновления приложения | Модалка «Обновление не установлено: {причина}. Попробуйте перезапустить приложение». |
| Парсинг `visible_if` с ошибкой | Лог в консоль. Поле считается видимым (failsafe — лучше показать лишнее, чем спрятать важное). |

## 12. Безопасность

**Tauri capabilities (`src-tauri/capabilities/default.json`):** разрешаем только то, что реально используем. Дефолтный шаблон Tauri 2 даёт минимум — добавляем точечно:
- `core:default` — базовые операции окна.
- `dialog:allow-save` — для save dialog.
- `updater:default` — для плагина обновлений.
- `http:default` — для сетевых запросов (только из Rust, см. ниже).

**Никаких прямых fetch из JS.** Все сетевые запросы идут через Rust. Это значит, что в `tauri.conf.json` `app.security.csp` НЕ разрешает `connect-src` к внешним хостам. CSP формируется при сборке, по умолчанию запрещает всё кроме `'self'`.

**Подписи релизов** — см. п. 9.

**Manifest и шаблоны.** Хеши в `manifest.json` защищают от случайных повреждений и подмены в transit. **Они не защищают от компрометации самого репозитория** — если злоумышленник получает доступ к репо, он подменит и шаблоны, и манифест. Это ограничение приемлемо для текущей модели угроз (5–10 пользователей, не критическая инфраструктура).

**Что НЕ защищаем.**
- От злонамеренного пользователя на той же машине, который имеет права на запись в папку с `.exe` (он может подменить любой файл).
- От реверс-инжиниринга `.exe`.
- От обхода kill switch отключением сети (см. п. 7).

Это всё за пределами модели угроз и не должно влиять на дизайн.
