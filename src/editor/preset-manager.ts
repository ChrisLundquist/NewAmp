import { presets as builtinPresets, type Preset } from '../renderer/shaders';

const STORAGE_KEY = 'newamp-user-presets';

export interface UserPreset extends Preset {
  createdAt: number;
  updatedAt: number;
}

export class PresetManager {
  private userPresets: UserPreset[] = [];

  constructor() {
    this.load();
  }

  /** All presets: built-ins first, then user presets. */
  getAll(): { builtin: Preset[]; user: UserPreset[] } {
    return { builtin: builtinPresets, user: this.userPresets };
  }

  /** Get a preset by its composite key: "builtin:INDEX" or "user:INDEX". */
  getByKey(key: string): Preset | null {
    const [type, indexStr] = key.split(':');
    const index = parseInt(indexStr, 10);
    if (type === 'builtin') return builtinPresets[index] ?? null;
    if (type === 'user') return this.userPresets[index] ?? null;
    return null;
  }

  /** Save a new user preset. Returns its key. */
  saveNew(name: string, fragmentShader: string): string {
    const now = Date.now();
    this.userPresets.push({ name, fragmentShader, createdAt: now, updatedAt: now });
    this.persist();
    return `user:${this.userPresets.length - 1}`;
  }

  /** Update an existing user preset's shader code. */
  updateUser(index: number, fragmentShader: string): void {
    const p = this.userPresets[index];
    if (!p) return;
    p.fragmentShader = fragmentShader;
    p.updatedAt = Date.now();
    this.persist();
  }

  /** Update an existing user preset's name. */
  renameUser(index: number, name: string): void {
    const p = this.userPresets[index];
    if (!p) return;
    p.name = name;
    p.updatedAt = Date.now();
    this.persist();
  }

  /** Delete a user preset by index. */
  deleteUser(index: number): void {
    this.userPresets.splice(index, 1);
    this.persist();
  }

  /** Export a preset as a downloadable JSON file. */
  exportPreset(preset: Preset): void {
    const data = JSON.stringify(
      { name: preset.name, fragmentShader: preset.fragmentShader, version: 1 },
      null,
      2,
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Import a preset from a JSON file. Returns the new key, or null on error. */
  async importPreset(file: File): Promise<string | null> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.name || !data.fragmentShader) return null;
      return this.saveNew(data.name, data.fragmentShader);
    } catch {
      return null;
    }
  }

  /* ── Persistence ── */

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.userPresets = JSON.parse(raw);
    } catch {
      this.userPresets = [];
    }
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.userPresets));
  }
}
