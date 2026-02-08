import { UNIFORM_CATALOG, type LiveContext } from './uniforms';

/**
 * Uniform inspector panel.
 *
 * Shows every shader uniform with:
 *   • type badge (float, vec2, sampler2D, …)
 *   • name
 *   • live value (updated every frame)
 *   • visual bar for 0-1 ranged floats
 */
export class UniformInspector {
  private container: HTMLElement;
  private rows: Map<string, {
    valueEl: HTMLElement;
    barEl?: HTMLElement;
  }> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = '';

    // Section header
    const header = document.createElement('div');
    header.className = 'inspector-header';
    header.textContent = 'Uniforms';
    this.container.appendChild(header);

    const barUniforms = new Set(['iBass', 'iMid', 'iTreble', 'iBeat', 'iSpectralCentroid']);
    const barColors: Record<string, string> = {
      iBass: '#e05555',
      iMid: '#55b855',
      iTreble: '#5588ee',
      iBeat: '#ee88ff',
      iSpectralCentroid: '#eebb55',
    };

    for (const u of UNIFORM_CATALOG) {
      const row = document.createElement('div');
      row.className = 'inspector-row';

      // Type badge
      const typeBadge = document.createElement('span');
      typeBadge.className = 'inspector-type';
      typeBadge.textContent = u.type;

      // Name
      const nameEl = document.createElement('span');
      nameEl.className = 'inspector-name';
      nameEl.textContent = u.name;
      nameEl.title = u.description + (u.range ? `\nRange: ${u.range}` : '');

      // Value display
      const valueEl = document.createElement('span');
      valueEl.className = 'inspector-value';
      valueEl.textContent = '—';

      row.append(typeBadge, nameEl);

      let barEl: HTMLElement | undefined;
      if (barUniforms.has(u.name)) {
        const track = document.createElement('div');
        track.className = 'inspector-track';
        barEl = document.createElement('div');
        barEl.className = 'inspector-bar';
        barEl.style.background = barColors[u.name] ?? '#888';
        track.appendChild(barEl);
        row.appendChild(track);
      } else {
        // Spacer so value aligns right
        const spacer = document.createElement('div');
        spacer.className = 'inspector-spacer';
        row.appendChild(spacer);
      }

      row.appendChild(valueEl);
      this.container.appendChild(row);
      this.rows.set(u.name, { valueEl, barEl });
    }
  }

  update(ctx: LiveContext): void {
    for (const u of UNIFORM_CATALOG) {
      const entry = this.rows.get(u.name);
      if (!entry) continue;

      const val = u.liveValue(ctx);
      entry.valueEl.textContent = val;

      // Update bar for 0-1 ranged values
      if (entry.barEl) {
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          entry.barEl.style.width = (Math.max(0, Math.min(1, numVal)) * 100) + '%';
        }
      }
    }
  }
}
