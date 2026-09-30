(() => {
  const canvas = document.querySelector('#wheel');
  const ctx = canvas.getContext('2d');
  const fileInput = document.querySelector('#csvFile');
  const spinButton = document.querySelector('#spinButton');
  const resetButton = document.querySelector('#resetButton');
  const namesList = document.querySelector('#nameList');
  const palette = ['#dcebdc', '#f6e7c8', '#dce8f3', '#f0dfd7', '#e9e0f2', '#d9eee9', '#f3e4e9', '#eeeacb', '#dce5da', '#f6e2c5'];
  let originalNames = [];
  let names = [];
  let rotation = 0;
  let spinning = false;
  let lastWinner = '';
  let toastTimeout;

  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel();
  }

  function drawWheel() {
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    if (!size) return;
    ctx.clearRect(0, 0, size, size);
    if (!names.length) {
      document.querySelector('.wheel-hub').hidden = true;
      document.querySelector('#emptyWheel').hidden = false;
      return;
    }
    document.querySelector('.wheel-hub').hidden = false;
    document.querySelector('#emptyWheel').hidden = true;
    const center = size / 2;
    const radius = center - 3;
    const slice = (Math.PI * 2) / names.length;
    const startAtTop = -Math.PI / 2 + rotation;
    ctx.save();
    ctx.translate(center, center);
    names.forEach((name, i) => {
      const start = startAtTop + i * slice;
      const end = start + slice;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      ctx.strokeStyle = '#fffdf8';
      ctx.lineWidth = Math.max(1.5, size * 0.006);
      ctx.stroke();
      ctx.save();
      ctx.rotate(start + slice / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#35463d';
      const fontSize = Math.max(9, Math.min(15, 210 / Math.max(names.length, 14)));
      ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
      const maxWidth = Math.max(35, radius * 0.57);
      let label = name;
      while (ctx.measureText(label).width > maxWidth && label.length > 3) label = `${label.slice(0, -2)}…`;
      ctx.fillText(label, radius - 14, 0);
      ctx.restore();
    });
    ctx.restore();
  }

  function updateList() {
    document.querySelector('#remainingCount').textContent = names.length;
    document.querySelector('#listCount').textContent = `${names.length} ${names.length === 1 ? 'name' : 'names'} left`;
    spinButton.disabled = !names.length || spinning;
    resetButton.disabled = !originalNames.length || spinning || names.length === originalNames.length;
    namesList.replaceChildren();
    if (!originalNames.length) {
      namesList.innerHTML = '<div class="list-empty">No students loaded yet.</div>';
      drawWheel();
      return;
    }
    originalNames.forEach((name, index) => {
      const used = !names.includes(name) || (() => {
        // Match duplicate names by occurrence so each CSV row remains a distinct student entry.
        const remainingCount = names.filter(entry => entry === name).length;
        const originalOccurrence = originalNames.slice(0, index + 1).filter(entry => entry === name).length;
        return originalOccurrence > remainingCount;
      })();
      const row = document.createElement('div');
      row.className = `name-row${used ? ' removed' : ''}`;
      row.innerHTML = `<span class="name-number">${String(index + 1).padStart(2, '0')}</span><span></span><span class="name-status">${used ? 'PICKED' : 'IN WHEEL'}</span>`;
      row.children[1].textContent = name;
      namesList.append(row);
    });
    drawWheel();
  }

  function announce(message, isError = false) {
    const messageBox = document.querySelector('#fileMessage');
    messageBox.textContent = message;
    messageBox.classList.toggle('error', isError);
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function clearWinner() {
    const winnerContent = document.querySelector('#winnerContent');
    winnerContent.className = 'winner-content';
    winnerContent.innerHTML = '<span class="winner-sparkle">✦</span><p>Your next student<br>will appear here.</p>';
    document.querySelector('#wheelWinner').hidden = true;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field.length === 0) quoted = true;
      else if (char === ',') { row.push(field.trim()); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field.trim());
        if (row.some(value => value !== '')) rows.push(row);
        row = []; field = '';
      } else field += char;
    }
    row.push(field.trim());
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
  }

  function extractNames(text) {
    const rows = parseCSV(text.replace(/^\uFEFF/, ''));
    if (!rows.length) return [];
    const normalized = rows[0].map(value => value.toLowerCase().replace(/[^a-z]/g, ''));
    const nameColumn = normalized.findIndex(value => ['name', 'student', 'studentname', 'fullname', 'pupil'].includes(value));
    const column = nameColumn >= 0 ? nameColumn : 0;
    const startRow = nameColumn >= 0 ? 1 : 0;
    return rows.slice(startRow).map(values => (values[column] || '').trim()).filter(Boolean);
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const imported = extractNames(await file.text());
      if (!imported.length) {
        announce('No names found. Add a Name column or put one student name on each row.', true);
        fileInput.value = '';
        return;
      }
      originalNames = imported;
      names = [...imported];
      rotation = 0;
      lastWinner = '';
      clearWinner();
      announce(`Loaded ${imported.length} ${imported.length === 1 ? 'name' : 'names'} from ${file.name}.`);
      updateList();
    } catch (error) {
      announce('Could not read that file. Please choose a valid CSV.', true);
    }
    fileInput.value = '';
  });

  spinButton.addEventListener('click', () => {
    if (spinning || !names.length) return;
    clearWinner();
    spinning = true;
    updateList();
    const chosenIndex = Math.floor(Math.random() * names.length);
    const chosenName = names[chosenIndex];
    const slice = (Math.PI * 2) / names.length;
    const targetRotation = mod(-((chosenIndex + 0.5) * slice), Math.PI * 2);
    const delta = mod(targetRotation - mod(rotation, Math.PI * 2), Math.PI * 2) + Math.PI * 2 * (5 + Math.random() * 3);
    const startRotation = rotation;
    const duration = 4400;
    const startTime = performance.now();
    function animate(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      rotation = startRotation + delta * eased;
      drawWheel();
      if (progress < 1) requestAnimationFrame(animate);
      else {
        rotation = startRotation + delta;
        drawWheel();
        const [winner] = names.splice(chosenIndex, 1);
        lastWinner = winner;
        const winnerContent = document.querySelector('#winnerContent');
        winnerContent.className = 'winner-content has-winner';
        winnerContent.innerHTML = '<span class="winner-sparkle">✦</span><p></p>';
        winnerContent.querySelector('p').textContent = winner;
        const wheelWinner = document.querySelector('#wheelWinner');
        wheelWinner.querySelector('strong').textContent = winner;
        wheelWinner.hidden = false;
        spinning = false;
        announce(`${winner} was picked. ${names.length} ${names.length === 1 ? 'name' : 'names'} remain.`);
        updateList();
        if (!names.length) showToast('Everyone has had a turn! The wheel is empty.');
      }
    }
    requestAnimationFrame(animate);
  });

  resetButton.addEventListener('click', () => {
    if (spinning || !originalNames.length) return;
    names = [...originalNames];
    rotation = 0;
    lastWinner = '';
    clearWinner();
    announce(`All ${names.length} names are back on the wheel.`);
    updateList();
  });

  window.addEventListener('resize', resizeCanvas);
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();
  updateList();
})();
