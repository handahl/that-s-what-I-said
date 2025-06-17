# PROJECT\_BOOTSTRAP\_INSTRUCTIONS.md - Project: That's What I Said

---

## 📦 Project Bootstrap Instructions

This file defines the exact environment setup required to build, run, and test the project according to the enforced architectural constraints.

---

## 1️⃣ System Requirements

* Node.js: **20.x LTS** (strictly enforced)
* NPM: 9.x or compatible
* Tauri CLI: latest stable (for desktop builds)
* SQLite3 (managed via Tauri plugin)
* VS Code (recommended editor)
* Git (version control)

---

## 2️⃣ Dependency Installation

After cloning the repository:

```bash
npm install
```

This will install all project dependencies listed in `package.json`.

---

## 3️⃣ NPM Scripts

* **Development server:**

  ```bash
  npm run dev
  ```

  (launches Vite + Svelte app for local development)

* **Run tests:**

  ```bash
  npm test
  ```

  (executes Vitest test suite)

* **Build desktop app:**

  ```bash
  npm run tauri dev
  ```

---

## 4️⃣ Initial Dependency List

These dependencies MUST exist in `package.json`:

### Runtime Dependencies

```json
{
  "dependencies": {
    "svelte": "^3.59.2",
    "@tauri-apps/api": "^1.4.0",
    "sqlite3": "^5.1.2",
    "@sveltejs/kit": "^1.29.2",
    "@tauri-apps/plugin-sql": "^0.6.0",
    "tailwindcss": "^3.3.2"
  }
}
```

### Dev Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.3.3",
    "vite": "^5.0.7",
    "vitest": "^1.0.4",
    "svelte-check": "^3.0.2",
    "postcss": "^8.4.31",
    "autoprefixer": "^10.4.14"
  }
}
```

> ⚠ Guardian AI Note: Versions will be periodically reviewed for security patching.

---

## 5️⃣ Post-Install Verification

After running `npm install`, verify:

* `vite` CLI runs successfully
* `vitest` CLI runs successfully
* No post-install errors
* Tauri CLI detects environment properly

---

## 6️⃣ IDE Setup (Optional but Recommended)

* Install VS Code extensions:

  * **Svelte for VS Code**
  * **ESLint**
  * **Prettier**
  * **Tauri Helper** (if available)

---

## 7️⃣ CI/CD Hook (Future Guardian AI CI Module)

* Future Guardian AI deployments may attach CI checks to validate:

  * Constraints adherence
  * Full test coverage
  * Security audits
  * Bootstrap environment consistency