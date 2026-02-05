/* ============================================================
   Media → Markdown Converter — Main Application
   ============================================================ */

(function () {
  'use strict';

  // ── DOM References ──────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');
  const pasteArea = $('#pasteArea');
  const linkInput = $('#linkInput');
  const markdownOutput = $('#markdownOutput');
  const markdownPreview = $('#markdownPreview');
  const queueList = $('#queueList');
  const fileQueue = $('#fileQueue');
  const statusText = $('#statusText');
  const progressContainer = $('#progressContainer');
  const progressBar = $('#progressBar');
  const toast = $('#toast');

  // ── State ───────────────────────────────────────────────────
  let markdownParts = [];
  let queueItems = [];
  let processingCount = 0;

  // ── Initialize ──────────────────────────────────────────────
  function init() {
    setupTabs();
    setupDropZone();
    setupPaste();
    setupLink();
    setupExport();
    setupTheme();
    setupLivePreview();
    setupPdfWorker();
    setStatus('Ready — drop, paste, or upload media to begin');
  }

  // ── PDF.js Worker ───────────────────────────────────────────
  function setupPdfWorker() {
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  // ── Tab Switching ───────────────────────────────────────────
  function setupTabs() {
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach((t) => t.classList.remove('active'));
        $$('.tab-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        $(`#tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
    $$('.out-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.out-tab').forEach((t) => t.classList.remove('active'));
        $$('.out-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        $(`#out-${tab.dataset.out}`).classList.add('active');
        if (tab.dataset.out === 'preview') {
          updatePreview();
        }
      });
    });
  }

  // ── Theme Toggle ────────────────────────────────────────────
  function setupTheme() {
    const saved = localStorage.getItem('md-converter-theme');
    if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');

    $('#btnThemeToggle').addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
      localStorage.setItem('md-converter-theme', isLight ? 'dark' : 'light');
    });
  }

  // ── Drag & Drop / File Upload ───────────────────────────────
  function setupDropZone() {
    ['dragenter', 'dragover'].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      dropZone.addEventListener(evt, () => {
        dropZone.classList.remove('drag-over');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = [...e.dataTransfer.files];
      if (files.length) processFiles(files);
    });

    fileInput.addEventListener('change', () => {
      const files = [...fileInput.files];
      if (files.length) processFiles(files);
      fileInput.value = '';
    });

    // Also handle paste in the whole document for images
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === 'file') {
          files.push(item.getAsFile());
        }
      }
      if (files.length) {
        e.preventDefault();
        processFiles(files);
      }
    });
  }

  // ── Paste Handler ───────────────────────────────────────────
  function setupPaste() {
    $('#btnProcessPaste').addEventListener('click', () => {
      const text = pasteArea.value.trim();
      if (!text) {
        showToast('Nothing to process — paste some content first', 'error');
        return;
      }
      processPastedText(text);
    });
  }

  function processPastedText(text) {
    setStatus('Processing pasted content...');
    // Detect if it's already markdown or plain text
    const isMarkdown = /^#{1,6}\s|^\*\*|^\- \[|^\|.*\|/m.test(text);
    let md = '';
    const title = $('#titleInput').value.trim() || 'Pasted Content';

    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, 'text/plain', null);
    }

    if (isMarkdown) {
      md += text;
    } else {
      md += `# ${title}\n\n${text}\n`;
    }

    appendMarkdown(md, title);
    setStatus('Pasted content converted');
    showToast('Pasted content added to output', 'success');
  }

  // ── Link Handler ────────────────────────────────────────────
  function setupLink() {
    $('#btnProcessLink').addEventListener('click', () => {
      const url = linkInput.value.trim();
      if (!url) {
        showToast('Enter a URL first', 'error');
        return;
      }
      processLink(url);
    });

    linkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#btnProcessLink').click();
      }
    });
  }

  function processLink(url) {
    setStatus('Processing link...');
    let md = '';
    const title = $('#titleInput').value.trim() || extractTitleFromUrl(url);

    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, 'link', null);
    }

    // Detect link type
    if (isYouTubeUrl(url)) {
      const videoId = extractYouTubeId(url);
      md += `# ${title}\n\n`;
      md += `## Video\n\n`;
      md += `[![YouTube Video](https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)](${url})\n\n`;
      md += `**Link:** [Watch on YouTube](${url})\n\n`;
      if ($('#optNotionCompat').checked) {
        md += `> 📺 **YouTube Embed:** ${url}\n\n`;
        md += `[${url}](${url})\n\n`;
      }
    } else if (isImageUrl(url)) {
      md += `# ${title}\n\n`;
      md += `![${title}](${url})\n\n`;
      md += `**Source:** [${url}](${url})\n`;
    } else if (isAudioUrl(url)) {
      md += `# ${title}\n\n`;
      md += `## Audio\n\n`;
      md += `**Audio file:** [${extractFilenameFromUrl(url)}](${url})\n\n`;
      md += `> 🎵 Audio file — download or play from source link above\n`;
    } else if (isVideoUrl(url)) {
      md += `# ${title}\n\n`;
      md += `## Video\n\n`;
      md += `**Video file:** [${extractFilenameFromUrl(url)}](${url})\n\n`;
      md += `> 🎬 Video file — download or play from source link above\n`;
    } else {
      // Generic web link
      md += `# ${title}\n\n`;
      md += `**Source:** [${url}](${url})\n\n`;
      md += `---\n\n`;
      md += `> *Linked content from: ${new URL(url).hostname}*\n`;
    }

    appendMarkdown(md, title);
    linkInput.value = '';
    setStatus('Link processed');
    showToast('Link converted to markdown', 'success');
  }

  // ── File Processing ─────────────────────────────────────────
  async function processFiles(files) {
    for (const file of files) {
      const id = addToQueue(file.name, getFileIcon(file.type));
      try {
        updateQueueItem(id, 'processing');
        await processOneFile(file, id);
        updateQueueItem(id, 'done');
      } catch (err) {
        console.error('Error processing file:', err);
        updateQueueItem(id, 'error');
        showToast(`Failed: ${file.name} — ${err.message}`, 'error');
      }
    }
    setStatus(`Processed ${files.length} file(s)`);
  }

  async function processOneFile(file, queueId) {
    const type = file.type;
    const name = file.name;
    const title = $('#titleInput').value.trim() || cleanFilename(name);

    if (type.startsWith('image/')) {
      await processImage(file, title);
    } else if (type === 'application/pdf') {
      await processPdf(file, title);
    } else if (type.startsWith('audio/')) {
      await processAudio(file, title);
    } else if (type.startsWith('video/')) {
      await processVideo(file, title);
    } else if (
      type === 'text/plain' ||
      type === 'text/markdown' ||
      type === 'text/csv' ||
      type === 'application/json' ||
      name.endsWith('.md') ||
      name.endsWith('.txt') ||
      name.endsWith('.csv') ||
      name.endsWith('.json')
    ) {
      await processTextFile(file, title);
    } else {
      // Generic file
      await processGenericFile(file, title);
    }
  }

  // ── Image Processing ────────────────────────────────────────
  async function processImage(file, title) {
    setStatus('Processing image...');
    showProgress(10);

    let md = '';
    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, file.type, file.size);
    }
    md += `# ${title}\n\n`;

    // Embed or reference
    if ($('#optEmbedImages').checked) {
      const base64 = await fileToBase64(file);
      md += `![${title}](${base64})\n\n`;
    } else {
      const objectUrl = URL.createObjectURL(file);
      md += `![${title}](${file.name})\n\n`;
    }

    showProgress(40);

    // Metadata
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| **Filename** | ${file.name} |\n`;
    md += `| **Type** | ${file.type} |\n`;
    md += `| **Size** | ${formatBytes(file.size)} |\n`;

    // Get dimensions
    try {
      const dims = await getImageDimensions(file);
      md += `| **Dimensions** | ${dims.width} × ${dims.height} px |\n`;
    } catch (_) { /* ignore */ }

    md += '\n';

    showProgress(60);

    // OCR if enabled
    if ($('#optOcr').checked && window.Tesseract) {
      setStatus('Running OCR on image...');
      showProgress(65);
      try {
        const result = await Tesseract.recognize(file, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              showProgress(65 + Math.round(m.progress * 30));
            }
          },
        });
        const ocrText = result.data.text.trim();
        if (ocrText) {
          md += `## Extracted Text (OCR)\n\n`;
          md += `${ocrText}\n\n`;
        } else {
          md += `> *No text detected in image via OCR*\n\n`;
        }
      } catch (err) {
        md += `> *OCR failed: ${err.message}*\n\n`;
      }
    }

    showProgress(100);
    appendMarkdown(md, title);
    hideProgress();
    showToast(`Image "${file.name}" converted`, 'success');
  }

  // ── PDF Processing ──────────────────────────────────────────
  async function processPdf(file, title) {
    setStatus('Extracting text from PDF...');
    showProgress(10);

    if (!window.pdfjsLib) {
      throw new Error('PDF.js library not loaded');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    let md = '';
    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, file.type, file.size);
    }
    md += `# ${title}\n\n`;
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| **Filename** | ${file.name} |\n`;
    md += `| **Pages** | ${totalPages} |\n`;
    md += `| **Size** | ${formatBytes(file.size)} |\n\n`;
    md += `---\n\n`;

    for (let i = 1; i <= totalPages; i++) {
      setStatus(`Extracting page ${i}/${totalPages}...`);
      showProgress(10 + Math.round((i / totalPages) * 85));

      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      const pageText = strings.join(' ').trim();

      if (totalPages > 1) {
        md += `## Page ${i}\n\n`;
      }

      if (pageText) {
        // Clean up excessive whitespace but preserve paragraph breaks
        const cleaned = pageText
          .replace(/\s{3,}/g, '\n\n')
          .replace(/([.!?])\s+/g, '$1 ')
          .trim();
        md += `${cleaned}\n\n`;
      } else {
        md += `> *No text content on this page (may contain images/graphics)*\n\n`;
      }
    }

    showProgress(100);
    appendMarkdown(md, title);
    hideProgress();
    showToast(`PDF "${file.name}" extracted (${totalPages} pages)`, 'success');
  }

  // ── Audio Processing ────────────────────────────────────────
  async function processAudio(file, title) {
    setStatus('Processing audio file...');
    showProgress(30);

    let md = '';
    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, file.type, file.size);
    }
    md += `# ${title}\n\n`;
    md += `## Audio File\n\n`;
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| **Filename** | ${file.name} |\n`;
    md += `| **Type** | ${file.type} |\n`;
    md += `| **Size** | ${formatBytes(file.size)} |\n`;

    // Try to get duration
    try {
      const duration = await getMediaDuration(file);
      md += `| **Duration** | ${formatDuration(duration)} |\n`;
    } catch (_) { /* ignore */ }

    md += `\n`;

    if ($('#optNotionCompat').checked) {
      md += `> 🎵 **Audio file:** \`${file.name}\`\n`;
      md += `> *Upload this audio file to Notion separately and embed it above*\n\n`;
    }

    md += `### Notes\n\n`;
    md += `*Add your listening notes, transcription, or key takeaways here...*\n\n`;

    showProgress(100);
    appendMarkdown(md, title);
    hideProgress();
    showToast(`Audio "${file.name}" converted`, 'success');
  }

  // ── Video Processing ────────────────────────────────────────
  async function processVideo(file, title) {
    setStatus('Processing video file...');
    showProgress(20);

    let md = '';
    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, file.type, file.size);
    }
    md += `# ${title}\n\n`;
    md += `## Video File\n\n`;
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| **Filename** | ${file.name} |\n`;
    md += `| **Type** | ${file.type} |\n`;
    md += `| **Size** | ${formatBytes(file.size)} |\n`;

    // Try to get duration
    try {
      const duration = await getMediaDuration(file);
      md += `| **Duration** | ${formatDuration(duration)} |\n`;
    } catch (_) { /* ignore */ }

    md += `\n`;

    // Generate thumbnail
    showProgress(50);
    setStatus('Generating video thumbnail...');
    try {
      const thumbnail = await generateVideoThumbnail(file);
      if (thumbnail && $('#optEmbedImages').checked) {
        md += `### Thumbnail\n\n`;
        md += `![Video Thumbnail](${thumbnail})\n\n`;
      }
    } catch (_) { /* ignore */ }

    if ($('#optNotionCompat').checked) {
      md += `> 🎬 **Video file:** \`${file.name}\`\n`;
      md += `> *Upload this video file to Notion separately and embed it above*\n\n`;
    }

    md += `### Notes\n\n`;
    md += `*Add timestamps, observations, or transcription notes here...*\n\n`;

    showProgress(100);
    appendMarkdown(md, title);
    hideProgress();
    showToast(`Video "${file.name}" converted`, 'success');
  }

  // ── Text File Processing ────────────────────────────────────
  async function processTextFile(file, title) {
    setStatus('Reading text file...');
    showProgress(30);

    const text = await file.text();
    let md = '';

    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, file.type || 'text/plain', file.size);
    }

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'md') {
      // Already markdown
      md += text;
    } else if (ext === 'csv') {
      md += `# ${title}\n\n`;
      md += csvToMarkdownTable(text);
    } else if (ext === 'json') {
      md += `# ${title}\n\n`;
      md += '```json\n' + text + '\n```\n';
    } else {
      md += `# ${title}\n\n${text}\n`;
    }

    showProgress(100);
    appendMarkdown(md, title);
    hideProgress();
    showToast(`Text file "${file.name}" converted`, 'success');
  }

  // ── Generic File ────────────────────────────────────────────
  async function processGenericFile(file, title) {
    let md = '';
    if ($('#optIncludeMeta').checked) {
      md += generateFrontmatter(title, file.type, file.size);
    }
    md += `# ${title}\n\n`;
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| **Filename** | ${file.name} |\n`;
    md += `| **Type** | ${file.type || 'unknown'} |\n`;
    md += `| **Size** | ${formatBytes(file.size)} |\n\n`;
    md += `> *This file type cannot be directly converted to text. Upload it to Notion as an attachment.*\n`;

    appendMarkdown(md, title);
    showToast(`File "${file.name}" added as reference`, 'info');
  }

  // ── Markdown Assembly ───────────────────────────────────────
  function appendMarkdown(md, label) {
    markdownParts.push({ label, content: md });
    rebuildOutput();
  }

  function rebuildOutput() {
    const separator = '\n\n---\n\n';
    const full = markdownParts.map((p) => p.content.trim()).join(separator);
    markdownOutput.value = full;
    updatePreview();
  }

  function updatePreview() {
    if (window.marked && markdownOutput.value.trim()) {
      // Configure marked for safety
      marked.setOptions({
        breaks: true,
        gfm: true,
      });
      markdownPreview.innerHTML = marked.parse(markdownOutput.value);
    } else {
      markdownPreview.innerHTML = '<p style="color:var(--text-muted)">No content to preview</p>';
    }
  }

  function setupLivePreview() {
    markdownOutput.addEventListener('input', () => {
      updatePreview();
    });
  }

  // ── Frontmatter Generator ──────────────────────────────────
  function generateFrontmatter(title, mimeType, fileSize) {
    const now = new Date();
    let fm = `---\n`;
    fm += `title: "${title}"\n`;
    fm += `date: ${now.toISOString().split('T')[0]}\n`;
    fm += `time: ${now.toTimeString().split(' ')[0]}\n`;
    if (mimeType) fm += `type: ${mimeType}\n`;
    if (fileSize) fm += `size: ${formatBytes(fileSize)}\n`;
    fm += `converter: Media-to-Markdown\n`;
    fm += `---\n\n`;
    return fm;
  }

  // ── Export Functions ────────────────────────────────────────
  function setupExport() {
    // Copy Markdown
    $('#btnCopyMd').addEventListener('click', async () => {
      const text = markdownOutput.value.trim();
      if (!text) return showToast('No markdown to copy', 'error');
      await navigator.clipboard.writeText(text);
      showToast('Markdown copied to clipboard', 'success');
    });

    // Copy for Notion (strip frontmatter, clean up)
    $('#btnCopyNotion').addEventListener('click', async () => {
      const text = markdownOutput.value.trim();
      if (!text) return showToast('No content to copy', 'error');
      const notionMd = convertForNotion(text);
      await navigator.clipboard.writeText(notionMd);
      showToast('Notion-compatible markdown copied', 'success');
    });

    // Download .md
    $('#btnDownloadMd').addEventListener('click', () => {
      const text = markdownOutput.value.trim();
      if (!text) return showToast('No content to download', 'error');
      const title = $('#titleInput').value.trim() || 'converted';
      const filename = sanitizeFilename(title) + '.md';
      downloadBlob(new Blob([text], { type: 'text/markdown' }), filename);
      showToast(`Downloaded ${filename}`, 'success');
    });

    // Download PDF
    $('#btnDownloadPdf').addEventListener('click', async () => {
      const text = markdownOutput.value.trim();
      if (!text) return showToast('No content to download', 'error');
      setStatus('Generating PDF...');
      showProgress(30);

      try {
        // Build HTML for pdf
        const html = buildPdfHtml(text);
        const container = document.createElement('div');
        container.innerHTML = html;
        container.style.padding = '20px';
        container.style.fontFamily = 'Georgia, serif';
        container.style.fontSize = '12pt';
        container.style.lineHeight = '1.6';
        container.style.color = '#1a1a1a';
        container.style.maxWidth = '700px';

        const title = $('#titleInput').value.trim() || 'converted';
        const filename = sanitizeFilename(title) + '.pdf';

        showProgress(60);
        await html2pdf()
          .set({
            margin: [15, 15, 15, 15],
            filename: filename,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          })
          .from(container)
          .save();

        showProgress(100);
        hideProgress();
        setStatus('PDF downloaded');
        showToast(`Downloaded ${filename}`, 'success');
      } catch (err) {
        hideProgress();
        showToast(`PDF generation failed: ${err.message}`, 'error');
      }
    });

    // Clear All
    $('#btnClearAll').addEventListener('click', () => {
      markdownParts = [];
      queueItems = [];
      markdownOutput.value = '';
      markdownPreview.innerHTML = '';
      queueList.innerHTML = '';
      fileQueue.classList.remove('visible');
      pasteArea.value = '';
      linkInput.value = '';
      $('#titleInput').value = '';
      setStatus('Cleared — ready for new input');
      showToast('All content cleared', 'info');
    });
  }

  function convertForNotion(md) {
    // Remove YAML frontmatter
    let result = md.replace(/^---[\s\S]*?---\n*/m, '');
    // Notion doesn't support certain markdown extensions well
    // Keep it clean GFM
    result = result.trim();
    return result;
  }

  function buildPdfHtml(md) {
    // Remove frontmatter for PDF
    let clean = md.replace(/^---[\s\S]*?---\n*/m, '');
    if (window.marked) {
      return marked.parse(clean);
    }
    // Fallback: basic conversion
    return `<pre>${clean}</pre>`;
  }

  // ── Queue UI ────────────────────────────────────────────────
  function addToQueue(name, icon) {
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    fileQueue.classList.add('visible');

    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id = id;
    item.innerHTML = `
      <span class="queue-item-icon">${icon}</span>
      <span class="queue-item-name">${name}</span>
      <span class="queue-item-status processing">Processing</span>
      <button class="queue-item-remove" title="Remove">×</button>
    `;

    item.querySelector('.queue-item-remove').addEventListener('click', () => {
      item.remove();
      if (!queueList.children.length) fileQueue.classList.remove('visible');
    });

    queueList.appendChild(item);
    queueItems.push(id);
    return id;
  }

  function updateQueueItem(id, status) {
    const item = document.getElementById(id);
    if (!item) return;
    const badge = item.querySelector('.queue-item-status');
    badge.className = `queue-item-status ${status}`;
    badge.textContent = status === 'done' ? 'Done' : status === 'error' ? 'Error' : 'Processing';
  }

  // ── Utility Functions ───────────────────────────────────────
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getImageDimensions(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function getMediaDuration(file) {
    return new Promise((resolve, reject) => {
      const el = file.type.startsWith('audio/') ? new Audio() : document.createElement('video');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        resolve(el.duration);
        URL.revokeObjectURL(el.src);
      };
      el.onerror = reject;
      el.src = URL.createObjectURL(file);
    });
  }

  function generateVideoThumbnail(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration / 4);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
          URL.revokeObjectURL(video.src);
        } catch (err) {
          reject(err);
        }
      };

      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });
  }

  function csvToMarkdownTable(csv) {
    const lines = csv.trim().split('\n');
    if (!lines.length) return '';

    const rows = lines.map((line) => {
      // Basic CSV parsing (handles quoted fields)
      const cells = [];
      let current = '';
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    });

    let md = '';
    // Header
    md += '| ' + rows[0].join(' | ') + ' |\n';
    md += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      md += '| ' + rows[i].join(' | ') + ' |\n';
    }
    md += '\n';
    return md;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return 'Unknown';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function cleanFilename(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'output';
  }

  function extractTitleFromUrl(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.split('/').filter(Boolean).pop();
      if (path) return cleanFilename(decodeURIComponent(path));
      return u.hostname;
    } catch {
      return 'Linked Content';
    }
  }

  function extractFilenameFromUrl(url) {
    try {
      return new URL(url).pathname.split('/').pop() || url;
    } catch {
      return url;
    }
  }

  function getFileIcon(type) {
    if (!type) return '📄';
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📕';
    if (type.startsWith('audio/')) return '🎵';
    if (type.startsWith('video/')) return '🎬';
    if (type.includes('json')) return '🔧';
    if (type.includes('csv') || type.includes('spreadsheet')) return '📊';
    return '📄';
  }

  // URL type detection
  function isYouTubeUrl(url) {
    return /(?:youtube\.com\/(?:watch|embed|shorts)|youtu\.be)/i.test(url);
  }

  function extractYouTubeId(url) {
    const match = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    return match ? match[1] : '';
  }

  function isImageUrl(url) {
    return /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif)(\?.*)?$/i.test(url);
  }

  function isAudioUrl(url) {
    return /\.(mp3|wav|ogg|flac|aac|m4a|wma)(\?.*)?$/i.test(url);
  }

  function isVideoUrl(url) {
    return /\.(mp4|webm|avi|mov|mkv|m4v|wmv)(\?.*)?$/i.test(url);
  }

  // ── UI Helpers ──────────────────────────────────────────────
  function setStatus(msg) {
    statusText.textContent = msg;
  }

  function showProgress(pct) {
    progressContainer.style.display = 'block';
    progressBar.style.width = `${Math.min(100, pct)}%`;
  }

  function hideProgress() {
    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }, 500);
  }

  function showToast(msg, type = 'info') {
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Boot ────────────────────────────────────────────────────
  init();
})();
