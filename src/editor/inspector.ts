import type { AudioData } from '../audio/analyzer';

/**
 * Real-time display of shader uniform values.
 * Rendered as labeled horizontal bars inside a container div.
 */
export class UniformInspector {
  private container: HTMLElement;
  private bars: Map<string, { bar: HTMLElement; value: HTMLElement }> = new Map();
  private timeEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = '';

    const uniforms = [
      { name: 'iBass', color: '#e05555' },
      { name: 'iMid', color: '#55b855' },
      { name: 'iTreble', color: '#5588ee' },
      { name: 'iBeat', color: '#ee88ff' },
      { name: 'iSpectralCentroid', color: '#eebb55' },
    ];

    for (const u of uniforms) {
      const row = document.createElement('div');
      row.className = 'inspector-row';

      const label = document.createElement('span');
      label.className = 'inspector-label';
      label.textContent = u.name;

      const track = document.createElement('div');
      track.className = 'inspector-track';

      const bar = document.createElement('div');
      bar.className = 'inspector-bar';
      bar.style.background = u.color;
      track.appendChild(bar);

      const val = document.createElement('span');
      val.className = 'inspector-value';
      val.textContent = '0.00';

      row.append(label, track, val);
      this.container.appendChild(row);
      this.bars.set(u.name, { bar, value: val });
    }

    // iTime row (text only, no bar)
    const timeRow = document.createElement('div');
    timeRow.className = 'inspector-row';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'inspector-label';
    timeLabel.textContent = 'iTime';
    this.timeEl = document.createElement('span');
    this.timeEl.className = 'inspector-value inspector-time';
    this.timeEl.textContent = '0.00s';
    timeRow.append(timeLabel, this.timeEl);
    this.container.appendChild(timeRow);
  }

  update(audio: AudioData, time: number): void {
    this.setBar('iBass', audio.bass);
    this.setBar('iMid', audio.mid);
    this.setBar('iTreble', audio.treble);
    this.setBar('iBeat', audio.beat);
    this.setBar('iSpectralCentroid', audio.spectralCentroid);
    this.timeEl.textContent = `${time.toFixed(2)}s` + (audio.bpm > 0 ? ` | ${Math.round(audio.bpm)} BPM` : '');
  }

  private setBar(name: string, value: number): void {
    const entry = this.bars.get(name);
    if (!entry) return;
    const clamped = Math.max(0, Math.min(1, value));
    entry.bar.style.width = (clamped * 100) + '%';
    entry.value.textContent = clamped.toFixed(2);
  }
}
