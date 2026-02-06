/**
 * File Upload Component
 *
 * File input + drag-drop for .jwt, .jws, .json receipt files.
 */

import { verifyReceipt } from '../verify.js';
import { renderResults } from './results.js';

const ACCEPTED_EXTENSIONS = ['.jwt', '.jws', '.json', '.txt'];

export function initFileUpload(): void {
  const container = document.getElementById('file-upload');
  if (!container) return;

  container.innerHTML = `
    <div id="drop-zone" class="drop-zone">
      <p>Drop a receipt file here (.jwt, .jws, .json)</p>
      <input type="file" id="file-input" accept="${ACCEPTED_EXTENSIONS.join(',')}" />
    </div>
  `;

  const dropZone = document.getElementById('drop-zone')!;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });
}

async function handleFile(file: File): Promise<void> {
  const text = await file.text();
  const jws = extractJws(text.trim());

  if (!jws) {
    renderResults({
      status: 'error',
      message: 'Could not extract a JWS receipt from the file content',
    });
    return;
  }

  // Fill the textarea so the user sees what was loaded
  const textarea = document.getElementById('receipt-input') as HTMLTextAreaElement | null;
  if (textarea) textarea.value = jws;

  const result = await verifyReceipt(jws);
  renderResults(result);
}

function extractJws(content: string): string | null {
  // Direct JWS string
  if (content.split('.').length === 3 && !content.includes('\n')) {
    return content;
  }

  // JSON wrapper with "receipt" field
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed.receipt === 'string') return parsed.receipt;
  } catch {
    // Not JSON -- try as raw JWS
  }

  // Try first line that looks like a JWS
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.split('.').length === 3 && trimmed.length > 50) {
      return trimmed;
    }
  }

  return null;
}
